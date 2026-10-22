import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent, JSX, KeyboardEvent, UIEvent } from "react";
import { tokenizeWithPositions, type Token } from "./lib/jsonTokenizer";
import { formatJson, tryFormatJson, type IndentStyle } from "./lib/formatJson";
import { mapCaretAcrossFormat } from "./lib/caretMapping";
import { themeAttr, type JsonHighlighterTheme } from "./lib/theme";
import type { JsonEditorHandle, JsonValidity } from "./lib/editorApi";
import { useOverlaySync } from "./lib/overlaySync";

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
  /** Стиль отступа для автоформата при вставке и для `ref.format()` без аргумента. */
  indent?: IndentStyle;
  /** Вызывается при монтировании и при каждой смене валидности/текста ошибки. */
  onValidityChange?: (validity: JsonValidity) => void;
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
    /* v8 ignore next 3 -- tokenizeWithPositions уже сам явно токенизирует
     * весь whitespace (см. consumeWhitespace в jsonTokenizer.ts), так что
     * token.start всегда равен предыдущему cursor — реального разрыва между
     * соседними токенами при текущей реализации токенизатора не бывает;
     * оставлено как защита от будущих изменений грамматики. */
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

export const AstPositionHighlighter = forwardRef<JsonEditorHandle, AstPositionHighlighterProps>(function AstPositionHighlighter({
  initialJson = DEFAULT_JSON,
  title = "AST-токенизатор + позиции",
  theme = "system",
  onChange,
  indent = "2",
  onValidityChange,
}, ref) {
  // Если initialJson уже сжат в одну строку — сразу форматируем при монтировании.
  const [rawText, setRawText] = useState(() => tryFormatJson(initialJson, indent));
  const highlightRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useOverlaySync(highlightRef, textareaRef);

  // Токенизируем на каждое изменение текста; result.valid/result.error
  // уходят хосту через onValidityChange и заодно не дают подсвечивать
  // неразобранный хвост.
  const result = useMemo(() => tokenizeWithPositions(rawText), [rawText]);
  const highlighted = useMemo(
    () => renderTokens(rawText, result.tokens),
    [rawText, result.tokens]
  );

  useEffect(() => {
    onValidityChange?.(result.valid ? { valid: true } : { valid: false, error: result.error });
    // Колбэк хоста намеренно не в зависимостях — инлайн-функция менялась бы
    // на каждом рендере и дёргала бы уведомление без реальной смены статуса.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.valid, result.error]);

  useImperativeHandle(ref, () => ({ format }));

  function setText(next: string) {
    setRawText(next);
    onChange?.(next);
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
  }

  function format(style: IndentStyle = indent): boolean {
    if (!result.valid) return false;
    // На случай расхождения между токенизатором и JSON.parse внутри
    // formatJson подстрахуемся try/catch.
    const el = textareaRef.current;
    try {
      const formatted = formatJson(rawText, style);
      if (el) {
        // См. handlePaste: execCommand сохраняет шаг в нативном undo-стеке,
        // а mapCaretAcrossFormat не даёт курсору улететь в конец документа.
        const mappedCaret = mapCaretAcrossFormat(rawText, el.selectionStart, formatted);
        el.focus();
        el.setSelectionRange(0, el.value.length);
        document.execCommand("insertText", false, formatted);
        el.setSelectionRange(mappedCaret, mappedCaret);
      }
      // textareaRef всегда указывает на смонтированный <textarea> к моменту,
      // когда хост может вызвать ref.format(); эта ветка недостижима при обычном использовании.
      /* v8 ignore next */
      else {
        /* v8 ignore next */
        setText(formatted);
      }
      return true;
    } catch {
      /* v8 ignore next -- result.valid уже проверен выше; это защита от
       * расхождения токенизатора с JSON.parse. */
      return false;
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
      const formatted = formatJson(merged, indent);
      e.preventDefault();
      // См. RegexHighlighter.handlePaste: mapCaretAcrossFormat не даёт
      // курсору улететь в конец документа, а execCommand вместо setText
      // сохраняет вставку как один шаг нативного undo-стека вместо того,
      // чтобы полностью его сбросить программной заменой value.
      const caretAfterPaste = selectionStart + pasted.length;
      const mappedCaret = mapCaretAcrossFormat(merged, caretAfterPaste, formatted);
      el.focus();
      el.setSelectionRange(0, value.length);
      document.execCommand("insertText", false, formatted);
      el.setSelectionRange(mappedCaret, mappedCaret);
    } catch {
      // невалидный JSON после вставки — обычная вставка как есть.
    }
  }

  function handleScroll(e: UIEvent<HTMLTextAreaElement>) {
    // Синхронизируем скролл цветного <pre> со скроллом textarea — это
    // два разных DOM-элемента, у каждого свой независимый scrollTop.
    const pre = highlightRef.current;
    /* v8 ignore next -- highlightRef указывает на смонтированный <pre>, который
     * рендерится безусловно рядом с textarea. */
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
      <div className="json-viewer__editor">
        <pre ref={highlightRef} className="json-viewer__highlight" aria-hidden="true">
          {highlighted}
        </pre>
        <textarea
          ref={textareaRef}
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
});

export default AstPositionHighlighter;
