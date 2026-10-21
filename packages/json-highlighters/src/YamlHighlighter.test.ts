import { describe, expect, it } from "vitest";
import { highlightYaml } from "./YamlHighlighter";

/**
 * Из отчёта об ошибке: «в yml когда вырезаешь текст, не видно как он
 * меняется». highlightYaml() — чистая функция от текста (пересчитывается в
 * useMemo на каждое изменение rawText), поэтому если бы после "вырезания"
 * какой-то входной текст ломал регулярку (зависание из-за backtracking,
 * исключение, неверная позиция) — это объяснило бы "залипшую" подсветку.
 * Эти тесты проверяют именно регэксп-слой; сам эффект "один слой поверх
 * другого" уже упирается в реальный рендер двух DOM-слоёв в браузере и
 * требует живого репро (см. обсуждение в чате).
 */
describe("highlightYaml — устойчивость к резке/частичному тексту", () => {
  it("не бросает исключение и не виснет на пустой строке (текст вырезан целиком)", () => {
    const start = performance.now();
    expect(() => highlightYaml("")).not.toThrow();
    expect(performance.now() - start).toBeLessThan(50);
  });

  it("корректно подсвечивает после вырезания части значения из строки", () => {
    const before = "name: very long value here\n";
    const afterCut = "name:  here\n"; // вырезали "very long value"
    expect(() => highlightYaml(afterCut)).not.toThrow();
    expect(highlightYaml(afterCut)).toContain('<span class="yaml-key">name</span>');
    void before;
  });

  it("не виснет на строке из одних спецсимволов (частичное вырезание может оставить такой мусор)", () => {
    const pathological = ":".repeat(2000) + "\n".repeat(200) + "-".repeat(2000);
    const start = performance.now();
    highlightYaml(pathological);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it("не виснет на многих коротких строк с дефисами/двоеточиями (типичный YAML-список после правок)", () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `  - key${i}: value${i}`).join("\n");
    const start = performance.now();
    const html = highlightYaml(lines);
    const elapsed = performance.now() - start;
    // eslint-disable-next-line no-console
    console.log(`[perf] highlightYaml ~${(lines.length / 1024).toFixed(0)}KB: ${elapsed.toFixed(2)}ms`);
    expect(html).toBeTruthy();
    expect(elapsed).toBeLessThan(2000);
  });

  it("экранирует HTML до подсветки — вставленный/вырезанный текст с <> не ломает разметку", () => {
    const html = highlightYaml('desc: "<script>alert(1)</script>"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
