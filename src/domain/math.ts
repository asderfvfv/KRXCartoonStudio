import type { RigPart, Transform, Vec2 } from "./types";

export interface Matrix2D { a: number; b: number; c: number; d: number; tx: number; ty: number }

export const identityMatrix = (): Matrix2D => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });

export function multiply(a: Matrix2D, b: Matrix2D): Matrix2D {
  return {
    a: a.a * b.a + a.c * b.b, b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d, d: a.b * b.c + a.d * b.d,
    tx: a.a * b.tx + a.c * b.ty + a.tx, ty: a.b * b.tx + a.d * b.ty + a.ty,
  };
}

export function localMatrix(transform: Transform, pivot: Vec2): Matrix2D {
  const radians = transform.rotation * Math.PI / 180;
  const cos = Math.cos(radians); const sin = Math.sin(radians);
  const a = cos * transform.scaleX; const b = sin * transform.scaleX;
  const c = -sin * transform.scaleY; const d = cos * transform.scaleY;
  return { a, b, c, d, tx: transform.x - pivot.x * a - pivot.y * c, ty: transform.y - pivot.x * b - pivot.y * d };
}

export function worldMatrix(partId: string, parts: RigPart[]): Matrix2D {
  const part = parts.find((candidate) => candidate.id === partId);
  if (!part) return identityMatrix();
  const local = localMatrix(part.transform, part.pivot);
  return part.parentId ? multiply(worldMatrix(part.parentId, parts), local) : local;
}

export function transformPoint(matrix: Matrix2D, point: Vec2): Vec2 {
  return { x: matrix.a * point.x + matrix.c * point.y + matrix.tx, y: matrix.b * point.x + matrix.d * point.y + matrix.ty };
}

export function invertMatrix(matrix: Matrix2D): Matrix2D {
  const det = matrix.a * matrix.d - matrix.b * matrix.c;
  if (Math.abs(det) < 1e-8) return identityMatrix();
  const invDet = 1 / det;
  return {
    a: matrix.d * invDet,
    b: -matrix.b * invDet,
    c: -matrix.c * invDet,
    d: matrix.a * invDet,
    tx: (matrix.c * matrix.ty - matrix.d * matrix.tx) * invDet,
    ty: (matrix.b * matrix.tx - matrix.a * matrix.ty) * invDet,
  };
}

export function angleDeg(from: Vec2, to: Vec2): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Local bone tip from pivot along +Y (cut-out limbs hang downward in bind). */
export function limbTipLocal(part: RigPart, tipLength?: number): Vec2 {
  const length = tipLength ?? Math.max(24, Math.hypot(part.pivot.x, part.pivot.y) * 0.15 + 80);
  // Prefer downward local tip for vertical limbs (pivot near top).
  return { x: part.pivot.x, y: part.pivot.y + length };
}

export function partWorldPoint(partId: string, parts: RigPart[], local: Vec2): Vec2 {
  return transformPoint(worldMatrix(partId, parts), local);
}

export function worldToParentLocal(partId: string, parts: RigPart[], world: Vec2): Vec2 {
  const part = parts.find((item) => item.id === partId);
  if (!part?.parentId) return world;
  return transformPoint(invertMatrix(worldMatrix(part.parentId, parts)), world);
}
