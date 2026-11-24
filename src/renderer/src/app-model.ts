import type { AgentStatus, HostStatus, TeamPresenceSnapshot, UpdateStatus } from "@openbot/contracts/ipc";
import { createStore } from "solid-js";
import type { BotMessage, BotProfile } from "./data";

/** Fallback snapshots, layout sizes, the per-item stores and the onboarding agent profiles used by the app shell. */

export const FALLBACK_STATUS: AgentStatus = {
  phase: "starting",
  cliVersion: null,
  auth: { kind: "unknown" },
  providers: [
    { id: "codex", state: "not-started", version: null, message: null },
    { id: "claude", state: "not-started", version: null, message: null },
  ],
  capabilities: {
    chat: "unavailable",
    browser: "unavailable",
    computerUse: "unavailable",
  },
  message: "Starting local agent CLIs…",
  fullAccess: true,
};

export const FALLBACK_UPDATE_STATUS: UpdateStatus = {
  phase: "unsupported",
  currentVersion: "",
  availableVersion: null,
  progress: null,
  checkedAt: null,
  message: null,
};

export const FALLBACK_HOST_STATUS: HostStatus = {
  phase: "unconfigured",
  configured: false,
  enabledOnLaunch: false,
  serverId: null,
  serverName: null,
  apiUrl: null,
  vncHostname: null,
  apiOnline: false,
  vncOnline: false,
  remoteDesktopCredentialConfigured: false,
  message: null,
};

export const EMPTY_TEAM_PRESENCE: TeamPresenceSnapshot = {
  serverId: null,
  members: [],
  updatedAt: "",
};

export const LEFT_PANEL_STORAGE_KEY = "openbot:left-panel-width";
export const LEFT_PANEL_COLLAPSED_STORAGE_KEY = "openbot:left-panel-collapsed";
export const LEFT_PANEL_DEFAULT = 280;
export const LEFT_PANEL_MIN = 240;
export const AUTH_SUCCESS_HOLD_MS = 600;
export const LEFT_PANEL_MAX = 400;
export const LEFT_PANEL_COMPACT = 88;
export const LEFT_PANEL_COLLAPSE_THRESHOLD = 210;
export const LEFT_PANEL_EXPAND_THRESHOLD = 220;
export const CONVERSATION_MIN_WIDTH = 424;
export const MAC_SERVER_RAIL_WIDTH = 72;
export const SERVER_RAIL_WIDTH = 64;
export const NARROW_SERVER_RAIL_WIDTH = 56;
export const PAGE_RAIL_WIDTH = 54;

type StoredValue = BotProfile | BotMessage;
type StoredSetter = (value: StoredValue) => void;

const storeSetters = new WeakMap<object, StoredSetter>();

function isBotProfile(value: StoredValue): value is BotProfile {
  return "avatarSeed" in value;
}

export function createStoredProfile(value: BotProfile): BotProfile {
  const initial = Object.assign({}, value);
  const [store, setStore] = createStore(initial);
  storeSetters.set(store, (next) => {
    if (isBotProfile(next)) setStore(() => next);
  });
  return store;
}

export function createStoredMessage(value: BotMessage): BotMessage {
  const initial = Object.assign({}, value);
  const [store, setStore] = createStore(initial);
  storeSetters.set(store, (next) => {
    if (!isBotProfile(next)) setStore(() => next);
  });
  return store;
}

export function updateStored(store: StoredValue, value: StoredValue): void {
  storeSetters.get(store)?.(value);
}

export const ONBOARDING_PROFILES: Record<string, { role: string; description: string; firstMessage: string }> = {
  "Work & projects": {
    role: "Work & projects",
    description:
      "Helps plan, organize, and execute ongoing work and projects while keeping priorities, next steps, and deliverables clear.",
    firstMessage: "Focus on my work and projects. Help me plan, organize, and execute them proactively.",
  },
  "Research & writing": {
    role: "Research & writing",
    description: "Researches topics, synthesizes reliable sources, and helps draft, edit, and refine clear writing.",
    firstMessage:
      "Focus on research and writing. Help me investigate topics and turn the findings into clear, useful writing.",
  },
  "Sales & outreach": {
    role: "Sales & outreach",
    description: "Supports prospect research, sales preparation, personalized outreach, and organized follow-up work.",
    firstMessage:
      "Focus on sales and outreach. Help me research prospects, prepare personalized outreach, and manage follow-ups.",
  },
};

/** A position past the end: the backend puts the folder or agent last. */
export const LAST_POSITION = 1_000_000;
