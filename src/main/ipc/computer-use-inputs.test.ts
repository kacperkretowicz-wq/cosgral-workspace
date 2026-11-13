import { describe, expect, it } from "vitest";
import { parseStopComputerUse } from "./computer-use-inputs";

describe("Computer Use IPC input parsing", () => {
  it("stops one agent or every agent", () => {
    expect(parseStopComputerUse(undefined)).toEqual({});
    expect(parseStopComputerUse(null)).toEqual({});
    expect(parseStopComputerUse({})).toEqual({});
    expect(parseStopComputerUse({ botId: "chief" })).toEqual({ botId: "chief" });
  });

  it("refuses malformed requests", () => {
    expect(() => parseStopComputerUse("chief")).toThrow(/required/);
    expect(() => parseStopComputerUse({ botId: "" })).toThrow(/botId/);
    expect(() => parseStopComputerUse({ botId: "chief", all: true })).toThrow(/Unknown field/);
  });
});
