import type { Locator, Page } from "@playwright/test";

/** Записывает текст в системный буфер обмена и вставляет его в `locator`
 * через настоящий Ctrl+V — в отличие от юнит-тестов, здесь используется
 * реальный браузерный clipboard API и реальное событие paste. */
export async function pasteInto(page: Page, locator: Locator, text: string): Promise<void> {
  // Важно: НЕ фокусируем/не кликаем сюда — вызывающий код уже поставил
  // курсор в нужную позицию (через setSelectionRange/setContentEditableCaret),
  // а обычный .click() увёл бы фокус на позицию клика мышью и сбросил её.
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.keyboard.press("Control+V");
}

export async function textareaValue(locator: Locator): Promise<string> {
  return locator.inputValue();
}

export async function textareaCaret(locator: Locator): Promise<number> {
  return locator.evaluate((el: HTMLTextAreaElement) => el.selectionStart ?? -1);
}

export async function contentEditableText(locator: Locator): Promise<string> {
  return locator.evaluate((el) => el.textContent ?? "");
}

/** Символьный офсет курсора внутри "плоского" textContent contentEditable-элемента. */
export async function contentEditableCaret(_page: Page, locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return -1;
    const range = sel.getRangeAt(0);
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
  });
}

export async function setContentEditableCaret(_page: Page, locator: Locator, offset: number): Promise<void> {
  await locator.evaluate((target, off) => {
    const selection = window.getSelection()!;
    const range = document.createRange();
    let remaining = off;
    let placed = false;
    function walk(node: Node) {
      if (placed) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const length = node.textContent?.length ?? 0;
        if (remaining <= length) {
          range.setStart(node, remaining);
          range.collapse(true);
          placed = true;
          return;
        }
        remaining -= length;
        return;
      }
      for (const child of Array.from(node.childNodes)) {
        walk(child);
        if (placed) return;
      }
    }
    walk(target);
    if (!placed) {
      range.selectNodeContents(target);
      range.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(range);
  }, offset);
}
