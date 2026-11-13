// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AGENT_TEMPLATE_LIMITS,
  type AgentEvent,
  type AgentToolSwitches,
  type BotSummary,
  isAgentTemplate,
  type UpdateBotInput,
} from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { AgentTemplates, BUILT_IN_AGENT_TEMPLATES } from "./agent-templates";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function newBot(id: string): BotSummary {
  return {
    id,
    name: "New agent",
    role: "New teammate",
    description: "",
    notifications: true,
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    threadId: null,
    workspacePath: `C:\\work\\${id}`,
    preview: "No messages yet",
    updatedAt: null,
    avatarSeed: id,
    avatarHue: null,
    avatarUrl: null,
  };
}

async function open(root?: string) {
  const dir = root ?? (await mkdtemp(join(tmpdir(), "agent-templates-")));
  if (!root) roots.push(dir);
  const database = testDatabase(join(dir, "data"));
  await database.initialize();
  const bots = new Map<string, BotSummary>();
  const tools = new Map<string, AgentToolSwitches>();
  const memories = new Map<string, string[]>();
  const skills = new Map<string, string[]>();
  const events: AgentEvent[] = [];
  let counter = 0;
  const library = new Set(["weekly-report"]);
  let failModel = false;
  const templates = new AgentTemplates({
    database,
    createBot: async () => {
      const bot = newBot(`bot-${++counter}`);
      bots.set(bot.id, bot);
      return bot;
    },
    updateBot: async (input: UpdateBotInput) => {
      if (input.model && failModel) throw new Error("Claude is not installed.");
      const bot = { ...(bots.get(input.botId) ?? newBot(input.botId)), ...input };
      bots.set(input.botId, bot);
      return bot;
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
    emit: (event) => events.push(event),
  });
  return {
    dir,
    database,
    templates,
    bots,
    tools,
    memories,
    skills,
    events,
    failModels: () => {
      failModel = true;
    },
  };
}

describe("AgentTemplates", () => {
  it("ships built-in templates with own content, several of them proposed for the first agent", async () => {
    const { templates } = await open();
    const list = templates.list();
    expect(list.length).toBeGreaterThanOrEqual(BUILT_IN_AGENT_TEMPLATES.length);
    expect(list.every(isAgentTemplate)).toBe(true);
    expect(list.filter((template) => template.suggested).length).toBeGreaterThanOrEqual(3);
    expect(new Set(list.map((template) => template.id)).size).toBe(list.length);
    for (const template of BUILT_IN_AGENT_TEMPLATES) {
      expect(template.origin).toBe("built-in");
      expect(template.description.length).toBeLessThanOrEqual(AGENT_TEMPLATE_LIMITS.description);
    }
  });

  it("creates an agent from a template with its profile, tools, skills and starting memories", async () => {
    const { templates, tools, memories, skills } = await open();
    const template = BUILT_IN_AGENT_TEMPLATES.find((candidate) => candidate.id === "builtin:writer");
    if (!template) throw new Error("writer template missing");
    const { bot, warnings } = await templates.createAgent({ templateId: "builtin:writer", name: "Anna's writer" });
    expect(bot).toMatchObject({ name: "Anna's writer", role: template.role, description: template.description });
    expect(tools.get(bot.id)).toEqual(template.tools);
    expect(memories.get(bot.id)).toEqual(template.memories);
    expect(skills.get(bot.id) ?? []).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("lets the creator's fields win over the template and reports what it could not do", async () => {
    const { templates, tools, skills, failModels } = await open();
    failModels();
    const { bot, warnings } = await templates.createAgent({
      templateId: "builtin:assistant",
      role: "Office helper",
      model: "claude-opus-5",
      tools: { browser: false },
      skills: ["weekly-report", "missing-skill"],
      memories: ["Office hours are 9–17."],
    });
    expect(bot).toMatchObject({ role: "Office helper", model: "gpt-5.6-luna" });
    expect(tools.get(bot.id)).toMatchObject({ browser: false });
    expect(skills.get(bot.id)).toEqual(["weekly-report"]);
    expect(warnings).toEqual([
      expect.stringMatching(/claude-opus-5.*Claude is not installed/),
      'Skill "missing-skill" is not in the skill library.',
    ]);
  });

  it("refuses bad input before an agent exists", async () => {
    const { templates, bots } = await open();
    await expect(templates.createAgent({ templateId: "builtin:nope" })).rejects.toThrow(/no longer exists/);
    await expect(templates.createAgent({ name: "x".repeat(AGENT_TEMPLATE_LIMITS.name + 1) })).rejects.toThrow(/name/);
    await expect(
      templates.createAgent({ memories: Array.from({ length: AGENT_TEMPLATE_LIMITS.memories + 1 }, () => "m") }),
    ).rejects.toThrow(/memories/);
    await expect(templates.createAgent({ skills: ["../escape"] })).rejects.toThrow(/skill/);
    expect(bots.size).toBe(0);
    const plain = await templates.createAgent({});
    expect(plain.bot.name).toBe("New agent");
  });

  it("saves an agent as a template, lists it after a restart and deletes it; built-ins stay", async () => {
    const { dir, database, templates, events } = await open();
    const { bot } = await templates.createAgent({
      templateId: "builtin:researcher",
      name: "Scout",
      skills: ["weekly-report"],
    });
    const saved = await templates.saveFromAgent({
      botId: bot.id,
      summary: "Our research setup",
      includeMemories: true,
    });
    expect(saved).toMatchObject({
      origin: "saved",
      name: "Scout",
      summary: "Our research setup",
      skills: ["weekly-report"],
      suggested: false,
    });
    expect(saved.memories.length).toBeGreaterThan(0);
    expect(events.at(-1)).toMatchObject({ type: "agent-templates-changed" });

    database.close();
    const reopened = await open(dir);
    expect(reopened.templates.list().filter((template) => template.origin === "saved")).toEqual([saved]);
    reopened.templates.delete(saved.id);
    expect(reopened.templates.list().some((template) => template.id === saved.id)).toBe(false);
    expect(() => reopened.templates.delete("builtin:writer")).toThrow(/built-in/i);
    expect(() => reopened.templates.delete("saved:missing")).toThrow(/no longer exists/);
  });

  it("saves memories only when asked", async () => {
    const { templates } = await open();
    const { bot } = await templates.createAgent({ templateId: "builtin:writer" });
    const saved = await templates.saveFromAgent({ botId: bot.id });
    expect(saved.memories).toEqual([]);
    await expect(templates.saveFromAgent({ botId: "missing" })).rejects.toThrow(/no longer exists/);
  });
});
