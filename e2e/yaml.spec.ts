import { test, expect } from "@playwright/test";
import { pasteInto, textareaValue, textareaCaret } from "./helpers";

test.describe("YamlHighlighter (regex-подсветка YAML)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  function editor(page: import("@playwright/test").Page) {
    return page.locator(".json-viewer--yaml-regex textarea.json-viewer__textarea");
  }

  test("вставка идёт обычным путём (нет автоформата) — значение сразу видно, курсор — после вставленного", async ({
    page,
  }) => {
    const ta = editor(page);
    await ta.fill("a: 1\nb: 2\n");
    await ta.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(5, 5)); // после "a: 1\n"
    await pasteInto(page, ta, "x: 9\n");
    const value = await textareaValue(ta);
    expect(value).toBe("a: 1\nx: 9\nb: 2\n");
    expect(await textareaCaret(ta)).toBe(10);
  });

  test("вырезание (cut) части значения — подсветка обновляется, слой не 'застывает'", async ({ page }) => {
    const ta = editor(page);
    await ta.fill("name: very long value here\n");
    const text = await textareaValue(ta);
    const cutStart = text.indexOf("very long ");
    const cutEnd = cutStart + "very long ".length;
    await ta.evaluate(
      (el: HTMLTextAreaElement, [s, e]) => el.setSelectionRange(s, e),
      [cutStart, cutEnd] as const
    );
    await page.keyboard.press("Control+x");
    await expect(ta).toHaveValue("name: value here\n");

    // Слой подсветки — отдельный <pre>, должен отражать РЕЗУЛЬТАТ вырезания,
    // а не застрявший старый текст (баг из отчёта: "остаётся как будто 1
    // слой, который собой всё заслоняет").
    const highlightText = await page
      .locator(".json-viewer--yaml-regex pre.json-viewer__highlight")
      .evaluate((el) => el.textContent);
    expect(highlightText).toBe("name: value here\n");
  });

  test("Ctrl+Z после cut восстанавливает вырезанный текст", async ({ page }) => {
    const ta = editor(page);
    await ta.fill("name: very long value here\n");
    const before = await textareaValue(ta);
    await ta.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(6, 16));
    await page.keyboard.press("Control+x");
    expect(await textareaValue(ta)).not.toBe(before);
    await page.keyboard.press("Control+z");
    await expect(ta).toHaveValue(before);
  });

  test("Tab вставляет два пробела (не таб-символ) с сохранением позиции курсора", async ({ page }) => {
    const ta = editor(page);
    await ta.fill("list:\n- one\n");
    const pos = "list:\n".length;
    await ta.evaluate((el: HTMLTextAreaElement, p) => el.setSelectionRange(p, p), pos);
    await page.keyboard.press("Tab");
    await expect(ta).toHaveValue("list:\n  - one\n");
    expect(await textareaCaret(ta)).toBe(pos + 2);
  });

  test("временно невалидный/неполный YAML не ломает подсветку", async ({ page }) => {
    const ta = editor(page);
    await ta.fill("key: value\nnested:\n  sub");
    await expect(ta).toHaveValue("key: value\nnested:\n  sub");
    // Никакой JS-ошибки/краша страницы — активная вкладка остаётся живой.
    await expect(ta).toBeEditable();
  });
});
