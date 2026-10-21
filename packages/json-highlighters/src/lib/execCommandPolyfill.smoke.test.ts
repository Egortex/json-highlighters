import { describe, expect, it } from "vitest";

describe("execCommand polyfill (смоук, см. vitest.setup.ts)", () => {
  it("вставляет текст в textarea и генерирует input-событие", () => {
    const ta = document.createElement("textarea");
    ta.value = "hello world";
    document.body.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(5, 11); // выделяем " world"

    let inputFired = false;
    ta.addEventListener("input", () => (inputFired = true));

    document.execCommand("insertText", false, "!");

    expect(ta.value).toBe("hello!");
    expect(ta.selectionStart).toBe(6);
    expect(inputFired).toBe(true);
  });

  it("вставляет текст в позицию курсора внутри contentEditable через Selection/Range", () => {
    const el = document.createElement("pre");
    el.contentEditable = "true";
    el.textContent = "ab";
    document.body.appendChild(el);
    el.focus();

    const range = document.createRange();
    range.setStart(el.firstChild!, 1); // между "a" и "b"
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    document.execCommand("insertText", false, "X");

    expect(el.textContent).toBe("aXb");
  });
});
