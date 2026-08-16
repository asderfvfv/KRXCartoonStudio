/**
 * MindCore generator (uniform / balanced / hot / cold / coverage / mixed)
 * adapted for local cartoon + ad prompts. No lottery numbers, no cloud.
 */

export const STORY_STRATEGIES = ["uniform", "balanced", "mixed", "coverage", "hot", "cold"] as const;
export type StoryStrategy = (typeof STORY_STRATEGIES)[number];

export type StoryKind = "cartoon" | "ad";

export interface StoryGenInput {
  kind: StoryKind;
  strategy: StoryStrategy;
  count?: number;
  maxOverlap?: number;
  idea?: string;
  product?: string;
  characters: string[];
  props: string[];
  assets?: Array<{ name: string; width?: number; height?: number }>;
  seed?: number;
  /** Ads: include cartoon cast. Default false — product shots only. */
  withCast?: boolean;
}

export interface StoryVariant {
  id: string;
  kind: StoryKind;
  strategy: StoryStrategy;
  title: string;
  prompt: string;
  explanation: string;
  beatIds: string[];
  characters: string[];
  thoughts: string[];
}

export interface ClassifiedMedia {
  /** Only product / UI shots for the stage — never the whole project library. */
  props: string[];
  /** Wide stills treated as optional backgrounds (names only; not dumped as props). */
  backgrounds: string[];
  productHint: string | null;
}

interface BeatTemplate {
  id: string;
  title: string;
  genre: string;
  atmosphere: string;
  scenes: Array<{ heading: string; lines: string[]; motion: string }>;
}

