import { describe, expect, it } from "vitest";
import type { StyleGroup } from "./policy.ts";
import { firstFont, groupTokens, markdownTables, parseStyleGroups, parseTokens, tallyStyles } from "./summarize.ts";

const group = (count: number, look: Record<string, string>): StyleGroup => ({
  kind: "button",
  count,
  look,
  examples: [],
});

describe("summary of what screens use (B1)", () => {
  it("counts every element of a group, and leaves out values that say nothing", () => {
    const tallies = tallyStyles([
      group(3, { fontSize: "14px", borderRadius: "8px", backgroundColor: "rgba(0, 0, 0, 0)", boxShadow: "none" }),
      group(2, { fontSize: "14px", borderRadius: "0px" }),
      group(5, { fontSize: "16px", letterSpacing: "normal" }),
    ]);
    expect([...(tallies.get("fontSize") ?? [])]).toEqual([
      ["14px", 5],
      ["16px", 5],
    ]);
    expect([...(tallies.get("borderRadius") ?? [])]).toEqual([["8px", 3]]);
    expect(tallies.has("backgroundColor")).toBe(false);
    expect(tallies.has("boxShadow")).toBe(false);
    expect(tallies.has("letterSpacing")).toBe(false);
  });

  it("writes the most used values first, and only the top few", () => {
    const tallies = tallyStyles(
      Array.from({ length: 20 }, (_, index) => group(index + 1, { fontSize: `${index + 10}px` })),
    );
    const text = markdownTables(tallies, 3);
    expect(text).toContain("## Font sizes");
    expect(text.indexOf("`29px`")).toBeLessThan(text.indexOf("`28px`"));
    expect(text).not.toContain("`10px`");
  });

  it("names the first font of a list", () => {
    expect(firstFont('"Inter Variable", system-ui, sans-serif')).toBe("Inter Variable");
    expect(firstFont("ui-monospace, Menlo")).toBe("ui-monospace");
    expect(firstFont("")).toBe("");
  });

  it("groups tokens by their prefix", () => {
    const groups = groupTokens({
      "--openbot-bg-canvas": "#1a1a1a",
      "--openbot-bg-control": "#212121",
      "--openbot-accent": "#007cf7",
      "--accent": "#007cf7",
      "--font-sans": "Inter",
    });
    expect([...groups.keys()]).toEqual(["--accent", "--font", "--openbot-accent", "--openbot-bg"]);
    expect(groups.get("--openbot-bg")?.map(([name]) => name)).toEqual(["--openbot-bg-canvas", "--openbot-bg-control"]);
  });

  it("reads only well-formed results of the probe", () => {
    expect(parseStyleGroups("nope")).toEqual([]);
    expect(
      parseStyleGroups([
        { kind: "button", count: 2, look: { color: "red", width: 5 }, examples: ["a", 1] },
        { kind: "x", count: "many", look: {} },
        null,
      ]),
    ).toEqual([{ kind: "button", count: 2, look: { color: "red" }, examples: ["a"] }]);
    expect(parseTokens({ tokens: { "--a": "1", "--b": 2 } })).toEqual({ "--a": "1" });
    expect(parseTokens(null)).toEqual({});
  });
});
