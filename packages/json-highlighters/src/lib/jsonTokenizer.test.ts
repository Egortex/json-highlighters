import { describe, expect, it } from "vitest";
import { tokenizeWithPositions } from "./jsonTokenizer";

describe("tokenizeWithPositions — невалидный JSON (пункт 4)", () => {
  it("не бросает исключение на промежуточно неполном JSON", () => {
    const input = '{\n  "name": "John",\n  "age":\n}';
    expect(() => tokenizeWithPositions(input)).not.toThrow();
  });

  it("возвращает valid:false с сообщением об ошибке для неполного значения", () => {
    const result = tokenizeWithPositions('{\n  "name": "John",\n  "age":\n}');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("сохраняет токены, накопленные до места поломки — для подсветки того, что уже написано", () => {
    const result = tokenizeWithPositions('{"name": "John", "age":');
    expect(result.valid).toBe(false);
    // "name" (ключ) и "John" (значение) должны быть уже токенизированы,
    // даже если весь документ в целом невалиден.
    const types = result.tokens.map((t) => t.type);
    expect(types).toContain("key");
    expect(types).toContain("string");
  });

  it("не роняет парсер на пустой строке / только пробелах", () => {
    expect(tokenizeWithPositions("").valid).toBe(false);
    expect(tokenizeWithPositions("   \n\t").valid).toBe(false);
  });

  it("не роняет парсер на оборванной строке в кавычках", () => {
    const result = tokenizeWithPositions('{"key": "unterminated');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/[Нн]езакрыт/);
  });

  it("пропускает экранированный символ внутри строки (не путает \\\" с закрывающей кавычкой)", () => {
    const result = tokenizeWithPositions('{"a": "esc\\"aped"}');
    expect(result.valid).toBe(true);
  });

  it("сообщение об ошибке про ожидаемый символ упоминает 'конец строки', а не undefined", () => {
    // Строка обрывается ровно там, где парсер ожидает ':' после ключа.
    const result = tokenizeWithPositions('{"a"');
    expect(result.valid).toBe(false);
    expect(result.error).toContain("конец строки");
  });

  it("отрицательное число без цифры после минуса — синтаксическая ошибка", () => {
    const result = tokenizeWithPositions('{"a": -}');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/[Нн]екорректное число/);
  });

  it("число с экспонентой (+ и -, а также без знака) токенизируется целиком", () => {
    const input = '{"a": 1.5e+10, "b": 2E-3, "c": 3e7}';
    const result = tokenizeWithPositions(input);
    expect(result.valid).toBe(true);
    const numbers = result.tokens.filter((t) => t.type === "number").map((t) => input.slice(t.start, t.end));
    expect(numbers).toEqual(["1.5e+10", "2E-3", "3e7"]);
  });

  it("объект без ',' или '}' после значения — конкретная ошибка, а не общая", () => {
    const result = tokenizeWithPositions('{"a": 1 "b": 2}');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/','|'}'/);
  });

  it("пустой массив токенизируется без ошибок", () => {
    expect(tokenizeWithPositions("[]").valid).toBe(true);
  });

  it("массив без ',' или ']' после значения — конкретная ошибка", () => {
    const result = tokenizeWithPositions("[1 2]");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/','|'\]'/);
  });

  it("каждый токен покрывает непустой диапазон и не выходит за пределы текста", () => {
    const input = '{\n  "a": 1,\n  "b": [true, false, null]\n}';
    const { tokens } = tokenizeWithPositions(input);
    for (const t of tokens) {
      expect(t.end).toBeGreaterThan(t.start);
      expect(t.end).toBeLessThanOrEqual(input.length);
    }
  });
});