const CARTOON_BEATS: BeatTemplate[] = [
  {
    id: "visit",
    title: "В гости",
    genre: "сказка",
    atmosphere: "солнечная поляна, дружелюбно",
    scenes: [
      { heading: "Встреча", motion: "входит слева, машет рукой, рад", lines: ["{a}: Эй, {b}! Пойдём к {c} в гости!", "{b}: Давай! Он давно сидит дома."] },
      { heading: "Дорога", motion: "идут по дороге", lines: ["{a}: Почти пришли.", "{b}: Сейчас позовём его."] },
      { heading: "Домик", motion: "входит, машет, ура", lines: ["{a}: {c}, выходи!", "{c}: Скрип-привет! Я выхожу!"] },
    ],
  },
  {
    id: "adventure",
    title: "Приключение",
    genre: "приключение",
    atmosphere: "дорога, ожидание",
    scenes: [
      { heading: "Старт", motion: "входит слева, машет, идут по дороге", lines: ["{a}: Карта говорит — туда!", "{b}: Я с тобой. {c}, держись рядом."] },
      { heading: "Препятствие", motion: "бегут, прыжок", lines: ["{c}: Мост скрипит…", "{a}: Шаг за шагом. Мы справимся."] },
      { heading: "Финиш", motion: "ура, машет, рад", lines: ["{b}: Мы на месте!", "{a}: Вот это приключение."] },
    ],
  },
  {
    id: "funny",
    title: "Комедия",
    genre: "комедия",
    atmosphere: "праздник, живо",
    scenes: [
      { heading: "Идея", motion: "входит, машет, смех", lines: ["{a}: Давай устроим сюрприз!", "{b}: Только без катастрофы."] },
      { heading: "Провал", motion: "прыжок, смех", lines: ["{c}: Это был торт? Теперь это шляпа.", "{a}: Зато смешно!"] },
      { heading: "Финал", motion: "ура, рад, машет", lines: ["{b}: Ладно, это мило.", "{c}: Повторим завтра?"] },
    ],
  },
  {
    id: "friendship",
    title: "Дружба",
    genre: "дружба",
    atmosphere: "тёплая, спокойная",
    scenes: [
      { heading: "Ссора", motion: "входит, злится", lines: ["{a}: Ты меня не слушал!", "{b}: Я просто торопился."] },
      { heading: "Разговор", motion: "машет, спокойно идут", lines: ["{c}: Вы оба важны. Скажите это.", "{a}: Прости. Без тебя скучно."] },
      { heading: "Мир", motion: "рад, ура, машет", lines: ["{b}: И без тебя тоже.", "{c}: Вот так и надо."] },
    ],
  },
  {
    id: "night",
    title: "Ночной дозор",
    genre: "сказка",
    atmosphere: "ночь, домик",
    scenes: [
      { heading: "Вечер", motion: "входит, машет", lines: ["{a}: Темнеет. Остаёмся у {c}.", "{b}: Я за фонарь."] },
      { heading: "Шорох", motion: "идёт, тревожно", lines: ["{c}: Это ветер. Или нет?", "{a}: Мы вместе — не страшно."] },
      { heading: "Утро", motion: "рад, ура, машет", lines: ["{b}: Смотри, рассвет!", "{c}: Лучшая ночь."] },
    ],
  },
  {
    id: "race",
    title: "Гонка",
    genre: "экшен",
    atmosphere: "дорога, динамично",
    scenes: [
      { heading: "Старт", motion: "входит, бегут, машет", lines: ["{a}: На счёт три!", "{b}: Я уже бегу."] },
      { heading: "Поворот", motion: "прыжок, бегут", lines: ["{c}: Слева яма!", "{a}: Прыжок — и дальше."] },
      { heading: "Финиш", motion: "ура, рад, машет", lines: ["{b}: Ничья?", "{c}: Дружба финишировала первой."] },
    ],
  },
  {
    id: "gift",
    title: "Подарок",
    genre: "сказка",
    atmosphere: "праздник, тепло",
    scenes: [
      { heading: "Секрет", motion: "входит слева, машет, рад", lines: ["{a}: Тихо. У {c} сегодня сюрприз!", "{b}: Я уже прячу коробку."] },
      { heading: "Вручение", motion: "идёт к центру, прыжок", lines: ["{c}: Это мне? Настоящий подарок?", "{a}: Конечно тебе."] },
      { heading: "Радость", motion: "ура, смех, машет", lines: ["{b}: Смотри, как блестит!", "{c}: Лучший день."] },
    ],
  },
  {
    id: "lost",
    title: "Находка",
    genre: "приключение",
    atmosphere: "поляна, любопытство",
    scenes: [
      { heading: "Пропажа", motion: "входит, тревожно, идёт", lines: ["{a}: Куда делось? Только что было тут.", "{b}: Ищем вместе."] },
      { heading: "Поиск", motion: "бегут, прыжок", lines: ["{c}: Слева куст! Смотри!", "{a}: Шаг за шагом."] },
      { heading: "Нашли", motion: "ура, рад, машет", lines: ["{b}: Нашли! Вот оно.", "{c}: Победа маленьких сыщиков."] },
    ],
  },
  {
    id: "weather",
    title: "Погода",
    genre: "комедия",
    atmosphere: "небо, живо",
    scenes: [
      { heading: "Тучи", motion: "входит, удивляется", lines: ["{a}: Небо нахмурилось.", "{b}: Зонтик или бежим?"] },
      { heading: "Ливень", motion: "бегут, прыжок, смех", lines: ["{c}: Это не дождь — это душ!", "{a}: Тогда танцуем."] },
      { heading: "Радуга", motion: "ура, рад, машет", lines: ["{b}: Радуга! Мы победили тучу.", "{c}: И не промокли душой."] },
    ],
  },
  {
    id: "helper",
    title: "Починка",
    genre: "дружба",
    atmosphere: "домик, мастерская",
    scenes: [
      { heading: "Сломалось", motion: "входит, злится", lines: ["{c}: Скрип… Опять заело.", "{a}: Мы починим. Не паникуй."] },
      { heading: "Работа", motion: "идёт, машет", lines: ["{b}: Держи винт. Я слева.", "{c}: Почти… ещё чуть-чуть."] },
      { heading: "Готово", motion: "прыжок, ура, рад", lines: ["{a}: Работает!", "{c}: Скрип-спасибо, команда."] },
    ],
  },
  {
    id: "concert",
    title: "Концерт",
    genre: "комедия",
    atmosphere: "праздник, сцена",
    scenes: [
      { heading: "Репетиция", motion: "входит, машет, смех", lines: ["{a}: Раз, два — и поём!", "{b}: Я за ритм, ты за слова."] },
      { heading: "Номер", motion: "прыжок, рад", lines: ["{c}: Публика — это мы трое.", "{a}: Тогда громче!"] },
      { heading: "Бис", motion: "ура, машет, смех", lines: ["{b}: Ещё раз!", "{c}: Лучший концерт двора."] },
    ],
  },
  {
    id: "treasure",
    title: "Клад",
    genre: "приключение",
    atmosphere: "дорога, загадка",
    scenes: [
      { heading: "Карта", motion: "входит слева, смотри, машет", lines: ["{a}: Крестик на карте. Это клад!", "{b}: Или просто камень."] },
      { heading: "Копаем", motion: "бегут, прыжок", lines: ["{c}: Яма всё глубже…", "{a}: Ещё лопата — и сюрприз."] },
      { heading: "Сокровище", motion: "ура, рад, машет", lines: ["{b}: Блестит! Настоящий клад.", "{c}: Делим по-честному."] },
    ],
  },
];

