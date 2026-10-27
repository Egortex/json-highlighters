# @chepchik/json-highlighters

**English** · [Русский](https://github.com/Egortex/json-highlighters/blob/main/packages/json-highlighters/README.ru.md)

Three hand-written approaches to live, editable JSON syntax highlighting in
React, plus regex-based YAML highlighting. Supports React 18 and 19
(`peerDependencies: react ^18.0.0 || ^19.0.0`).

```bash
npm install @chepchik/json-highlighters
```

The CSS is imported with a separate line (once, anywhere before the
components render — usually in the app entry point):

```ts
import "@chepchik/json-highlighters/styles.css";
```

```tsx
import {
  RegexHighlighter,
  AstPositionHighlighter,
  AstContentEditableHighlighter,
  YamlHighlighter,
} from "@chepchik/json-highlighters";

function App() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, height: 400 }}>
      <RegexHighlighter initialJson={'{\n  "a": 1\n}'} onChange={console.log} />
      <AstPositionHighlighter />
      <AstContentEditableHighlighter title={null} theme="dark" />
      <YamlHighlighter initialYaml={"key: value\nlist:\n  - one\n"} theme="dark" />
    </div>
  );
}
```

Every component is uncontrolled (it keeps the text internally) and
takes optional props. The three JSON components take the initial text as
`initialJson`; `YamlHighlighter` takes `initialYaml` (same meaning, different
name, so the expected format is obvious at the call site):

| Prop | Type | Description |
|---|---|---|
| `initialJson` / `initialYaml` | `string` | Initial text. Defaults to a small sample. |
| `title` | `string \| null` | Panel heading (`<h3>`). Defaults to a component-specific heading; `null` renders no heading at all. |
| `theme` | `"system" \| "light" \| "dark"` | Defaults to `"system"`, which follows the host page's `prefers-color-scheme`. `"light"`/`"dark"` pin the theme regardless of the system setting. |
| `onChange` | `(text: string) => void` | Reports edits (typing, paste, Tab, formatting). Not called for initialization, including initial auto-formatting. |
| `indent` | `"2" \| "4" \| "tab"` | JSON components only. Indent used for auto-formatting on mount/paste and for `ref.format()` without an argument. Defaults to `"2"`. |
| `onValidityChange` | `(v: { valid: boolean; error?: string }) => void` | JSON components only. Called on mount and when validity or the error message changes. With `AstContentEditableHighlighter`, updates after typing are debounced by 400 ms. See the validation limitations below. |

`initialJson` / `initialYaml` are used only for initialization. To load different
text, remount the component with a new `key`. Changing `indent` affects future
formatting; it does not reformat the current text automatically. Tab always
inserts two spaces in all four editors, regardless of `indent`.

The JSON components render **only the editor** — there is no toolbar or
status line inside. The host draws the validity mark from the
`onValidityChange` flag and triggers formatting through the editor's `ref`:

```tsx
import { useRef, useState } from "react";
import { AstPositionHighlighter, type JsonEditorHandle, type JsonValidity } from "@chepchik/json-highlighters";

function Editor() {
  const editor = useRef<JsonEditorHandle>(null);
  const [validity, setValidity] = useState<JsonValidity>({ valid: true });

  return (
    <div>
      <div style={{ height: 400 }}>
        <AstPositionHighlighter ref={editor} onValidityChange={setValidity} />
      </div>
      <button disabled={!validity.valid} onClick={() => editor.current?.format("4")}>
        Format
      </button>
      <span>{validity.valid ? "✓ Valid JSON" : `⚠ ${validity.error}`}</span>
    </div>
  );
}
```

`ref.current?.format(indent?)` returns `true` when formatting succeeds, even
if the result is unchanged, and `false` when formatting is rejected. It maps
the caret to the corresponding token where possible; it does not preserve a
selection range. If re-serialization changes the token count, the caret moves
to the end.

Every component uses `display: flex; flex-direction: column; height: 100%`.
Wrap it in a container with a set height. Width is determined by the host
layout; the component sets neither `width: 100%` nor `flex: 1` on its root.

## Styles and themes

All styles live in a single CSS file (`src/styles.css`, published as
`dist/styles.css`), available from the package through a subpath export:

```json
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./styles.css": "./dist/styles.css"
  }
}
```

Inside are plain CSS custom properties (`--jh-bg`, `--jh-key`,
`--jh-string`, `--jh-border`, etc.), scoped to the `.json-viewer` class
(not `:root`) so they don't leak into the rest of the host page:

```css
.json-viewer {
  --jh-bg: #1e1e1e;
  --jh-key: #79c0ff;
  /* ... */
}

@media (prefers-color-scheme: light) {
  .json-viewer { /* light values */ }
}

.json-viewer[data-theme="dark"] { /* explicit dark values */ }
.json-viewer[data-theme="light"] { /* explicit light values */ }
```

The component's `theme` prop simply sets (or doesn't set) `data-theme` on
the root `<div>`:

