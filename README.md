# json-highlighters

Монорепозиторий (npm workspaces) с библиотекой `@chepchik/json-highlighters` —
три самописных подхода к живой, редактируемой подсветке синтаксиса JSON в
React 18/19 плюс подсветка YAML — и демо-приложением, показывающим все
четыре компонента рядом друг с другом.

```
.
├── packages/
│   └── json-highlighters/   ← сама библиотека (публикуется в npm)
├── example/                 ← демо-приложение на Vite + React, использует библиотеку
└── e2e/                     ← Playwright-тесты против демо (playwright.config.ts в корне)
```

## Быстрый старт

```bash
npm install               # ставит зависимости всех workspace-пакетов сразу
npm run build:lib         # собирает библиотеку (нужно перед первым npm run dev)
npm run dev                # запускает демо-приложение (example/) на localhost:5173
```

Другие команды из корня:

```bash
npm run build              # собирает библиотеку, затем демо-приложение
npm run build:example      # собирает только демо-приложение
npm run lint                # линт демо-приложения (oxlint)
npm test                    # юнит- и компонентные тесты библиотеки (Vitest)
npm run coverage            # то же с отчётом покрытия
npm run test:e2e            # собирает библиотеку и гоняет Playwright против демо
```

## Библиотека — `@chepchik/json-highlighters`

Три JSON-компонента с одинаковым API (`initialJson`, `title`, `theme`,
`onChange`, `indent`, `onValidityChange`, `ref` с методом `format()`) и
`YamlHighlighter`. Поддержка React 18 и 19, CSS одной строкой, тёмная/светлая
тема (по умолчанию следует `prefers-color-scheme`, либо фиксируется явно).

Компоненты рендерят **только редактор**: тулбар (отступ, «Форматировать») и
галочку «✓ JSON валиден» рисует хост — по флагу из `onValidityChange` и
вызовом `ref.current.format()`:

```tsx
import "@chepchik/json-highlighters/styles.css";
import {
  RegexHighlighter,
  AstPositionHighlighter,
  AstContentEditableHighlighter,
  YamlHighlighter,
  type JsonEditorHandle,
  type JsonValidity,
} from "@chepchik/json-highlighters";
```

Полное описание того, как устроен каждый из подходов (regex-подсветка,
AST-токенизатор с сохранением позиций, AST внутри `contentEditable`, YAML),
компромиссы каждого, API форматирования и валидности, миграция с 0.1.x и как
устроены темы — в
**[`packages/json-highlighters/README.md`](./packages/json-highlighters/README.md)**.

## Демо — `example/`

Обычное Vite + React + TypeScript приложение, зависящее от
`@chepchik/json-highlighters` через npm workspaces (симлинк в
`node_modules/@chepchik/json-highlighters` на `packages/json-highlighters`).
Показывает все четыре компонента на одной странице, панели делят ширину
поровну (`.split-screen` в `example/src/App.css`), стартовые данные — из
`example/src/data/sampleData.ts`.

Тулбар и статус под каждой JSON-панелью рисует `example/src/JsonPanel.tsx` —
это и есть образец того, как хосту собрать свой UI вокруг редактора
(`onValidityChange` → галочка, `ref.format()` → кнопка «Форматировать»).
По атрибуту `data-panel` на панелях e2e-тесты находят эти контролы.

При изменении кода библиотеки её нужно пересобрать (`npm run build:lib`),
чтобы демо подхватило новую версию `dist/` — `vite dev` в `example/` не
следит за исходниками `packages/json-highlighters/src` напрямую.

## Публикация в npm

`.github/workflows/publish.yml` публикует пакет через **npm Trusted
Publishing (OIDC)** — без токенов и секретов в GitHub. Аутентификация в
registry происходит через `id-token: write` permission у джобы; npm сверяет
её с настройками Trusted Publisher у пакета на своей стороне.

**Одноразовая настройка** (нужна до первого успешного паблиша — работает и
для ещё не опубликованного пакета):

1. На [npmjs.com](https://www.npmjs.com) → страница пакета (или
   `Access Tokens` → создать пакет-заглушку, если он ни разу не публиковался)
   → раздел **Trusted Publisher**.
2. Указать:
   - **Organization or user**: `Egortex`
   - **Repository**: `json-highlighters`
   - **Workflow filename**: `publish.yml`
   - **Allowed actions**: `npm publish`
3. Больше ничего не нужно — `NPM_TOKEN`/`NODE_AUTH_TOKEN` в секретах
   репозитория не используются.

Запуск релиза:

```bash
npm run release -- json-highlighters patch   # бампает версию, коммитит, тегает
git push origin main json-highlighters-v0.1.1 # пуш тега запускает publish.yml
```

Либо вручную — вкладка **Actions** → *Publish package to npm* → *Run
workflow*.
