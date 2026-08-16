import type { RigPart } from "../domain/types";
import { worldMatrix, type Matrix2D } from "../domain/math";

export class RigSystem {
  constructor(private parts: RigPart[]) {}
  setParts(parts: RigPart[]): void { this.parts = parts; }
  canSetParent(partId: string, parentId: string | null): boolean {
    if (parentId === null) return true;
    if (partId === parentId) return false;
    let cursor: string | null = parentId;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === partId || visited.has(cursor)) return false;
      visited.add(cursor);
      cursor = this.parts.find((part) => part.id === cursor)?.parentId ?? null;
    }
    return true;
  }
  setParent(partId: string, parentId: string | null): RigPart[] {
    if (!this.canSetParent(partId, parentId)) throw new Error("Циклическая parent-зависимость запрещена.");
    return this.parts.map((part) => part.id === partId ? { ...part, parentId } : part);
  }
  getWorldMatrix(partId: string): Matrix2D { return worldMatrix(partId, this.parts); }
}
