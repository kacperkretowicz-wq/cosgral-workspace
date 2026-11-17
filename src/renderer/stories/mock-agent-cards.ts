// COSGRAL W11 (BE-B): the agent cards for Storybook and the preview. Demo data only; nothing is contacted. The same rules as the
// program: choices are checked, steerSupported is a fact of the provider (never set by the person), a change is sent as an event.
// `simulate.setSteerSupported` plays an agent whose provider cannot steer.

import {
  AGENT_CARD_IDS,
  type AgentCardId,
  type AgentCardsDesktopApi,
  type AgentCardsOverview,
  type AgentEvent,
  type AgentPreferences,
  applyAgentPreferenceChanges,
  defaultAgentPreferences,
  parseAgentCardsBotInput,
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
      publish: "Not available in this build",
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
        available: id !== "publish",
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
    simulate: {
      setSteerSupported: (botId, supported) => void publish({ ...read(botId), steerSupported: supported }),
    },
  };
}
