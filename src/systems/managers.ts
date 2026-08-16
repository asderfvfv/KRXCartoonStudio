import type { AssetDefinition, CharacterDefinition, ProjectDocument, RigPart } from "../domain/types";
import { createDefaultProject } from "../domain/defaults";

export class ProjectManager {
  create(name?: string): ProjectDocument { return createDefaultProject(name); }
  serialize(project: ProjectDocument): string { return `${JSON.stringify(project, null, 2)}\n`; }
  deserialize(source: string): ProjectDocument {
    const parsed: unknown = JSON.parse(source);
    if (!parsed || typeof parsed !== "object" || (parsed as { version?: unknown }).version !== 1) throw new Error("Неизвестная версия проекта.");
    return parsed as ProjectDocument;
  }
}
export class SceneManager { constructor(public objects: ProjectDocument["sceneObjects"]) {} }
export class AssetManager { constructor(public assets: AssetDefinition[]) {} find(id: string) { return this.assets.find((asset) => asset.id === id); } }
export class CharacterManager {
  serialize(character: CharacterDefinition): string { return `${JSON.stringify(character, null, 2)}\n`; }
  deserialize(source: string): CharacterDefinition {
    const parsed: unknown = JSON.parse(source);
    if (!parsed || typeof parsed !== "object" || (parsed as { version?: unknown }).version !== 1) throw new Error("Неизвестная версия Character Rig.");
    return parsed as CharacterDefinition;
  }
}
export class TimelineCore { constructor(public time = 0) {} setTime(time: number) { this.time = Math.max(0, time); } }
export class SelectionSystem { selectedPartId: string | null = null; select(id: string | null) { this.selectedPartId = id; } }
export class TransformSystem { reset(part: RigPart): RigPart { return { ...part, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } }; } }
