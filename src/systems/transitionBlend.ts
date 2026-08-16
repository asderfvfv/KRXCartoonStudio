import type { MontageTransitionType } from "../domain/montageTransitions";

/**
 * Composite A→B frames with a montage transition.
 * amount 0 = only from, 1 = only to.
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
  const t = Math.min(1, Math.max(0, amount));
  target.width = width;
  target.height = height;
  const ctx = target.getContext("2d");
  if (!ctx) throw new Error("Переход: 2D canvas недоступен.");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, width, height);

  switch (kind) {
    case "cut":
      ctx.drawImage(t < 0.5 ? from : to, 0, 0, width, height);
      break;
    case "crossfade":
      drawCrossfade(ctx, from, to, t, width, height);
      break;
    case "fadeBlack":
      drawFadeColor(ctx, from, to, t, width, height, "#000000");
      break;
    case "fadeWhite":
      drawFadeColor(ctx, from, to, t, width, height, "#ffffff");
      break;
    case "wipeLeft":
      drawWipe(ctx, from, to, t, width, height, "left");
      break;
    case "wipeRight":
      drawWipe(ctx, from, to, t, width, height, "right");
      break;
    case "wipeUp":
      drawWipe(ctx, from, to, t, width, height, "up");
      break;
    case "wipeDown":
      drawWipe(ctx, from, to, t, width, height, "down");
      break;
    case "slideLeft":
      drawSlide(ctx, from, to, t, width, height, "left");
      break;
    case "slideRight":
      drawSlide(ctx, from, to, t, width, height, "right");
      break;
    case "pushLeft":
      drawPush(ctx, from, to, t, width, height);
      break;
    case "zoomIn":
      drawZoomIn(ctx, from, to, t, width, height);
      break;
    case "zoomOut":
      drawZoomOut(ctx, from, to, t, width, height);
      break;
    case "flash":
      drawFlash(ctx, from, to, t, width, height);
      break;
    case "circleOpen":
      drawCircle(ctx, from, to, t, width, height, "open");
      break;
    case "circleClose":
      drawCircle(ctx, from, to, t, width, height, "close");
      break;
    default:
      drawCrossfade(ctx, from, to, t, width, height);
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawCrossfade(
  ctx: CanvasRenderingContext2D,
  from: CanvasImageSource,
  to: CanvasImageSource,
  t: number,
  width: number,
  height: number,
): void {
  ctx.drawImage(from, 0, 0, width, height);
  if (t > 0.0001) {
    ctx.globalAlpha = t;
    ctx.drawImage(to, 0, 0, width, height);
    ctx.globalAlpha = 1;
  }
}

function drawFadeColor(
  ctx: CanvasRenderingContext2D,
  from: CanvasImageSource,
  to: CanvasImageSource,
  t: number,
  width: number,
  height: number,
  color: string,
): void {
  if (t < 0.5) {
    const u = t * 2;
    ctx.drawImage(from, 0, 0, width, height);
    ctx.globalAlpha = u;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  } else {
    const u = (t - 0.5) * 2;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = u;
    ctx.drawImage(to, 0, 0, width, height);
    ctx.globalAlpha = 1;
  }
}

function drawWipe(
  ctx: CanvasRenderingContext2D,
  from: CanvasImageSource,
  to: CanvasImageSource,
  t: number,
  width: number,
  height: number,
  dir: "left" | "right" | "up" | "down",
): void {
  ctx.drawImage(from, 0, 0, width, height);
  ctx.save();
  ctx.beginPath();
  if (dir === "left") ctx.rect(0, 0, width * t, height);
  else if (dir === "right") ctx.rect(width * (1 - t), 0, width * t, height);
  else if (dir === "up") ctx.rect(0, height * (1 - t), width, height * t);
  else ctx.rect(0, 0, width, height * t);
  ctx.clip();
  ctx.drawImage(to, 0, 0, width, height);
  ctx.restore();
}

function drawSlide(
  ctx: CanvasRenderingContext2D,
  from: CanvasImageSource,
  to: CanvasImageSource,
  t: number,
  width: number,
  height: number,
  dir: "left" | "right",
): void {
  ctx.drawImage(from, 0, 0, width, height);
  const x = dir === "left" ? -width * (1 - t) : width * (1 - t);
  ctx.drawImage(to, x, 0, width, height);
}

function drawPush(
  ctx: CanvasRenderingContext2D,
  from: CanvasImageSource,
  to: CanvasImageSource,
  t: number,
  width: number,
  height: number,
): void {
  const shift = width * t;
  ctx.drawImage(from, -shift, 0, width, height);
  ctx.drawImage(to, width - shift, 0, width, height);
}

function drawZoomIn(
  ctx: CanvasRenderingContext2D,
  from: CanvasImageSource,
  to: CanvasImageSource,
  t: number,
  width: number,
  height: number,
): void {
  ctx.drawImage(from, 0, 0, width, height);
  const scale = 0.15 + 0.85 * t;
  const w = width * scale;
  const h = height * scale;
  const x = (width - w) / 2;
  const y = (height - h) / 2;
  ctx.globalAlpha = Math.min(1, t * 1.35);
  ctx.drawImage(to, x, y, w, h);
  ctx.globalAlpha = 1;
}

function drawZoomOut(
  ctx: CanvasRenderingContext2D,
  from: CanvasImageSource,
  to: CanvasImageSource,
  t: number,
  width: number,
  height: number,
): void {
  ctx.drawImage(to, 0, 0, width, height);
  const scale = 1 + t * 0.85;
  const w = width * scale;
  const h = height * scale;
  const x = (width - w) / 2;
  const y = (height - h) / 2;
  ctx.globalAlpha = 1 - t;
  ctx.drawImage(from, x, y, w, h);
  ctx.globalAlpha = 1;
}

function drawFlash(
  ctx: CanvasRenderingContext2D,
  from: CanvasImageSource,
  to: CanvasImageSource,
  t: number,
  width: number,
  height: number,
): void {
  ctx.drawImage(t < 0.5 ? from : to, 0, 0, width, height);
  const flash = t < 0.5 ? t * 2 : (1 - t) * 2;
  ctx.globalAlpha = Math.min(1, flash);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;
}

function drawCircle(
  ctx: CanvasRenderingContext2D,
  from: CanvasImageSource,
  to: CanvasImageSource,
  t: number,
  width: number,
  height: number,
  mode: "open" | "close",
): void {
  const maxR = Math.hypot(width, height) * 0.55;
  const cx = width / 2;
  const cy = height / 2;
  if (mode === "open") {
    ctx.drawImage(from, 0, 0, width, height);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * t, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(to, 0, 0, width, height);
    ctx.restore();
  } else {
    ctx.drawImage(to, 0, 0, width, height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.arc(cx, cy, maxR * (1 - t), 0, Math.PI * 2, true);
    ctx.clip();
    ctx.drawImage(from, 0, 0, width, height);
    ctx.restore();
  }
}
