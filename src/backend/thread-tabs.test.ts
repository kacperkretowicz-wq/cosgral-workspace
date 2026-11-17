// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentEvent, isAgentEvent, THREAD_TAB_LIMITS } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { ThreadTabsService } from "./thread-tabs";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup(initial: Record<string, string[]> = { chief: ["t-1", "t-2", "t-3", "t-4"] }) {
  const root = await mkdtemp(join(tmpdir(), "thread-tabs-"));
  roots.push(root);
  const file = join(root, "thread-tabs.json");
  const events: AgentEvent[] = [];
  const threads = new Map(Object.entries(initial));
  const make = () =>
    new ThreadTabsService({
      file,
      openThreads: (botId) => threads.get(botId) ?? null,
      emit: (event) => events.push(event),
    });
  return { file, events, threads, tabs: make(), make };
}

describe("ThreadTabsService (W11 U6)", () => {
  it("opens a thread at the end, once, and says so with one event", async () => {
    const { tabs, events } = await setup();
    expect(tabs.open({ botId: "chief", threadId: "t-2" })).toEqual({ botId: "chief", open: ["t-2"] });
    tabs.open({ botId: "chief", threadId: "t-1" });
    tabs.open({ botId: "chief", threadId: "t-2" });
    expect(tabs.get("chief").open).toEqual(["t-2", "t-1"]);
    expect(events).toHaveLength(2);
    expect(events.every(isAgentEvent)).toBe(true);
    expect(events[0]).toMatchObject({ type: "thread-tabs-changed", botId: "chief", open: ["t-2"] });
  });

  it("refuses a thread that is not an open (active) thread of the agent", async () => {
    const { tabs } = await setup();
    expect(() => tabs.open({ botId: "chief", threadId: "ghost" })).toThrow(/not an active thread/);
    expect(() => tabs.open({ botId: "nobody", threadId: "t-1" })).toThrow(/no longer exists/);
    expect(tabs.get("chief").open).toEqual([]);
  });

  it("closes this, the others, or the ones to the right, and never touches a thread", async () => {
    const { tabs, threads } = await setup();
    for (const id of ["t-1", "t-2", "t-3", "t-4"]) tabs.open({ botId: "chief", threadId: id });
    expect(tabs.close({ botId: "chief", threadId: "t-2", mode: "right" }).open).toEqual(["t-1", "t-2"]);
    expect(tabs.close({ botId: "chief", threadId: "t-2", mode: "this" }).open).toEqual(["t-1"]);
    tabs.open({ botId: "chief", threadId: "t-3" });
    expect(tabs.close({ botId: "chief", threadId: "t-3", mode: "others" }).open).toEqual(["t-3"]);
    expect(threads.get("chief")).toEqual(["t-1", "t-2", "t-3", "t-4"]);
  });

  it("keeps the order the person made, and refuses an order of other tabs", async () => {
    const { tabs } = await setup();
    for (const id of ["t-1", "t-2", "t-3"]) tabs.open({ botId: "chief", threadId: id });
    expect(tabs.reorder({ botId: "chief", threadIds: ["t-3", "t-1", "t-2"] }).open).toEqual(["t-3", "t-1", "t-2"]);
    expect(() => tabs.reorder({ botId: "chief", threadIds: ["t-3", "t-1"] })).toThrow(/same open tabs/);
    expect(() => tabs.reorder({ botId: "chief", threadIds: ["t-3", "t-3", "t-1"] })).toThrow(/same open tabs/);
  });

  it("drops the oldest tab over the limit", async () => {
    const ids = Array.from({ length: THREAD_TAB_LIMITS.maxOpen + 2 }, (_, index) => `t-${index}`);
    const { tabs } = await setup({ chief: ids });
    for (const id of ids) tabs.open({ botId: "chief", threadId: id });
    const open = tabs.get("chief").open;
    expect(open).toHaveLength(THREAD_TAB_LIMITS.maxOpen);
    expect(open[0]).toBe("t-2");
    expect(open.at(-1)).toBe(ids.at(-1));
  });

  it("forgets a tab whose thread was archived or deleted (the thread list changed)", async () => {
    const { tabs, threads, events } = await setup();
    for (const id of ["t-1", "t-2", "t-3"]) tabs.open({ botId: "chief", threadId: id });
    threads.set("chief", ["t-1", "t-3"]);
    const before = events.length;
    tabs.prune("chief");
    expect(tabs.get("chief").open).toEqual(["t-1", "t-3"]);
    expect(events).toHaveLength(before + 1);
    tabs.prune("chief");
    expect(events).toHaveLength(before + 1);
  });

  it("keeps the tabs over a restart, ignores a damaged file, and drops tabs of agents that are gone", async () => {
    const { tabs, make, file, threads } = await setup();
    tabs.open({ botId: "chief", threadId: "t-2" });
    tabs.open({ botId: "chief", threadId: "t-1" });
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ chief: ["t-2", "t-1"] });
    expect(make().get("chief").open).toEqual(["t-2", "t-1"]);
    threads.delete("chief");
    expect(make().get("chief").open).toEqual([]);
    await writeFile(file, "{ not json");
    expect(make().get("chief").open).toEqual([]);
  });
});

describe("ThreadTabsService.learn (W11 U6)", () => {
  it("takes the thread list of the thread store: archived threads are no tabs, and an archive prunes", async () => {
    const { make } = await setup({});
    const tabs = make();
    const summary = (id: string, state: "idle" | "archived") => ({
      id,
      botId: "chief",
      title: id,
      titled: false,
      state,
      active: false,
      unread: 0,
      queued: 0,
      needsYou: 0,
      createdAt: "",
      updatedAt: "",
      archivedAt: null,
      preview: "",
      parentThreadId: null,
      parentTitle: null,
      branchedFromMessageId: null,
    });
    tabs.learn({
      botId: "chief",
      activeThreadId: "a",
      threads: [summary("a", "idle"), summary("b", "idle"), summary("c", "archived")],
    });
    tabs.open({ botId: "chief", threadId: "a" });
    tabs.open({ botId: "chief", threadId: "b" });
    expect(() => tabs.open({ botId: "chief", threadId: "c" })).toThrow(/not an active thread/);
    tabs.learn({ botId: "chief", activeThreadId: "a", threads: [summary("a", "idle"), summary("b", "archived")] });
    expect(tabs.get("chief").open).toEqual(["a"]);
  });
});
