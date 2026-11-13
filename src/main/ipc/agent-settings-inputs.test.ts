import { describe, expect, it } from "vitest";
import {
  parseAgentTemplateId,
  parseCompleteOnboarding,
  parseCreateAgent,
  parseSaveAgentTemplate,
  parseSettingsBotId,
  parseUpdateAgentSettings,
  parseUpdateAppSettings,
} from "./agent-settings-inputs";

describe("agent settings IPC input parsing", () => {
  it("parses well-formed requests", () => {
    expect(parseSettingsBotId("chief")).toBe("chief");
    expect(
      parseUpdateAgentSettings({
        botId: "chief",
        name: "Boss",
        notifications: false,
        model: "claude-opus-5",
        reasoningEffort: "high",
        tools: { browser: false, vault: true },
      }),
    ).toEqual({
      botId: "chief",
      name: "Boss",
      notifications: false,
      model: "claude-opus-5",
      reasoningEffort: "high",
      tools: { browser: false, vault: true },
    });
    expect(
      parseCreateAgent({
        templateId: "builtin:writer",
        name: "Pen",
        skills: ["weekly-report"],
        memories: ["Be brief."],
      }),
    ).toEqual({ templateId: "builtin:writer", name: "Pen", skills: ["weekly-report"], memories: ["Be brief."] });
    expect(parseCreateAgent({})).toEqual({});
    expect(parseSaveAgentTemplate({ botId: "chief", includeMemories: true })).toEqual({
      botId: "chief",
      includeMemories: true,
    });
    expect(parseAgentTemplateId({ templateId: "saved:1" })).toEqual({ templateId: "saved:1" });
    expect(
      parseUpdateAppSettings({
        language: "pl",
        notifications: { matrix: { finished: { desktop: false } }, onlyWhenUnfocused: false },
      }),
    ).toEqual({
      language: "pl",
      notifications: { matrix: { finished: { desktop: false } }, onlyWhenUnfocused: false },
    });
    expect(
      parseCompleteOnboarding({
        language: "en",
        preferredProvider: "codex",
        firstAgent: { templateId: "builtin:assistant", name: "Ada" },
      }),
    ).toEqual({
      language: "en",
      preferredProvider: "codex",
      firstAgent: { templateId: "builtin:assistant", name: "Ada" },
    });
    expect(parseCompleteOnboarding({ language: "en", preferredProvider: "claude", firstAgent: null })).toMatchObject({
      firstAgent: null,
    });
  });

  it("refuses malformed requests and unknown fields", () => {
    expect(() => parseUpdateAgentSettings({ botId: "chief", tools: { shell: false } })).toThrow(/tool group/);
    expect(() => parseUpdateAgentSettings({ botId: "chief", tools: { browser: "no" } })).toThrow(/true or false/);
    expect(() => parseUpdateAgentSettings({ botId: "chief", model: "gpt-1" })).toThrow(/model/);
    expect(() => parseUpdateAgentSettings({ botId: "chief", approvalPolicy: "never" })).toThrow(/Unknown field/);
    expect(() => parseCreateAgent({ skills: "weekly-report" })).toThrow(/skills/);
    expect(() => parseCreateAgent({ memories: [5] })).toThrow(/memories/);
    expect(() => parseUpdateAppSettings({ language: "de" })).toThrow(/language/);
    expect(() => parseUpdateAppSettings({ notifications: { matrix: { finished: { pager: true } } } })).toThrow(
      /channel/,
    );
    expect(() => parseCompleteOnboarding({ language: "en", preferredProvider: "gemini", firstAgent: null })).toThrow(
      /provider/i,
    );
    expect(() => parseSettingsBotId("")).toThrow(/botId/);
  });
});
