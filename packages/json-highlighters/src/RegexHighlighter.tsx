import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent, KeyboardEvent, UIEvent } from "react";
import { formatJson, tryFormatJson, type IndentStyle } from "./lib/formatJson";
import { mapCaretAcrossFormat } from "./lib/caretMapping";
import { themeAttr, type JsonHighlighterTheme } from "./lib/theme";
import type { JsonEditorHandle, JsonValidity } from "./lib/editorApi";

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
  /** Стиль отступа для автоформата при вставке и для `ref.format()` без аргумента. */
  indent?: IndentStyle;
  /** Вызывается при монтировании и при каждой смене валидности/текста ошибки. */
  onValidityChange?: (validity: JsonValidity) => void;
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

export const RegexHighlighter = forwardRef<JsonEditorHandle, RegexHighlighterProps>(function RegexHighlighter({
  initialJson = DEFAULT_JSON,
  title = "Regex-подсветка",
  theme = "system",
  onChange,
  indent = "2",
  onValidityChange,
}, ref) {
  // Если initialJson уже сжат в одну строку (например, только что пришёл
  // по сети как есть) — сразу форматируем его текущим стилем отступа,
  // чтобы не показывать нечитаемую простыню сразу при монтировании.
  const [rawText, setRawText] = useState(() => tryFormatJson(initialJson, indent));
  // Regex-подсветке валидность не нужна, но флаг для хоста (и для format())
  // всё равно считаем — через настоящий JSON.parse, а не через regex.
  const validity = useMemo<JsonValidity>(() => {
    try {
      JSON.parse(rawText);
      return { valid: true };
    } catch (err) {
      /* v8 ignore next -- JSON.parse бросает только SyntaxError. */
      return { valid: false, error: err instanceof Error ? err.message : "Невалидный JSON" };
    }
  }, [rawText]);
  const highlightRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => {
    onValidityChange?.(validity);
    // См. AstPositionHighlighter: колбэк хоста намеренно не в зависимостях.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validity.valid, validity.error]);

  useImperativeHandle(ref, () => ({ format }));

  function format(style: IndentStyle = indent): boolean {
    if (!validity.valid) return false;
    const el = textareaRef.current;
    const formatted = formatJson(rawText, style);
    if (el) {
      // См. handlePaste: execCommand вместо setText сохраняет шаг в
      // нативном undo-стеке, а mapCaretAcrossFormat не даёт курсору
      // улететь в конец документа при явном вызове format().
      const mappedCaret = mapCaretAcrossFormat(rawText, el.selectionStart, formatted);
      el.focus();
      el.setSelectionRange(0, el.value.length);
      document.execCommand("insertText", false, formatted);
      el.setSelectionRange(mappedCaret, mappedCaret);
    }
    // textareaRef всегда указывает на смонтированный <textarea> к моменту,
    // когда хост может вызвать ref.format(); эта ветка — защита только от
    // гипотетического вызова до первого рендера.
    /* v8 ignore next */
    else {
      /* v8 ignore next */
      setText(formatted);
    }
    return true;
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
      const formatted = formatJson(merged, indent);
      e.preventDefault();
      // Курсор должен остаться сразу ПОСЛЕ вставленного текста, а не
      // улететь в конец документа — formatJson меняет только whitespace, не
      // порядок значимых токенов, так что mapCaretAcrossFormat находит
      // соответствующую позицию в переформатированном тексте.
      const caretAfterPaste = selectionStart + pasted.length;
      const mappedCaret = mapCaretAcrossFormat(merged, caretAfterPaste, formatted);
      // Программная замена value через React (setText -> setRawText) сбрасывает
      // нативный undo-стек textarea целиком — после такой вставки Ctrl+Z
      // молча ничего не делает. execCommand("insertText", ...) заменяет
      // содержимое так же, как обычный ввод: остаётся ОДНИМ полноценным
      // шагом истории, который браузер умеет откатывать по Ctrl+Z.
      el.focus();
      el.setSelectionRange(0, value.length);
      document.execCommand("insertText", false, formatted);
      el.setSelectionRange(mappedCaret, mappedCaret);
    } catch {
      // невалидный JSON после вставки — обычная вставка как есть.
    }
  }

  function handleScroll(e: UIEvent<HTMLTextAreaElement>) {
    // Слой с подсветкой (<pre>) — отдельный DOM-элемент со своим скроллом,
    // поэтому его нужно синхронизировать со скроллом textarea вручную.
    const pre = highlightRef.current;
    /* v8 ignore next -- highlightRef указывает на смонтированный <pre>, который
     * рендерится безусловно рядом с textarea; guard защищает только от гонки
     * между unmount и последним событием scroll. */
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
      <div className="json-viewer__editor">
        <pre
          ref={highlightRef}
          className="json-viewer__highlight"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
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
          aria-label="Редактируемый JSON-текст (regex-подсветка)"
        />
      </div>
    </div>
  );
});

export default RegexHighlighter;
