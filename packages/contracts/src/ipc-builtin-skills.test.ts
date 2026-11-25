import { describe, expect, it } from "vitest";
import { BUILTIN_SKILL_PACK_IDS, IPC_CHANNELS, isBuiltinSkillPack, isBuiltinSkillPackId } from "./ipc";

const pack = {
  id: "superpowers",
  title: "Superpowers",
  summary: "Working habits.",
  whenToUse: "Works by itself.",
  license: "MIT",
  sourceUrl: "https://github.com/obra/superpowers",
  sourceVersion: "7.0.2",
  skills: [{ name: "brainstorming", description: "Use before creative work.", skillId: "s1", state: "ready" }],
  defaultForNewAgents: true,
  installedBotIds: ["chief"],
  partialBotIds: [],
  program: null,
};

describe("built-in skills contract", () => {
  it("names the three sets and the three channels", () => {
    expect(BUILTIN_SKILL_PACK_IDS).toEqual(["superpowers", "i-have-adhd", "graphify"]);
    expect(IPC_CHANNELS.builtinSkillsList).toBe("builtin-skills:list");
    expect(IPC_CHANNELS.builtinSkillsApply).toBe("builtin-skills:apply");
    expect(IPC_CHANNELS.builtinSkillsSetDefault).toBe("builtin-skills:set-default");
    expect(isBuiltinSkillPackId("graphify")).toBe(true);
    expect(isBuiltinSkillPackId("other")).toBe(false);
  });

  it("accepts a set with or without a program and drops malformed ones", () => {
    expect(isBuiltinSkillPack(pack)).toBe(true);
    expect(
      isBuiltinSkillPack({
        ...pack,
        id: "graphify",
        program: { command: "graphify", installCommand: "uv tool install graphifyy", found: false },
      }),
    ).toBe(true);
    expect(isBuiltinSkillPack({ ...pack, id: "unknown" })).toBe(false);
    expect(isBuiltinSkillPack({ ...pack, program: { command: "graphify" } })).toBe(false);
    expect(isBuiltinSkillPack({ ...pack, skills: [{ name: "x" }] })).toBe(false);
    expect(isBuiltinSkillPack({ ...pack, installedBotIds: [1] })).toBe(false);
    expect(isBuiltinSkillPack(null)).toBe(false);
  });
});
