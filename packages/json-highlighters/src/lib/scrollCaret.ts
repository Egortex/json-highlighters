/**
 * Прокручивает textarea так, чтобы курсор был виден.
 *
 * После вставки/форматирования содержимое заменяется целиком через
 * execCommand("insertText"), и браузер оставляет textarea прокрученной в
 * начало, хотя setSelectionRange уже поставил курсор правильно: курсор
 * уезжает за пределы видимой области, и кажется, что он «сбросился в
 * начало». Сам setSelectionRange прокрутку не гарантирует.
 *
 * Строки в редакторах не переносятся (white-space: pre), поэтому номер
 * строки курсора × line-height — точная вертикальная позиция. Если курсор
 * уже виден, прокрутка не трогается; иначе он ставится в середину окна.
 * <pre> подсветки догоняет через обычный onScroll textarea.
 */
export function scrollCaretIntoView(el: HTMLTextAreaElement): void {
  const style = getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight);
  // line-height: normal (стили не подключены) — точную позицию не посчитать.
  if (!lineHeight) return;
  const line = el.value.slice(0, el.selectionStart).split("\n").length - 1;
  const caretTop = (parseFloat(style.paddingTop) || 0) + line * lineHeight;
  if (caretTop >= el.scrollTop && caretTop + lineHeight <= el.scrollTop + el.clientHeight) return;
  el.scrollTop = Math.max(0, caretTop - el.clientHeight / 2);
}
