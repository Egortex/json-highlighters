export { RegexHighlighter } from "./RegexHighlighter";
export type { RegexHighlighterProps } from "./RegexHighlighter";

export { AstPositionHighlighter } from "./AstPositionHighlighter";
export type { AstPositionHighlighterProps } from "./AstPositionHighlighter";

export { AstContentEditableHighlighter } from "./AstContentEditableHighlighter";
export type { AstContentEditableHighlighterProps } from "./AstContentEditableHighlighter";

export { YamlHighlighter } from "./YamlHighlighter";
export type { YamlHighlighterProps } from "./YamlHighlighter";

// Общие внутренности — на случай, если кому-то нужен сам токенизатор
// или форматирование отдельно от готовых компонентов.
export { tokenizeWithPositions } from "./lib/jsonTokenizer";
export type { Token, TokenType, TokenizeResult } from "./lib/jsonTokenizer";

export { formatJson, INDENT_OPTIONS } from "./lib/formatJson";
export type { IndentStyle } from "./lib/formatJson";

export type { JsonHighlighterTheme } from "./lib/theme";
