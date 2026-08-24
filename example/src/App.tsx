import {
	RegexHighlighter,
	AstPositionHighlighter,
	AstContentEditableHighlighter,
	YamlHighlighter,
} from "@chepchik/json-highlighters";
import { sampleData, sampleYaml } from "./data/sampleData";
import "./App.css";

// sampleData — уже готовый JSON-текст (строка), а не JS-объект: именно так
// данные и приходят по сети (fetch().then(r => r.text())), без JSON.parse
// на этой стороне. Сжимаем в одну строку (parse + stringify без отступа),
// чтобы демо наглядно показывало автоформат компонентов при монтировании.
const initialJson = JSON.stringify(JSON.parse(sampleData));

function App() {
	return (
		<>
			<header className='page-header'>
				<h1>Сравнение JSON-вьюеров</h1>
				<p>
					Демо библиотеки <code>@chepchik/json-highlighters</code> — три самописных подхода к
					подсветке синтаксиса JSON в React, все живые и редактируемые.
					<strong> Regex</strong> размечает сырой текст одним паттерном (работает даже на временно
					невалидном JSON). <strong>AST + позиции</strong> разбирает текст структурно, но сохраняет
					смещение каждого токена в исходной строке — за счёт этого может наложить живую
					посимвольно выровненную textarea, как и regex-вариант.{" "}
					<strong>AST contentEditable</strong> редактирует прямо внутри раскрашенного элемента,
					перекрашивая с дебаунсом и сохраняя/восстанавливая позицию курсора при каждой перерисовке.{" "}
					<strong>YAML</strong> — младшая сестра Regex-варианта: та же прозрачная textarea поверх
					подсветки, но построчная грамматика для ключей, списков и комментариев.
				</p>
			</header>

			{/* Четыре панели поровну делят экран (см. .split-screen в App.css) —
			    на узких экранах складываются в колонку. Страница у демо всегда
			    тёмная (см. index.css), поэтому явно фиксируем theme="dark" —
			    иначе при светлой системной теме компоненты (по умолчанию
			    theme="system") стали бы светлыми на тёмном фоне страницы. */}
			<main className='split-screen'>
				<div className='split-half'>
					<RegexHighlighter initialJson={initialJson} theme='dark' />
				</div>
				<div className='split-half'>
					<AstPositionHighlighter initialJson={initialJson} theme='dark' />
				</div>
				<div className='split-half'>
					<AstContentEditableHighlighter initialJson={initialJson} theme='dark' />
				</div>
				<div className='split-half'>
					<YamlHighlighter initialYaml={sampleYaml} theme='dark' />
				</div>
			</main>
		</>
	);
}

export default App;
