import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_SCHEMA_VERSION,
  PARTFORGE_SCHEMA_VERSION,
  attachmentDrawScale,
  attachmentFromPreset,
  attachmentLibrary,
  createEmptyAttachment,
  createLibraryAttachmentAsset,
  createPresetFromAttachment,
  duplicateAttachment,
  isAttachmentVisibleAt,
  resolveAttachmentSocket,
  validateAttachment,
} from "../src/domain/attachments";
import { createDefaultProject } from "../src/domain/defaults";
import { migrateProject } from "../src/domain/migration";
import { findPartByRole } from "../src/domain/semantic";

describe("Stage 8 attachments", () => {
  it("builds library assets and resolves sockets by type", () => {
    const hat = attachmentLibrary.find((item) => item.kind === "hat")!;
    const asset = createLibraryAttachmentAsset(hat, "#3fa5b6");
    expect(asset.path.startsWith("data:image/svg+xml")).toBe(true);
    expect(asset.width).toBe(120);

    const project = migrateProject(createDefaultProject());
    const character = project.characters[0];
    const attachment = createEmptyAttachment({
      id: "a1",
      name: "Hat",
      actorId: "actor-hero",
      assetId: asset.id,
      socketType: "HeadTop",
      kind: "hat",
    });
    expect(validateAttachment(attachment).ok).toBe(true);
    const socket = resolveAttachmentSocket(character, attachment);
    expect(socket?.type).toBe("HeadTop");
    expect(socket?.partId).toBe(findPartByRole(character, "Head")?.id);
  });

  it("migrates attachments array and schema >= 6", () => {
    const old = createDefaultProject("Attach Legacy");
    delete (old as { schemaVersion?: unknown }).schemaVersion;
    for (const scene of old.scenes ?? []) delete scene.attachments;
    const migrated = migrateProject(old);
    expect(migrated.schemaVersion).toBeGreaterThanOrEqual(ATTACHMENT_SCHEMA_VERSION);
    expect(migrated.scenes?.[0].attachments).toEqual([]);
  });
});

describe("Stage 10 PartForge", () => {
  it("expands library beyond Stage 8 set", () => {
    expect(attachmentLibrary.length).toBeGreaterThanOrEqual(10);
    expect(attachmentLibrary.some((item) => item.kind === "glasses")).toBe(true);
    expect(attachmentLibrary.some((item) => item.kind === "shield")).toBe(true);
  });

  it("handles flip scale and timed visibility", () => {
    const attachment = createEmptyAttachment({
      id: "a2",
      name: "Sword",
      actorId: "actor",
      assetId: "asset",
      scale: { x: 2, y: 1.5 },
      flipX: true,
      startTime: 1,
      endTime: 3,
    });
    expect(attachmentDrawScale(attachment)).toEqual({ x: -2, y: 1.5 });
    expect(isAttachmentVisibleAt(attachment, 0.5)).toBe(false);
    expect(isAttachmentVisibleAt(attachment, 2)).toBe(true);
    expect(isAttachmentVisibleAt(attachment, 3.1)).toBe(false);
    attachment.visible = false;
    expect(isAttachmentVisibleAt(attachment, 2)).toBe(false);
  });

  it("creates presets and duplicates attachments", () => {
    const source = createEmptyAttachment({
      id: "src",
      name: "Wand",
      actorId: "actor-1",
      assetId: "asset-wand",
      socketType: "HandRight",
      kind: "wand",
      rotation: 15,
    });
    const preset = createPresetFromAttachment(source, "Hero Wand");
    expect(preset.name).toBe("Hero Wand");
    expect(preset.assetId).toBe("asset-wand");
    const applied = attachmentFromPreset(preset, "actor-2");
    expect(applied.actorId).toBe("actor-2");
    expect(applied.rotation).toBe(15);
    expect(applied.id).not.toBe(source.id);
    const copy = duplicateAttachment(source);
    expect(copy.name).toContain("Copy");
    expect(copy.id).not.toBe(source.id);
  });

  it("migrates attachmentPresets and schema >= 8", () => {
    const old = createDefaultProject("PartForge Legacy");
    delete (old as { schemaVersion?: unknown; attachmentPresets?: unknown }).schemaVersion;
    delete (old as { attachmentPresets?: unknown }).attachmentPresets;
    const migrated = migrateProject(old);
    expect(migrated.schemaVersion).toBeGreaterThanOrEqual(PARTFORGE_SCHEMA_VERSION);
    expect(migrated.attachmentPresets).toEqual([]);
  });
});
