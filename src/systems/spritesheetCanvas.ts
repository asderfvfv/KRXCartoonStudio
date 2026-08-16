import {
  detectSheetBlobs,
  extractCropRgba,
  buildCropSpecs,
  type RgbaImage,
  type SheetBlob,
  type SliceOptions,
  type SheetCropSpec,
} from "../domain/spritesheetSlice";
import type { CreatorSlotId } from "../domain/characterCreator";

export interface PreparedSheetCrop {
  id: string;
  blob: SheetBlob;
  suggestedSlot: CreatorSlotId | null;
  width: number;
  height: number;
  /** PNG data URL for preview + optional persist. */
  dataUrl: string;
  pngBytes: Uint8Array;
}

export interface PreparedSheetSlice {
  sourceName: string;
  sourcePreviewUrl: string;
  crops: PreparedSheetCrop[];
  specs: SheetCropSpec[];
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) reject(new Error("Не удалось закодировать PNG."));
      else resolve(value);
    }, "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export async function loadUrlToRgba(url: string): Promise<{ image: RgbaImage; previewUrl: string; bitmap: ImageBitmap }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Не удалось прочитать PNG (${response.status}).`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    throw new Error("2D canvas недоступен.");
  }
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const previewUrl = canvas.toDataURL("image/png");
  return {
    image: { data: imageData.data, width: imageData.width, height: imageData.height },
    previewUrl,
    bitmap,
  };
}

export async function prepareSpritesheetSlice(
  sourceUrl: string,
  sourceName: string,
  options: SliceOptions = {},
): Promise<PreparedSheetSlice> {
  const loaded = await loadUrlToRgba(sourceUrl);
  try {
    const blobs = detectSheetBlobs(loaded.image, options);
    if (!blobs.length) {
      throw new Error(
        "Не нашёл отдельные части на листе. Нужен тёмный/прозрачный фон и разнесённые куски (не одна цельная фигура). Попробуйте слайдер чувствительности.",
      );
    }
    const specs = buildCropSpecs(blobs);
    const padding = options.padding ?? 2;
    const crops: PreparedSheetCrop[] = [];
    for (const spec of specs) {
      const crop = extractCropRgba(loaded.image, spec.blob, padding);
      const canvas = document.createElement("canvas");
      canvas.width = crop.width;
      canvas.height = crop.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2D canvas недоступен.");
      const imageData = new ImageData(new Uint8ClampedArray(crop.data), crop.width, crop.height);
      ctx.putImageData(imageData, 0, 0);
      const pngBytes = await canvasToPngBytes(canvas);
      const dataUrl = canvas.toDataURL("image/png");
      crops.push({
        id: spec.blob.id,
        blob: spec.blob,
        suggestedSlot: spec.suggestedSlot,
        width: crop.width,
        height: crop.height,
        dataUrl,
        pngBytes,
      });
    }
    return {
      sourceName,
      sourcePreviewUrl: loaded.previewUrl,
      crops,
      specs,
    };
  } finally {
    loaded.bitmap.close();
  }
}
