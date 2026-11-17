// COSGRAL W11 (BE-B): the agent cards for Storybook and the preview. Demo data only; nothing is contacted. The same rules as the
// program: choices are checked, steerSupported is a fact of the provider (never set by the person), a change is sent as an event.
// `simulate.setSteerSupported` plays an agent whose provider cannot steer.

import {
  AGENT_CARD_IDS,
  AGENT_TEMPLATE_LIMITS,
  type AgentCardDetails,
  type AgentCardId,
  type AgentCardsDesktopApi,
  type AgentCardsOverview,
  type AgentEvent,
  type AgentPreferences,
  type AgentPublishDetails,
  applyAgentPreferenceChanges,
  defaultAgentPreferences,
  defaultNotificationPreferences,
  parseAgentCardDetailsInput,
  parseAgentCardsBotInput,
  parsePublishAgentTemplateInput,
  parseUnpublishAgentTemplateInput,
  parseUpdateAgentPreferencesInput,
} from "@openbot/contracts/ipc";

const DEMO_COUNTS: Record<AgentCardId, number | null> = {
  "chat-color": null,
  instructions: 1,
  memory: 12,
  skills: 3,
  files: 7,
  tables: 2,
  routines: 1,
  usage: null,
  publish: null,
  permissions: null,
  advanced: null,
  folders: 2,
  notifications: null,
  "backup-models": 2,
};

export interface MockAgentCards extends Required<AgentCardsDesktopApi> {
  simulate: { setSteerSupported: (botId: string, supported: boolean) => void };
}

export function createMockAgentCards(emit: (event: AgentEvent) => void): MockAgentCards {
  const preferences = new Map<string, AgentPreferences>();
  /** botId -> the template saved from that agent. */
  const published = new Map<string, { id: string; name: string; summary: string; createdAt: string }>();
  const read = (botId: string): AgentPreferences => preferences.get(botId) ?? defaultAgentPreferences(botId);
  const overview = (botId: string): AgentCardsOverview => {
    const prefs = read(botId);
    const summaries: Record<AgentCardId, string> = {
      "chat-color": prefs.chatColor,
      instructions: "1 file",
      memory: "12 memories",
      skills: "3 skills",
      files: "7 files",
      tables: "2 tables",
      routines: "1 routine",
      usage: "No limit",
      publish: published.has(botId) ? "Saved as a template" : "Not saved as a template",
      permissions: "Ask first",
      advanced: prefs.busyMessage,
      folders: "2 folders",
      notifications: prefs.notificationLevel,
      "backup-models": "2 backup models",
    };
    return {
      botId,
      cards: AGENT_CARD_IDS.map((id) => ({
        id,
        available: true,
        count: DEMO_COUNTS[id],
        summary: summaries[id],
      })),
    };
  };
  const publish = (next: AgentPreferences): AgentPreferences => {
    preferences.set(next.botId, next);
    emit({ type: "agent-preferences-changed", preferences: structuredClone(next) });
    return structuredClone(next);
  };
  return {
    overview: async (raw) => overview(parseAgentCardsBotInput(raw).botId),
    getPreferences: async (raw) => structuredClone(read(parseAgentCardsBotInput(raw).botId)),
    updatePreferences: async (raw) => {
      const changes = parseUpdateAgentPreferencesInput(raw);
      return publish(applyAgentPreferenceChanges(read(changes.botId), changes));
    },
    resetSession: async (raw) => overview(parseAgentCardsBotInput(raw).botId),
    details: async (raw) => details(parseAgentCardDetailsInput(raw), read, published),
    publishTemplate: async (raw) => {
      const input = parsePublishAgentTemplateInput(raw);
      published.set(input.botId, {
        id: `template-${input.botId}`,
        name: input.name ?? input.botId,
        summary: input.summary ?? "",
        createdAt: "2026-11-17T12:00:00.000Z",
      });
      return publishState(input.botId, published);
    },
    unpublishTemplate: async (raw) => {
      const { botId } = parseUnpublishAgentTemplateInput(raw);
      published.delete(botId);
      return publishState(botId, published);
    },
    simulate: {
      setSteerSupported: (botId, supported) => void publish({ ...read(botId), steerSupported: supported }),
    },
  };
}

type Published = Map<string, { id: string; name: string; summary: string; createdAt: string }>;

function publishState(botId: string, published: Published): AgentPublishDetails {
  const template = published.get(botId) ?? null;
  return { card: "publish", template, savedTemplates: published.size, maxTemplates: AGENT_TEMPLATE_LIMITS.saved };
}

/** Demo detail of each card (the same shapes as the program). */
function details(
  input: { botId: string; card: AgentCardDetails["card"] },
  read: (botId: string) => AgentPreferences,
  published: Published,
): AgentCardDetails {
  switch (input.card) {
    case "files":
      return {
        card: "files",
        items: [
          { id: "f-1", name: "launch-plan.md", size: 4_096, origin: "agent", createdAt: "2026-11-17T09:00:00.000Z" },
          { id: "f-2", name: "sources.csv", size: 18_220, origin: "agent", createdAt: "2026-11-16T15:30:00.000Z" },
        ],
        total: 2,
        truncated: false,
      };
    case "folders":
      return {
        card: "folders",
        workspace: "C:/Demo/Agents/chief",
        level: "ask-first",
        additional: ["C:/Demo/Projects"],
        excluded: ["C:/Demo/Private"],
      };
    case "usage":
      return {
        card: "usage",
        status: {
          scope: { kind: "agent", botId: input.botId },
          budget: null,
          usage: {
            periodStart: "2026-11-01T00:00:00.000Z",
            periodEnd: "2026-12-01T00:00:00.000Z",
            tokens: 182_400,
            turns: 41,
            costUsd: 0,
            pricedTurns: 0,
            costComplete: false,
          },
          state: "ok",
          tokenPercent: null,
          costPercent: null,
          blocked: false,
          reason: null,
          enforceable: true,
        },
      };
    case "publish":
      return publishState(input.botId, published);
    case "advanced":
      return { card: "advanced", preferences: read(input.botId), hasSession: true, messages: 24 };
    case "notifications":
      return {
        card: "notifications",
        level: read(input.botId).notificationLevel,
        muted: false,
        matrix: defaultNotificationPreferences().matrix,
      };
  }
}
