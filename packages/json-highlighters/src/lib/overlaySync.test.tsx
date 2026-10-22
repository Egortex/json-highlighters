import { describe, expect, it } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { RegexHighlighter } from "../RegexHighlighter";
import { AstPositionHighlighter } from "../AstPositionHighlighter";
import { YamlHighlighter } from "../YamlHighlighter";

const tall = "{\n" + '  "k": 1,\n'.repeat(60) + '  "end": 1\n}';

describe.each([
  ["RegexHighlighter", () => <RegexHighlighter initialJson={tall} />],
  ["AstPositionHighlighter", () => <AstPositionHighlighter initialJson={tall} />],
  ["YamlHighlighter", () => <YamlHighlighter initialYaml={"k: 1\n".repeat(60)} />],
] as const)("%s: слой подсветки под textarea", (_, renderComponent) => {
  function layers(container: HTMLElement) {
    return {
      pre: container.querySelector("pre.json-viewer__highlight") as HTMLPreElement,
      ta: container.querySelector("textarea") as HTMLTextAreaElement,
    };
  }

  it("<pre> помечен inert — его текст не находит Ctrl+F и не выделяется", () => {
    const { container } = render(renderComponent());
    expect(layers(container).pre.hasAttribute("inert")).toBe(true);
  });

  it("посторонняя прокрутка <pre> (как при поиске по странице) откатывается к позиции textarea", () => {
    const { container } = render(renderComponent());
    const { pre, ta } = layers(container);
    ta.scrollTop = 40;
    ta.scrollLeft = 5;
    fireEvent.scroll(ta);

    pre.scrollTop = 300;
    pre.scrollLeft = 70;
    fireEvent.scroll(pre);
    expect(pre.scrollTop).toBe(40);
    expect(pre.scrollLeft).toBe(5);
  });

  it("прокрутка самой textarea по-прежнему переносится на <pre>", () => {
    const { container } = render(renderComponent());
    const { pre, ta } = layers(container);
    ta.scrollTop = 120;
    fireEvent.scroll(ta);
    fireEvent.scroll(pre); // эхо от программной прокрутки не должно ничего ломать
    expect(pre.scrollTop).toBe(120);
  });
});
