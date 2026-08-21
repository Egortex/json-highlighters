# json-highlighters

Монорепозиторий (npm workspaces) с библиотекой `@chepchik/json-highlighters` —
три самописных подхода к живой, редактируемой подсветке синтаксиса JSON в
React 18/19 — и демо-приложением, показывающим все три рядом друг с другом.

```
.
├── packages/
│   └── json-highlighters/   ← сама библиотека (публикуется в npm)
└── example/                 ← демо-приложение на Vite + React, использует библиотеку
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
```

## Библиотека — `@chepchik/json-highlighters`

Три компонента с одинаковым API (`initialJson`, `title`, `theme`,
`onChange`), поддержка React 18 и 19, CSS одной строкой, тёмная/светлая
тема (по умолчанию следует `prefers-color-scheme`, либо фиксируется явно):

```tsx
import "@chepchik/json-highlighters/styles.css";
import {
  RegexHighlighter,
  AstPositionHighlighter,
  AstContentEditableHighlighter,
} from "@chepchik/json-highlighters";
```

Полное описание того, как устроен каждый из трёх подходов (regex-подсветка,
AST-токенизатор с сохранением позиций, AST внутри `contentEditable`),
компромиссы каждого, логика форматирования (отступы: пробелы/таб) и как
устроены темы — в
**[`packages/json-highlighters/README.md`](./packages/json-highlighters/README.md)**.

## Демо — `example/`

Обычное Vite + React + TypeScript приложение, зависящее от
`@chepchik/json-highlighters` через npm workspaces (симлинк в
`node_modules/@chepchik/json-highlighters` на `packages/json-highlighters`).
Показывает все три компонента на одной странице в раскладке 50/50/50
(`.split-screen` в `example/src/App.css`) с общими стартовыми данными из
`example/src/data/sampleData.ts`.

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
