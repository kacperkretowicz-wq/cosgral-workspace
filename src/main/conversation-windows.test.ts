// @vitest-environment node
// COSGRAL W6-KK3: the rules of the separate conversation windows, tested with a fake host (no Electron, no screen).

import {
  type AgentEvent,
  CONVERSATION_WINDOW_LIMITS,
  type ThreadList,
  type ThreadSummary,
} from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import {
  type ConversationWindowAgents,
  type ConversationWindowHandle,
  type ConversationWindowHost,
  ConversationWindows,
} from "./conversation-windows";

function summary(botId: string, id: string, title = "", active = false): ThreadSummary {
  return {
    id,
    botId,
    title: title || "New thread",
    titled: title !== "",
    state: "idle",
    active,
    unread: 0,
    queued: 0,
    needsYou: 0,
    createdAt: "2026-11-16T12:00:00.000Z",
    updatedAt: "2026-11-16T12:00:00.000Z",
    archivedAt: null,
    preview: "",
    parentThreadId: null,
    parentTitle: null,
    branchedFromMessageId: null,
  };
}

function listOf(botId: string, active: string | null, threads: Array<[string, string]>): ThreadList {
  return {
    botId,
    activeThreadId: active,
    threads: threads.map(([id, title]) => summary(botId, id, title, id === active)),
  };
}

class FakeWindow implements ConversationWindowHandle {
  closed = false;
  focusCalls = 0;
  title: string;
  #onClosed: (() => void) | null = null;
  #onFocus: ((focused: boolean) => void) | null = null;
  constructor(
    readonly hash: string,
    title: string,
  ) {
    this.title = title;
  }
  focus() {
    this.focusCalls += 1;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.#onClosed?.();
  }
  setTitle(title: string) {
    this.title = title;
  }
  onClosed(listener: () => void) {
    this.#onClosed = listener;
  }
  onFocusChanged(listener: (focused: boolean) => void) {
    this.#onFocus = listener;
  }
  userFocus(focused: boolean) {
    this.#onFocus?.(focused);
  }
}

function setup(initial: Record<string, ThreadList> = {}) {
  const lists = new Map(Object.entries(initial));
  const names: Record<string, string> = { chief: "Chief", scout: "Scout" };
  const created: FakeWindow[] = [];
  const events: AgentEvent[] = [];
  const host: ConversationWindowHost = {
    create: (hash, title) => {
      const window = new FakeWindow(hash, title);
      created.push(window);
      return window;
    },
  };
  const agents: ConversationWindowAgents = {
    agentName: (botId) => names[botId] ?? null,
    threads: async (botId) => lists.get(botId) ?? listOf(botId, null, []),
  };
  const windows = new ConversationWindows({ host, agents, emit: (event) => events.push(event) });
  const lastList = () => {
    const event = events.filter((e) => e.type === "conversation-windows-changed").at(-1);
    return event?.type === "conversation-windows-changed" ? event.windows : [];
  };
  return { windows, created, events, lists, names, lastList };
}

const chiefThreads = listOf("chief", "t1", [
  ["t1", "Plan"],
  ["t2", ""],
]);

