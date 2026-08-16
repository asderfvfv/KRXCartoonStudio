import { app, BrowserWindow, dialog, ipcMain, screen, shell } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, openSync, readSync, closeSync, readdirSync, statSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VoiceEngineManager, isVoiceEngineInstalled } from "./voiceEngine.js";

import {
  describeRequiredRigParts,
  pickPngForRigSlot,
  type NamedPng,
  type RigPngSlot,
} from "./pngRigAliases.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_VERSION = 1;
const CHARACTER_VERSION = 1;

interface AssetRecord { id: string; name: string; path: string; mediaType: "image/png" | "image/svg+xml"; width: number; height: number }
interface ProjectRecord { version: number; assets: AssetRecord[]; [key: string]: unknown }
interface CharacterRecord { version: number; name: string; assets?: AssetRecord[]; parts: Array<{ assetId: string; [key: string]: unknown }>; [key: string]: unknown }

let ffmpegProcess: ChildProcessWithoutNullStreams | null = null;
let mainWindow: BrowserWindow | null = null;
let exportInProgress = false;
let projectDirty = false;
/** User confirmed quit (or discard) — allow close / skip prompts. */
let quitConfirmed = false;
/** Close dialog already open — ignore re-entrant close events. */
let closePromptOpen = false;
let saveBeforeClosePending = false;
const voiceEngine = new VoiceEngineManager(() => mainWindow);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateProject(value: unknown): asserts value is ProjectRecord {
  if (!isRecord(value) || value.version !== PROJECT_VERSION || !Array.isArray(value.assets) || !Array.isArray(value.characters) || !isRecord(value.canvas)) {
    throw new Error("Повреждённый project.kcsproj или неизвестная версия файла.");
  }
}

function validateCharacter(value: unknown): asserts value is CharacterRecord {
  if (!isRecord(value) || value.version !== CHARACTER_VERSION || typeof value.name !== "string" || !Array.isArray(value.parts)) {
    throw new Error("Повреждённый character.json или неизвестная версия файла.");
  }
}

function isDataUrl(assetPath: string): boolean {
  return assetPath.startsWith("data:");
}

function stripBom(raw: string): string {
  // UTF-8 BOM, UTF-16 BOM leftovers, and leading whitespace/junk before `{`/`[`.
  let text = raw.replace(/^\uFEFF/, "");
  if (text.charCodeAt(0) === 0xfffd) text = text.slice(1);
  const start = text.search(/[\{\[]/);
  if (start > 0) text = text.slice(start);
  return text.trimStart();
}

function parseJsonFile(raw: string): unknown {
  return JSON.parse(stripBom(raw));
}

function readPngSizeSync(filePath: string): { width: number; height: number } {
  const fd = openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(24);
    readSync(fd, buf, 0, 24, 0);
    if (buf[0] !== 0x89 || buf.toString("ascii", 1, 4) !== "PNG") throw new Error(`Не PNG: ${filePath}`);
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } finally {
    closeSync(fd);
  }
}

/** Resolve character root: folder itself or parent of Assets/. */
function resolveCharacterPngRoot(folderAbs: string): string {
  const base = path.basename(folderAbs).toLowerCase();
  if (base === "assets") return path.dirname(folderAbs);
  if (existsSync(path.join(folderAbs, "Assets"))) return folderAbs;
  return folderAbs;
}

function listRigImageFiles(dir: string): NamedPng[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith(".png"))
      .map((name) => ({ path: path.join(dir, name), name }));
  } catch {
    return [];
  }
}

function listPngFiles(dir: string): string[] {
  return listRigImageFiles(dir).map((item) => item.path);
}

/**
 * Build character from a folder of separate part PNGs (not a spritesheet).
 * Looks in folder/ and folder/Assets/. Needs at least body/тело.
 * Filenames: голова, башка, head, рука-левая, arm-right, … (RU/EN).
 */
function buildCharacterFromPngFolder(folderAbs: string, displayName: string): CharacterRecord {
  const root = resolveCharacterPngRoot(folderAbs);
  const assetsDir = path.join(root, "Assets");
  const searchDirs = [assetsDir, root].filter((dir, index, all) => all.indexOf(dir) === index);
  const files = searchDirs.flatMap(listRigImageFiles);
  const used = new Set<string>();

  const take = (slot: RigPngSlot): NamedPng | null => {
    const hit = pickPngForRigSlot(files, slot, used);
    if (hit) used.add(hit.path);
    return hit;
  };

  const bodyFile = take("body");
  if (!bodyFile) {
    const sample = files.map((file) => file.name).slice(0, 12);
    throw new Error(
      `В папке нет туловища (тело / body / торс…).\n`
      + `Нужны отдельные PNG на части: ${describeRequiredRigParts()}.\n`
      + `Один spritesheet целиком не подходит.\n`
      + `Папка: ${root}`
      + (sample.length ? `\nНайдены: ${sample.join(", ")}` : "\nPNG не найдены."),
    );
  }

  const headFile = take("head");
  const eyeLeftFile = take("eye-left");
  const eyeRightFile = pickPngForRigSlot(files, "eye-right", used) ?? eyeLeftFile;
  if (eyeRightFile) used.add(eyeRightFile.path);
  const mouthFile = take("mouth");
  const armLeftFile = take("arm-left");
  const armRightFile = pickPngForRigSlot(files, "arm-right", used) ?? armLeftFile;
  if (armRightFile) used.add(armRightFile.path);
  const legLeftFile = take("leg-left");
  const legRightFile = pickPngForRigSlot(files, "leg-right", used) ?? legLeftFile;
  if (legRightFile) used.add(legRightFile.path);
  const handLeftFile = take("hand-left");
  const handRightFile = pickPngForRigSlot(files, "hand-right", used) ?? handLeftFile;
  if (handRightFile) used.add(handRightFile.path);

  const missing: string[] = [];
  if (!eyeLeftFile) missing.push("глаз / eye");
  if (!mouthFile) missing.push("рот / mouth");
  if (!armLeftFile) missing.push("рука / arm");
  if (!legLeftFile) missing.push("нога / leg");
  if (missing.length) {
    throw new Error(
      `Не хватает частей: ${missing.join(", ")}.\n`
      + `Можно назвать: ${describeRequiredRigParts()}.\n`
      + `Лево/право: рука-левая, arm-right, глаз-п…`,
    );
  }

  const slug = displayName.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "") || "png-hero";
  const prefix = `asset-${slug}`;

  const makeAsset = (id: string, filePath: string): AssetRecord => {
    const size = readPngSizeSync(filePath);
    return {
      id: `${prefix}-${id}`,
      name: id,
      path: filePath,
      mediaType: "image/png",
      width: size.width,
      height: size.height,
    };
  };

  const body = makeAsset("body", bodyFile.path);
  const eyeL = makeAsset("eye-left", eyeLeftFile!.path);
  const eyeR = makeAsset("eye-right", eyeRightFile!.path);
  const mouth = makeAsset("mouth", mouthFile!.path);
  const armL = makeAsset("arm-left", armLeftFile!.path);
  const armR = makeAsset("arm-right", armRightFile!.path);
  const legL = makeAsset("leg-left", legLeftFile!.path);
  const legR = makeAsset("leg-right", legRightFile!.path);
  const head = headFile ? makeAsset("head", headFile.path) : null;
  const handL = handLeftFile ? makeAsset("hand-left", handLeftFile.path) : null;
  const handR = handRightFile ? makeAsset("hand-right", handRightFile.path) : null;

  const assets: AssetRecord[] = [body, eyeL, eyeR, mouth, armL, armR, legL, legR];
  if (head) assets.push(head);
  if (handL) assets.push(handL);
  if (handR) assets.push(handR);

  const bw = body.width;
  const bh = body.height;
  const targetH = 400;
  const s = targetH / bh;
  const bodyX = Math.round((bw * s) / 2);
  const bodyY = Math.round((bh * s) / 2);
  const bcx = bw / 2;
  const bcy = bh / 2;
  const armScale = (bh * 0.52) / armL.height;
  const legScale = (bh * 0.34) / legL.height;
  const eyeScale = (bw * 0.13) / eyeL.width;
  const mouthScale = (bw * 0.32) / mouth.width;

  const part = (
    id: string,
    name: string,
    assetId: string,
    parentId: string | null,
    zIndex: number,
    x: number,
    y: number,
    rotation: number,
    scaleX: number,
    scaleY: number,
    pivotX: number,
    pivotY: number,
    visible: boolean,
    opacity: number,
    semanticRole: string,
  ) => ({
    id,
    name,
    assetId,
    parentId,
    zIndex,
    transform: { x, y, rotation, scaleX, scaleY },
    pivot: { x: pivotX, y: pivotY },
    anchor: { x: 0, y: 0 },
    visible,
    locked: false,
    opacity,
    semanticRole,
  });

  const parts = [
    part("body", "Body", body.id, null, 10, bodyX, bodyY, 0, s, s, Math.round(bcx), Math.round(bcy), true, 1, "Body"),
    head
      ? part("head", "Head", head.id, "body", 20, bcx, bh * 0.08, 0, (bw * 0.55) / head.width, (bw * 0.55) / head.width, head.width / 2, head.height * 0.7, true, 1, "Head")
      : part("head", "Head", body.id, "body", 11, bcx, bh * 0.28, 0, 0.01, 0.01, 1, 1, false, 0, "Head"),
    part("eye-left", "EyeLeft", eyeL.id, head ? "head" : "body", 22, head ? head.width * 0.35 : bcx - bw * 0.16, head ? head.height * 0.42 : bcy - bh * 0.14, 0, eyeScale, eyeScale, eyeL.width / 2, eyeL.height / 2, true, 1, "EyeLeft"),
    part("eye-right", "EyeRight", eyeR.id, head ? "head" : "body", 22, head ? head.width * 0.65 : bcx + bw * 0.16, head ? head.height * 0.42 : bcy - bh * 0.14, 0, eyeScale, eyeScale, eyeR.width / 2, eyeR.height / 2, true, 1, "EyeRight"),
    part("mouth", "Mouth", mouth.id, head ? "head" : "body", 23, head ? head.width * 0.5 : bcx, head ? head.height * 0.72 : bcy + bh * 0.08, 0, mouthScale, mouthScale, mouth.width / 2, mouth.height / 2, true, 1, "Mouth"),
    part("arm-left", "ArmLeft", armL.id, "body", 14, bw * 0.08, bcy - bh * 0.02, -18, armScale, armScale, armL.width * 0.55, armL.height * 0.12, true, 1, "ArmLeft"),
    part("arm-right", "ArmRight", armR.id, "body", 16, bw * 0.92, bcy - bh * 0.02, 18, -armScale, armScale, armR.width * 0.55, armR.height * 0.12, true, 1, "ArmRight"),
    part("leg-left", "LegLeft", legL.id, "body", 6, bcx - bw * 0.2, bh * 0.9, -6, legScale, legScale, legL.width / 2, legL.height * 0.12, true, 1, "LegLeft"),
    part("leg-right", "LegRight", legR.id, "body", 6, bcx + bw * 0.2, bh * 0.9, 6, -legScale, legScale, legR.width / 2, legR.height * 0.12, true, 1, "LegRight"),
  ];

  if (handL) {
    parts.push(part("hand-left", "HandLeft", handL.id, "arm-left", 9, armL.width * 0.5, armL.height * 0.9, 0, 1, 1, handL.width / 2, handL.height * 0.2, true, 1, "HandLeft"));
  }
  if (handR) {
    parts.push(part("hand-right", "HandRight", handR.id, "arm-right", 13, armR.width * 0.5, armR.height * 0.9, 0, 1, 1, handR.width / 2, handR.height * 0.2, true, 1, "HandRight"));
  }

  return {
    version: CHARACTER_VERSION,
    id: `character-${slug}`,
    name: displayName,
    assets,
    parts,
    sockets: [
      { id: "socket-mouth", name: "Mouth", type: "Mouth", partId: "mouth", position: { x: 0, y: 0 } },
      { id: "socket-hand-left", name: "Left Hand", type: "HandLeft", partId: handL ? "hand-left" : "arm-left", position: { x: 0, y: Math.round(armL.height * armScale * 0.75) } },
      { id: "socket-hand-right", name: "Right Hand", type: "HandRight", partId: handR ? "hand-right" : "arm-right", position: { x: 0, y: Math.round(armR.height * armScale * 0.75) } },
    ],
  };
}

