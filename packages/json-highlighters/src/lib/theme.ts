/**
 * "system" (по умолчанию) — цвета следуют `prefers-color-scheme` хоста.
 * "light" / "dark" — явно проставляет `data-theme` на корневой элемент,
 * что в styles.css перебивает системную тему за счёт специфичности
 * атрибутного селектора (см. .json-viewer[data-theme="..."] в styles.css).
 */
export type JsonHighlighterTheme = "system" | "light" | "dark";

/** `data-theme` для корневого div; `undefined` — атрибут не ставится вовсе. */
export function themeAttr(theme: JsonHighlighterTheme): "light" | "dark" | undefined {
  return theme === "system" ? undefined : theme;
}