- `theme="system"` (default) — no attribute; `@media (prefers-color-scheme: ...)`
  applies, so the colours follow the visitor's OS/browser setting.
- `theme="light"` / `theme="dark"` — sets `data-theme`, which beats the media
  query thanks to the higher specificity of the attribute selector
  (`.json-viewer[data-theme="dark"]` is more specific than plain
  `.json-viewer` inside `@media`), so the theme stays pinned regardless of
  the system setting.

Token classes use the same variables: `.json-key`, `.json-string`,
`.json-number`, `.json-boolean`, `.json-null` for the three JSON components;
`YamlHighlighter` uses the same colours via the matching `.yaml-key`,
`.yaml-string`, etc., plus two of its own — `.yaml-comment` (italic,
`--jh-label` colour) and `.yaml-dash` (list marker, `--jh-border-focus`
colour).

## Four variants

The three JSON components all take **the same kind of input** — raw JSON
text, as if it had just arrived over the network
(`fetch(url).then(r => r.text())`), not a ready-made JS object. The fourth,
`YamlHighlighter`, works the same way with raw YAML text. Each panel is
edited independently.

### 1. `RegexHighlighter`

Runs a single regex over the raw text and wraps every match (string, number,
`true`/`false`, `null`) in a coloured `<span>`. An object key is told apart
from a string value by a trick inside the regex itself: a match may "grab"
a trailing `\s*:` — if it did, it's a key.

Because this approach only *marks up* the text and never rebuilds it, the
highlighted output always matches the editor content character for
character, in length and position. That makes live editable highlighting
trivial: a transparent `<textarea>` sits on top of the coloured `<pre>` —
the textarea owns the real caret and input, and the `<pre>` underneath shows
through with colour. It is recomputed on every keystroke; the text doesn't
have to be valid JSON — a regex has no notion of "invalid" at all.

**Trade-off:** correctness depends on the regex pattern; exotic edge cases in
the token grammar could in theory be misclassified.

### 2. `AstPositionHighlighter`

A hand-written recursive parser (`src/lib/jsonTokenizer.ts`) that, instead of
building a tree of JS values, emits a flat list of tokens — each with its real
`start`/`end` offset in the source string. A string is marked as a `key` not
by guessing from neighbouring punctuation, but because the parser is
structurally inside `parseObject()`, right after `{` or `,` — where the
grammar allows only a key.

If parsing breaks halfway (say, the text is temporarily invalid while being
edited), the function returns the tokens collected up to the error plus the
error message — the unparsed tail is rendered without highlighting rather
than disappearing.

Because token positions are preserved (nothing is reformatted), the same
transparent-textarea-over-`<pre>` overlay works here as in the regex variant —
but the colouring is now based on the grammar rather than a regex guess.
Live highlighting, recomputed on every keystroke (tokenizing is a cheap
linear pass over the string).

**Trade-off:** more code than the regex variant (a real parser instead of one
pattern), although the tokenizer is reused by the third variant too.

**Validation limitation:** the tokenizer checks structure but is more permissive
than `JSON.parse`: for example, `01`, `1.`, `1e`, and invalid string escapes can
produce `valid: true`. Both AST editors use this result for
`onValidityChange`; `RegexHighlighter` uses `JSON.parse` instead. For strict
validation, check the current text with `JSON.parse` in the host. `format()`
also uses `JSON.parse` and can return `false` even if an AST editor reports
`valid: true`.

### 3. `AstContentEditableHighlighter`

Editing happens directly inside the coloured `contentEditable` element, with
no second overlay layer. This variant is for cases where layering doesn't fit
at all (for example, if the highlighting logic reformats the text by itself,
as a typical AST renderer that rebuilds the value from scratch does) —
nothing here depends on character-exact alignment between two layers,
because there is only one.

The catch: replacing the `innerHTML` of a `contentEditable` element resets
the browser caret. So this component's DOM is **not managed by React** after
the first mount — updates are imperative:

- `onInput` stores the current text in a `ref`, calls `onChange`, and
  (re)starts a 400 ms debounce timer for highlighting and validity updates.
- once typing pauses, `recolor()` saves the caret's character offset (via
  `Selection`/`Range`), re-tokenizes the text, builds the highlighted HTML
  string, swaps `innerHTML`, and then restores the caret to the same offset
  by walking the text nodes of the new DOM.
