import { useEffect, useMemo, useRef, useState } from "react";
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture, type FederatedPointerEvent } from "pixi.js";
import { paintSceneBackgroundGraphics } from "../systems/sceneBackgroundPaint";
import type { ActorRuntimeState, RigPart, SceneProp, Vec2 } from "../domain/types";
import { createDefaultSubtitleSettings, getActiveSubtitleText, wrapSubtitleLines } from "../domain/audio";
import { attachmentDrawScale, isAttachmentVisibleAt, resolveAttachmentSocket } from "../domain/attachments";
import {
  applyIkToCharacter,
  findIkChainForPart,
  listIkChains,
  scenePointToCharacterLocal,
  type IkChain,
} from "../domain/ik";
import { MotionLibrary } from "../systems/MotionLibrary";
import { SceneRuntime } from "../systems/SceneRuntime";
import { useEditor, type CanvasTool } from "../editor/EditorContext";
import { applyPlatformExportPreset } from "../domain/renderSettings";
import { syncActorTransformKeysAtTime, deleteActorKeysAtTime } from "../domain/timelineKeys";
import { CrossfadeLivePreview } from "./CrossfadeLivePreview";
import { SceneConstructorBar } from "./SceneConstructorBar";

interface PartDisplay { actorId: string; part: RigPart; container: Container; sprite: Sprite; overlay: Graphics }
interface ActorDisplay { root: Container; parts: Map<string, PartDisplay> }
interface DragState {
  kind: "actor" | "part" | "socket" | "prop" | "ik";
  actorId: string;
  propId?: string;
  partId?: string;
  socketId?: string;
  chainId?: IkChain["id"];
  tool: CanvasTool;
  gizmo?: "move" | "scale" | "rotate";
  startGlobal: { x: number; y: number };
  startLocal: { x: number; y: number };
  startActor?: Pick<ActorRuntimeState, "position" | "rotation" | "scale">;
  startPart?: RigPart;
  startProp?: SceneProp;
  moved: boolean;
}

const toolLabels: Array<[CanvasTool, string, string]> = [
  ["select", "V", "Часть"],
  ["move", "G", "Двигать"],
  ["rotate", "R", "Поворот"],
  ["scale", "S", "Масштаб"],
  ["pivot", "P", "Опора"],
  ["socket", "K", "Сокет"],
  ["ik", "I", "IK"],
  ["path", "W", "Путь"],
  ["pan", "H", "Сдвиг"],
];

function actorScaleXY(actor: { scale: number; facingDirection: "Left" | "Right" }): { sx: number; sy: number } {
  return { sx: actor.scale * (actor.facingDirection === "Left" ? -1 : 1), sy: actor.scale };
}

type CanvasContextMenu = {
  x: number;
  y: number;
  kind: "prop" | "actor" | "empty" | "background";
  propId?: string;
  actorId?: string;
};
function redrawPathOverlay(graphics: Graphics | null, points: Vec2[]) {
  if (!graphics) return;
  graphics.clear();
  if (points.length < 1) return;
  graphics.circle(points[0]!.x, points[0]!.y, 8).fill({ color: 0xf2c75c, alpha: 0.95 });
  if (points.length < 2) return;
  graphics.moveTo(points[0]!.x, points[0]!.y);
  for (let index = 1; index < points.length; index += 1) {
    graphics.lineTo(points[index]!.x, points[index]!.y);
  }
  graphics.stroke({ color: 0xf2c75c, width: 4, alpha: 0.9 });
  const last = points[points.length - 1]!;
  graphics.circle(last.x, last.y, 6).fill({ color: 0xfff0b0, alpha: 1 });
}

