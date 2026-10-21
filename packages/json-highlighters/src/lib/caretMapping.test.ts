import { describe, expect, it } from "vitest";
import { mapCaretAcrossFormat } from "./caretMapping";

describe("mapCaretAcrossFormat", () => {
  it("держит курсор сразу после вставленного фрагмента, а не в конце документа", () => {
    // Вставили '"x": 1,' сразу после '{' в сжатый JSON, потом всё
    // переформатировалось с отступами — курсор должен остаться после "1,".
    const original = '{"x": 1,"a":1,"b":2}';
    const formatted = '{\n  "x": 1,\n  "a": 1,\n  "b": 2\n}';
    const caretInOriginal = '{"x": 1,'.length;
    const mapped = mapCaretAcrossFormat(original, caretInOriginal, formatted);
    expect(formatted.slice(0, mapped)).toBe('{\n  "x": 1,');
  });

  it("курсор в самом начале документа остаётся в начале", () => {
    const original = '{"a":1}';
    const formatted = '{\n  "a": 1\n}';
    expect(mapCaretAcrossFormat(original, 0, formatted)).toBe(0);
  });

  it("курсор в конце документа остаётся в конце", () => {
    const original = '{"a":1}';
    const formatted = '{\n  "a": 1\n}';
    expect(mapCaretAcrossFormat(original, original.length, formatted)).toBe(formatted.length);
  });

  it("курсор посреди значения-строки попадает на ту же относительную позицию", () => {
    const original = '{"name":"hello"}';
    const formatted = '{\n  "name": "hello"\n}';
    const caretInsideHello = original.indexOf("hello") + 2; // между "he" и "llo"
    const mapped = mapCaretAcrossFormat(original, caretInsideHello, formatted);
    expect(formatted.slice(0, mapped)).toBe('{\n  "name": "he');
  });

  it("возвращает formatted.length, если структура токенов разошлась (защита от несовпадения)", () => {
    // Явно передаём formatted, который не соответствует original по числу
    // значимых токенов — mapCaretAcrossFormat не должен пытаться угадывать.
    const mapped = mapCaretAcrossFormat('{"a":1}', 3, '{"a":1,"b":2}');
    expect(mapped).toBe('{"a":1,"b":2}'.length);
  });

  it("курсор в хвостовом whitespace после последнего токена -> конец formatted", () => {
    // Отдельный случай от "курсор в конце документа" выше: тут курсор
    // строго ПОСЛЕ конца последнего токена (idx===-1 внутри функции), а не
    // ровно на его границе.
    const original = '{"a":1}   ';
    const formatted = '{\n  "a": 1\n}';
    expect(mapCaretAcrossFormat(original, original.length, formatted)).toBe(formatted.length);
  });

  it("курсор в ведущем whitespace ПЕРЕД первым токеном -> перед соответствующим токеном в formatted", () => {
    const original = '  {"a":1}';
    const formatted = '{\n  "a": 1\n}';
    // Курсор внутри ведущих пробелов, до токена '{' (который начинается с индекса 2).
    expect(mapCaretAcrossFormat(original, 1, formatted)).toBe(0);
  });

  it("возвращает formatted.length для пустого original (нет значимых токенов)", () => {
    expect(mapCaretAcrossFormat("   ", 1, '{\n  "a": 1\n}')).toBe('{\n  "a": 1\n}'.length);
  });

  it("работает на вложенной структуре из ТЗ", () => {
    const original = JSON.stringify({ course: { tests: [{ options: [{ value: "x" }] }] } });
    const formatted = JSON.stringify(JSON.parse(original), null, 2);
    // Курсор сразу после открывающей кавычки значения самого глубокого уровня.
    const caret = original.indexOf('"x"') + 1;
    const mapped = mapCaretAcrossFormat(original, caret, formatted);
    // В formatted та же открывающая кавычка сдвинута из-за отступов, но
    // символ ПЕРЕД курсором должен остаться той же кавычкой.
    expect(formatted[mapped - 1]).toBe('"');
    expect(formatted[mapped]).toBe("x");
  });
});
