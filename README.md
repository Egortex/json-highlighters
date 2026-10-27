# json-highlighters

**English** · [Русский](./README.ru.md)

A monorepo (npm workspaces) with the `@chepchik/json-highlighters` library — live,
editable JSON and YAML syntax highlighting for React 18/19 — and a demo app
that shows all its editors side by side.

- `packages/json-highlighters/` — the library, published to npm
- `example/` — demo app (Vite + React)
- `e2e/` — Playwright tests against the demo

## What it is

Four editor components, each a different approach:

- **`RegexHighlighter`** — one regex marks up the raw text; a transparent
  `<textarea>` sits over the coloured `<pre>`. Works on temporarily invalid JSON.
- **`AstPositionHighlighter`** — a hand-written tokenizer that keeps every
  token's position in the source string; same layered overlay, but
  classification follows the grammar instead of a regex guess.
- **`AstContentEditableHighlighter`** — editing happens inside the coloured
  `contentEditable` element itself; recolouring is debounced and the caret is
  restored after each repaint.
- **`YamlHighlighter`** — the line-based YAML counterpart of the regex variant.

The components render **only the editor**. Indent selection, the "Format"
button and the validity mark for the JSON editors are drawn by the host app:
validity comes from `onValidityChange`, formatting is invoked through
`ref.current?.format()`. YAML has neither formatting nor a validity callback.
The AST editors' validity check is more permissive than `JSON.parse`; see the
validation limitations in the library README.

Full documentation: [`packages/json-highlighters/README.md`](./packages/json-highlighters/README.md).

## Development

Run from the repository root:

```bash
npm install          # install workspaces; prepare builds the library
npm run build:lib    # build the library, including CSS
npm run dev          # start the Vite demo dev server
npm test             # unit and component tests
npm run coverage     # report: packages/json-highlighters/coverage/
npm run build        # build library and demo
npx playwright install chromium # install the E2E browser once
npm run test:e2e     # build library, then run Playwright against the demo dev server
```

For library changes, run `npm run dev --workspace=packages/json-highlighters`
in a second terminal. Watch mode rebuilds JavaScript and type declarations;
CSS changes need `npm run copy:css --workspace=packages/json-highlighters`
or a full library build.

## What's done

- **1.0.0** — the toolbar and status line were removed from the components:
  new `indent` and `onValidityChange` props, `ref.format()` method,
  exported `JsonEditorHandle` / `JsonValidity` types. Breaking change — see
  the migration section in the library README.
- `YamlHighlighter` added.
- Tests: Vitest unit and component tests (100% line coverage in the current
  run, with test files and `src/index.ts` excluded) and Playwright e2e tests
  in Chromium.
- Demo: `example/src/JsonPanel.tsx` shows how a host builds its own toolbar
  around the editor.

## What's fixed

- **1.0.1** — page search (Ctrl+F) no longer splits the layers apart: the
  found word used to "float" and mouse selection hit lines other than the
  visible ones. Test `.d.ts` files no longer end up in the published package.
- **1.0.2** — after auto-formatted paste or formatting, `RegexHighlighter`
  and `AstPositionHighlighter` adjust vertical scrolling to show the caret.
  The caret used to be placed correctly but off-screen, so it looked as if it
  had jumped to the start.
