import type { IndentStyle } from "./formatJson";

/** Флаг валидности текущего текста — компонент сам его не рисует, а отдаёт
 * хосту через `onValidityChange`, чтобы галочку/ошибку можно было вывести
 * где угодно. */
export interface JsonValidity {
  valid: boolean;
  /** Текст ошибки разбора; только при `valid === false`. */
  error?: string;
}

/** Императивный API JSON-редакторов (через `ref`). */
export interface JsonEditorHandle {
  /** Переформатирует текст с указанным отступом (по умолчанию — проп
   * `indent` компонента), сохраняя позицию курсора. Возвращает `false` и
   * ничего не меняет, если текст — невалидный JSON. */
  format(indent?: IndentStyle): boolean;
}
