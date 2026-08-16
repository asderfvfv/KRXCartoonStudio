import { namesFuzzyMatch, parseCartoonPrompt } from "./promptCartoon";
import { isRigPartAssetName } from "./rigPartNames";

export { isRigPartAssetName } from "./rigPartNames";

export type PromptSuggestKind = "character" | "prop" | "speaker" | "keyword" | "snippet";

export interface PromptSuggestItem {
  kind: PromptSuggestKind;
  value: string;
  label: string;
  detail?: string;
}

export interface PromptInlineHint {
  id: string;
  level: "tip" | "warn" | "error";
  message: string;
  /** Optional one-click fill into the prompt. */
  apply?: { label: string; transform: (text: string) => string };
}

export interface PromptAutocompleteResult {
  items: PromptSuggestItem[];
  replaceFrom: number;
  replaceTo: number;
  context: "characters" | "props" | "speaker" | "genre" | "atmosphere";
}

const GENRE_KEYWORDS = ["сказка", "приключение", "комедия", "драма", "экшен", "дружба"];
const ATMOSPHERE_KEYWORDS = [
  "солнечная поляна",
  "дружелюбно",
  "ночь",
  "домик",
  "дорога",
  "праздник",
  "тревожно",
];

export function buildProjectPromptCatalog(project: {
  characters: Array<{ name: string }>;
  assets: Array<{ name: string; mediaType: string }>;
}): PromptSuggestItem[] {
  const items: PromptSuggestItem[] = [];
  const seen = new Set<string>();
  for (const character of project.characters) {
    const name = character.name.trim();
    if (!name) continue;
    const key = `c:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ kind: "character", value: name, label: name, detail: "герой (риг)" });
  }
  for (const asset of project.assets) {
    if (!asset.mediaType.startsWith("image/")) continue;
    const name = asset.name.trim();
    if (!name || isRigPartAssetName(name)) continue;
    const key = `p:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ kind: "prop", value: name, label: name, detail: "предмет / фон" });
  }
  for (const word of GENRE_KEYWORDS) {
    items.push({ kind: "keyword", value: word, label: word, detail: "жанр" });
  }
  for (const word of ATMOSPHERE_KEYWORDS) {
    items.push({ kind: "keyword", value: word, label: word, detail: "атмосфера" });
  }
  return items;
}

function lineBounds(text: string, caret: number): { lineStart: number; lineEnd: number; line: string; offsetInLine: number } {
  const safe = Math.max(0, Math.min(text.length, caret));
  const lineStart = text.lastIndexOf("\n", safe - 1) + 1;
  let lineEnd = text.indexOf("\n", safe);
  if (lineEnd < 0) lineEnd = text.length;
  return {
    lineStart,
    lineEnd,
    line: text.slice(lineStart, lineEnd),
    offsetInLine: safe - lineStart,
  };
}

function tokenAt(line: string, offsetInLine: number): { start: number; end: number; token: string } {
  let start = offsetInLine;
  while (start > 0 && /[^\s,:]/.test(line[start - 1]!)) start -= 1;
  let end = offsetInLine;
  while (end < line.length && /[^\s,:]/.test(line[end]!)) end += 1;
  return { start, end, token: line.slice(start, end) };
}

function filterByPrefix(items: PromptSuggestItem[], query: string, kinds: PromptSuggestKind[]): PromptSuggestItem[] {
  const q = query.trim().toLowerCase();
  return items
    .filter((item) => kinds.includes(item.kind))
    .filter((item) => {
      if (!q) return true;
      return item.value.toLowerCase().includes(q) || item.label.toLowerCase().includes(q);
    })
    .slice(0, 10);
}

