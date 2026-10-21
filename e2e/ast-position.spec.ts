import { test, expect } from "@playwright/test";
import { pasteInto, textareaValue, textareaCaret } from "./helpers";

test.describe("AstPositionHighlighter (AST-токенизатор с позициями)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  function editor(page: import("@playwright/test").Page) {
    return page.locator(".json-viewer--ast-position textarea.json-viewer__textarea");
  }

  test("вставка валидного JSON автоформатируется, курсор остаётся сразу после вставленного", async ({ page }) => {
    const ta = editor(page);
    await ta.fill('{"a":1,"b":2}');
    const start = '{"a":1,'.length;
    await ta.evaluate((el: HTMLTextAreaElement, s) => el.setSelectionRange(s, s), start);

    await pasteInto(page, ta, '"x": 9,');

    const value = await textareaValue(ta);
    expect(value).toBe('{\n  "a": 1,\n  "x": 9,\n  "b": 2\n}');
    const caret = await textareaCaret(ta);
    expect(value.slice(0, caret)).toBe('{\n  "a": 1,\n  "x": 9,');
  });

  test("Ctrl+Z после автоформатирующей вставки реально откатывает текст", async ({ page }) => {
    const ta = editor(page);
    await ta.fill('{"a":1,"b":2}');
    const before = await textareaValue(ta);
    await ta.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(1, 1));

    await pasteInto(page, ta, '"x": 9,');
    expect(await textareaValue(ta)).not.toBe(before);

    await page.keyboard.press("Control+z");
    await expect(ta).toHaveValue(before);
  });

  test("Backspace на выделенном фрагменте удаляет именно выделение", async ({ page }) => {
    const ta = editor(page);
    await ta.fill('{"key": "very long value"}');
    const text = await textareaValue(ta);
    const selStart = text.indexOf("long");
    const selEnd = selStart + "long ".length;
    await ta.evaluate(
      (el: HTMLTextAreaElement, [s, e]) => el.setSelectionRange(s, e),
      [selStart, selEnd] as const
    );
    await page.keyboard.press("Backspace");
    expect(await textareaValue(ta)).toBe(text.slice(0, selStart) + text.slice(selEnd));
  });

  test("невалидный JSON показывает статус ошибки и дизейблит «Форматировать», не ломая редактор", async ({
    page,
  }) => {
    const ta = editor(page);
    await ta.fill('{\n  "name": "John",\n  "age":\n}');
    await expect(ta).toHaveValue('{\n  "name": "John",\n  "age":\n}');
    await expect(page.locator("[data-panel='ast-position'] .panel-status--error")).toBeVisible();
    await expect(page.locator("[data-panel='ast-position'] button", { hasText: "Форматировать" })).toBeDisabled();
  });

  test("глубоко вложенный JSON форматируется и остаётся валидным", async ({ page }) => {
    const nested = JSON.stringify({
      course: { tests: [{ questions: [{ options: [{ value: "x" }] }] }] },
    });
    const ta = editor(page);
    await ta.fill(nested);
    await page.locator("[data-panel='ast-position'] button", { hasText: "Форматировать" }).click();
    const value = await textareaValue(ta);
    expect(JSON.parse(value)).toEqual(JSON.parse(nested));
  });
});
