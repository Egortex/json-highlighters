import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { AstPositionHighlighter } from "./AstPositionHighlighter";
import type { JsonEditorHandle } from "./lib/editorApi";

function getTextarea(): HTMLTextAreaElement {
  return screen.getByLabelText("Редактируемый JSON-текст (AST-токенизатор с позициями)") as HTMLTextAreaElement;
}

function makeClipboardEvent(text: string) {
  return { clipboardData: { getData: () => text } };
}

describe("<AstPositionHighlighter />", () => {
  it("форматирует сжатый initialJson при монтировании", () => {
    render(<AstPositionHighlighter initialJson='{"a":1}' />);
    expect(getTextarea().value).toBe('{\n  "a": 1\n}');
  });

  it("заголовок: по умолчанию, кастомный, скрытый через title=null", () => {
    const { rerender } = render(<AstPositionHighlighter />);
    expect(screen.getByText("AST-токенизатор + позиции")).toBeInTheDocument();
    rerender(<AstPositionHighlighter title="Кастом" />);
    expect(screen.getByText("Кастом")).toBeInTheDocument();
    rerender(<AstPositionHighlighter title={null} />);
    expect(screen.queryByText("Кастом")).not.toBeInTheDocument();
  });

  it("рендерит только редактор — без тулбара и статуса", () => {
    render(<AstPositionHighlighter />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("onValidityChange: valid при монтировании, ошибка — при невалидном тексте", () => {
    const onValidityChange = vi.fn();
    render(<AstPositionHighlighter initialJson='{"a":1}' onValidityChange={onValidityChange} />);
    expect(onValidityChange).toHaveBeenLastCalledWith({ valid: true });
    fireEvent.change(getTextarea(), { target: { value: '{"a": ' } });
    expect(onValidityChange).toHaveBeenLastCalledWith({ valid: false, error: expect.any(String) });
  });

  it("подсвечивает структурно: ключ/строка/число/boolean/null получают классы json-*", () => {
    render(<AstPositionHighlighter initialJson='{"k":"s","n":1,"b":true,"z":null}' />);
    const pre = document.querySelector(".json-viewer__highlight")!;
    expect(pre.querySelector(".json-key")).not.toBeNull();
    expect(pre.querySelector(".json-string")).not.toBeNull();
    expect(pre.querySelector(".json-number")).not.toBeNull();
    expect(pre.querySelector(".json-boolean")).not.toBeNull();
    expect(pre.querySelector(".json-null")).not.toBeNull();
  });

  it("не подсвечивает неразобранный хвост, но и не теряет его (рендерится как обычный текст)", () => {
    render(<AstPositionHighlighter initialJson='{"a": 1} garbage' />);
    const pre = document.querySelector(".json-viewer__highlight")!;
    expect(pre.textContent).toContain("garbage");
  });

  it("вызывает onChange при наборе текста", () => {
    const onChange = vi.fn();
    render(<AstPositionHighlighter initialJson="{}" onChange={onChange} />);
    fireEvent.change(getTextarea(), { target: { value: "{}x" } });
    expect(onChange).toHaveBeenCalledWith("{}x");
  });

  it("Tab вставляет два пробела и предотвращает дефолтное поведение", () => {
    render(<AstPositionHighlighter initialJson="{}" />);
    const ta = getTextarea();
    ta.setSelectionRange(1, 1);
    const event = fireEvent.keyDown(ta, { key: "Tab" });
    expect(event).toBe(false);
    expect(ta.value).toBe("{  }");
  });

  it("другие клавиши не перехватываются", () => {
    render(<AstPositionHighlighter initialJson="{}" />);
    const event = fireEvent.keyDown(getTextarea(), { key: "a" });
    expect(event).toBe(true);
  });

  it("ref.format() на валидном JSON переформатирует и сохраняет позицию курсора", () => {
    const ref = createRef<JsonEditorHandle>();
    render(<AstPositionHighlighter ref={ref} initialJson="{}" />);
    const ta = getTextarea();
    fireEvent.change(ta, { target: { value: '{"a":1,"b":2}' } });
    ta.focus();
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
    render(<AstPositionHighlighter ref={ref} initialJson='{"a": ' />);
    act(() => {
      expect(ref.current!.format()).toBe(false);
    });
    expect(getTextarea().value).toBe('{"a": ');
  });

  it("стиль отступа: аргумент format() и проп indent", () => {
    const ref = createRef<JsonEditorHandle>();
    const { rerender } = render(<AstPositionHighlighter ref={ref} initialJson='{"a":1}' />);
    act(() => {
      ref.current!.format("tab");
    });
    expect(getTextarea().value).toBe('{\n\t"a": 1\n}');
    rerender(<AstPositionHighlighter ref={ref} initialJson='{"a":1}' indent="4" />);
    act(() => {
      ref.current!.format();
    });
    expect(getTextarea().value).toBe('{\n    "a": 1\n}');
  });

  it("вставка валидного JSON автоформатируется, курсор — после вставленного фрагмента", () => {
    render(<AstPositionHighlighter initialJson="{}" />);
    const ta = getTextarea();
    fireEvent.change(ta, { target: { value: '{"a":1,"b":2}' } });
    ta.focus();
    const start = '{"a":1,'.length;
    ta.setSelectionRange(start, start);
    const pasted = '"x": 9,';
    const event = fireEvent.paste(ta, makeClipboardEvent(pasted));
    expect(event).toBe(false);
    expect(ta.value).toBe('{\n  "a": 1,\n  "x": 9,\n  "b": 2\n}');
    expect(ta.value.slice(0, ta.selectionStart)).toBe('{\n  "a": 1,\n  "x": 9,');
  });

  it("вставка, после которой JSON остаётся невалидным, не перехватывается", () => {
    render(<AstPositionHighlighter initialJson='{"a":1}' />);
    const ta = getTextarea();
    ta.focus();
    ta.setSelectionRange(1, 1);
    const event = fireEvent.paste(ta, makeClipboardEvent("not valid json {{{"));
    expect(event).toBe(true);
  });

  it("скролл textarea синхронизируется со слоем подсветки", () => {
    render(<AstPositionHighlighter initialJson={"{\n".repeat(30) + "}".repeat(30)} />);
    const ta = getTextarea();
    const pre = document.querySelector(".json-viewer__highlight") as HTMLElement;
    Object.defineProperty(ta, "scrollTop", { value: 15, configurable: true });
    Object.defineProperty(ta, "scrollLeft", { value: 3, configurable: true });
    fireEvent.scroll(ta);
    expect(pre.scrollTop).toBe(15);
    expect(pre.scrollLeft).toBe(3);
  });

  it.each([
    ["system", null],
    ["light", "light"],
    ["dark", "dark"],
  ] as const)("theme=%s -> data-theme=%s", (theme, expected) => {
    render(<AstPositionHighlighter theme={theme} />);
    const root = document.querySelector(".json-viewer--ast-position")!;
    expect(root.getAttribute("data-theme")).toBe(expected);
  });
});
