import type { CreatorSlotId } from "./characterCreator";

/** Minimal ImageData-like buffer (testable without DOM). */
export interface RgbaImage {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface SheetBlob {
  id: string;
  /** Inclusive pixel bounds in source image. */
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  /** width / height */
  aspect: number;
  cx: number;
  cy: number;
}

export interface SliceOptions {
  /** Max RGB luminance treated as background when alpha is high (0–255). Default 28. */
  bgThreshold?: number;
  /** Alpha below this = background. Default 12. */
  alphaThreshold?: number;
  /** Drop blobs smaller than this pixel count. Default auto from image size. */
  minArea?: number;
  /** Extra pixels around each crop. Default 2. */
  padding?: number;
  /** Max blobs to keep (largest first). Default 24. */
  maxBlobs?: number;
}

export interface SheetCropSpec {
  blob: SheetBlob;
  suggestedSlot: CreatorSlotId | null;
}

const DEFAULT_BG = 28;
const DEFAULT_ALPHA = 12;

export function isForegroundPixel(
  r: number,
  g: number,
  b: number,
  a: number,
  bgThreshold = DEFAULT_BG,
  alphaThreshold = DEFAULT_ALPHA,
): boolean {
  if (a < alphaThreshold) return false;
  // Near-black sheet background (PrismGecko-style)
  const luma = (r * 299 + g * 587 + b * 114) / 1000;
  if (luma <= bgThreshold && a > 200) return false;
  // Also treat very dark nearly-transparent as bg
  if (luma <= bgThreshold && a < 40) return false;
  return true;
}

function pixelIndex(x: number, y: number, width: number): number {
  return (y * width + x) * 4;
}

/**
 * Connected-component blob detection (4-connected) on near-black / transparent background.
 */
export function detectSheetBlobs(image: RgbaImage, options: SliceOptions = {}): SheetBlob[] {
  const { width, height, data } = image;
  const bgThreshold = options.bgThreshold ?? DEFAULT_BG;
  const alphaThreshold = options.alphaThreshold ?? DEFAULT_ALPHA;
  const minArea = options.minArea
    ?? Math.max(48, Math.floor((width * height) * 0.00015));
  const maxBlobs = options.maxBlobs ?? 24;

  const visited = new Uint8Array(width * height);
  const blobs: SheetBlob[] = [];
  let blobSerial = 0;

  const isFg = (x: number, y: number): boolean => {
    const i = pixelIndex(x, y, width);
    return isForegroundPixel(data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!, bgThreshold, alphaThreshold);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (visited[start]) continue;
      if (!isFg(x, y)) {
        visited[start] = 1;
        continue;
      }

      // BFS
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let area = 0;
      const queueX: number[] = [x];
      const queueY: number[] = [y];
      visited[start] = 1;
      let qi = 0;

      while (qi < queueX.length) {
        const cx = queueX[qi]!;
        const cy = queueY[qi]!;
        qi += 1;
        area += 1;
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;

        const neighbors = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ] as const;
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (visited[ni]) continue;
          visited[ni] = 1;
          if (!isFg(nx, ny)) continue;
          queueX.push(nx);
          queueY.push(ny);
        }
      }

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      // Reject hairline noise
      if (area < minArea || bw < 3 || bh < 3) continue;

      blobSerial += 1;
      blobs.push({
        id: `blob-${blobSerial}`,
        x: minX,
        y: minY,
        width: bw,
        height: bh,
        area,
        aspect: bw / Math.max(1, bh),
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2,
      });
    }
  }

  blobs.sort((a, b) => b.area - a.area);
  return blobs.slice(0, maxBlobs);
}

