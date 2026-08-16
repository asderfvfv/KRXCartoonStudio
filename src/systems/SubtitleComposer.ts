import {
  createDefaultSubtitleSettings,
  getActiveSubtitleText,
  wrapSubtitleLines,
  type SubtitleSettings,
} from "../domain/audio";
import type { Actor, Scene } from "../domain/types";

export interface SubtitleDrawRequest {
  scene: Scene;
  timeSeconds: number;
  width: number;
  height: number;
  actors?: Actor[];
  settings?: SubtitleSettings | null;
}

/** Draw styled word-wrapped subtitles onto a 2D canvas (export / compose). */
export function drawSubtitlesOnCanvas(
  ctx: CanvasRenderingContext2D,
  request: SubtitleDrawRequest,
): boolean {
  const settings = createDefaultSubtitleSettings(request.settings ?? request.scene.subtitleSettings);
  const raw = getActiveSubtitleText(request.scene.dialogues, request.timeSeconds, {
    showSpeaker: settings.showSpeaker,
    actors: request.actors ?? request.scene.actors,
  });
  if (!raw) return false;

  const fontSize = Math.max(16, settings.fontSize);
  const bottom = Math.max(24, settings.bottomOffset);
  const maxWidth = request.width * Math.max(0.4, Math.min(0.98, settings.maxWidthPct));
  const lines = wrapSubtitleLines(raw, settings.maxCharsPerLine);
  if (!lines.length) return false;

  ctx.save();
  ctx.font = `bold ${fontSize}px "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lineHeight = fontSize * 1.28;
  const blockHeight = lines.length * lineHeight + 16;
  const blockWidth = Math.min(
    maxWidth,
    Math.max(...lines.map((line) => ctx.measureText(line).width)) + 28,
  );
  const centerX = request.width / 2;
  const bottomY = request.height - bottom;
  const topY = bottomY - blockHeight;

  if (settings.backgroundEnabled) {
    const alpha = Math.max(0, Math.min(1, settings.backgroundOpacity));
    ctx.fillStyle = hexToRgba(settings.backgroundColor, alpha);
    roundRect(ctx, centerX - blockWidth / 2, topY, blockWidth, blockHeight, 8);
    ctx.fill();
  }

  ctx.lineWidth = Math.max(2, Math.round(fontSize / 12));
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.fillStyle = settings.textColor || "#ffffff";
  lines.forEach((line, index) => {
    const y = topY + 8 + lineHeight * (index + 0.5);
    ctx.strokeText(line, centerX, y, maxWidth);
    ctx.fillText(line, centerX, y, maxWidth);
  });
  ctx.restore();
  return true;
}

function hexToRgba(color: string, alpha: number): string {
  const raw = color.trim();
  if (raw.startsWith("rgba") || raw.startsWith("rgb")) return raw;
  const hex = raw.replace("#", "");
  const full = hex.length === 3
    ? hex.split("").map((ch) => ch + ch).join("")
    : hex.padEnd(6, "0").slice(0, 6);
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if (![r, g, b].every((value) => Number.isFinite(value))) return `rgba(0,0,0,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
