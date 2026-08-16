import { useEffect, useRef } from "react";
import type { MontageTimeMap } from "../domain/montage";
import type { ProjectDocument, Scene } from "../domain/types";
import type { RenderSettings } from "../domain/renderSettings";
import { useEditor } from "../editor/EditorContext";
import { blendCanvasFrames } from "../systems/pngBlend";
import { SceneFrameRenderer } from "../systems/SceneFrameRenderer";

type MontageBlend = NonNullable<MontageTimeMap["blend"]>;

async function resolvePreviewAssetUrl(assetPath: string, projectPath?: string): Promise<string> {
  if (assetPath.startsWith("data:")) return assetPath;
  if (window.kcs?.readAsset) return window.kcs.readAsset(assetPath, projectPath);
  return assetPath.replace("builtin://", "/");
}

async function ensureSceneRenderer(
  pool: Map<string, SceneFrameRenderer>,
  project: ProjectDocument,
  scene: Scene,
  settings: RenderSettings,
  projectPath?: string,
): Promise<SceneFrameRenderer> {
  let renderer = pool.get(scene.id);
  if (renderer) return renderer;
  renderer = new SceneFrameRenderer();
  const sceneSettings: RenderSettings = {
    ...settings,
    duration: scene.duration,
    backgroundColor: settings.transparentBackground ? settings.backgroundColor : scene.background,
  };
  await renderer.prepare({
    project,
    scene,
    characters: project.characters,
    assets: project.assets,
    settings: sceneSettings,
    resolveAssetUrl: (assetPath) => resolvePreviewAssetUrl(assetPath, projectPath),
  });
  pool.set(scene.id, renderer);
  return renderer;
}

function destroyPool(pool: Map<string, SceneFrameRenderer>) {
  for (const renderer of pool.values()) renderer.destroy();
  pool.clear();
}

/** Live A→B frame blend on the canvas host — same compositing as montage export. */
export function CrossfadeLivePreview({ blend }: { blend: MontageBlend | null }) {
  const editor = useEditor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poolRef = useRef(new Map<string, SceneFrameRenderer>());
  const fromBufRef = useRef<HTMLCanvasElement | null>(null);
  const toBufRef = useRef<HTMLCanvasElement | null>(null);
  const genRef = useRef(0);
  const busyRef = useRef(false);
  const pendingRef = useRef(false);

  useEffect(() => () => {
    genRef.current += 1;
    destroyPool(poolRef.current);
  }, []);

  useEffect(() => {
    destroyPool(poolRef.current);
  }, [editor.renderSettings.canvasWidth, editor.renderSettings.canvasHeight]);

  useEffect(() => {
    if (!blend) {
      genRef.current += 1;
      destroyPool(poolRef.current);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const run = async () => {
      if (busyRef.current) {
        pendingRef.current = true;
        return;
      }
      busyRef.current = true;
      const gen = ++genRef.current;
      const width = Math.round(editor.renderSettings.canvasWidth);
      const height = Math.round(editor.renderSettings.canvasHeight);
      try {
        const fromRenderer = await ensureSceneRenderer(
          poolRef.current,
          editor.project,
          blend.from.scene,
          editor.renderSettings,
          editor.projectPath,
        );
        const toRenderer = await ensureSceneRenderer(
          poolRef.current,
          editor.project,
          blend.to.scene,
          editor.renderSettings,
          editor.projectPath,
        );
        if (gen !== genRef.current) return;

        if (!fromBufRef.current) fromBufRef.current = document.createElement("canvas");
        if (!toBufRef.current) toBufRef.current = document.createElement("canvas");
        await fromRenderer.paintFrame(blend.from.localTime, fromBufRef.current);
        await toRenderer.paintFrame(blend.to.localTime, toBufRef.current);
        if (gen !== genRef.current) return;

        const out = canvasRef.current;
        if (!out) return;
        blendCanvasFrames(fromBufRef.current, toBufRef.current, blend.amount, out, width, height, blend.kind);
      } catch (reason) {
        console.error("Live crossfade preview failed", reason);
      } finally {
        busyRef.current = false;
        if (pendingRef.current && gen === genRef.current) {
          pendingRef.current = false;
          void run();
        } else {
          pendingRef.current = false;
        }
      }
    };

    void run();
  }, [
    blend,
    blend?.amount,
    blend?.from.localTime,
    blend?.from.scene.id,
    blend?.to.localTime,
    blend?.to.scene.id,
    editor.project,
    editor.projectPath,
    editor.renderSettings,
  ]);

  if (!blend) return null;

  return (
    <canvas
      ref={canvasRef}
      className="crossfade-live-preview"
      aria-hidden
      title={`Плавный переход ${(blend.amount * 100).toFixed(0)}%`}
    />
  );
}
