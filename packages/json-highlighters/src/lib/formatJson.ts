/**
 * Общая логика для кнопки «Форматировать» во всех трёх подсветчиках:
 * распарсить текущий текст и пересобрать его с выбранным стилем отступа.
 */

export type IndentStyle = "2" | "4" | "tab";

export const INDENT_OPTIONS: { value: IndentStyle; label: string }[] = [
  { value: "2", label: "2 пробела" },
  { value: "4", label: "4 пробела" },
  { value: "tab", label: "Таб" },
];

function indentParam(style: IndentStyle): string | number {
  return style === "tab" ? "\t" : Number(style);
}

/**
 * Парсит `text` как JSON и возвращает его же, пересобранный с указанным
 * стилем отступа. Бросает исключение, если текст не валидный JSON —
 * вызывающий код должен сам решить, как показать ошибку (в отличие от
 * подсветки, форматирование в принципе не может работать с невалидным
 * JSON, потому что ему нужно реальное дерево значений, а не просто текст).
 */
export function formatJson(text: string, style: IndentStyle): string {
  const parsed = JSON.parse(text);
  return JSON.stringify(parsed, null, indentParam(style));
}

/**
 * Как `formatJson`, но без исключений — используется там, где невалидный
 * JSON не ошибка, а нормальный промежуточный случай: первоначальная
 * загрузка (`initialJson` может прийти сжатым в одну строку, как есть с
 * сети) и вставка текста из буфера обмена. Если распарсить не удалось,
 * возвращает исходный текст без изменений.
 */
export function tryFormatJson(text: string, style: IndentStyle): string {
  try {
    return formatJson(text, style);
  } catch {
    return text;
  }
}
