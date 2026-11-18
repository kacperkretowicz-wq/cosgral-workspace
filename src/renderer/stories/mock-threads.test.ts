// @vitest-environment node
import { type AgentEvent, isThreadList } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockThreads } from "./mock-threads";

function setup() {
  const events: AgentEvent[] = [];
  const api = createMockThreads((event) => events.push(event));
  return { api, events };
}

describe("mock threads (W6-BE1)", () => {
  it("an agent starts with one active, empty thread and the list is valid", async () => {
    const { api } = setup();
    const list = await api.list({ botId: "chief" });
    expect(isThreadList(list)).toBe(true);
    expect(list.threads).toHaveLength(1);
    expect(list.threads[0]).toMatchObject({ title: "New thread", titled: false, state: "idle", active: true });
    expect(list.activeThreadId).toBe(list.threads[0]?.id);
  });

  it("a new thread becomes active and the old one stays; two agents never mix", async () => {
    const { api, events } = setup();
    const first = (await api.list({ botId: "chief" })).activeThreadId;
    const list = await api.create({ botId: "chief", title: "  Notes  " });
    expect(list.threads).toHaveLength(2);
    expect(list.threads.find((thread) => thread.title === "Notes")).toMatchObject({ titled: true, active: true });
    expect(list.threads.find((thread) => thread.id === first)?.active).toBe(false);
    expect(list.threads.filter((thread) => thread.active)).toHaveLength(1);
    expect((await api.list({ botId: "scout" })).threads).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: "threads-changed", botId: "chief" });
  });

  it("renames, and an empty title goes back to the automatic one", async () => {
    const { api } = setup();
    const id = (await api.list({ botId: "chief" })).activeThreadId ?? "";
    expect((await api.rename({ botId: "chief", threadId: id, title: " Launch " })).threads[0]).toMatchObject({
      title: "Launch",
      titled: true,
    });
    expect((await api.rename({ botId: "chief", threadId: id, title: "" })).threads[0]).toMatchObject({
      title: "New thread",
      titled: false,
    });
    await expect(api.rename({ botId: "chief", threadId: id, title: "x".repeat(121) })).rejects.toThrow(/at most 120/);
    await expect(api.rename({ botId: "chief", threadId: "nope", title: "x" })).rejects.toThrow(/Unknown thread/);
  });

  it("archiving the active thread moves on to the newest other one, or makes a new one; restore brings it back", async () => {
    const { api } = setup();
    const a = (await api.list({ botId: "chief" })).activeThreadId ?? "";
    const b = (await api.create({ botId: "chief", title: "B" })).activeThreadId ?? "";
    const afterB = await api.archive({ botId: "chief", threadId: b });
    expect(afterB.activeThreadId).toBe(a);
    expect(afterB.threads.find((thread) => thread.id === b)).toMatchObject({ state: "archived", active: false });
    await expect(api.select({ botId: "chief", threadId: b })).rejects.toThrow(/Restore the thread first/);
    // The only open thread is archived: a new empty one takes over.
    const afterA = await api.archive({ botId: "chief", threadId: a });
    expect(afterA.threads).toHaveLength(3);
    const active = afterA.threads.find((thread) => thread.active);
    expect(active).toMatchObject({ state: "idle", title: "New thread" });
    expect([a, b]).not.toContain(active?.id);
    const restored = await api.restore({ botId: "chief", threadId: b });
    expect(restored.threads.find((thread) => thread.id === b)).toMatchObject({ state: "idle", archivedAt: null });
    expect(restored.activeThreadId).toBe(active?.id);
  });

  it("deleting needs confirm: true, removes the thread, and keeps one active thread", async () => {
    const { api } = setup();
    const a = (await api.list({ botId: "chief" })).activeThreadId ?? "";
    const b = (await api.create({ botId: "chief", title: "B" })).activeThreadId ?? "";
    // @ts-expect-error the call without the flag must be refused
    await expect(api.delete({ botId: "chief", threadId: b })).rejects.toThrow(/confirmation/);
    const list = await api.delete({ botId: "chief", threadId: b, confirm: true });
    expect(list.threads.map((thread) => thread.id)).toEqual([a]);
    expect(list.activeThreadId).toBe(a);
    const alone = await api.delete({ botId: "chief", threadId: a, confirm: true });
    expect(alone.threads).toHaveLength(1);
    expect(alone.threads[0]?.id).not.toBe(a);
    expect(alone.activeThreadId).toBe(alone.threads[0]?.id);
  });

  it("a branch is a new active thread linked to its parent; deleting the parent keeps its name only", async () => {
    const { api } = setup();
    const a = (await api.list({ botId: "chief" })).activeThreadId ?? "";
    await api.rename({ botId: "chief", threadId: a, title: "Plan" });
    const list = await api.branch({ botId: "chief", threadId: a, fromMessageId: "m1" });
    const branch = list.threads.find((thread) => thread.active);
    expect(branch).toMatchObject({
      title: "Branch of Plan",
      titled: false,
      parentThreadId: a,
      parentTitle: "Plan",
      branchedFromMessageId: "m1",
    });
    expect(list.threads.find((thread) => thread.id === a)?.active).toBe(false);
    const after = await api.delete({ botId: "chief", threadId: a, confirm: true });
    expect(after.threads.find((thread) => thread.id === branch?.id)).toMatchObject({
      parentThreadId: null,
      parentTitle: "Plan",
    });
  });

  it("simulate tells the window about a running turn, the queue and a card", async () => {
    const { api, events } = setup();
    const id = (await api.list({ botId: "chief" })).activeThreadId ?? "";
    api.simulate("chief", id, { state: "running", queued: 2, needsYou: 1, unread: 3 });
    expect(events.at(-1)).toMatchObject({
      type: "thread-activity",
      threadId: id,
      state: "running",
      queued: 2,
      needsYou: 1,
      unread: 3,
    });
    expect((await api.list({ botId: "chief" })).threads[0]).toMatchObject({ state: "running", unread: 3 });
    // Selecting a thread reads it.
    const other = (await api.create({ botId: "chief" })).activeThreadId ?? "";
    expect(other).not.toBe(id);
    expect(
      (await api.select({ botId: "chief", threadId: id })).threads.find((thread) => thread.id === id)?.unread,
    ).toBe(0);
  });
});

