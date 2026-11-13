import { describe, expect, it } from "vitest";
import { moveFallback, validateAcp } from "./ProvidersPage";

describe("provider settings", () => {
  it("rejects invalid ACP identifiers and empty commands", () => {
    expect(validateAcp({ id: "Bad ID", name: "Agent", command: "", args: [] })).toBeTruthy();
    expect(validateAcp({ id: "my-agent", name: "Agent", command: "tool", args: [] })).toBe("");
  });
  it("moves a fallback without losing the other entries", () => {
    expect(moveFallback(["gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra"], 2, 0)).toEqual(["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-sol"]);
  });
});
