import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { RegexHighlighter } from "./RegexHighlighter";
import type { JsonEditorHandle } from "./lib/editorApi";

function getTextarea(): HTMLTextAreaElement {
  return screen.getByLabelText("Редактируемый JSON-текст (regex-подсветка)") as HTMLTextAreaElement;
}

function makeClipboardEvent(text: string) {
  return { clipboardData: { getData: () => text } };
}

describe("<RegexHighlighter />", () => {
  it("форматирует сжатый initialJson при монтировании", () => {
    render(<RegexHighlighter initialJson='{"a":1}' />);
    expect(getTextarea().value).toBe('{\n  "a": 1\n}');
  });

  it("не трогает уже отформатированный initialJson", () => {
    const pretty = '{\n  "a": 1\n}';
    render(<RegexHighlighter initialJson={pretty} />);
    expect(getTextarea().value).toBe(pretty);
  });

  it("рендерит заголовок по умолчанию и позволяет его скрыть через title=null", () => {
    const { rerender } = render(<RegexHighlighter />);
    expect(screen.getByText("Regex-подсветка")).toBeInTheDocument();
    rerender(<RegexHighlighter title={null} />);
    expect(screen.queryByText("Regex-подсветка")).not.toBeInTheDocument();
  });

  it("рендерит кастомный заголовок", () => {
    render(<RegexHighlighter title="Кастом" />);
    expect(screen.getByText("Кастом")).toBeInTheDocument();
  });

  it("подсвечивает синтаксис через классы json-key/json-string/json-number/json-boolean/json-null", () => {
    render(<RegexHighlighter initialJson='{"a":"s","b":1,"c":true,"d":null}' />);
    const pre = document.querySelector(".json-viewer__highlight")!;
    expect(pre.querySelector(".json-key")).not.toBeNull();
    expect(pre.querySelector(".json-string")).not.toBeNull();
    expect(pre.querySelector(".json-number")).not.toBeNull();
    expect(pre.querySelector(".json-boolean")).not.toBeNull();
    expect(pre.querySelector(".json-null")).not.toBeNull();
  });

  it("экранирует HTML в значениях, чтобы не внедрить разметку", () => {
    render(<RegexHighlighter initialJson='{"a":"<img onerror=1>"}' />);
    const pre = document.querySelector(".json-viewer__highlight")!;
    expect(pre.innerHTML).not.toContain("<img");
    expect(pre.innerHTML).toContain("&lt;img");
  });

  it("подсвечивает даже невалидный (промежуточный) JSON, не требуя валидности", () => {
    render(<RegexHighlighter initialJson='{"a": ' />);
    // Не бросает и не показывает ошибку форматирования сама по себе — просто подсвечивает то, что есть.
    expect(getTextarea().value).toBe('{"a": ');
  });

  it("вызывает onChange при наборе текста", () => {
    const onChange = vi.fn();
    render(<RegexHighlighter initialJson="{}" onChange={onChange} />);
    fireEvent.change(getTextarea(), { target: { value: "{}x" } });
    expect(onChange).toHaveBeenCalledWith("{}x");
    expect(getTextarea().value).toBe("{}x");
  });

  it("Tab вставляет два пробела вместо перевода фокуса и предотвращает дефолтное поведение", () => {
    render(<RegexHighlighter initialJson="{}" />);
    const ta = getTextarea();
    ta.setSelectionRange(1, 1);
    const event = fireEvent.keyDown(ta, { key: "Tab" });
    expect(event).toBe(false); // preventDefault был вызван -> fireEvent возвращает false
    expect(ta.value).toBe("{  }");
  });

  it("нажатие любой другой клавиши не перехватывается специально", () => {
    render(<RegexHighlighter initialJson="{}" />);
    const ta = getTextarea();
    const event = fireEvent.keyDown(ta, { key: "a" });
    expect(event).toBe(true); // preventDefault НЕ вызывался
  });

  it("ref.format() переформатирует валидный JSON и сохраняет позицию курсора", () => {
    // initialJson форматируется ПРИ МОНТИРОВАНИИ, так что для реальной
    // проверки format() нужно сначала вручную "расформатировать" —
    // просто напечатать компактный JSON (без автоформата, который есть
    // только у вставки), а потом уже вызвать format().
    const ref = createRef<JsonEditorHandle>();
    render(<RegexHighlighter ref={ref} initialJson="{}" />);
    const ta = getTextarea();
    fireEvent.change(ta, { target: { value: '{"a":1,"b":2}' } });
    ta.focus();
    // Курсор сразу после '{"a":1,' — после форматирования должен остаться
    // сразу после '"a": 1,' в новом тексте, а не в конце документа.
    const caret = '{"a":1,'.length;
    ta.setSelectionRange(caret, caret);
    act(() => {
      expect(ref.current!.format()).toBe(true);
    });
    expect(ta.value).toBe('{\n  "a": 1,\n  "b": 2\n}');
    expect(ta.value.slice(0, ta.selectionStart)).toBe('{\n  "a": 1,');
  });

  it("ref.format() на невалидном JSON возвращает false и не трогает текст", () => {
    const ref = createRef<JsonEditorHandle>();
    render(<RegexHighlighter ref={ref} initialJson='{"a": ' />);
    act(() => {
      expect(ref.current!.format()).toBe(false);
    });
    expect(getTextarea().value).toBe('{"a": ');
  });

  it("стиль отступа: аргумент format() и проп indent", () => {
    const ref = createRef<JsonEditorHandle>();
    const { rerender } = render(<RegexHighlighter ref={ref} initialJson='{"a":1}' />);
    act(() => {
      ref.current!.format("4");
    });
    expect(getTextarea().value).toBe('{\n    "a": 1\n}');
    rerender(<RegexHighlighter ref={ref} initialJson='{"a":1}' indent="tab" />);
    act(() => {
      ref.current!.format();
    });
    expect(getTextarea().value).toBe('{\n\t"a": 1\n}');
  });

  it("onValidityChange: флаг через JSON.parse, хотя подсветке валидность не нужна", () => {
    const onValidityChange = vi.fn();
    render(<RegexHighlighter initialJson="{}" onValidityChange={onValidityChange} />);
    expect(onValidityChange).toHaveBeenLastCalledWith({ valid: true });
    fireEvent.change(getTextarea(), { target: { value: '{"a": ' } });
    expect(onValidityChange).toHaveBeenLastCalledWith({ valid: false, error: expect.any(String) });
  });

  it("рендерит только редактор — без тулбара", () => {
    render(<RegexHighlighter />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("вставка валидного JSON автоформатируется, preventDefault вызывается, курсор — после вставленного", () => {
    render(<RegexHighlighter initialJson="{}" />);
    const ta = getTextarea();
    fireEvent.change(ta, { target: { value: '{"a":1,"b":2}' } });
    ta.focus();
    const start = '{"a":1,'.length;
    ta.setSelectionRange(start, start);
    const pasted = '"x": 9,';
    const event = fireEvent.paste(ta, makeClipboardEvent(pasted));
    expect(event).toBe(false); // preventDefault вызван
    expect(ta.value).toBe('{\n  "a": 1,\n  "x": 9,\n  "b": 2\n}');
    expect(ta.value.slice(0, ta.selectionStart)).toBe('{\n  "a": 1,\n  "x": 9,');
  });

  it("вставка невалидного результата не перехватывается — preventDefault не вызывается", () => {
    render(<RegexHighlighter initialJson='{"a":1}' />);
    const ta = getTextarea();
    ta.focus();
    ta.setSelectionRange(1, 1);
    const event = fireEvent.paste(ta, makeClipboardEvent("not valid json {{{"));
    expect(event).toBe(true); // preventDefault НЕ вызван — обычная вставка идёт своим ходом
  });

  it("скролл textarea синхронизируется со слоем подсветки", () => {
    render(<RegexHighlighter initialJson={"{\n".repeat(50) + "}".repeat(50)} />);
    const ta = getTextarea();
    const pre = document.querySelector(".json-viewer__highlight") as HTMLElement;
    Object.defineProperty(ta, "scrollTop", { value: 42, configurable: true });
    Object.defineProperty(ta, "scrollLeft", { value: 7, configurable: true });
    fireEvent.scroll(ta);
    expect(pre.scrollTop).toBe(42);
    expect(pre.scrollLeft).toBe(7);
  });

  it.each([
    ["system", null],
    ["light", "light"],
    ["dark", "dark"],
  ] as const)("theme=%s -> data-theme=%s", (theme, expected) => {
    render(<RegexHighlighter theme={theme} />);
    const root = document.querySelector(".json-viewer--regex")!;
    if (expected === null) {
      expect(root.getAttribute("data-theme")).toBeNull();
    } else {
      expect(root.getAttribute("data-theme")).toBe(expected);
    }
  });
});