describe("mock delete with undo (W12 BE-K)", () => {
  function undoSetup() {
    let now = new Date("2026-11-17T01:00:00.000Z");
    const events: AgentEvent[] = [];
    const api = createMockThreads((event) => events.push(event), {}, { clock: () => now });
    return {
      api,
      events,
      advance: (minutes: number) => {
        now = new Date(now.getTime() + minutes * 60_000);
      },
    };
  }

  it("hides the thread, keeps it for ten minutes, and brings it back as the active one", async () => {
    const { api, events } = undoSetup();
    const first = (await api.list({ botId: "chief" })).activeThreadId ?? "";
    await api.rename({ botId: "chief", threadId: first, title: "Plan" });
    await api.create({ botId: "chief", title: "Other" });
    await api.select({ botId: "chief", threadId: first });
    const result = await api.undo.delete({ botId: "chief", threadId: first, confirm: true });
    expect(result.list.threads.map((thread) => thread.title)).toEqual(["Other"]);
    expect(result.pending).toMatchObject({
      threadId: first,
      title: "Plan",
      wasActive: true,
      expiresAt: "2026-11-17T01:10:00.000Z",
    });
    expect(events.at(-1)).toMatchObject({ type: "thread-deletes-changed", botId: "chief" });
    expect(await api.undo.list({ botId: "chief" })).toHaveLength(1);
    const back = await api.undo.undo({ botId: "chief", threadId: first });
    expect(back.threads.map((thread) => thread.title).sort()).toEqual(["Other", "Plan"]);
    expect(back.activeThreadId).toBe(first);
    expect(await api.undo.list({ botId: "chief" })).toEqual([]);
  });

  it("refuses an undo after the time ran out, and without confirmation", async () => {
    const { api, advance } = undoSetup();
    const id = (await api.list({ botId: "chief" })).activeThreadId ?? "";
    await expect(
      api.undo.delete(JSON.parse(JSON.stringify({ botId: "chief", threadId: id, confirm: false }))),
    ).rejects.toThrow("confirmation");
    await api.undo.delete({ botId: "chief", threadId: id, confirm: true });
    advance(11);
    await expect(api.undo.undo({ botId: "chief", threadId: id })).rejects.toThrow("time to undo has passed");
    expect(await api.undo.list({ botId: "chief" })).toEqual([]);
    await expect(api.undo.undo({ botId: "chief", threadId: "nothing" })).rejects.toThrow("nothing to undo");
  });

  it("lets delete-now remove a thread that waits in the window for good", async () => {
    const { api } = undoSetup();
    const id = (await api.list({ botId: "chief" })).activeThreadId ?? "";
    await api.undo.delete({ botId: "chief", threadId: id, confirm: true });
    await api.delete({ botId: "chief", threadId: id, confirm: true });
    expect(await api.undo.list({ botId: "chief" })).toEqual([]);
    await expect(api.undo.undo({ botId: "chief", threadId: id })).rejects.toThrow("nothing to undo");
  });
});
