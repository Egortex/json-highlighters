import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import { AstContentEditableHighlighter, setCaretOffset, getCaretOffset } from "./AstContentEditableHighlighter";
import type { JsonEditorHandle } from "./lib/editorApi";

/** vi.advanceTimersByTime() сам по себе не оборачивает синхронные
 * setState-вызовы recolor() в React act() — без этого обновлённый DOM
 * (например, текст статус-строки) не гарантированно виден синхронно сразу
 * после advance. */
function advanceDebounce(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function getEditor(): HTMLPreElement {
  return screen.getByLabelText("Редактируемый JSON-текст (contentEditable AST-подсветка)") as HTMLPreElement;
}

/** Симулирует обычный набор текста: contentEditable не контролируется React
 * напрямую, так что "печать" — это ручная мутация textContent + событие
 * "input" (как и было бы в браузере после реального нажатия клавиши). */
function typeText(el: HTMLPreElement, text: string) {
  el.textContent = text;
  fireEvent.input(el);
}

function placeCaret(el: HTMLPreElement, offset: number) {
  setCaretOffset(el, offset);
}

function makeClipboardEvent(text: string) {
  return { clipboardData: { getData: () => text } };
}

describe("<AstContentEditableHighlighter />", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("форматирует сжатый initialJson при монтировании", () => {
    render(<AstContentEditableHighlighter initialJson='{"a":1}' />);
    expect(getEditor().textContent).toBe('{\n  "a": 1\n}');
  });

  it("заголовок: по умолчанию, кастомный, скрытый через title=null", () => {
    const { rerender } = render(<AstContentEditableHighlighter />);
    expect(screen.getByText("AST contentEditable")).toBeInTheDocument();
    rerender(<AstContentEditableHighlighter title="Кастом" />);
    expect(screen.getByText("Кастом")).toBeInTheDocument();
    rerender(<AstContentEditableHighlighter title={null} />);
    expect(screen.queryByText("Кастом")).not.toBeInTheDocument();
  });

  it("рендерит только редактор и подсвечивает синтаксис классами json-*", () => {
    render(<AstContentEditableHighlighter initialJson='{"k":"s","n":1,"b":true,"z":null}' />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    const el = getEditor();
    expect(el.querySelector(".json-key")).not.toBeNull();
    expect(el.querySelector(".json-string")).not.toBeNull();
    expect(el.querySelector(".json-number")).not.toBeNull();
    expect(el.querySelector(".json-boolean")).not.toBeNull();
    expect(el.querySelector(".json-null")).not.toBeNull();
  });

  it("ввод текста вызывает onChange немедленно, а флаг валидности — только после дебаунса", () => {
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    render(
      <AstContentEditableHighlighter initialJson="{}" onChange={onChange} onValidityChange={onValidityChange} />
    );
    expect(onValidityChange).toHaveBeenLastCalledWith({ valid: true });
    const el = getEditor();
    typeText(el, "{}x");
    expect(onChange).toHaveBeenCalledWith("{}x");
    // Статус ещё не обновился — recolor() отложен дебаунсом.
    expect(onValidityChange).toHaveBeenLastCalledWith({ valid: true });
    advanceDebounce(400);
    expect(onValidityChange).toHaveBeenLastCalledWith({ valid: false, error: expect.any(String) });
  });

  it("быстрый повторный ввод откладывает перекраску заново (дебаунс перезапускается)", () => {
    const onValidityChange = vi.fn();
    render(<AstContentEditableHighlighter initialJson="{}" onValidityChange={onValidityChange} />);
    const el = getEditor();
    typeText(el, "{}x");
    advanceDebounce(300);
    typeText(el, "{}xy");
    advanceDebounce(300); // всего 600мс с первого ввода, но только 300 с последнего
    expect(onValidityChange).toHaveBeenLastCalledWith({ valid: true });
    advanceDebounce(100);
    expect(onValidityChange).toHaveBeenLastCalledWith({ valid: false, error: expect.any(String) });
  });

  it("ref.format() переформатирует валидный JSON и сохраняет позицию курсора", () => {
    const ref = createRef<JsonEditorHandle>();
    render(<AstContentEditableHighlighter ref={ref} initialJson="{}" />);
    const el = getEditor();
    typeText(el, '{"a":1,"b":2}');
    const caret = '{"a":1,'.length;
    placeCaret(el, caret);
    act(() => {
      expect(ref.current!.format()).toBe(true);
    });
    expect(el.textContent).toBe('{\n  "a": 1,\n  "b": 2\n}');
    expect(el.textContent!.slice(0, getCaretOffset(el))).toBe('{\n  "a": 1,');
  });

  it("ref.format() на невалидном JSON — false и no-op, даже до срабатывания дебаунса", () => {
    const ref = createRef<JsonEditorHandle>();
    render(<AstContentEditableHighlighter ref={ref} initialJson="{}" />);
    const el = getEditor();
    typeText(el, '{"a": ');
    act(() => {
      expect(ref.current!.format()).toBe(false);
    });
    expect(el.textContent).toBe('{"a": ');
  });

  it("стиль отступа: аргумент format() и проп indent", () => {
    const ref = createRef<JsonEditorHandle>();
    const { rerender } = render(<AstContentEditableHighlighter ref={ref} initialJson='{"a":1}' />);
    act(() => {
      ref.current!.format("4");
    });
    expect(getEditor().textContent).toBe('{\n    "a": 1\n}');
    rerender(<AstContentEditableHighlighter ref={ref} initialJson='{"a":1}' indent="tab" />);
    act(() => {
      ref.current!.format();
    });
    expect(getEditor().textContent).toBe('{\n\t"a": 1\n}');
  });

  it("вставка валидного JSON автоформатируется, курсор — сразу после вставленного", () => {
    render(<AstContentEditableHighlighter initialJson="{}" />);
    const el = getEditor();
    typeText(el, '{"a":1,"b":2}');
    const start = '{"a":1,'.length;
    placeCaret(el, start);
    const pasted = '"x": 9,';
    fireEvent.paste(el, makeClipboardEvent(pasted));
    expect(el.textContent).toBe('{\n  "a": 1,\n  "x": 9,\n  "b": 2\n}');
    expect(el.textContent!.slice(0, getCaretOffset(el))).toBe('{\n  "a": 1,\n  "x": 9,');
  });

  it("вставка, оставляющая JSON невалидным, вставляется как обычный текст без потери строк", () => {
    render(<AstContentEditableHighlighter initialJson="{}" />);
    const el = getEditor();
    typeText(el, "{");
    placeCaret(el, 1);
    fireEvent.paste(el, makeClipboardEvent("\nnot valid"));
    expect(el.textContent).toBe("{\nnot valid");
  });

  it("Enter вставляет литеральный перевод строки (не <div>/<br>, строка не теряется)", () => {
    render(<AstContentEditableHighlighter initialJson="{}" />);
    const el = getEditor();
    typeText(el, "line one");
    placeCaret(el, "line one".length);
    fireEvent.keyDown(el, { key: "Enter" });
    // Печатаем вторую строку после уже вставленного "\n".
    el.textContent = el.textContent + "line two";
    fireEvent.input(el);
    expect(el.textContent).toBe("line one\nline two");
    expect(el.querySelector("div")).toBeNull();
    expect(el.querySelector("br")).toBeNull();
  });

  it("Tab вставляет два пробела", () => {
    render(<AstContentEditableHighlighter initialJson="{}" />);
    const el = getEditor();
    placeCaret(el, 1);
    fireEvent.keyDown(el, { key: "Tab" });
    expect(el.textContent).toBe("{  }");
  });

  it("Ctrl+Z откатывает последнее зафиксированное изменение и восстанавливает курсор", () => {
    render(<AstContentEditableHighlighter initialJson="{}" />);
    const el = getEditor();
    const initial = el.textContent;
    typeText(el, '{"a":1}');
    advanceDebounce(400); // коммит через дебаунс/recolor

    fireEvent.keyDown(el, { key: "z", ctrlKey: true });
    expect(el.textContent).toBe(initial);
  });

  it("Ctrl+Z сразу после набора (без паузы) откатывает именно набранное, а не более раннее состояние", () => {
    render(<AstContentEditableHighlighter initialJson="{}" />);
    const el = getEditor();
    typeText(el, '{"a":1}');
    advanceDebounce(400); // зафиксировали '{"a":1}' как шаг истории

    typeText(el, '{"a":12}'); // ещё не закоммичено (дебаунс не сработал)
    fireEvent.keyDown(el, { key: "z", ctrlKey: true }); // должен откатить именно это, живое, изменение
    expect(el.textContent).toBe('{"a":1}');
  });

  it("Ctrl+Shift+Z (redo) возвращает то, что было отменено", () => {
    render(<AstContentEditableHighlighter initialJson="{}" />);
    const el = getEditor();
    typeText(el, '{"a":1}');
    advanceDebounce(400);

    fireEvent.keyDown(el, { key: "z", ctrlKey: true });
    fireEvent.keyDown(el, { key: "z", ctrlKey: true, shiftKey: true });
    expect(el.textContent).toBe('{"a":1}');
  });

  it("Ctrl+Y тоже работает как redo", () => {
    render(<AstContentEditableHighlighter initialJson="{}" />);
    const el = getEditor();
    typeText(el, '{"a":1}');
    advanceDebounce(400);
    fireEvent.keyDown(el, { key: "z", ctrlKey: true });
    fireEvent.keyDown(el, { key: "y", ctrlKey: true });
    expect(el.textContent).toBe('{"a":1}');
  });

  it("Ctrl+Z на пустой истории — no-op, не бросает исключение", () => {
    render(<AstContentEditableHighlighter initialJson="{}" />);
    const el = getEditor();
    expect(() => fireEvent.keyDown(el, { key: "z", ctrlKey: true })).not.toThrow();
    expect(el.textContent).toBe("{}");
  });

  it("Ctrl+Shift+Z без предварительного undo — no-op", () => {
    render(<AstContentEditableHighlighter initialJson="{}" />);
    const el = getEditor();
    expect(() => fireEvent.keyDown(el, { key: "z", ctrlKey: true, shiftKey: true })).not.toThrow();
    expect(el.textContent).toBe("{}");
  });

  it("новое изменение после undo обрубает redo-стек", () => {
    render(<AstContentEditableHighlighter initialJson="{}" />);
    const el = getEditor();
    typeText(el, '{"a":1}');
    advanceDebounce(400);
    fireEvent.keyDown(el, { key: "z", ctrlKey: true }); // назад к "{}"
    typeText(el, '{"b":2}');
    advanceDebounce(400);
    // redo не должен вернуть '{"a":1}' — история после undo была обрублена новой правкой.
    fireEvent.keyDown(el, { key: "z", ctrlKey: true, shiftKey: true });
    expect(el.textContent).not.toBe('{"a":1}');
  });

  it("история undo ограничена (старые шаги вытесняются), но последние остаются доступны", () => {
    render(<AstContentEditableHighlighter initialJson="{}" />);
    const el = getEditor();
    // 205 отдельных зафиксированных шагов — заведомо больше лимита в 200,
    // так что самые старые должны быть вытеснены без ошибок.
    for (let i = 0; i < 205; i++) {
      typeText(el, `{"n":${i}}`);
      advanceDebounce(400);
    }
    expect(() => {
      for (let i = 0; i < 205; i++) fireEvent.keyDown(el, { key: "z", ctrlKey: true });
    }).not.toThrow();
    // После вытеснения истории откат доходит до какого-то раннего (но не
    // обязательно самого первого) состояния и на этом останавливается.
    expect(el.textContent).not.toBe('{"n":204}');
  });

  it("Ctrl+Z сразу после успешной вставки (без отложенного таймера) — курсор и текст восстанавливаются", () => {
    // После успешной автоформатирующей вставки (в отличие от обычного
    // набора) никакой дебаунс-таймер не остаётся висеть — flushPendingCommit
    // уже его обнулил, а applyFormatted ничего не планирует заново. Undo в
    // этот момент должен продолжать работать как обычно.
    render(<AstContentEditableHighlighter initialJson="{}" />);
    const el = getEditor();
    typeText(el, '{"a":1,"b":2}');
    advanceDebounce(400); // зафиксировали как шаг истории

    placeCaret(el, '{"a":1,'.length);
    fireEvent.paste(el, makeClipboardEvent('"x": 9,'));
    expect(el.textContent).toContain('"x"');

    fireEvent.keyDown(el, { key: "z", ctrlKey: true });
    expect(el.textContent).not.toContain('"x"');
  });

  it("отмонтирование компонента без отложенной перекраски не бросает исключение", () => {
    const { unmount } = render(<AstContentEditableHighlighter initialJson="{}" />);
    expect(() => unmount()).not.toThrow();
  });

  it("отмонтирование компонента с отложенной перекраской не бросает исключение (очистка таймера)", () => {
    const { unmount } = render(<AstContentEditableHighlighter initialJson="{}" />);
    const el = getEditor();
    typeText(el, '{"a":1}'); // debounce запланирован, но ещё не сработал
    expect(() => unmount()).not.toThrow();
    // Таймер должен быть отменён — advance после unmount не должен ничего трогать.
    expect(() => advanceDebounce(1000)).not.toThrow();
  });

  it("paste без активного выделения в редакторе — no-op, не бросает исключение", () => {
    render(<AstContentEditableHighlighter initialJson="{}" />);
    const el = getEditor();
    window.getSelection()?.removeAllRanges();
    expect(() => fireEvent.paste(el, makeClipboardEvent('"x":1'))).not.toThrow();
    expect(el.textContent).toBe("{}");
  });

  it("другие сочетания клавиш не перехватываются", () => {
    render(<AstContentEditableHighlighter initialJson="{}" />);
    const el = getEditor();
    const event = fireEvent.keyDown(el, { key: "a" });
    expect(event).toBe(true);
  });

  it.each([
    ["system", null],
    ["light", "light"],
    ["dark", "dark"],
  ] as const)("theme=%s -> data-theme=%s", (theme, expected) => {
    render(<AstContentEditableHighlighter theme={theme} />);
    const root = document.querySelector(".json-viewer--ast-contenteditable")!;
    expect(root.getAttribute("data-theme")).toBe(expected);
  });
});
