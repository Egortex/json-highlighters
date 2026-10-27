import { expect, test, type Locator } from "@playwright/test";
import { pasteInto } from "./helpers";

// Вставка заменяет текст целиком через execCommand, и браузер оставлял
// textarea прокрученной в начало: курсор стоял верно, но за пределами
// видимой области — выглядело как «курсор сбросился в начало».

const big = JSON.stringify(
  Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`k${i}`, { v: i, tags: ["a", "b"] }]))
);

function caretView(ta: Locator) {
  return ta.evaluate((el: HTMLTextAreaElement) => {
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    const caretTop = el.value.slice(0, el.selectionStart).split("\n").length * lh;
    const pre = el.parentElement!.querySelector("pre")!;
    return {
      visible: caretTop > el.scrollTop && caretTop <= el.scrollTop + el.clientHeight,
      layersInSync: Math.round(pre.scrollTop) === Math.round(el.scrollTop),
    };
  });
}

for (const panel of ["regex", "ast-position"]) {
  test.describe(`${panel}: прокрутка к курсору после вставки`, () => {
    test("Ctrl+A + вставка большого JSON — курсор в конце и виден", async ({ page }) => {
      await page.goto("/");
      const ta = page.locator(`[data-panel='${panel}'] textarea`);
      await ta.click();
      await page.keyboard.press("Control+A");
      await pasteInto(page, ta, big);
      await expect.poll(() => caretView(ta)).toEqual({ visible: true, layersInSync: true });
      expect(await ta.evaluate((el: HTMLTextAreaElement) => el.selectionStart === el.value.length)).toBe(true);
    });

    test("вставка в середину большого документа — курсор после фрагмента и виден", async ({ page }) => {
      await page.goto("/");
      const ta = page.locator(`[data-panel='${panel}'] textarea`);
      await ta.click();
      await page.keyboard.press("Control+A");
      await pasteInto(page, ta, big);
      const pos = await ta.evaluate((el: HTMLTextAreaElement) => el.value.indexOf('"k100"'));
      await ta.evaluate((el: HTMLTextAreaElement, p) => {
        el.setSelectionRange(p, p);
        el.scrollTop = 0;
      }, pos);
      await pasteInto(page, ta, '"x": 1,');
      await expect.poll(() => caretView(ta)).toEqual({ visible: true, layersInSync: true });
      expect(
        await ta.evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart - 7, el.selectionStart))
      ).toBe('"x": 1,');
    });
  });
}
