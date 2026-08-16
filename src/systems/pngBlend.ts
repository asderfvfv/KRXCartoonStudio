import type { MontageTransitionType } from "../domain/montageTransitions";
import { blendCanvasFrames as blendCanvasFramesWithKind } from "./transitionBlend";

/**
 * Alpha-blend / transition-composite two frames (A → B) onto `target`.
 * amount 0 = only A, 1 = only B.
 */
export function blendCanvasFrames(
  from: CanvasImageSource,
  to: CanvasImageSource,
  amount: number,
  target: HTMLCanvasElement,
  width: number,
  height: number,
  kind: MontageTransitionType = "crossfade",
): void {
  blendCanvasFramesWithKind(from, to, amount, target, width, height, kind);
}

/**
 * Composite two PNG frames (A → B). amount 0 = only A, 1 = only B.
 * Uses browser Canvas (Electron renderer / export path).
 */
export async function blendPngBytes(
  fromPng: Uint8Array,
  toPng: Uint8Array,
  amount: number,
  kind: MontageTransitionType = "crossfade",
): Promise<Uint8Array> {
  const t = Math.min(1, Math.max(0, amount));
  if (kind === "cut") return t < 0.5 ? fromPng : toPng;
  if (kind === "crossfade") {
    if (t <= 0.0001) return fromPng;
    if (t >= 0.9999) return toPng;
  }

  const fromBitmap = await decodePng(fromPng);
  const toBitmap = await decodePng(toPng);
  const width = fromBitmap.width;
  const height = fromBitmap.height;
  if (toBitmap.width !== width || toBitmap.height !== height) {
    fromBitmap.close();
    toBitmap.close();
    throw new Error(`Переход: размер кадров не совпадает (${width}×${height} vs ${toBitmap.width}×${toBitmap.height}).`);
  }

  const canvas = document.createElement("canvas");
  try {
    blendCanvasFrames(fromBitmap, toBitmap, t, canvas, width, height, kind);
  } finally {
    fromBitmap.close();
    toBitmap.close();
  }

  const blob = await canvasToPngBlob(canvas);
  return new Uint8Array(await blob.arrayBuffer());
}

async function decodePng(bytes: Uint8Array): Promise<ImageBitmap> {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([copy], { type: "image/png" });
  return createImageBitmap(blob);
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("Переход: не удалось закодировать PNG."));
      else resolve(blob);
    }, "image/png");
  });
}
