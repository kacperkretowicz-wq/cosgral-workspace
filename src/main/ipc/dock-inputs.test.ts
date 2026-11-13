import { describe, expect, it } from "vitest";
import {
  parseDockAgent,
  parseOpenDockChat,
  parsePinDockAgent,
  parseReorderDock,
  parseSetDockPinHidden,
  parseSetDockSize,
  parseSetDockVisible,
  parseSetIslandEnabled,
  parseShowMainWindow,
} from "./dock-inputs";

describe("dock inputs", () => {
  it("accepts valid requests", () => {
    expect(parsePinDockAgent({ botId: "a" })).toEqual({ botId: "a" });
    expect(parsePinDockAgent({ botId: "a", index: 2 })).toEqual({ botId: "a", index: 2 });
    expect(parseDockAgent({ botId: "a" })).toEqual({ botId: "a" });
    expect(parseReorderDock({ botIds: ["a", "b"] })).toEqual({ botIds: ["a", "b"] });
    expect(parseSetDockPinHidden({ botId: "a", hidden: true })).toEqual({ botId: "a", hidden: true });
    expect(parseSetDockSize({ size: "large" })).toEqual({ size: "large" });
    expect(parseSetDockVisible({ visible: false })).toEqual({ visible: false });
    expect(parseOpenDockChat({ botId: null })).toEqual({ botId: null });
    expect(parseSetIslandEnabled({ enabled: true })).toEqual({ enabled: true });
    expect(parseShowMainWindow(null)).toEqual({});
    expect(parseShowMainWindow({ botId: "a", request: { kind: "prompt", requestId: 4 } })).toEqual({
      botId: "a",
      request: { kind: "prompt", requestId: 4 },
    });
  });

  it("refuses unknown fields and wrong values", () => {
    expect(() => parsePinDockAgent({ botId: "a", extra: 1 })).toThrow('Unknown field "extra"');
    expect(() => parsePinDockAgent({ botId: "a", index: -1 })).toThrow("whole number");
    expect(() => parsePinDockAgent({ botId: "" })).toThrow("botId is required.");
    expect(() => parseReorderDock({ botIds: "a" })).toThrow("at most 8 agents");
    expect(() => parseReorderDock({ botIds: Array.from({ length: 9 }, (_, i) => `b${i}`) })).toThrow("at most 8");
    expect(() => parseSetDockSize({ size: "huge" })).toThrow("size must be one of");
    expect(() => parseSetDockVisible({ visible: "yes" })).toThrow("visible must be true or false.");
    expect(() => parseSetDockPinHidden(null)).toThrow("details are required");
    expect(() => parseShowMainWindow({ request: { kind: "prompt", requestId: 1 } })).toThrow("needs its botId");
    expect(() => parseShowMainWindow({ botId: "a", request: { kind: "nope", requestId: 1 } })).toThrow(
      "not a Needs you card",
    );
  });
});
