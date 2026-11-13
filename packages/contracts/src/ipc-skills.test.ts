import { describe, expect, it } from "vitest";
import {
  isAgentEvent,
  isLocalSkill,
  isSkillContent,
  isSkillInstall,
  isSkillName,
  isSkillVersion,
  SKILL_LIMITS,
} from "./ipc";

const AT = "2026-11-13T02:00:00.000Z";
const skill = {
  id: "s1",
  name: "weekly-report",
  description: "Builds the weekly sales report from the shared table.",
  examplePrompt: "Prepare this week's report",
  version: 2,
  createdByBotId: "chief",
  createdAt: AT,
  updatedAt: AT,
  path: "C:\\Users\\me\\COSGRAL Workspace\\Skills\\weekly-report\\versions\\2",
};
const install = {
  botId: "chief",
  skillId: "s1",
  name: "weekly-report",
  installedVersion: 1,
  latestVersion: 2,
  updateAvailable: true,
  modifiedLocally: false,
  path: "C:\\Users\\me\\COSGRAL Workspace\\Bots\\chief\\.cosgral\\skills\\weekly-report",
  installedAt: AT,
};

describe("W2 skills contract", () => {
  it("accepts library skills, versions, content and per-agent installs", () => {
    expect(isLocalSkill(skill)).toBe(true);
    expect(isLocalSkill({ ...skill, examplePrompt: null, createdByBotId: null })).toBe(true);
    expect(isLocalSkill({ ...skill, version: 0 })).toBe(false);
    expect(
      isSkillVersion({
        skillId: "s1",
        version: 1,
        createdAt: AT,
        authorBotId: null,
        note: "Restored from version 1",
        restoredFrom: 1,
        contentHash: "ab",
        files: 2,
        bytes: 120,
      }),
    ).toBe(true);
    expect(
      isSkillContent({
        skill,
        version: 2,
        skillMd: "---\nname: weekly-report\n---\n",
        files: [{ path: "SKILL.md", bytes: 30 }],
      }),
    ).toBe(true);
    expect(isSkillInstall(install)).toBe(true);
    expect(isSkillInstall({ ...install, modifiedLocally: "no" })).toBe(false);
  });

  it("follows library and install changes as agent events", () => {
    expect(isAgentEvent({ type: "skills-changed", skills: [skill] })).toBe(true);
    expect(isAgentEvent({ type: "skills-changed", skills: [{ id: "s1" }] })).toBe(false);
    expect(isAgentEvent({ type: "skill-installs-changed", installs: [install] })).toBe(true);
    expect(isAgentEvent({ type: "skill-installs-changed", installs: [{ botId: "chief" }] })).toBe(false);
  });

  it("allows only short kebab-case skill names that are safe folder names", () => {
    expect(isSkillName("weekly-report")).toBe(true);
    expect(isSkillName("a1")).toBe(true);
    expect(isSkillName("Weekly Report")).toBe(false);
    expect(isSkillName("../escape")).toBe(false);
    expect(isSkillName("con")).toBe(false);
    expect(isSkillName("a".repeat(SKILL_LIMITS.name + 1))).toBe(false);
  });
});