- `Tab` inserts two spaces via `document.execCommand("insertText", …)`,
  because `contentEditable` has no `selectionStart`/`selectionEnd` like a
  `<textarea>`.

**Trade-off:** highlighting lags ~400 ms behind the end of typing (not
instant per keystroke as in variants 1 and 2), and caret tracking takes
noticeably more code — `contentEditable` was never designed to be driven by
a framework.

### 4. `YamlHighlighter`

The little sibling of `RegexHighlighter`: the same transparent `<textarea>`
over a coloured `<pre>`, but the grammar is now line-based — YAML, unlike
JSON, gives meaning to indentation and to the position of `#`/`:` in a line,
not just to bracket nesting.

One regex, by order of alternatives, catches: a quoted string (double or
single quotes, matched first so that a `#` or `:` inside it isn't taken for
a comment/key), `#...` to the end of the line (comment), the list item
marker `- ` at the start of a line, a mapping key (text from the start of the
line, after the indent and an optional `- ` — the list marker itself is kept
out of the key highlight via lookbehind — up to the nearest `: ` or a `:` at
the end of the line), `true`/`false`, `null`/`~`, numbers.

As with the JSON regex variant, this is markup of raw text without parsing a
tree — it doesn't break on "temporarily incomplete" YAML while editing, but
for the same reason it isn't perfect on every grammar edge case.

**Trade-off:** inline flow syntax (`{a: 1, b: 2}` on one line) and values
containing `:` without a following space (for example a URL like
`http://host:port`) are not highlighted perfectly. There is no `format()`
method, no `indent`/`onValidityChange` props and no `ref`: unlike JSON, YAML
has no single canonical re-serialization through a built-in runtime API (an
analogue of `JSON.parse` + `JSON.stringify`) — rebuilding it would need a
full YAML parser and serializer, which is beyond regex highlighting.

#### Using the YAML editor

Only the common props: `initialYaml`, `title`, `theme`, `onChange`.

```tsx
import { YamlHighlighter } from "@chepchik/json-highlighters";

function ComposeEditor({ initial, onChange }: { initial: string; onChange: (yaml: string) => void }) {
  return (
    <div style={{ height: 480 }}>
      <YamlHighlighter initialYaml={initial} title={null} theme="dark" onChange={onChange} />
    </div>
  );
}
```

How the editor behaves:

- **Tab** inserts two spaces, not a tab character: most parsers forbid tabs
  in YAML indentation.
- **Paste (Ctrl+V)** is the browser's plain paste, without auto-formatting:
  the text goes in as is, and the browser handles the caret and scrolling.
