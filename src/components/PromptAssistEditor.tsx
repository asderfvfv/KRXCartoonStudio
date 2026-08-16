import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react";
import {
  analyzePromptInlineHints,
  applyAutocomplete,
  buildProjectPromptCatalog,
  getPromptAutocomplete,
  insertChipIntoPrompt,
  type PromptSuggestItem,
} from "../domain/promptAssist";

interface PromptAssistEditorProps {
  value: string;
  disabled?: boolean;
  rows?: number;
  characters: Array<{ name: string }>;
  assets: Array<{ name: string; mediaType: string }>;
  onChange(value: string): void;
}

export function PromptAssistEditor({
  value,
  disabled,
  rows = 12,
  characters,
  assets,
  onChange,
}: PromptAssistEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(true);

  const catalog = useMemo(
    () => buildProjectPromptCatalog({ characters, assets }),
    [assets, characters],
  );
  const autocomplete = useMemo(
    () => getPromptAutocomplete({ text: value, caret, catalog }),
    [value, caret, catalog],
  );
  const hints = useMemo(
    () => analyzePromptInlineHints({ text: value, characters, assets }),
    [assets, characters, value],
  );

  const characterChips = useMemo(
    () => catalog.filter((item) => item.kind === "character"),
    [catalog],
  );
  const propChips = useMemo(
    () => catalog.filter((item) => item.kind === "prop").slice(0, 16),
    [catalog],
  );

  useEffect(() => {
    if (autocomplete?.items.length) {
      setOpen(true);
      setActive(0);
    } else {
      setOpen(false);
    }
  }, [autocomplete]);

  const syncCaret = (event: SyntheticEvent<HTMLTextAreaElement>) => {
    setCaret(event.currentTarget.selectionStart ?? 0);
  };

  const accept = (item: PromptSuggestItem) => {
    if (!autocomplete) return;
    const next = applyAutocomplete(value, autocomplete.replaceFrom, autocomplete.replaceTo, item.value);
    onChange(next.text);
    setOpen(false);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    });
  };

  const insertChip = (name: string, kind: "character" | "prop") => {
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? caret;
    const next = insertChipIntoPrompt(value, pos, name, kind);
    onChange(next.text);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || !autocomplete?.items.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => (value + 1) % autocomplete.items.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => (value + autocomplete.items.length - 1) % autocomplete.items.length);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
      event.preventDefault();
      const item = autocomplete.items[active] ?? autocomplete.items[0];
      if (item) accept(item);
    }
  };

  return (
    <div className="prompt-assist">
      <details className="prompt-guide" open={guideOpen} onToggle={(event) => setGuideOpen(event.currentTarget.open)}>
        <summary>Как писать промпт (коротко)</summary>
        <ol className="prompt-guide-list">
          <li><strong># Название</strong> — заголовок мультика.</li>
          <li><strong>Characters:</strong> имена героев через запятую — как в списке ригов (Огонёк, Морозко…).</li>
          <li><strong>Props:</strong> только отдельные картинки-предметы (мяч, меч). Не части тела (body, head) — это риг.</li>
          <li><strong>Genre:</strong> / <strong>Atmosphere:</strong> жанр и настроение (не герои).</li>
          <li><strong>## Сцена</strong> — новый кадр; ниже строки <strong>Имя: реплика</strong>.</li>
        </ol>
        <p className="hint">
          Кнопки «Из проекта» добавляют имя в нужную строку (Characters или Props), а не в середину текста.
        </p>
      </details>

      {(characterChips.length > 0 || propChips.length > 0) && (
        <div className="prompt-chip-bar" aria-label="Имена из проекта">
          <span className="prompt-chip-label">Герои → Characters</span>
          {characterChips.map((item) => (
            <button
              key={`c-${item.value}`}
              type="button"
              className="prompt-chip character"
              disabled={disabled}
              title={`Добавить «${item.label}» в строку Characters:`}
              onClick={() => insertChip(item.value, "character")}
            >
              {item.label}
            </button>
          ))}
          {propChips.length > 0 && (
            <>
              <span className="prompt-chip-label">Картинки → Props</span>
              {propChips.map((item) => (
                <button
                  key={`p-${item.value}`}
                  type="button"
                  className="prompt-chip prop"
                  disabled={disabled}
                  title={`Добавить «${item.label}» в строку Props:`}
                  onClick={() => insertChip(item.value, "prop")}
                >
                  {item.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {hints.length > 0 && (
        <ul className="prompt-inline-hints">
          {hints.map((hint) => (
            <li key={hint.id} className={`prompt-inline-hint ${hint.level}`}>
              <span>{hint.message}</span>
              {hint.apply && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(hint.apply!.transform(value));
                    textareaRef.current?.focus();
                  }}
                >
                  {hint.apply.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="prompt-assist-editor">
        <textarea
          ref={textareaRef}
          className="script-textarea"
          rows={rows}
          disabled={disabled}
          value={value}
          spellCheck={false}
          onChange={(event) => {
            onChange(event.target.value);
            setCaret(event.target.selectionStart ?? 0);
          }}
          onKeyUp={syncCaret}
          onClick={syncCaret}
          onSelect={syncCaret}
          onKeyDown={onKeyDown}
        />
        {open && autocomplete && autocomplete.items.length > 0 && (
          <ul className="prompt-suggest-list" role="listbox">
            {autocomplete.items.map((item, index) => (
              <li key={`${item.kind}-${item.value}-${index}`}>
                <button
                  type="button"
                  className={index === active ? "active" : ""}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    accept(item);
                  }}
                >
                  <strong>{item.label}</strong>
                  {item.detail && <small>{item.detail}</small>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="hint prompt-assist-foot">
        Tab / Enter — подставить из списка · Esc — закрыть · чипы героев → Characters, картинки → Props
      </p>
    </div>
  );
}
