/** User-facing export / FFmpeg error messages (local, no network). */

const ACTION_HINT =
  "Что делать: проверьте папку вывода и права записи, формат MP4/WebM, что в сцене есть актёры; при ошибке FFmpeg откройте журнал ниже.";

export function formatExportUserError(
  raw: string | null | undefined,
  options?: { logPath?: string | null; kind?: string | null },
): string {
  const source = (raw ?? "").trim() || "Неизвестная ошибка экспорта.";
  const lower = source.toLowerCase();
  let message = source;

  if (/ffmpeg/.test(lower) && /(not found|не найден|enoent|missing)/.test(lower)) {
    message = "FFmpeg не найден внутри приложения. Переустановите из release (START-KRX.bat) — кодировщик должен лежать рядом с программой.";
  } else if (/(enospc|no space|недостаточно места)/.test(lower)) {
    message = "Недостаточно места на диске для кадров или видео. Освободите место или выберите другой диск.";
  } else if (/(eacces|eperm|permission|access denied|отказано в доступе)/.test(lower)) {
    message = "Нет доступа к папке вывода. Выберите другую папку в «Экспорт» или сохраните на диск, куда есть запись.";
  } else if (/(ebusy|resource busy|locked|занят)/.test(lower)) {
    message = "Файл занят другой программой (плеер/проводник). Закройте его и повторите экспорт.";
  } else if (/путь|path|invalid/.test(lower) && /output|вывод|папк/.test(lower)) {
    message = `${source}\nУкажите существующую папку вывода кнопкой «…» в панели Экспорт.`;
  } else if (/cancel|отмен/.test(lower)) {
    return source;
  }

  if (options?.logPath && !message.includes(options.logPath)) {
    message += `\nЖурнал FFmpeg: ${options.logPath}`;
  }

  if (!/что делать:/i.test(message) && !/отмен/.test(lower)) {
    message += `\n${ACTION_HINT}`;
  }

  if (options?.kind === "montage" && !/Монтаж:/i.test(message)) {
    message += "\nМонтаж: проверьте, что включены сцены и выбран MP4/WebM (не PNG-последовательность).";
  }

  return message;
}

/** Short status line without multi-line hints. */
export function formatExportStatusError(raw: string | null | undefined): string {
  const full = formatExportUserError(raw);
  const first = full.split("\n")[0]?.trim() ?? "Ошибка экспорта";
  return first.length > 160 ? `${first.slice(0, 157)}…` : first;
}