const AD_BEATS: BeatTemplate[] = [
  {
    id: "ad-hook-product-cta",
    title: "Реклама: хук → продукт → призыв",
    genre: "реклама",
    atmosphere: "студийный фон, ярко, динамично",
    scenes: [
      { heading: "Хук", motion: "входит слева, машет рукой, смотри", lines: ["{a}: Стой! Смотри — это то, чего всем не хватало.", "{b}: Покажи. Я уже рад."] },
      { heading: "Продукт", motion: "идёт к центру, прыжок, ура", lines: ["{a}: {product} — быстро, локально, без облака.", "{c}: Три сцены — и ролик готов."] },
      { heading: "Призыв", motion: "машет, прыжок, ура, жми", lines: ["{b}: Попробуй сейчас. Жми!", "{a}: Собери ролик. Это {product}."] },
    ],
  },
  {
    id: "ad-problem-fix",
    title: "Реклама: проблема → решение",
    genre: "реклама",
    atmosphere: "студийный фон, уверенно",
    scenes: [
      { heading: "Проблема", motion: "входит, злится", lines: ["{a}: Опять ждать облако?", "{b}: И платить за каждый ролик…"] },
      { heading: "Решение", motion: "входит справа, машет, рад", lines: ["{c}: {product} работает на этом ПК.", "{a}: Герои, голос, сборка — здесь."] },
      { heading: "Призыв", motion: "прыжок, ура, машет, жми", lines: ["{b}: Коротко. Ярко. Своё. Жми!", "{a}: Включи {product} сегодня."] },
    ],
  },
  {
    id: "ad-demo",
    title: "Реклама: демо за 15 секунд",
    genre: "реклама",
    atmosphere: "студийный фон, чисто, без поляны",
    scenes: [
      { heading: "Секунда 1", motion: "входит слева, смотри, машет", lines: ["{a}: Смотри: герой говорит."] },
      { heading: "Секунда 8", motion: "идёт, рад", lines: ["{b}: Сцена. Голос. Без лишнего шума.", "{c}: Это {product}."] },
      { heading: "Секунда 15", motion: "прыжок, ура, жми", lines: ["{a}: Сними свой ролик. Локально. Жми!"] },
    ],
  },
  {
    id: "ad-testimonial",
    title: "Реклама: отзыв героев",
    genre: "реклама",
    atmosphere: "студийный фон, дружелюбно",
    scenes: [
      { heading: "Отзыв", motion: "входит, машет, рад", lines: ["{a}: Я не монтажёр. Я просто собрал мультик.", "{b}: И рекламу тоже."] },
      { heading: "Доказательство", motion: "идёт, смотри", lines: ["{c}: {product} подставляет героев по именам.", "{a}: Никакого облака."] },
      { heading: "Призыв", motion: "прыжок, ура, машет, жми", lines: ["{b}: Хочешь так же? Жми — открой {product}."] },
    ],
  },
  {
    id: "ad-before-after",
    title: "Реклама: было / стало",
    genre: "реклама",
    atmosphere: "студийный фон, ярко",
    scenes: [
      { heading: "Было", motion: "входит, злится", lines: ["{a}: Скучный кадр. Тишина. Никто не смотрит.", "{b}: Так продукт не купят."] },
      { heading: "Стало", motion: "бегут, прыжок, ура", lines: ["{c}: А теперь — {product} в кадре!", "{a}: Герои оживают. Смотри!"] },
      { heading: "Покупка", motion: "машет, жми, рад", lines: ["{b}: Короткий ролик — длинный эффект.", "{a}: Жми и собери свой."] },
    ],
  },
  {
    id: "ad-countdown",
    title: "Реклама: отсчёт",
    genre: "реклама",
    atmosphere: "студийный фон, праздник",
    scenes: [
      { heading: "Три", motion: "входит слева, машет", lines: ["{a}: Три… Смотри сюда!"] },
      { heading: "Два", motion: "идёт, рад", lines: ["{b}: Два… Это {product}."] },
      { heading: "Один", motion: "прыжок, ура, жми", lines: ["{c}: Один — жми! Ролик твой."] },
    ],
  },
];

