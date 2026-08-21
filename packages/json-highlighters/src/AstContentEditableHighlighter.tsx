import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { tokenizeWithPositions, type TokenizeResult } from "./lib/jsonTokenizer";
import { formatJson, INDENT_OPTIONS, type IndentStyle } from "./lib/formatJson";
import { themeAttr, type JsonHighlighterTheme } from "./lib/theme";

const DEFAULT_JSON = '{\n  "hello": "world"\n}';

export interface AstContentEditableHighlighterProps {
  /** Начальный JSON-текст (компонент неконтролируемый — дальше редактируется сам). */
  initialJson?: string;
  /** Заголовок панели; передайте `null`, чтобы не рендерить его вовсе. */
  title?: string | null;
  /** "system" (по умолчанию) следует prefers-color-scheme хоста; "light"/"dark" — явно. */
  theme?: JsonHighlighterTheme;
  /** Вызывается с текущим текстом на каждое изменение (ввод, Tab, форматирование). */
  onChange?: (text: string) => void;
}

function escapeHtml(raw: string): string {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Строит HTML-строку с подсветкой на основе токенов — используется для
 * прямой подмены `innerHTML`, поэтому результат именно HTML-строка, а не JSX. */
function buildHighlightedHtml(text: string, result: TokenizeResult = tokenizeWithPositions(text)): string {
  let html = "";
  let cursor = 0;

  for (const t of result.tokens) {
    if (t.start > cursor) html += escapeHtml(text.slice(cursor, t.start));
    const chunk = escapeHtml(text.slice(t.start, t.end));
    const cls = t.type === "whitespace" || t.type === "punctuation" ? null : `json-${t.type}`;
    html += cls ? `<span class="${cls}">${chunk}</span>` : chunk;
    cursor = t.end;
  }
  if (cursor < text.length) html += escapeHtml(text.slice(cursor));

  // Полностью пустой editable-элемент в некоторых браузерах теряет «якорь»
  // для курсора; пробел нулевой ширины сохраняет фокусируемость/редактируемость.
  return html.length > 0 ? html : "&#8203;";
}

/** Символьное смещение курсора внутри «плоского» текстового содержимого `element`. */
function getCaretOffset(element: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(element);
  preCaretRange.setEnd(range.endContainer, range.endOffset);
  return preCaretRange.toString().length;
}

/** Обратная операция к `getCaretOffset` — обходит текстовые узлы, чтобы
 * поставить курсор обратно на то же «плоское» символьное смещение после
 * подмены `innerHTML`. */
function setCaretOffset(element: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  let remaining = offset;
  let placed = false;

  function walk(node: Node): void {
    if (placed) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) {
        range.setStart(node, remaining);
        range.collapse(true);
        placed = true;
        return;
      }
      remaining -= length;
      return;
    }
    for (const child of Array.from(node.childNodes)) {
      walk(child);
      if (placed) return;
    }
  }

  walk(element);
  if (!placed) {
    range.selectNodeContents(element);
    range.collapse(false);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * AST-подход, вариант Б: редактирование происходит прямо внутри
 * раскрашенного элемента `contentEditable`, без наложения прозрачной
 * textarea поверх него.
 *
 * `contentEditable` конфликтует с любым фреймворком, который пытается
 * владеть его содержимым на каждом рендере (замена innerHTML сбрасывает
 * курсор), поэтому содержимое этого элемента намеренно НЕ управляется
 * React после монтирования — обновления происходят императивно.
 * Перекраска сделана с дебаунсом (а не на каждое нажатие), чтобы быстрый
 * набор текста не прерывался заменой DOM, а символьная позиция курсора
 * сохраняется перед каждой перекраской и восстанавливается после.
 */
export function AstContentEditableHighlighter({
  initialJson = DEFAULT_JSON,
  title = "AST contentEditable",
  theme = "system",
  onChange,
}: AstContentEditableHighlighterProps) {
  const editorRef = useRef<HTMLPreElement>(null);
  const rawTextRef = useRef(initialJson);
  const debounceTimer = useRef<number | undefined>(undefined);
  const [status, setStatus] = useState<TokenizeResult>(() => tokenizeWithPositions(initialJson));
  const [indentStyle, setIndentStyle] = useState<IndentStyle>("2");

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = buildHighlightedHtml(initialJson);

    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
    // Заполняем содержимое только один раз при монтировании — дальше DOM
    // этого элемента управляется императивно, а не пропсами/состоянием.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function recolor() {
    const el = editorRef.current;
    if (!el) return;
    const text = rawTextRef.current;
    const caret = getCaretOffset(el);
    const result = tokenizeWithPositions(text);
    setStatus(result);
    el.innerHTML = buildHighlightedHtml(text, result);
    setCaretOffset(el, caret);
  }

  function handleFormat() {
    const el = editorRef.current;
    if (!el) return;
    // Кнопка задизейблена при status.valid === false, но на всякий случай
    // подстрахуемся: без валидного текста форматировать нечего.
    if (!status.valid) return;

    // Отменяем ожидающий дебаунс — иначе он через ~400мс перекрасит поверх
    // отформатированного текста ещё раз со старым сохранённым курсором.
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);

    const formatted = formatJson(rawTextRef.current, indentStyle);
    rawTextRef.current = formatted;
    const result = tokenizeWithPositions(formatted);
    setStatus(result);
    el.innerHTML = buildHighlightedHtml(formatted, result);
    // После переформатирования старая позиция курсора уже не имеет
    // смысла (текст пересобран заново) — ставим курсор в конец.
    setCaretOffset(el, formatted.length);
    el.focus();
    onChange?.(formatted);
  }

  function handleInput(e: FormEvent<HTMLPreElement>) {
    // Просто запоминаем текущий текст в ref (без setState — это не должно
    // триггерить рендер) и переставляем таймер дебаунса. Пока пользователь
    // печатает быстро, перекраска постоянно откладывается.
    const text = e.currentTarget.textContent ?? "";
    rawTextRef.current = text;
    onChange?.(text);
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(recolor, 400);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLPreElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      // execCommand устарел, но остаётся единственным надёжным
      // кросс-браузерным способом вставить текст в contentEditable в
      // позицию курсора без ручной реализации вставки через Range/Selection
      // — для демо-проекта достаточно; в продакшен-редакторе стоит
      // использовать полноценную библиотеку редактирования.
      document.execCommand("insertText", false, "  ");
      const text = e.currentTarget.textContent ?? "";
      rawTextRef.current = text;
      onChange?.(text);
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(recolor, 400);
    }
  }

  return (
    <div className="json-viewer json-viewer--ast-contenteditable" data-theme={themeAttr(theme)}>
      {title !== null && <h3>{title}</h3>}
      <div className="json-viewer__toolbar">
        <label htmlFor="ast-ce-indent-select">Отступ:</label>
        <select
          id="ast-ce-indent-select"
          className="json-viewer__select"
          value={indentStyle}
          onChange={(e) => setIndentStyle(e.target.value as IndentStyle)}
        >
          {INDENT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="json-viewer__format-btn"
          onClick={handleFormat}
          disabled={!status.valid}
          title={status.valid ? undefined : "Сначала исправьте JSON — форматированию нужно валидное дерево"}
        >
          Форматировать
        </button>
      </div>
      <p
        className={`json-viewer__status ${
          status.valid ? "json-viewer__status--ok" : "json-viewer__status--error"
        }`}
      >
        {status.valid ? "✓ JSON валиден" : `⚠ ${status.error} — перекраска через ~400мс после паузы в наборе`}
      </p>
      <pre
        ref={editorRef}
        className="json-viewer__editable"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        aria-label="Редактируемый JSON-текст (contentEditable AST-подсветка)"
      />
    </div>
  );
}

export default AstContentEditableHighlighter;
