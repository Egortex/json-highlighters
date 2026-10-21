import { useRef, useState } from "react";
import type { ComponentType, RefAttributes } from "react";
import { INDENT_OPTIONS } from "@chepchik/json-highlighters";
import type { IndentStyle, JsonEditorHandle, JsonValidity } from "@chepchik/json-highlighters";

/** Общие пропы трёх JSON-редакторов, которые использует панель. */
interface JsonEditorProps extends RefAttributes<JsonEditorHandle> {
	initialJson?: string;
	theme?: "system" | "light" | "dark";
	indent?: IndentStyle;
	onValidityChange?: (validity: JsonValidity) => void;
}

interface JsonPanelProps {
	/** Какой из JSON-редакторов рендерить. */
	Editor: ComponentType<JsonEditorProps>;
	/** Значение data-panel — по нему e2e-тесты находят контролы панели. */
	panel: string;
	initialJson: string;
}

/**
 * Сами компоненты библиотеки рендерят только редактор. Отступ, кнопку
 * «Форматировать» и галочку валидности рисует хост: флаг приходит через
 * onValidityChange, а форматирование — вызов ref.format() у редактора.
 */
export function JsonPanel({ Editor, panel, initialJson }: JsonPanelProps) {
	const editorRef = useRef<JsonEditorHandle>(null);
	const [indent, setIndent] = useState<IndentStyle>("2");
	const [validity, setValidity] = useState<JsonValidity>({ valid: true });
	const selectId = `${panel}-indent-select`;

	return (
		<div className='split-half' data-panel={panel}>
			<Editor
				ref={editorRef}
				initialJson={initialJson}
				theme='dark'
				indent={indent}
				onValidityChange={setValidity}
			/>
			<div className='panel-controls'>
				<div className='panel-controls__toolbar'>
					<label htmlFor={selectId}>Отступ:</label>
					<select
						id={selectId}
						value={indent}
						onChange={(e) => setIndent(e.target.value as IndentStyle)}
					>
						{INDENT_OPTIONS.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
					<button
						type='button'
						onClick={() => editorRef.current?.format()}
						disabled={!validity.valid}
						title={validity.valid ? undefined : "Сначала исправьте JSON"}
					>
						Форматировать
					</button>
				</div>
				<p className={`panel-status ${validity.valid ? "panel-status--ok" : "panel-status--error"}`}>
					{validity.valid ? "✓ JSON валиден" : `⚠ ${validity.error}`}
				</p>
			</div>
		</div>
	);
}
