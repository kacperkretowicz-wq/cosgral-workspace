// COSGRAL W8-BE2: the isolation of processes for Storybook and the preview. Demo data only. The same rules as the program:
// what is in force comes from `isolationFor` (what the computer can do, what the provider runs, the person's switch); turning
// isolation on is immediate; turning it OFF opens a card and changes nothing until it is allowed. `setAvailability` plays a
// computer that cannot isolate, `pendingOffs`, `allowOff`, `denyOff` play the card of "Needs you".

import {
  type AgentEvent,
  type AgentIsolation,
  type IsolationAvailability,
  type IsolationChanged,
  type IsolationDesktopApi,
  isolationFor,
  isolationOffCard,
} from "@openbot/contracts/ipc";

export interface MockOff {
  requestId: string;
  botId: string;
  title: string;
  preview: string;
}

export interface MockIsolation extends Required<IsolationDesktopApi> {
  pendingOffs: () => MockOff[];
  allowOff: (requestId: string) => AgentIsolation;
  denyOff: (requestId: string) => AgentIsolation;
  /** What this computer can do (the demo starts with a computer that can do a Job Object and an AppContainer). */
  setAvailability: (availability: IsolationAvailability) => void;
}

export function demoAvailability(): IsolationAvailability {
  return {
    checkedAt: "2026-11-16T12:00:00.000Z",
    mechanism: "app-container-job",
    jobObject: { ok: true, reason: null },
    appContainer: { ok: true, reason: null },
    windows: "10.0.19045",
  };
}

/** `providers` says whether the provider of each agent starts a program of its own per conversation (Claude: true; Codex: false). */
export function createMockIsolation(
  emit: (event: AgentEvent) => void,
  agents: Record<string, { name: string; ownProcesses: boolean }> = {},
): MockIsolation {
  let availability = demoAvailability();
  const switches = new Map<string, boolean>();
  const offs = new Map<string, MockOff>();
  let counter = 0;
  const of = (botId: string): AgentIsolation =>
    isolationFor({
      botId,
      enabled: switches.get(botId) ?? true,
      availability,
      ownProcesses: agents[botId]?.ownProcesses ?? true,
    });
  const all = (): AgentIsolation[] => Object.keys(agents).map(of);
  const picture = (): IsolationChanged => ({ availability: structuredClone(availability), agents: all() });
  const publish = () => emit({ type: "isolation-changed", ...picture() });

  return {
    getAvailability: async () => structuredClone(availability),
    list: async () => all(),
    get: async ({ botId }) => of(botId),
    recheck: async () => {
      publish();
      return structuredClone(availability);
    },
    setEnabled: async ({ botId, enabled }) => {
      const current = switches.get(botId) ?? true;
      if (enabled === current) return { isolation: of(botId), offRequested: false };
      if (enabled) {
        switches.set(botId, true);
        publish();
        return { isolation: of(botId), offRequested: false };
      }
      if ([...offs.values()].some((off) => off.botId === botId)) {
        throw new Error("A request to turn off isolation for this agent already waits for you.");
      }
      counter += 1;
      const card = isolationOffCard({ agentName: agents[botId]?.name ?? botId });
      offs.set(`off-${counter}`, { requestId: `off-${counter}`, botId, ...card });
      return { isolation: of(botId), offRequested: true };
    },
    pendingOffs: () => [...offs.values()].map((off) => structuredClone(off)),
    allowOff: (requestId) => {
      const off = offs.get(requestId);
      if (!off) throw new Error("This card is already decided or no longer open.");
      offs.delete(requestId);
      switches.set(off.botId, false);
      publish();
      return of(off.botId);
    },
    denyOff: (requestId) => {
      const off = offs.get(requestId);
      if (!off) throw new Error("This card is already decided or no longer open.");
      offs.delete(requestId);
      return of(off.botId);
    },
    setAvailability: (next) => {
      availability = structuredClone(next);
      publish();
    },
  };
}
