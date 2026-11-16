// @vitest-environment node
// COSGRAL W4-K3: a copy of an agent takes over its settings, never its memory or history.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AGENT_TEMPLATE_LIMITS,
  type AgentMcpServerSetting,
  type AgentModelId,
  type AgentToolSwitches,
  type BotSummary,
  type UpdateBotInput,
} from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { AgentTemplates } from "./agent-templates";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function bot(id: string, fields: Partial<BotSummary> = {}): BotSummary {
  return {
    id,
    name: "New agent",
    role: "New teammate",
    description: "",
    notifications: true,
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    threadId: null,
    workspacePath: join("work", id),
    preview: "No messages yet",
    updatedAt: null,
    avatarSeed: id,
    avatarHue: null,
    avatarUrl: null,
    ...fields,
  };
}

async function open() {
  const dir = await mkdtemp(join(tmpdir(), "agent-duplicate-"));
  roots.push(dir);
  const database = testDatabase(join(dir, "data"));
  await database.initialize();
  const bots = new Map<string, BotSummary>();
  const tools = new Map<string, AgentToolSwitches>();
  const memories = new Map<string, string[]>();
  const skills = new Map<string, string[]>();
  const mcp = new Map<string, AgentMcpServerSetting[]>();
  const fallbacks = new Map<string, AgentModelId[]>();
  const library = new Set(["weekly-report", "tidy-notes"]);
  const state = { counter: 0, failModel: false, failFallbacks: false };
  const templates = new AgentTemplates({
    database,
    createBot: async () => {
      const created = bot(`bot-${++state.counter}`);
      bots.set(created.id, created);
      return created;
    },
    updateBot: async (input: UpdateBotInput) => {
      if (input.model && state.failModel) throw new Error("Claude is not installed.");
      const updated = { ...(bots.get(input.botId) ?? bot(input.botId)), ...input };
      bots.set(input.botId, updated);
      return updated;
    },
    bot: (botId) => bots.get(botId) ?? null,
    setTools: (botId, switches) => tools.set(botId, switches),
    toolSwitches: (botId) => tools.get(botId) ?? {},
    installSkill: async (botId, name) => {
      if (!library.has(name)) return `Skill "${name}" is not in the skill library.`;
      skills.set(botId, [...(skills.get(botId) ?? []), name]);
      return null;
    },
    skillNames: async (botId) => skills.get(botId) ?? [],
    saveEssentialMemory: (botId, text) => memories.set(botId, [...(memories.get(botId) ?? []), text]),
    essentialMemories: (botId) => memories.get(botId) ?? [],
    botNames: () => [...bots.values()].map((candidate) => candidate.name),
    mcpSettings: (botId) => mcp.get(botId) ?? [],
    setMcpEnabled: (botId, serverId, enabled) =>
      mcp.set(botId, [
        ...(mcp.get(botId) ?? []).filter((setting) => setting.serverId !== serverId),
        { botId, serverId, enabled },
      ]),
    fallbackModels: (botId) => fallbacks.get(botId) ?? [],
    setFallbackModels: (botId, models) => {
      if (state.failFallbacks) throw new Error("No provider registry.");
      fallbacks.set(botId, models);
    },
    emit: () => undefined,
  });
  return { templates, bots, tools, memories, skills, mcp, fallbacks, state };
}

