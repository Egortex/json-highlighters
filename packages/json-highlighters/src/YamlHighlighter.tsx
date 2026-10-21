import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, UIEvent } from "react";
import { themeAttr, type JsonHighlighterTheme } from "./lib/theme";

const DEFAULT_YAML = "hello: world\nlist:\n  - one\n  - two\n";

export interface YamlHighlighterProps {
  /** Начальный YAML-текст (компонент неконтролируемый — дальше редактируется сам). */
  initialYaml?: string;
  /** Заголовок панели; передайте `null`, чтобы не рендерить его вовсе. */
  title?: string | null;
  /** "system" (по умолчанию) следует prefers-color-scheme хоста; "light"/"dark" — явно. */
  theme?: JsonHighlighterTheme;
  /** Вызывается с текущим текстом на каждое изменение. */
  onChange?: (text: string) => void;
}

/** См. `escapeHtml` в RegexHighlighter.tsx — та же причина: экранировать
 *  HTML-спецсимволы ДО вставки span-тегов, а не после. */
function escapeHtml(raw: string): string {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Regex-подсветка YAML — младшая сестра `RegexHighlighter` (JSON), тот же
 * приём «прозрачная textarea поверх раскрашенного <pre>», но грамматика
 * теперь построчная: YAML, в отличие от JSON, значимо использует отступы и
 * позицию `#`/`:` в строке, а не только вложенность скобок.
 *
 * Альтернативы регулярки, по порядку:
 *  - строка в кавычках (двойных или одинарных) — распознаётся первой, чтобы
 *    `#` или `:` внутри неё не были ошибочно приняты за комментарий/ключ
 *  - `#...` до конца строки — комментарий
 *  - маркер элемента списка `- ` в начале строки (после отступа)
 *  - ключ отображения: текст от начала строки (после отступа и
 *    необязательного `- `, через lookbehind — сам маркер списка в
 *    подсветку ключа не попадает) до ближайшего `: ` или `:` в конце строки
 *  - `true`/`false`, `null`/`~`, числа — как в JSON-варианте
 *
 * Как и JSON regex-хайлайтер, это разметка сырого текста без разбора
 * дерева — значит, не ломается на «временно неполном» YAML во время
 * редактирования, но по той же причине не безупречна на всех edge-case'ах
 * грамматики: инлайн-flow-синтаксис (`{a: 1, b: 2}` в одну строку) и
 * значения, содержащие `:` без пробела после (типа URL), подсвечиваются
 * не идеально. Кнопки «Форматировать» тут нет: в отличие от JSON, у YAML
 * нет одной канонической пере-сериализации через встроенный API рантайма —
 * пересборка потребовала бы полноценного YAML-парсера/сериализатора.
 */
const YAML_TOKEN_REGEX =
  /"(?:\\.|[^"\\])*"|'(?:[^'\\]|\\.)*'|#.*$|^[ \t]*-(?=[ \t]|$)|(?<=^[ \t]*(?:-[ \t]+)?)[^\s:#'"][^:\n]*(?=:(?:[ \t]|$))|\b(?:true|false|True|False|TRUE|FALSE)\b|\bnull\b|~|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/gm;

function classify(match: string): string {
  if (match.startsWith('"') || match.startsWith("'")) return "yaml-string";
  if (match.trimStart().startsWith("#")) return "yaml-comment";
  if (/^[ \t]*-$/.test(match)) return "yaml-dash";
  if (/^(true|false)$/i.test(match)) return "yaml-boolean";
  if (match === "null" || match === "~") return "yaml-null";
  if (/^-?\d/.test(match)) return "yaml-number";
  return "yaml-key";
}

export function highlightYaml(yaml: string): string {
  const escaped = escapeHtml(yaml);
  return escaped.replace(YAML_TOKEN_REGEX, (match) => `<span class="${classify(match)}">${match}</span>`);
}

export function YamlHighlighter({
  initialYaml = DEFAULT_YAML,
  title = "YAML — regex-подсветка",
  theme = "system",
  onChange,
}: YamlHighlighterProps) {
  const highlightRef = useRef<HTMLPreElement>(null);
  const [rawText, setRawTextState] = useState(initialYaml);

  const highlighted = useMemo(() => highlightYaml(rawText), [rawText]);

  function setText(next: string) {
    setRawTextState(next);
    onChange?.(next);
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
  }

  function handleScroll(e: UIEvent<HTMLTextAreaElement>) {
    const pre = highlightRef.current;
    /* v8 ignore next -- highlightRef указывает на смонтированный <pre>, который
     * рендерится безусловно рядом с textarea. */
    if (!pre) return;
    pre.scrollTop = e.currentTarget.scrollTop;
    pre.scrollLeft = e.currentTarget.scrollLeft;
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Tab вставляет два пробела — YAML особенно чувствителен к отступам,
    // а таб-символ в большинстве парсеров вообще запрещён как отступ.
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
    <div className="json-viewer json-viewer--yaml-regex" data-theme={themeAttr(theme)}>
      {title !== null && <h3>{title}</h3>}
      <div className="json-viewer__editor">
        <pre
          ref={highlightRef}
          className="json-viewer__highlight"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
        <textarea
          className="json-viewer__textarea"
          value={rawText}
          onChange={handleChange}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Редактируемый YAML-текст (regex-подсветка)"
        />
      </div>
    </div>
  );
}

export default YamlHighlighter;