/** Copy RGBA crop with optional padding (clamped to image). Transparent outside fg not required — full bbox. */
export function extractCropRgba(
  image: RgbaImage,
  blob: SheetBlob,
  padding = 2,
): { width: number; height: number; data: Uint8ClampedArray } {
  const x0 = Math.max(0, blob.x - padding);
  const y0 = Math.max(0, blob.y - padding);
  const x1 = Math.min(image.width - 1, blob.x + blob.width - 1 + padding);
  const y1 = Math.min(image.height - 1, blob.y + blob.height - 1 + padding);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = x0 + x;
      const sy = y0 + y;
      const si = pixelIndex(sx, sy, image.width);
      const di = (y * w + x) * 4;
      out[di] = image.data[si]!;
      out[di + 1] = image.data[si + 1]!;
      out[di + 2] = image.data[si + 2]!;
      out[di + 3] = image.data[si + 3]!;
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Conservative slot suggestions for scattered part sheets (PrismGecko-style).
 * Prefer leaving slots empty over wrong guesses. Largest → body; densest mid-large → head;
 * similar pair → eyes; wide short → mouth; cluster of mid paws → limbs. No forced «одежда».
 */
export function suggestSlotAssignments(blobs: SheetBlob[]): Map<string, CreatorSlotId | null> {
  const result = new Map<string, CreatorSlotId | null>();
  for (const blob of blobs) result.set(blob.id, null);
  if (!blobs.length) return result;

  const fill = (b: SheetBlob) => b.area / Math.max(1, b.width * b.height);
  const sorted = [...blobs].sort((a, b) => b.area - a.area);
  const body = sorted[0]!;
  result.set(body.id, "body");

  const minUseful = Math.max(64, Math.floor(body.area * 0.03));
  const pool = sorted.slice(1).filter((b) => b.area >= minUseful);

  // Head: among larger leftovers, prefer solid (high fill) + near-square — not curly tail.
  let bestHead: SheetBlob | null = null;
  let bestHeadScore = -1;
  for (const blob of pool.slice(0, 6)) {
    const aspectOk = blob.aspect >= 0.6 && blob.aspect <= 1.45 ? 1
      : blob.aspect >= 0.5 && blob.aspect <= 1.75 ? 0.35
        : 0.08;
    const score = blob.area * (0.35 + fill(blob)) * aspectOk;
    if (score > bestHeadScore) {
      bestHeadScore = score;
      bestHead = blob;
    }
  }
  if (bestHead) result.set(bestHead.id, "head");

  const unused = () => pool.filter((b) => !result.get(b.id));

  // Eyes: closest-area pair, medium size, reasonably round, solid fill.
  const eyeCandidates = unused().filter((b) => (
    b.area < body.area * 0.4
    && b.area >= body.area * 0.02
    && b.aspect >= 0.55
    && b.aspect <= 1.9
    && fill(b) >= 0.25
  ));
  if (eyeCandidates.length >= 2) {
    let bestI = 0;
    let bestJ = 1;
    let bestScore = Infinity;
    for (let i = 0; i < eyeCandidates.length; i += 1) {
      for (let j = i + 1; j < eyeCandidates.length; j += 1) {
        const a = eyeCandidates[i]!;
        const b = eyeCandidates[j]!;
        const areaDiff = Math.abs(a.area - b.area) / Math.max(a.area, b.area);
        if (areaDiff > 0.45) continue;
        const score = areaDiff + Math.abs(a.aspect - b.aspect) * 0.5 + Math.abs(fill(a) - fill(b));
        if (score < bestScore) {
          bestScore = score;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestScore < Infinity) {
      const e1 = eyeCandidates[bestI]!;
      const e2 = eyeCandidates[bestJ]!;
      const left = e1.cx <= e2.cx ? e1 : e2;
      const right = e1.cx <= e2.cx ? e2 : e1;
      result.set(left.id, "eyeLeft");
      result.set(right.id, "eyeRight");
    }
  }

  // Mouth: wide and short (open mouth), not a thin line sparkle.
  const mouth = unused()
    .filter((b) => b.aspect >= 1.25 && b.aspect <= 4 && b.height >= 8 && b.area >= minUseful * 0.5)
    .sort((a, b) => (b.area * fill(b)) - (a.area * fill(a)))[0];
  if (mouth) result.set(mouth.id, "mouth");

  // Limbs / paws: mid-size similar blobs (don't dump sparkles into arms).
  const limbPool = unused()
    .filter((b) => (
      b.area >= body.area * 0.045
      && b.area <= body.area * 0.42
      && b.aspect >= 0.4
      && b.aspect <= 1.55
      && fill(b) >= 0.22
    ))
    .sort((a, b) => a.cx - b.cx || a.cy - b.cy);

  const limbSlots: CreatorSlotId[] = ["legLeft", "legRight", "armLeft", "armRight"];
  // Prefer a tight area cluster (same-size paws) when possible.
  let limbs = limbPool;
  if (limbPool.length >= 3) {
    const byArea = [...limbPool].sort((a, b) => a.area - b.area);
    let bestStart = 0;
    let bestLen = 1;
    for (let i = 0; i < byArea.length; i += 1) {
      let j = i;
      while (
        j + 1 < byArea.length
        && byArea[j + 1]!.area <= byArea[i]!.area * 1.55
      ) j += 1;
      const len = j - i + 1;
      if (len > bestLen) {
        bestLen = len;
        bestStart = i;
      }
    }
    if (bestLen >= 3) {
      limbs = byArea.slice(bestStart, bestStart + Math.min(bestLen, 4))
        .sort((a, b) => a.cx - b.cx || a.cy - b.cy);
    }
  }

  for (let i = 0; i < limbs.length && i < limbSlots.length; i += 1) {
    result.set(limbs[i]!.id, limbSlots[i]!);
  }

  // Never auto-assign sparkles / leftovers to clothes or hands — user picks manually.
  return result;
}

export function buildCropSpecs(blobs: SheetBlob[]): SheetCropSpec[] {
  const suggestions = suggestSlotAssignments(blobs);
  return blobs.map((blob) => ({
    blob,
    suggestedSlot: suggestions.get(blob.id) ?? null,
  }));
}

/** Build a synthetic black canvas with solid colored rects (for tests). */
export function makeTestSheet(
  width: number,
  height: number,
  rects: Array<{ x: number; y: number; w: number; h: number; color?: [number, number, number, number] }>,
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  // black opaque bg
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0;
    data[i + 1] = 0;
    data[i + 2] = 0;
    data[i + 3] = 255;
  }
  for (const rect of rects) {
    const [r, g, b, a] = rect.color ?? [80, 160, 220, 255];
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const i = pixelIndex(x, y, width);
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = a;
      }
    }
  }
  return { data, width, height };
}
