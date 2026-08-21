/**
 * Самописный токенизатор JSON, который сохраняет ИСХОДНЫЕ ПОЗИЦИИ для
 * каждого токена, вместо того чтобы строить дерево JS-значений (как это
 * делал бы обычный парсер).
 *
 * Именно это делает возможной «живую, цветную, редактируемую» подсветку
 * для AST-подхода: рендерер, который переформатирует разобранное значение
 * (со своими отступами, своими пробелами), не может оставаться посимвольно
 * выровненным с тем, что реально печатает пользователь. А рендерер, который
 * вместо этого оборачивает ОРИГИНАЛЬНЫЕ подстроки — используя реальные
 * смещения start/end каждого токена в исходном тексте — выдаёт результат,
 * чья длина и позиции символов точно совпадают со входом. Это именно то,
 * что нужно живому наложению слоёв (или редактированию «на месте» с цветом).
 *
 * Ключи объектов всё ещё отличаются от строк-значений структурно (по
 * отслеживанию контекста объект/массив во время сканирования), а не по
 * regex-эвристике — поэтому сохраняется гарантия «настоящего парсера» из
 * AST-подхода, просто без потери позиционной информации по пути.
 */

export type TokenType =
  | "key" // ключ объекта
  | "string" // строка-значение
  | "number"
  | "boolean"
  | "null"
  | "punctuation" // { } [ ] : ,
  | "whitespace";

export interface Token {
  type: TokenType;
  start: number; // индекс первого символа токена в исходной строке
  end: number; // индекс сразу за последним символом токена (полуоткрытый интервал)
}

export interface TokenizeResult {
  tokens: Token[];
  valid: boolean;
  /** Сообщение об ошибке разбора, если valid === false. */
  error?: string;
}

/**
 * Разбирает `input` как JSON и возвращает плоский список токенов с их
 * позициями. Если разбор ломается на середине (невалидный JSON, часто —
 * из-за того, что пользователь ещё печатает), функция не выбрасывает
 * исключение наружу: она возвращает токены, накопленные до места ошибки,
 * плюс `valid: false` и текст ошибки. Вызывающий код сам решает, что делать
 * с неразобранным хвостом текста (обычно — просто не подсвечивать его).
 */
export function tokenizeWithPositions(input: string): TokenizeResult {
  let i = 0; // текущая позиция сканирования (индекс символа в input)
  const tokens: Token[] = [];

  function isWhitespace(ch: string): boolean {
    return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
  }

  function consumeWhitespace(): void {
    const start = i;
    while (i < input.length && isWhitespace(input[i])) i++;
    if (i > start) tokens.push({ type: "whitespace", start, end: i });
  }

  function expect(ch: string): void {
    if (input[i] !== ch) {
      throw new Error(`Ожидался символ '${ch}' на позиции ${i}, получено '${input[i] ?? "конец строки"}'`);
    }
  }

  function consumePunctuation(): void {
    tokens.push({ type: "punctuation", start: i, end: i + 1 });
    i++;
  }

  function consumeStringToken(type: "key" | "string"): void {
    const start = i;
    expect('"');
    i++;
    while (i < input.length && input[i] !== '"') {
      if (input[i] === "\\") i++; // пропускаем и экранированный символ тоже
      i++;
    }
    if (i >= input.length) throw new Error(`Незакрытая строка, начинается с позиции ${start}`);
    i++; // закрывающая кавычка
    tokens.push({ type, start, end: i });
  }

  function consumeNumberToken(): void {
    const start = i;
    if (input[i] === "-") i++;
    if (!(input[i] >= "0" && input[i] <= "9")) {
      throw new Error(`Некорректное число на позиции ${start}`);
    }
    while (input[i] >= "0" && input[i] <= "9") i++;
    if (input[i] === ".") {
      i++;
      while (input[i] >= "0" && input[i] <= "9") i++;
    }
    if (input[i] === "e" || input[i] === "E") {
      i++;
      if (input[i] === "+" || input[i] === "-") i++;
      while (input[i] >= "0" && input[i] <= "9") i++;
    }
    tokens.push({ type: "number", start, end: i });
  }

  function parseValue(): void {
    consumeWhitespace();
    const ch = input[i];
    if (ch === undefined) throw new Error(`Неожиданный конец ввода на позиции ${i}`);
    if (ch === "{") return parseObject();
    if (ch === "[") return parseArray();
    if (ch === '"') return consumeStringToken("string");
    if (input.startsWith("true", i)) {
      tokens.push({ type: "boolean", start: i, end: i + 4 });
      i += 4;
      return;
    }
    if (input.startsWith("false", i)) {
      tokens.push({ type: "boolean", start: i, end: i + 5 });
      i += 5;
      return;
    }
    if (input.startsWith("null", i)) {
      tokens.push({ type: "null", start: i, end: i + 4 });
      i += 4;
      return;
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) return consumeNumberToken();
    throw new Error(`Неожиданный символ '${ch}' на позиции ${i}`);
  }

  function parseObject(): void {
    consumePunctuation(); // '{'
    consumeWhitespace();
    if (input[i] === "}") {
      consumePunctuation();
      return;
    }
    for (;;) {
      consumeWhitespace();
      // Ключ определяется здесь структурно — не по regex, — потому что мы
      // точно знаем, в каком месте грамматики находимся (сразу после '{' или ',').
      consumeStringToken("key");
      consumeWhitespace();
      expect(":");
      consumePunctuation();
      parseValue();
      consumeWhitespace();
      if (input[i] === ",") {
        consumePunctuation();
        continue;
      }
      if (input[i] === "}") {
        consumePunctuation();
        return;
      }
      throw new Error(`Ожидалась ',' или '}' на позиции ${i}`);
    }
  }

  function parseArray(): void {
    consumePunctuation(); // '['
    consumeWhitespace();
    if (input[i] === "]") {
      consumePunctuation();
      return;
    }
    for (;;) {
      parseValue();
      consumeWhitespace();
      if (input[i] === ",") {
        consumePunctuation();
        continue;
      }
      if (input[i] === "]") {
        consumePunctuation();
        return;
      }
      throw new Error(`Ожидалась ',' или ']' на позиции ${i}`);
    }
  }

  try {
    parseValue();
    consumeWhitespace();
    if (i < input.length) {
      throw new Error(`Лишние данные после значения, позиция ${i}`);
    }
    return { tokens, valid: true };
  } catch (err) {
    // Разбор не удался — возвращаем то, что успели насканировать, плюс
    // причину ошибки. Токены до точки поломки всё равно валидны и годятся
    // для подсветки; вызывающий код сам решает, как показать неразобранный хвост.
    return {
      tokens,
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
