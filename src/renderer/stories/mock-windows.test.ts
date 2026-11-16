// @vitest-environment node
import { type AgentEvent, CONVERSATION_WINDOW_LIMITS, isConversationWindowList } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockWindows } from "./mock-windows";

function setup() {
  const events: AgentEvent[] = [];
  const api = createMockWindows(
    (event) => events.push(event),
    (botId) => `${botId}-t1`,
    (botId) => botId.toUpperCase(),
  );
  return { api, events };
}

describe("mock conversation windows (W6-KK3)", () => {
  it("opens the active thread when none is named, with a readable title, and tells the window list", async () => {
    const { api, events } = setup();
    const opened = await api.openConversation({ botId: "chief" });
    expect(opened.created).toBe(true);
    expect(opened.window).toMatchObject({ id: "chief:chief-t1", title: "CHIEF", live: true, focused: true });
    expect(isConversationWindowList(await api.listOpen())).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "conversation-windows-changed" });
  });

  it("one window per (agent, thread): opening again brings the existing one to the front, no duplicate", async () => {
    const { api } = setup();
    await api.openConversation({ botId: "chief" });
    await api.openConversation({ botId: "chief", threadId: "other" });
    expect((await api.listOpen()).map((window) => window.focused)).toEqual([false, true]);
    const again = await api.openConversation({ botId: "chief", threadId: "chief-t1" });
    expect(again.created).toBe(false);
    expect(await api.listOpen()).toHaveLength(2);
    expect((await api.listOpen()).map((window) => window.focused)).toEqual([true, false]);
  });

  it("two threads of one agent and two agents each get their own window", async () => {
    const { api } = setup();
    await api.openConversation({ botId: "chief", threadId: "a" });
    await api.openConversation({ botId: "chief", threadId: "b" });
    await api.openConversation({ botId: "scout", threadId: "a" });
    expect(await api.listOpen()).toHaveLength(3);
  });

  it("a window of a thread that is no longer the active one is not live, and live again when it returns", async () => {
    const { api } = setup();
    await api.openConversation({ botId: "chief" });
    api.simulate.setActiveThread("chief", "chief-t2");
    expect((await api.listOpen())[0]?.live).toBe(false);
    api.simulate.setActiveThread("chief", "chief-t1");
    expect((await api.listOpen())[0]?.live).toBe(true);
    const other = await api.openConversation({ botId: "chief", threadId: "chief-t2" });
    expect(other.window.live).toBe(false);
  });

  it("closing removes only that window; closing one that is not open is fine", async () => {
    const { api, events } = setup();
    await api.openConversation({ botId: "chief", threadId: "a" });
    await api.openConversation({ botId: "chief", threadId: "b" });
    await api.close({ botId: "chief", threadId: "a" });
    expect((await api.listOpen()).map((window) => window.threadId)).toEqual(["b"]);
    const count = events.length;
    await api.close({ botId: "chief", threadId: "nope" });
    expect(events).toHaveLength(count);
  });

  it("the number of windows is limited, and a refusal says what to do", async () => {
    const { api } = setup();
    for (let index = 0; index < CONVERSATION_WINDOW_LIMITS.maxOpen; index += 1) {
      await api.openConversation({ botId: "chief", threadId: `t${index}` });
    }
    await expect(api.openConversation({ botId: "chief", threadId: "one-too-many" })).rejects.toThrow(
      /Close a conversation window/,
    );
    await expect(api.openConversation({ botId: "chief", threadId: "t0" })).resolves.toMatchObject({ created: false });
  });

  it("current() is null in the main window and the window itself in a conversation window", async () => {
    const { api } = setup();
    await api.openConversation({ botId: "chief" });
    expect(await api.current()).toBeNull();
    api.simulate.setCurrent("chief", "chief-t1");
    expect(await api.current()).toMatchObject({ botId: "chief", threadId: "chief-t1" });
  });
});
