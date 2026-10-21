import { describe, expect, it } from "vitest";
import { formatJson, tryFormatJson } from "./formatJson";

describe("formatJson", () => {
  it("переформатирует сжатый JSON с 2-пробельным отступом", () => {
    expect(formatJson('{"a":1,"b":[1,2]}', "2")).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
  });

  it("поддерживает табуляцию как стиль отступа", () => {
    expect(formatJson('{"a":1}', "tab")).toBe('{\n\t"a": 1\n}');
  });

  it("бросает исключение на невалидном JSON — вызывающий код обязан его поймать", () => {
    expect(() => formatJson("{invalid", "2")).toThrow();
  });

  it("round-trip: formatJson(formatJson(x)) === formatJson(x) (идемпотентность)", () => {
    const once = formatJson('{"course":{"tests":[{"questions":[1,2,3]}]}}', "2");
    expect(formatJson(once, "2")).toBe(once);
  });
});

describe("tryFormatJson", () => {
  it("возвращает исходный текст без изменений, если JSON невалиден", () => {
    expect(tryFormatJson("not json at all", "2")).toBe("not json at all");
  });

  it("форматирует, если JSON валиден", () => {
    expect(tryFormatJson('{"a":1}', "2")).toBe('{\n  "a": 1\n}');
  });
});