describe("tokenizeWithPositions — вложенные объекты (пункт 6)", () => {
  it("корректно токенизирует глубоко вложенную структуру из ТЗ", () => {
    const input = JSON.stringify({
      course: { tests: [{ questions: [{ options: [{ value: "..." }] }] }] },
    });
    const result = tokenizeWithPositions(input);
    expect(result.valid).toBe(true);
    // Ключ самого глубокого уровня должен быть найден и иметь тип "key".
    const valueKeyIndex = input.indexOf('"value"');
    const token = result.tokens.find((t) => t.start === valueKeyIndex);
    expect(token?.type).toBe("key");
  });

  it("не переполняет стек на реалистичной глубине вложенности (~200 уровней)", () => {
    let input = "0";
    for (let i = 0; i < 200; i++) input = `[${input}]`;
    expect(() => tokenizeWithPositions(input)).not.toThrow();
    expect(tokenizeWithPositions(input).valid).toBe(true);
  });

  it("ДОКУМЕНТИРУЕТ реальный баг: глубоко вложенный, но ВАЛИДНЫЙ JSON помечается как невалидный", () => {
    // parseValue/parseObject/parseArray вызывают друг друга рекурсивно без
    // ограничения глубины. При депрессии стека браузер/Node бросает
    // RangeError("Maximum call stack size exceeded") — но он перехватывается
    // ТЕМ ЖЕ catch, что и обычные синтаксические ошибки (см. конец файла
    // jsonTokenizer.ts), поэтому наружу это не падает исключением, а тихо
    // превращается в valid:false с сообщением про стек вместо синтаксиса.
    // Пользователь увидит "⚠ Maximum call stack size exceeded" под абсолютно
    // корректным JSON и не сможет ни отформатировать, ни понять, в чём дело.
    // Порог — в районе 5000-10000 уровней вложенности (см. тест ниже),
    // так что для примера "course -> tests -> questions -> options" (6
    // уровней) из ТЗ это не проявится, но для глубоко рекурсивных данных
    // (деревья, вложенные комментарии и т.п.) — реальный риск.
    let deeplyNestedButValid = "0";
    for (let i = 0; i < 50_000; i++) deeplyNestedButValid = `[${deeplyNestedButValid}]`;

    const result = tokenizeWithPositions(deeplyNestedButValid);

    expect(result.valid).toBe(false); // ← должно быть true (это валидный JSON!)
    expect(result.error).toMatch(/call stack/i); // ← это не синтаксическая ошибка
  });
});

describe("tokenizeWithPositions — большие документы (пункт 5, перф)", () => {
  function buildArrayOfObjects(count: number): string {
    const items = Array.from({ length: count }, (_, i) => ({
      id: i,
      name: `item-${i}`,
      active: i % 2 === 0,
      tags: ["a", "b", "c"],
      meta: { score: i * 1.5, note: null },
    }));
    return JSON.stringify(items);
  }

  const sizes: [string, number][] = [
    ["~1KB", 5],
    ["~10KB", 50],
    ["~100KB", 500],
    ["~1MB", 5000],
  ];

  it.each(sizes)("токенизирует документ размером %s без ошибок и печатает время разбора", (label, count) => {
    const input = buildArrayOfObjects(count);
    const start = performance.now();
    const result = tokenizeWithPositions(input);
    const elapsed = performance.now() - start;
    expect(result.valid).toBe(true);
    // eslint-disable-next-line no-console
    console.log(`[perf] tokenizeWithPositions ${label} (${(input.length / 1024).toFixed(0)}KB): ${elapsed.toFixed(2)}ms, ${result.tokens.length} токенов`);
    // Мягкий бюджет — не строгий перф-тест (зависит от машины), а сигнал
    // регрессии на порядок величины (например, O(n^2) вместо O(n)).
    expect(elapsed).toBeLessThan(2000);
  });

  it("время разбора растёт примерно линейно с размером (не квадратично)", () => {
    const small = buildArrayOfObjects(500);
    const large = buildArrayOfObjects(5000); // в 10 раз больше объектов

    const t1 = performance.now();
    tokenizeWithPositions(small);
    const smallMs = performance.now() - t1;

    const t2 = performance.now();
    tokenizeWithPositions(large);
    const largeMs = performance.now() - t2;

    // При линейном разборе рост времени ~10x; допускаем большой запас на
    // шум малых измерений, но квадратичный рост (~100x) должен провалить тест.
    expect(largeMs).toBeLessThan(Math.max(smallMs * 40, 200));
  });
});
