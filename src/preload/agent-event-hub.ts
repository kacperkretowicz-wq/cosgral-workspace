// COSGRAL W12 (BE-Z): one `ipcRenderer` listener for all the window's `agent.onEvent` subscribers. Before, every `onEvent` call added its
// own `ipcRenderer.on("agent:event")`, and a window with 11 or more subscribers made Electron warn about a possible memory leak
// (MaxListenersExceededWarning). Now the first subscriber adds the one listener, the last one removes it, and the events are handed on to a
// set of plain functions. The behaviour for the subscribers is the same: only events of the selected server, in the order they came.

export interface AgentEventSource<TPayload> {
  on(channel: string, handler: (event: unknown, payload: TPayload) => void): void;
  removeListener(channel: string, handler: (event: unknown, payload: TPayload) => void): void;
}

export interface ScopedEvent<TEvent> {
  serverId: string;
  event: TEvent;
}

export function createAgentEventHub<TEvent>(
  source: AgentEventSource<ScopedEvent<TEvent>>,
  channel: string,
  selectedServerId: () => string,
): { subscribe: (listener: (event: TEvent) => void) => () => void; size: () => number } {
  const listeners = new Set<(event: TEvent) => void>();
  const handler = (_event: unknown, payload: ScopedEvent<TEvent>): void => {
    if (payload.serverId !== selectedServerId()) return;
    // A copy: a subscriber may unsubscribe (or subscribe) while it is being told.
    for (const listener of [...listeners]) {
      if (!listeners.has(listener)) continue;
      try {
        listener(payload.event);
      } catch (error) {
        // One failing subscriber must not keep the others from the event (a plain emitter would stop at the first throw).
        console.error("An agent event subscriber failed:", error);
      }
    }
  };
  return {
    subscribe(listener) {
      if (listeners.size === 0) source.on(channel, handler);
      // Each call is its own subscription, even for the same function.
      const own = (event: TEvent) => listener(event);
      listeners.add(own);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        listeners.delete(own);
        if (listeners.size === 0) source.removeListener(channel, handler);
      };
    },
    size: () => listeners.size,
  };
}
