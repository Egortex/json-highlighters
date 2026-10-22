import { useEffect, type RefObject } from "react";

/**
 * Держит цветной <pre> строго под прозрачной textarea (приём «наложение
 * слоёв» в Regex/AstPosition/Yaml-вариантах).
 *
 * Поиск браузера (Ctrl+F) находит текст в ОБОИХ слоях. Совпадение в <pre>
 * браузер прокручивает в видимую область, скроллируя сам <pre>, а textarea
 * остаётся на месте: слои разъезжаются, найденное слово «плавает» под
 * курсором, а выделение мышью попадает в другие символы textarea.
 *
 * - `inert` исключает <pre> из find-in-page (и из фокуса/выделения) — ищется
 *   только textarea, а её прокрутку <pre> и так повторяет через onScroll.
 *   Ставится через setAttribute: React 18 не знает атрибут `inert`, а
 *   React 19 трактует его как boolean — так работает одинаково в обоих.
 * - если <pre> всё же прокрутил кто-то посторонний (scrollIntoView, браузер
 *   без поддержки inert), возвращаем его к позиции textarea.
 */
export function useOverlaySync(
  highlightRef: RefObject<HTMLElement | null>,
  textareaRef: RefObject<HTMLTextAreaElement | null>
): void {
  useEffect(() => {
    const pre = highlightRef.current;
    const ta = textareaRef.current;
    /* v8 ignore next -- оба ref указывают на элементы, которые рендерятся безусловно. */
    if (!pre || !ta) return;
    pre.setAttribute("inert", "");

    function snapBack() {
      if (pre!.scrollTop !== ta!.scrollTop) pre!.scrollTop = ta!.scrollTop;
      if (pre!.scrollLeft !== ta!.scrollLeft) pre!.scrollLeft = ta!.scrollLeft;
    }
    pre.addEventListener("scroll", snapBack);
    return () => pre.removeEventListener("scroll", snapBack);
  }, [highlightRef, textareaRef]);
}