export function CanvasStage() {
  const editor = useEditor(); const hostRef = useRef<HTMLDivElement>(null); const appRef = useRef<Application | null>(null); const viewportRef = useRef<Container | null>(null);
  const safeFrameRef = useRef<Graphics | null>(null);
  const pathGraphicsRef = useRef<Graphics | null>(null);
  const onionGraphicsRef = useRef<Graphics | null>(null);
  const pathPointsRef = useRef<Vec2[]>([]);
  const pathDrawingRef = useRef(false);
  const actorDisplays = useRef(new Map<string, ActorDisplay>());
  const actorOverlays = useRef(new Map<string, Graphics>());
  const propSprites = useRef(new Map<string, Sprite>());
  const propOverlays = useRef(new Map<string, Graphics>());
  const dragRef = useRef<DragState | null>(null);
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const spacePanRef = useRef(false);
  const spaceUsedRef = useRef(false);
  const [ready, setReady] = useState(false);
  /** Bumped when async stage rebuild finishes so transforms re-apply (actors must not stay at 0,0). */
  const [displayGeneration, setDisplayGeneration] = useState(0);
  const [contextMenu, setContextMenu] = useState<CanvasContextMenu | null>(null);
  const selectedProp = editor.currentScene.props.find((item) => item.id === editor.selectedPropId);
  const runtime = useMemo(
    () => new SceneRuntime().setTime(editor.currentScene, editor.project.characters, editor.sceneTime, {
      moveStyle: editor.studioPrefs.moveStyle ?? "walk",
    }),
    [editor.currentScene, editor.project.characters, editor.sceneTime, editor.studioPrefs.moveStyle],
  );
  const runtimeWithPreview = useMemo(() => {
    if (!editor.previewMotion || !editor.selectedActorId) return runtime; const copy = structuredClone(runtime); const actor = copy.actors[editor.selectedActorId]; if (actor) actor.rig = new MotionLibrary().evaluate(editor.currentCharacter, editor.previewMotion, (editor.time % 2) / 2); return copy;
  }, [editor.currentCharacter, editor.previewMotion, editor.selectedActorId, editor.time, runtime]);
  const structureKey = useMemo(() => JSON.stringify({
    scene: editor.currentScene.id,
    size: [editor.currentScene.width, editor.currentScene.height],
    bg: [editor.currentScene.background, editor.currentScene.backgroundAssetId, editor.currentScene.backgroundFill],
    actors: editor.currentScene.actors.map((actor) => [actor.id, actor.characterId]),
    characters: editor.project.characters.map((character) => [character.id, character.parts.map((part) => [part.id, part.parentId, part.assetId]), character.sockets]),
    props: editor.currentScene.props.map((prop) => [prop.id, prop.assetId]),
    attachments: (editor.currentScene.attachments ?? []).map((item) => [item.id, item.actorId, item.assetId, item.socketType, item.socketId, item.offset, item.rotation, item.scale, item.anchor, item.visible, item.flipX, item.flipY, item.startTime, item.endTime, item.opacity, item.zIndex]),
    assets: editor.project.assets.map((asset) => [asset.id, asset.path]),
  }), [editor.currentScene, editor.project.assets, editor.project.characters]);

  useEffect(() => {
    const host = hostRef.current; if (!host) return; const app = new Application(); let initialized = false; let disposed = false;
    void app.init({ resizeTo: host, antialias: true, backgroundColor: 0x101214, resolution: window.devicePixelRatio, autoDensity: true }).then(() => {
      initialized = true; if (disposed) { app.destroy(true); return; } host.appendChild(app.canvas); app.canvas.className = "pixi-canvas"; appRef.current = app;
      const viewport = new Container(); viewport.sortableChildren = true; viewportRef.current = viewport; app.stage.addChild(viewport); app.stage.eventMode = "static"; app.stage.hitArea = app.screen;
      const safeFrame = new Graphics(); safeFrame.eventMode = "none"; safeFrame.zIndex = 100000; safeFrameRef.current = safeFrame; app.stage.addChild(safeFrame);
      const pathGraphics = new Graphics(); pathGraphics.eventMode = "none"; pathGraphics.zIndex = 99950; pathGraphicsRef.current = pathGraphics; viewport.addChild(pathGraphics);
      const onionGraphics = new Graphics(); onionGraphics.eventMode = "none"; onionGraphics.zIndex = 40; onionGraphicsRef.current = onionGraphics; viewport.addChild(onionGraphics);

      const scenePointFromEvent = (event: FederatedPointerEvent): Vec2 => {
        const local = viewport.toLocal(event.global);
        return { x: local.x, y: local.y };
      };

      app.stage.on("pointermove", (event: FederatedPointerEvent) => {
        if (pathDrawingRef.current && editorRef.current.tool === "path") {
          const point = scenePointFromEvent(event);
          const points = pathPointsRef.current;
          const last = points[points.length - 1];
          if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= 18) {
            points.push(point);
            redrawPathOverlay(pathGraphicsRef.current, points);
          }
          return;
        }
        const drag = dragRef.current; if (!drag) return; const context = editorRef.current;
        if (drag.kind === "prop" && drag.propId && drag.startProp) {
          const point = viewportRef.current!.toLocal(event.global);
          const dx = point.x - drag.startLocal.x;
          const dy = point.y - drag.startLocal.y;
          const mode = drag.gizmo ?? (drag.tool === "rotate" ? "rotate" : drag.tool === "scale" ? "scale" : "move");
          context.preview((draft) => {
            const prop = draft.scenes!.find((scene) => scene.id === context.currentScene.id)!.props.find((item) => item.id === drag.propId)!;
            if (mode === "move") {
              prop.position.x = drag.startProp!.position.x + dx;
              prop.position.y = drag.startProp!.position.y + dy;
            } else if (mode === "rotate") {
              const ox = drag.startProp!.position.x;
              const oy = drag.startProp!.position.y;
              const a0 = Math.atan2(drag.startLocal.y - oy, drag.startLocal.x - ox);
              const a1 = Math.atan2(point.y - oy, point.x - ox);
              prop.rotation = drag.startProp!.rotation + ((a1 - a0) * 180) / Math.PI;
            } else if (mode === "scale") {
              const ox = drag.startProp!.position.x;
              const oy = drag.startProp!.position.y;
              const d0 = Math.hypot(drag.startLocal.x - ox, drag.startLocal.y - oy);
              const d1 = Math.hypot(point.x - ox, point.y - oy);
              const factor = d0 > 1 ? d1 / d0 : 1;
              const next = Math.max(0.05, Math.min(8, drag.startProp!.scale.x * factor));
              prop.scale = { x: next, y: next };
            }
          });
          drag.moved = true;
          return;
        }
        const display = actorDisplays.current.get(drag.actorId); if (!display) return;
        if (drag.kind === "actor" && drag.startActor) {
          const point = display.root.parent!.toLocal(event.global); const dx = point.x - drag.startLocal.x; const dy = point.y - drag.startLocal.y;
          const mode = drag.gizmo ?? (drag.tool === "rotate" ? "rotate" : drag.tool === "scale" ? "scale" : "move");
          context.preview((draft) => { const actor = draft.scenes!.find((scene) => scene.id === context.currentScene.id)!.actors.find((item) => item.id === drag.actorId)!;
            if (mode === "move") { actor.position.x = drag.startActor!.position.x + dx; actor.position.y = drag.startActor!.position.y + dy; }
            else if (mode === "rotate") {
              const ox = drag.startActor!.position.x;
              const oy = drag.startActor!.position.y;
              const a0 = Math.atan2(drag.startLocal.y - oy, drag.startLocal.x - ox);
              const a1 = Math.atan2(point.y - oy, point.x - ox);
              actor.rotation = drag.startActor!.rotation + ((a1 - a0) * 180) / Math.PI;
            } else if (mode === "scale") {
              const ox = drag.startActor!.position.x;
              const oy = drag.startActor!.position.y;
              const d0 = Math.hypot(drag.startLocal.x - ox, drag.startLocal.y - oy);
              const d1 = Math.hypot(point.x - ox, point.y - oy);
              const factor = d0 > 1 ? d1 / d0 : 1;
              actor.scale = Math.max(0.05, Math.min(8, drag.startActor!.scale * factor));
            }
          });
        } else if (drag.kind === "part" && drag.startPart && drag.partId) {
          const partDisplay = display.parts.get(drag.partId); if (!partDisplay?.container.parent) return; const point = partDisplay.container.parent.toLocal(event.global); const dx = point.x - drag.startLocal.x; const dy = point.y - drag.startLocal.y;
          context.preview((draft) => { const character = draft.characters.find((item) => item.id === context.currentCharacter.id)!; const part = character.parts.find((item) => item.id === drag.partId)!;
            if (drag.tool === "select") { part.transform.x = drag.startPart!.transform.x + dx; part.transform.y = drag.startPart!.transform.y + dy; }
            if (drag.tool === "pivot") { part.pivot.x = drag.startPart!.pivot.x + dx; part.pivot.y = drag.startPart!.pivot.y + dy; }
          });
        } else if (drag.kind === "ik" && drag.chainId) {
          const scenePoint = viewportRef.current!.toLocal(event.global);
          const liveActor = context.currentScene.actors.find((item) => item.id === drag.actorId);
          if (!liveActor) return;
          const { sx, sy } = actorScaleXY(liveActor);
          const local = scenePointToCharacterLocal(liveActor.position, liveActor.rotation, sx, sy, { x: scenePoint.x, y: scenePoint.y });
          context.preview((draft) => {
            const character = draft.characters.find((item) => item.id === liveActor.characterId);
            if (!character) return;
            const chain = listIkChains(character).find((item) => item.id === drag.chainId);
            if (!chain) return;
            const next = applyIkToCharacter(character, chain, local);
            const index = draft.characters.findIndex((item) => item.id === character.id);
            if (index >= 0) draft.characters[index] = next;
          });
        } else if (drag.kind === "socket" && drag.socketId && drag.partId) {
          const partDisplay = display.parts.get(drag.partId); if (!partDisplay) return; const point = partDisplay.container.toLocal(event.global);
          context.preview((draft) => { const socket = draft.characters.find((item) => item.id === context.currentCharacter.id)!.sockets!.find((item) => item.id === drag.socketId); if (socket) socket.position = { x: point.x, y: point.y }; });
        }
        drag.moved = true;
      });
      const finish = () => {
        if (pathDrawingRef.current) {
          pathDrawingRef.current = false;
          const points = [...pathPointsRef.current];
          pathPointsRef.current = [];
          redrawPathOverlay(pathGraphicsRef.current, []);
          if (points.length >= 2) editorRef.current.commitActorPath(points);
          return;
        }
        const drag = dragRef.current;
        if (drag?.moved) {
          const ed = editorRef.current;
          const sceneId = ed.currentScene.id;
          const at = ed.sceneTime;
          const autoKey = ed.studioPrefs.autoKey !== false;
          if (drag.kind === "actor" && drag.startActor) {
            const live = ed.currentScene.actors.find((item) => item.id === drag.actorId);
            const sceneNow = ed.currentScene;
            const hasKeys = Boolean(sceneNow.generatedTimeline?.actorTracks.some((track) => track.actorId === drag.actorId));
            if (live && (autoKey || hasKeys)) {
              ed.commit(`${drag.tool} + ключ @${at.toFixed(2)}с`, (draft) => {
                const scene = draft.scenes!.find((item) => item.id === sceneId)!;
                const actor = scene.actors.find((item) => item.id === drag.actorId);
                if (!actor) return;
                actor.position = { ...live.position };
                actor.rotation = live.rotation;
                actor.scale = live.scale;
                if (drag.gizmo === "move" || drag.tool === "move") {
                  syncActorTransformKeysAtTime(scene, actor.id, at, { x: actor.position.x, y: actor.position.y });
                } else if (drag.gizmo === "rotate" || drag.tool === "rotate") {
                  syncActorTransformKeysAtTime(scene, actor.id, at, { rotation: actor.rotation });
                } else if (drag.gizmo === "scale" || drag.tool === "scale") {
                  syncActorTransformKeysAtTime(scene, actor.id, at, { scale: actor.scale });
                }
              });
            } else {
              ed.finishPreview(`${drag.kind} ${drag.tool} drag`);
            }
          } else {
            ed.finishPreview(`${drag.kind} ${drag.tool} drag`);
          }
        }
        dragRef.current = null;
      };
      app.stage.on("pointerup", finish); app.stage.on("pointerupoutside", finish);

      const beginViewPan = (event: FederatedPointerEvent) => {
        const start = { x: event.global.x, y: event.global.y };
        const initial = { ...panRef.current };
        spaceUsedRef.current = true;
        const move = (next: FederatedPointerEvent) => {
          spaceUsedRef.current = true;
          (window as Window & { __kcsSpacePanMoved?: boolean }).__kcsSpacePanMoved = true;
          setPan({ x: initial.x + next.global.x - start.x, y: initial.y + next.global.y - start.y });
        };
        const end = () => {
          app.stage.off("pointermove", move);
          app.stage.off("pointerup", end);
          app.stage.off("pointerupoutside", end);
        };
        app.stage.on("pointermove", move);
        app.stage.on("pointerup", end);
        app.stage.on("pointerupoutside", end);
      };

      app.stage.on("pointerdown", (event: FederatedPointerEvent) => {
        const context = editorRef.current;
        const middle = event.button === 1 || event.buttons === 4;
        if (middle || spacePanRef.current || context.tool === "pan") {
          beginViewPan(event);
          return;
        }
        if (context.tool === "path") {
          pathDrawingRef.current = true;
          pathPointsRef.current = [scenePointFromEvent(event)];
          redrawPathOverlay(pathGraphicsRef.current, pathPointsRef.current);
          return;
        }
        // LMB on empty stage (actors/props stopPropagation) → снять таргет, открыть свойства фона
        if (event.button === 0) {
          setContextMenu(null);
          context.clearSceneSelection();
        }
      });

      const wheel = (event: WheelEvent) => {
        event.preventDefault();
        // Ctrl/Meta + wheel = zoom; plain wheel = scroll/pan scene
        if (event.ctrlKey || event.metaKey) {
          const factor = event.deltaY > 0 ? 0.9 : 1.1;
          setZoom((value) => Math.max(0.15, Math.min(4, value * factor)));
          return;
        }
        const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 40 : 1;
        setPan((value) => ({
          x: value.x - event.deltaX * scale,
          y: value.y - event.deltaY * scale,
        }));
      };
      app.canvas.addEventListener("wheel", wheel, { passive: false });

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.code !== "Space" || event.repeat) return;
        if (event.target instanceof HTMLElement) {
          const tag = event.target.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target.isContentEditable) return;
        }
        spacePanRef.current = true;
        spaceUsedRef.current = false;
        (window as Window & { __kcsSpacePanActive?: boolean; __kcsSpacePanMoved?: boolean }).__kcsSpacePanActive = true;
        (window as Window & { __kcsSpacePanMoved?: boolean }).__kcsSpacePanMoved = false;
        app.canvas.style.cursor = "grab";
      };
      const onKeyUp = (event: KeyboardEvent) => {
        if (event.code !== "Space") return;
        spacePanRef.current = false;
        (window as Window & { __kcsSpacePanActive?: boolean }).__kcsSpacePanActive = false;
        app.canvas.style.cursor = "";
      };
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);

      setReady(true);

      // stash cleanup hooks on app for dispose below
      (app as Application & { __kcsCleanup?: () => void }).__kcsCleanup = () => {
        app.canvas.removeEventListener("wheel", wheel);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
      };
    });
    return () => {
      disposed = true;
      setReady(false);
      actorDisplays.current.clear();
      if (appRef.current === app) appRef.current = null;
      const cleanup = (app as Application & { __kcsCleanup?: () => void }).__kcsCleanup;
      cleanup?.();
      if (initialized) app.destroy(true, { children: true });
    };
  }, []);

  useEffect(() => {
    if (!ready || !viewportRef.current) return;
    const viewport = viewportRef.current;
    let canceled = false;

    // Paint the scene fill FIRST so montage scene-switches never leave a black void while PNGs load.
    const background = paintSceneBackgroundGraphics(
      new Graphics(),
      editor.currentScene.width,
      editor.currentScene.height,
      editor.currentScene.background,
      editor.currentScene.backgroundFill,
    );
    background.zIndex = -10000;
    background.label = "scene-fill";
    viewport.removeChildren();
    actorDisplays.current.clear();
    actorOverlays.current.clear();
    propSprites.current.clear();
    propOverlays.current.clear();
    viewport.addChild(background);
    if (onionGraphicsRef.current) {
      onionGraphicsRef.current.zIndex = 40;
      viewport.addChild(onionGraphicsRef.current);
    }
    if (pathGraphicsRef.current) {
      pathGraphicsRef.current.zIndex = 99950;
      viewport.addChild(pathGraphicsRef.current);
      redrawPathOverlay(pathGraphicsRef.current, pathPointsRef.current);
    }

    const build = async () => {
      if (editor.currentScene.backgroundAssetId) {
        const asset = editor.project.assets.find((item) => item.id === editor.currentScene.backgroundAssetId);
        if (asset) {
          try {
            const url = await (window.kcs?.readAsset(asset.path, editor.projectPath) ?? Promise.resolve(asset.path.replace("builtin://", "/")));
            if (canceled) return;
            const texture = await Assets.load<Texture>(url);
            if (canceled) return;
            const sprite = new Sprite(texture);
            sprite.label = "scene-background";
            sprite.position.set(0, 0);
            sprite.width = editor.currentScene.width;
            sprite.height = editor.currentScene.height;
            sprite.zIndex = -9999;
            viewport.addChild(sprite);
          } catch (reason) {
            console.error(`Background ${asset.name} не загружен`, reason);
          }
        }
      }
      for (const actor of editor.currentScene.actors) {
        const character = editor.project.characters.find((item) => item.id === actor.characterId); if (!character) continue; const root = new Container(); root.label = actor.id; root.sortableChildren = true; root.zIndex = 100 + editor.currentScene.actors.indexOf(actor);
        // Apply pose immediately — async texture load finishes after the sync effect already ran once
        // with empty displays, which previously left Embers/etc. at (0,0) full PNG size (top-left blob).
        const facing0 = actor.facingDirection === "Left" ? -1 : 1;
        root.position.set(actor.position.x, actor.position.y);
        root.rotation = actor.rotation * Math.PI / 180;
        root.scale.set(actor.scale * facing0, actor.scale);
        root.visible = actor.visible;
        viewport.addChild(root); const parts = new Map<string, PartDisplay>();
        for (const part of character.parts) {
          const asset = editor.project.assets.find((item) => item.id === part.assetId); if (!asset) continue;
          try {
            const url = await (window.kcs?.readAsset(asset.path, editor.projectPath) ?? Promise.resolve(asset.path.replace("builtin://", "/")));
            if (canceled) return;
            const texture = await Assets.load<Texture>(url);
            if (canceled) return;
            const container = new Container();
            container.label = `${actor.id}:${part.id}`;
            container.sortableChildren = true;
            container.position.set(part.transform.x, part.transform.y);
            container.rotation = part.transform.rotation * Math.PI / 180;
            container.scale.set(part.transform.scaleX, part.transform.scaleY);
            container.pivot.set(part.pivot.x, part.pivot.y);
            container.zIndex = part.zIndex;
            container.visible = part.visible;
            container.alpha = part.opacity;
            const sprite = new Sprite(texture);
            sprite.width = asset.width;
            sprite.height = asset.height;
            sprite.anchor.set(part.anchor.x, part.anchor.y);
            sprite.eventMode = "static";
            sprite.cursor = part.locked ? "not-allowed" : "pointer";
            sprite.on("pointerdown", (event: FederatedPointerEvent) => {
              const context = editorRef.current;
              if (context.tool === "pan" || spacePanRef.current) return;
              if (event.button === 2) return;
              event.stopPropagation();
              context.setSelectedActorId(actor.id);
              context.setSelectedPartId(part.id);
              setContextMenu(null);
              if (context.tool === "path") {
                pathDrawingRef.current = true;
                const local = viewportRef.current!.toLocal(event.global);
                pathPointsRef.current = [{ x: local.x, y: local.y }];
                redrawPathOverlay(pathGraphicsRef.current, pathPointsRef.current);
                return;
              }
              if (part.locked) return;
              const actorState = runtimeWithPreview.actors[actor.id];
              const partNow = context.project.characters.find((item) => item.id === actor.characterId)?.parts.find((item) => item.id === part.id);
              if (!actorState || !partNow) return;
              if (["move", "rotate", "scale"].includes(context.tool)) {
                const local = root.parent!.toLocal(event.global);
                const gizmo = context.tool === "rotate" ? "rotate" : context.tool === "scale" ? "scale" : "move";
                dragRef.current = { kind: "actor", actorId: actor.id, tool: context.tool, gizmo, startGlobal: { x: event.global.x, y: event.global.y }, startLocal: { x: local.x, y: local.y }, startActor: structuredClone(actorState), moved: false };
              } else if (context.tool === "select" || context.tool === "pivot") {
                const local = container.parent!.toLocal(event.global);
                dragRef.current = { kind: "part", actorId: actor.id, partId: part.id, tool: context.tool, startGlobal: { x: event.global.x, y: event.global.y }, startLocal: { x: local.x, y: local.y }, startPart: structuredClone(partNow), moved: false };
              }
            });
            const overlay = new Graphics();
            container.addChild(sprite, overlay);
            parts.set(part.id, { actorId: actor.id, part, container, sprite, overlay });
          } catch (reason) {
            console.error(`Asset ${asset.name} не загружен`, reason);
          }
        }
        for (const part of character.parts) { const display = parts.get(part.id); if (!display) continue; const parent = part.parentId ? parts.get(part.parentId)?.container : root; (parent ?? root).addChild(display.container); }
        for (const attachment of (editor.currentScene.attachments ?? []).filter((item) => item.actorId === actor.id)) {
          const socket = resolveAttachmentSocket(character, attachment); const host = socket ? parts.get(socket.partId)?.container : null; const asset = editor.project.assets.find((item) => item.id === attachment.assetId);
          if (!socket || !host || !asset) continue;
          try {
            const url = await (window.kcs?.readAsset(asset.path, editor.projectPath) ?? Promise.resolve(asset.path.startsWith("data:") ? asset.path : asset.path.replace("builtin://", "/")));
            if (canceled) return; const texture = await Assets.load<Texture>(url); if (canceled) return;
            const sprite = new Sprite(texture); sprite.label = `attachment:${attachment.id}`; sprite.width = asset.width; sprite.height = asset.height;
            sprite.anchor.set(attachment.anchor.x, attachment.anchor.y);
            sprite.position.set(socket.position.x + attachment.offset.x, socket.position.y + attachment.offset.y);
            sprite.rotation = attachment.rotation * Math.PI / 180;
            const drawScale = attachmentDrawScale(attachment);
            sprite.scale.set(drawScale.x, drawScale.y);
            sprite.alpha = attachment.opacity; sprite.zIndex = attachment.zIndex;
            sprite.visible = isAttachmentVisibleAt(attachment, editorRef.current.sceneTime);
            sprite.eventMode = "static"; sprite.cursor = "pointer";
            sprite.on("pointerdown", (event: FederatedPointerEvent) => {
              if (event.button === 2) return;
              event.stopPropagation();
              editorRef.current.setSelectedActorId(actor.id);
              editorRef.current.setSelectedAttachmentId(attachment.id);
            });
            host.addChild(sprite);
          } catch (reason) { console.error(`Attachment ${attachment.name} не загружен`, reason); }
        }
        const actorOutline = new Graphics();
        actorOutline.label = `actor-outline:${actor.id}`;
        actorOutline.eventMode = "static";
        actorOutline.cursor = "nwse-resize";
        actorOutline.zIndex = 100 + editor.currentScene.actors.indexOf(actor) + 0.5;
        actorOutline.on("pointerdown", (event: FederatedPointerEvent) => {
          const context = editorRef.current;
          if (context.tool === "pan" || spacePanRef.current) return;
          if (event.button === 2) return;
          event.stopPropagation();
          context.setSelectedActorId(actor.id);
          setContextMenu(null);
          const actorState = context.currentScene.actors.find((item) => item.id === actor.id);
          if (!actorState) return;
          const local = actorOutline.toLocal(event.global);
          const bounds = root.getLocalBounds();
          const x = bounds.x;
          const y = bounds.y;
          const w = Math.max(20, bounds.width);
          const h = Math.max(20, bounds.height);
          const handle = 14;
          const corners = [
            { x, y },
            { x: x + w, y },
            { x, y: y + h },
            { x: x + w, y: y + h },
          ];
          const nearCorner = corners.some((corner) => Math.hypot(local.x - corner.x, local.y - corner.y) <= handle);
          const nearRotate = Math.hypot(local.x - (x + w / 2), local.y - (y - 40)) <= handle;
          let gizmo: "move" | "scale" | "rotate" = "move";
          if (nearRotate) gizmo = "rotate";
          else if (nearCorner) gizmo = "scale";
          const sceneLocal = viewportRef.current!.toLocal(event.global);
          dragRef.current = {
            kind: "actor",
            actorId: actor.id,
            tool: gizmo === "rotate" ? "rotate" : gizmo === "scale" ? "scale" : "move",
            gizmo,
            startGlobal: { x: event.global.x, y: event.global.y },
            startLocal: { x: sceneLocal.x, y: sceneLocal.y },
            startActor: { position: { ...actorState.position }, rotation: actorState.rotation, scale: actorState.scale },
            moved: false,
          };
          context.setTool(gizmo === "rotate" ? "rotate" : gizmo === "scale" ? "scale" : "move");
        });
        viewport.addChild(actorOutline);
        actorOverlays.current.set(actor.id, actorOutline);
        actorDisplays.current.set(actor.id, { root, parts });
      }
      propOverlays.current.clear();
      for (const prop of editor.currentScene.props) {
        const asset = editor.project.assets.find((item) => item.id === prop.assetId);
        if (!asset) continue;
        try {
          const url = await (window.kcs?.readAsset(asset.path, editor.projectPath) ?? Promise.resolve(asset.path.replace("builtin://", "/")));
          const texture = await Assets.load<Texture>(url);
          const sprite = new Sprite(texture);
          sprite.label = `prop:${prop.id}`;
          sprite.anchor.set(0.5);
          sprite.position.set(prop.position.x, prop.position.y);
          sprite.rotation = prop.rotation * Math.PI / 180;
          sprite.scale.set(prop.scale.x, prop.scale.y);
          sprite.alpha = prop.opacity;
          sprite.visible = prop.visible;
          sprite.zIndex = prop.zIndex;
          sprite.eventMode = "static";
          sprite.cursor = "move";
          sprite.on("pointerdown", (event: FederatedPointerEvent) => {
            const context = editorRef.current;
            if (context.tool === "pan" || spacePanRef.current) return;
            if (event.button === 2) return;
            event.stopPropagation();
            context.setSelectedPropId(prop.id);
            setContextMenu(null);
            if (!["move", "rotate", "scale"].includes(context.tool)) {
              context.setTool("move");
            }
            const tool = ["move", "rotate", "scale"].includes(context.tool) ? context.tool : "move";
            const local = viewportRef.current!.toLocal(event.global);
            const propNow = context.currentScene.props.find((item) => item.id === prop.id);
            if (!propNow) return;
            dragRef.current = {
              kind: "prop",
              actorId: "",
              propId: prop.id,
              tool,
              gizmo: tool === "rotate" ? "rotate" : tool === "scale" ? "scale" : "move",
              startGlobal: { x: event.global.x, y: event.global.y },
              startLocal: { x: local.x, y: local.y },
              startProp: structuredClone(propNow),
              moved: false,
            };
          });
          const outline = new Graphics();
          outline.label = `prop-outline:${prop.id}`;
          outline.eventMode = "static";
          outline.cursor = "nwse-resize";
          outline.zIndex = prop.zIndex + 0.1;
          outline.on("pointerdown", (event: FederatedPointerEvent) => {
            const context = editorRef.current;
            if (context.tool === "pan" || spacePanRef.current) return;
            if (event.button === 2) return;
            event.stopPropagation();
            context.setSelectedPropId(prop.id);
            setContextMenu(null);
            const propNow = context.currentScene.props.find((item) => item.id === prop.id);
            if (!propNow) return;
            const local = outline.toLocal(event.global);
            const asset = context.project.assets.find((item) => item.id === propNow.assetId);
            const w = asset?.width ?? 100;
            const h = asset?.height ?? 100;
            const x = -w / 2;
            const y = -h / 2;
            const handle = 14;
            const corners = [
              { x, y },
              { x: x + w, y },
              { x, y: y + h },
              { x: x + w, y: y + h },
            ];
            const nearCorner = corners.some((corner) => Math.hypot(local.x - corner.x, local.y - corner.y) <= handle);
            const nearRotate = Math.hypot(local.x - 0, local.y - (y - 40)) <= handle;
            let gizmo: "move" | "scale" | "rotate" = "move";
            if (nearRotate) gizmo = "rotate";
            else if (nearCorner) gizmo = "scale";
            const sceneLocal = viewportRef.current!.toLocal(event.global);
            dragRef.current = {
              kind: "prop",
              actorId: "",
              propId: prop.id,
              tool: gizmo === "rotate" ? "rotate" : gizmo === "scale" ? "scale" : "move",
              gizmo,
              startGlobal: { x: event.global.x, y: event.global.y },
              startLocal: { x: sceneLocal.x, y: sceneLocal.y },
              startProp: structuredClone(propNow),
              moved: false,
            };
            if (gizmo !== "move") context.setTool(gizmo === "rotate" ? "rotate" : "scale");
            else context.setTool("move");
          });
          propSprites.current.set(prop.id, sprite);
          propOverlays.current.set(prop.id, outline);
          viewport.addChild(sprite, outline);
        } catch (reason) {
          console.error(`Prop ${prop.name} не загружен`, reason);
        }
      }
      if (onionGraphicsRef.current) {
        onionGraphicsRef.current.zIndex = 40;
        viewport.addChild(onionGraphicsRef.current);
      }
      if (pathGraphicsRef.current) {
        pathGraphicsRef.current.zIndex = 99950;
        viewport.addChild(pathGraphicsRef.current);
        redrawPathOverlay(pathGraphicsRef.current, pathPointsRef.current);
      }
      if (!canceled) setDisplayGeneration((value) => value + 1);
    };
    void build(); return () => { canceled = true; };
    // Only structureKey — NOT currentScene. Drag/scale uses preview() and would rebuild every frame (= flicker).
  }, [structureKey, editor.projectPath, ready]);

  useEffect(() => {
    const viewport = viewportRef.current; const app = appRef.current; if (!viewport || !app) return; const scene = editor.currentScene; const camera = runtimeWithPreview.camera;
    const fit = Math.min((app.screen.width - 16) / scene.width, (app.screen.height - 16) / scene.height);
    viewport.pivot.set(camera.x, camera.y);
    viewport.position.set(app.screen.width / 2 + pan.x, app.screen.height / 2 + pan.y);
    viewport.scale.set(fit * camera.zoom * zoom);
    viewport.rotation = -camera.rotation * Math.PI / 180;
    for (const [index, actor] of scene.actors.entries()) {
      const actorState = runtimeWithPreview.actors[actor.id]; const display = actorDisplays.current.get(actor.id); const character = editor.project.characters.find((item) => item.id === actor.characterId); if (!actorState || !display || !character) continue;
      display.root.zIndex = 100 + index;
      // While dragging, use live preview position — timeline X/Y keys must not lock the axis.
      const draggingThis = dragRef.current?.kind === "actor" && dragRef.current.actorId === actor.id;
      const liveActor = draggingThis ? editor.currentScene.actors.find((item) => item.id === actor.id) : null;
      const drawPos = liveActor?.position ?? actorState.position;
      const drawRot = liveActor?.rotation ?? actorState.rotation;
      const drawScale = liveActor?.scale ?? actorState.scale;
      display.root.position.set(drawPos.x, drawPos.y);
      display.root.rotation = drawRot * Math.PI / 180;
      const facing = actorState.facingDirection === "Left" ? -1 : 1;
      display.root.scale.set(drawScale * facing, drawScale);
      display.root.visible = actorState.visible;
      display.root.alpha = actorState.opacity ?? 1;
      for (const part of character.parts) { const partDisplay = display.parts.get(part.id); const asset = editor.project.assets.find((item) => item.id === part.assetId); if (!partDisplay || !asset) continue; const values = actorState.rig[part.id]; const transform = { ...part.transform, ...values };
        partDisplay.container.position.set(transform.x, transform.y); partDisplay.container.rotation = transform.rotation * Math.PI / 180; partDisplay.container.scale.set(transform.scaleX, transform.scaleY); partDisplay.container.pivot.set(part.pivot.x, part.pivot.y); partDisplay.container.zIndex = part.zIndex; partDisplay.container.visible = part.visible; partDisplay.container.alpha = values?.opacity ?? part.opacity; partDisplay.sprite.anchor.set(part.anchor.x, part.anchor.y);
        const tint = actorState.tint; partDisplay.sprite.tint = tint ? Number.parseInt(tint.slice(1), 16) : 0xffffff; const g = partDisplay.overlay; g.clear();
        if (editor.selectedActorId === actor.id && editor.selectedPartId === part.id) { const x = -part.anchor.x * asset.width; const y = -part.anchor.y * asset.height; g.rect(x, y, asset.width, asset.height).stroke({ color: 0xf2c75c, width: 3 / Math.max(.1, Math.abs(transform.scaleX)) }); g.circle(part.pivot.x, part.pivot.y, 7).fill({ color: 0xf2c75c, alpha: .95 }); }
        g.removeAllListeners("pointerdown"); g.eventMode = "none";
        if (editor.tool === "socket") { for (const socket of character.sockets?.filter((item) => item.partId === part.id) ?? []) { const selected = socket.id === editor.selectedSocketId; g.circle(socket.position.x, socket.position.y, selected ? 11 : 8).fill({ color: selected ? 0xffd463 : 0x4fc8d8, alpha: .95 }).stroke({ color: 0x10252a, width: 2 }); g.circle(socket.position.x, socket.position.y, 2).fill(0x10252a); g.eventMode = "static"; g.cursor = "crosshair"; g.on("pointerdown", (event: FederatedPointerEvent) => { event.stopPropagation(); editorRef.current.setSelectedActorId(actor.id); editorRef.current.setSelectedPartId(part.id); editorRef.current.setSelectedSocketId(socket.id); dragRef.current = { kind: "socket", actorId: actor.id, partId: part.id, socketId: socket.id, tool: "socket", startGlobal: { x: event.global.x, y: event.global.y }, startLocal: { x: socket.position.x, y: socket.position.y }, moved: false }; }); } }
        if (editor.tool === "ik") {
          const chain = findIkChainForPart(character, part.id);
          if (chain && (part.id === chain.tipId || (chain.midId == null && part.id === chain.rootId))) {
            g.circle(part.pivot.x, part.pivot.y, 10).fill({ color: 0x6ad0a0, alpha: 0.9 }).stroke({ color: 0x102a1c, width: 2 });
            g.eventMode = "static";
            g.cursor = "grab";
            g.on("pointerdown", (event: FederatedPointerEvent) => {
              event.stopPropagation();
              editorRef.current.setSelectedActorId(actor.id);
              editorRef.current.setSelectedPartId(part.id);
              editorRef.current.setPlaying(false);
              dragRef.current = {
                kind: "ik",
                actorId: actor.id,
                partId: part.id,
                chainId: chain.id,
                tool: "ik",
                startGlobal: { x: event.global.x, y: event.global.y },
                startLocal: { x: 0, y: 0 },
                moved: false,
              };
            });
          }
        }
      }
      for (const attachment of (scene.attachments ?? []).filter((item) => item.actorId === actor.id)) {
        for (const partDisplay of display.parts.values()) {
          const sprite = partDisplay.container.children.find((child) => child.label === `attachment:${attachment.id}`) as Sprite | undefined;
          if (!sprite) continue;
          sprite.visible = isAttachmentVisibleAt(attachment, editor.sceneTime);
          const drawScale = attachmentDrawScale(attachment);
          sprite.scale.set(drawScale.x, drawScale.y);
          sprite.alpha = attachment.opacity;
        }
      }
      const actorOutline = actorOverlays.current.get(actor.id);
      if (actorOutline) {
        actorOutline.clear();
        actorOutline.position.set(drawPos.x, drawPos.y);
        actorOutline.rotation = drawRot * Math.PI / 180;
        actorOutline.scale.set(drawScale * facing, drawScale);
        actorOutline.zIndex = 100 + index + 0.5;
        const selected = editor.selectedActorId === actor.id && !editor.selectedPropId;
        actorOutline.visible = actorState.visible && selected && editor.tool !== "socket" && editor.tool !== "path" && editor.tool !== "pivot" && editor.tool !== "ik";
        if (actorOutline.visible) {
          const bounds = display.root.getLocalBounds();
          const x = bounds.x;
          const y = bounds.y;
          const w = Math.max(20, bounds.width);
          const h = Math.max(20, bounds.height);
          const inv = 1 / Math.max(0.05, Math.abs(actorState.scale));
          actorOutline.rect(x, y, w, h).stroke({ color: 0xf2c75c, width: 3 * inv });
          const handle = 12 * inv;
          for (const [hx, hy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]] as const) {
            actorOutline.rect(hx - handle / 2, hy - handle / 2, handle, handle).fill({ color: 0xf2c75c, alpha: 1 }).stroke({ color: 0x1a1510, width: 1 });
          }
          const rotX = x + w / 2;
          const rotY = y - 40;
          actorOutline.moveTo(rotX, y).lineTo(rotX, rotY).stroke({ color: 0xf2c75c, width: 2 * inv });
          actorOutline.circle(rotX, rotY, handle * 0.7).fill({ color: 0x55c2d0, alpha: 1 }).stroke({ color: 0x1a1510, width: 1 });
          // Only gizmos capture hits — empty area of the box must pass through so click-deselect works
          actorOutline.hitArea = {
            contains(px: number, py: number) {
              const nearCorner = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].some(
                ([cx, cy]) => Math.hypot(px - cx, py - cy) <= handle * 1.4,
              );
              const nearRotate = Math.hypot(px - rotX, py - rotY) <= handle * 1.4;
              return nearCorner || nearRotate;
            },
          };
        } else {
          actorOutline.hitArea = new Rectangle(0, 0, 0, 0);
          actorOutline.visible = false;
        }
      }
    }

    for (const propState of runtimeWithPreview.props) {
      const sprite = propSprites.current.get(propState.id);
      const outline = propOverlays.current.get(propState.id);
      if (!sprite) continue;
      sprite.position.set(propState.position.x, propState.position.y);
      sprite.rotation = propState.rotation * Math.PI / 180;
      sprite.scale.set(propState.scale.x, propState.scale.y);
      sprite.alpha = propState.opacity;
      sprite.visible = propState.visible;
      sprite.zIndex = propState.zIndex;
      sprite.tint = 0xffffff;
      if (outline) {
        outline.clear();
        outline.position.set(propState.position.x, propState.position.y);
        outline.rotation = propState.rotation * Math.PI / 180;
        outline.scale.set(propState.scale.x, propState.scale.y);
        outline.zIndex = propState.zIndex + 0.1;
        outline.visible = propState.visible && editor.selectedPropId === propState.id;
        if (editor.selectedPropId === propState.id) {
          const asset = editor.project.assets.find((item) => item.id === propState.assetId);
          const w = asset?.width ?? sprite.texture.width;
          const h = asset?.height ?? sprite.texture.height;
          const x = -w / 2;
          const y = -h / 2;
          outline.rect(x, y, w, h).stroke({ color: 0xf2c75c, width: 3 / Math.max(0.05, Math.abs(propState.scale.x)) });
          const handle = 12 / Math.max(0.05, Math.abs(propState.scale.x));
          for (const [hx, hy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]] as const) {
            outline.rect(hx - handle / 2, hy - handle / 2, handle, handle).fill({ color: 0xf2c75c, alpha: 1 }).stroke({ color: 0x1a1510, width: 1 });
          }
          const rotY = y - 40;
          outline.moveTo(0, y).lineTo(0, rotY).stroke({ color: 0xf2c75c, width: 2 / Math.max(0.05, Math.abs(propState.scale.x)) });
          outline.circle(0, rotY, handle * 0.7).fill({ color: 0x55c2d0, alpha: 1 }).stroke({ color: 0x1a1510, width: 1 });
          outline.hitArea = new Rectangle(x - 20, rotY - 20, w + 40, h + 60);
        } else {
          outline.hitArea = new Rectangle(0, 0, 0, 0);
        }
      }
    }

    const onion = onionGraphicsRef.current;
    if (onion) {
      onion.clear();
      if (editor.onionSkinEnabled && !editor.playing) {
        const step = 1 / Math.max(1, editor.project.fps);
        const offsets = [-2, -1, 1].map((frame) => frame * step);
        const focusId = editor.selectedActorId;
        for (const offset of offsets) {
          const ghostTime = editor.sceneTime + offset;
          if (ghostTime < -0.001 || ghostTime > editor.playbackDuration + 0.001) continue;
          const ghost = new SceneRuntime().setTime(scene, editor.project.characters, Math.max(0, ghostTime), {
            moveStyle: editor.studioPrefs.moveStyle ?? "walk",
          });
          const past = offset < 0;
          const color = past ? 0x5b8cff : 0x5bc88a;
          const alpha = past ? 0.22 + Math.abs(offset) * 0.05 : 0.28;
          for (const actor of scene.actors) {
            if (focusId && actor.id !== focusId) continue;
            const state = ghost.actors[actor.id];
            const display = actorDisplays.current.get(actor.id);
            if (!state?.visible || !display) continue;
            const facing = state.facingDirection === "Left" ? -1 : 1;
            const bounds = display.root.getLocalBounds();
            const bx = bounds.x;
            const by = bounds.y;
            const bw = Math.max(24, bounds.width);
            const bh = Math.max(24, bounds.height);
            // Draw ghost box in world space via temporary transform math
            const cos = Math.cos(state.rotation * Math.PI / 180);
            const sin = Math.sin(state.rotation * Math.PI / 180);
            const sx = state.scale * facing;
            const sy = state.scale;
            const corners = [
              { x: bx, y: by },
              { x: bx + bw, y: by },
              { x: bx + bw, y: by + bh },
              { x: bx, y: by + bh },
            ].map((p) => {
              const lx = p.x * sx;
              const ly = p.y * sy;
              return {
                x: state.position.x + lx * cos - ly * sin,
                y: state.position.y + lx * sin + ly * cos,
              };
            });
            onion.moveTo(corners[0]!.x, corners[0]!.y);
            for (let i = 1; i < corners.length; i += 1) onion.lineTo(corners[i]!.x, corners[i]!.y);
            onion.closePath().stroke({ color, width: 2, alpha });
            onion.circle(state.position.x, state.position.y, 6 * state.scale).fill({ color, alpha: alpha + 0.15 });
          }
        }
      }
    }

    const safe = safeFrameRef.current;
    if (safe) {
      safe.clear();
      const settings = editor.renderSettings;
      if (settings.showSafeFrame) {
        const frameW = settings.canvasWidth / Math.max(0.0001, camera.zoom);
        const frameH = settings.canvasHeight / Math.max(0.0001, camera.zoom);
        const localLeft = camera.x - frameW / 2;
        const localTop = camera.y - frameH / 2;
        const topLeft = viewport.toGlobal({ x: localLeft, y: localTop });
        const bottomRight = viewport.toGlobal({ x: localLeft + frameW, y: localTop + frameH });
        const x = Math.min(topLeft.x, bottomRight.x);
        const y = Math.min(topLeft.y, bottomRight.y);
        const w = Math.abs(bottomRight.x - topLeft.x);
        const h = Math.abs(bottomRight.y - topLeft.y);
        const screenW = app.screen.width;
        const screenH = app.screen.height;
        safe.rect(0, 0, screenW, Math.max(0, y)).fill({ color: 0x050607, alpha: 0.45 });
        safe.rect(0, y + h, screenW, Math.max(0, screenH - (y + h))).fill({ color: 0x050607, alpha: 0.45 });
        safe.rect(0, y, Math.max(0, x), h).fill({ color: 0x050607, alpha: 0.45 });
        safe.rect(x + w, y, Math.max(0, screenW - (x + w)), h).fill({ color: 0x050607, alpha: 0.45 });
        safe.rect(x, y, w, h).stroke({ color: 0xf0c75e, width: 2, alpha: 0.95 });
        if (settings.showActionSafe) {
          const insetX = w * 0.05;
          const insetY = h * 0.05;
          safe.rect(x + insetX, y + insetY, w - insetX * 2, h - insetY * 2).stroke({ color: 0x55c2d0, width: 1.5, alpha: 0.9 });
        }
        if (settings.showTitleSafe) {
          const insetX = w * 0.1;
          const insetY = h * 0.1;
          safe.rect(x + insetX, y + insetY, w - insetX * 2, h - insetY * 2).stroke({ color: 0xd2675e, width: 1.5, alpha: 0.9 });
        }
      }
    }
  }, [displayGeneration, editor.currentScene, editor.onionSkinEnabled, editor.playbackDuration, editor.playing, editor.project.assets, editor.project.characters, editor.project.fps, editor.renderSettings, editor.sceneTime, editor.selectedActorId, editor.selectedPartId, editor.selectedPropId, editor.selectedSocketId, editor.tool, pan, ready, runtimeWithPreview, zoom]);

  return (
    <main className="canvas-panel panel">
      <div className="canvas-toolbar">
        <div className="tool-group">
          {toolLabels.map(([id, key, label]) => (
            <button key={id} className={editor.tool === id ? "active" : ""} title={label} onClick={() => editor.setTool(id)}>
              <b>{key}</b><span>{label}</span>
            </button>
          ))}
        </div>
        <div className="canvas-meta">
          <span className="canvas-size-readout" title="Размер кадра сцены">
            {editor.renderSettings.canvasWidth} × {editor.renderSettings.canvasHeight}
          </span>
          <button
            type="button"
            className={editor.renderSettings.preset === "youtube-fullhd" ? "active" : ""}
            title="Горизонталь 16:9 — YouTube 1920×1080"
            onClick={() => editor.updateRenderSettings(applyPlatformExportPreset(editor.renderSettings, "youtube-fullhd"))}
          >
            16:9
          </button>
          <button
            type="button"
            className={editor.renderSettings.preset === "youtube-shorts" ? "active" : ""}
            title="Вертикаль 9:16 — Shorts / Reels 1080×1920"
            onClick={() => editor.updateRenderSettings(applyPlatformExportPreset(editor.renderSettings, "youtube-shorts"))}
          >
            9:16
          </button>
          <button
            type="button"
            className={editor.renderSettings.preset === "square" ? "active" : ""}
            title="Квадрат 1:1 — 1080×1080"
            onClick={() => editor.updateRenderSettings(applyPlatformExportPreset(editor.renderSettings, "square"))}
          >
            1:1
          </button>
          <button
            type="button"
            title="Свой размер и экспорт — ширина/высота вручную"
            onClick={() => editor.setExportPanelOpen(true)}
          >
            Размер…
          </button>
          <span>Камера {runtimeWithPreview.camera.zoom.toFixed(2)}×</span>
          <button
            className={editor.renderSettings.showSafeFrame ? "active" : ""}
            title="Подсказка границ кадра (не в MP4). Кликом вкл/выкл."
            onClick={() => editor.updateRenderSettings({
              ...editor.renderSettings,
              showSafeFrame: !editor.renderSettings.showSafeFrame,
              showActionSafe: false,
              showTitleSafe: false,
            })}
          >
            Рамка
          </button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Вписать сцену в окно">Вписать</button>
          <button onClick={() => setZoom((value) => Math.min(4, value * 1.1))} title="Крупнее (Ctrl+колёсико)">＋</button>
          <button onClick={() => setZoom((value) => Math.max(0.15, value * 0.9))} title="Мельче (Ctrl+колёсико)">−</button>
          <span>{Math.round(zoom * 100)}%</span>
          {editor.tool === "path" && <span className="path-hint">{editor.directorLocomotion}: тяните путь мышкой</span>}
          {editor.tool === "ik" && <span className="path-hint">IK: тяните зелёную точку на кисти или стопе</span>}
          <span className="path-hint">ЛКМ пусто = фон · ПКМ = меню ключей · Esc = снять · G/S/R · Del</span>
        </div>
      </div>
      <SceneConstructorBar />
      {selectedProp && (
        <div className="prop-edit-bar">
          <strong>Предмет: {selectedProp.name}</strong>
          <button type="button" className={editor.tool === "move" ? "active" : ""} onClick={() => editor.setTool("move")}>Двигать</button>
          <button type="button" className={editor.tool === "scale" ? "active" : ""} onClick={() => editor.setTool("scale")}>Масштаб</button>
          <button type="button" className={editor.tool === "rotate" ? "active" : ""} onClick={() => editor.setTool("rotate")}>Поворот</button>
          <button type="button" onClick={() => editor.nudgePropLayer(selectedProp.id, 10)}>Слой ↑</button>
          <button type="button" onClick={() => editor.nudgePropLayer(selectedProp.id, -10)}>Слой ↓</button>
          <button type="button" className="danger" onClick={() => editor.deleteProp(selectedProp.id)}>Удалить</button>
          <span className="hint">Тяните на сцене · числа справа в «Свойствах»</span>
        </div>
      )}
      <div
        className={`canvas-host${editor.montageCrossfade ? " is-crossfading" : ""}`}
        ref={hostRef}
        style={editor.montageBlend != null ? { outline: `2px solid rgba(229, 185, 78, ${0.35 + editor.montageBlend * 0.5})` } : undefined}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const host = hostRef.current;
          const app = appRef.current;
          const viewport = viewportRef.current;
          const menuX = event.clientX;
          const menuY = event.clientY;
          if (!host || !app || !viewport) {
            setContextMenu({ x: menuX, y: menuY, kind: "empty" });
            return;
          }
          const bounds = app.canvas.getBoundingClientRect();
          const globalX = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * app.screen.width;
          const globalY = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * app.screen.height;
          const local = viewport.toLocal({ x: globalX, y: globalY });

          const hitProp = [...editor.currentScene.props]
            .sort((a, b) => b.zIndex - a.zIndex)
            .find((prop) => {
              const sprite = propSprites.current.get(prop.id);
              if (!sprite || !sprite.visible) return false;
              const asset = editor.project.assets.find((item) => item.id === prop.assetId);
              const w = (asset?.width ?? 100) * Math.abs(prop.scale.x);
              const h = (asset?.height ?? 100) * Math.abs(prop.scale.y);
              const dx = local.x - prop.position.x;
              const dy = local.y - prop.position.y;
              const cos = Math.cos(-prop.rotation * Math.PI / 180);
              const sin = Math.sin(-prop.rotation * Math.PI / 180);
              const lx = dx * cos - dy * sin;
              const ly = dx * sin + dy * cos;
              return Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2;
            });

          if (hitProp) {
            editor.setSelectedPropId(hitProp.id);
            setContextMenu({ x: menuX, y: menuY, kind: "prop", propId: hitProp.id });
            return;
          }

          // Hit by actor local bounds in scene space (screen getBounds is often oversized / wrong with zoom)
          const hitActor = [...editor.currentScene.actors].reverse().find((actor) => {
            const display = actorDisplays.current.get(actor.id);
            if (!display || !display.root.visible) return false;
            const lb = display.root.getLocalBounds();
            const sx = Math.abs(display.root.scale.x) || 1;
            const sy = Math.abs(display.root.scale.y) || 1;
            const pad = 12;
            const w = Math.max(24, lb.width * sx) + pad * 2;
            const h = Math.max(24, lb.height * sy) + pad * 2;
            const cx = display.root.position.x + (lb.x + lb.width / 2) * display.root.scale.x;
            const cy = display.root.position.y + (lb.y + lb.height / 2) * display.root.scale.y;
            // Approximate AABB ignoring rotation for menu hit (good enough for RMB)
            return Math.abs(local.x - cx) <= w / 2 && Math.abs(local.y - cy) <= h / 2;
          });
          if (hitActor) {
            editor.setSelectedActorId(hitActor.id);
            setContextMenu({ x: menuX, y: menuY, kind: "actor", actorId: hitActor.id });
            return;
          }

          editor.clearSceneSelection();
          setContextMenu({ x: menuX, y: menuY, kind: editor.currentScene.backgroundAssetId ? "background" : "empty" });
        }}
        onClick={() => setContextMenu(null)}
      >
        <div className="canvas-label">
          {editor.montageMode ? (editor.montageBlend != null ? `МОНТАЖ XF ${(editor.montageBlend * 100).toFixed(0)}% · живой наплыв` : "МОНТАЖ") : editor.currentScene.name}
          {" · "}
          {editor.currentScene.actors.length} акт. · {editor.currentScene.props.length} предм.
          {selectedProp ? ` · выбран: ${selectedProp.name}` : ""}
        </div>
        <CrossfadeLivePreview blend={editor.montageCrossfade} />
        {editor.montageCrossfade == null && editor.currentScene.subtitleSettings?.enabled !== false && (() => {
          const settings = createDefaultSubtitleSettings(editor.currentScene.subtitleSettings);
          if (!settings.enabled) return null;
          const text = getActiveSubtitleText(editor.currentScene.dialogues, editor.sceneTime, {
            showSpeaker: settings.showSpeaker,
            actors: editor.currentScene.actors,
          });
          if (!text) return null;
          const lines = wrapSubtitleLines(text, settings.maxCharsPerLine);
          return (
            <div
              className="subtitle-overlay"
              style={{
                fontSize: settings.fontSize * 0.45,
                bottom: Math.max(12, settings.bottomOffset * 0.35),
                maxWidth: `${Math.round(settings.maxWidthPct * 100)}%`,
                color: settings.textColor,
                background: settings.backgroundEnabled
                  ? hexToRgbaCss(settings.backgroundColor, settings.backgroundOpacity)
                  : "transparent",
              }}
            >
              {lines.map((line, index) => <div key={`${index}-${line}`}>{line}</div>)}
            </div>
          );
        })()}
        {contextMenu && (
          <div
            className="canvas-context-menu"
            style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y, zIndex: 100000 }}
            role="menu"
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            {contextMenu.kind === "prop" && (
              <>
                <button type="button" onClick={() => { editor.setTool("move"); setContextMenu(null); }}>Двигать (G)</button>
                <button type="button" onClick={() => { editor.setTool("scale"); setContextMenu(null); }}>Масштаб (S)</button>
                <button type="button" onClick={() => { editor.setTool("rotate"); setContextMenu(null); }}>Поворот (R)</button>
                <button type="button" onClick={() => { editor.alignSelection("center"); setContextMenu(null); }}>В центр кадра</button>
                <button type="button" onClick={() => { if (contextMenu.propId) editor.duplicateProp(contextMenu.propId); setContextMenu(null); }}>Дублировать</button>
                <button type="button" onClick={() => { if (contextMenu.propId) editor.nudgePropLayer(contextMenu.propId, 10); setContextMenu(null); }}>Слой выше</button>
                <button type="button" onClick={() => { if (contextMenu.propId) editor.nudgePropLayer(contextMenu.propId, -10); setContextMenu(null); }}>Слой ниже</button>
                <button type="button" className="danger" onClick={() => { editor.deleteSelectedFromScene(); setContextMenu(null); }}>Удалить со сцены (Del)</button>
              </>
            )}
            {contextMenu.kind === "actor" && (
              <>
                <button type="button" onClick={() => { editor.setTool("move"); setContextMenu(null); }}>Двигать актёра (G)</button>
                <button type="button" onClick={() => { editor.setTool("scale"); setContextMenu(null); }}>Масштаб (S)</button>
                <button type="button" onClick={() => { editor.setTool("rotate"); setContextMenu(null); }}>Поворот (R)</button>
                <button
                  type="button"
                  onClick={() => {
                    if (!contextMenu.actorId) return;
                    const actor = editor.currentScene.actors.find((item) => item.id === contextMenu.actorId);
                    if (!actor) return;
                    const at = editor.sceneTime;
                    editor.commit(`Ключ X/Y @${at.toFixed(2)}с`, (draft) => {
                      const scene = draft.scenes!.find((item) => item.id === editor.currentScene.id)!;
                      syncActorTransformKeysAtTime(scene, actor.id, at, { x: actor.position.x, y: actor.position.y });
                    });
                    setContextMenu(null);
                  }}
                >
                  ＋ Ключ положения (X/Y)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!contextMenu.actorId) return;
                    const actor = editor.currentScene.actors.find((item) => item.id === contextMenu.actorId);
                    if (!actor) return;
                    const at = editor.sceneTime;
                    editor.commit(`Ключ масштаб/поворот @${at.toFixed(2)}с`, (draft) => {
                      const scene = draft.scenes!.find((item) => item.id === editor.currentScene.id)!;
                      syncActorTransformKeysAtTime(scene, actor.id, at, { scale: actor.scale, rotation: actor.rotation });
                    });
                    setContextMenu(null);
                  }}
                >
                  ＋ Ключ масштаб / поворот
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    if (!contextMenu.actorId) return;
                    const at = editor.sceneTime;
                    editor.commit("Ключи на времени удалены", (draft) => {
                      const scene = draft.scenes!.find((item) => item.id === editor.currentScene.id)!;
                      deleteActorKeysAtTime(scene, contextMenu.actorId!, at);
                    });
                    setContextMenu(null);
                  }}
                >
                  Удалить ключи на этом кадре
                </button>
                <button type="button" onClick={() => { editor.alignSelection("center"); setContextMenu(null); }}>В центр кадра</button>
                <button type="button" onClick={() => { if (contextMenu.actorId) editor.duplicateActor(contextMenu.actorId); setContextMenu(null); }}>Дублировать</button>
                <button type="button" onClick={() => { if (contextMenu.actorId) editor.reorderActor(contextMenu.actorId, 1); setContextMenu(null); }}>Слой выше</button>
                <button type="button" onClick={() => { if (contextMenu.actorId) editor.reorderActor(contextMenu.actorId, -1); setContextMenu(null); }}>Слой ниже</button>
                <button type="button" className="danger" onClick={() => { editor.deleteSelectedFromScene(); setContextMenu(null); }}>Удалить актёра (Del)</button>
              </>
            )}
            {contextMenu.kind === "background" && (
              <>
                <button type="button" onClick={() => { editor.requestRightTab("inspector"); document.getElementById("scene-background-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); setContextMenu(null); }}>Свойства фона</button>
                <button type="button" className="danger" onClick={() => { editor.clearSceneBackground(); setContextMenu(null); }}>Убрать фон</button>
                <button type="button" onClick={() => setContextMenu(null)}>Закрыть</button>
              </>
            )}
            {contextMenu.kind === "empty" && (
              <>
                <button type="button" onClick={() => { editor.requestRightTab("inspector"); document.getElementById("scene-background-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); setContextMenu(null); }}>Свойства фона / сцены</button>
                <button type="button" onClick={() => { void editor.importPngAs("background"); setContextMenu(null); }}>PNG как фон…</button>
                <button type="button" onClick={() => { void editor.importPngAs("prop"); setContextMenu(null); }}>PNG как предмет…</button>
                <button type="button" onClick={() => { void editor.addBundledCharacterToScene("AudioBeast/EmberPuff"); setContextMenu(null); }}>＋ Огонёк</button>
                <button type="button" onClick={() => { void editor.addBundledCharacterToScene("AudioBeast/FrostFang"); setContextMenu(null); }}>＋ Морозко</button>
                <button type="button" onClick={() => { void editor.addBundledCharacterToScene("AudioBeast/GearBot"); setContextMenu(null); }}>＋ Винтик</button>
                <button type="button" onClick={() => { editor.setTool("pan"); setContextMenu(null); }}>Сдвиг вида (H)</button>
                <button type="button" onClick={() => setContextMenu(null)}>Закрыть</button>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function hexToRgbaCss(color: string, alpha: number): string {
  const hex = color.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((ch) => ch + ch).join("") : hex.padEnd(6, "0").slice(0, 6);
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if (![r, g, b].every((value) => Number.isFinite(value))) return `rgba(0,0,0,${alpha})`;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}
