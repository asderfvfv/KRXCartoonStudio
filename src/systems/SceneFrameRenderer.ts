import { Application, Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import type { AssetDefinition, CharacterDefinition, ProjectDocument, RenderFrameProvider, Scene } from "../domain/types";
import type { RenderSettings } from "../domain/renderSettings";
import { drawSubtitlesOnCanvas } from "./SubtitleComposer";
import { attachmentDrawScale, isAttachmentVisibleAt, resolveAttachmentSocket } from "../domain/attachments";
import { SceneRuntime, actorFacingScaleX } from "./SceneRuntime";
import { paintSceneBackgroundGraphics } from "./sceneBackgroundPaint";

export interface FrameRenderRequest {
  project: ProjectDocument;
  scene: Scene;
  characters: CharacterDefinition[];
  assets: AssetDefinition[];
  settings: RenderSettings;
  timeSeconds: number;
  resolveAssetUrl(assetPath: string): Promise<string>;
}

/**
 * Offscreen Pixi renderer implementing RenderFrameProvider.
 * Does not use editor UI overlays and does not depend on playback history.
 */
export class SceneFrameRenderer implements RenderFrameProvider {
  private app: Application | null = null;
  private runtime = new SceneRuntime();
  private lastRequest: FrameRenderRequest | null = null;
  private loadWarnings: string[] = [];

  getLoadWarnings(): string[] {
    return [...this.loadWarnings];
  }

  async prepare(request: Omit<FrameRenderRequest, "timeSeconds">): Promise<void> {
    this.loadWarnings = [];
    const width = Math.round(request.settings.canvasWidth);
    const height = Math.round(request.settings.canvasHeight);
    if (!this.app) {
      const app = new Application();
      await app.init({
        width,
        height,
        antialias: true,
        backgroundAlpha: request.settings.transparentBackground ? 0 : 1,
        backgroundColor: parseColor(request.settings.transparentBackground ? "#000000" : request.settings.backgroundColor),
        resolution: 1,
        autoDensity: false,
        preference: "webgl",
      });
      this.app = app;
    } else {
      this.app.renderer.resize(width, height);
      this.app.renderer.background.color = parseColor(request.settings.transparentBackground ? "#000000" : request.settings.backgroundColor);
      this.app.renderer.background.alpha = request.settings.transparentBackground ? 0 : 1;
    }
    this.lastRequest = { ...request, timeSeconds: 0 };
    await this.rebuildSceneGraph(this.lastRequest);
  }

  /**
   * Paint one frame into `target` at export resolution (same path as PNG export, without encode).
   * Used by montage live crossfade preview.
   */
  async paintFrame(timeSeconds: number, target: HTMLCanvasElement): Promise<void> {
    if (!this.app || !this.lastRequest) throw new Error("SceneFrameRenderer не подготовлен. Сначала вызовите prepare().");
    const request = { ...this.lastRequest, timeSeconds };
    const width = Math.round(request.settings.canvasWidth);
    const height = Math.round(request.settings.canvasHeight);
    if (this.app.renderer.width !== width || this.app.renderer.height !== height) {
      this.app.renderer.resize(width, height);
    }
    await this.applyRuntime(request);
    this.app.renderer.render(this.app.stage);
    const view = this.app.canvas as HTMLCanvasElement | OffscreenCanvas;
    if (!view) throw new Error("Pixi renderer canvas недоступен для экспорта.");
    if ("width" in view && (view.width !== width || view.height !== height)) {
      throw new Error(`Размер canvas экспорта ${view.width}×${view.height}, ожидалось ${width}×${height}.`);
    }
    target.width = width;
    target.height = height;
    const ctx = target.getContext("2d");
    if (!ctx) throw new Error("2D canvas недоступен для кадра.");
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(view as CanvasImageSource, 0, 0);
    const subtitleSettings = request.scene.subtitleSettings;
    if (subtitleSettings?.showInExport) {
      drawSubtitlesOnCanvas(ctx, {
        scene: request.scene,
        timeSeconds,
        width,
        height,
        actors: request.scene.actors,
        settings: subtitleSettings,
      });
    }
  }

  async renderFrame(timeSeconds: number): Promise<Blob> {
    const canvas = document.createElement("canvas");
    await this.paintFrame(timeSeconds, canvas);
    return await canvasToPngBlob(canvas);
  }

  async renderPngBytes(timeSeconds: number): Promise<Uint8Array> {
    const blob = await this.renderFrame(timeSeconds);
    return new Uint8Array(await blob.arrayBuffer());
  }

  destroy(): void {
    if (this.app) {
      this.app.destroy(true, { children: true });
      this.app = null;
    }
    this.lastRequest = null;
  }

  private async rebuildSceneGraph(request: FrameRenderRequest): Promise<void> {
    const app = this.app!;
    app.stage.removeChildren();
    const root = new Container();
    root.sortableChildren = true;
    app.stage.addChild(root);

    if (!request.settings.transparentBackground) {
      const bg = paintSceneBackgroundGraphics(
        new Graphics(),
        request.scene.width,
        request.scene.height,
        request.settings.backgroundColor || request.scene.background,
        request.scene.backgroundFill,
      );
      bg.zIndex = -10000;
      root.addChild(bg);
    }

    if (request.scene.backgroundAssetId) {
      const asset = request.assets.find((item) => item.id === request.scene.backgroundAssetId);
      if (asset) {
        try {
          const url = await request.resolveAssetUrl(asset.path);
          const texture = await Assets.load<Texture>(url);
          const sprite = new Sprite(texture);
          sprite.width = request.scene.width;
          sprite.height = request.scene.height;
          sprite.zIndex = -9999;
          root.addChild(sprite);
        } catch (reason) {
          const detail = reason instanceof Error ? reason.message : String(reason);
          this.loadWarnings.push(`Фон «${asset.name}»: ${detail}`);
          console.error("Export background asset failed", reason);
        }
      }
    }

    for (const actor of request.scene.actors) {
      const character = request.characters.find((item) => item.id === actor.characterId);
      if (!character) continue;
      const actorRoot = new Container();
      actorRoot.label = actor.id;
      actorRoot.sortableChildren = true;
      actorRoot.zIndex = 100;
      root.addChild(actorRoot);
      const partContainers = new Map<string, Container>();

      for (const part of character.parts) {
        const asset = request.assets.find((item) => item.id === part.assetId);
        if (!asset) {
          this.loadWarnings.push(`Актёр «${actor.name}», часть «${part.name}»: нет asset ${part.assetId}`);
          continue;
        }
        try {
          const url = await request.resolveAssetUrl(asset.path);
          const texture = await Assets.load<Texture>(url);
          const container = new Container();
          container.label = `${actor.id}:${part.id}`;
          container.sortableChildren = true;
          const sprite = new Sprite(texture);
          sprite.width = asset.width;
          sprite.height = asset.height;
          sprite.anchor.set(part.anchor.x, part.anchor.y);
          container.addChild(sprite);
          partContainers.set(part.id, container);
        } catch (reason) {
          const detail = reason instanceof Error ? reason.message : String(reason);
          this.loadWarnings.push(`Актёр «${actor.name}», часть «${part.name}» (${asset.name}): ${detail}`);
          console.error(`Export asset ${asset.name} failed`, reason);
        }
      }

      for (const part of character.parts) {
        const container = partContainers.get(part.id);
        if (!container) continue;
        const parent = part.parentId ? partContainers.get(part.parentId) : actorRoot;
        (parent ?? actorRoot).addChild(container);
      }

      for (const attachment of (request.scene.attachments ?? []).filter((item) => item.actorId === actor.id)) {
        const socket = resolveAttachmentSocket(character, attachment);
        if (!socket) continue;
        const host = partContainers.get(socket.partId);
        const asset = request.assets.find((item) => item.id === attachment.assetId);
        if (!host || !asset) continue;
        try {
          const url = await request.resolveAssetUrl(asset.path);
          const texture = await Assets.load<Texture>(url);
          const sprite = new Sprite(texture);
          sprite.label = `attachment:${attachment.id}`;
          sprite.width = asset.width;
          sprite.height = asset.height;
          sprite.anchor.set(attachment.anchor.x, attachment.anchor.y);
          sprite.position.set(socket.position.x + attachment.offset.x, socket.position.y + attachment.offset.y);
          sprite.rotation = (attachment.rotation * Math.PI) / 180;
          const drawScale = attachmentDrawScale(attachment);
          sprite.scale.set(drawScale.x, drawScale.y);
          sprite.alpha = attachment.opacity;
          sprite.zIndex = attachment.zIndex;
          sprite.visible = isAttachmentVisibleAt(attachment, request.timeSeconds);
          host.addChild(sprite);
        } catch (reason) {
          const detail = reason instanceof Error ? reason.message : String(reason);
          this.loadWarnings.push(`Навеска «${attachment.name}»: ${detail}`);
          console.error(`Export attachment ${attachment.name} failed`, reason);
        }
      }
    }

    for (const prop of request.scene.props) {
      const asset = request.assets.find((item) => item.id === prop.assetId);
      if (!asset) continue;
      try {
        const url = await request.resolveAssetUrl(asset.path);
        const texture = await Assets.load<Texture>(url);
        const sprite = new Sprite(texture);
        sprite.label = `prop:${prop.id}`;
        sprite.anchor.set(0.5);
        sprite.position.set(prop.position.x, prop.position.y);
        sprite.rotation = (prop.rotation * Math.PI) / 180;
        sprite.scale.set(prop.scale.x, prop.scale.y);
        sprite.alpha = prop.opacity;
        sprite.visible = prop.visible;
        sprite.zIndex = prop.zIndex;
        root.addChild(sprite);
      } catch (reason) {
        const detail = reason instanceof Error ? reason.message : String(reason);
        this.loadWarnings.push(`Предмет «${prop.name}»: ${detail}`);
        console.error(`Export prop ${prop.name} failed`, reason);
      }
    }

    await this.applyRuntime(request);
  }

  private async applyRuntime(request: FrameRenderRequest): Promise<void> {
    const app = this.app!;
    const root = app.stage.children[0] as Container | undefined;
    if (!root) return;
    const state = this.runtime.setTime(request.scene, request.characters, request.timeSeconds);
    const camera = state.camera;

    root.pivot.set(camera.x, camera.y);
    root.position.set(request.settings.canvasWidth / 2, request.settings.canvasHeight / 2);
    root.scale.set(camera.zoom);
    root.rotation = (-camera.rotation * Math.PI) / 180;

    for (const actor of request.scene.actors) {
      const actorState = state.actors[actor.id];
      const actorRoot = root.children.find((child) => child.label === actor.id) as Container | undefined;
      const character = request.characters.find((item) => item.id === actor.characterId);
      if (!actorState || !actorRoot || !character) continue;
      actorRoot.position.set(actorState.position.x, actorState.position.y);
      actorRoot.rotation = (actorState.rotation * Math.PI) / 180;
      actorRoot.scale.set(actorFacingScaleX(actorState), actorState.scale);
      actorRoot.visible = actorState.visible;
      actorRoot.alpha = actorState.opacity ?? 1;

      for (const part of character.parts) {
        const container = findLabeled(actorRoot, `${actor.id}:${part.id}`);
        if (!container) continue;
        const values = actorState.rig[part.id];
        const transform = { ...part.transform, ...values };
        container.position.set(transform.x, transform.y);
        container.rotation = (transform.rotation * Math.PI) / 180;
        container.scale.set(transform.scaleX, transform.scaleY);
        container.pivot.set(part.pivot.x, part.pivot.y);
        container.zIndex = part.zIndex;
        container.visible = part.visible;
        container.alpha = values?.opacity ?? part.opacity;
        const sprite = container.children[0] as Sprite | undefined;
        if (sprite && actorState.tint) sprite.tint = Number.parseInt(actorState.tint.slice(1), 16);
      }

      for (const attachment of (request.scene.attachments ?? []).filter((item) => item.actorId === actor.id)) {
        const sprite = findLabeled(actorRoot, `attachment:${attachment.id}`) as Sprite | null;
        if (!sprite) continue;
        sprite.visible = isAttachmentVisibleAt(attachment, request.timeSeconds);
        const drawScale = attachmentDrawScale(attachment);
        sprite.scale.set(drawScale.x, drawScale.y);
        sprite.alpha = attachment.opacity;
        sprite.rotation = (attachment.rotation * Math.PI) / 180;
        const socket = resolveAttachmentSocket(character, attachment);
        if (socket) {
          sprite.position.set(socket.position.x + attachment.offset.x, socket.position.y + attachment.offset.y);
        }
      }
    }

    for (const prop of state.props) {
      const sprite = root.children.find((child) => child.label === `prop:${prop.id}`) as Sprite | undefined;
      if (!sprite) continue;
      sprite.position.set(prop.position.x, prop.position.y);
      sprite.rotation = (prop.rotation * Math.PI) / 180;
      sprite.scale.set(prop.scale.x, prop.scale.y);
      sprite.alpha = prop.opacity;
      sprite.visible = prop.visible;
      sprite.zIndex = prop.zIndex;
    }
  }
}

function findLabeled(root: Container, label: string): Container | null {
  const stack: Container[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.label === label) return node;
    for (const child of node.children) if (child instanceof Container) stack.push(child);
  }
  return null;
}

function parseColor(value: string): number {
  const hex = value.replace("#", "").slice(0, 6);
  const parsed = Number.parseInt(hex.length === 6 ? hex : "101214", 16);
  return Number.isFinite(parsed) ? parsed : 0x101214;
}

async function canvasToPngBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ("convertToBlob" in canvas && typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type: "image/png" });
  }
  const htmlCanvas = canvas as HTMLCanvasElement;
  return await new Promise<Blob>((resolve, reject) => {
    htmlCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Не удалось закодировать PNG-кадр."));
    }, "image/png");
  });
}

/** Local FutureRenderSystem adapter. */
export class LocalRenderSystem {
  constructor(private readonly provider: RenderFrameProvider) {}
  render(provider: RenderFrameProvider, timeSeconds: number): Promise<ImageData | Blob> {
    return provider.renderFrame(timeSeconds);
  }
  renderWithDefault(timeSeconds: number): Promise<ImageData | Blob> {
    return this.provider.renderFrame(timeSeconds);
  }
}
