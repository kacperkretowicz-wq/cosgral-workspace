// COSGRAL W3: agent templates and the agent creator (parity rows 39–40). Built-in templates are our own content and
// several are proposed for the first agent in onboarding. A person can save an agent as a template (profile, model,
// tool switches, installed skill names and, if asked, its essential memories) and create agents from any template.
// The creator checks everything before the agent exists; what it then cannot do (a missing skill, a provider that is
// not ready) becomes a warning, and the agent stays usable.

import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  AGENT_TEMPLATE_LIMITS,
  type AgentEvent,
  type AgentTemplate,
  type AgentToolSwitches,
  BOT_AVATAR_HUES,
  type BotSummary,
  type CreateAgentInput,
  type CreateAgentResult,
  isAgentTemplate,
  type SaveAgentTemplateInput,
  SKILL_LIMITS,
  type UpdateBotInput,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isOneOf, isString } from "@openbot/contracts/runtime-values";
import type { OpenBotDatabase } from "./openbot-database";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projection_agent_templates (
    template_id TEXT PRIMARY KEY,
    data_json TEXT NOT NULL CHECK(json_valid(data_json)),
    created_at TEXT NOT NULL
  );
`;

const SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;

function builtIn(
  slug: string,
  fields: Omit<AgentTemplate, "id" | "origin" | "model" | "skills" | "createdAt">,
): AgentTemplate {
  return { id: `builtin:${slug}`, origin: "built-in", model: null, skills: [], createdAt: null, ...fields };
}

/** Our own starting points (no texts from other products). */
export const BUILT_IN_AGENT_TEMPLATES: AgentTemplate[] = [
  builtIn("assistant", {
    name: "Assistant",
    role: "General assistant",
    summary: "Everyday help: questions, plans, web research and drafts.",
    description:
      "You help with whatever the person needs today: answer questions, plan, look things up in the browser and prepare drafts. Ask one short question when something important is unclear, and show a draft card before anything goes out in the person's name.",
    reasoningEffort: "medium",
    tools: {},
    memories: [],
    avatarHue: 215,
    suggested: true,
  }),
  builtIn("researcher", {
    name: "Researcher",
    role: "Research and sources",
    summary: "Finds, compares and sums up information with sources.",
    description:
      "You research topics on the web, compare sources and write short summaries. Every fact you report has a link to where you found it, and you say plainly when sources disagree or are missing.",
    reasoningEffort: "high",
    tools: { computer: false, vault: false },
    memories: ["Give a source link for every fact you report."],
    avatarHue: 150,
    suggested: true,
  }),
  builtIn("writer", {
    name: "Writer",
    role: "Writing and editing",
    summary: "Drafts e-mails, posts and documents in your style.",
    description:
      "You write and edit e-mails, posts and documents. Keep the person's style, use plain words and short sentences, and show every message as a draft card before it is sent anywhere.",
    reasoningEffort: "medium",
    tools: { computer: false, routines: false },
    memories: [
      "Show every message as a draft card before it is sent anywhere.",
      "Plain words, short sentences, no filler.",
    ],
    avatarHue: 30,
    suggested: true,
  }),
  builtIn("developer", {
    name: "Developer",
    role: "Code and automation",
    summary: "Writes and fixes code in its workspace and runs the tests.",
    description:
      "You write, fix and explain code in your workspace. Make small changes, run the tests before you say a change is done, and describe what you changed and what you could not check.",
    reasoningEffort: "high",
    tools: { vault: false },
    memories: ["Run the tests before you say a change is done."],
    avatarHue: 245,
    suggested: true,
  }),
  builtIn("inbox", {
    name: "Inbox manager",
    role: "E-mail and calendar",
    summary: "Sorts mail in the browser and prepares replies for your approval.",
    description:
      "You keep the person's inbox and calendar in order in the built-in browser: sort and summarize mail, prepare replies and invitations, and never send, accept or delete anything without a confirm card.",
    reasoningEffort: "medium",
    tools: { computer: false },
    memories: ["Never send, accept or delete mail without a confirm card."],
    avatarHue: 185,
    suggested: false,
  }),
  builtIn("analyst", {
    name: "Data analyst",
    role: "Tables and reports",
    summary: "Keeps shared tables and files in order and writes short reports.",
    description:
      "You keep shared tables and library files in order and turn them into short reports with the numbers that matter. Read rows before you change them and work with their versions.",
    reasoningEffort: "high",
    tools: { computer: false, vault: false },
    memories: ["Read a table's rows before you change them and keep their versions."],
    avatarHue: 100,
    suggested: false,
  }),
  builtIn("operator", {
    name: "Desktop operator",
    role: "Windows apps",
    summary: "Uses Windows apps with the mouse and keyboard after you allow it.",
    description:
      "You do tasks in Windows apps outside the browser with Computer Use, after the person allows it. Take a screenshot before and after each step, go slowly, and stop to ask when a window looks different than expected.",
    reasoningEffort: "medium",
    tools: {},
    memories: ["Take a screenshot before and after each step on the desktop."],
    avatarHue: 280,
    suggested: false,
  }),
];

export interface AgentTemplatesDeps {
  database: OpenBotDatabase;
  /** A new agent with the program's defaults (the preferred provider's model). */
  createBot: () => Promise<BotSummary>;
  updateBot: (input: UpdateBotInput) => Promise<BotSummary>;
  bot: (botId: string) => BotSummary | null;
  setTools: (botId: string, tools: AgentToolSwitches) => void;
  toolSwitches: (botId: string) => AgentToolSwitches;
  /** Installs a library skill by name; returns a warning text when it cannot. */
  installSkill: (botId: string, name: string) => Promise<string | null>;
  skillNames: (botId: string) => Promise<string[]>;
  saveEssentialMemory: (botId: string, text: string) => void;
  essentialMemories: (botId: string) => string[];
  emit: (event: AgentEvent) => void;
  now?: () => Date;
}

export class AgentTemplates {
  readonly #deps: AgentTemplatesDeps;
  readonly #ready = new WeakSet<DatabaseSync>();

  constructor(deps: AgentTemplatesDeps) {
    this.#deps = deps;
  }

  /** Built-in templates first, then saved ones (oldest first). */
  list(): AgentTemplate[] {
    return [...BUILT_IN_AGENT_TEMPLATES.map((template) => structuredClone(template)), ...this.#saved()];
  }

  get(templateId: string): AgentTemplate {
    const template = this.list().find((candidate) => candidate.id === templateId);
    if (!template) throw new Error(`Template "${templateId}" no longer exists.`);
    return template;
  }

  /** The agent creator. */
  async createAgent(input: CreateAgentInput): Promise<CreateAgentResult> {
    const template = input.templateId ? this.get(input.templateId) : null;
    const name = optionalText(input.name ?? template?.name, "Agent name", AGENT_TEMPLATE_LIMITS.name);
    const role = optionalText(input.role ?? template?.role, "Agent role", AGENT_TEMPLATE_LIMITS.role);
    const description = optionalText(
      input.description ?? template?.description,
      "Agent description",
      AGENT_TEMPLATE_LIMITS.description,
    );
    const memories = checkMemories(input.memories ?? template?.memories ?? []);
    const skills = checkSkills(input.skills ?? template?.skills ?? []);
    const tools = { ...(template?.tools ?? {}), ...(input.tools ?? {}) };
    const model = input.model ?? template?.model ?? null;
    const reasoningEffort = input.reasoningEffort ?? template?.reasoningEffort ?? null;
    const hue = template?.avatarHue ?? null;

    const created = await this.#deps.createBot();
    const warnings: string[] = [];
    const profile: UpdateBotInput = { botId: created.id };
    if (name) profile.name = name;
    if (role !== null) profile.role = role;
    if (description !== null) profile.description = description;
    if (reasoningEffort) profile.reasoningEffort = reasoningEffort;
    if (isOneOf(BOT_AVATAR_HUES, hue)) profile.avatarHue = hue;
    if (Object.keys(profile).length > 1) await this.#deps.updateBot(profile);
    if (model && model !== created.model) {
      try {
        await this.#deps.updateBot({ botId: created.id, model });
      } catch (error) {
        warnings.push(
          `Model ${model} could not be set: ${errorText(error)} The agent uses ${this.#deps.bot(created.id)?.model ?? created.model}.`,
        );
      }
    }
    if (Object.keys(tools).length > 0) this.#deps.setTools(created.id, tools);
    for (const skill of skills) {
      try {
        const warning = await this.#deps.installSkill(created.id, skill);
        if (warning) warnings.push(warning);
      } catch (error) {
        warnings.push(`Skill "${skill}" was not installed: ${errorText(error)}`);
      }
    }
    for (const memory of memories) {
      try {
        this.#deps.saveEssentialMemory(created.id, memory);
      } catch (error) {
        warnings.push(`A starting memory was not saved: ${errorText(error)}`);
      }
    }
    return { bot: this.#deps.bot(created.id) ?? created, warnings };
  }

  async saveFromAgent(input: SaveAgentTemplateInput): Promise<AgentTemplate> {
    const bot = this.#deps.bot(input.botId);
    if (!bot) throw new Error(`Agent "${input.botId}" no longer exists.`);
    if (this.#saved().length >= AGENT_TEMPLATE_LIMITS.saved) {
      throw new Error(`At most ${AGENT_TEMPLATE_LIMITS.saved} saved templates; delete one first.`);
    }
    const at = (this.#deps.now?.() ?? new Date()).toISOString();
    const template: AgentTemplate = {
      id: `saved:${randomUUID()}`,
      origin: "saved",
      name: optionalText(input.name, "Template name", AGENT_TEMPLATE_LIMITS.name) || bot.name,
      role: bot.role,
      summary:
        optionalText(input.summary, "Summary", AGENT_TEMPLATE_LIMITS.summary) ||
        bot.role.slice(0, AGENT_TEMPLATE_LIMITS.summary) ||
        "Saved agent",
      description: bot.description.slice(0, AGENT_TEMPLATE_LIMITS.description),
      model: bot.model,
      reasoningEffort: bot.reasoningEffort,
      tools: this.#deps.toolSwitches(bot.id),
      skills: (await this.#deps.skillNames(bot.id)).slice(0, AGENT_TEMPLATE_LIMITS.skills),
      memories: input.includeMemories
        ? this.#deps
            .essentialMemories(bot.id)
            .slice(0, AGENT_TEMPLATE_LIMITS.memories)
            .map((text) => text.slice(0, AGENT_TEMPLATE_LIMITS.memoryText))
        : [],
      avatarHue: bot.avatarHue,
      suggested: false,
      createdAt: at,
    };
    this.#db()
      .prepare("INSERT INTO projection_agent_templates (template_id, data_json, created_at) VALUES (?, ?, ?)")
      .run(template.id, JSON.stringify(template), at);
    this.#emitChanged();
    return template;
  }

  delete(templateId: string): void {
    if (BUILT_IN_AGENT_TEMPLATES.some((template) => template.id === templateId)) {
      throw new Error("Built-in templates cannot be deleted.");
    }
    const result = this.#db().prepare("DELETE FROM projection_agent_templates WHERE template_id = ?").run(templateId);
    if (Number(result.changes) === 0) throw new Error(`Template "${templateId}" no longer exists.`);
    this.#emitChanged();
  }

  #saved(): AgentTemplate[] {
    return this.#db()
      .prepare("SELECT data_json FROM projection_agent_templates ORDER BY created_at, rowid")
      .all()
      .flatMap((row) => {
        if (!isDynamicRecord(row) || !isString(row.data_json)) return [];
        try {
          const parsed = JSON.parse(row.data_json);
          return isAgentTemplate(parsed) ? [parsed] : [];
        } catch {
          return [];
        }
      });
  }

  #emitChanged(): void {
    this.#deps.emit({ type: "agent-templates-changed", templates: this.list() });
  }

  #db(): DatabaseSync {
    const db = this.#deps.database.connection;
    if (!this.#ready.has(db)) {
      db.exec(SCHEMA);
      this.#ready.add(db);
    }
    return db;
  }
}

