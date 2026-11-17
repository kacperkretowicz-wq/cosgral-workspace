// COSGRAL W11 (U4, U5): what the message box needs beyond sending (contract: ipc-composer.ts).
//   * Slash commands: the commands of the program and the skills of the agent.
//   * Mentions: agents, channels and files that can be pointed at.
//   * Side question: a short question in a context of its own. The answer is shown next to the chat and never written into the
//     conversation. HOW it is asked (an ephemeral CLI thread that reads the chat for context) is the `ask` port: the engine here
//     owns the states, the limits, the cancel and the events; without the port a question fails at once, in plain words.

import { randomUUID } from "node:crypto";
import {
  type AgentEvent,
  COMPOSER_LIMITS,
  clipSideAnswer,
  filterSlashCommands,
  type MentionCandidate,
  parseBotIdInput,
  parseSearchMentionsInput,
  parseSideQuestionIdInput,
  parseSideQuestionInput,
  type SideQuestionState,
  type SlashCommand,
} from "@openbot/contracts/ipc";

/** The commands of the program itself, in the order the menu shows them. */
export const PROGRAM_SLASH_COMMANDS: readonly SlashCommand[] = [
  { name: "compact", hint: "Shorten the conversation to free context", kind: "program" },
  { name: "new-thread", hint: "Start an empty thread", kind: "program" },
  { name: "side", hint: "Ask a side question without touching the chat", kind: "program" },
];

/** A skill name becomes a command only when it is a valid command name and no program command has it. */
const COMMAND_NAME = /^[a-z][a-z0-9-]{0,63}$/;

/** How many side questions of one agent may run at the same time, and how many finished ones are kept in memory. */
export const SIDE_QUESTION_LIMITS = { running: 3, kept: 30 } as const;

export interface SideQuestionRun {
  botId: string;
  threadId: string | null;
  text: string;
  /** Ends the question when aborted (the person cancelled, or the program is closing). */
  signal: AbortSignal;
  /** The answer so far (the whole text each time). */
  onText: (answer: string) => void;
}

export interface ComposerOptions {
  agents: () => Array<{ id: string; name: string; role: string }>;
  channels: () => Array<{ id: string; name: string; title: string; archived: boolean }>;
  files: (needle: string, limit: number) => Array<{ id: string; name: string }>;
  /** The names of the skills installed for an agent. */
  skills: (botId: string) => string[];
  /** Asks the question in a context of its own; resolves when the answer is complete. Absent = not connected. */
  ask?: (run: SideQuestionRun) => Promise<void>;
  emit: (event: AgentEvent) => void;
  now?: () => Date;
}

export class ComposerService {
  readonly #options: ComposerOptions;
  readonly #questions = new Map<string, SideQuestionState>();
  readonly #controllers = new Map<string, AbortController>();

  constructor(options: ComposerOptions) {
    this.#options = options;
  }