describe("conversation windows (W6-KK3)", () => {
  it("opens the active thread when none is named: route, title, live, and tells the list", async () => {
    const { windows, created, lastList } = setup({ chief: chiefThreads });
    const result = await windows.open({ botId: "chief" });
    expect(result.created).toBe(true);
    expect(result.window).toMatchObject({ id: "chief:t1", title: "Chief / Plan", live: true, focused: true });
    expect(created).toHaveLength(1);
    expect(created[0]?.hash).toBe("#conversation/chief/t1");
    expect(created[0]?.title).toBe("Chief / Plan");
    expect(lastList()).toHaveLength(1);
  });

  it("an untitled thread has the agent's name only", async () => {
    const { windows } = setup({ chief: chiefThreads });
    const result = await windows.open({ botId: "chief", threadId: "t2" });
    expect(result.window).toMatchObject({ title: "Chief", live: false });
  });

  it("one window per (agent, thread): the second open focuses the first and makes no new window", async () => {
    const { windows, created } = setup({ chief: chiefThreads });
    await windows.open({ botId: "chief", threadId: "t1" });
    const again = await windows.open({ botId: "chief" });
    expect(again.created).toBe(false);
    expect(created).toHaveLength(1);
    expect(created[0]?.focusCalls).toBe(1);
    expect(windows.list()).toHaveLength(1);
  });

  it("two threads of one agent and two agents get their own windows", async () => {
    const { windows, created } = setup({ chief: chiefThreads, scout: listOf("scout", "s1", [["s1", "Notes"]]) });
    await windows.open({ botId: "chief", threadId: "t1" });
    await windows.open({ botId: "chief", threadId: "t2" });
    await windows.open({ botId: "scout" });
    expect(windows.list().map((w) => w.id)).toEqual(["chief:t1", "chief:t2", "scout:s1"]);
    expect(created.map((w) => w.hash)).toEqual([
      "#conversation/chief/t1",
      "#conversation/chief/t2",
      "#conversation/scout/s1",
    ]);
  });

  it("refuses an unknown agent, an agent without a conversation, an unknown thread, and too many windows", async () => {
    const { windows, lists } = setup({ chief: chiefThreads });
    await expect(windows.open({ botId: "nobody" })).rejects.toThrow(/does not exist/);
    await expect(windows.open({ botId: "scout" })).rejects.toThrow(/no conversation yet/);
    await expect(windows.open({ botId: "chief", threadId: "zzz" })).rejects.toThrow(/thread does not exist/);
    const many = Array.from({ length: CONVERSATION_WINDOW_LIMITS.maxOpen + 1 }, (_, index): [string, string] => [
      `m${index}`,
      "",
    ]);
    lists.set("chief", listOf("chief", "m0", many));
    for (let index = 0; index < CONVERSATION_WINDOW_LIMITS.maxOpen; index += 1) {
      await windows.open({ botId: "chief", threadId: `m${index}` });
    }
    await expect(windows.open({ botId: "chief", threadId: `m${CONVERSATION_WINDOW_LIMITS.maxOpen}` })).rejects.toThrow(
      /Close a conversation window/,
    );
    // an open one can still be brought to the front when the limit is reached
    await expect(windows.open({ botId: "chief", threadId: "m0" })).resolves.toMatchObject({ created: false });
  });

  it("closing the window (by the person or by close()) removes it and only it; nothing else is asked of the engine", async () => {
    const { windows, created, lastList } = setup({ chief: chiefThreads });
    await windows.open({ botId: "chief", threadId: "t1" });
    await windows.open({ botId: "chief", threadId: "t2" });
    created[0]?.close();
    expect(windows.list().map((w) => w.id)).toEqual(["chief:t2"]);
    windows.close({ botId: "chief", threadId: "t2" });
    expect(windows.list()).toEqual([]);
    expect(lastList()).toEqual([]);
    expect(() => windows.close({ botId: "chief", threadId: "never" })).not.toThrow();
    // the same thread can be opened again afterwards
    await expect(windows.open({ botId: "chief", threadId: "t1" })).resolves.toMatchObject({ created: true });
  });

  it("the focus follows the window the person clicks", async () => {
    const { windows, created, lastList } = setup({ chief: chiefThreads });
    await windows.open({ botId: "chief", threadId: "t1" });
    await windows.open({ botId: "chief", threadId: "t2" });
    expect(lastList().map((w) => w.focused)).toEqual([false, true]);
    created[0]?.userFocus(true);
    created[1]?.userFocus(false);
    expect(lastList().map((w) => w.focused)).toEqual([true, false]);
  });

  it("switching the agent to another thread makes the old window not live, and live again on return", async () => {
    const { windows } = setup({ chief: chiefThreads });
    await windows.open({ botId: "chief", threadId: "t1" });
    windows.observe({
      type: "threads-changed",
      ...listOf("chief", "t2", [
        ["t1", "Plan"],
        ["t2", ""],
      ]),
    });
    expect(windows.list()[0]?.live).toBe(false);
    windows.observe({ type: "threads-changed", ...chiefThreads });
    expect(windows.list()[0]?.live).toBe(true);
  });

  it("a rename changes the title of the window; another agent's change does nothing", async () => {
    const { windows, created, events } = setup({ chief: chiefThreads });
    await windows.open({ botId: "chief", threadId: "t1" });
    const before = events.length;
    windows.observe({ type: "threads-changed", ...listOf("scout", "x", [["x", "Else"]]) });
    expect(events).toHaveLength(before);
    windows.observe({
      type: "threads-changed",
      ...listOf("chief", "t1", [
        ["t1", "Roadmap"],
        ["t2", ""],
      ]),
    });
    expect(windows.list()[0]?.title).toBe("Chief / Roadmap");
    expect(created[0]?.title).toBe("Chief / Roadmap");
  });

  it("a thread deleted for good closes its window, and an archived one keeps it", async () => {
    const { windows, created, lastList } = setup({ chief: chiefThreads });
    await windows.open({ botId: "chief", threadId: "t1" });
    await windows.open({ botId: "chief", threadId: "t2" });
    const archived = listOf("chief", "t1", [
      ["t1", "Plan"],
      ["t2", ""],
    ]);
    const t2 = archived.threads[1];
    if (t2) archived.threads[1] = { ...t2, state: "archived", archivedAt: "2026-11-16T12:05:00.000Z" };
    windows.observe({ type: "threads-changed", ...archived });
    expect(windows.list()).toHaveLength(2);
    windows.observe({ type: "threads-changed", ...listOf("chief", "t1", [["t1", "Plan"]]) });
    expect(windows.list().map((w) => w.id)).toEqual(["chief:t1"]);
    expect(created[1]?.closed).toBe(true);
    expect(lastList().map((w) => w.id)).toEqual(["chief:t1"]);
  });

  it("an agent that is removed takes its windows with it", async () => {
    const { windows, created } = setup({ chief: chiefThreads, scout: listOf("scout", "s1", [["s1", "Notes"]]) });
    await windows.open({ botId: "chief", threadId: "t1" });
    await windows.open({ botId: "scout" });
    windows.observe({ type: "bots-changed", bots: [] });
    expect(windows.list()).toEqual([]);
    expect(created.every((w) => w.closed)).toBe(true);
  });

  it("at the end of the program the windows close quietly and nothing opens any more", async () => {
    const { windows, created, events } = setup({ chief: chiefThreads });
    await windows.open({ botId: "chief", threadId: "t1" });
    const before = events.length;
    windows.destroy();
    expect(created[0]?.closed).toBe(true);
    expect(events).toHaveLength(before);
    await expect(windows.open({ botId: "chief", threadId: "t1" })).rejects.toThrow(/closing/);
  });
});
