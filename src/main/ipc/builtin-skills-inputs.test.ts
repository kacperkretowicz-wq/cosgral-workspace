import { describe, expect, it } from "vitest";
import { parseApplyBuiltinSkill, parseSetBuiltinSkillDefault } from "./builtin-skills-inputs";

describe("built-in skills input", () => {
  it("accepts a set, a list of agents and a choice", () => {
    expect(parseApplyBuiltinSkill({ packId: "graphify", botIds: ["a", "b"], enabled: true })).toEqual({
      packId: "graphify",
      botIds: ["a", "b"],
      enabled: true,
    });
    expect(parseSetBuiltinSkillDefault({ packId: "superpowers", enabled: false })).toEqual({
      packId: "superpowers",
      enabled: false,
    });
  });

  it("refuses an unknown set, a bad list, a missing choice and too many agents", () => {
    expect(() => parseApplyBuiltinSkill({ packId: "x", botIds: [], enabled: true })).toThrow("Unknown");
    expect(() => parseApplyBuiltinSkill({ packId: "graphify", botIds: "a", enabled: true })).toThrow("botIds");
    expect(() => parseApplyBuiltinSkill({ packId: "graphify", botIds: [""], enabled: true })).toThrow("botId");
    expect(() => parseApplyBuiltinSkill({ packId: "graphify", botIds: [] })).toThrow("enabled");
    expect(() => parseApplyBuiltinSkill({ packId: "graphify", botIds: Array(501).fill("a"), enabled: true })).toThrow(
      "too long",
    );
    expect(() => parseSetBuiltinSkillDefault(null)).toThrow("object");
    expect(() => parseSetBuiltinSkillDefault({ packId: "graphify", enabled: "yes" })).toThrow("enabled");
  });
});
