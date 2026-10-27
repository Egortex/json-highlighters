import { describe, expect, it } from "vitest";
import { scrollCaretIntoView } from "./scrollCaret";

function textarea(lines: number, caretLine: number, scrollTop = 0): HTMLTextAreaElement {
  const el = document.createElement("textarea");
  el.style.lineHeight = "20px";
  el.style.paddingTop = "10px";
  Object.defineProperty(el, "clientHeight", { value: 200, configurable: true });
  document.body.appendChild(el);
  el.value = Array.from({ length: lines }, (_, i) => `line${i}`).join("\n");
  const caret = el.value.split("\n").slice(0, caretLine).join("\n").length + (caretLine > 0 ? 1 : 0);
  el.setSelectionRange(caret, caret);
  el.scrollTop = scrollTop;
  return el;
}

describe("scrollCaretIntoView", () => {
  it("курсор ниже видимой области — прокручивает, ставя его в середину окна", () => {
    const el = textarea(200, 100);
    scrollCaretIntoView(el);
    // 10 (padding) + 100*20 - 200/2
    expect(el.scrollTop).toBe(1910);
  });

  it("курсор уже виден — прокрутку не трогает", () => {
    const el = textarea(200, 3, 0);
    scrollCaretIntoView(el);
    expect(el.scrollTop).toBe(0);
  });

  it("курсор выше видимой области — прокручивает вверх, не уходя в минус", () => {
    const el = textarea(200, 1, 1500);
    scrollCaretIntoView(el);
    expect(el.scrollTop).toBe(0);
  });

  it("line-height не задан (стили не подключены) — ничего не делает", () => {
    const el = textarea(200, 100);
    el.style.lineHeight = "";
    scrollCaretIntoView(el);
    expect(el.scrollTop).toBe(0);
  });
});
