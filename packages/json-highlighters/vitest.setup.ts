import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// Тесты в файле часто добавляют элементы прямо в document.body и фокусируют
// их напрямую (без @testing-library/react, у которого есть свой auto-cleanup).
// Без сброса document.activeElement/body между тестами полифилл execCommand
// ниже может подхватить элемент, оставшийся от ПРЕДЫДУЩЕГО теста.
afterEach(() => {
  (document.activeElement as HTMLElement | null)?.blur();
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
});

/**
 * jsdom не реализует document.execCommand вообще (даже как заглушку) —
 * вызов падает с TypeError. А все три компонента, которые редактируют текст
 * "на месте" (вставка/Tab/Enter/форматирование), намеренно используют
 * execCommand("insertText", ...) вместо прямого присваивания value/innerHTML
 * именно потому, что это единственный способ не сломать нативный undo-стек
 * браузера (см. комментарии в handlePaste/handleKeyDown этих компонентов).
 *
 * Чтобы юнит-тесты реально проверяли эту логику (а не просто ловили
 * TypeError), здесь — минимальный, но поведенчески верный полифилл:
 * вставляет текст в текущее выделение активного <textarea>/<input> или в
 * Selection/Range активного contentEditable, синхронно, как это делает
 * настоящий execCommand в браузере.
 */
function installExecCommandPolyfill() {
  if (typeof document.execCommand === "function") return;

  Object.defineProperty(document, "execCommand", {
    configurable: true,
    writable: true,
    value: (command: string, _showUI?: boolean, value?: string) => {
      if (command !== "insertText") return false;
      const text = value ?? "";
      const active = document.activeElement;

      if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
        const start = active.selectionStart ?? active.value.length;
        const end = active.selectionEnd ?? active.value.length;
        active.value = active.value.slice(0, start) + text + active.value.slice(end);
        const caret = start + text.length;
        active.setSelectionRange(caret, caret);
        // Настоящий execCommand синхронно генерирует "input" — контролируемый
        // React <textarea> обновляет состояние именно через это событие.
        active.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }

      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      }

      return false;
    },
  });
}

installExecCommandPolyfill();