class SeedRng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }
  next(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }
}

export function weightedSample<T>(items: T[], weights: number[], k: number, rng: { next(): number }): T[] {
  const pool = [...items];
  const w = weights.map((value) => Math.max(1e-12, value));
  const chosen: T[] = [];
  const take = Math.min(k, pool.length);
  for (let n = 0; n < take; n += 1) {
    const total = w.reduce((sum, value) => sum + value, 0);
    let r = rng.next() * total;
    let idx = 0;
    for (let i = 0; i < w.length; i += 1) {
      r -= w[i]!;
      if (r <= 0) {
        idx = i;
        break;
      }
      idx = i;
    }
    chosen.push(pool[idx]!);
    pool.splice(idx, 1);
    w.splice(idx, 1);
  }
  return chosen;
}

const BEAT_KEYWORDS: Record<string, string[]> = {
  visit: ["гост", "навест", "выходи", "в гост", "порог", "дома"],
  adventure: ["приключ", "карт", "квест", "путешеств", "мост", "дорог", "тропин"],
  funny: ["смех", "шутк", "сюрприз", "торт", "смешн", "прикол", "комеди"],
  friendship: ["ссор", "друг", "прости", "обид", "дружб", "помирим"],
  night: ["ночь", "тёмн", "темнеет", "луна", "рассвет", "фонар", "дозор"],
  race: ["гонк", "беж", "финиш", "старт", "соревн", "кто быстре"],
  gift: ["подарок", "дар", "коробк", "день рожден", "сюрприз"],
  lost: ["потерял", "нашёл", "нашел", "пропал", "ищу", "находк"],
  weather: ["дождь", "снег", "ветер", "гроз", "зонтик", "погод", "туч"],
  helper: ["помог", "починить", "сломал", "чиним", "мастер", "винт"],
  concert: ["песн", "концерт", "поём", "поем", "гитар", "музык", "сцена"],
  treasure: ["клад", "сокровищ", "сундук", "копа", "крестик"],
};

function ideaTextOf(input: Pick<StoryGenInput, "idea" | "product">): string {
  return (input.idea || input.product || "").trim();
}

export function ideaBeatScores(beats: Array<{ id: string; title: string; genre: string }>, idea: string): number[] {
  const text = idea.trim().toLowerCase();
  if (!text) return beats.map(() => 0);
  return beats.map((beat) => {
    let score = 0;
    const keys = BEAT_KEYWORDS[beat.id] ?? [];
    for (const key of keys) {
      if (text.includes(key)) score += 4;
    }
    if (text.includes(beat.title.toLowerCase())) score += 6;
    if (text.includes(beat.genre.toLowerCase())) score += 2;
    return score;
  });
}

function pickCast(names: string[], rng: SeedRng, min = 2, idea = ""): string[] {
  const unique = [...new Set(names.map((item) => item.trim()).filter(Boolean))];
  const fallback = ["Огонёк", "Морозко", "Винтик"];
  const pool = unique.length ? unique : fallback;
  const ideaLower = idea.toLowerCase();
  const mentioned = pool.filter((name) => ideaLower && ideaLower.includes(name.toLowerCase()));
  const rest = pool.filter((name) => !mentioned.includes(name));
  const k = Math.min(3, Math.max(min, pool.length >= 3 ? 3 : pool.length));
  const ordered = [
    ...mentioned,
    ...(rest.length ? weightedSample(rest, rest.map(() => 1), Math.max(0, k - mentioned.length), rng) : []),
  ];
  while (ordered.length < min) ordered.push(fallback[ordered.length] ?? fallback[0]!);
  return ordered.slice(0, Math.max(min, k));
}

