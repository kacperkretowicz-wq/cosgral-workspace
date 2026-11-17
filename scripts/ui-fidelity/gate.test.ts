import { describe, expect, it } from "vitest";
import { COLOR_TOLERANCE, LENGTH_TOLERANCE } from "../openbot-probe/compare.ts";
import { gateScreen, gateSummary } from "./gate.ts";

describe("ui-fidelity gate (T-B)", () => {
  it("exposes the same tolerances as compare.ts / odbior-071", () => {
    expect(LENGTH_TOLERANCE).toBe(2);
    expect(COLOR_TOLERANCE).toBe(5);
  });

  it("PASS when styles and texts match", () => {
    const result = gateScreen({
      key: "new-agent",
      texts: { onlyInReference: [], onlyInOurs: [] },
      styles: { missingInOurs: [], extraInOurs: [] },
      tokens: { valuesMissingInOurs: [] },
    });
    expect(result.verdict).toBe("PASS");
    expect(result.fixOwner).toBe("—");
  });

  it("FAIL when a critical length/colour is missing in ours", () => {
    const result = gateScreen({
      key: "sidebar",
      texts: { onlyInReference: [], onlyInOurs: [] },
      styles: {
        missingInOurs: [{ property: "fontSize", value: "14px", count: 40 }],
        extraInOurs: [],
      },
    });
    expect(result.verdict).toBe("FAIL");
    expect(result.fixOwner).toBe("UI Designer");
  });

  it("niejasne for text-only deltas (sense not auto-judged)", () => {
    const result = gateScreen({
      key: "new-agent",
      texts: { onlyInReference: ["Create agent"], onlyInOurs: ["Create"] },
      styles: { missingInOurs: [], extraInOurs: [] },
    });
    expect(result.verdict).toBe("niejasne");
  });

  it("niejasne for unpaired reference screen", () => {
    const result = gateScreen({
      key: "marketplace",
      texts: { onlyInReference: [], onlyInOurs: [] },
      styles: { missingInOurs: [], extraInOurs: [] },
      unpaired: "reference",
    });
    expect(result.verdict).toBe("niejasne");
    expect(result.fixOwner).toBe("Tester");
  });

  it("builds a markdown summary table", () => {
    const md = gateSummary([
      gateScreen({
        key: "a",
        texts: { onlyInReference: [], onlyInOurs: [] },
        styles: { missingInOurs: [], extraInOurs: [] },
      }),
      gateScreen({
        key: "b",
        texts: { onlyInReference: [], onlyInOurs: [] },
        styles: { missingInOurs: [{ property: "gap", value: "8px", count: 3 }], extraInOurs: [] },
      }),
    ]);
    expect(md).toContain("| PASS | 1 |");
    expect(md).toContain("| FAIL | 1 |");
    expect(md).toContain("| a | PASS |");
  });
});