describe("duplicating an agent (COSGRAL W4-K3)", () => {
  it("copies profile, model, tools, skills, switched-off MCP servers and fallback models, but no memory", async () => {
    const { templates, bots, tools, memories, skills, mcp, fallbacks } = await open();
    bots.set(
      "ada",
      bot("ada", {
        name: "Ada",
        role: "Editor",
        description: "You edit posts.",
        model: "claude-opus-5",
        reasoningEffort: "high",
        notifications: false,
        avatarHue: 150,
        threadId: "thread-ada",
        preview: "Private words",
        updatedAt: "2026-11-16T00:00:00.000Z",
      }),
    );
    tools.set("ada", { computer: false, routines: false });
    skills.set("ada", ["weekly-report", "tidy-notes"]);
    memories.set("ada", ["Ada's private memory"]);
    mcp.set("ada", [
      { botId: "ada", serverId: "files", enabled: false },
      { botId: "ada", serverId: "search", enabled: true },
    ]);
    fallbacks.set("ada", ["claude-sonnet-5", "gpt-5.6-sol"]);

    const { bot: copy, warnings } = await templates.duplicateAgent({ sourceBotId: "ada" });

    expect(warnings).toEqual([]);
    expect(copy).toMatchObject({
      name: "Ada kopia",
      role: "Editor",
      description: "You edit posts.",
      model: "claude-opus-5",
      reasoningEffort: "high",
      notifications: false,
      avatarHue: 150,
    });
    // Its own identity: nothing of the source's thread, preview, workspace or avatar seed.
    expect(copy.id).not.toBe("ada");
    expect(copy.threadId).toBeNull();
    expect(copy.preview).toBe("No messages yet");
    expect(copy.workspacePath).not.toBe(bots.get("ada")?.workspacePath);
    expect(copy.avatarSeed).toBe(copy.id);
    expect(tools.get(copy.id)).toEqual({ computer: false, routines: false });
    expect(skills.get(copy.id)).toEqual(["weekly-report", "tidy-notes"]);
    expect(mcp.get(copy.id)).toEqual([{ botId: copy.id, serverId: "files", enabled: false }]);
    expect(fallbacks.get(copy.id)).toEqual(["claude-sonnet-5", "gpt-5.6-sol"]);
    expect(memories.get(copy.id)).toBeUndefined();
    // The source is untouched.
    expect(memories.get("ada")).toEqual(["Ada's private memory"]);
    expect(bots.get("ada")).toMatchObject({ name: "Ada", threadId: "thread-ada", preview: "Private words" });
  });

  it("names the copy '<name> kopia', then numbers it while the name is taken", async () => {
    const { templates, bots } = await open();
    bots.set("ada", bot("ada", { name: "Ada" }));
    const first = await templates.duplicateAgent({ sourceBotId: "ada" });
    const second = await templates.duplicateAgent({ sourceBotId: "ada" });
    const third = await templates.duplicateAgent({ sourceBotId: "ada" });
    expect([first.bot.name, second.bot.name, third.bot.name]).toEqual(["Ada kopia", "Ada kopia 2", "Ada kopia 3"]);
    // A copy of a copy keeps the original name as its root.
    const ofCopy = await templates.duplicateAgent({ sourceBotId: first.bot.id });
    expect(ofCopy.bot.name).toBe("Ada kopia 4");
  });

  it("keeps a long name inside the limit and still ends with the suffix", async () => {
    const { templates, bots } = await open();
    const longName = "A".repeat(AGENT_TEMPLATE_LIMITS.name);
    bots.set("long", bot("long", { name: longName }));
    const first = await templates.duplicateAgent({ sourceBotId: "long" });
    const second = await templates.duplicateAgent({ sourceBotId: "long" });
    expect(first.bot.name.length).toBeLessThanOrEqual(AGENT_TEMPLATE_LIMITS.name);
    expect(first.bot.name.endsWith(" kopia")).toBe(true);
    expect(second.bot.name.endsWith(" kopia 2")).toBe(true);
    expect(second.bot.name).not.toBe(first.bot.name);
  });

  it("uses a name the person gives, and refuses a name that is too long before anything is created", async () => {
    const { templates, bots } = await open();
    bots.set("ada", bot("ada", { name: "Ada" }));
    const named = await templates.duplicateAgent({ sourceBotId: "ada", name: "  Beta  " });
    expect(named.bot.name).toBe("Beta");
    const before = bots.size;
    await expect(
      templates.duplicateAgent({ sourceBotId: "ada", name: "x".repeat(AGENT_TEMPLATE_LIMITS.name + 1) }),
    ).rejects.toThrow(/at most/);
    expect(bots.size).toBe(before);
  });

  it("refuses an agent that no longer exists and creates nothing", async () => {
    const { templates, bots } = await open();
    await expect(templates.duplicateAgent({ sourceBotId: "ghost" })).rejects.toThrow(/no longer exists/);
    expect(bots.size).toBe(0);
  });

  it("keeps the copy when a part fails and says what was not copied", async () => {
    const { templates, bots, skills, state } = await open();
    bots.set("ada", bot("ada", { name: "Ada", model: "claude-opus-5" }));
    skills.set("ada", ["weekly-report", "gone-skill"]);
    state.failModel = true;
    state.failFallbacks = true;
    const { bot: copy, warnings } = await templates.duplicateAgent({ sourceBotId: "ada" });
    expect(copy.name).toBe("Ada kopia");
    expect(warnings.some((warning) => warning.includes("claude-opus-5 could not be set"))).toBe(true);
    expect(warnings).toContain('Skill "gone-skill" is not in the skill library.');
    expect(warnings.some((warning) => warning.includes("fallback models"))).toBe(false); // none to copy, so no attempt
  });

  it("reports fallback models that cannot be copied as a warning", async () => {
    const { templates, bots, fallbacks, state } = await open();
    bots.set("ada", bot("ada", { name: "Ada" }));
    fallbacks.set("ada", ["gpt-5.6-sol"]);
    state.failFallbacks = true;
    const { warnings } = await templates.duplicateAgent({ sourceBotId: "ada" });
    expect(warnings).toEqual(["The fallback models could not be copied: No provider registry."]);
  });
});
