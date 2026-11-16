import type { AgentEvent, ConversationMessage } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockMessageActions } from "./mock-message-actions";

function message(id: string, author: "user" | "assistant", text = id): ConversationMessage {
  return { id, author, text, createdAt: "2026-11-16T11:00:00.000Z", status: "completed" };
}

function setup() {
  const events: AgentEvent[] = [];
  const actions = createMockMessageActions((event) => events.push(event));
  actions.seed("b", "t", [
    message("u1", "user"),
    message("a1", "assistant"),
    message("u2", "user"),
    message("a2", "assistant"),
  ]);
  return { actions, events };
}

describe("mock message actions", () => {
  it("retry ADDS a new answer marked as a regeneration and keeps the old one (Q12)", async () => {
    const { actions } = setup();
    const result = await actions.retry({ botId: "b", threadId: "t", messageId: "a1" });
    expect(result.removedMessageIds).toEqual([]);
    const messages = actions.messages("b", "t");
    expect(messages.slice(0, 4).map((item) => item.id)).toEqual(["u1", "a1", "u2", "a2"]);
    expect(messages.at(-1)?.regeneration).toEqual({ ofMessageId: "a1" });
    expect(messages.at(-2)?.text).toBe("u1");
  });

  it("edit needs confirmation when something follows and removes everything after the message (Q13)", async () => {
    const { actions } = setup();
    await expect(actions.edit({ botId: "b", threadId: "t", messageId: "u1", text: "new" })).rejects.toThrow(/Confirm/);
    const result = await actions.edit({ botId: "b", threadId: "t", messageId: "u1", text: "new", confirm: true });
    expect(result.removedMessageIds).toEqual(["u1", "a1", "u2", "a2"]);
    const messages = actions.messages("b", "t");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ text: "new", edited: true });
  });

  it("edit of the last message needs no confirmation, and only the person's own message can be edited", async () => {
    const { actions } = setup();
    await expect(
      actions.edit({ botId: "b", threadId: "t", messageId: "a1", text: "x", confirm: true }),
    ).rejects.toThrow(/own messages/);
    await actions.edit({ botId: "b", threadId: "t", messageId: "u2", text: "again", confirm: true });
    const last = actions.messages("b", "t").at(-1);
    expect(last?.text).toBe("again");
    await expect(
      actions.edit({ botId: "b", threadId: "t", messageId: last?.id ?? "", text: "once more" }),
    ).resolves.toBeTruthy();
  });

  it("delete needs confirmation and removes one message", async () => {
    const { actions } = setup();
    // A caller outside TypeScript can leave `confirm` out; the program must still refuse.
    const unconfirmed = JSON.parse('{"botId":"b","threadId":"t","messageId":"a1"}');
    await expect(actions.delete(unconfirmed)).rejects.toThrow(/confirmation/);
    const result = await actions.delete({ botId: "b", threadId: "t", messageId: "a1", confirm: true });
    expect(result).toEqual({ removedMessageIds: ["a1"], receipt: null });
    expect(actions.messages("b", "t").map((item) => item.id)).toEqual(["u1", "u2", "a2"]);
  });

  it("refuses retry, edit and delete while the thread is busy, but pin still works (W35)", async () => {
    const { actions } = setup();
    actions.setBusy("b", "t", { turnRunning: true, busyMessages: 0 });
    await expect(actions.retry({ botId: "b", threadId: "t", messageId: "a1" })).rejects.toThrow(/busy/);
    await expect(
      actions.edit({ botId: "b", threadId: "t", messageId: "u1", text: "x", confirm: true }),
    ).rejects.toThrow(/busy/);
    await expect(actions.delete({ botId: "b", threadId: "t", messageId: "a1", confirm: true })).rejects.toThrow(/busy/);
    await expect(actions.pin({ botId: "b", threadId: "t", messageId: "a1", pinned: true })).resolves.toHaveLength(1);
  });

  it("pins and unpins, announces the list and drops the pin of a deleted message", async () => {
    const { actions, events } = setup();
    await actions.pin({ botId: "b", threadId: "t", messageId: "u1", pinned: true });
    const pins = await actions.pin({ botId: "b", threadId: "t", messageId: "a1", pinned: true });
    expect(pins.map((pin) => pin.messageId)).toEqual(["a1", "u1"]);
    expect(actions.messages("b", "t")[0]?.pinned).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "message-pins-changed", botId: "b", threadId: "t" });
    await actions.delete({ botId: "b", threadId: "t", messageId: "a1", confirm: true });
    expect((await actions.listPins({ botId: "b", threadId: "t" })).map((pin) => pin.messageId)).toEqual(["u1"]);
    expect(await actions.pin({ botId: "b", threadId: "t", messageId: "u1", pinned: false })).toEqual([]);
  });

  it("refuses an unknown message", async () => {
    const { actions } = setup();
    await expect(actions.pin({ botId: "b", threadId: "t", messageId: "nope", pinned: true })).rejects.toThrow(
      /not in this thread/,
    );
  });
});
