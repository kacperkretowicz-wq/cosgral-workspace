// COSGRAL W11 (U4, U5): what the message box of a chat needs beyond sending.
//   * Side question: a short question to the agent in a context of its own. The answer is shown next to the chat and is NOT written
//     into the conversation (the agent's main thread, its queue and its memory do not see it). It reads the thread for context.
//   * Slash commands ("/"): what the person can type at the start of a message: the commands of the program, the agent's skills.
//   * Mentions ("@"): agents, channels and files that can be pointed at in a message.
//
// This computer only. Nothing here sends a message to anybody: a mention is only text the person puts into the box.

import { isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const COMPOSER_LIMITS = {
  sideQuestion: 4_000,
  /** The answer shown next to the chat; longer answers are cut with a note. */
  sideAnswer: 20_000,
  mentionQuery: 80,
  mentions: 20,
  commandName: 64,
  commandHint: 160,
} as const;

// -- side question -----------------------------------------------------------------------------------------------------------

export const SIDE_QUESTION_STATUSES = ["running", "done", "failed", "cancelled"] as const;
export type SideQuestionStatus = (typeof SIDE_QUESTION_STATUSES)[number];

export interface SideQuestionInput {
  botId: string;
  /** The thread to read for context; left out = the agent's active thread. */
  threadId?: string;
  text: string;
}

export interface SideQuestionIdInput {
  questionId: string;
}

/** The state of one side question; `side-question-changed` carries it again each time the answer grows or the status changes. */
export interface SideQuestionState {
  questionId: string;
  botId: string;
  threadId: string | null;
  question: string;
  status: SideQuestionStatus;
  /** The answer so far (the whole text each time: it is short). */
  answer: string;
  /** Why it failed, in plain words; null otherwise. */
  error: string | null;
  startedAt: string;
}

export interface SideQuestionChanged {
  state: SideQuestionState;
}

// -- slash commands and mentions ---------------------------------------------------------------------------------------------

export const SLASH_COMMAND_KINDS = ["program", "skill"] as const;
export type SlashCommandKind = (typeof SLASH_COMMAND_KINDS)[number];

export interface SlashCommand {
  /** Without the slash, lower case, letters, digits and dashes: "compact", "new-thread". */
  name: string;
  /** One line that says what it does. */
  hint: string;
  kind: SlashCommandKind;
}

export const MENTION_KINDS = ["agent", "channel", "file"] as const;
export type MentionKind = (typeof MENTION_KINDS)[number];

export interface SearchMentionsInput {
  botId: string;
  /** What follows the "@"; "" = the first candidates. */
  q: string;
  limit?: number;
}

export interface MentionCandidate {
  kind: MentionKind;
  id: string;
  /** What is put into the message: the name of the agent or channel, the file name. */
  label: string;
  /** A short line under it (role, folder), or "". */
  detail: string;
}

/** `window.openbot.composer` (this computer only). */
export interface ComposerDesktopApi {
  /** Starts a side question; returns its first state (`running`). The answer comes as `side-question-changed`. */
  askSideQuestion: (input: SideQuestionInput) => Promise<SideQuestionState>;
  cancelSideQuestion: (input: SideQuestionIdInput) => Promise<SideQuestionState>;
  listSlashCommands: (input: { botId: string }) => Promise<SlashCommand[]>;
  searchMentions: (input: SearchMentionsInput) => Promise<MentionCandidate[]>;
}

// -- rules shared by the engine and the mock -------------------------------------------------------------------------------------

const COMMAND_NAME = /^[a-z][a-z0-9-]{0,63}$/;

export function parseSideQuestionInput(input: unknown): SideQuestionInput {
  if (!isDynamicRecord(input) || !isString(input.botId) || input.botId.length === 0)
    throw new Error("Choose an agent.");
  if (!isString(input.text) || input.text.trim().length === 0) throw new Error("Write the question first.");
  if (input.text.length > COMPOSER_LIMITS.sideQuestion) {
    throw new Error(`A side question has at most ${COMPOSER_LIMITS.sideQuestion} characters.`);
  }
  if (input.threadId !== undefined && (!isString(input.threadId) || input.threadId.length === 0)) {
    throw new Error("The thread is not named.");
  }
  return {
    botId: input.botId,
    text: input.text.trim(),
    ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
  };
}

export function parseSideQuestionIdInput(input: unknown): SideQuestionIdInput {
  if (!isDynamicRecord(input) || !isString(input.questionId) || input.questionId.length === 0) {
    throw new Error("The question is not named.");
  }
  return { questionId: input.questionId };
}

export function parseBotIdInput(input: unknown): { botId: string } {
  if (!isDynamicRecord(input) || !isString(input.botId) || input.botId.length === 0)
    throw new Error("Choose an agent.");
  return { botId: input.botId };
}

export function parseSearchMentionsInput(input: unknown): Required<SearchMentionsInput> {
  const { botId } = parseBotIdInput(input);
  if (!isDynamicRecord(input) || !isString(input.q))
    throw new Error("The mention search needs some text (it may be empty).");
  const q = input.q.replace(/^@/, "").trim();
  if (q.length > COMPOSER_LIMITS.mentionQuery)
    throw new Error(`A mention search has at most ${COMPOSER_LIMITS.mentionQuery} characters.`);
  let limit: number = COMPOSER_LIMITS.mentions;
  if (input.limit !== undefined) {
    if (
      !isNumber(input.limit) ||
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > COMPOSER_LIMITS.mentions
    ) {
      throw new Error(`The limit is a whole number from 1 to ${COMPOSER_LIMITS.mentions}.`);
    }
    limit = input.limit;
  }
  return { botId, q, limit };
}

/** The slash commands that start with what the person typed after the slash, program ones first, then skills, each group by name. */
export function filterSlashCommands(commands: readonly SlashCommand[], typed: string): SlashCommand[] {
  const word = typed.replace(/^\//, "").toLowerCase();
  return commands
    .filter((command) => command.name.startsWith(word))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "program" ? -1 : 1));
}

/** Cuts a side answer to the limit, with a note (the engine never sends more to the window). */
export function clipSideAnswer(answer: string): string {
  if (answer.length <= COMPOSER_LIMITS.sideAnswer) return answer;
  return `${answer.slice(0, COMPOSER_LIMITS.sideAnswer)}\n\n[The answer was cut here.]`;
}

export function isSideQuestionState(value: unknown): value is SideQuestionState {
  return (
    isDynamicRecord(value) &&
    isString(value.questionId) &&
    isString(value.botId) &&
    (value.threadId === null || isString(value.threadId)) &&
    isString(value.question) &&
    isOneOf(SIDE_QUESTION_STATUSES, value.status) &&
    isString(value.answer) &&
    (value.error === null || isString(value.error)) &&
    isString(value.startedAt)
  );
}

export function isSideQuestionChanged(
  value: unknown,
): value is SideQuestionChanged & { type: "side-question-changed" } {
  return isDynamicRecord(value) && value.type === "side-question-changed" && isSideQuestionState(value.state);
}

export function isSlashCommand(value: unknown): value is SlashCommand {
  return (
    isDynamicRecord(value) &&
    isString(value.name) &&
    COMMAND_NAME.test(value.name) &&
    isString(value.hint) &&
    isOneOf(SLASH_COMMAND_KINDS, value.kind)
  );
}

export function isMentionCandidate(value: unknown): value is MentionCandidate {
  return (
    isDynamicRecord(value) &&
    isOneOf(MENTION_KINDS, value.kind) &&
    isString(value.id) &&
    isString(value.label) &&
    value.label.length > 0 &&
    isString(value.detail)
  );
}
