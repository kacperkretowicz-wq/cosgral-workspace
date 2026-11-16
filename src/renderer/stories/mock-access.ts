// COSGRAL W8-BE1: the access levels for Storybook and the preview. Demo data only. The same rules as the program: every agent
// starts at "working-folder"; lowering a level is immediate; a RAISE opens a card and changes nothing until it is allowed (and
// can be denied); folders must be full paths; an excluded folder is forbidden at every level. `pendingRaises`, `allowRaise`,
// `denyRaise` play the card of "Needs you"; `deny` plays a refusal of the program (the event `access-denied`).

import {
  type AccessDenied,
  type AccessDesktopApi,
  type AccessLevel,
  type AgentAccess,
  type AgentEvent,
  accessFolderProblem,
  accessIsRaise,
  accessRaiseCard,
  defaultAgentAccess,
} from "@openbot/contracts/ipc";

export interface MockRaise {
  requestId: string;
  botId: string;
  from: AccessLevel;
  to: AccessLevel;
  title: string;
  preview: string;
}

export interface MockAccess extends Required<AccessDesktopApi> {
  /** The raises that wait for the person (the confirm cards of "Needs you"). */
  pendingRaises: () => MockRaise[];
  allowRaise: (requestId: string) => AgentAccess;
  denyRaise: (requestId: string) => AgentAccess;
  /** The program refuses something the agent asked for. */
  deny: (denial: Omit<AccessDenied, "message"> & { message?: string }) => void;
}

export function createMockAccess(
  emit: (event: AgentEvent) => void,
  botIds: readonly string[] = [],
  names: Record<string, string> = {},
): MockAccess {
  const access = new Map<string, AgentAccess>(botIds.map((id) => [id, defaultAgentAccess(id)]));
  const raises = new Map<string, MockRaise>();
  let counter = 0;
  let clock = Date.parse("2026-11-16T12:00:00.000Z");
  const now = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };
  const of = (botId: string): AgentAccess => {
    const known = access.get(botId) ?? defaultAgentAccess(botId);
    access.set(botId, known);
    return known;
  };
  const change = (botId: string, patch: Partial<AgentAccess>): AgentAccess => {
    const current = of(botId);
    Object.assign(current, patch, { updatedAt: now() });
    emit({ type: "access-changed", access: structuredClone(current) });
    return structuredClone(current);
  };

  return {
    get: async ({ botId }) => structuredClone(of(botId)),
    list: async () => [...access.values()].map((item) => structuredClone(item)),
    setFolders: async ({ botId, additionalFolders, excludedFolders }) => {
      for (const folder of [...(additionalFolders ?? []), ...(excludedFolders ?? [])]) {
        const problem = accessFolderProblem(folder);
        if (problem) throw new Error(problem);
      }
      return change(botId, {
        ...(additionalFolders ? { additionalFolders: [...additionalFolders] } : {}),
        ...(excludedFolders ? { excludedFolders: [...excludedFolders] } : {}),
      });
    },
    setLevel: async ({ botId, level }) => {
      const current = of(botId);
      if (level === current.level) return { access: structuredClone(current), raiseRequested: false };
      if (!accessIsRaise(current.level, level)) {
        return { access: change(botId, { level }), raiseRequested: false };
      }
      if ([...raises.values()].some((raise) => raise.botId === botId)) {
        throw new Error("A request to raise the access of this agent already waits for you.");
      }
      counter += 1;
      const card = accessRaiseCard({ agentName: names[botId] ?? botId, from: current.level, to: level });
      raises.set(`raise-${counter}`, { requestId: `raise-${counter}`, botId, from: current.level, to: level, ...card });
      return { access: structuredClone(current), raiseRequested: true };
    },
    pendingRaises: () => [...raises.values()].map((raise) => structuredClone(raise)),
    allowRaise: (requestId) => {
      const raise = raises.get(requestId);
      if (!raise) throw new Error("This card is already decided or no longer open.");
      raises.delete(requestId);
      return change(raise.botId, { level: raise.to, raisedAt: now() });
    },
    denyRaise: (requestId) => {
      const raise = raises.get(requestId);
      if (!raise) throw new Error("This card is already decided or no longer open.");
      raises.delete(requestId);
      return structuredClone(of(raise.botId));
    },
    deny: (denial) => {
      emit({
        type: "access-denied",
        ...denial,
        message: denial.message ?? "This agent may only work in its working folder.",
      });
    },
  };
}