- **No validation** — the component only highlights and reports no validity
  flag. If you need it, check the text from `onChange` with your own parser
  on the host side (for example the [`yaml`](https://www.npmjs.com/package/yaml)
  package: `parse(text)` throws on invalid YAML).
- The component is uncontrolled: `initialYaml` is read only on mount. To
  replace the text from outside (a different file was loaded), remount the
  component with a `key`.
- Page search (Ctrl+F) works the same as in the layered JSON variants — see
  "Page search and the caret" below.

Token colours — the `.yaml-key`, `.yaml-string`, `.yaml-number`,
`.yaml-boolean`, `.yaml-null`, `.yaml-comment`, `.yaml-dash` classes (see
"Styles and themes").

## Formatting (indent: spaces/tab)

Every JSON component (`RegexHighlighter`, `AstPositionHighlighter`,
`AstContentEditableHighlighter`) can format its text with
`ref.format(indent?)` (`"2"` / `"4"` / `"tab"`). The components have no
buttons or selects of their own — the host draws that UI (ready-made labels
for the styles are in the exported `INDENT_OPTIONS`; see
`example/src/JsonPanel.tsx` for an example). `YamlHighlighter` has no
formatting — see the trade-off in the section on variant 4 above.

The logic is shared by all three JSON components and lives in
`src/lib/formatJson.ts`:

```ts
export type IndentStyle = "2" | "4" | "tab";

export function formatJson(text: string, style: IndentStyle): string {
  const parsed = JSON.parse(text);
  return JSON.stringify(parsed, null, style === "tab" ? "\t" : Number(style));
}
```

`JSON.parse` turns the current text into a JavaScript value, and
`JSON.stringify(parsed, null, indentParam)` turns it back into text — the
third `stringify` argument is the "indent style". If `JSON.parse` throws (the
text is invalid), `formatJson` rethrows — formatting fundamentally can't work
on broken JSON, unlike highlighting, which in all three JSON variants also
works on temporarily invalid text (AST variants highlight the parsed prefix).
That's why `ref.format()` simply returns `false` on
invalid text, and the `onValidityChange` flag is handy for disabling the
button on the host side.

On mount, all valid `initialJson` text is formatted, including multiline text;
invalid text is kept unchanged. On paste, the entire resulting document is
formatted if `JSON.parse` accepts it; otherwise the inserted text stays
unformatted. This automatic formatting also happens without calling `format()`.

This is re-serialization, not a whitespace-only transform: it can normalize
number notation and string escapes, reorder integer-like object keys, collapse
duplicate keys, and change numbers outside JavaScript's exact numeric range.
`JSON.parse` can return any JSON value, including primitives and arrays.

## Page search and the caret

In the three layered components (`RegexHighlighter`,
`AstPositionHighlighter`, `YamlHighlighter`) the text is in the DOM twice:
in the coloured `<pre>` and in the transparent `<textarea>` on top of it. To
keep the layers aligned:

- The `<pre>` has the `inert` attribute. Browser search (Ctrl+F) finds and
  scrolls only the textarea, and the `<pre>` follows its scroll. Previously
  search scrolled the `<pre>` itself: the found word "floated", and mouse
  selection landed on lines other than the visible ones (fixed in 1.0.1).
- If something else still scrolls the `<pre>`, it snaps straight back to
  the textarea's position.
- After a paste with auto-formatting and after `ref.current?.format()`,
  `RegexHighlighter` and `AstPositionHighlighter` adjust vertical scrolling
  to show the caret. Previously the caret was placed correctly but
  off-screen, so it looked as if it had jumped to the start (fixed in 1.0.2).

`AstContentEditableHighlighter` has a single layer, so it needs no overlay
scroll synchronization. It has no explicit scroll-to-caret helper.

## Shared code

`src/lib/jsonTokenizer.ts` — the position-preserving tokenizer used by
`AstPositionHighlighter` and `AstContentEditableHighlighter`, so the parsing
logic isn't duplicated between them. Also exported from the package
(`tokenizeWithPositions`) in case you need the parsing without the UI.

`src/lib/formatJson.ts` — formatting text with the chosen indent style
(`formatJson`, `INDENT_OPTIONS`), also exported separately.

`src/lib/editorApi.ts` — types of the JSON editors' public API:
`JsonEditorHandle` (what the `ref` holds) and `JsonValidity` (the
`onValidityChange` argument). Exported from the package.

`src/lib/overlaySync.ts` and `src/lib/scrollCaret.ts` — internal helpers for
the layered components (`inert` and `<pre>` scroll sync, scrolling to the
caret); not exported from the package.

## Migrating from 0.1.x

Previously every JSON component rendered its own toolbar (an "Indent:"
select, a "Format" button) and a "✓ JSON valid" status line. They are gone —
the component renders only the editor:

| Before | Now |
|---|---|
| "Indent:" select inside the component | `indent` prop + your own select on the host side (labels in `INDENT_OPTIONS`) |
| "Format" button | `ref.current.format(indent?)` |
| "✓ JSON valid" / "⚠ …" status | `onValidityChange={(v) => …}` + your own markup |
| CSS classes `.json-viewer__toolbar`, `__select`, `__format-btn`, `__format-error`, `__status*` | Removed from `styles.css` |
| CSS variables `--jh-bg-btn`, `--jh-status-ok`, `--jh-status-error` | Removed |

`RegexHighlighter` used to keep the button enabled on invalid JSON too
(showing an error after the click) — now `format()` simply returns `false`
on invalid text, like the others. A ready-made host panel example is
`example/src/JsonPanel.tsx`.

## Development

This is part of a monorepo; see `example/` at the repository root for a
working demo of all four components side by side on one page.

Run these commands from the repository root:

```bash
npm install          # install npm workspaces; prepare builds the library
npm run build:lib    # build the library, including dist/styles.css
npm run dev          # start the Vite demo dev server
npm test             # unit and component tests (Vitest + jsdom)
npm run coverage     # report: packages/json-highlighters/coverage/
npm run build        # build both library and demo
npx playwright install chromium # install the E2E browser once
npm run test:e2e     # build library, then test the demo in Chromium
```

E2E uses the demo's Vite dev server on port 5183, not a production demo build.
For library development, run `npm run dev --workspace=packages/json-highlighters`
in a second terminal to rebuild JavaScript and declarations in watch mode.
That watch command does not copy CSS; after changing `src/styles.css`, run
`npm run copy:css --workspace=packages/json-highlighters` or rebuild the library.
