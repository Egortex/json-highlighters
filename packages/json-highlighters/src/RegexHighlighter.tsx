import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent, KeyboardEvent, UIEvent } from "react";
import { formatJson, tryFormatJson, INDENT_OPTIONS, type IndentStyle } from "./lib/formatJson";
import { themeAttr, type JsonHighlighterTheme } from "./lib/theme";

const DEFAULT_JSON = '{\n  "hello": "world"\n}';

export interface RegexHighlighterProps {
  /** Начальный JSON-текст (компонент неконтролируемый — дальше редактируется сам). */
  initialJson?: string;
  /** Заголовок панели; передайте `null`, чтобы не рендерить его вовсе. */
  title?: string | null;
  /** "system" (по умолчанию) следует prefers-color-scheme хоста; "light"/"dark" — явно. */
  theme?: JsonHighlighterTheme;
  /** Вызывается с текущим текстом на каждое изменение. */
  onChange?: (text: string) => void;
}

/**
 * Экранирует HTML-спецсимволы в сыром тексте ДО того, как в него
 * вставляются span-теги. Это должно происходить первым шагом, иначе мы
 * заэкранируем собственную сгенерированную разметку, а недоверенное
 * строковое содержимое внутри `initialJson` сможет внедрить произвольный HTML.
 */
function escapeHtml(raw: string): string {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Классический regex-хайлайтер JSON-синтаксиса.
 *
 * Один regex ловит, по порядку альтернатив:
 *  - строку в двойных кавычках (с учётом экранированных символов вроде \"
 *    внутри), опционально с хвостовым пробелом + двоеточием
 *  - литералы true / false
 *  - литерал null
 *  - числа, включая знак минус, дробную часть и экспоненту
 *
 * Отличие ключа от строки-значения: найденная строка считается ключом
 * объекта ТОЛЬКО если сразу после неё (прямо внутри самого совпадения,
 * через суффикс `(?:\s*:)?`) идёт необязательный пробел и двоеточие.
 * `JSON.stringify` всегда рендерит ключи как `"key": value`, поэтому этот
 * трюк без lookahead (захват хвостового двоеточия прямо в совпадение)
 * надёжно отличает ключи от обычных строк-значений, за которыми в валидном
 * JSON двоеточие никогда не следует.
 *
 * Поскольку это работает с сырым текстом, а не с разобранной структурой,
 * подсветка продолжает нормально работать, даже когда текст временно
 * невалиден как JSON (например, посреди редактирования) — в отличие от
 * AST-подхода, которому для рендера нужен успешный разбор.
 */
const JSON_TOKEN_REGEX =
  /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?)|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

function highlightJson(json: string): string {
  const escaped = escapeHtml(json);

  return escaped.replace(JSON_TOKEN_REGEX, (match) => {
    let cls = "json-number";

    if (/^"/.test(match)) {
      // Совпадение — строка в кавычках; это ключ, если она заканчивается
      // (опциональным пробелом +) двоеточием, иначе — обычная строка-значение.
      cls = /:\s*$/.test(match) ? "json-key" : "json-string";
    } else if (/true|false/.test(match)) {
      cls = "json-boolean";
    } else if (/null/.test(match)) {
      cls = "json-null";
    }

    return `<span class="${cls}">${match}</span>`;
  });
}

export function RegexHighlighter({
  initialJson = DEFAULT_JSON,
  title = "Regex-подсветка",
  theme = "system",
  onChange,
}: RegexHighlighterProps) {
  const [indentStyle, setIndentStyle] = useState<IndentStyle>("2");
  // Если initialJson уже сжат в одну строку (например, только что пришёл
  // по сети как есть) — сразу форматируем его текущим стилем отступа,
  // чтобы не показывать нечитаемую простыню сразу при монтировании.
  const [rawText, setRawText] = useState(() => tryFormatJson(initialJson, "2"));
  // Regex-подсветка не требует валидного JSON, а вот форматирование —
  // требует (нужно реально распарсить текст, а не просто раскрасить его),
  // поэтому ошибка форматирования хранится отдельно от самой подсветки.
  const [formatError, setFormatError] = useState<string | null>(null);
  const highlightRef = useRef<HTMLPreElement>(null);

  // Regex-подсветке не нужна валидная JSON-структура, поэтому она
  // безусловно пересчитывается на каждое нажатие клавиши — текст
  // подсвечивается «как есть», валиден он или нет.
  // Без лишнего хвостового "\n" — иначе высота pre и textarea расходится
  // на одну строку, что может по-разному включать/выключать скроллбар у
  // каждого слоя и сдвигать точки переноса строк между ними.
  const highlighted = useMemo(() => highlightJson(rawText), [rawText]);

  function setText(next: string) {
    setRawText(next);
    onChange?.(next);
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
  }

  function handleFormat() {
    try {
      setText(formatJson(rawText, indentStyle));
      setFormatError(null);
    } catch (err) {
      setFormatError(err instanceof Error ? err.message : "Не удалось отформатировать");
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    // Считаем, каким будет текст ПОСЛЕ вставки (сама вставка ещё не
    // произошла — событие paste срабатывает до неё), и если результат —
    // валидный JSON, сразу форматируем его вместо того, чтобы оставлять
    // вставленный кусок сжатым в одну строку. Если невалиден — просто даём
    // вставке пройти как обычно (preventDefault не вызываем).
    const el = e.currentTarget;
    const pasted = e.clipboardData.getData("text/plain");
    const { selectionStart, selectionEnd, value } = el;
    const merged = value.slice(0, selectionStart) + pasted + value.slice(selectionEnd);
    try {
      const formatted = formatJson(merged, indentStyle);
      e.preventDefault();
      setText(formatted);
    } catch {
      // невалидный JSON после вставки — обычная вставка как есть.
    }
  }

  function handleScroll(e: UIEvent<HTMLTextAreaElement>) {
    // Слой с подсветкой (<pre>) — отдельный DOM-элемент со своим скроллом,
    // поэтому его нужно синхронизировать со скроллом textarea вручную.
    const pre = highlightRef.current;
    if (!pre) return;
    pre.scrollTop = e.currentTarget.scrollTop;
    pre.scrollLeft = e.currentTarget.scrollLeft;
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Небольшое удобство редактирования: Tab вставляет два пробела вместо
    // того, чтобы уводить фокус с редактора.
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart, selectionEnd, value } = el;
      const next = value.slice(0, selectionStart) + "  " + value.slice(selectionEnd);
      setText(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = selectionStart + 2;
      });
    }
  }

  return (
    <div className="json-viewer json-viewer--regex" data-theme={themeAttr(theme)}>
      {title !== null && <h3>{title}</h3>}
      <div className="json-viewer__toolbar">
        <label htmlFor="regex-indent-select">Отступ:</label>
        <select
          id="regex-indent-select"
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
        <button type="button" className="json-viewer__format-btn" onClick={handleFormat}>
          Форматировать
        </button>
        {formatError && <span className="json-viewer__format-error">⚠ {formatError}</span>}
      </div>
      <div className="json-viewer__editor">
        <pre
          ref={highlightRef}
          className="json-viewer__highlight"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
        <textarea
          className="json-viewer__textarea"
          value={rawText}
          onChange={handleChange}
          onPaste={handlePaste}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Редактируемый JSON-текст (regex-подсветка)"
        />
      </div>
    </div>
  );
}

export default RegexHighlighter;
