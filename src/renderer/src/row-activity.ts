// COSGRAL W1: what an agent row in the sidebar shows.
//
// The backend sends one `AgentActivity` per agent (waiting, working, limited, error, idle).
// Unread replies and "Responded" are renderer-only. A non-idle backend state wins over
// "Responded" and unread; local signals (open cards, a running turn) fill in before the
// backend has reported.

import type { AgentActivity, ChannelMessage, ChannelTask } from "@openbot/contracts/ipc";
import type { AvatarMood } from "./blobatar";
import { language, t } from "./i18n";

export type SidebarAgentState =
  | { kind: "working" }
  | { kind: "responded" }
  | { kind: "unread"; count: number }
  | { kind: "needs-you" }
  /** The provider account is at its usage limit. `resetsAt` is Unix seconds, null when unknown. */
  | { kind: "limited"; resetsAt: number | null }
  | { kind: "error"; message: string };

const ERROR_MESSAGE_LIMIT = 80;

function shortMessage(message: string): string {
  const line = message.split(/\r?\n/).find((part) => part.trim().length > 0) ?? "";
  const trimmed = line.trim();
  return trimmed.length > ERROR_MESSAGE_LIMIT ? `${trimmed.slice(0, ERROR_MESSAGE_LIMIT - 1)}…` : trimmed;
}

/** Highest priority first: needs you, working, limit, error, then unread and responded. */
export function rowStateFor(input: {
  activity: AgentActivity | undefined;
  /** A question or approval of this agent is open in this window. */
  localNeedsYou: boolean;
  /** A turn or a delivery of this agent is running in this window. */
  localWorking: boolean;
  unread: number;
  responded: boolean;
}): SidebarAgentState | undefined {
  const kind = input.activity?.kind;
  if (kind === "waiting" || input.localNeedsYou) return { kind: "needs-you" };
  if (kind === "working" || input.localWorking) return { kind: "working" };
  if (kind === "limited") return { kind: "limited", resetsAt: input.activity?.limit?.resetsAt ?? null };
  if (kind === "error") {
    return { kind: "error", message: shortMessage(input.activity?.error?.message ?? "") || "Something went wrong." };
  }
  if (input.unread > 0) return { kind: "unread", count: input.unread };
  if (input.responded) return { kind: "responded" };
  return undefined;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function localTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function sameDay(left: Date, right: Date): boolean {
  return left.toDateString() === right.toDateString();
}

/** "Limit · resumes 15:40" in local time; the weekday (or date, from a week on) when it is not today. */
export function formatLimitResume(resetsAt: number | null, now: Date = new Date()): string {
  if (resetsAt === null) return t("Limit reached");
  const reset = new Date(resetsAt * 1000);
  if (reset.getTime() <= now.getTime()) return t("Limit · resuming");
  if (sameDay(reset, now)) return t("Limit · resumes {time}", { time: localTime(reset) });
  const days = (reset.getTime() - now.getTime()) / 86_400_000;
  const locale = language() === "pl" ? "pl-PL" : "en-US";
  const day =
    days < 7
      ? new Intl.DateTimeFormat(locale, { weekday: "short" }).format(reset)
      : new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(reset);
  return t("Limit · resumes {day} {time}", { day, time: localTime(reset) });
}

export function sidebarAgentStateLabel(state: SidebarAgentState, now: Date = new Date()): string {
  switch (state.kind) {
    case "working":
      return t("Thinking");
    case "responded":
      return t("Responded");
    case "needs-you":
      return t("Needs you");
    case "limited":
      return formatLimitResume(state.resetsAt, now);
    case "error":
      return t("Error · {message}", { message: state.message });
    case "unread":
      return t(state.count === 1 ? "{count} new reply" : "{count} new replies", { count: state.count });
  }
}

/** A line that replaces the message preview in the row, for the states that need words. */
export function sidebarAgentStateNote(state: SidebarAgentState | undefined, now: Date = new Date()): string | null {
  return state && (state.kind === "limited" || state.kind === "error") ? sidebarAgentStateLabel(state, now) : null;
}

/** The creature's face for a row state: busy eyes, raised eyes, a smile, a sweat drop or a doze. */
export function avatarMoodFor(state: SidebarAgentState | undefined): AvatarMood {
  switch (state?.kind) {
    case "working":
      return "working";
    case "needs-you":
      return "needs-you";
    case "unread":
    case "responded":
      return "happy";
    case "error":
      return "error";
    case "limited":
      return "limited";
    default:
      return "idle";
  }
}

/** A channel member's face: what its open tasks in the channel say (a question for you, work, a failure). */
export function channelMemberMood(
  tasks: ReadonlyArray<Pick<ChannelTask, "ownerBotId" | "state" | "archivedAt" | "waitingForTaskIds">>,
  botId: string,
): AvatarMood {
  let mood: AvatarMood = "idle";
  for (const task of tasks) {
    if (task.ownerBotId !== botId || task.archivedAt) continue;
    if (task.state === "waiting" && !task.waitingForTaskIds?.length) return "needs-you";
    if (task.state === "running") mood = "working";
    else if (task.state === "failed" && mood === "idle") mood = "error";
  }
  return mood;
}

/** The face an agent's message carries: a question raises its brows, a result smiles. */
export function channelMessageMood(kind: ChannelMessage["kind"]): AvatarMood {
  return kind === "question" ? "needs-you" : kind === "result" ? "happy" : "idle";
}
