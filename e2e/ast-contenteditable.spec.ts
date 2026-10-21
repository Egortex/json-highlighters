import { test, expect } from "@playwright/test";
import { pasteInto, contentEditableText, contentEditableCaret, setContentEditableCaret } from "./helpers";

test.describe("AstContentEditableHighlighter (contentEditable AST-подсветка)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  function editor(page: import("@playwright/test").Page) {
    return page.locator(".json-viewer--ast-contenteditable pre.json-viewer__editable");
  }

  test("вставка не теряет строки: перевод строки остаётся текстовым \\n, а не <div>/<br>", async ({ page }) => {
    const el = editor(page);
    await el.click();
    await el.evaluate((node) => {
      node.textContent = "{";
    });
    await el.dispatchEvent("input");
    await setContentEditableCaret(page, el, 1);
    await pasteInto(page, el, "\nline two");
    expect(await contentEditableText(el)).toBe("{\nline two");
    expect(await el.evaluate((node) => node.querySelectorAll("div, br").length)).toBe(0);
  });

  test("вставка валидного JSON автоформатируется, курсор — сразу после вставленного (не в конце документа)", async ({
    page,
  }) => {
    const el = editor(page);
    await el.click();
    await el.evaluate((node) => {
      node.textContent = '{"a":1,"b":2}';
    });
    await el.dispatchEvent("input");
    const start = '{"a":1,'.length;
    await setContentEditableCaret(page, el, start);

    await pasteInto(page, el, '"x": 9,');

    const text = await contentEditableText(el);
    expect(text).toBe('{\n  "a": 1,\n  "x": 9,\n  "b": 2\n}');
    const caret = await contentEditableCaret(page, el);
    expect(text.slice(0, caret)).toBe('{\n  "a": 1,\n  "x": 9,');
  });

  test("Ctrl+Z после вставки восстанавливает и текст, и позицию курсора", async ({ page }) => {
    const el = editor(page);
    await el.click();
    await el.evaluate((node) => {
      node.textContent = "{}";
    });
    await el.dispatchEvent("input");
    await setContentEditableCaret(page, el, 1);
    const before = await contentEditableText(el);

    await pasteInto(page, el, '"a": 1');
    expect(await contentEditableText(el)).not.toBe(before);

    await page.keyboard.press("Control+z");
    expect(await contentEditableText(el)).toBe(before);
    expect(await contentEditableCaret(page, el)).toBe(1);
  });

  test("Ctrl+Shift+Z повторяет отменённое действие", async ({ page }) => {
    const el = editor(page);
    await el.click();
    await el.evaluate((node) => {
      node.textContent = "{}";
    });
    await el.dispatchEvent("input");
    await setContentEditableCaret(page, el, 1);
    await pasteInto(page, el, '"a": 1');
    const afterPaste = await contentEditableText(el);

    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+Shift+z");
    expect(await contentEditableText(el)).toBe(afterPaste);
  });

  test("невалидный (промежуточный) JSON не ломает редактор — статус ошибки, текст не пропадает", async ({
    page,
  }) => {
    const el = editor(page);
    await el.click();
    await el.evaluate((node) => {
      node.textContent = '{\n  "name": "John",\n  "age":\n}';
    });
    await el.dispatchEvent("input");
    await expect(page.locator("[data-panel='ast-contenteditable'] .panel-status--error")).toBeVisible({
      timeout: 2000,
    });
    expect(await contentEditableText(el)).toBe('{\n  "name": "John",\n  "age":\n}');
  });

  test("глубоко вложенный JSON форматируется и остаётся валидным", async ({ page }) => {
    const nested = JSON.stringify({
      course: { tests: [{ questions: [{ options: [{ value: "x" }] }] }] },
    });
    const el = editor(page);
    await el.click();
    await el.evaluate((node, text) => {
      node.textContent = text;
    }, nested);
    await el.dispatchEvent("input");
    await page.locator("[data-panel='ast-contenteditable'] button", { hasText: "Форматировать" }).click();
    const text = await contentEditableText(el);
    expect(JSON.parse(text)).toEqual(JSON.parse(nested));
  });
});
