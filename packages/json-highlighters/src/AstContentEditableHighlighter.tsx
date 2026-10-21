import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ClipboardEvent, FormEvent, KeyboardEvent } from "react";
import { tokenizeWithPositions, type TokenizeResult } from "./lib/jsonTokenizer";
import { formatJson, tryFormatJson, type IndentStyle } from "./lib/formatJson";
import { mapCaretAcrossFormat } from "./lib/caretMapping";
import { themeAttr, type JsonHighlighterTheme } from "./lib/theme";
import type { JsonEditorHandle, JsonValidity } from "./lib/editorApi";

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
  /** Стиль отступа для автоформата при вставке и для `ref.format()` без аргумента. */
  indent?: IndentStyle;
  /** Вызывается при монтировании и при каждой смене валидности/текста ошибки.
   * Статус обновляется вместе с перекраской — через ~400мс после паузы в наборе. */
  onValidityChange?: (validity: JsonValidity) => void;
}

/**
 * document.execCommand("insertText", ...) в реальных браузерах (проверено в
 * Chromium) представляет вставленный символ "\n" внутри contentEditable как
 * элемент `<br>`, А НЕ как текстовый узел с литеральным переводом строки —
 * даже при insertText, не только при обычном вводе/Enter. А `el.textContent`
 * у `<br>` — всегда пустая строка, так что перенос строки при таком чтении
 * просто пропадает ("line one<br>line two".textContent === "line oneline two").
 * Это тот самый баг "теряется строка" из отчёта, и одного execCommand
 * недостаточно — после каждой вставки нужно вручную заменить все `<br>` на
 * текстовый узел "\n", чтобы вернуть дереву инвариант "только текст и span",
 * на который рассчитывают buildHighlightedHtml/getCaretOffset/setCaretOffset.
 */
export function normalizeLineBreaks(el: HTMLElement): void {
  for (const br of Array.from(el.querySelectorAll("br"))) {
    br.replaceWith(document.createTextNode("\n"));
  }
}