  listSlashCommands(input: unknown): SlashCommand[] {
    const { botId } = parseBotIdInput(input);
    if (!this.#options.agents().some((agent) => agent.id === botId)) throw new Error("This agent no longer exists.");
    const taken = new Set(PROGRAM_SLASH_COMMANDS.map((command) => command.name));
    const skills: SlashCommand[] = [];
    for (const name of this.#options.skills(botId)) {
      const command = name.toLowerCase();
      if (!COMMAND_NAME.test(command) || taken.has(command)) continue;
      taken.add(command);
      skills.push({ name: command, hint: `Use the skill ${name}`, kind: "skill" });
    }
    return filterSlashCommands([...PROGRAM_SLASH_COMMANDS, ...skills], "");
  }

  searchMentions(input: unknown): MentionCandidate[] {
    const { botId, q, limit } = parseSearchMentionsInput(input);
    const needle = q.toLowerCase();
    const matches = (...parts: string[]) => needle === "" || parts.some((part) => part.toLowerCase().includes(needle));
    const found: MentionCandidate[] = [
      ...this.#options
        .agents()
        .filter((agent) => agent.id !== botId && matches(agent.name))
        .map((agent): MentionCandidate => ({ kind: "agent", id: agent.id, label: agent.name, detail: agent.role })),
      ...this.#options
        .channels()
        .filter((channel) => !channel.archived && matches(channel.name, channel.title))
        .map(
          (channel): MentionCandidate => ({
            kind: "channel",
            id: channel.id,
            label: channel.title || channel.name,
            detail: "Channel",
          }),
        ),
      ...this.#options
        .files(q, limit)
        .map((file): MentionCandidate => ({ kind: "file", id: file.id, label: file.name, detail: "Library" })),
    ].filter((candidate) => candidate.label.length > 0);
    return found.slice(0, limit);
  }

  askSideQuestion(input: unknown): SideQuestionState {
    const parsed = parseSideQuestionInput(input);
    if (!this.#options.agents().some((agent) => agent.id === parsed.botId))
      throw new Error("This agent no longer exists.");
    const running = [...this.#questions.values()].filter(
      (question) => question.botId === parsed.botId && question.status === "running",
    ).length;
    if (running >= SIDE_QUESTION_LIMITS.running) {
      throw new Error(
        `At most ${SIDE_QUESTION_LIMITS.running} side questions can run at once; wait for one or cancel it.`,
      );
    }
    const state: SideQuestionState = {
      questionId: randomUUID(),
      botId: parsed.botId,
      threadId: parsed.threadId ?? null,
      question: parsed.text,
      status: "running",
      answer: "",
      error: null,
      startedAt: (this.#options.now?.() ?? new Date()).toISOString(),
    };
    this.#remember(state);
    const started = this.#publish(state);
    const ask = this.#options.ask;
    if (!ask) {
      return this.#finish(state.questionId, {
        status: "failed",
        error: "Side questions are not connected to an agent yet.",
      });
    }
    const controller = new AbortController();
    this.#controllers.set(state.questionId, controller);
    void ask({
      botId: state.botId,
      threadId: state.threadId,
      text: state.question,
      signal: controller.signal,
      onText: (answer) => this.#grow(state.questionId, answer),
    })
      .then(() => this.#finish(state.questionId, { status: "done" }))
      .catch((error: unknown) =>
        this.#finish(state.questionId, {
          status: "failed",
          error:
            error instanceof Error && error.message
              ? error.message.slice(0, 300)
              : "The question could not be answered.",
        }),
      )
      .finally(() => this.#controllers.delete(state.questionId));
    return started;
  }

  cancelSideQuestion(input: unknown): SideQuestionState {
    const { questionId } = parseSideQuestionIdInput(input);
    const state = this.#questions.get(questionId);
    if (!state) throw new Error("This side question does not exist.");
    if (state.status !== "running") return structuredClone(state);
    this.#controllers.get(questionId)?.abort();
    return this.#finish(questionId, { status: "cancelled" });
  }

  /** The program is closing: every running question ends as cancelled. */
  close(): void {
    for (const [questionId, state] of this.#questions) {
      if (state.status === "running") {
        this.#controllers.get(questionId)?.abort();
        this.#finish(questionId, { status: "cancelled" });
      }
    }
  }

  #grow(questionId: string, answer: string): void {
    const state = this.#questions.get(questionId);
    if (state?.status !== "running") return;
    this.#publish({ ...state, answer: clipSideAnswer(answer) });
  }

  #finish(questionId: string, change: { status: "done" | "failed" | "cancelled"; error?: string }): SideQuestionState {
    const state = this.#questions.get(questionId);
    if (!state) throw new Error("This side question does not exist.");
    // A question that already ended stays as it ended (a cancel that races the end of the answer, a late error).
    if (state.status !== "running") return structuredClone(state);
    return this.#publish({ ...state, status: change.status, error: change.error ?? null });
  }

  #publish(state: SideQuestionState): SideQuestionState {
    this.#questions.set(state.questionId, state);
    this.#options.emit({ type: "side-question-changed", state: structuredClone(state) });
    return structuredClone(state);
  }

  #remember(state: SideQuestionState): void {
    this.#questions.set(state.questionId, state);
    const finished = [...this.#questions.values()].filter((question) => question.status !== "running");
    for (const old of finished.slice(0, Math.max(0, finished.length - SIDE_QUESTION_LIMITS.kept))) {
      this.#questions.delete(old.questionId);
    }
  }
}

export { COMPOSER_LIMITS };
