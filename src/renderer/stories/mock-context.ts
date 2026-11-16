// COSGRAL W6-BE2: the conversation context for Storybook and the preview. Demo data only. The same rules as the program:
// no number without a report ("unavailable" with a reason), a compaction keeps the old numbers marked stale until the next
// report, compaction is refused for a provider that cannot be asked. `simulate` lets a story report usage, set a provider
// that reports nothing, or finish a compaction.

import {
  type AgentEvent,
  applyContextSettings,
  type ContextDesktopApi,
  type ContextSettings,
  type ContextState,
  type ContextThreadInput,
  contextPercent,
  contextWarning,
  defaultContextSettings,
  unavailableContextState,
} from "@openbot/contracts/ipc";

export interface MockContext extends Required<ContextDesktopApi> {
  simulate: {
    /** The provider reported tokens: the numbers become "reported", a stale mark and a running compaction end. */
    report: (botId: string, threadId: string, used: number, limit: number) => void;
    /** A provider that reports nothing (and, if `canCompact` is false, cannot be asked to compact). */
    silent: (botId: string, threadId: string, reason: string, canCompact: boolean) => void;
    /** The running compaction ended: the old numbers stay, marked stale. */
    finishCompaction: (botId: string, threadId: string) => void;
  };
}

export function createMockContext(
  emit: (event: AgentEvent) => void,
  activeThreadOf: (botId: string) => string = (botId) => `${botId}-thread-1`,
): MockContext {
  const states = new Map<string, ContextState>();
  let settings: ContextSettings = defaultContextSettings();
  let clock = Date.parse("2026-11-16T12:00:00.000Z");
  const now = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };
  const key = (botId: string, threadId: string) => `${botId}\u0000${threadId}`;
  const resolve = (input: ContextThreadInput) => ({
    botId: input.botId,
    threadId: input.threadId ?? activeThreadOf(input.botId),
  });
  const read = (botId: string, threadId: string): ContextState =>
    states.get(key(botId, threadId)) ??
    unavailableContextState(botId, threadId, "No usage has been reported for this thread yet.", true);
  const write = (state: ContextState): ContextState => {
    states.set(key(state.botId, state.threadId), state);
    emit({ type: "context-changed", ...state });
    return state;
  };

  return {
    getState: async (input) => {
      const { botId, threadId } = resolve(input);
      return read(botId, threadId);
    },
    compact: async (input) => {
      const { botId, threadId } = resolve(input);
      const state = read(botId, threadId);
      if (!state.canCompact) throw new Error("This agent's provider compacts its own context; it cannot be asked to.");
      if (state.source === "unavailable")
        throw new Error("There is nothing to compact yet: no usage has been reported.");
      if (state.compacting) return state;
      return write({ ...state, compacting: true });
    },
    getSettings: async () => settings,
    updateSettings: async (input) => {
      settings = applyContextSettings(settings, input);
      emit({ type: "context-settings-changed", ...settings });
      return settings;
    },
    simulate: {
      report: (botId, threadId, used, limit) => {
        const before = read(botId, threadId);
        const percent = contextPercent(used, limit);
        write({
          ...before,
          source: "reported",
          used,
          limit,
          percent,
          unavailableReason: null,
          warning: contextWarning(percent),
          compacting: false,
          stale: false,
          updatedAt: now(),
        });
      },
      silent: (botId, threadId, reason, canCompact) =>
        void write(unavailableContextState(botId, threadId, reason, canCompact)),
      finishCompaction: (botId, threadId) => {
        const before = read(botId, threadId);
        if (!before.compacting) return;
        write({
          ...before,
          compacting: false,
          stale: true,
          compactions: before.compactions + 1,
          lastCompactedAt: now(),
          lastCompactedFromTokens: before.used,
        });
      },
    },
  };
}
