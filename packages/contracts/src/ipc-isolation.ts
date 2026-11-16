// COSGRAL W8-BE2: isolation of the processes of an agent on Windows (spec-w8.md 1B, W8-09…14; decisions Q1, Q2; G5).
//
// What this computer can do is checked, not assumed (`IsolationAvailability`): a Job Object (a cap on the number of processes
// and "everything ends with its program") and an AppContainer (a process that sees only the folders it was granted). Neither
// needs the administrator. What is IN FORCE for an agent is `AgentIsolation`:
// - "active": the agent has processes of its own (Claude Code, one per conversation) and they run inside a Job Object;
// - "shared-process": the agent's provider runs ONE program for all agents (Codex), so it cannot be isolated for this agent
//   alone: the access level (sandbox of the CLI, refusals of the program) is what holds, not a wall of the system;
// - "unavailable": isolation is on for this agent but this computer cannot do it. Then the file and shell tools of an agent
//   below "full" are REFUSED with a reason (Q2): the program never goes on silently with a wide disk;
// - "off": the person turned it off for this agent (turning it off is a card in "Needs you", like raising an access level).
// The AppContainer wall exists in the helper and is tested, but this program does not start an agent's processes in it yet:
// that needs a run with the real CLIs and their folders (the G5 test on a machine of the owner). `mechanism` says what is applied.
//
// This computer only.

import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const ISOLATION_STATES = ["active", "shared-process", "unavailable", "off"] as const;
export type IsolationState = (typeof ISOLATION_STATES)[number];

/** What is applied to the processes of the agent: nothing, a Job Object, or an AppContainer inside a Job Object. */
export const ISOLATION_MECHANISMS = ["none", "job-object", "app-container-job"] as const;
export type IsolationMechanism = (typeof ISOLATION_MECHANISMS)[number];

/** The cap on processes of one agent's program (with everything it starts); generous so that builds are not stopped. */
export const ISOLATION_MAX_PROCESSES = 512;

export interface IsolationCapability {
  ok: boolean;
  /** Why not, in a plain sentence (null when ok). */
  reason: string | null;
}

export interface IsolationAvailability {
  /** When this computer was checked; null: not checked yet. */
  checkedAt: string | null;
  /** The best the program can apply on this computer. */
  mechanism: IsolationMechanism;
  jobObject: IsolationCapability;
  appContainer: IsolationCapability;
  /** e.g. "10.0.19045"; null when not Windows or unknown. */
  windows: string | null;
}

export interface AgentIsolation {
  botId: string;
  /** The person's switch. On by default. */
  enabled: boolean;
  state: IsolationState;
  mechanism: IsolationMechanism;
  /** One plain sentence about the state ("shared-process", "unavailable", "off" always say why); null when "active". */
  reason: string | null;
  /** The cap on processes in force; null when none. */
  maxProcesses: number | null;
}

export interface IsolationAgentInput {
  botId: string;
}

export interface SetIsolationEnabledInput {
  botId: string;
  enabled: boolean;
}

export interface SetIsolationEnabledResult {
  isolation: AgentIsolation;
  /** True when a card was opened for the person (turning it off): follow `isolation-changed`. */
  offRequested: boolean;
}

/** `window.openbot.isolation` (this computer only). Changes come as the event `isolation-changed`. */
export interface IsolationDesktopApi {
  getAvailability: () => Promise<IsolationAvailability>;
  list: () => Promise<AgentIsolation[]>;
  get: (input: IsolationAgentInput) => Promise<AgentIsolation>;
  /** Turning it on is done at once. Turning it off opens a confirm card in "Needs you" and changes nothing until it is allowed. */
  setEnabled: (input: SetIsolationEnabledInput) => Promise<SetIsolationEnabledResult>;
  /** Checks this computer again (after a Windows update, for instance). */
  recheck: () => Promise<IsolationAvailability>;
}

/** Event `isolation-changed`: the whole picture (what this computer can do, and every agent). */
export interface IsolationChanged {
  availability: IsolationAvailability;
  agents: AgentIsolation[];
}

// --- rules shared by the engine, the mock and the window ---

export function isolationOffCard(input: { agentName: string }): { title: string; preview: string } {
  return {
    title: `Turn off isolation for ${input.agentName}?`,
    preview: [
      `${input.agentName} will no longer have its processes limited (a cap on how many it may start, and everything ending with it).`,
      "Its access level and the folders you excluded still apply.",
      "Allow to turn it off. Cancel keeps it on.",
    ].join("\n"),
  };
}

