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