function resolveAssetsRoot(): string {
  const candidates = [
    app.isPackaged ? path.join(process.resourcesPath, "Assets") : "",
    path.join(app.getAppPath(), "Assets"),
    path.join(__dirname, "..", "Assets"),
    path.join(process.cwd(), "Assets"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0] ?? path.join(app.getAppPath(), "Assets");
}

function resolvePiperRoots(): string[] {
  return [
    path.join(app.getAppPath(), "Tools", "piper"),
    path.join(process.cwd(), "Tools", "piper"),
    path.join(__dirname, "..", "Tools", "piper"),
    app.isPackaged ? path.join(process.resourcesPath, "Tools", "piper") : "",
    path.join(resolveAssetsRoot(), "TTS", "piper"),
  ].filter(Boolean);
}

function resolvePiperModelsDirs(extraFolders: string[] = []): string[] {
  const dirs: string[] = [];
  for (const root of resolvePiperRoots()) {
    const modelsDir = path.join(root, "models");
    dirs.push(existsSync(modelsDir) ? modelsDir : root);
  }
  for (const folder of extraFolders) {
    const resolved = path.resolve(String(folder || ""));
    if (!resolved || !existsSync(resolved)) continue;
    const nested = path.join(resolved, "models");
    dirs.push(existsSync(nested) ? nested : resolved);
  }
  return [...new Set(dirs)];
}

function inferPiperMeta(base: string): { culture: string; gender: string } {
  const culture = /^ru/i.test(base) ? "ru-RU"
    : /^en/i.test(base) ? "en-US"
      : /^de/i.test(base) ? "de-DE"
        : /^es/i.test(base) ? "es-ES"
          : "und";
  const gender = /dmitri|ruslan|denis|male|alexander|ryan|alan|joe/i.test(base) ? "Male" : "Female";
  return { culture, gender };
}

type PiperVoiceRow = { name: string; culture: string; gender: string; engine: "piper"; modelPath?: string; custom?: boolean };

async function scanPiperModelDir(scanDir: string, custom = false): Promise<PiperVoiceRow[]> {
  if (!existsSync(scanDir)) return [];
  const voices: PiperVoiceRow[] = [];
  try {
    const entries = await fs.readdir(scanDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".onnx")) continue;
      const modelPath = path.join(scanDir, entry.name);
      const base = path.basename(entry.name, ".onnx");
      const meta = inferPiperMeta(base);
      voices.push({
        name: `Piper ${base}`,
        culture: meta.culture,
        gender: meta.gender,
        engine: "piper",
        modelPath,
        custom,
      });
    }
  } catch {
    // ignore
  }
  return voices;
}

function resolveCustomPiperModelsDir(): string {
  return path.join(resolveAssetsRoot(), "TTS", "piper", "models");
}


