import { describe, expect, it } from "vitest";
import { parseListBots, parseSetBotHidden } from "./agent-inputs";

describe("hide-agent IPC input parsing (COSGRAL W4-K3)", () => {
  it("lists every agent unless the window asks for visible ones only", () => {
    expect(parseListBots(null)).toEqual({});
    expect(parseListBots(undefined)).toEqual({});
    expect(parseListBots({})).toEqual({});
    expect(parseListBots({ includeHidden: true })).toEqual({ includeHidden: true });
    expect(parseListBots({ includeHidden: false })).toEqual({ includeHidden: false });
    expect(() => parseListBots({ includeHidden: "no" })).toThrow(/true or false/);
    expect(() => parseListBots("all")).toThrow(/list agents/);
  });

  it("takes an agent id and a true or false", () => {
    expect(parseSetBotHidden({ botId: "chief", hidden: true })).toEqual({ botId: "chief", hidden: true });
    expect(parseSetBotHidden({ botId: "chief", hidden: false })).toEqual({ botId: "chief", hidden: false });
    expect(() => parseSetBotHidden({ botId: "chief" })).toThrow(/true or false/);
    expect(() => parseSetBotHidden({ botId: "chief", hidden: 1 })).toThrow(/true or false/);
    expect(() => parseSetBotHidden({ hidden: true })).toThrow(/botId/);
    expect(() => parseSetBotHidden(null)).toThrow(/hide agent/);
  });
});
