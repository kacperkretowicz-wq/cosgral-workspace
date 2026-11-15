import { describe, expect, it } from "vitest";
import { cssDeclarationValues } from "./ui-foundation-css";

describe("UI CSS declaration scan", () => {
  it("ignores color names in selectors and explanatory comments", () => {
    const values = cssDeclarationValues(
      '/* red outline, white text */ [data-tone="blue"] { color: var(--openbot-file-blue); }',
    );
    expect(values).toBe("var(--openbot-file-blue)");
  });
  it("keeps literal colors in ordinary, custom and nested declarations", () => {
    const values = cssDeclarationValues(
      "@media (width > 1px) { .a { color: red; --shade: #fff; box-shadow: 0 0 1px rgba(0,0,0,.5); } }",
    );
    expect(values).toContain("red");
    expect(values).toContain("#fff");
    expect(values).toContain("rgba(0,0,0,.5)");
  });
});
