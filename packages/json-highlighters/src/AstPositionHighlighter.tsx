import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent, JSX, KeyboardEvent, UIEvent } from "react";
import { tokenizeWithPositions, type Token } from "./lib/jsonTokenizer";
import { formatJson, tryFormatJson, INDENT_OPTIONS, type IndentStyle } from "./lib/formatJson";
import { themeAttr, type JsonHighlighterTheme } from "./lib/theme";

const DEFAULT_JSON = '{\n  "hello": "world"\n}';

export interface AstPositionHighlighterProps {
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
 * AST-подход, вариант А: токенизатор, сохраняющий исходные позиции (см.
 * `src/lib/jsonTokenizer.ts`), позволяет остаться живым, посимвольно
 * выровненным наложением слоёв — тот же приём «прозрачная textarea поверх
 * цветного <pre>», что и у regex-подсветчика, — но при этом классифицирует
 * токены структурно (по контексту настоящего парсера, а не по догадке
 * regex), а не переформатирует значение заново. Раскраска пересчитывается
 * на каждое нажатие клавиши; дебаунс не нужен, потому что токенизация —
 * это дешёвый линейный проход по строке.
 */
function renderTokens(text: string, tokens: Token[]): JSX.Element[] {
  const els: JSX.Element[] = [];
  let cursor = 0; // до какого символа text мы уже дошли

  tokens.forEach((t, idx) => {
    // Пробел между токенами (например, между запятой и открывающей
    // кавычкой) не подсвечивается, но должен попасть в вывод как есть.
    if (t.start > cursor) {
      els.push(<span key={`gap-${idx}`}>{text.slice(cursor, t.start)}</span>);
    }
    const chunk = text.slice(t.start, t.end);
    const cls = t.type === "whitespace" || t.type === "punctuation" ? undefined : `json-${t.type}`;
    els.push(
      <span key={idx} className={cls}>
        {chunk}
      </span>
    );
    cursor = t.end;
  });

  // Всё, что токенизатор не смог разобрать (разбор оборвался посреди
  // текста, или в конце остался «мусор») — рендерим обычным текстом, чтобы
  // напечатанное никогда не пропадало, просто без подсветки.
  if (cursor < text.length) {
    els.push(<span key="tail">{text.slice(cursor)}</span>);
  }

  return els;
}

export function AstPositionHighlighter({
  initialJson = DEFAULT_JSON,
  title = "AST-токенизатор + позиции",
  theme = "system",
  onChange,
}: AstPositionHighlighterProps) {
  const [indentStyle, setIndentStyle] = useState<IndentStyle>("2");
  // Если initialJson уже сжат в одну строку — сразу форматируем при монтировании.
  const [rawText, setRawText] = useState(() => tryFormatJson(initialJson, "2"));
  const highlightRef = useRef<HTMLPreElement>(null);

  // Токенизируем на каждое изменение текста; result.valid/result.error
  // используются и для статус-строки, и для того, чтобы не подсвечивать
  // неразобранный хвост.
  const result = useMemo(() => tokenizeWithPositions(rawText), [rawText]);
  const highlighted = useMemo(
    () => renderTokens(rawText, result.tokens),
    [rawText, result.tokens]
  );

  function setText(next: string) {
    setRawText(next);
    onChange?.(next);
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
  }

  function handleFormat() {
    // Кнопка задизейблена, пока result.valid === false, так что здесь
    // JSON.parse внутри formatJson не должен падать — но на случай
    // расхождения между токенизатором и JSON.parse подстрахуемся try/catch.
    try {
      setText(formatJson(rawText, indentStyle));
    } catch {
      // Токенизатор уже показывает статус ошибки выше — второй раз не дублируем.
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    // Как и в regex-варианте: если результат вставки — валидный JSON,
    // сразу форматируем его вместо сжатой в одну строку простыни.
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
    // Синхронизируем скролл цветного <pre> со скроллом textarea — это
    // два разных DOM-элемента, у каждого свой независимый scrollTop.
    const pre = highlightRef.current;
    if (!pre) return;
    pre.scrollTop = e.currentTarget.scrollTop;
    pre.scrollLeft = e.currentTarget.scrollLeft;
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Tab вставляет два пробела вместо перевода фокуса на следующий элемент.
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
    <div className="json-viewer json-viewer--ast-position" data-theme={themeAttr(theme)}>
      {title !== null && <h3>{title}</h3>}
      <div className="json-viewer__toolbar">
        <label htmlFor="ast-position-indent-select">Отступ:</label>
        <select
          id="ast-position-indent-select"
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
          disabled={!result.valid}
          title={result.valid ? undefined : "Сначала исправьте JSON — форматированию нужно валидное дерево"}
        >
          Форматировать
        </button>
      </div>
      <p
        className={`json-viewer__status ${
          result.valid ? "json-viewer__status--ok" : "json-viewer__status--error"
        }`}
      >
        {result.valid ? "✓ JSON валиден" : `⚠ ${result.error}`}
      </p>
      <div className="json-viewer__editor">
        <pre ref={highlightRef} className="json-viewer__highlight" aria-hidden="true">
          {highlighted}
        </pre>
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
          aria-label="Редактируемый JSON-текст (AST-токенизатор с позициями)"
        />
      </div>
    </div>
  );
}

export default AstPositionHighlighter;
