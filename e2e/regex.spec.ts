import { test, expect } from "@playwright/test";
import { pasteInto, textareaValue, textareaCaret } from "./helpers";

test.describe("RegexHighlighter (regex-подсветка JSON)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  function editor(page: import("@playwright/test").Page) {
    return page.locator(".json-viewer--regex textarea.json-viewer__textarea");
  }

  test("вставка валидного JSON автоформатируется, курсор остаётся сразу после вставленного (не улетает в конец)", async ({
    page,
  }) => {
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

  test("Ctrl+Z после автоформатирующей вставки реально откатывает текст (не no-op)", async ({ page }) => {
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

  test("невалидный (промежуточный) JSON не ломает редактор и не роняет подсветку", async ({ page }) => {
    const ta = editor(page);
    await ta.fill('{\n  "name": "John",\n  "age":\n}');
    await expect(ta).toHaveValue('{\n  "name": "John",\n  "age":\n}');
    // Флаг валидности приходит из onValidityChange, хост показывает ошибку
    // и дизейблит «Форматировать».
    await expect(page.locator("[data-panel='regex'] .panel-status--error")).toBeVisible();
    await expect(page.locator("[data-panel='regex'] button", { hasText: "Форматировать" })).toBeDisabled();
  });

  test("Tab вставляет два пробела и сохраняет позицию курсора", async ({ page }) => {
    const ta = editor(page);
    await ta.fill("{}");
    await ta.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(1, 1));
    await page.keyboard.press("Tab");
    await expect(ta).toHaveValue("{  }");
    expect(await textareaCaret(ta)).toBe(3);
  });

  test("глубоко вложенный JSON форматируется и остаётся валидным", async ({ page }) => {
    const nested = JSON.stringify({
      course: { tests: [{ questions: [{ options: [{ value: "x" }] }] }] },
    });
    const ta = editor(page);
    await ta.fill(nested);
    await page.locator("[data-panel='regex'] button", { hasText: "Форматировать" }).click();
    const value = await textareaValue(ta);
    expect(JSON.parse(value)).toEqual(JSON.parse(nested));
  });

  test("большой JSON (~50KB) не виснет и остаётся редактируемым", async ({ page }) => {
    const big = JSON.stringify(
      Array.from({ length: 500 }, (_, i) => ({ id: i, name: `item-${i}`, tags: ["a", "b", "c"] }))
    );
    const ta = editor(page);
    await ta.fill(big);
    await ta.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
    await page.keyboard.type("X", { timeout: 5000 });
    await expect(ta).toHaveValue(/^X/);
  });
});
