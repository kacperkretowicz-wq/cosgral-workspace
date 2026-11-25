// COSGRAL: the plan of a project made by its lead agent (contract: ipc-project-plans.ts).
//
// The person describes the project. The lead gets the description as a task and answers with a plan that looks at the project from
// nine sides. The person reads it and accepts it (or asks for another version). Only after that the program asks two separate
// questions: may the lead's skills be created, and may plugins and connectors be reviewed. A "no" (or no answer) changes nothing.
// A "yes" for skills creates the skills of the plan and gives them to the members of the project; a "yes" for the review only makes a
// list of suggestions. Nothing is switched on by this service: the person does that, item by item.
//
// The plan is kept next to the project in the local database. The state of the lead's task is read live: when the task has ended
// the reply is split into sections the next time the plan is read, so there is nothing to keep in step while the program is closed.
// The service knows nothing of channels, skills or the Marketplace except through small ports, so it is tested without the program.

import {
  type ChannelTaskState,
  channelRoutineChannelProblem,
  isProjectPlan,
  PROJECT_PLAN_LIMITS,
  type ProjectPlan,
  type ProjectPlanReviewItem,
  type ProjectPlanSkill,
  parseDecideProjectPlanInput,
  parseProjectPlanChannelInput,
  parseProjectPlanReply,
  parseRequestProjectPlanInput,
  parseSaveProjectDescriptionInput,
  parseSetProjectReviewItemInput,
  projectPlanRequestMessage,
  type WorkspaceChannel,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import type { OpenBotDatabase } from "./openbot-database";
import type { SkillSource } from "./skill-library";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projection_project_plans (
    channel_id TEXT PRIMARY KEY,
    data_json TEXT NOT NULL CHECK(json_valid(data_json))
  );
`;

export class ProjectPlanStore {
  readonly #database: OpenBotDatabase;
  #ready = false;

  constructor(database: OpenBotDatabase) {
    this.#database = database;
  }

  get(channelId: string): ProjectPlan | null {
    const row = this.#db()
      .prepare("SELECT data_json FROM projection_project_plans WHERE channel_id = ?")
      .get(channelId);
    if (!isDynamicRecord(row) || !isString(row.data_json)) return null;
    try {
      const value = JSON.parse(row.data_json);
      return isProjectPlan(value) ? value : null;
    } catch {
      return null;
    }
  }

  save(plan: ProjectPlan): void {
    this.#db()
      .prepare(
        `INSERT INTO projection_project_plans (channel_id, data_json) VALUES (?, ?)
         ON CONFLICT(channel_id) DO UPDATE SET data_json = excluded.data_json`,
      )
      .run(plan.channelId, JSON.stringify(plan));
  }

  #db() {
    const connection = this.#database.connection;
    if (!this.#ready) {
      connection.exec(SCHEMA);
      this.#ready = true;
    }
    return connection;
  }
}

/** A thing the review may suggest: a Marketplace skill or agent, or a plugin of the catalog. */
export interface ReviewCandidate {
  id: string;
  kind: ProjectPlanReviewItem["kind"];
  title: string;
  summary: string;
  tags: string[];
  /** Already on this computer and in use (skills: given to every member; plugins: installed). Such items are not suggested. */
  present: boolean;
}

export interface ProjectPlanPorts {
  store: Pick<ProjectPlanStore, "get" | "save">;
  channel: (channelId: string) => WorkspaceChannel | null;
  /** Sends the text to the lead as a message of the person; answers the task that was made. */
  send: (channelId: string, text: string) => { taskId: string };
  task: (taskId: string) => { state: ChannelTaskState } | null;
  /** The latest result the task gave, or null. */
  result: (channelId: string, taskId: string) => string | null;
  /** Writes one entry of the memory of the project as the person. */
  remember: (channelId: string, text: string) => void;
  /** Creates (or finds, when the name is taken) a library skill and gives it to the agents. */
  createSkill: (input: {
    name: string;
    description: string;
    instructions: string;
    authorBotId: string | null;
    botIds: string[];
  }) => Promise<void>;
  candidates: (channel: WorkspaceChannel) => ReviewCandidate[] | Promise<ReviewCandidate[]>;
  now?: () => Date;
}

const STOP_WORDS = new Set([
  "oraz",
  "który",
  "która",
  "które",
  "jest",
  "będzie",
  "dla",
  "jako",
  "przez",
  "tego",
  "tych",
  "ktore",
  "ktory",
  "that",
  "this",
  "with",
  "from",
  "have",
  "will",
  "your",
  "into",
  "about",
  "when",
  "then",
  "them",
  "they",
  "what",
  "which",
  "should",
]);

/** Words of at least four letters, lowercase, without accents or common filler words. */
export function reviewWords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .match(/[a-z0-9]{4,}/g);
  return [...new Set((words ?? []).filter((word) => !STOP_WORDS.has(word)))];
}

/** The review: what the plan names first, then what shares words with the project. Nothing that is already in use. */
export function reviewProject(plan: ProjectPlan, candidates: ReviewCandidate[]): ProjectPlanReviewItem[] {
  const body = [plan.description, ...plan.sections.map((section) => section.text)].join(" ");
  const projectWords = new Set(reviewWords(body));
  const needWords = plan.needs
    .map((need) => ({ need, words: reviewWords(need) }))
    .filter((entry) => entry.words.length);
  const scored: Array<{ candidate: ReviewCandidate; score: number; reason: string }> = [];
  for (const candidate of candidates) {
    if (candidate.present) continue;
    const titleWords = reviewWords(candidate.title);
    const named = needWords.find(
      (entry) =>
        entry.words.some((word) => titleWords.includes(word)) ||
        candidate.title.toLowerCase().includes(entry.need.toLowerCase()),
    );
    const candidateWords = new Set(reviewWords([candidate.title, candidate.summary, ...candidate.tags].join(" ")));
    const shared = [...projectWords].filter((word) => candidateWords.has(word));
    if (!named && shared.length === 0) continue;
    scored.push({
      candidate,
      score: (named ? 10 : 0) + shared.length,
      reason: named ? `Named in the plan: ${named.need}` : `Fits: ${shared.slice(0, 3).join(", ")}`,
    });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.candidate.title.localeCompare(b.candidate.title))
    .slice(0, PROJECT_PLAN_LIMITS.review)
    .map(({ candidate, reason }) => ({
      id: candidate.id,
      kind: candidate.kind,
      title: candidate.title,
      reason,
      state: "suggested" as const,
    }));
}

/** The one sentence of the plan that goes into the memory of the project when the plan is accepted (at most 500 characters). */
export function planMemoryText(plan: ProjectPlan, limit = 500): string {
  const pick = (aspect: string) =>
    plan.sections.find((section) => section.aspect === aspect)?.text.replace(/\s+/g, " ");
  const parts = [
    pick("goal") && `Cel: ${pick("goal")}`,
    pick("scope") && `Zakres: ${pick("scope")}`,
    pick("order") && `Kolejność: ${pick("order")}`,
  ].filter((part): part is string => !!part);
  const text = `Plan projektu zaakceptowany. ${parts.join(" ")}`.trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

export class ProjectPlanService {
  readonly #ports: ProjectPlanPorts;

  constructor(ports: ProjectPlanPorts) {
    this.#ports = ports;
  }

  get(input: unknown): ProjectPlan | null {
    const { channelId } = parseProjectPlanChannelInput(input);
    const plan = this.#ports.store.get(channelId);
    return plan ? this.#sync(plan) : null;
  }

  saveDescription(input: unknown): ProjectPlan {
    const { channelId, description } = parseSaveProjectDescriptionInput(input);
    this.#channel(channelId);
    const existing = this.get({ channelId });
    if (existing?.phase === "planning")
      throw new Error("The lead is still working on the plan. Wait for it to finish.");
    const at = this.#iso();
    const plan: ProjectPlan = existing
      ? { ...existing, description, updatedAt: at }
      : {
          channelId,
          description,
          phase: "described",
          taskId: null,
          sections: [],
          raw: "",
          skills: [],
          needs: [],
          skillsConsent: "not-asked",
          reviewConsent: "not-asked",
          review: [],
          reviewedAt: null,
          createdAt: at,
          updatedAt: at,
        };
    this.#ports.store.save(plan);
    return plan;
  }

  requestPlan(input: unknown): ProjectPlan {
    const { channelId, feedback } = parseRequestProjectPlanInput(input);
    const channel = this.#channel(channelId);
    const plan = this.get({ channelId });
    if (!plan?.description.trim()) throw new Error("Describe the project in a few sentences first.");
    if (plan.phase === "planning") throw new Error("The lead is already working on the plan.");
    if (plan.phase === "accepted") {
      throw new Error("The plan is already accepted. Ask for changes in the project chat.");
    }
    const problem = channelRoutineChannelProblem(channel);
    if (problem) throw new Error(problem);
    const sent = this.#ports.send(channelId, projectPlanRequestMessage(plan.description, feedback));
    const next: ProjectPlan = {
      ...plan,
      phase: "planning",
      taskId: sent.taskId,
      sections: [],
      raw: "",
      skills: [],
      needs: [],
      skillsConsent: "not-asked",
      reviewConsent: "not-asked",
      review: [],
      reviewedAt: null,
      updatedAt: this.#iso(),
    };
    this.#ports.store.save(next);
    return next;
  }

  accept(input: unknown): ProjectPlan {
    const { channelId } = parseProjectPlanChannelInput(input);
    const plan = this.#needPlan(channelId);
    if (plan.phase === "accepted") return plan;
    if (plan.phase !== "proposed") throw new Error("There is no plan to accept yet.");
    const next = { ...plan, phase: "accepted" as const, updatedAt: this.#iso() };
    this.#ports.store.save(next);
    try {
      this.#ports.remember(channelId, planMemoryText(next));
    } catch {
      // The plan is agreed even when the memory of the project is full; the plan itself stays on its screen.
    }
    return next;
  }

  async decideSkills(input: unknown): Promise<ProjectPlan> {
    const { channelId, allow } = parseDecideProjectPlanInput(input);
    const plan = this.#needAccepted(channelId);
    if (plan.skillsConsent === "done") throw new Error("The skills of this plan were already created.");
    if (!allow) return this.#save({ ...plan, skillsConsent: "declined" });
    if (plan.skills.length === 0) throw new Error("The plan has no skills to create.");
    const channel = this.#channel(channelId);
    const skills: ProjectPlanSkill[] = [];
    for (const skill of plan.skills) {
      if (skill.state === "created") {
        skills.push(skill);
        continue;
      }
      try {
        await this.#ports.createSkill({
          name: skill.name,
          description: skill.description,
          instructions: skill.instructions,
          authorBotId: channel?.leadBotId ?? null,
          botIds: channel?.memberBotIds ?? [],
        });
        skills.push({ ...skill, state: "created", problem: null });
      } catch {
        skills.push({ ...skill, state: "failed", problem: "This skill could not be created. Try again." });
      }
    }
    const done = skills.every((skill) => skill.state === "created");
    return this.#save({ ...plan, skills, skillsConsent: done ? "done" : "allowed" });
  }

  async decideReview(input: unknown): Promise<ProjectPlan> {
    const { channelId, allow } = parseDecideProjectPlanInput(input);
    const plan = this.#needAccepted(channelId);
    if (!allow) return this.#save({ ...plan, reviewConsent: "declined", review: [], reviewedAt: null });
    const review = reviewProject(plan, await this.#ports.candidates(this.#channel(channelId)));
    return this.#save({ ...plan, reviewConsent: "done", review, reviewedAt: this.#iso() });
  }

  setReviewItem(input: unknown): ProjectPlan {
    const { channelId, itemId, state } = parseSetProjectReviewItemInput(input);
    const plan = this.#needAccepted(channelId);
    if (plan.reviewConsent !== "done") throw new Error("Allow the review first.");
    if (!plan.review.some((item) => item.id === itemId)) throw new Error("This item is not in the review.");
    return this.#save({
      ...plan,
      review: plan.review.map((item) => (item.id === itemId ? { ...item, state } : item)),
    });
  }

  #save(plan: ProjectPlan): ProjectPlan {
    const next = { ...plan, updatedAt: this.#iso() };
    this.#ports.store.save(next);
    return next;
  }

  #channel(channelId: string): WorkspaceChannel {
    const channel = this.#ports.channel(channelId);
    if (!channel) throw new Error("This project no longer exists.");
    return channel;
  }

  #needPlan(channelId: string): ProjectPlan {
    const plan = this.get({ channelId });
    if (!plan) throw new Error("There is no plan for this project yet.");
    return plan;
  }

  #needAccepted(channelId: string): ProjectPlan {
    const plan = this.#needPlan(channelId);
    if (plan.phase !== "accepted") throw new Error("Accept the plan first.");
    return plan;
  }

  /** While the lead works, the state of its task decides: a finished task turns the reply into the proposed plan. */
  #sync(plan: ProjectPlan): ProjectPlan {
    if (plan.phase !== "planning" || !plan.taskId) return plan;
    const task = this.#ports.task(plan.taskId);
    if (task && !["done", "failed", "cancelled"].includes(task.state)) return plan;
    const reply = task?.state === "done" ? this.#ports.result(plan.channelId, plan.taskId)?.trim() : null;
    const at = this.#iso();
    if (!reply) {
      const failed: ProjectPlan = { ...plan, phase: "failed", updatedAt: at };
      this.#ports.store.save(failed);
      return failed;
    }
    const parsed = parseProjectPlanReply(reply);
    const proposed: ProjectPlan = {
      ...plan,
      phase: "proposed",
      sections: parsed.sections,
      raw: parsed.sections.length ? "" : reply.slice(0, PROJECT_PLAN_LIMITS.reply),
      skills: parsed.skills.map((skill) => ({ ...skill, state: "draft", problem: null })),
      needs: parsed.needs,
      updatedAt: at,
    };
    this.#ports.store.save(proposed);
    return proposed;
  }

  #iso(): string {
    return (this.#ports.now?.() ?? new Date()).toISOString();
  }
}

/** SKILL.md for a drafted skill: the front matter is one line per value. */
export function skillMarkdown(input: { name: string; description: string; instructions: string }): string {
  const description = input.description.replace(/\s+/g, " ").trim();
  return `---\nname: ${input.name}\ndescription: ${description}\n---\n\n${input.instructions.trim()}\n`;
}

/** What the program has: the channel store, the channel engine, the skill library, the Marketplace and the plugin catalog. */
export function createProjectPlanService(deps: {
  database: OpenBotDatabase;
  channels: {
    list: () => WorkspaceChannel[];
    getTask: (taskId: string) => { state: ChannelTaskState };
    listMessages: (
      channelId: string,
      input?: { limit?: number },
    ) => Array<{ taskId: string | null; kind: string; superseded: boolean; text: string }>;
    saveMemoryByPerson: (input: { channelId: string; text: string }) => unknown;
  };
  engine: { sendMessage: (input: { channelId: string; text: string }) => { task: { id: string } } };
  skills: {
    findByName: (name: string) => { id: string } | null;
    create: (input: { source: SkillSource; authorBotId: string | null }) => Promise<{ id: string }>;
    install: (input: { skillId: string; botId: string }) => Promise<unknown>;
  };
  marketplace: {
    list: (input: { kind: "skill" }) => Array<{
      id: string;
      title: string;
      summary: string;
      tags: string[];
      libraryState: string | null;
      installedBotIds: string[];
    }>;
  };
  plugins: () => {
    list: (input: { offset?: number }) => {
      total: number;
      plugins: Array<{ slug: string; name: string; tagline: string; category: string; state: string }>;
    };
  } | null;
}): ProjectPlanService {
  return new ProjectPlanService({
    store: new ProjectPlanStore(deps.database),
    channel: (channelId) => deps.channels.list().find((channel) => channel.id === channelId) ?? null,
    send: (channelId, text) => ({ taskId: deps.engine.sendMessage({ channelId, text }).task.id }),
    task: (taskId) => {
      try {
        return deps.channels.getTask(taskId);
      } catch {
        return null;
      }
    },
    result: (channelId, taskId) => {
      const results = deps.channels
        .listMessages(channelId, { limit: 500 })
        .filter((message) => message.kind === "result" && message.taskId === taskId && !message.superseded);
      return results.at(-1)?.text ?? null;
    },
    remember: (channelId, text) => {
      deps.channels.saveMemoryByPerson({ channelId, text });
    },
    createSkill: async (input) => {
      const skill =
        deps.skills.findByName(input.name) ??
        (await deps.skills.create({
          source: { kind: "inline", skillMd: skillMarkdown(input) },
          authorBotId: input.authorBotId,
        }));
      let failure: unknown = null;
      let installed = 0;
      for (const botId of input.botIds) {
        try {
          await deps.skills.install({ skillId: skill.id, botId });
          installed += 1;
        } catch (cause) {
          failure ??= cause;
        }
      }
      if (input.botIds.length > 0 && installed === 0) throw failure;
    },
    candidates: (channel) => {
      const candidates: ReviewCandidate[] = deps.marketplace.list({ kind: "skill" }).map((item) => ({
        id: item.id,
        kind: "skill",
        title: item.title,
        summary: item.summary,
        tags: item.tags,
        present: !!channel.leadBotId && item.installedBotIds.includes(channel.leadBotId),
      }));
      const catalog = deps.plugins();
      if (catalog) {
        for (let offset = 0; offset < 1_000; ) {
          const page = catalog.list({ offset });
          for (const plugin of page.plugins) {
            candidates.push({
              id: plugin.slug,
              kind: "plugin",
              title: plugin.name,
              summary: plugin.tagline,
              tags: [plugin.category],
              present: plugin.state !== "available",
            });
          }
          offset += page.plugins.length;
          if (page.plugins.length === 0 || offset >= page.total) break;
        }
      }
      return candidates;
    },
  });
}
