// @vitest-environment node
// COSGRAL W12 (BE-K): the service of delete with undo, with a small fake of the thread store and of time: what it announces, when it
// removes a thread for good, and that a removal that fails is tried again.

import {
  type AgentEvent,
  newPendingThreadDelete,
  type PendingThreadDelete,
  pendingDeleteExpired,
  type ThreadList,
} from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { ThreadUndoService } from "./thread-undo";

function setup() {
  let now = new Date("2026-11-17T01:00:00.000Z");
  const pending: PendingThreadDelete[] = [];
  const events: AgentEvent[] = [];
  const purged: string[] = [];
  const timers: { ms: number; run: () => void; stopped: boolean }[] = [];
  const state = { purgeFails: false };
  const emptyList = (botId: string): ThreadList => ({ botId, activeThreadId: null, threads: [] });
  const service = new ThreadUndoService({
    threads: {
      hide: async (input) => {
        const item = newPendingThreadDelete(
          { botId: input.botId, threadId: input.threadId, title: "T", wasActive: false },
          now,
        );
        pending.push(item);
        return { list: emptyList(input.botId), pending: item };
      },
      unhide: async (input) => {
        const index = pending.findIndex((item) => item.threadId === input.threadId);
        if (index < 0) throw new Error("There is nothing to undo for this thread.");
        pending.splice(index, 1);
        return emptyList(input.botId);
      },
      listPending: (botId) =>
        pending.filter((item) => (botId === undefined || item.botId === botId) && !pendingDeleteExpired(item, now)),
      expiredPending: () => pending.filter((item) => pendingDeleteExpired(item, now)),
    },
    purge: async (botId, threadId) => {
      if (state.purgeFails) throw new Error("A turn is running in this thread. Stop it first.");
      purged.push(`${botId}/${threadId}`);
      pending.splice(
        pending.findIndex((item) => item.threadId === threadId),
        1,
      );
    },
    changed: (botId, list) => {
      events.push({ type: "threads-changed", ...list, botId });
      return list;
    },
    emit: (event) => events.push(event),
    after: (ms, run) => {
      const timer = { ms, run, stopped: false };
      timers.push(timer);
      return () => {
        timer.stopped = true;
      };
    },
    now: () => now,
  });
  return {
    service,
    events,
    purged,
    timers,
    state,
    pending,
    advance: (minutes: number) => {
      now = new Date(now.getTime() + minutes * 60_000);
    },
  };
}

const input = { botId: "chief", threadId: "t-1", confirm: true } as const;

describe("ThreadUndoService (W12 BE-K)", () => {
  it("hides a thread, tells the window twice (the list and the threads that can come back) and sets a timer for the end of the window", async () => {
    const { service, events, timers } = setup();
    const result = await service.delete(input);
    expect(result.pending).toMatchObject({ botId: "chief", threadId: "t-1", expiresAt: "2026-11-17T01:10:00.000Z" });
    expect(events.map((event) => event.type)).toEqual(["threads-changed", "thread-deletes-changed"]);
    expect(events[1]).toMatchObject({ botId: "chief", pending: [{ threadId: "t-1" }] });
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBe(600_050);
    expect(service.list({ botId: "chief" })).toHaveLength(1);
  });

  it("brings a thread back and announces that the list is shorter", async () => {
    const { service, events } = setup();
    await service.delete(input);
    events.length = 0;
    await service.undo({ botId: "chief", threadId: "t-1" });
    expect(events.map((event) => event.type)).toEqual(["threads-changed", "thread-deletes-changed"]);
    expect(events[1]).toMatchObject({ pending: [] });
    await expect(service.undo({ botId: "chief", threadId: "t-1" })).rejects.toThrow("nothing to undo");
  });

  it("removes the thread for good when the timer fires after the window", async () => {
    const { service, purged, timers, advance, events } = setup();
    await service.delete(input);
    advance(10);
    timers[0]?.run();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(purged).toEqual(["chief/t-1"]);
    expect(events.at(-1)).toMatchObject({ type: "thread-deletes-changed", botId: "chief", pending: [] });
    expect(service.list({ botId: "chief" })).toEqual([]);
  });

  it("does not remove a thread before its time", async () => {
    const { service, purged, advance } = setup();
    await service.delete(input);
    advance(5);
    await service.sweep();
    expect(purged).toEqual([]);
    expect(service.list({ botId: "chief" })).toHaveLength(1);
  });

  it("tries again later when the removal fails (a turn still runs there)", async () => {
    const { service, purged, timers, state, advance } = setup();
    await service.delete(input);
    advance(11);
    state.purgeFails = true;
    await service.sweep();
    expect(purged).toEqual([]);
    expect(timers.at(-1)?.ms).toBe(60_000);
    state.purgeFails = false;
    await service.sweep();
    expect(purged).toEqual(["chief/t-1"]);
  });

  it("at the start removes what ran out of time while the program was closed and sets a timer for the rest", async () => {
    const { service, purged, timers, advance, pending } = setup();
    await service.delete(input);
    await service.delete({ botId: "chief", threadId: "t-2", confirm: true });
    const second = pending.find((item) => item.threadId === "t-2");
    if (second) second.expiresAt = "2026-11-17T01:30:00.000Z";
    timers.length = 0;
    advance(15);
    await service.start();
    expect(purged).toEqual(["chief/t-1"]);
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBe(15 * 60_000 + 50);
  });

  it("stops its timers when it is disposed, and refuses a delete without confirmation", async () => {
    const { service, timers } = setup();
    await service.delete(input);
    service.dispose();
    expect(timers.every((timer) => timer.stopped)).toBe(true);
    await expect(
      service.delete(JSON.parse(JSON.stringify({ botId: "chief", threadId: "t-1", confirm: false }))),
    ).rejects.toThrow("confirmation");
  });
});
