import { tokenizeWithPositions } from "./jsonTokenizer";

/**
 * Пересчитывает офсет курсора из "старого" текста в "новый" при
 * переформатировании (JSON.parse+stringify меняет только whitespace, а
 * порядок и содержимое значимых токенов — нет). Без этого автоформат при
 * вставке пришлось бы всегда ставить курсор в конец документа, из-за чего
 * вставка куска JSON куда угодно, кроме самого конца, "телепортирует"
 * курсор вниз — общий баг для всех подходов, у которых есть автоформат
 * после paste (AstContentEditableHighlighter, RegexHighlighter,
 * AstPositionHighlighter).
 *
 * Идея: у `original` и `formatted` один и тот же AST, значит списки
 * незначащих-для-whitespace токенов (ключи/значения/пунктуация, но не
 * whitespace) идентичны по количеству, типам и содержимому — отличаются
 * только их позиции. Находим, в какой токен `original` попадает
 * `originalCaret`, и ставим курсор на ту же относительную позицию внутри
 * СООТВЕТСТВУЮЩЕГО по индексу токена в `formatted`.
 */
export function mapCaretAcrossFormat(original: string, originalCaret: number, formatted: string): number {
  const isMeaningful = (t: ReturnType<typeof tokenizeWithPositions>["tokens"][number]) => t.type !== "whitespace";
  const from = tokenizeWithPositions(original).tokens.filter(isMeaningful);
  const to = tokenizeWithPositions(formatted).tokens.filter(isMeaningful);

  if (from.length !== to.length || from.length === 0) return formatted.length;

  const idx = from.findIndex((t) => originalCaret <= t.end);
  if (idx === -1) return formatted.length; // курсор был после последнего токена

  const fromToken = from[idx];
  const toToken = to[idx];
  if (originalCaret < fromToken.start) {
    // Курсор был в "зазоре" (whitespace) перед этим токеном — ставим перед ним и в новом тексте.
    return toToken.start;
  }
  const offsetInToken = originalCaret - fromToken.start;
  const toTokenLength = toToken.end - toToken.start;
  return toToken.start + Math.min(offsetInToken, toTokenLength);
}
