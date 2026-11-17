import { describe, expect, it } from "vitest";
import {
  diffStyles,
  diffTexts,
  diffTokenValues,
  pairKey,
  pairScreens,
  parseColor,
  parsePx,
  sameColor,
  sameLength,
  screenReport,
} from "./compare.ts";
import type { StyleGroup } from "./policy.ts";

const group = (count: number, look: Record<string, string>): StyleGroup => ({ kind: "x", count, look, examples: [] });

describe("UI comparison (BE-A)", () => {
  it("reads colours and lengths, and compares within the tolerance", () => {
    expect(parseColor("rgb(26, 26, 26)")).toEqual([26, 26, 26, 1]);
    expect(parseColor("#1a1a1a")).toEqual([26, 26, 26, 1]);
    expect(parseColor("rgba(255, 255, 255, 0.5)")).toEqual([255, 255, 255, 0.5]);
    expect(parseColor("red")).toBeNull();
    expect(sameColor("rgb(26, 26, 26)", "#1b1b1d")).toBe(true);
    expect(sameColor("rgb(26, 26, 26)", "#2a2a2a")).toBe(false);
    expect(sameColor("rgba(255, 255, 255, 0.5)", "rgba(255, 255, 255, 0.9)")).toBe(false);
    expect(parsePx("14px")).toBe(14);
    expect(parsePx("0px 0px 13px")).toBeNull();
    expect(sameLength("14px", "15px")).toBe(true);
    expect(sameLength("14px", "18px")).toBe(false);
  });

  it("lists the looks one side uses and the other does not", () => {
    const reference = [group(90, { fontSize: "14px", color: "rgb(151, 151, 151)" }), group(10, { fontSize: "24px" })];
    const ours = [group(80, { fontSize: "15px", color: "rgb(150, 152, 151)" }), group(20, { fontSize: "19px" })];
    const diff = diffStyles(reference, ours);
    expect(diff.missingInOurs).toEqual([{ property: "fontSize", value: "24px", count: 10 }]);
    expect(diff.extraInOurs).toEqual([{ property: "fontSize", value: "19px", count: 20 }]);
  });

  it("skips values that few elements use", () => {
    const reference = [group(999, { fontSize: "14px" }), group(1, { fontSize: "99px" })];
    expect(diffStyles(reference, [group(5, { fontSize: "14px" })]).missingInOurs).toEqual([]);
  });

  it("compares texts ignoring case and spacing", () => {
    expect(diffTexts(["New agent", "Search  here", "Only theirs"], ["new agent", "search here", "Only ours"])).toEqual({
      onlyInReference: ["Only theirs"],
      onlyInOurs: ["Only ours"],
    });
  });

  it("finds token values (colours and lengths) the other side lacks", () => {
    expect(
      diffTokenValues(
        { "--a": "#1a1a1a", "--b": "8px", "--c": "250ms", "--d": "#007cf7" },
        { "--x": "rgb(26, 26, 26)", "--y": "9px" },
      ),
    ).toEqual({ valuesMissingInOurs: ["#007cf7"] });
  });

  it("pairs screens by name, with a map for another language", () => {
    expect(pairKey("12-new-agent-rutyny")).toBe("new-agent-rutyny");
    const reference = new Map([
      ["ustawienia", 1],
      ["zadania", 2],
      ["tylko-ich", 3],
    ]);
    const ours = new Map([
      ["settings", 10],
      ["zadania", 20],
      ["tylko-nasz", 30],
    ]);
    const pairing = pairScreens(reference, ours, { ustawienia: "settings" });
    expect(pairing.pairs.map((p) => [p.key, p.reference, p.ours])).toEqual([
      ["ustawienia", 1, 10],
      ["zadania", 2, 20],
    ]);
    expect(pairing.onlyReference).toEqual(["tylko-ich"]);
    expect(pairing.onlyOurs).toEqual(["tylko-nasz"]);
  });

  it("writes a short report", () => {
    const report = screenReport(
      "settings",
      { onlyInReference: ["A"], onlyInOurs: [] },
      { missingInOurs: [{ property: "fontSize", value: "24px", count: 3 }], extraInOurs: [] },
    );
    expect(report).toContain("# settings");
    expect(report).toContain("Texts only in the reference (1)");
    expect(report).toContain("fontSize: `24px` (3 elements)");
    expect(report).toContain("- none");
  });
});
