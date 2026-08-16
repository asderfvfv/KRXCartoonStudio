/** DemoBot / AudioBeast part filenames — not stage props. */
const RIG_PART_ASSET_NAMES = new Set([
  "body", "head", "eye", "eye-left", "eye-right", "mouth",
  "arm", "arm-left", "arm-right", "hand", "hand-left", "hand-right",
  "leg", "leg-left", "leg-right", "clothes", "одежда",
  "тело", "туловище", "торс", "корпус",
  "голова", "башка", "башк", "головашка", "морда", "лицо",
  "рот", "губы", "пасть",
  "глаз", "око",
  "рука", "ручина", "кисть", "ладонь",
  "нога", "стопа",
]);

export function isRigPartAssetName(name: string): boolean {
  const key = name.trim().toLowerCase().replace(/[_\s.]+/g, "-");
  if (RIG_PART_ASSET_NAMES.has(key)) return true;
  if (RIG_PART_ASSET_NAMES.has(name.trim().toLowerCase())) return true;
  return /(?:^|[-_])(body|head|eye|mouth|arm|hand|leg|clothes|тело|голова|башка|рот|глаз|рука|нога|кисть)([-_]|$)/i.test(key);
}

export function isDemoBotAssetPath(path: string, name = ""): boolean {
  return /demobot|builtin:\/\/demobot/i.test(`${path} ${name}`);
}
