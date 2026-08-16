import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_VERSION = 1;
const CHARACTER_VERSION = 1;
let ffmpegProcess = null;
let mainWindow = null;
let exportInProgress = false;
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validateProject(value) {
    if (!isRecord(value) || value.version !== PROJECT_VERSION || !Array.isArray(value.assets) || !Array.isArray(value.characters) || !isRecord(value.canvas)) {
        throw new Error("Повреждённый project.kcsproj или неизвестная версия файла.");
    }
}
function validateCharacter(value) {
    if (!isRecord(value) || value.version !== CHARACTER_VERSION || typeof value.name !== "string" || !Array.isArray(value.parts)) {
        throw new Error("Повреждённый character.json или неизвестная версия файла.");
    }
}
function isDataUrl(assetPath) {
    return assetPath.startsWith("data:");
}
function stripBom(raw) {
    // UTF-8 BOM, UTF-16 BOM leftovers, and leading whitespace/junk before `{`/`[`.
    let text = raw.replace(/^\uFEFF/, "");
    if (text.charCodeAt(0) === 0xfffd)
        text = text.slice(1);
    const start = text.search(/[\{\[]/);
    if (start > 0)
        text = text.slice(start);
    return text.trimStart();
}
function parseJsonFile(raw) {
    return JSON.parse(stripBom(raw));
}
/** Build a minimal CharacterRecord from Assets/*.png — never touches character.json. */
function buildCharacterFromPngFolder(folderAbs, displayName) {
    const assetsDir = path.join(folderAbs, "Assets");
    const files = ["body.png", "eye.png", "mouth.png", "arm.png", "leg.png"];
    for (const file of files) {
        if (!existsSync(path.join(assetsDir, file))) {
            throw new Error(`Нет PNG: ${path.join(assetsDir, file)}`);
        }
    }
    const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "bundled";
    const prefix = `asset-${slug}`;
    const asset = (id, file, w, h) => ({
        id: `${prefix}-${id}`,
        name: id,
        path: path.join(assetsDir, file),
        mediaType: "image/png",
        width: w,
        height: h,
    });
    const assets = [
        asset("body", "body.png", 450, 500),
        asset("eye", "eye.png", 180, 180),
        asset("mouth", "mouth.png", 200, 80),
        asset("arm", "arm.png", 260, 290),
        asset("leg", "leg.png", 170, 170),
    ];
    const body = assets[0];
    const eye = assets[1];
    const mouth = assets[2];
    const arm = assets[3];
    const leg = assets[4];
    const targetH = 280;
    const s = targetH / body.height;
    const displayW = Math.round(body.width * s);
    const displayH = Math.round(body.height * s);
    const cx = Math.round(displayW / 2);
    const cy = Math.round(displayH / 2);
    const eyeW = Math.max(24, Math.round(eye.width * s * 0.35));
    const eyeH = Math.max(24, Math.round(eye.height * s * 0.35));
    const mouthW = Math.max(40, Math.round(mouth.width * s * 0.55));
    const mouthH = Math.max(16, Math.round(mouth.height * s * 0.55));
    const armW = Math.max(40, Math.round(arm.width * s * 0.42));
    const armH = Math.max(60, Math.round(arm.height * s * 0.42));
    const legW = Math.max(36, Math.round(leg.width * s * 0.5));
    const legH = Math.max(40, Math.round(leg.height * s * 0.5));
    const part = (id, name, assetId, parentId, zIndex, x, y, rotation, scaleX, scaleY, pivotX, pivotY, visible, opacity, semanticRole) => ({
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
    return {
        version: CHARACTER_VERSION,
        id: `character-${slug}`,
        name: displayName,
        assets,
        parts: [
            part("body", "Body", body.id, null, 10, cx, cy, 0, s, s, Math.round(body.width / 2), Math.round(body.height / 2), true, 1, "Body"),
            part("head", "Head", body.id, "body", 11, cx, Math.round(cy * 0.35), 0, 0.01, 0.01, 1, 1, false, 0, "Head"),
            part("eye-left", "EyeLeft", eye.id, "body", 22, Math.round(cx - displayW * 0.18), Math.round(cy - displayH * 0.12), 0, eyeW / eye.width, eyeH / eye.height, Math.round(eye.width / 2), Math.round(eye.height / 2), true, 1, "EyeLeft"),
            part("eye-right", "EyeRight", eye.id, "body", 22, Math.round(cx + displayW * 0.18), Math.round(cy - displayH * 0.12), 0, eyeW / eye.width, eyeH / eye.height, Math.round(eye.width / 2), Math.round(eye.height / 2), true, 1, "EyeRight"),
            part("mouth", "Mouth", mouth.id, "body", 23, cx, Math.round(cy + displayH * 0.08), 0, mouthW / mouth.width, mouthH / mouth.height, Math.round(mouth.width / 2), Math.round(mouth.height / 2), true, 1, "Mouth"),
            part("arm-left", "ArmLeft", arm.id, "body", 8, Math.round(cx - displayW * 0.42), cy, -8, armW / arm.width, armH / arm.height, Math.round(arm.width * 0.55), Math.round(arm.height * 0.15), true, 1, "ArmLeft"),
            part("arm-right", "ArmRight", arm.id, "body", 12, Math.round(cx + displayW * 0.42), cy, 8, -(armW / arm.width), armH / arm.height, Math.round(arm.width * 0.55), Math.round(arm.height * 0.15), true, 1, "ArmRight"),
            part("leg-left", "LegLeft", leg.id, "body", 7, Math.round(cx - displayW * 0.16), Math.round(cy + displayH * 0.42), 0, legW / leg.width, legH / leg.height, Math.round(leg.width / 2), Math.round(leg.height * 0.15), true, 1, "LegLeft"),
            part("leg-right", "LegRight", leg.id, "body", 7, Math.round(cx + displayW * 0.16), Math.round(cy + displayH * 0.42), 0, -(legW / leg.width), legH / leg.height, Math.round(leg.width / 2), Math.round(leg.height * 0.15), true, 1, "LegRight"),
        ],
        sockets: [
            { id: "socket-mouth", name: "Mouth", type: "Mouth", partId: "mouth", position: { x: 0, y: 0 } },
            { id: "socket-hand-left", name: "Left Hand", type: "HandLeft", partId: "arm-left", position: { x: 0, y: Math.round(armH * 0.8) } },
            { id: "socket-hand-right", name: "Right Hand", type: "HandRight", partId: "arm-right", position: { x: 0, y: Math.round(armH * 0.8) } },
        ],
    };
}
function resolveCharactersRoot() {
    const candidates = [
        app.isPackaged ? path.join(process.resourcesPath, "Characters") : "",
        path.join(app.getAppPath(), "Characters"),
        path.join(__dirname, "..", "Characters"),
        path.join(process.cwd(), "Characters"),
    ].filter(Boolean);
    for (const candidate of candidates) {
        if (existsSync(candidate))
            return candidate;
    }
    return candidates[0] ?? path.join(app.getAppPath(), "Characters");
}
function resolveAssetPath(assetPath, projectPath) {
    if (isDataUrl(assetPath))
        throw new Error("data: URL нельзя разрешить как файловый путь.");
    if (assetPath.startsWith("builtin://")) {
        const relative = assetPath.slice("builtin://".length).replaceAll("/", path.sep);
        return path.join(resolveBuiltinRoot(), relative);
    }
    if (path.isAbsolute(assetPath))
        return assetPath;
    if (!projectPath)
        throw new Error(`Невозможно разрешить относительный asset: ${assetPath}`);
    return path.resolve(path.dirname(projectPath), assetPath);
}
async function materializeAssetFile(assetPath, destination, projectPath) {
    if (isDataUrl(assetPath)) {
        const comma = assetPath.indexOf(",");
        if (comma < 0)
            throw new Error("Повреждённый data: URL asset.");
        const meta = assetPath.slice(0, comma);
        const payload = assetPath.slice(comma + 1);
        const buffer = meta.includes(";base64") ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
        await fs.writeFile(destination, buffer);
        return;
    }
    const source = resolveAssetPath(assetPath, projectPath);
    if (path.resolve(source) !== path.resolve(destination))
        await fs.copyFile(source, destination);
}
async function normalizeAndWriteProject(document, targetPath, sourceProjectPath) {
    validateProject(document);
    const targetDir = path.dirname(targetPath);
    const assetDir = path.join(targetDir, "Assets");
    const audioDir = path.join(targetDir, "Audio");
    await fs.mkdir(assetDir, { recursive: true });
    await fs.mkdir(audioDir, { recursive: true });
    const normalized = structuredClone(document);
    for (const asset of normalized.assets) {
        if (asset.path.startsWith("builtin://"))
            continue;
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
            if (!asset.path || asset.path.startsWith("builtin://"))
                continue;
            const source = resolveAssetPath(asset.path, sourceProjectPath);
            const safeName = `${asset.id}-${path.basename(source).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
            const destination = path.join(audioDir, safeName);
            if (path.resolve(source) !== path.resolve(destination))
                await fs.copyFile(source, destination);
            asset.path = path.relative(targetDir, destination).replaceAll(path.sep, "/");
        }
    }
    await fs.writeFile(targetPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    return normalized;
}
async function chooseProjectPath() {
    const result = await dialog.showSaveDialog({
        title: "Сохранить проект KRX Cartoon Studio",
        defaultPath: "project.kcsproj",
        filters: [{ name: "KRX Cartoon Studio Project", extensions: ["kcsproj"] }],
    });
    return result.canceled ? undefined : result.filePath;
}
function resolveFfmpegPath() {
    if (app.isPackaged) {
        const packaged = path.join(process.resourcesPath, "ffmpeg", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
        return packaged;
    }
    try {
        const resolved = require("ffmpeg-static");
        if (resolved && typeof resolved === "string")
            return resolved;
    }
    catch {
        // fall through
    }
    return "ffmpeg";
}
function resolveRendererIndex() {
    return path.join(__dirname, "..", "dist", "renderer", "index.html");
}
function resolveBuiltinRoot() {
    if (app.isPackaged)
        return path.join(app.getAppPath(), "dist", "renderer");
    return path.join(app.getAppPath(), "public");
}
async function probeMediaDuration(filePath) {
    const ffmpegPath = resolveFfmpegPath();
    return await new Promise((resolve) => {
        const child = spawn(ffmpegPath, ["-i", filePath], { windowsHide: true, shell: false });
        let stderr = "";
        child.stderr.on("data", (chunk) => { stderr += String(chunk); });
        child.on("error", () => resolve(1));
        child.on("close", () => {
            const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
            if (!match) {
                resolve(1);
                return;
            }
            const hours = Number(match[1]);
            const minutes = Number(match[2]);
            const seconds = Number(match[3]);
            const total = hours * 3600 + minutes * 60 + seconds;
            resolve(Number.isFinite(total) && total > 0 ? total : 1);
        });
    });
}
function assertSafePath(targetPath, label) {
    if (typeof targetPath !== "string" || targetPath.trim().length === 0)
        throw new Error(`${label}: пустой путь.`);
    if (/[\r\n\u0000]/.test(targetPath))
        throw new Error(`${label}: недопустимые символы в пути.`);
    return path.resolve(targetPath);
}
function assertPngPath(targetPath) {
    const resolved = assertSafePath(targetPath, "PNG");
    if (path.extname(resolved).toLowerCase() !== ".png")
        throw new Error("Разрешена запись только PNG-файлов.");
    return resolved;
}
function assertFfmpegArgs(args) {
    if (!Array.isArray(args) || args.length === 0)
        throw new Error("Аргументы FFmpeg отсутствуют.");
    if (!args.every((item) => typeof item === "string"))
        throw new Error("Аргументы FFmpeg должны быть строками.");
    if (args.some((item) => /[\r\n\u0000]/.test(item)))
        throw new Error("Аргументы FFmpeg содержат недопустимые символы.");
    if (args.some((item) => item === "-c" || item === "/c" || item === "cmd.exe"))
        throw new Error("Запрещённые аргументы FFmpeg.");
    return args;
}
function registerIpc() {
    ipcMain.handle("project:open", async () => {
        const result = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "KRX Cartoon Studio Project", extensions: ["kcsproj"] }] });
        if (result.canceled)
            return { canceled: true };
        const filePath = result.filePaths[0];
        const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
        validateProject(parsed);
        return { canceled: false, filePath, data: parsed };
    });
    ipcMain.handle("project:save", async (_event, document, currentPath) => {
        const filePath = currentPath ?? await chooseProjectPath();
        if (!filePath)
            return { canceled: true };
        const data = await normalizeAndWriteProject(document, filePath, currentPath);
        return { canceled: false, filePath, data };
    });
    ipcMain.handle("project:save-as", async (_event, document) => {
        const filePath = await chooseProjectPath();
        if (!filePath)
            return { canceled: true };
        const data = await normalizeAndWriteProject(document, filePath);
        return { canceled: false, filePath, data };
    });
    ipcMain.handle("asset:import-png", async () => {
        const result = await dialog.showOpenDialog({ title: "Импорт прозрачных PNG", properties: ["openFile", "multiSelections"], filters: [{ name: "PNG Images", extensions: ["png"] }] });
        if (result.canceled)
            return { canceled: true };
        const assets = [];
        for (const filePath of result.filePaths) {
            const bytes = await fs.readFile(filePath);
            if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
                throw new Error(`Неправильный PNG: ${path.basename(filePath)}`);
            assets.push({ path: filePath, name: path.parse(filePath).name, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
        }
        return { canceled: false, data: assets };
    });
    ipcMain.handle("asset:read", async (_event, assetPath, projectPath) => {
        if (isDataUrl(assetPath))
            return assetPath;
        const resolved = resolveAssetPath(assetPath, projectPath);
        const extension = path.extname(resolved).toLowerCase();
        const allowed = new Set([".png", ".svg", ".wav", ".mp3", ".ogg"]);
        if (!allowed.has(extension))
            throw new Error("Разрешены только PNG/SVG и аудио WAV/MP3/OGG.");
        const bytes = await fs.readFile(resolved);
        const mime = extension === ".png" ? "image/png"
            : extension === ".svg" ? "image/svg+xml"
                : extension === ".wav" ? "audio/wav"
                    : extension === ".ogg" ? "audio/ogg"
                        : "audio/mpeg";
        return `data:${mime};base64,${bytes.toString("base64")}`;
    });
    ipcMain.handle("character:save", async (_event, rawCharacter, rawAssets, projectPath) => {
        validateCharacter(rawCharacter);
        if (!Array.isArray(rawAssets))
            throw new Error("Некорректный список assets.");
        const result = await dialog.showSaveDialog({ title: "Сохранить Character Rig", defaultPath: path.join(rawCharacter.name, "character.json"), filters: [{ name: "Character Rig", extensions: ["json"] }] });
        if (result.canceled || !result.filePath)
            return { canceled: true };
        const character = structuredClone(rawCharacter);
        const folder = path.dirname(result.filePath);
        const assetFolder = path.join(folder, "Assets");
        await fs.mkdir(assetFolder, { recursive: true });
        const usedIds = new Set(character.parts.map((part) => part.assetId));
        const characterAssets = [];
        for (const assetValue of rawAssets) {
            if (!isRecord(assetValue) || typeof assetValue.id !== "string" || typeof assetValue.path !== "string" || !usedIds.has(assetValue.id))
                continue;
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
        const result = await dialog.showOpenDialog({ title: "Открыть Character Rig", properties: ["openFile"], filters: [{ name: "Character Rig", extensions: ["json"] }] });
        if (result.canceled)
            return { canceled: true };
        const filePath = result.filePaths[0];
        const parsed = parseJsonFile(await fs.readFile(filePath, "utf8"));
        validateCharacter(parsed);
        if (parsed.assets)
            parsed.assets = parsed.assets.map((asset) => ({ ...asset, path: path.resolve(path.dirname(filePath), asset.path) }));
        return { canceled: false, filePath, data: parsed };
    });
    ipcMain.handle("character:load-bundled", async (_event, relativeFolder) => {
        if (typeof relativeFolder !== "string" || !relativeFolder.trim()) {
            throw new Error("Некорректный путь bundled character.");
        }
        const safe = relativeFolder.replace(/\\/g, "/").replace(/\.\./g, "").replace(/^\/+/, "");
        const root = resolveCharactersRoot();
        const folderAbs = path.join(root, ...safe.split("/"));
        const assetsDir = path.join(folderAbs, "Assets");
        const name = path.basename(folderAbs) || "Bundled";
        // Prefer PNG Assets — never depend on character.json (avoids BOM / PowerShell JSON bugs).
        if (existsSync(path.join(assetsDir, "body.png"))) {
            const data = buildCharacterFromPngFolder(folderAbs, name);
            return { canceled: false, filePath: path.join(folderAbs, "character.json"), data };
        }
        const filePath = path.join(folderAbs, "character.json");
        if (!existsSync(filePath)) {
            throw new Error(`Нет Assets/body.png и нет character.json: ${folderAbs} (Characters root: ${root})`);
        }
        let parsed;
        try {
            parsed = parseJsonFile(await fs.readFile(filePath, "utf8"));
        }
        catch (reason) {
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
    ipcMain.handle("audio:import", async () => {
        const result = await dialog.showOpenDialog({
            title: "Импорт аудио (локально)",
            properties: ["openFile", "multiSelections"],
            filters: [{ name: "Audio", extensions: ["wav", "mp3", "ogg"] }],
        });
        if (result.canceled || !result.filePaths.length)
            return { canceled: true };
        const items = [];
        for (const filePath of result.filePaths) {
            const extension = path.extname(filePath).toLowerCase();
            if (![".wav", ".mp3", ".ogg"].includes(extension))
                throw new Error(`Неподдерживаемый аудиоформат: ${path.basename(filePath)}`);
            const duration = await probeMediaDuration(filePath);
            const mediaType = extension === ".wav" ? "audio/wav" : extension === ".ogg" ? "audio/ogg" : "audio/mpeg";
            items.push({
                path: filePath,
                name: path.parse(filePath).name,
                mediaType,
                duration,
            });
        }
        return { canceled: false, data: items };
    });
    ipcMain.handle("audio:synthesize", async (_event, text, outPath) => {
        try {
            const speech = String(text ?? "").trim();
            if (!speech)
                return { ok: false, error: "Пустой текст для озвучки." };
            if (speech.length > 2000)
                return { ok: false, error: "Текст слишком длинный (макс. 2000 символов)." };
            const target = assertSafePath(String(outPath), "WAV");
            if (path.extname(target).toLowerCase() !== ".wav")
                return { ok: false, error: "Локальный TTS сохраняет только .wav." };
            await fs.mkdir(path.dirname(target), { recursive: true });
            const stamp = Date.now();
            const scriptPath = path.join(os.tmpdir(), `kcs-tts-${stamp}.ps1`);
            const textPath = path.join(os.tmpdir(), `kcs-tts-${stamp}.txt`);
            const outListPath = path.join(os.tmpdir(), `kcs-tts-${stamp}-out.txt`);
            // Avoid embedding user text/paths inside PowerShell source (Cyrillic + quotes break Speak('...')).
            await fs.writeFile(textPath, speech, "utf8");
            await fs.writeFile(outListPath, target, "utf8");
            const script = [
                "$ErrorActionPreference = 'Stop'",
                "Add-Type -AssemblyName System.Speech",
                "$speechText = [System.IO.File]::ReadAllText($env:KCS_TTS_TEXT, [System.Text.Encoding]::UTF8)",
                "$wavePath = [System.IO.File]::ReadAllText($env:KCS_TTS_OUT, [System.Text.Encoding]::UTF8).Trim()",
                "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
                "try {",
                "  $synth.SetOutputToWaveFile($wavePath)",
                "  $synth.Speak($speechText)",
                "} finally {",
                "  $synth.Dispose()",
                "}",
            ].join("\r\n");
            await fs.writeFile(scriptPath, script, "utf8");
            const result = await new Promise((resolve) => {
                const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
                    windowsHide: true,
                    shell: false,
                    env: {
                        ...process.env,
                        KCS_TTS_TEXT: textPath,
                        KCS_TTS_OUT: outListPath,
                    },
                });
                let stderr = "";
                child.stderr.on("data", (chunk) => { stderr += String(chunk); });
                child.on("error", (error) => resolve({ ok: false, error: error.message }));
                child.on("close", (code) => {
                    if (code === 0)
                        resolve({ ok: true });
                    else
                        resolve({ ok: false, error: stderr || `TTS exit code ${code}` });
                });
            });
            await Promise.all([
                fs.rm(scriptPath, { force: true }).catch(() => undefined),
                fs.rm(textPath, { force: true }).catch(() => undefined),
                fs.rm(outListPath, { force: true }).catch(() => undefined),
            ]);
            if (!result.ok)
                return result;
            try {
                await fs.access(target);
            }
            catch {
                return { ok: false, error: "TTS завершился, но WAV-файл не создан." };
            }
            const duration = await probeMediaDuration(target);
            return { ok: true, path: target, duration };
        }
        catch (reason) {
            return { ok: false, error: reason instanceof Error ? reason.message : String(reason) };
        }
    });
    ipcMain.handle("export:choose-directory", async (_event, defaultPath) => {
        const result = await dialog.showOpenDialog({
            title: "Выберите папку экспорта",
            properties: ["openDirectory", "createDirectory"],
            defaultPath: typeof defaultPath === "string" && defaultPath ? defaultPath : undefined,
        });
        if (result.canceled || !result.filePaths[0])
            return { canceled: true };
        return { canceled: false, path: result.filePaths[0] };
    });
    ipcMain.handle("export:choose-save-file", async (_event, defaultName, filters) => {
        if (typeof defaultName !== "string" || !Array.isArray(filters))
            throw new Error("Некорректные параметры диалога сохранения.");
        const result = await dialog.showSaveDialog({
            title: "Сохранить экспорт",
            defaultPath: defaultName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_"),
            filters: filters.map((filter) => ({
                name: String(filter.name),
                extensions: Array.isArray(filter.extensions) ? filter.extensions.map(String) : [],
            })),
        });
        if (result.canceled || !result.filePath)
            return { canceled: true };
        return { canceled: false, filePath: result.filePath };
    });
    ipcMain.handle("export:ensure-directory", async (_event, targetPath) => {
        try {
            const resolved = assertSafePath(String(targetPath), "Папка");
            let existed = false;
            try {
                const stats = await fs.stat(resolved);
                existed = stats.isDirectory();
            }
            catch {
                existed = false;
            }
            await fs.mkdir(resolved, { recursive: true });
            return { ok: true, existed, path: resolved };
        }
        catch (reason) {
            return { ok: false, error: reason instanceof Error ? reason.message : String(reason) };
        }
    });
    ipcMain.handle("export:path-exists", async (_event, targetPath) => {
        try {
            await fs.access(assertSafePath(String(targetPath), "Путь"));
            return true;
        }
        catch {
            return false;
        }
    });
    ipcMain.handle("export:join-path", async (_event, ...parts) => {
        if (!parts.every((part) => typeof part === "string"))
            throw new Error("join-path ожидает строки.");
        return path.join(...parts);
    });
    ipcMain.handle("export:resolve-path", async (_event, assetPath, projectPath) => {
        return resolveAssetPath(String(assetPath), typeof projectPath === "string" ? projectPath : undefined);
    });
    ipcMain.handle("export:write-png", async (_event, filePath, bytes) => {
        try {
            const resolved = assertPngPath(String(filePath));
            const buffer = bytes instanceof Uint8Array ? Buffer.from(bytes) : Buffer.from(bytes);
            if (buffer.length < 8 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
                return { ok: false, error: "Буфер не является PNG." };
            }
            await fs.mkdir(path.dirname(resolved), { recursive: true });
            await fs.writeFile(resolved, buffer);
            return { ok: true, path: resolved };
        }
        catch (reason) {
            return { ok: false, error: reason instanceof Error ? reason.message : String(reason) };
        }
    });
    ipcMain.handle("export:write-text", async (_event, filePath, contents) => {
        try {
            const resolved = path.resolve(String(filePath));
            const text = String(contents ?? "");
            await fs.mkdir(path.dirname(resolved), { recursive: true });
            await fs.writeFile(resolved, text, "utf8");
            return { ok: true, path: resolved };
        }
        catch (reason) {
            return { ok: false, error: reason instanceof Error ? reason.message : String(reason) };
        }
    });
    ipcMain.handle("export:create-temp-dir", async (_event, prefix) => {
        try {
            const safePrefix = String(prefix ?? "kcs-").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "kcs-";
            const dir = await fs.mkdtemp(path.join(os.tmpdir(), safePrefix));
            return { ok: true, path: dir };
        }
        catch (reason) {
            return { ok: false, error: reason instanceof Error ? reason.message : String(reason) };
        }
    });
    ipcMain.handle("export:remove-directory", async (_event, targetPath) => {
        try {
            const resolved = assertSafePath(String(targetPath), "Temp");
            const tempRoot = path.resolve(os.tmpdir());
            if (!resolved.startsWith(tempRoot))
                return { ok: false, error: "Удаление разрешено только для временных папок." };
            await fs.rm(resolved, { recursive: true, force: true });
            return { ok: true };
        }
        catch (reason) {
            return { ok: false, error: reason instanceof Error ? reason.message : String(reason) };
        }
    });
    ipcMain.handle("export:check-ffmpeg", async () => {
        const ffmpegPath = resolveFfmpegPath();
        return await new Promise((resolve) => {
            const child = spawn(ffmpegPath, ["-version"], { windowsHide: true, shell: false });
            let stdout = "";
            let stderr = "";
            child.stdout.on("data", (chunk) => { stdout += String(chunk); });
            child.stderr.on("data", (chunk) => { stderr += String(chunk); });
            child.on("error", (error) => resolve({ ok: false, error: error.message, path: ffmpegPath }));
            child.on("close", (code) => {
                if (code === 0)
                    resolve({ ok: true, path: ffmpegPath, version: (stdout || stderr).split(/\r?\n/)[0] });
                else
                    resolve({ ok: false, path: ffmpegPath, error: stderr || `FFmpeg exit code ${code}` });
            });
        });
    });
    ipcMain.handle("export:run-ffmpeg", async (_event, rawArgs, logPath) => {
        const args = assertFfmpegArgs(rawArgs);
        const logFile = assertSafePath(String(logPath), "FFmpeg log");
        const ffmpegPath = resolveFfmpegPath();
        exportInProgress = true;
        return await new Promise((resolve) => {
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
                if (code === 0)
                    resolve({ ok: true, code: 0, logPath: logFile });
                else
                    resolve({ ok: false, code: code ?? 1, error: stderr.slice(-2000) || `FFmpeg exit code ${code}`, logPath: logFile });
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
    ipcMain.handle("export:open-path", async (_event, targetPath) => {
        try {
            const resolved = assertSafePath(String(targetPath), "Open");
            const result = await shell.openPath(resolved);
            return result ? { ok: false, error: result } : { ok: true };
        }
        catch (reason) {
            return { ok: false, error: reason instanceof Error ? reason.message : String(reason) };
        }
    });
    ipcMain.handle("export:set-busy", async (_event, busy) => {
        exportInProgress = Boolean(busy);
        return { ok: true };
    });
}
function createWindow() {
    const window = new BrowserWindow({
        title: "KRX Cartoon Studio",
        width: 1540,
        height: 980,
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
    window.once("ready-to-show", () => window.show());
    window.on("close", (event) => {
        if (!exportInProgress && !ffmpegProcess)
            return;
        const choice = dialog.showMessageBoxSync(window, {
            type: "warning",
            buttons: ["Продолжить экспорт", "Прервать и закрыть"],
            defaultId: 0,
            cancelId: 0,
            title: "Экспорт выполняется",
            message: "Идёт экспорт. Закрыть приложение и прервать процесс?",
        });
        if (choice === 0) {
            event.preventDefault();
            return;
        }
        if (ffmpegProcess && !ffmpegProcess.killed)
            ffmpegProcess.kill();
        ffmpegProcess = null;
        exportInProgress = false;
    });
    window.on("closed", () => { if (mainWindow === window)
        mainWindow = null; });
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl)
        void window.loadURL(devUrl);
    else
        void window.loadFile(resolveRendererIndex());
}
app.whenReady().then(() => {
    registerIpc();
    createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0)
        createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin")
    app.quit(); });
app.on("before-quit", () => {
    if (ffmpegProcess && !ffmpegProcess.killed)
        ffmpegProcess.kill();
    ffmpegProcess = null;
});
//# sourceMappingURL=main.js.map