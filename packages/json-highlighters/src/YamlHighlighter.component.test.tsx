import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { YamlHighlighter } from "./YamlHighlighter";

function getTextarea(): HTMLTextAreaElement {
  return screen.getByLabelText("Редактируемый YAML-текст (regex-подсветка)") as HTMLTextAreaElement;
}

describe("<YamlHighlighter />", () => {
  it("рендерит переданный initialYaml как есть (нет автоформата)", () => {
    render(<YamlHighlighter initialYaml={"a: 1\nb: 2\n"} />);
    expect(getTextarea().value).toBe("a: 1\nb: 2\n");
  });

  it("заголовок: по умолчанию, кастомный, скрытый через title=null", () => {
    const { rerender } = render(<YamlHighlighter />);
    expect(screen.getByText("YAML — regex-подсветка")).toBeInTheDocument();
    rerender(<YamlHighlighter title="Кастом" />);
    expect(screen.getByText("Кастом")).toBeInTheDocument();
    rerender(<YamlHighlighter title={null} />);
    expect(screen.queryByText("Кастом")).not.toBeInTheDocument();
  });

  it("подсвечивает ключи/строки/числа/boolean/null/комментарии/дефисы своими классами", () => {
    render(
      <YamlHighlighter
        initialYaml={'key: "value"\nnum: 42\nflag: true\nempty: null\n# comment\nlist:\n  - one\n'}
      />
    );
    const pre = document.querySelector(".json-viewer__highlight")!;
    expect(pre.querySelector(".yaml-key")).not.toBeNull();
    expect(pre.querySelector(".yaml-string")).not.toBeNull();
    expect(pre.querySelector(".yaml-number")).not.toBeNull();
    expect(pre.querySelector(".yaml-boolean")).not.toBeNull();
    expect(pre.querySelector(".yaml-null")).not.toBeNull();
    expect(pre.querySelector(".yaml-comment")).not.toBeNull();
    expect(pre.querySelector(".yaml-dash")).not.toBeNull();
  });

  it("экранирует HTML в значениях", () => {
    render(<YamlHighlighter initialYaml={'desc: "<img onerror=1>"\n'} />);
    const pre = document.querySelector(".json-viewer__highlight")!;
    expect(pre.innerHTML).not.toContain("<img");
    expect(pre.innerHTML).toContain("&lt;img");
  });

  it("вызывает onChange при наборе текста", () => {
    const onChange = vi.fn();
    render(<YamlHighlighter initialYaml={"a: 1\n"} onChange={onChange} />);
    fireEvent.change(getTextarea(), { target: { value: "a: 1\nb: 2\n" } });
    expect(onChange).toHaveBeenCalledWith("a: 1\nb: 2\n");
  });

  it("Tab вставляет два пробела (YAML не терпит табов как отступ) и восстанавливает курсор", async () => {
    render(<YamlHighlighter initialYaml={"list:\n- one\n"} />);
    const ta = getTextarea();
    const pos = "list:\n".length;
    ta.setSelectionRange(pos, pos);
    const event = fireEvent.keyDown(ta, { key: "Tab" });
    expect(event).toBe(false);
    expect(ta.value).toBe("list:\n  - one\n");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(ta.selectionStart).toBe(pos + 2);
  });

  it("другие клавиши не перехватываются", () => {
    render(<YamlHighlighter initialYaml={"a: 1\n"} />);
    const event = fireEvent.keyDown(getTextarea(), { key: "a" });
    expect(event).toBe(true);
  });

  it("вставка идёт обычным путём — нет автоформата/preventDefault (в отличие от JSON-вариантов)", () => {
    render(<YamlHighlighter initialYaml={"a: 1\n"} />);
    const ta = getTextarea();
    const event = fireEvent.paste(ta, { clipboardData: { getData: () => "b: 2\n" } });
    // YamlHighlighter не подписан на onPaste вообще — событие идёт как обычно.
    expect(event).toBe(true);
  });

  it("скролл textarea синхронизируется со слоем подсветки", () => {
    render(<YamlHighlighter initialYaml={"a: 1\n".repeat(50)} />);
    const ta = getTextarea();
    const pre = document.querySelector(".json-viewer__highlight") as HTMLElement;
    Object.defineProperty(ta, "scrollTop", { value: 20, configurable: true });
    Object.defineProperty(ta, "scrollLeft", { value: 5, configurable: true });
    fireEvent.scroll(ta);
    expect(pre.scrollTop).toBe(20);
    expect(pre.scrollLeft).toBe(5);
  });

  it.each([
    ["system", null],
    ["light", "light"],
    ["dark", "dark"],
  ] as const)("theme=%s -> data-theme=%s", (theme, expected) => {
    render(<YamlHighlighter theme={theme} />);
    const root = document.querySelector(".json-viewer--yaml-regex")!;
    expect(root.getAttribute("data-theme")).toBe(expected);
  });
});