/** Autocomplete at caret: Characters / Props / speaker / Genre / Atmosphere. */
export function getPromptAutocomplete(options: {
  text: string;
  caret: number;
  catalog: PromptSuggestItem[];
}): PromptAutocompleteResult | null {
  const { text, caret, catalog } = options;
  const { lineStart, line, offsetInLine } = lineBounds(text, caret);
  const trimmedStart = line.match(/^\s*/)?.[0].length ?? 0;
  const body = line.slice(trimmedStart);
  const bodyOffset = offsetInLine - trimmedStart;
  if (bodyOffset < 0) return null;

  const charMatch = body.match(/^(Characters|Персонажи)\s*:\s*(.*)$/i);
  if (charMatch && bodyOffset >= (charMatch[0].length - (charMatch[2]?.length ?? 0))) {
    const listPart = charMatch[2] ?? "";
    const listStartInLine = trimmedStart + body.length - listPart.length;
    const local = offsetInLine - listStartInLine;
    const { start, end, token } = tokenAt(listPart, Math.max(0, local));
    const items = filterByPrefix(catalog, token, ["character"]);
    if (!items.length) return null;
    return {
      items,
      replaceFrom: lineStart + listStartInLine + start,
      replaceTo: lineStart + listStartInLine + end,
      context: "characters",
    };
  }

  const propMatch = body.match(/^(Props|Предметы)\s*:\s*(.*)$/i);
  if (propMatch && bodyOffset >= (propMatch[0].length - (propMatch[2]?.length ?? 0))) {
    const listPart = propMatch[2] ?? "";
    const listStartInLine = trimmedStart + body.length - listPart.length;
    const local = offsetInLine - listStartInLine;
    const { start, end, token } = tokenAt(listPart, Math.max(0, local));
    const items = filterByPrefix(catalog, token, ["prop"]);
    if (!items.length) return null;
    return {
      items,
      replaceFrom: lineStart + listStartInLine + start,
      replaceTo: lineStart + listStartInLine + end,
      context: "props",
    };
  }

  const genreMatch = body.match(/^(Genre|Жанр)\s*:\s*(.*)$/i);
  if (genreMatch) {
    const listPart = genreMatch[2] ?? "";
    const listStartInLine = trimmedStart + body.length - listPart.length;
    const local = offsetInLine - listStartInLine;
    const { start, end, token } = tokenAt(listPart, Math.max(0, local));
    const items = filterByPrefix(catalog, token, ["keyword"]).filter((item) => GENRE_KEYWORDS.includes(item.value));
    if (!items.length) return null;
    return {
      items,
      replaceFrom: lineStart + listStartInLine + start,
      replaceTo: lineStart + listStartInLine + end,
      context: "genre",
    };
  }

  const atmMatch = body.match(/^(Atmosphere|Атмосфера)\s*:\s*(.*)$/i);
  if (atmMatch) {
    const listPart = atmMatch[2] ?? "";
    const listStartInLine = trimmedStart + body.length - listPart.length;
    const local = offsetInLine - listStartInLine;
    const { start, end, token } = tokenAt(listPart, Math.max(0, local));
    const items = filterByPrefix(catalog, token, ["keyword"]).filter((item) => ATMOSPHERE_KEYWORDS.includes(item.value));
    if (!items.length) return null;
    return {
      items,
      replaceFrom: lineStart + listStartInLine + start,
      replaceTo: lineStart + listStartInLine + end,
      context: "atmosphere",
    };
  }

  // Dialogue speaker: "Name" at line start before optional ":"
  if (!/^(#|Characters|Персонажи|Props|Предметы|Genre|Жанр|Atmosphere|Атмосфера)\b/i.test(body)) {
    const speakerMatch = body.match(/^([^:\n]*?)(:)?$/);
    if (speakerMatch) {
      const namePart = speakerMatch[1] ?? "";
      // Only when caret is still in the name part (before colon content)
      const colonIndex = body.indexOf(":");
      if (colonIndex >= 0 && bodyOffset > colonIndex) return null;
      if (namePart.length > 24) return null;
      if (/\s{2,}/.test(namePart)) return null;
      const token = namePart.trim();
      if (token.length < 1) return null;
      // Require at least 1 char or empty at start of "Name:"
      const items = filterByPrefix(catalog, token, ["character"]).map((item) => ({
        ...item,
        kind: "speaker" as const,
        value: `${item.value}: `,
        label: item.value,
        detail: "реплика",
      }));
      if (!items.length) return null;
      const nameStart = trimmedStart + (namePart.match(/^\s*/)?.[0].length ?? 0);
      const nameEnd = trimmedStart + namePart.length + (speakerMatch[2] ? 1 : 0);
      return {
        items,
        replaceFrom: lineStart + nameStart,
        replaceTo: lineStart + nameEnd,
        context: "speaker",
      };
    }
  }

  return null;
}

export function applyAutocomplete(text: string, replaceFrom: number, replaceTo: number, value: string): { text: string; caret: number } {
  const before = text.slice(0, replaceFrom);
  const after = text.slice(replaceTo);
  // On list lines, keep comma separation tidy when inserting mid-list
  let insertion = value;
  if (!insertion.endsWith(": ") && before.length && /,\s*$/.test(before) === false) {
    // no-op
  }
  const next = `${before}${insertion}${after}`;
  return { text: next, caret: before.length + insertion.length };
}

export function ensureMetaLine(text: string, key: string, values: string[]): string {
  const unique = [...new Set(values.map((item) => item.trim()).filter(Boolean))];
  if (!unique.length) return text;
  const line = `${key}: ${unique.join(", ")}`;
  const re = new RegExp(`^\\s*${key}\\s*:.*$`, "im");
  if (re.test(text)) return text.replace(re, line);
  const titleMatch = text.match(/^#\s*.+$/m);
  if (titleMatch && titleMatch.index != null) {
    const end = titleMatch.index + titleMatch[0].length;
    return `${text.slice(0, end)}\n${line}${text.slice(end)}`;
  }
  return `${line}\n${text}`;
}

export function insertCharactersFromProject(text: string, names: string[]): string {
  return ensureMetaLine(text, "Characters", names);
}

export function insertPropsFromProject(text: string, names: string[]): string {
  return ensureMetaLine(text, "Props", names.filter((item) => !isRigPartAssetName(item)));
}

/** Append one name to Characters: / Props: (create the line if missing). */
export function appendNameToMetaLine(
  text: string,
  keys: string,
  preferredKey: string,
  name: string,
): { text: string; caret: number } {
  const clean = name.trim();
  if (!clean) return { text, caret: text.length };
  const re = new RegExp(`^(\\s*(?:${keys})\\s*:\\s*)(.*)$`, "im");
  const match = text.match(re);
  if (match && match.index != null) {
    const prefix = match[1]!;
    const existing = match[2]!
      .split(/[,;/]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (existing.some((item) => item.toLowerCase() === clean.toLowerCase())) {
      const caret = match.index + prefix.length + match[2]!.length;
      return { text, caret };
    }
    const nextList = [...existing, clean].join(", ");
    const next = `${text.slice(0, match.index)}${prefix}${nextList}${text.slice(match.index + match[0].length)}`;
    const caret = match.index + prefix.length + nextList.length;
    return { text: next, caret };
  }
  const next = ensureMetaLine(text, preferredKey, [clean]);
  const lineMatch = next.match(new RegExp(`^\\s*${preferredKey}\\s*:.*$`, "im"));
  const caret = lineMatch && lineMatch.index != null
    ? lineMatch.index + lineMatch[0].length
    : next.length;
  return { text: next, caret };
}

/** Chip click: put hero into Characters, picture into Props — never dump into random caret. */
export function insertChipIntoPrompt(
  text: string,
  caret: number,
  name: string,
  kind: "character" | "prop",
): { text: string; caret: number } {
  const auto = getPromptAutocomplete({
    text,
    caret,
    catalog: [{ kind, value: name, label: name }],
  });
  if (auto && (
    (kind === "character" && (auto.context === "characters" || auto.context === "speaker"))
    || (kind === "prop" && auto.context === "props")
  )) {
    const pick = auto.context === "speaker" ? `${name}: ` : name;
    return applyAutocomplete(text, auto.replaceFrom, auto.replaceTo, pick);
  }
  if (kind === "character") {
    return appendNameToMetaLine(text, "Characters|Персонажи|Герои", "Characters", name);
  }
  return appendNameToMetaLine(text, "Props|Предметы|Вещи", "Props", name);
}

export function insertNameAtCaret(text: string, caret: number, name: string): { text: string; caret: number } {
  const auto = getPromptAutocomplete({
    text,
    caret,
    catalog: [{ kind: "character", value: name, label: name }, { kind: "prop", value: name, label: name }],
  });
  if (auto) {
    const pick = auto.context === "props"
      ? name
      : auto.context === "speaker"
        ? `${name}: `
        : name;
    return applyAutocomplete(text, auto.replaceFrom, auto.replaceTo, pick);
  }
  const before = text.slice(0, caret);
  const after = text.slice(caret);
  const needsComma = /(?:Characters|Персонажи|Props|Предметы)\s*:[^\n]*$/i.test(before)
    && /:\s*\S/.test(before.slice(before.lastIndexOf("\n") + 1))
    && !/,\s*$/.test(before);
  const insertion = needsComma ? `, ${name}` : name;
  return { text: `${before}${insertion}${after}`, caret: before.length + insertion.length };
}

/** Live tips while editing — complements analyzePromptReadiness. */
export function analyzePromptInlineHints(options: {
  text: string;
  characters: Array<{ name: string }>;
  assets: Array<{ name: string; mediaType: string }>;
}): PromptInlineHint[] {
  const hints: PromptInlineHint[] = [];
  const plan = parseCartoonPrompt(options.text);
  const projectNames = options.characters.map((item) => item.name.trim()).filter(Boolean);
  const imageNames = options.assets
    .filter((item) => item.mediaType.startsWith("image/"))
    .map((item) => item.name.trim())
    .filter((name) => name && !isRigPartAssetName(name));

  if (!/^\s*(Characters|Персонажи)\s*:/im.test(options.text) && projectNames.length) {
    hints.push({
      id: "insert-cast",
      level: "tip",
      message: `В проекте есть герои: ${projectNames.slice(0, 6).join(", ")}${projectNames.length > 6 ? "…" : ""}. Можно вставить в Characters.`,
      apply: {
        label: "Characters ← проект",
        transform: (text) => insertCharactersFromProject(text, projectNames),
      },
    });
  }

  if (!/^\s*(Props|Предметы)\s*:/im.test(options.text) && imageNames.length) {
    hints.push({
      id: "insert-props",
      level: "tip",
      message: `Картинки проекта можно добавить в Props: ${imageNames.slice(0, 5).join(", ")}${imageNames.length > 5 ? "…" : ""}.`,
      apply: {
        label: "Props ← проект",
        transform: (text) => insertPropsFromProject(text, imageNames.slice(0, 12)),
      },
    });
  }

  if (plan.scenes.length === 0 && options.text.trim().length > 20) {
    hints.push({
      id: "need-scene",
      level: "warn",
      message: "Нет сцен — добавьте «## Название» и строки «Имя: реплика».",
      apply: {
        label: "＋ ## Сцена",
        transform: (text) => `${text.trimEnd()}\n\n## Сцена 1\n`,
      },
    });
  }

  const declared = new Set(plan.characters.map((name) => name.toLowerCase()));
  const speakers = [...new Set(plan.scenes.flatMap((scene) => scene.lines.map((line) => line.speaker)))];
  for (const speaker of speakers) {
    if (!declared.size) break;
    if (![...declared].some((name) => namesFuzzyMatch(name, speaker))) {
      hints.push({
        id: `speaker-${speaker}`,
        level: "warn",
        message: `«${speaker}» говорит, но нет в Characters — добавьте в список или поправьте имя.`,
        apply: {
          label: `+ ${speaker}`,
          transform: (text) => insertCharactersFromProject(text, [...plan.characters, speaker]),
        },
      });
    }
  }

  for (const name of plan.characters) {
    const inProject = projectNames.some((item) => namesFuzzyMatch(item, name));
    if (!inProject && projectNames.length) {
      const close = projectNames.find((item) =>
        item.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(item.toLowerCase()),
      );
      if (close && close !== name) {
        hints.push({
          id: `typo-${name}`,
          level: "tip",
          message: `Похоже на риг «${close}» вместо «${name}».`,
          apply: {
            label: `→ ${close}`,
            transform: (text) => text.replace(new RegExp(escapeRegExp(name), "g"), close),
          },
        });
      }
    }
  }

  if (!hints.length && plan.scenes.length > 0) {
    hints.push({
      id: "autocomplete-tip",
      level: "tip",
      message: "Подсказка: в Characters / Props / в начале реплики жмите Tab или ↑↓ Enter — подставятся имена из проекта.",
    });
  }

  return hints.slice(0, 6);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