function optionalText(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (!isString(value)) throw new Error(`${label} must be text.`);
  const text = value.trim();
  if (text.length > max) throw new Error(`${label} has at most ${max} characters.`);
  return text;
}

function checkMemories(memories: string[]): string[] {
  if (memories.length > AGENT_TEMPLATE_LIMITS.memories) {
    throw new Error(`Give at most ${AGENT_TEMPLATE_LIMITS.memories} starting memories.`);
  }
  return memories.map((memory) => {
    const text = isString(memory) ? memory.trim() : "";
    if (!text || text.length > AGENT_TEMPLATE_LIMITS.memoryText) {
      throw new Error(`Each starting memory has 1–${AGENT_TEMPLATE_LIMITS.memoryText} characters.`);
    }
    return text;
  });
}

function checkSkills(skills: string[]): string[] {
  if (skills.length > AGENT_TEMPLATE_LIMITS.skills)
    throw new Error(`Give at most ${AGENT_TEMPLATE_LIMITS.skills} skills.`);
  for (const skill of skills) {
    if (!isString(skill) || skill.length > SKILL_LIMITS.name || !SKILL_NAME.test(skill)) {
      throw new Error(`"${String(skill)}" is not a skill name (kebab-case, like weekly-report).`);
    }
  }
  return [...new Set(skills)];
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
