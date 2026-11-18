// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { type AgentEventSource, createAgentEventHub, type ScopedEvent } from "./agent-event-hub";

function fakeIpc() {
  const handlers = new Set<(event: unknown, payload: ScopedEvent<string>) => void>();
  const source: AgentEventSource<ScopedEvent<string>> = {
    on: (_channel, handler) => handlers.add(handler),
    removeListener: (_channel, handler) => handlers.delete(handler),
  };
  const emit = (payload: ScopedEvent<string>) => {
    for (const handler of [...handlers]) handler({}, payload);
  };
  return { source, handlers, emit };
}

describe("agent event hub (BE-Z)", () => {
  it("adds ONE ipc listener however many subscribers there are, and removes it with the last one", () => {
    const ipc = fakeIpc();
    const hub = createAgentEventHub(ipc.source, "agent:event", () => "local");
    expect(ipc.handlers.size).toBe(0);
    const off = Array.from({ length: 25 }, () => hub.subscribe(() => undefined));
    expect(ipc.handlers.size).toBe(1);
    expect(hub.size()).toBe(25);
    for (const stop of off.slice(0, 24)) stop();
    expect(ipc.handlers.size).toBe(1);
    off[24]?.();
    expect(ipc.handlers.size).toBe(0);
    expect(hub.size()).toBe(0);
    // A new subscriber after that adds the listener again.
    hub.subscribe(() => undefined);
    expect(ipc.handlers.size).toBe(1);
  });

  it("hands an event to every subscriber in order, only for the selected server (read when the event comes)", () => {
    const ipc = fakeIpc();
    let selected = "local";
    const hub = createAgentEventHub(ipc.source, "agent:event", () => selected);
    const seen: string[] = [];
    hub.subscribe((event) => seen.push(`a:${event}`));
    hub.subscribe((event) => seen.push(`b:${event}`));
    ipc.emit({ serverId: "local", event: "one" });
    ipc.emit({ serverId: "remote", event: "ignored" });
    selected = "remote";
    ipc.emit({ serverId: "remote", event: "two" });
    ipc.emit({ serverId: "local", event: "ignored too" });
    expect(seen).toEqual(["a:one", "b:one", "a:two", "b:two"]);
  });

  it("unsubscribing twice is harmless, and the same function can subscribe twice as two subscriptions", () => {
    const ipc = fakeIpc();
    const hub = createAgentEventHub(ipc.source, "agent:event", () => "local");
    const listener = vi.fn();
    const first = hub.subscribe(listener);
    const second = hub.subscribe(listener);
    ipc.emit({ serverId: "local", event: "x" });
    expect(listener).toHaveBeenCalledTimes(2);
    first();
    first();
    expect(hub.size()).toBe(1);
    ipc.emit({ serverId: "local", event: "y" });
    expect(listener).toHaveBeenCalledTimes(3);
    second();
    expect(ipc.handlers.size).toBe(0);
  });

  it("a subscriber that throws does not stop the others, and one that unsubscribes while being told is safe", () => {
    const ipc = fakeIpc();
    const hub = createAgentEventHub(ipc.source, "agent:event", () => "local");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const seen: string[] = [];
    hub.subscribe(() => {
      throw new Error("broken subscriber");
    });
    let stopSecond: () => void = () => undefined;
    stopSecond = hub.subscribe((event) => {
      seen.push(`second:${event}`);
      stopSecond();
    });
    hub.subscribe((event) => seen.push(`third:${event}`));
    ipc.emit({ serverId: "local", event: "one" });
    ipc.emit({ serverId: "local", event: "two" });
    expect(seen).toEqual(["second:one", "third:one", "third:two"]);
    expect(quiet).toHaveBeenCalledTimes(2);
    quiet.mockRestore();
  });
});