export function defaultAvailability(): IsolationAvailability {
  return {
    checkedAt: null,
    mechanism: "none",
    jobObject: { ok: false, reason: "Not checked yet." },
    appContainer: { ok: false, reason: "Not checked yet." },
    windows: null,
  };
}

/**
 * What is in force for one agent, from what the computer can do, what the provider of the agent runs and the person's switch.
 * `ownProcesses` is true for a provider that starts a program per conversation of the agent (Claude); false for one shared
 * by every agent (Codex).
 */
export function isolationFor(input: {
  botId: string;
  enabled: boolean;
  availability: IsolationAvailability;
  ownProcesses: boolean;
}): AgentIsolation {
  const { botId, enabled, availability, ownProcesses } = input;
  if (!enabled) {
    return {
      botId,
      enabled,
      state: "off",
      mechanism: "none",
      reason: "Isolation is off for this agent. Its access level and excluded folders still apply.",
      maxProcesses: null,
    };
  }
  if (!availability.jobObject.ok) {
    return {
      botId,
      enabled,
      state: "unavailable",
      mechanism: "none",
      reason: `${availability.jobObject.reason ?? "This computer cannot isolate processes."} Disk tools of this agent are refused below Full access.`,
      maxProcesses: null,
    };
  }
  if (!ownProcesses) {
    return {
      botId,
      enabled,
      state: "shared-process",
      mechanism: "none",
      reason:
        "This agent's provider runs one program for every agent, so it cannot be isolated for this agent alone. Its access level and the sandbox of that program hold instead.",
      maxProcesses: null,
    };
  }
  return {
    botId,
    enabled,
    state: "active",
    mechanism: "job-object",
    reason: null,
    maxProcesses: ISOLATION_MAX_PROCESSES,
  };
}

/** Whether the file and shell tools of the agent are refused (Q2): isolation is on, cannot be done, and the level is not "full". */
export function isolationRefusesDiskTools(
  isolation: AgentIsolation,
  level: "working-folder" | "ask-first" | "full",
): boolean {
  return isolation.state === "unavailable" && level !== "full";
}

// --- guards and parsers ---

function isCapability(value: unknown): value is IsolationCapability {
  return isDynamicRecord(value) && isBoolean(value.ok) && (value.reason === null || isString(value.reason));
}

export function isIsolationAvailability(value: unknown): value is IsolationAvailability {
  return (
    isDynamicRecord(value) &&
    (value.checkedAt === null || isString(value.checkedAt)) &&
    isOneOf(ISOLATION_MECHANISMS, value.mechanism) &&
    isCapability(value.jobObject) &&
    isCapability(value.appContainer) &&
    (value.windows === null || isString(value.windows))
  );
}

export function isAgentIsolation(value: unknown): value is AgentIsolation {
  return (
    isDynamicRecord(value) &&
    isString(value.botId) &&
    isBoolean(value.enabled) &&
    isOneOf(ISOLATION_STATES, value.state) &&
    isOneOf(ISOLATION_MECHANISMS, value.mechanism) &&
    (value.reason === null || isString(value.reason)) &&
    (value.maxProcesses === null || isNumber(value.maxProcesses))
  );
}

export function isAgentIsolationList(value: unknown): value is AgentIsolation[] {
  return Array.isArray(value) && value.every(isAgentIsolation);
}

export function isSetIsolationEnabledResult(value: unknown): value is SetIsolationEnabledResult {
  return isDynamicRecord(value) && isAgentIsolation(value.isolation) && isBoolean(value.offRequested);
}

export function isIsolationChanged(value: unknown): value is IsolationChanged & { type: "isolation-changed" } {
  return (
    isDynamicRecord(value) &&
    value.type === "isolation-changed" &&
    isIsolationAvailability(value.availability) &&
    isAgentIsolationList(value.agents)
  );
}

function botIdOf(value: unknown): string {
  if (!isString(value) || value.length === 0 || value.length > 200) throw new Error("Choose an agent.");
  return value;
}

export function parseIsolationAgentInput(value: unknown): IsolationAgentInput {
  if (!isDynamicRecord(value)) throw new Error("Expected an object.");
  return { botId: botIdOf(value.botId) };
}

export function parseSetIsolationEnabledInput(value: unknown): SetIsolationEnabledInput {
  if (!isDynamicRecord(value)) throw new Error("Expected an object.");
  if (!isBoolean(value.enabled)) throw new Error("Say whether isolation is on or off.");
  return { botId: botIdOf(value.botId), enabled: value.enabled };
}
