// @vitest-environment node
// COSGRAL W6-KK3: the `windows:*` handlers with the real rule keeper and a fake host: opening, the duplicate, closing,
// and "which conversation am I?" answered from the address of the page that asks, with the window's trust check on.

import type { ThreadList, ThreadSummary } from "@openbot/contracts/ipc";
import { beforeAll, describe, expect, it } from "vitest";
import { type ConversationWindowHandle, ConversationWindows } from "./conversation-windows";
import { ipcRegistry } from "./trusted-ipc";
import { registerWindowsIpc } from "./windows-ipc";

type Listener = (event: { senderFrame?: { url?: string | null } | null }, ...args: unknown[]) => unknown;
const handlers = new Map<string, Listener>();
const created: string[] = [];

const thread = (id: string): ThreadSummary => ({
  id,
  botId: "chief",
  title: "Plan",
  titled: true,
  state: "idle",
  active: id === "t1",
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
});
const threads: ThreadList = { botId: "chief", activeThreadId: "t1", threads: [thread("t1"), thread("t2")] };

const windows = new ConversationWindows({
  host: {
    create: (hash): ConversationWindowHandle => {
      created.push(hash);
      let closed: () => void = () => undefined;
      return {
        focus: () => undefined,
        close: () => closed(),
        setTitle: () => undefined,
        onClosed: (listener) => {
          closed = listener;
        },
        onFocusChanged: () => undefined,
      };
    },
  },
  agents: { agentName: (botId) => (botId === "chief" ? "Chief" : null), threads: async () => threads },
  emit: () => undefined,
});

const MAIN = "openbot-app://app/index.html";
const call = async (channel: string, payload: unknown, url = MAIN, serverId = "local") => {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  return handler({ senderFrame: { url } }, { serverId, payload });
};

beforeAll(() => {
  ipcRegistry.register = (channel, listener) => {
    handlers.set(channel, listener);
  };
  registerWindowsIpc(() => windows);
});

describe("windows IPC (W6-KK3)", () => {
  it("opens a conversation, answers the same window for the same thread, and lists it", async () => {
    const first = await call("windows:open-conversation", { botId: "chief" });
    expect(first).toMatchObject({ created: true, window: { id: "chief:t1", live: true } });
    const again = await call("windows:open-conversation", { botId: "chief", threadId: "t1" });
    expect(again).toMatchObject({ created: false });
    expect(created).toEqual(["#conversation/chief/t1"]);
    expect(await call("windows:list-open", null)).toHaveLength(1);
  });

  it("a page learns which conversation it is from its own address; the main window and other routes learn none", async () => {
    expect(await call("windows:current", null, `${MAIN}#conversation/chief/t1`)).toMatchObject({ id: "chief:t1" });
    expect(await call("windows:current", null, `${MAIN}#conversation/chief/t2`)).toBeNull();
    expect(await call("windows:current", null, MAIN)).toBeNull();
    expect(await call("windows:current", null, `${MAIN}#dock`)).toBeNull();
  });

  it("an untrusted page is rejected, a bad request is refused, another server is refused", async () => {
    await expect(
      call("windows:open-conversation", { botId: "chief" }, "https://example.com/#conversation/chief/t1"),
    ).rejects.toThrow(/untrusted/);
    await expect(call("windows:open-conversation", { botId: "" })).rejects.toThrow(/needs an agent/);
    await expect(call("windows:close", { botId: "chief" })).rejects.toThrow(/needs a thread/);
    await expect(call("windows:open-conversation", { botId: "chief" }, MAIN, "remote-1")).rejects.toThrow(
      /this computer/,
    );
    await expect(call("windows:open-conversation", { botId: "ghost" })).rejects.toThrow(/does not exist/);
  });

  it("closing removes the window and does not fail for one that is not open", async () => {
    await call("windows:close", { botId: "chief", threadId: "t1" });
    expect(await call("windows:list-open", null)).toEqual([]);
    await expect(call("windows:close", { botId: "chief", threadId: "t1" })).resolves.toBeUndefined();
  });
});