function resolveCharactersRoot(): string {
  const candidates = [
    app.isPackaged ? path.join(process.resourcesPath, "Characters") : "",
    path.join(app.getAppPath(), "Characters"),
    path.join(__dirname, "..", "Characters"),
    path.join(process.cwd(), "Characters"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0] ?? path.join(app.getAppPath(), "Characters");
}

function resolveAssetPath(assetPath: string, projectPath?: string): string {
  if (isDataUrl(assetPath)) throw new Error("data: URL нельзя разрешить как файловый путь.");
  if (assetPath.startsWith("builtin://")) {
    const relative = assetPath.slice("builtin://".length).replaceAll("/", path.sep);
    return path.join(resolveBuiltinRoot(), relative);
  }
  if (path.isAbsolute(assetPath)) return assetPath;
  if (!projectPath) throw new Error(`Невозможно разрешить относительный asset: ${assetPath}`);
  return path.resolve(path.dirname(projectPath), assetPath);
}

async function materializeAssetFile(assetPath: string, destination: string, projectPath?: string): Promise<void> {
  if (isDataUrl(assetPath)) {
    const comma = assetPath.indexOf(",");
    if (comma < 0) throw new Error("Повреждённый data: URL asset.");
    const meta = assetPath.slice(0, comma);
    const payload = assetPath.slice(comma + 1);
    const buffer = meta.includes(";base64") ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
    await fs.writeFile(destination, buffer);
    return;
  }
  const source = resolveAssetPath(assetPath, projectPath);
  if (path.resolve(source) !== path.resolve(destination)) await fs.copyFile(source, destination);
}

async function normalizeAndWriteProject(document: unknown, targetPath: string, sourceProjectPath?: string): Promise<ProjectRecord> {
  validateProject(document);
  const targetDir = path.dirname(targetPath);
  const assetDir = path.join(targetDir, "Assets");
  const audioDir = path.join(targetDir, "Audio");
  await fs.mkdir(assetDir, { recursive: true });
  await fs.mkdir(audioDir, { recursive: true });
  const normalized = structuredClone(document) as ProjectRecord & { audioAssets?: Array<{ id: string; name: string; path: string; mediaType: string; duration: number }> };
  for (const asset of normalized.assets) {
    if (asset.path.startsWith("builtin://")) continue;
    const extension = isDataUrl(asset.path)
      ? (asset.mediaType === "image/png" ? ".png" : ".svg")
      : path.extname(resolveAssetPath(asset.path, sourceProjectPath)) || (asset.mediaType === "image/png" ? ".png" : ".svg");
    const safeName = `${asset.id}-${(asset.name || asset.id).replace(/[^a-zA-Z0-9._-]/g, "_")}${extension}`;
    const destination = path.join(assetDir, safeName);
    await materializeAssetFile(asset.path, destination, sourceProjectPath);
    asset.path = path.relative(targetDir, destination).replaceAll(path.sep, "/");
  }
  if (Array.isArray(normalized.audioAssets)) {
    for (const asset of normalized.audioAssets) {
      if (!asset.path || asset.path.startsWith("builtin://")) continue;
      const source = resolveAssetPath(asset.path, sourceProjectPath);
      const safeName = `${asset.id}-${path.basename(source).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const destination = path.join(audioDir, safeName);
      if (path.resolve(source) !== path.resolve(destination)) await fs.copyFile(source, destination);
      asset.path = path.relative(targetDir, destination).replaceAll(path.sep, "/");
    }
  }
  await fs.writeFile(targetPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

function projectsDirLayout(): { primary: string; legacy: string[] } {
  const exeDir = path.dirname(process.execPath);
  const repoRoot = path.resolve(__dirname, "..");
  if (app.isPackaged) {
    if (/^win-unpacked$/i.test(path.basename(exeDir))) {
      return {
        primary: path.join(path.dirname(exeDir), "Projects"),
        legacy: [path.join(exeDir, "Projects")],
      };
    }
    return { primary: path.join(exeDir, "Projects"), legacy: [] };
  }
  return { primary: path.join(repoRoot, "Projects"), legacy: [] };
}

function sanitizeProjectFileStem(name: string): string {
  const cleaned = String(name ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 80)
    .trim();
  return cleaned || "project";
}

async function listKcsprojInDir(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".kcsproj"))
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

async function ensureProjectsDir(): Promise<string> {
  const { primary, legacy } = projectsDirLayout();
  await fs.mkdir(primary, { recursive: true });
  for (const legacyDir of legacy) {
    if (!existsSync(legacyDir) || path.resolve(legacyDir) === path.resolve(primary)) continue;
    for (const filePath of await listKcsprojInDir(legacyDir)) {
      const dest = path.join(primary, path.basename(filePath));
      if (existsSync(dest)) continue;
      try {
        const parsed: unknown = parseJsonFile(await fs.readFile(filePath, "utf8"));
        await normalizeAndWriteProject(parsed, dest, filePath);
      } catch {
        // skip broken legacy file
      }
    }
  }
  return primary;
}

async function uniqueProjectFilePath(projectsDir: string, projectName: string): Promise<string> {
  const stem = sanitizeProjectFileStem(projectName);
  let candidate = path.join(projectsDir, `${stem}.kcsproj`);
  let index = 2;
  while (existsSync(candidate)) {
    candidate = path.join(projectsDir, `${stem}-${index}.kcsproj`);
    index += 1;
  }
  return candidate;
}

async function recoverLooseProjects(): Promise<{ projectsDir: string; recovered: Array<{ path: string; name: string }> }> {
  const projectsDir = await ensureProjectsDir();
  const recovered: Array<{ path: string; name: string }> = [];
  const already = new Set((await listKcsprojInDir(projectsDir)).map((item) => path.resolve(item).toLowerCase()));

  const searchDirs = [
    path.join(os.homedir(), "Downloads"),
    path.join(os.homedir(), "Documents"),
    path.join(os.homedir(), "Desktop"),
  ];

  for (const dir of searchDirs) {
    for (const filePath of await listKcsprojInDir(dir)) {
      const resolved = path.resolve(filePath);
      if (already.has(resolved.toLowerCase())) {
        recovered.push({ path: resolved, name: path.basename(resolved, ".kcsproj") });
        continue;
      }
      try {
        const parsed: unknown = parseJsonFile(await fs.readFile(filePath, "utf8"));
        validateProject(parsed);
        const suggested = isRecord(parsed) && typeof parsed.name === "string" && parsed.name.trim()
          ? parsed.name.trim()
          : path.basename(filePath, ".kcsproj");
        const preferred = path.join(projectsDir, `${sanitizeProjectFileStem(suggested)}.kcsproj`);
        if (existsSync(preferred)) {
          already.add(path.resolve(preferred).toLowerCase());
          recovered.push({ path: preferred, name: suggested });
          continue;
        }
        const dest = await uniqueProjectFilePath(projectsDir, suggested);
        await normalizeAndWriteProject(parsed, dest, filePath);
        already.add(path.resolve(dest).toLowerCase());
        recovered.push({ path: dest, name: suggested });
      } catch {
        // skip unreadable / invalid
      }
    }
  }

  for (const filePath of await listKcsprojInDir(projectsDir)) {
    const resolved = path.resolve(filePath);
    if (recovered.some((item) => path.resolve(item.path).toLowerCase() === resolved.toLowerCase())) continue;
    recovered.push({ path: resolved, name: path.basename(resolved, ".kcsproj") });
  }

  return { projectsDir, recovered };
}

async function chooseProjectPath(suggestedName?: string): Promise<string | undefined> {
  const projectsDir = await ensureProjectsDir();
  const stem = sanitizeProjectFileStem(suggestedName || "project");
  const result = await dialog.showSaveDialog({
    title: "Сохранить проект KRX Cartoon Studio",
    defaultPath: path.join(projectsDir, `${stem}.kcsproj`),
    filters: [{ name: "KRX Cartoon Studio Project", extensions: ["kcsproj"] }],
  });
  return result.canceled ? undefined : result.filePath;
}

function dialogStartPath(input?: string): string | undefined {
  if (typeof input !== "string" || !input.trim()) return undefined;
  let target = path.resolve(input.trim());
  if (!existsSync(target)) return undefined;
  try {
    if (statSync(target).isFile()) target = path.dirname(target);
  } catch {
    return undefined;
  }
  return existsSync(target) ? target : undefined;
}

const AUDIO_LIST_EXTS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac"]);
const IMAGE_LIST_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function cachedPngPath(sourcePath: string): string {
  let hash = 2166136261;
  for (let i = 0; i < sourcePath.length; i += 1) hash = Math.imul(hash ^ sourcePath.charCodeAt(i), 16777619);
  const stem = path.basename(sourcePath).replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_").slice(0, 36);
  return path.join(os.tmpdir(), `kcs-png-${stem}-${(hash >>> 0).toString(16)}.png`);
}

async function ensureImagePng(sourcePath: string): Promise<{ path: string; name: string; width: number; height: number }> {
  const ext = path.extname(sourcePath).toLowerCase();
  const name = path.parse(sourcePath).name;
  if (ext === ".png") {
    const size = readPngSizeSync(sourcePath);
    return { path: sourcePath, name, width: size.width, height: size.height };
  }
  const dest = cachedPngPath(sourcePath);
  try {
    const [srcStat, destStat] = await Promise.all([
      fs.stat(sourcePath),
      fs.stat(dest).catch(() => null),
    ]);
    if (destStat && destStat.mtimeMs >= srcStat.mtimeMs && destStat.size > 24) {
      const size = readPngSizeSync(dest);
      return { path: dest, name, width: size.width, height: size.height };
    }
  } catch {
    // transcode
  }
  const video = [".mp4", ".webm", ".mov"].includes(ext);
  await ffmpegStillToPng(sourcePath, dest, video);
  const size = readPngSizeSync(dest);
  return { path: dest, name, width: size.width, height: size.height };
}

function resolveFfmpegPath(): string {
  if (app.isPackaged) {
    const packaged = path.join(process.resourcesPath, "ffmpeg", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
    return packaged;
  }
  try {
    const resolved = require("ffmpeg-static") as string | null;
    if (resolved && typeof resolved === "string") return resolved;
  } catch {
    // fall through
  }
  return "ffmpeg";
}

async function ffmpegAudioToWav(sourcePath: string, destWav: string): Promise<void> {
  const ffmpegPath = resolveFfmpegPath();
  await fs.mkdir(path.dirname(destWav), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, ["-y", "-i", sourcePath, "-ac", "1", "-ar", "24000", destWav], {
      windowsHide: true,
      shell: false,
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0 && existsSync(destWav)) resolve();
      else reject(new Error(stderr.slice(-400) || `FFmpeg не смог прочитать ${path.basename(sourcePath)}`));
    });
  });
}

function cachedWavPath(sourcePath: string): string {
  let hash = 2166136261;
  for (let i = 0; i < sourcePath.length; i += 1) hash = Math.imul(hash ^ sourcePath.charCodeAt(i), 16777619);
  const stem = path.basename(sourcePath).replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_").slice(0, 36);
  return path.join(os.tmpdir(), `kcs-wav-${stem}-${(hash >>> 0).toString(16)}.wav`);
}

async function ensureWavFile(sourcePath: string): Promise<string> {
  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === ".wav") return sourcePath;
  const dest = cachedWavPath(sourcePath);
  try {
    const [srcStat, destStat] = await Promise.all([
      fs.stat(sourcePath),
      fs.stat(dest).catch(() => null),
    ]);
    if (destStat && destStat.mtimeMs >= srcStat.mtimeMs && destStat.size > 44) return dest;
  } catch {
    // transcode
  }
  await ffmpegAudioToWav(sourcePath, dest);
  return dest;
}

function audioMimeFromExt(extension: string): string {
  if (extension === ".wav") return "audio/wav";
  if (extension === ".ogg") return "audio/ogg";
  if (extension === ".m4a" || extension === ".mp4") return "audio/mp4";
  if (extension === ".flac") return "audio/flac";
  return "audio/mpeg";
}

async function ffmpegStillToPng(sourcePath: string, destPng: string, isVideo: boolean): Promise<void> {
  const ffmpegPath = resolveFfmpegPath();
  await fs.mkdir(path.dirname(destPng), { recursive: true });
  const args = isVideo
    ? ["-y", "-ss", "0.25", "-i", sourcePath, "-frames:v", "1", destPng]
    : ["-y", "-i", sourcePath, "-frames:v", "1", destPng];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true, shell: false });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0 && existsSync(destPng)) resolve();
      else reject(new Error(stderr.slice(-400) || `FFmpeg не смог сделать PNG из ${path.basename(sourcePath)}`));
    });
  });
}

function resolveRendererIndex(): string {
  return path.join(__dirname, "..", "dist", "renderer", "index.html");
}

function resolveBuiltinRoot(): string {
  if (app.isPackaged) return path.join(app.getAppPath(), "dist", "renderer");
  return path.join(app.getAppPath(), "public");
}

async function probeMediaDuration(filePath: string): Promise<number> {
  const ffmpegPath = resolveFfmpegPath();
  return await new Promise((resolve) => {
    const child = spawn(ffmpegPath, ["-i", filePath], { windowsHide: true, shell: false });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", () => resolve(1));
    child.on("close", () => {
      const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
      if (!match) { resolve(1); return; }
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      const seconds = Number(match[3]);
      const total = hours * 3600 + minutes * 60 + seconds;
      resolve(Number.isFinite(total) && total > 0 ? total : 1);
    });
  });
}

function assertSafePath(targetPath: string, label: string): string {
  if (typeof targetPath !== "string" || targetPath.trim().length === 0) throw new Error(`${label}: пустой путь.`);
  if (/[\r\n\u0000]/.test(targetPath)) throw new Error(`${label}: недопустимые символы в пути.`);
  return path.resolve(targetPath);
}

function assertPngPath(targetPath: string): string {
  const resolved = assertSafePath(targetPath, "PNG");
  if (path.extname(resolved).toLowerCase() !== ".png") throw new Error("Разрешена запись только PNG-файлов.");
  return resolved;
}

function assertFfmpegArgs(args: unknown): string[] {
  if (!Array.isArray(args) || args.length === 0) throw new Error("Аргументы FFmpeg отсутствуют.");
  if (!args.every((item) => typeof item === "string")) throw new Error("Аргументы FFmpeg должны быть строками.");
  if ((args as string[]).some((item) => /[\r\n\u0000]/.test(item))) throw new Error("Аргументы FFmpeg содержат недопустимые символы.");
  if ((args as string[]).some((item) => item === "-c" || item === "/c" || item === "cmd.exe")) throw new Error("Запрещённые аргументы FFmpeg.");
  return args as string[];
}

function registerIpc(): void {
  ipcMain.handle("project:get-projects-dir", async () => {
    try {
      const pathOut = await ensureProjectsDir();
      return { ok: true, path: pathOut };
    } catch (reason) {
      return { ok: false, error: reason instanceof Error ? reason.message : String(reason) };
    }
  });
  ipcMain.handle("project:recover-recents", async () => {
    try {
      const result = await recoverLooseProjects();
      return { ok: true, projectsDir: result.projectsDir, recovered: result.recovered };
    } catch (reason) {
      return { ok: false, error: reason instanceof Error ? reason.message : String(reason), recovered: [] };
    }
  });
  ipcMain.handle("project:save-new", async (_event, document: unknown, projectName?: string) => {
    const projectsDir = await ensureProjectsDir();
    const filePath = await uniqueProjectFilePath(projectsDir, typeof projectName === "string" ? projectName : "project");
    const data = await normalizeAndWriteProject(document, filePath);
    return { canceled: false, filePath, data };
  });
  ipcMain.handle("project:open", async () => {
    const projectsDir = await ensureProjectsDir();
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      defaultPath: projectsDir,
      filters: [{ name: "KRX Cartoon Studio Project", extensions: ["kcsproj"] }],
    });
    if (result.canceled) return { canceled: true };
    const filePath = result.filePaths[0];
    const parsed: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
    validateProject(parsed);
    return { canceled: false, filePath, data: parsed };
  });
  ipcMain.handle("project:open-path", async (_event, targetPath: unknown) => {
    if (typeof targetPath !== "string" || !targetPath.trim()) return { canceled: true };
    const filePath = assertSafePath(targetPath, "Проект");
    if (path.extname(filePath).toLowerCase() !== ".kcsproj") throw new Error("Открыть можно только файл .kcsproj.");
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`Файл проекта не найден:\n${filePath}`);
    }
    const parsed: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
    validateProject(parsed);
    return { canceled: false, filePath, data: parsed };
  });
  ipcMain.handle("dialog:confirm", async (_event, message: unknown, title?: unknown) => {
    const text = typeof message === "string" ? message : "Подтвердите действие.";
    const heading = typeof title === "string" && title.trim() ? title.trim() : "Подтверждение";
    const parent = BrowserWindow.getFocusedWindow() ?? mainWindow;
    const options = {
      type: "question" as const,
      buttons: ["Удалить", "Отмена"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      title: heading,
      message: text,
    };
    const choice = parent
      ? dialog.showMessageBoxSync(parent, options)
      : dialog.showMessageBoxSync(options);
    return choice === 0;
  });

  ipcMain.handle("voice:status", async () => voiceEngine.status());
  ipcMain.handle("voice:load", async (_event, options?: unknown) => {
    const opts = (typeof options === "object" && options !== null ? options : {}) as { preferCuda?: boolean; t3Model?: string };
    return voiceEngine.load({ preferCuda: opts.preferCuda !== false, t3Model: opts.t3Model ?? "v3" });
  });
  ipcMain.handle("voice:unload", async () => voiceEngine.unload());
  ipcMain.handle("voice:generate", async (_event, payload: unknown) => {
    const p = (typeof payload === "object" && payload !== null ? payload : {}) as Record<string, unknown>;
    const text = String(p.text ?? "").trim();
    if (!text) throw new Error("Текст для озвучки пуст.");
    const languageId = String(p.languageId ?? "ru");
    const outPath = String(p.outPath ?? "");
    if (!outPath) throw new Error("outPath обязателен.");
    const result = await voiceEngine.generate({
      text,
      languageId,
      outPath,
      audioPromptPath: typeof p.audioPromptPath === "string" ? p.audioPromptPath : null,
      emotion: typeof p.emotion === "string" ? p.emotion : "neutral",
      exaggeration: typeof p.exaggeration === "number" ? p.exaggeration : undefined,
      cfgWeight: typeof p.cfgWeight === "number" ? p.cfgWeight : undefined,
      temperature: typeof p.temperature === "number" ? p.temperature : undefined,
      repetitionPenalty: typeof p.repetitionPenalty === "number" ? p.repetitionPenalty : undefined,
      minP: typeof p.minP === "number" ? p.minP : undefined,
      topP: typeof p.topP === "number" ? p.topP : undefined,
    });
    let duration = typeof result.duration === "number" ? result.duration : undefined;
    if (duration == null) {
      try { duration = await probeMediaDuration(outPath); } catch { duration = undefined; }
    }
    return { ok: true, ...result, duration, path: String(result.path ?? outPath) };
  });
  ipcMain.handle("voice:import-reference", async (_event, payload: unknown) => {
    const p = (typeof payload === "object" && payload !== null ? payload : {}) as {
      projectPath?: string;
      voiceName?: string;
      emotion?: string;
    };
    if (!p.projectPath) throw new Error("Сначала сохраните проект (.kcsproj), чтобы Voices/ лежали рядом с ним.");
    const pick = await dialog.showOpenDialog({
      title: "Импорт reference-аудио для голоса",
      properties: ["openFile"],
      filters: [{ name: "Audio", extensions: ["wav", "mp3", "flac", "m4a", "ogg"] }],
    });
    if (pick.canceled || !pick.filePaths[0]) return { canceled: true };
    const copied = await voiceEngine.copyReferenceIntoProject({
      sourcePath: pick.filePaths[0],
      projectPath: String(p.projectPath),
      voiceName: String(p.voiceName ?? "Voice"),
      emotion: String(p.emotion ?? "neutral"),
    });
    return { canceled: false, ...copied };
  });
  ipcMain.handle("voice:prepare-out-path", async (_event, payload: unknown) => {
    const p = (typeof payload === "object" && payload !== null ? payload : {}) as {
      projectPath?: string;
      sceneName?: string;
      characterName?: string;
      takeIndex?: number;
    };
    if (p.projectPath) {
      return {
        ok: true,
        ...(await voiceEngine.ensureDialogueOutPath({
          projectPath: String(p.projectPath),
          sceneName: String(p.sceneName ?? "Scene"),
          characterName: String(p.characterName ?? "Character"),
          takeIndex: Number(p.takeIndex) || 1,
        })),
      };
    }
    const absolutePath = await voiceEngine.createTempOutPath();
    return { ok: true, absolutePath, relativePath: absolutePath };
  });
  ipcMain.handle("voice:run-setup", async () => {
    const root = voiceEngine.getStatus().engineRoot ?? path.join(path.resolve(__dirname, ".."), "voice-engine");
    const script = path.join(root, "setup-voice-engine.ps1");
    if (!existsSync(script)) return { ok: false, error: `Не найден ${script}` };
    const { spawn: spawnPs } = await import("node:child_process");
    spawnPs("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], {
      cwd: root,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    }).unref();
    return { ok: true, script };
  });
  ipcMain.handle("voice:installed", async () => ({ ok: true, installed: isVoiceEngineInstalled() }));
  ipcMain.handle("lipsync:align", async (_event, payload: unknown) => {
    const p = (typeof payload === "object" && payload !== null ? payload : {}) as Record<string, unknown>;
    const text = String(p.text ?? "").trim();
    const audioPath = String(p.audioPath ?? "");
    if (!text) throw new Error("Текст для alignment пуст.");
    if (!audioPath) throw new Error("audioPath обязателен.");
    // Resolve relative project paths
    let resolved = audioPath;
    if (!path.isAbsolute(audioPath) && typeof p.projectPath === "string" && p.projectPath) {
      resolved = resolveAssetPath(audioPath, p.projectPath);
    }
    const result = await voiceEngine.align({
      text,
      audioPath: resolved,
      languageId: typeof p.languageId === "string" ? p.languageId : "ru",
      minCueDuration: typeof p.minCueDuration === "number" ? p.minCueDuration : undefined,
      anticipation: typeof p.anticipation === "number" ? p.anticipation : undefined,
    });
    return { ok: true, ...result };
  });
  ipcMain.handle("lipsync:align-load", async (_event, options?: unknown) => {
    const opts = (typeof options === "object" && options !== null ? options : {}) as { preferCuda?: boolean };
    return voiceEngine.alignLoad(opts.preferCuda !== false);
  });
  ipcMain.handle("lipsync:align-unload", async () => voiceEngine.alignUnload());
  ipcMain.handle("lipsync:align-status", async () => voiceEngine.alignStatus());

  ipcMain.handle("project:save", async (_event, document: unknown, currentPath?: string) => {
    const suggested = isRecord(document) && typeof document.name === "string" ? document.name : undefined;
    const filePath = currentPath ?? await chooseProjectPath(suggested);
    if (!filePath) return { canceled: true };
    const data = await normalizeAndWriteProject(document, filePath, currentPath);
    return { canceled: false, filePath, data };
  });
  ipcMain.handle("project:save-as", async (_event, document: unknown) => {
    const suggested = isRecord(document) && typeof document.name === "string" ? document.name : undefined;
    const filePath = await chooseProjectPath(suggested);
    if (!filePath) return { canceled: true };
    const data = await normalizeAndWriteProject(document, filePath);
    return { canceled: false, filePath, data };
  });
  ipcMain.handle("asset:import-png", async () => {
    const result = await dialog.showOpenDialog({
      title: "Картинки или видео (кадр) → PNG локально",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Картинки и видео", extensions: ["png", "jpg", "jpeg", "webp", "mp4", "webm", "mov"] },
        { name: "PNG", extensions: ["png"] },
        { name: "Видео", extensions: ["mp4", "webm", "mov"] },
      ],
    });
    if (result.canceled) return { canceled: true };
    const tempRoot = path.join(os.tmpdir(), "kcs-media");
    await fs.mkdir(tempRoot, { recursive: true });
    const assets = [];
    for (const filePath of result.filePaths) {
      const ext = path.extname(filePath).toLowerCase();
      const stem = path.parse(filePath).name;
      const video = [".mp4", ".webm", ".mov"].includes(ext);
      const raster = [".jpg", ".jpeg", ".webp"].includes(ext);
      let pngPath = filePath;
      if (video || raster) {
        pngPath = path.join(tempRoot, `${stem}-${Date.now()}.png`);
        await ffmpegStillToPng(filePath, pngPath, video);
      }
      const bytes = await fs.readFile(pngPath);
      if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
        throw new Error(`Не получился PNG: ${path.basename(filePath)}`);
      }
      assets.push({
        path: pngPath,
        name: stem,
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
      });
    }
    return { canceled: false, data: assets };
  });
  ipcMain.handle("asset:read", async (_event, assetPath: string, projectPath?: string) => {
    if (isDataUrl(assetPath)) return assetPath;
    const resolved = resolveAssetPath(assetPath, projectPath);
    const extension = path.extname(resolved).toLowerCase();
    const allowed = new Set([".png", ".svg", ".jpg", ".jpeg", ".webp", ".wav", ".mp3", ".ogg", ".m4a", ".flac"]);
    if (!allowed.has(extension)) throw new Error("Разрешены только PNG/JPEG/SVG и аудио WAV/MP3/OGG/M4A/FLAC.");
    const bytes = await fs.readFile(resolved);
    const mime =
      extension === ".png" ? "image/png"
        : extension === ".svg" ? "image/svg+xml"
          : extension === ".jpg" || extension === ".jpeg" ? "image/jpeg"
            : extension === ".webp" ? "image/webp"
          : audioMimeFromExt(extension);
    return `data:${mime};base64,${bytes.toString("base64")}`;
  });
  ipcMain.handle("audio:decode-wav", async (_event, assetPath: string, projectPath?: string) => {
    if (isDataUrl(assetPath)) {
      if (assetPath.startsWith("data:audio/wav") || assetPath.startsWith("data:audio/wave")) return assetPath;
      throw new Error("Сжатый data-URL нельзя разобрать в волну. Импортируйте MP3 с диска.");
    }
    const resolved = resolveAssetPath(assetPath, projectPath);
    const extension = path.extname(resolved).toLowerCase();
    const allowed = new Set([".wav", ".mp3", ".ogg", ".m4a", ".flac"]);
    if (!allowed.has(extension)) throw new Error("Нужен аудиофайл WAV/MP3/OGG/M4A/FLAC.");
    const wavPath = await ensureWavFile(resolved);
    const bytes = await fs.readFile(wavPath);
    return `data:audio/wav;base64,${bytes.toString("base64")}`;
  });
  ipcMain.handle("character:save", async (_event, rawCharacter: unknown, rawAssets: unknown, projectPath?: string) => {
    validateCharacter(rawCharacter);
    if (!Array.isArray(rawAssets)) throw new Error("Некорректный список assets.");
    const result = await dialog.showSaveDialog({
      title: "Сохранить персонажа (character.json + Assets/*.png)",
      defaultPath: path.join(rawCharacter.name, "character.json"),
      filters: [{ name: "Персонаж JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const character = structuredClone(rawCharacter);
    const folder = path.dirname(result.filePath);
    const assetFolder = path.join(folder, "Assets");
    await fs.mkdir(assetFolder, { recursive: true });
    const usedIds = new Set(character.parts.map((part) => part.assetId));
    const characterAssets: AssetRecord[] = [];
    for (const assetValue of rawAssets) {
      if (!isRecord(assetValue) || typeof assetValue.id !== "string" || typeof assetValue.path !== "string" || !usedIds.has(assetValue.id)) continue;
      const mediaType = assetValue.mediaType === "image/png" ? "image/png" : "image/svg+xml";
      const extension = isDataUrl(assetValue.path)
        ? (mediaType === "image/png" ? ".png" : ".svg")
        : (path.extname(resolveAssetPath(assetValue.path, projectPath)) || (mediaType === "image/png" ? ".png" : ".svg"));
      const destination = path.join(assetFolder, `${assetValue.id}${extension}`);
      await materializeAssetFile(assetValue.path, destination, projectPath);
      characterAssets.push({
        id: assetValue.id,
        name: String(assetValue.name ?? assetValue.id),
        path: path.relative(folder, destination).replaceAll(path.sep, "/"),
        mediaType,
        width: Number(assetValue.width ?? 0),
        height: Number(assetValue.height ?? 0),
      });
    }
    character.assets = characterAssets;
    await fs.writeFile(result.filePath, `${JSON.stringify(character, null, 2)}\n`, "utf8");
    return { canceled: false, filePath: result.filePath, data: character };
  });

  ipcMain.handle("character:load", async () => {
    const result = await dialog.showOpenDialog({
      title: "Персонаж: character.json ИЛИ любой PNG из папки (тело/голова/рука…)",
      properties: ["openFile"],
      filters: [
        { name: "PNG части или JSON", extensions: ["png", "json"] },
        { name: "Только PNG", extensions: ["png"] },
        { name: "Только character.json", extensions: ["json"] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();

    if (ext === ".png") {
      const folder = path.dirname(filePath);
      const root = resolveCharacterPngRoot(folder);
      const data = buildCharacterFromPngFolder(root, path.basename(root));
      return { canceled: false, filePath: path.join(root, "character.json"), data };
    }

    const parsed: unknown = parseJsonFile(await fs.readFile(filePath, "utf8"));
    validateCharacter(parsed);
    if (parsed.assets) parsed.assets = parsed.assets.map((asset) => ({ ...asset, path: path.resolve(path.dirname(filePath), asset.path) }));
    return { canceled: false, filePath, data: parsed };
  });

  ipcMain.handle("character:load-png-folder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Папка персонажа: тело/голова/башка/рука/нога… (RU или EN)",
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const folder = result.filePaths[0];
    const root = resolveCharacterPngRoot(folder);
    const data = buildCharacterFromPngFolder(root, path.basename(root));
    return { canceled: false, filePath: path.join(root, "character.json"), data };
  });
  ipcMain.handle("character:load-bundled", async (_event, relativeFolder: unknown) => {
    if (typeof relativeFolder !== "string" || !relativeFolder.trim()) {
      throw new Error("Некорректный путь bundled character.");
    }
    const safe = relativeFolder.replace(/\\/g, "/").replace(/\.\./g, "").replace(/^\/+/, "");
    const root = resolveCharactersRoot();
    const folderAbs = path.join(root, ...safe.split("/"));
    const assetsDir = path.join(folderAbs, "Assets");
    const name = path.basename(folderAbs) || "Bundled";
    // Prefer character.json for AudioBeast (special layout). Generic PNG mapper breaks those rigs.
    const jsonPath = path.join(folderAbs, "character.json");
    const isAudioBeast = safe.toLowerCase().includes("audiobeast");
    if (isAudioBeast && existsSync(jsonPath)) {
      let parsed: unknown;
      try {
        parsed = parseJsonFile(await fs.readFile(jsonPath, "utf8"));
      } catch (reason) {
        throw new Error(`Битый JSON ${jsonPath}: ${reason instanceof Error ? reason.message : String(reason)}`);
      }
      validateCharacter(parsed);
      if (parsed.assets) {
        parsed.assets = parsed.assets.map((asset) => ({
          ...asset,
          path: path.resolve(path.dirname(jsonPath), String(asset.path)),
        }));
      }
      return { canceled: false, filePath: jsonPath, data: parsed };
    }
    const pngFiles = [...listRigImageFiles(assetsDir), ...listRigImageFiles(folderAbs)];
    if (pickPngForRigSlot(pngFiles, "body")) {
      const data = buildCharacterFromPngFolder(folderAbs, name);
      return { canceled: false, filePath: path.join(folderAbs, "character.json"), data };
    }
    const filePath = jsonPath;
    if (!existsSync(filePath)) {
      throw new Error(
        `Нет туловища (тело/body) среди PNG и нет character.json: ${folderAbs} (Characters root: ${root})`,
      );
    }
    let parsed: unknown;
    try {
      parsed = parseJsonFile(await fs.readFile(filePath, "utf8"));
    } catch (reason) {
      throw new Error(`Битый JSON ${filePath}: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
    validateCharacter(parsed);
    if (parsed.assets) {
      parsed.assets = parsed.assets.map((asset) => ({
        ...asset,
        path: path.resolve(path.dirname(filePath), String(asset.path)),
      }));
    }
    return { canceled: false, filePath, data: parsed };
  });

  ipcMain.handle("characters:get-root", async () => {
    const root = resolveCharactersRoot();
    if (!existsSync(root)) {
      return { ok: false, error: `Папка Characters не найдена. Пробовали: ${root}` };
    }
    return { ok: true, path: root };
  });

  ipcMain.handle("assets:get-root", async () => {
    const root = resolveAssetsRoot();
    if (!existsSync(root)) {
      return { ok: false, error: `Папка Assets не найдена. Пробовали: ${root}` };
    }
    return { ok: true, path: root };
  });

  ipcMain.handle("assets:list-images", async (_event, folderPath: unknown) => {
    try {
      const root = path.resolve(String(folderPath ?? ""));
      await fs.mkdir(root, { recursive: true });
      const entries = await fs.readdir(root, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!IMAGE_LIST_EXTS.has(ext)) continue;
        const full = path.join(root, entry.name);
        files.push(await ensureImagePng(full));
      }
      return { ok: true, files, folder: root };
    } catch (reason) {
      return { ok: false, error: reason instanceof Error ? reason.message : String(reason), files: [] };
    }
  });

  ipcMain.handle("audio:import", async () => {
    const result = await dialog.showOpenDialog({
      title: "Импорт аудио (локально)",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Audio", extensions: ["wav", "mp3", "ogg", "m4a", "flac"] },
        { name: "MP3", extensions: ["mp3"] },
        { name: "WAV", extensions: ["wav"] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const items = [];
    for (const filePath of result.filePaths) {
      const extension = path.extname(filePath).toLowerCase();
      if (![".wav", ".mp3", ".ogg", ".m4a", ".flac"].includes(extension)) {
        throw new Error(`Неподдерживаемый аудиоформат: ${path.basename(filePath)}`);
      }
      const duration = await probeMediaDuration(filePath);
      items.push({
        path: filePath,
        name: path.parse(filePath).name,
        mediaType: audioMimeFromExt(extension),
        duration,
      });
    }
    return { canceled: false, data: items };
  });

  ipcMain.handle("audio:list-voices", async (_event, options?: unknown) => {
    type VoiceRow = PiperVoiceRow;
    const voices: VoiceRow[] = [];
    const opts = (typeof options === "object" && options !== null ? options : {}) as {
      extraFolders?: string[];
      extraModels?: Array<{ name?: string; modelPath?: string; culture?: string; gender?: string }>;
    };
    const extraFolders = Array.isArray(opts.extraFolders) ? opts.extraFolders.map(String).filter(Boolean) : [];
    const seenModels = new Set<string>();

    for (const dir of resolvePiperModelsDirs(extraFolders)) {
      const isCustom = extraFolders.some((folder) => {
        const resolved = path.resolve(folder);
        return dir === resolved || dir.startsWith(resolved + path.sep) || dir === path.join(resolved, "models");
      }) || dir.includes(`${path.sep}TTS${path.sep}piper`);
      const scanned = await scanPiperModelDir(dir, isCustom);
      for (const voice of scanned) {
        const key = (voice.modelPath ?? voice.name).toLowerCase();
        if (seenModels.has(key)) continue;
        seenModels.add(key);
        voices.push(voice);
      }
    }

    for (const item of Array.isArray(opts.extraModels) ? opts.extraModels : []) {
      const modelPath = typeof item.modelPath === "string" ? item.modelPath.trim() : "";
      if (!modelPath || !existsSync(modelPath)) continue;
      const key = modelPath.toLowerCase();
      if (seenModels.has(key)) continue;
      seenModels.add(key);
      const base = path.basename(modelPath, ".onnx");
      const meta = inferPiperMeta(base);
      voices.push({
        name: (item.name && String(item.name).trim()) || `Piper ${base}`,
        culture: (item.culture && String(item.culture)) || meta.culture,
        gender: (item.gender && String(item.gender)) || meta.gender,
        engine: "piper",
        modelPath,
        custom: true,
      });
    }

    // Windows SAPI is disabled — only Piper models are exposed.
    return { ok: true, voices };
  });

  ipcMain.handle("audio:import-piper-model", async () => {
    const result = await dialog.showOpenDialog({
      title: "Добавить голос Piper (.onnx)",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Piper ONNX", extensions: ["onnx"] }],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true, voices: [] as PiperVoiceRow[] };

    const destDir = resolveCustomPiperModelsDir();
    await fs.mkdir(destDir, { recursive: true });
    const imported: PiperVoiceRow[] = [];

    for (const source of result.filePaths) {
      if (!source.toLowerCase().endsWith(".onnx")) continue;
      const base = path.basename(source);
      const dest = path.join(destDir, base);
      await fs.copyFile(source, dest);
      const jsonSide = `${source}.json`;
      if (existsSync(jsonSide)) {
        await fs.copyFile(jsonSide, `${dest}.json`);
      } else {
        const altJson = source.replace(/\.onnx$/i, ".onnx.json");
        if (existsSync(altJson)) await fs.copyFile(altJson, path.join(destDir, path.basename(altJson)));
      }
      const stem = path.basename(base, ".onnx");
      const meta = inferPiperMeta(stem);
      imported.push({
        name: `Piper ${stem}`,
        culture: meta.culture,
        gender: meta.gender,
        engine: "piper",
        modelPath: dest,
        custom: true,
      });
    }

    return { canceled: false, voices: imported, folder: destDir };
  });

  ipcMain.handle("audio:list-folder", async (_event, folderPath: unknown) => {
    try {
      let root = path.resolve(String(folderPath ?? ""));
      if (!existsSync(root)) return { ok: false, error: `Папка не найдена: ${root}`, files: [] };
      const stats = await fs.stat(root);
      if (stats.isFile()) {
        if (!AUDIO_LIST_EXTS.has(path.extname(root).toLowerCase())) {
          return { ok: false, error: `Это не аудиофайл: ${path.basename(root)}`, files: [] };
        }
        root = path.dirname(root);
      }
      const entries = await fs.readdir(root, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!AUDIO_LIST_EXTS.has(ext)) continue;
        const full = path.join(root, entry.name);
        const duration = await probeMediaDuration(full);
        files.push({ path: full, name: entry.name, duration });
      }
      return { ok: true, files, folder: root };
    } catch (reason) {
      return { ok: false, error: reason instanceof Error ? reason.message : String(reason), files: [] };
    }
  });

  ipcMain.handle("audio:choose-folder-from-file", async (_event, defaultPath?: string) => {
    const result = await dialog.showOpenDialog({
      title: "Выберите MP3 — будет взята вся папка",
      properties: ["openFile"],
      defaultPath: dialogStartPath(defaultPath),
      filters: [
        { name: "MP3", extensions: ["mp3"] },
        { name: "Audio", extensions: ["mp3", "wav", "ogg", "m4a", "flac"] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return { canceled: false, path: path.dirname(result.filePaths[0]) };
  });

  ipcMain.handle("audio:synthesize", async (_event, text: unknown, outPath: unknown, options?: unknown) => {
    try {
      const speech = String(text ?? "").trim();
      if (!speech) return { ok: false, error: "Пустой текст для озвучки." };
      if (speech.length > 2000) return { ok: false, error: "Текст слишком длинный (макс. 2000 символов)." };
      const target = assertSafePath(String(outPath), "WAV");
      if (path.extname(target).toLowerCase() !== ".wav") return { ok: false, error: "Локальный TTS сохраняет только .wav." };
      await fs.mkdir(path.dirname(target), { recursive: true });

      const opts = (typeof options === "object" && options !== null ? options : {}) as {
        voiceName?: string;
        rate?: number;
        pitch?: string;
        pitchSemitones?: number;
        piperModel?: string;
      };
      const rate = Math.max(-10, Math.min(10, Number.isFinite(Number(opts.rate)) ? Math.round(Number(opts.rate)) : -3));
      const voiceName = typeof opts.voiceName === "string" ? opts.voiceName.trim() : "";
      const pitch = typeof opts.pitch === "string" && opts.pitch.trim() ? opts.pitch.trim() : "-2%";
      void pitch; // reserved (Piper uses length_scale; pitchSemitones via ffmpeg below)
      const pitchSemitones = Number.isFinite(Number(opts.pitchSemitones)) ? Number(opts.pitchSemitones) : 0;
      let piperModel = typeof opts.piperModel === "string" ? opts.piperModel.trim() : "";

      const resolvePiperExe = (): string | null => {
        for (const root of resolvePiperRoots()) {
          const exe = path.join(root, process.platform === "win32" ? "piper.exe" : "piper");
          if (existsSync(exe)) return exe;
        }
        return null;
      };

      // Resolve Piper model from voice name "Piper ru_RU-…"
      if (!piperModel && voiceName.toLowerCase().startsWith("piper ")) {
        const base = voiceName.slice(6).trim();
        for (const root of resolvePiperModelsDirs()) {
          const candidate = path.join(root, `${base}.onnx`);
          if (existsSync(candidate)) {
            piperModel = candidate;
            break;
          }
        }
      }

      const piperExe = resolvePiperExe();
      // Auto-pick first Piper model if caller did not specify one.
      if ((!piperModel || !existsSync(piperModel)) && piperExe) {
        for (const root of resolvePiperModelsDirs()) {
          const scanned = await scanPiperModelDir(root);
          const ru = scanned.find((voice) => /ru/i.test(voice.culture) || /ru/i.test(voice.name));
          const pick = ru ?? scanned[0];
          if (pick?.modelPath && existsSync(pick.modelPath)) {
            piperModel = pick.modelPath;
            break;
          }
        }
      }

      if (!piperExe) {
        return {
          ok: false,
          error: "Piper не найден. Установите scripts\\setup-piper.ps1 или Voice (Chatterbox). Windows SAPI отключён.",
        };
      }
      if (!piperModel || !existsSync(piperModel)) {
        return {
          ok: false,
          error: "Нет модели Piper (.onnx). setup-piper.ps1 → Tools\\piper, или «Добавить .onnx…». Windows SAPI отключён.",
        };
      }

      const engine = "piper";
      const lengthScale = Math.max(0.55, Math.min(1.7, 1 - rate * 0.045));
      const rawOut = path.join(os.tmpdir(), `kcs-piper-raw-${Date.now()}.wav`);
      const piperResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const child = spawn(piperExe, [
          "--model", piperModel,
          "--output_file", rawOut,
          "--length_scale", String(lengthScale),
        ], { windowsHide: true, shell: false });
        child.stdin.write(speech, "utf8");
        child.stdin.end();
        let stderr = "";
        child.stderr.on("data", (chunk) => { stderr += String(chunk); });
        child.on("error", (error) => resolve({ ok: false, error: error.message }));
        child.on("close", (code) => {
          if (code === 0) resolve({ ok: true });
          else resolve({ ok: false, error: stderr || `piper exit ${code}` });
        });
      });
      if (!piperResult.ok) return { ok: false, error: piperResult.error ?? "Piper TTS failed" };
      await fs.copyFile(rawOut, target);
      await fs.rm(rawOut, { force: true }).catch(() => undefined);

      try {
        await fs.access(target);
      } catch {
        return { ok: false, error: "TTS завершился, но WAV-файл не создан." };
      }

      // Distinct cast timbres: local ffmpeg pitch shift (no cloud).
      if (Math.abs(pitchSemitones) >= 0.25) {
        const factor = Math.pow(2, pitchSemitones / 12);
        const pitched = path.join(os.tmpdir(), `kcs-tts-pitch-${Date.now()}.wav`);
        const ffmpegPath = resolveFfmpegPath();
        const pitchOk = await new Promise<boolean>((resolve) => {
          const child = spawn(ffmpegPath, [
            "-y", "-i", target,
            "-af", `asetrate=24000*${factor.toFixed(5)},aresample=24000,atempo=${(1 / factor).toFixed(5)}`,
            pitched,
          ], { windowsHide: true, shell: false });
          child.on("error", () => resolve(false));
          child.on("close", (code) => resolve(code === 0));
        });
        if (pitchOk && existsSync(pitched)) {
          await fs.copyFile(pitched, target);
          await fs.rm(pitched, { force: true }).catch(() => undefined);
        }
      }

      const duration = await probeMediaDuration(target);
      return { ok: true, path: target, duration, engine };
    } catch (reason) {
      return { ok: false, error: reason instanceof Error ? reason.message : String(reason) };
    }
  });

  ipcMain.handle("export:choose-directory", async (_event, defaultPath?: string) => {
    const result = await dialog.showOpenDialog({
      title: "Выберите папку",
      properties: ["openDirectory", "createDirectory"],
      defaultPath: dialogStartPath(defaultPath),
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  ipcMain.handle("export:choose-save-file", async (_event, defaultName: string, filters: Array<{ name: string; extensions: string[] }>) => {
    if (typeof defaultName !== "string" || !Array.isArray(filters)) throw new Error("Некорректные параметры диалога сохранения.");
    const result = await dialog.showSaveDialog({
      title: "Сохранить экспорт",
      defaultPath: defaultName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_"),
      filters: filters.map((filter) => ({
        name: String(filter.name),
        extensions: Array.isArray(filter.extensions) ? filter.extensions.map(String) : [],
      })),
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle("export:ensure-directory", async (_event, targetPath: unknown) => {
    try {
      const resolved = assertSafePath(String(targetPath), "Папка");
      let existed = false;
      try {
        const stats = await fs.stat(resolved);
        existed = stats.isDirectory();
      } catch {
        existed = false;
      }
      await fs.mkdir(resolved, { recursive: true });
      return { ok: true, existed, path: resolved };
    } catch (reason) {
      return { ok: false, error: reason instanceof Error ? reason.message : String(reason) };
    }
  });

  ipcMain.handle("export:path-exists", async (_event, targetPath: unknown) => {
    try {
      await fs.access(assertSafePath(String(targetPath), "Путь"));
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("export:join-path", async (_event, ...parts: unknown[]) => {
    if (!parts.every((part) => typeof part === "string")) throw new Error("join-path ожидает строки.");
    return path.join(...(parts as string[]));
  });

  ipcMain.handle("export:resolve-path", async (_event, assetPath: unknown, projectPath?: unknown) => {
    return resolveAssetPath(String(assetPath), typeof projectPath === "string" ? projectPath : undefined);
  });

  ipcMain.handle("export:write-png", async (_event, filePath: unknown, bytes: unknown) => {
    try {
      const resolved = assertPngPath(String(filePath));
      const buffer = bytes instanceof Uint8Array ? Buffer.from(bytes) : Buffer.from(bytes as ArrayBuffer);
      if (buffer.length < 8 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
        return { ok: false, error: "Буфер не является PNG." };
      }
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, buffer);
      return { ok: true, path: resolved };
    } catch (reason) {
      return { ok: false, error: reason instanceof Error ? reason.message : String(reason) };
    }
  });

  ipcMain.handle("export:write-text", async (_event, filePath: unknown, contents: unknown) => {
    try {
      const resolved = path.resolve(String(filePath));
      const text = String(contents ?? "");
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, text, "utf8");
      return { ok: true, path: resolved };
    } catch (reason) {
      return { ok: false, error: reason instanceof Error ? reason.message : String(reason) };
    }
  });

  ipcMain.handle("export:create-temp-dir", async (_event, prefix: unknown) => {
    try {
      const safePrefix = String(prefix ?? "kcs-").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "kcs-";
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), safePrefix));
      return { ok: true, path: dir };
    } catch (reason) {
      return { ok: false, error: reason instanceof Error ? reason.message : String(reason) };
    }
  });

  ipcMain.handle("export:remove-directory", async (_event, targetPath: unknown) => {
    try {
      const resolved = assertSafePath(String(targetPath), "Temp");
      const tempRoot = path.resolve(os.tmpdir());
      if (!resolved.startsWith(tempRoot)) return { ok: false, error: "Удаление разрешено только для временных папок." };
      await fs.rm(resolved, { recursive: true, force: true });
      return { ok: true };
    } catch (reason) {
      return { ok: false, error: reason instanceof Error ? reason.message : String(reason) };
    }
  });

  ipcMain.handle("export:check-ffmpeg", async () => {
    const ffmpegPath = resolveFfmpegPath();
    return await new Promise<{ ok: boolean; path?: string; version?: string; error?: string }>((resolve) => {
      const child = spawn(ffmpegPath, ["-version"], { windowsHide: true, shell: false });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      child.on("error", (error) => resolve({ ok: false, error: error.message, path: ffmpegPath }));
      child.on("close", (code) => {
        if (code === 0) resolve({ ok: true, path: ffmpegPath, version: (stdout || stderr).split(/\r?\n/)[0] });
        else resolve({ ok: false, path: ffmpegPath, error: stderr || `FFmpeg exit code ${code}` });
      });
    });
  });

  ipcMain.handle("export:run-ffmpeg", async (_event, rawArgs: unknown, logPath: unknown) => {
    const args = assertFfmpegArgs(rawArgs);
    const logFile = assertSafePath(String(logPath), "FFmpeg log");
    const ffmpegPath = resolveFfmpegPath();
    exportInProgress = true;
    return await new Promise<{ ok: boolean; code?: number; error?: string; logPath?: string }>((resolve) => {
      const child = spawn(ffmpegPath, args, { windowsHide: true, shell: false });
      ffmpegProcess = child;
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      child.on("error", async (error) => {
        ffmpegProcess = null;
        exportInProgress = false;
        await fs.writeFile(logFile, stderr || error.message, "utf8").catch(() => undefined);
        resolve({ ok: false, error: error.message, logPath: logFile });
      });
      child.on("close", async (code) => {
        ffmpegProcess = null;
        exportInProgress = false;
        await fs.writeFile(logFile, stderr || `exit ${code}`, "utf8").catch(() => undefined);
        if (code === 0) resolve({ ok: true, code: 0, logPath: logFile });
        else resolve({ ok: false, code: code ?? 1, error: stderr.slice(-2000) || `FFmpeg exit code ${code}`, logPath: logFile });
      });
    });
  });

  ipcMain.handle("export:cancel-ffmpeg", async () => {
    if (ffmpegProcess && !ffmpegProcess.killed) {
      ffmpegProcess.kill();
      ffmpegProcess = null;
    }
    exportInProgress = false;
    return { ok: true };
  });

  ipcMain.handle("export:open-path", async (_event, targetPath: unknown) => {
    try {
      const resolved = assertSafePath(String(targetPath), "Open");
      const result = await shell.openPath(resolved);
      return result ? { ok: false, error: result } : { ok: true };
    } catch (reason) {
      return { ok: false, error: reason instanceof Error ? reason.message : String(reason) };
    }
  });

  ipcMain.handle("export:set-busy", async (_event, busy: unknown) => {
    exportInProgress = Boolean(busy);
    return { ok: true };
  });

  ipcMain.handle("project:set-dirty", async (_event, dirty: unknown) => {
    projectDirty = Boolean(dirty);
    return { ok: true };
  });

  ipcMain.handle("app:save-before-close-result", async (_event, result: unknown) => {
    const payload = (typeof result === "object" && result !== null ? result : {}) as {
      saved?: boolean;
      discard?: boolean;
      canceled?: boolean;
    };
    saveBeforeClosePending = false;
    if (payload.canceled) {
      return { ok: true };
    }
    if (payload.saved || payload.discard) {
      forceQuitApp();
    }
    return { ok: true };
  });
}

/**
 * Hard quit. Do not call dialogs from inside the BrowserWindow `close` event —
 * on Windows that nests message loops and the app never exits after «Не сохранять».
 */
function forceQuitApp(): void {
  quitConfirmed = true;
  projectDirty = false;
  saveBeforeClosePending = false;
  closePromptOpen = false;
  exportInProgress = false;
  if (ffmpegProcess && !ffmpegProcess.killed) {
    try { ffmpegProcess.kill(); } catch { /* ignore */ }
    ffmpegProcess = null;
  }
  try { voiceEngine.dispose(); } catch { /* ignore */ }
  const win = mainWindow;
  if (win && !win.isDestroyed()) {
    try { win.removeAllListeners("close"); } catch { /* ignore */ }
    try { win.hide(); } catch { /* ignore */ }
    try { win.destroy(); } catch { /* ignore */ }
  }
  // Guarantees process death even if GPU/Pixi teardown hangs
  setTimeout(() => {
    try { app.exit(0); } catch { /* ignore */ }
  }, 250);
  try { app.exit(0); } catch { /* ignore */ }
}

async function promptAndQuit(window: BrowserWindow): Promise<void> {
  if (quitConfirmed || window.isDestroyed()) return;
  closePromptOpen = true;
  try {
    if (exportInProgress || ffmpegProcess) {
      const { response } = await dialog.showMessageBox(window, {
        type: "warning",
        buttons: ["Продолжить экспорт", "Прервать и закрыть"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        title: "Экспорт выполняется",
        message: "Идёт экспорт. Закрыть приложение и прервать процесс?",
      });
      if (response === 0) return;
      if (ffmpegProcess && !ffmpegProcess.killed) ffmpegProcess.kill();
      ffmpegProcess = null;
      exportInProgress = false;
    }

    if (saveBeforeClosePending) {
      const { response } = await dialog.showMessageBox(window, {
        type: "warning",
        buttons: ["Закрыть без сохранения", "Отмена"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        title: "Сохранение зависло",
        message: "Сохранение не ответило. Закрыть программу без сохранения?",
      });
      if (response === 0) forceQuitApp();
      return;
    }

    if (projectDirty) {
      const { response } = await dialog.showMessageBox(window, {
        type: "question",
        buttons: ["Сохранить", "Не сохранять", "Отмена"],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
        title: "Сохранить проект?",
        message: "Есть несохранённые изменения. Сохранить перед закрытием?",
        detail: "«Не сохранять» закрывает сразу. Ctrl+S — сохранить вручную.",
      });
      if (response === 2) return;
      if (response === 1) {
        forceQuitApp();
        return;
      }
      saveBeforeClosePending = true;
      window.webContents.send("app:save-before-close");
      setTimeout(() => {
        if (!saveBeforeClosePending) return;
        saveBeforeClosePending = false;
      }, 45_000);
      return;
    }

    forceQuitApp();
  } finally {
    closePromptOpen = false;
  }
}

function createWindow(): void {
  const work = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.max(1280, Math.min(work.width, Math.round(work.width * 0.96)));
  const height = Math.max(800, Math.min(work.height, Math.round(work.height * 0.96)));
  const window = new BrowserWindow({
    title: "KRX Cartoon Studio",
    width,
    height,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#151719",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;
  window.once("ready-to-show", () => {
    window.maximize();
    window.show();
  });
  // NEVER showMessageBoxSync inside this handler — it deadlocks quit on Windows.
  window.on("close", (event) => {
    if (quitConfirmed) return;
    event.preventDefault();
    if (closePromptOpen) return;
    setImmediate(() => {
      void promptAndQuit(window);
    });
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
    saveBeforeClosePending = false;
    closePromptOpen = false;
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void window.loadURL(devUrl);
  else void window.loadFile(resolveRendererIndex());
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => {
  if (ffmpegProcess && !ffmpegProcess.killed) ffmpegProcess.kill();
  ffmpegProcess = null;
  voiceEngine.dispose();
});
