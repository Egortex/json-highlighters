import { describe, expect, it } from "vitest";
import { themeAttr } from "./theme";

describe("themeAttr", () => {
  it('"system" не проставляет атрибут — следует prefers-color-scheme хоста', () => {
    expect(themeAttr("system")).toBeUndefined();
  });

  it('"light" и "dark" возвращаются как есть', () => {
    expect(themeAttr("light")).toBe("light");
    expect(themeAttr("dark")).toBe("dark");
  });
});
