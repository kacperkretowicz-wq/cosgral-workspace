import { describe, expect, it } from "vitest";
import {
  parseAgentTemplateId,
  parseCompleteOnboarding,
  parseCreateAgent,
  parseDuplicateAgent,
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
    expect(parseUpdateAppSettings({ navigation: { pinnedPageIds: ["usage", "agents"] } })).toEqual({
      navigation: { pinnedPageIds: ["usage", "agents"] },
    });
    expect(parseUpdateAppSettings({ navigation: { pinnedPageIds: [] } })).toEqual({
      navigation: { pinnedPageIds: [] },
    });
    expect(parseUpdateAppSettings({ appearance: { uiScale: 110, font: "system", unreadFirst: true } })).toEqual({
      appearance: { uiScale: 110, font: "system", unreadFirst: true },
    });
    expect(parseUpdateAppSettings({ behavior: { launchAtLogin: true } })).toEqual({
      behavior: { launchAtLogin: true },
    });
    expect(() => parseUpdateAppSettings({ appearance: { uiScale: 111 } })).toThrow(/uiScale is one of/);
    expect(() => parseUpdateAppSettings({ appearance: { accent: "red" } })).toThrow(/Unknown appearance setting/);
    expect(() => parseUpdateAppSettings({ behavior: { launchAtLogin: "yes" } })).toThrow(/on or off/);
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
    expect(parseDuplicateAgent({ sourceBotId: "ada" })).toEqual({ sourceBotId: "ada" });
    expect(parseDuplicateAgent({ sourceBotId: "ada", name: "Ada B" })).toEqual({ sourceBotId: "ada", name: "Ada B" });
    expect(() => parseDuplicateAgent({ name: "Ada B" })).toThrow(/sourceBotId/);
    expect(() => parseDuplicateAgent({ sourceBotId: "ada", name: 7 })).toThrow(/name/);
    expect(() => parseDuplicateAgent({ sourceBotId: "ada", name: "x".repeat(200) })).toThrow(/name/);
    expect(() => parseDuplicateAgent({ sourceBotId: "ada", copyMemory: true })).toThrow();
    expect(() => parseUpdateAppSettings({ language: "de" })).toThrow(/language/);
    expect(() => parseUpdateAppSettings({ navigation: { pinnedPageIds: ["library", "nope"] } })).toThrow(/known pages/);
    expect(() => parseUpdateAppSettings({ navigation: { pinnedPageIds: ["library", "library"] } })).toThrow(
      /known pages/,
    );
    expect(() => parseUpdateAppSettings({ navigation: { pinnedPageIds: "library" } })).toThrow(/known pages/);
    expect(() => parseUpdateAppSettings({ navigation: { pinnedPageIds: [], extra: 1 } })).toThrow();
    expect(() => parseUpdateAppSettings({ notifications: { matrix: { finished: { pager: true } } } })).toThrow(
      /channel/,
    );
    expect(() => parseCompleteOnboarding({ language: "en", preferredProvider: "gemini", firstAgent: null })).toThrow(
      /provider/i,
    );
    expect(() => parseSettingsBotId("")).toThrow(/botId/);
  });
});

describe("parseCreateAgent avatar (W11 U1)", () => {
  it("takes an avatar seed and colour, and refuses bad ones", () => {
    expect(parseCreateAgent({ name: "Scout", avatarSeed: "scout:avatar:3:7", avatarHue: 150 })).toMatchObject({
      avatarSeed: "scout:avatar:3:7",
      avatarHue: 150,
    });
    expect(parseCreateAgent({ avatarHue: null })).toEqual({ avatarHue: null });
    expect(() => parseCreateAgent({ avatarSeed: "bad seed!" })).toThrow(/avatar seed/);
    expect(() => parseCreateAgent({ avatarHue: 7 })).toThrow(/colour/);
  });
});
