import type { BindPose, CharacterDefinition, RigPart, SemanticRole } from "./types";

export const semanticRoles: SemanticRole[] = ["None", "Custom", "Root", "Body", "Head", "EyeLeft", "EyeRight", "Mouth", "ArmLeft", "ArmRight", "HandLeft", "HandRight", "LegLeft", "LegRight", "FootLeft", "FootRight"];

const aliases: Array<[RegExp, SemanticRole]> = [
  [/^(root|character)$/i, "Root"], [/body|torso/i, "Body"], [/head/i, "Head"], [/eye.*left|left.*eye/i, "EyeLeft"], [/eye.*right|right.*eye/i, "EyeRight"], [/mouth/i, "Mouth"],
  [/arm.*left|left.*arm/i, "ArmLeft"], [/arm.*right|right.*arm/i, "ArmRight"], [/hand.*left|left.*hand/i, "HandLeft"], [/hand.*right|right.*hand/i, "HandRight"],
  [/leg.*left|left.*leg/i, "LegLeft"], [/leg.*right|right.*leg/i, "LegRight"], [/foot.*left|left.*foot/i, "FootLeft"], [/foot.*right|right.*foot/i, "FootRight"],
];

export function inferSemanticRole(part: RigPart): SemanticRole {
  return aliases.find(([pattern]) => pattern.test(part.name) || pattern.test(part.id))?.[1] ?? (part.parentId === null ? "Root" : "None");
}

export function findPartByRole(character: CharacterDefinition, role: SemanticRole): RigPart | undefined {
  return character.parts.find((part) => (part.semanticRole ?? inferSemanticRole(part)) === role);
}

export function captureBindPose(character: CharacterDefinition): BindPose {
  return Object.fromEntries(character.parts.map((part) => [part.id, { transform: structuredClone(part.transform), pivot: structuredClone(part.pivot), anchor: structuredClone(part.anchor), opacity: part.opacity }]));
}

export function applyBindPose(character: CharacterDefinition): CharacterDefinition {
  const pose = character.bindPose ?? captureBindPose(character);
  return { ...character, parts: character.parts.map((part) => {
    const base = pose[part.id]; return base ? { ...part, transform: structuredClone(base.transform), pivot: structuredClone(base.pivot), anchor: structuredClone(base.anchor), opacity: base.opacity } : part;
  }) };
}

export function ensureSemanticCharacter(character: CharacterDefinition): CharacterDefinition {
  const parts = character.parts.map((part) => ({ ...part, semanticRole: part.semanticRole ?? inferSemanticRole(part) }));
  const withParts = { ...character, parts, sockets: character.sockets ?? [] };
  return { ...withParts, bindPose: character.bindPose ?? captureBindPose(withParts) };
}