function isGenericIdea(idea: string): boolean {
  const text = idea.trim().toLowerCase();
  return !text || text === "наш мультик" || text.length < 3;
}

function lineMentionsIdea(line: string, idea: string): boolean {
  const words = idea.toLowerCase().split(/[\s,.;:!?«»"'-]+/).filter((word) => word.length > 3);
  if (!words.length) return idea.length > 0 && line.toLowerCase().includes(idea.toLowerCase().slice(0, 8));
  return words.some((word) => line.toLowerCase().includes(word));
}

/** Fold the user's idea + dropped prop names into the beat so the cartoon is not a generic template. */
function spiceCartoonBeat(beat: BeatTemplate, idea: string, props: string[]): BeatTemplate {
  const clone: BeatTemplate = {
    ...beat,
    scenes: beat.scenes.map((scene) => ({ ...scene, lines: [...scene.lines] })),
  };
  if (!isGenericIdea(idea)) {
    const hook = idea.trim().replace(/[.!?]+$/g, "");
    const firstScene = clone.scenes[0];
    if (firstScene && !firstScene.lines.some((line) => lineMentionsIdea(line, idea))) {
      firstScene.lines.unshift(`{a}: Слушай! ${hook}.`);
    }
    const lastScene = clone.scenes[clone.scenes.length - 1];
    if (lastScene && hook.length <= 42 && !lastScene.lines.some((line) => lineMentionsIdea(line, idea))) {
      lastScene.lines.push(`{a}: Вот это да: ${hook}!`);
    }
  }
  const propName = props[0]?.replace(/[-_]+/g, " ").trim();
  if (propName) {
    const mid = clone.scenes[Math.min(1, clone.scenes.length - 1)]!;
    if (!mid.lines.some((line) => line.toLowerCase().includes(propName.toLowerCase()))) {
      mid.lines.push(`{b}: Смотри, это ${propName}!`);
    }
  }
  return clone;
}

function fillLine(line: string, cast: string[], product: string): string {
  const a = cast[0] ?? "Огонёк";
  const b = cast[1] ?? cast[0] ?? "Морозко";
  const c = cast[2] ?? cast[1] ?? a;
  return line
    .replaceAll("{a}", a)
    .replaceAll("{b}", b)
    .replaceAll("{c}", c)
    .replaceAll("{product}", product);
}

/** Strip «Имя:» and fill product for title-card ads (no monsters on stage). */
function toTitleCaption(line: string, product: string): string {
  const text = line.includes(":") ? line.replace(/^[^:]+:\s*/, "") : line;
  return `Титр: ${fillLine(text, ["", "", ""], product).replace(/\s{2,}/g, " ").trim()}`;
}

const PRODUCT_AD_CAPTIONS = [
  { heading: "Хук", motion: "влетает, зум, тряска", lines: ["Стой. Смотри — это {product}."] },
  { heading: "Кадр", motion: "наезд камеры, пульс", lines: ["{product}: быстро, красиво, на твоём ПК."] },
  { heading: "Вау", motion: "прыжок масштаба, вспышка", lines: ["Секунда — и уже хочется нажать."] },
  { heading: "Доказательство", motion: "ken burns, плавный зум", lines: ["Без облака. Без подписки. Своё."] },
  { heading: "Эмоция", motion: "поворот, удар", lines: ["Короткий ролик — длинный эффект."] },
  { heading: "Призыв", motion: "pop, shake, жми", lines: ["Жми сейчас. Собери свой {product}."] },
];

/** One animated scene per product still — shows ALL picked images, not a random three. */
function buildProductOnlyAdPrompt(product: string, props: string[]): string {
  const shots = props.filter(Boolean).slice(0, 6);
  if (!shots.length) {
    return `# Реклама: ${product}\nGenre: реклама\nAtmosphere: студийный фон, динамично, вау\n\n## Ролик\n(pop, shake, жми)\nТитр: Жми сейчас — это ${product}.\n`;
  }
  const lines = [
    `# Реклама: ${product}`,
    `Props: ${shots.join(", ")}`,
    "Genre: реклама",
    "Atmosphere: студийный фон, динамично, вау",
    "",
  ];
  shots.forEach((propName, index) => {
    const cap = PRODUCT_AD_CAPTIONS[Math.min(index, PRODUCT_AD_CAPTIONS.length - 1)]!;
    const isLast = index === shots.length - 1;
    const heading = isLast && shots.length > 1 ? "Призыв" : (shots.length === 1 ? "Ролик" : cap.heading);
    const motion = isLast ? "pop, shake, жми" : cap.motion;
    const textLines = isLast
      ? [`Жми сейчас — это ${product}.`]
      : cap.lines.map((line) => fillLine(line, ["", "", ""], product));
    lines.push(`## ${heading} · ${propName}`);
    lines.push(`(${motion})`);
    for (const text of textLines) lines.push(`Титр: ${text}`);
    lines.push("");
  });
  return `${lines.join("\n").trim()}\n`;
}

function buildPrompt(
  kind: StoryKind,
  beat: BeatTemplate,
  cast: string[],
  product: string,
  props: string[],
  atmosphereExtra = "",
): string {
  const productOnly = kind === "ad" && cast.length === 0;
  if (productOnly) return buildProductOnlyAdPrompt(product, props);
  const title = kind === "ad" ? `Реклама: ${product}` : beat.title;
  const atmosphere = atmosphereExtra ? `${beat.atmosphere}, ${atmosphereExtra}` : beat.atmosphere;
  const lines = [
    `# ${title}`,
    `Characters: ${cast.join(", ")}`,
    props.length ? `Props: ${props.slice(0, 6).join(", ")}` : "",
    `Genre: ${beat.genre}`,
    `Atmosphere: ${atmosphere}`,
    "",
  ];
  for (const scene of beat.scenes) {
    lines.push(`## ${scene.heading}`);
    if (scene.motion) lines.push(`(${scene.motion})`);
    for (const line of scene.lines) lines.push(fillLine(line, cast, product));
    lines.push("");
  }
  return `${lines.filter((line, index) => line !== "" || lines[index - 1] !== "").join("\n").trim()}\n`;
}

/** Wide stills ≈ фон; portrait/UI ≈ продукт. Does not invent assets from the project. */
export function classifyStoryMedia(
  assets: Array<{ name: string; width?: number; height?: number }>,
  kind: StoryKind = "ad",
): ClassifiedMedia {
  const backgrounds: string[] = [];
  const candidates: Array<{ name: string; area: number; portrait: boolean }> = [];
  for (const asset of assets) {
    const name = asset.name.trim();
    if (!name) continue;
    const w = asset.width ?? 0;
    const h = asset.height ?? 0;
    const area = w * h;
    const wide = w >= Math.max(1, h) * 1.25;
    if (wide && w >= 900) {
      backgrounds.push(name);
      continue;
    }
    candidates.push({ name, area, portrait: h > w * 1.05 });
  }
  // Prefer portrait UI screenshots as product frames; then largest remaining.
  candidates.sort((a, b) => {
    if (a.portrait !== b.portrait) return a.portrait ? -1 : 1;
    return b.area - a.area;
  });
  const limit = kind === "ad" ? 6 : 4;
  const props = candidates.slice(0, limit).map((item) => item.name);
  const productHint = props[0]?.replace(/[-_]+/g, " ") ?? null;
  return { props, backgrounds, productHint };
}

function thinkAbout(input: StoryGenInput, variant: StoryVariant, product: string, classified: ClassifiedMedia): string[] {
  const thoughts: string[] = [];
  const withCast = input.kind === "cartoon" || input.withCast === true;
  if (withCast) {
    thoughts.push(`1. Герои: ${variant.characters.length ? variant.characters.join(", ") : "нет ригов — только если вы включили «с героями»"}.`);
  } else {
    thoughts.push("1. Реклама без героев: монстров / Огонька / Морозко на сцену не ставлю.");
  }
  thoughts.push(`2. Только ваши картинки: ${classified.props.length ? classified.props.join(", ") : "нет — положите PNG/JPG/видео в блок мозга"}.`);
  thoughts.push(`3. Задача: ${input.kind === "ad"
    ? `реклама «${product}» — каждый кадр с вау-анимацией (зум/влет/shake)`
    : `мультфильм${input.idea?.trim() ? ` «${input.idea.trim()}»` : ""} — шаблон «${variant.title}», жесты всем героям`}.`);
  thoughts.push(`4. Стратегия: ${strategyLabel(variant.strategy)}`);
  thoughts.push("5. Озвучку и музыку сам не включаю — только ваши галочки в блоке мозга.");
  thoughts.push("6. Всё локально, без облака.");
  return thoughts;
}

function overlapCount(a: string[], b: string[]): number {
  const set = new Set(a);
  return b.filter((id) => set.has(id)).length;
}

function strategyLabel(mode: StoryStrategy): string {
  if (mode === "uniform") return "Равномерный случайный выбор шаблона.";
  if (mode === "balanced") return "Сбалансированный набор: разные жанры рядом с «теорией» каталога.";
  if (mode === "hot") return "Горячие: чаще герои, которые уже есть в проекте.";
  if (mode === "cold") return "Холодные: реже используемые шаблоны и запасные герои.";
  if (mode === "coverage") return "Покрытие: шаблоны, которых ещё не было в этой пачке.";
  return "Смешанная стратегия MindCore (uniform / balanced / coverage / hot).";
}

function beatWeights(beats: BeatTemplate[], mode: StoryStrategy, usedIds: Set<string>, ideaScores: number[] = []): number[] {
  const n = beats.length;
  return beats.map((beat, index) => {
    let weight = 1;
    if (mode === "uniform") weight = 1;
    else if (mode === "balanced") {
      const mid = (n - 1) / 2;
      weight = 1 / (0.35 + Math.abs(index - mid) / n);
    } else if (mode === "hot") weight = n - index + 0.2;
    else if (mode === "cold") weight = index + 0.4;
    else if (mode === "coverage") weight = usedIds.has(beat.id) ? 0.35 : 2.4;
    const ideaBoost = ideaScores[index] ?? 0;
    if (ideaBoost > 0) weight *= 1 + ideaBoost * 3;
    return weight;
  });
}

function resolveProduct(kind: StoryKind, idea: string, product: string): string {
  const text = (product || idea).trim();
  if (text) return text.slice(0, 48);
  return kind === "ad" ? "KRX Cartoon Studio" : "наш мультик";
}

/** Generate unique local prompts (MindCore combo generator, story-shaped). */
export function generateStoryVariants(input: StoryGenInput): StoryVariant[] {
  const kind = input.kind;
  const count = Math.max(1, Math.min(5, input.count ?? 3));
  const maxOverlap = Math.max(0, Math.min(2, input.maxOverlap ?? 1));
  const rng = new SeedRng(input.seed ?? (Date.now() % 1_000_000_007));
  const beats = kind === "ad" ? AD_BEATS : CARTOON_BEATS;
  const classified = classifyStoryMedia(input.assets ?? input.props.map((name) => ({ name })), kind);
  // Never invent props from an empty pick list — empty means heroes-only.
  const props = classified.props;
  const product = resolveProduct(kind, input.idea ?? "", input.product || classified.productHint || "");
  const idea = kind === "cartoon" ? ideaTextOf(input) : "";
  const ideaScores = kind === "cartoon" ? ideaBeatScores(beats, idea) : beats.map(() => 0);
  const atmosphereExtra = classified.backgrounds[0] ? `кадр «${classified.backgrounds[0]}»` : "";
  const out: StoryVariant[] = [];
  const keys = new Set<string>();
  let usedOverlap = maxOverlap;
  const maxAttempts = count * 80;

  const tryFill = (limitOverlap: number) => {
    let attempts = 0;
    while (out.length < count && attempts < maxAttempts) {
      attempts += 1;
      let mode: StoryStrategy = input.strategy;
      if (input.strategy === "mixed") {
        const pool: StoryStrategy[] = ["uniform", "balanced", "coverage", "hot"];
        mode = pool[Math.floor(rng.next() * pool.length)]!;
      }
      const usedIds = new Set(out.flatMap((item) => item.beatIds));
      let picked = weightedSample(beats, beatWeights(beats, mode, usedIds, ideaScores), 1, rng)[0];
      if (!picked) continue;
      // First cartoon variant: if the idea clearly matches a beat, take that beat.
      if (kind === "cartoon" && out.length === 0) {
        const best = ideaScores.reduce((winner, score, index) => (score > winner.score ? { score, index } : winner), { score: 0, index: -1 });
        if (best.score >= 4 && beats[best.index]) picked = beats[best.index]!;
      }
      const withCast = kind === "cartoon" || input.withCast === true;
      const cast = withCast ? pickCast(input.characters, rng, 2, idea) : [];
      const beatForPrompt = kind === "cartoon" ? spiceCartoonBeat(picked, idea, props) : picked;
      const beatIds = [picked.id];
      let ok = true;
      for (const prev of out) {
        if (overlapCount(beatIds, prev.beatIds) > limitOverlap) {
          ok = false;
          break;
        }
      }
      if (!ok && !(kind === "ad" && cast.length === 0)) continue;
      const shotProps = [...props];
      if (kind === "ad" && cast.length === 0 && shotProps.length > 1) {
        const shift = out.length % shotProps.length;
        if (shift) shotProps.push(...shotProps.splice(0, shift));
      }
      const prompt = buildPrompt(kind, beatForPrompt, cast, product, shotProps, atmosphereExtra);
      const key = `${picked.id}|${cast.join(",")}|${shotProps.join(",")}|${prompt.slice(0, 100)}`;
      if (keys.has(key)) continue;
      keys.add(key);
      out.push({
        id: `story-${out.length + 1}`,
        kind,
        strategy: mode,
        title: kind === "ad" ? `Реклама: ${product}` : picked.title,
        prompt,
        explanation: kind === "ad" && cast.length === 0
          ? `${strategyLabel(mode)} Вау-анимация: зум, влёт, shake. Все ${shotProps.length || 0} кадра.`
          : `${strategyLabel(mode)}${kind === "cartoon" && idea ? ` Идея: «${idea.slice(0, 48)}».` : ""}`,
        beatIds,
        characters: cast,
        thoughts: [],
      });
    }
  };

  tryFill(usedOverlap);
  while (out.length < count && usedOverlap < 2) {
    usedOverlap += 1;
    tryFill(usedOverlap);
  }

  if (usedOverlap > maxOverlap) {
    for (const item of out) {
      item.explanation = `${item.explanation} Пересечение шаблонов ослаблено до ${usedOverlap}.`;
    }
  }
  for (const item of out) {
    item.thoughts = thinkAbout(input, item, product, classified);
  }
  if (kind === "cartoon" && out.length > 1) {
    const best = out.reduce((winner, item, index) => {
      const score = (ideaScores[beats.findIndex((beat) => beat.id === item.beatIds[0])] ?? 0)
        + (item.prompt.toLowerCase().includes(idea.toLowerCase().slice(0, 8)) ? 2 : 0);
      return score > winner.score ? { score, index } : winner;
    }, { score: -1, index: 0 });
    if (best.index > 0) {
      const [top] = out.splice(best.index, 1);
      if (top) out.unshift(top);
    }
  }
  return out;
}

/** One-shot «мозг»: думает, сравнивает варианты и отдаёт лучший промпт для сборки. */
export function thinkDirectorBrain(input: StoryGenInput): { thoughts: string[]; variant: StoryVariant | null } {
  const variants = generateStoryVariants({ ...input, count: Math.max(3, input.count ?? 3) });
  const variant = variants[0] ?? null;
  const thoughts = variant?.thoughts ?? ["Нет шаблона — добавьте героя или картинку."];
  if (variant && input.kind === "cartoon") {
    thoughts.unshift(`Выбран сюжет «${variant.title}» — лучше всего подходит к вашей идее и героям.`);
  }
  return { thoughts, variant };
}

export function storyStrategyTitle(strategy: StoryStrategy): string {
  const map: Record<StoryStrategy, string> = {
    uniform: "Равномерно",
    balanced: "Баланс",
    mixed: "Смешанно",
    coverage: "Покрытие",
    hot: "Горячие",
    cold: "Холодные",
  };
  return map[strategy];
}