function escapeHtml(raw: string): string {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Строит HTML-строку с подсветкой на основе токенов — используется для
 * прямой подмены `innerHTML`, поэтому результат именно HTML-строка, а не JSX. */
export function buildHighlightedHtml(text: string, result: TokenizeResult = tokenizeWithPositions(text)): string {
  let html = "";
  let cursor = 0;

  for (const t of result.tokens) {
    /* v8 ignore next -- tokenizeWithPositions токенизирует весь whitespace
     * явно (см. consumeWhitespace в jsonTokenizer.ts), так что t.start всегда
     * равен предыдущему cursor; оставлено как защита от будущих изменений
     * грамматики токенизатора. */
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

/** Символьное смещение курсора внутри «плоского» текстового содержимого `element`.
 * Экспортируется отдельно от компонента, чтобы можно было юнит-тестировать
 * сохранение позиции курсора без реального contentEditable/execCommand
 * (которых jsdom не поддерживает), — см. AstContentEditableHighlighter.caret.test.ts. */
export function getCaretOffset(element: HTMLElement): number {
  const selection = window.getSelection();
  /* v8 ignore next -- window.getSelection() возвращает null только в
   * браузерных контекстах без реального viewport (не в живой странице). */
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
export function setCaretOffset(element: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  /* v8 ignore next -- см. getCaretOffset выше: практически недостижимо в живой странице. */
  if (!selection) return;

  const range = document.createRange();
  let remaining = offset;
  let placed = false;

  function walk(node: Node): void {
    /* v8 ignore next -- недостижимо при текущей форме дерева: внутренний
     * `if (placed) return;` в цикле ниже уже останавливает обход сиблингов
     * сразу после того, как placed становится true, поэтому walk() никогда
     * не вызывается ПОВТОРНО после того, как placed уже true. */
    if (placed) return;
    if (node.nodeType === Node.TEXT_NODE) {
      /* v8 ignore next -- textContent текстового узла никогда не null. */
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
export const AstContentEditableHighlighter = forwardRef<
  JsonEditorHandle,
  AstContentEditableHighlighterProps
>(function AstContentEditableHighlighter({
  initialJson = DEFAULT_JSON,
  title = "AST contentEditable",
  theme = "system",
  onChange,
  indent = "2",
  onValidityChange,
}, ref) {
  const editorRef = useRef<HTMLPreElement>(null);
  // Если initialJson уже сжат в одну строку — сразу форматируем при монтировании.
  const initialText = useRef(tryFormatJson(initialJson, indent)).current;
  const rawTextRef = useRef(initialText);
  const debounceTimer = useRef<number | undefined>(undefined);
  // Свой undo/redo вместо нативного undo-стека браузера: recolor()/
  // applyFormatted() перестраивают innerHTML целиком на каждое изменение, а
  // браузеры трактуют полную замену содержимого contentEditable как разрыв
  // истории — родной Ctrl+Z после такой замены либо ничего не делает, либо
  // восстанавливает случайный текст без курсора. `current` — это последнее
  // "зафиксированное" состояние (текст + офсет курсора), `undo`/`redo` —
  // стеки состояний ДО/ПОСЛЕ него.
  const historyRef = useRef<{
    current: { text: string; caret: number };
    undo: { text: string; caret: number }[];
    redo: { text: string; caret: number }[];
  }>({ current: { text: initialText, caret: initialText.length }, undo: [], redo: [] });
  const [status, setStatus] = useState<TokenizeResult>(() => tokenizeWithPositions(initialText));

  useEffect(() => {
    onValidityChange?.(status.valid ? { valid: true } : { valid: false, error: status.error });
    // См. AstPositionHighlighter: колбэк хоста намеренно не в зависимостях.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.valid, status.error]);

  useImperativeHandle(ref, () => ({ format }));

  /** Фиксирует новое состояние как текущее. Если текст не изменился (просто
   * подвинулся курсор) — не плодит бесполезные шаги истории, только обновляет
   * сохранённый офсет курсора у текущего состояния. */
  function commitHistory(text: string, caret: number) {
    const h = historyRef.current;
    if (text === h.current.text) {
      h.current = { text, caret };
      return;
    }
    h.undo.push(h.current);
    if (h.undo.length > 200) h.undo.shift();
    h.redo = [];
    h.current = { text, caret };
  }

  /** Перед любым дискретным действием (paste/Tab/Enter/undo) — сохраняет то,
   * что уже напечатано, но ещё «зависло» в дебаунсе и не попало в историю
   * отдельным шагом. Без этого Ctrl+Z сразу после быстрого набора+вставки
   * откатывал бы одним махом и вставку, и весь текст, напечатанный до неё. */
  function flushPendingCommit(caret: number) {
    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = undefined;
    }
    commitHistory(rawTextRef.current, caret);
  }

  function applySnapshot(snapshot: { text: string; caret: number }) {
    const el = editorRef.current;
    /* v8 ignore next -- editorRef указывает на смонтированный <pre>, который
     * рендерится безусловно; applySnapshot вызывается только после монтирования. */
    if (!el) return;
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    rawTextRef.current = snapshot.text;
    const result = tokenizeWithPositions(snapshot.text);
    setStatus(result);
    el.innerHTML = buildHighlightedHtml(snapshot.text, result);
    // focus() ДО setCaretOffset — не наоборот: фокусировка элемента может
    // сама по себе сбросить/переместить только что выставленное выделение,
    // если до этого была сфокусирована другая часть страницы (например,
    // кнопка «Форматировать» перед кликом).
    el.focus();
    setCaretOffset(el, snapshot.caret);
    onChange?.(snapshot.text);
  }

  function handleUndo() {
    const el = editorRef.current;
    /* v8 ignore next -- см. applySnapshot. */
    if (!el) return;
    const h = historyRef.current;
    // То же самое, что flushPendingCommit, но явно: если пользователь
    // печатал и сразу нажал Ctrl+Z, первое нажатие должно откатить именно
    // напечатанное, а не прыгнуть на шаг раньше.
    /* v8 ignore next -- textContent смонтированного <pre> никогда не null. */
    const liveText = el.textContent ?? "";
    if (liveText !== h.current.text) {
      h.undo.push(h.current);
      h.current = { text: liveText, caret: getCaretOffset(el) };
    }
    const prev = h.undo.pop();
    if (!prev) return;
    h.redo.push(h.current);
    h.current = prev;
    applySnapshot(prev);
  }

  function handleRedo() {
    const h = historyRef.current;
    const next = h.redo.pop();
    if (!next) return;
    h.undo.push(h.current);
    h.current = next;
    applySnapshot(next);
  }

  useEffect(() => {
    const el = editorRef.current;
    /* v8 ignore next -- ref заполняется React синхронно перед этим эффектом. */
    if (!el) return;
    el.innerHTML = buildHighlightedHtml(initialText);

    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
    // Заполняем содержимое только один раз при монтировании — дальше DOM
    // этого элемента управляется императивно, а не пропсами/состоянием.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function recolor() {
    const el = editorRef.current;
    /* v8 ignore next -- см. applySnapshot. */
    if (!el) return;
    const text = rawTextRef.current;
    const caret = getCaretOffset(el);
    const result = tokenizeWithPositions(text);
    setStatus(result);
    el.innerHTML = buildHighlightedHtml(text, result);
    setCaretOffset(el, caret);
    commitHistory(text, caret);
  }

  /** Подменяет содержимое на уже отформатированный текст — используется и
   * кнопкой «Форматировать», и автоформатом при вставке. По умолчанию курсор
   * ставится в конец (это ожидаемо для явного клика «Форматировать»);
   * `caretOffset` передаётся явно там, где нужно сохранить позицию курсора
   * относительно места правки (например, после вставки — см. handlePaste и
   * mapCaretAcrossFormat), а не телепортировать его в конец документа.
   * Отменяет отложенную дебаунс-перекраску, чтобы она не сработала поверх со
   * старой (уже неактуальной) позицией курсора. */
  function applyFormatted(formatted: string, caretOffset: number = formatted.length) {
    const el = editorRef.current;
    /* v8 ignore next -- см. applySnapshot. */
    if (!el) return;
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    rawTextRef.current = formatted;
    const result = tokenizeWithPositions(formatted);
    setStatus(result);
    el.innerHTML = buildHighlightedHtml(formatted, result);
    // См. applySnapshot: focus() ДО setCaretOffset, иначе фокусировка после
    // клика на кнопке «Форматировать» (которая до этого держала фокус)
    // может сбросить только что выставленную позицию курсора.
    el.focus();
    setCaretOffset(el, caretOffset);
    onChange?.(formatted);
    commitHistory(formatted, caretOffset);
  }

  function format(style: IndentStyle = indent): boolean {
    // status отстаёт от набора на время дебаунса, поэтому валидность
    // проверяем по актуальному тексту из ref, а не по status.valid.
    let formatted: string;
    try {
      formatted = formatJson(rawTextRef.current, style);
    } catch {
      return false;
    }
    /* v8 ignore next -- editorRef всегда указывает на смонтированный <pre>
     * к моменту, когда хост может вызвать ref.format(). */
    const caret = editorRef.current ? getCaretOffset(editorRef.current) : rawTextRef.current.length;
    applyFormatted(formatted, mapCaretAcrossFormat(rawTextRef.current, caret, formatted));
    return true;
  }

  function handlePaste(e: ClipboardEvent<HTMLPreElement>) {
    const el = editorRef.current;
    /* v8 ignore next -- см. applySnapshot. */
    if (!el) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);

    // Считаем офсеты начала и конца текущего выделения (обычно это просто
    // курсор — начало и конец совпадают), чтобы вставить текст на нужное
    // место в "плоском" тексте, а не просто в конец.
    const startRange = range.cloneRange();
    startRange.selectNodeContents(el);
    startRange.setEnd(range.startContainer, range.startOffset);
    const start = startRange.toString().length;

    const endRange = range.cloneRange();
    endRange.selectNodeContents(el);
    endRange.setEnd(range.endContainer, range.endOffset);
    const end = endRange.toString().length;

    const pasted = e.clipboardData.getData("text/plain");
    /* v8 ignore next -- textContent смонтированного <pre> никогда не null. */
    const current = el.textContent ?? "";
    const merged = current.slice(0, start) + pasted + current.slice(end);

    // Фиксируем состояние ДО вставки как отдельный шаг истории — иначе
    // Ctrl+Z сразу после paste откатывал бы заодно и весь текст, набранный
    // до неё (см. flushPendingCommit).
    flushPendingCommit(start);

    // Всегда перехватываем вставку сами: дефолтная вставка в contentEditable
    // для многострочного текста создаёт <div>/<br> вместо текстового узла с
    // "\n", а el.textContent потом склеивает соседние блоки без переноса —
    // строка визуально "теряется". execCommand("insertText", ...) вставляет
    // реальный символ "\n" внутрь текущего текстового узла.
    e.preventDefault();
    try {
      const formatted = formatJson(merged, indent);
      // Курсор должен остаться сразу ПОСЛЕ вставленного текста, а не улететь
      // в конец документа: formatJson меняет только отступы/whitespace, но
      // не порядок значимых токенов, так что mapCaretAcrossFormat находит
      // соответствующую позицию в переформатированном тексте.
      const caretAfterPaste = start + pasted.length;
      applyFormatted(formatted, mapCaretAcrossFormat(merged, caretAfterPaste, formatted));
    } catch {
      // Невалидный JSON после вставки — вставляем как обычный текст, но
      // через execCommand, а не отдаём браузеру дефолтную вставку.
      document.execCommand("insertText", false, pasted);
      normalizeLineBreaks(el);
      /* v8 ignore next -- textContent смонтированного <pre> никогда не null. */
      const text = el.textContent ?? "";
      const caret = getCaretOffset(el);
      rawTextRef.current = text;
      onChange?.(text);
      commitHistory(text, caret); // вставка — дискретное действие, не ждём дебаунса
      /* v8 ignore next -- flushPendingCommit() чуть выше уже очистил и обнулил
       * debounceTimer.current, так что здесь он всегда falsy; проверка оставлена
       * ради единообразия с другими местами, которые чистят таймер вручную. */
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(recolor, 400);
    }
  }

  function handleInput(e: FormEvent<HTMLPreElement>) {
    // Просто запоминаем текущий текст в ref (без setState — это не должно
    // триггерить рендер) и переставляем таймер дебаунса. Пока пользователь
    // печатает быстро, перекраска постоянно откладывается.
    /* v8 ignore next -- textContent смонтированного <pre> никогда не null. */
    const text = e.currentTarget.textContent ?? "";
    rawTextRef.current = text;
    onChange?.(text);
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(recolor, 400);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLPreElement>) {
    // Свой undo/redo вместо нативного: браузерный Ctrl+Z работает по своей
    // внутренней истории contentEditable, а мы регулярно заменяем innerHTML
    // целиком (recolor/applyFormatted) — для браузера это выглядит как
    // сторонняя правка, которая эту историю обнуляет или запутывает, поэтому
    // родной Ctrl+Z либо не восстанавливает текст, либо теряет курсор.
    // Перехватываем обе комбинации (и Cmd на Mac) полностью сами.
    const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z";
    const isRedo =
      ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z") ||
      ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y");
    if (isUndo) {
      e.preventDefault();
      handleUndo();
      return;
    }
    if (isRedo) {
      e.preventDefault();
      handleRedo();
      return;
    }

    // И Tab, и Enter обязаны идти через execCommand("insertText", ...), а не
    // через дефолтное поведение contentEditable: браузер вставляет перевод
    // строки как <div>/<br>, а el.textContent (см. handleInput/handlePaste)
    // не восстанавливает "\n" на границах таких блоков — соседние строки
    // склеиваются, и часть текста визуально "пропадает".
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      const el = e.currentTarget;
      // Фиксируем состояние ДО правки отдельным шагом истории — Tab/Enter
      // это дискретное действие, а не часть "потока набора текста".
      flushPendingCommit(getCaretOffset(el));
      document.execCommand("insertText", false, e.key === "Tab" ? "  " : "\n");
      normalizeLineBreaks(el);
      /* v8 ignore next -- textContent смонтированного <pre> никогда не null. */
      const text = el.textContent ?? "";
      const caret = getCaretOffset(el);
      rawTextRef.current = text;
      onChange?.(text);
      commitHistory(text, caret);
      /* v8 ignore next -- flushPendingCommit() чуть выше уже очистил и обнулил
       * debounceTimer.current, так что здесь он всегда falsy (см. handlePaste). */
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(recolor, 400);
    }
  }

  return (
    <div className="json-viewer json-viewer--ast-contenteditable" data-theme={themeAttr(theme)}>
      {title !== null && <h3>{title}</h3>}
      <pre
        ref={editorRef}
        className="json-viewer__editable"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        spellCheck={false}
        aria-label="Редактируемый JSON-текст (contentEditable AST-подсветка)"
      />
    </div>
  );
});

export default AstContentEditableHighlighter;
