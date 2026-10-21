import { describe, expect, it } from "vitest";
import { buildHighlightedHtml, getCaretOffset, setCaretOffset, normalizeLineBreaks } from "./AstContentEditableHighlighter";

/**
 * jsdom не реализует document.execCommand и настоящий undo-стек браузера,
 * поэтому здесь тестируется именно то, что реально можно проверить вне
 * живого браузера: чистую логику сохранения/восстановления курсора
 * (getCaretOffset/setCaretOffset), которую recolor() вызывает вокруг
 * каждой перекраски — см. пункты 1 и 2 из ТЗ (cursor preservation, selection).
 */

function makeEditable(html: string): HTMLPreElement {
  const el = document.createElement("pre");
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

describe("cursor preservation (пункт 1)", () => {
  it("после вставки символа в середину курсор восстанавливается на ту же символьную позицию", () => {
    const before = '{"foo": "bar"}';
    const el = makeEditable(buildHighlightedHtml(before));

    // Пользователь ставит курсор после `{"foo"` (позиция 6) — как будто
    // собирается вставить символ в середину документа.
    setCaretOffset(el, 6);
    expect(getCaretOffset(el)).toBe(6);

    // Симулируем вставку символа: текст меняется, recolor() перестраивает
    // innerHTML и должен поставить курсор туда же — сразу ПОСЛЕ вставленного
    // символа, т.е. на offset+1 от исходной позиции.
    const after = '{"fXoo": "bar"}';
    el.innerHTML = buildHighlightedHtml(after);
    setCaretOffset(el, 7);
    expect(getCaretOffset(el)).toBe(7);
  });

  it("восстанавливает курсор внутри подсвеченного <span>, а не только в «голом» тексте", () => {
    // buildHighlightedHtml оборачивает строки/числа/ключи в <span> — курсор
    // должен корректно попадать и туда, а не только между span'ами.
    const text = '{"name": "value"}';
    const el = makeEditable(buildHighlightedHtml(text));
    const insideStringOffset = text.indexOf("value") + 2; // где-то посреди "value"

    setCaretOffset(el, insideStringOffset);
    expect(getCaretOffset(el)).toBe(insideStringOffset);
  });

  it("курсор в конце документа не съезжает при повторной перекраске (round-trip идемпотентен)", () => {
    const text = '{\n  "a": 1,\n  "b": 2\n}';
    const el = makeEditable(buildHighlightedHtml(text));
    setCaretOffset(el, text.length);
    expect(getCaretOffset(el)).toBe(text.length);
  });

  it("если офсет выходит за пределы текста — курсор мягко ставится в конец, а не падает", () => {
    const text = '{"a": 1}';
    const el = makeEditable(buildHighlightedHtml(text));
    expect(() => setCaretOffset(el, 9999)).not.toThrow();
    expect(getCaretOffset(el)).toBe(text.length);
  });
});

describe("buildHighlightedHtml — граничные случаи", () => {
  it("для пустого текста возвращает пробел нулевой ширины, а не пустую строку", () => {
    // Полностью пустой contentEditable в некоторых браузерах теряет якорь
    // для курсора/фокуса — см. комментарий в самой функции.
    expect(buildHighlightedHtml("")).toBe("&#8203;");
  });
});

describe("selection (пункт 2)", () => {
  it("getCaretOffset корректно считает офсет для НЕсхлопнутого выделения (курсор внутри длинного значения)", () => {
    // '"very long value"' — пользователь выделил "long " (5 символов) и
    // нажал Backspace. Считаем офсеты начала/конца выделения так же, как
    // это делает handlePaste для start/end диапазона вставки.
    const text = '{"key": "very long value"}';
    const el = makeEditable(buildHighlightedHtml(text));

    const selStart = text.indexOf("long");
    const selEnd = selStart + "long ".length;

    const range = document.createRange();
    const walk = (node: Node, targetOffset: number): { node: Node; offset: number } | null => {
      if (node.nodeType === Node.TEXT_NODE) {
        const len = node.textContent?.length ?? 0;
        if (targetOffset <= len) return { node, offset: targetOffset };
        return null;
      }
      let remaining = targetOffset;
      for (const child of Array.from(node.childNodes)) {
        const len = child.textContent?.length ?? 0;
        const hit = walk(child, remaining);
        if (hit) return hit;
        remaining -= len;
      }
      return null;
    };

    const startHit = walk(el, selStart)!;
    const endHit = walk(el, selEnd)!;
    range.setStart(startHit.node, startHit.offset);
    range.setEnd(endHit.node, endHit.offset);

    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    // getCaretOffset читает selection.getRangeAt(0) и меряет от начала
    // range.endContainer/endOffset — т.е. должен вернуть конец выделения.
    expect(getCaretOffset(el)).toBe(selEnd);
  });
});

describe("регрессия: потеря строк в contentEditable (баг из отчёта — пункт «теряется строка»)", () => {
  it("buildHighlightedHtml никогда не создаёт блочные элементы (div/p) — только span и текстовые узлы", () => {
    // Ключевая гарантия фикса: если бы где-то в разметке появлялись <div>,
    // el.textContent склеивал бы соседние строки без "\n" (см. handlePaste/
    // handleKeyDown, которые теперь всегда используют execCommand insertText
    // вместо дефолтной вставки/Enter, чтобы такие div не появлялись вообще).
    const text = 'line one\nline two\n{"a": 1}';
    const html = buildHighlightedHtml(text);
    expect(html).not.toMatch(/<div|<p[ >]|<br/i);
  });

  it("документирует сам механизм бага: textContent теряет переносы строк на границах <div>", () => {
    // Это НЕ поведение компонента — это факт про DOM/браузер, который и
    // объясняет наблюдаемый баг: если бы браузер вставил перенос строки как
    // блочный элемент (дефолтное поведение contentEditable при Enter или при
    // обычной вставке), textContent слил бы строки без "\n" между ними.
    const el = document.createElement("div");
    el.innerHTML = "<div>line one</div><div>line two</div>";
    expect(el.textContent).toBe("line oneline two"); // строка визуально "пропадает"
  });

  it("текст с литеральными \\n (как строит buildHighlightedHtml) переносы не теряет", () => {
    const text = 'line one\nline two\n{"a": 1}';
    const el = makeEditable(buildHighlightedHtml(text));
    expect(el.textContent).toBe(text);
  });

  it("normalizeLineBreaks: заменяет <br>, оставшийся от execCommand в реальных браузерах, на текстовый \\n", () => {
    // В настоящем Chromium document.execCommand("insertText", ..., "\\n")
    // вставляет внутри contentEditable именно <br>, а не текстовый узел с
    // литеральным переводом строки (подтверждено live-тестом в e2e/) — без
    // normalizeLineBreaks() textContent после такой вставки теряет строку
    // ("line one<br>line two" -> "line oneline two").
    const el = document.createElement("pre");
    el.innerHTML = "line one<br>line two";
    expect(el.textContent).toBe("line oneline two"); // баг воспроизведён

    normalizeLineBreaks(el);
    expect(el.textContent).toBe("line one\nline two");
    expect(el.querySelector("br")).toBeNull();
  });

  it("normalizeLineBreaks: заменяет несколько <br> подряд", () => {
    const el = document.createElement("pre");
    el.innerHTML = "a<br>b<br>c";
    normalizeLineBreaks(el);
    expect(el.textContent).toBe("a\nb\nc");
  });

  it("normalizeLineBreaks: не трогает дерево без <br>", () => {
    const el = document.createElement("pre");
    el.innerHTML = buildHighlightedHtml('{"a": 1}');
    const before = el.innerHTML;
    normalizeLineBreaks(el);
    expect(el.innerHTML).toBe(before);
  });
});
