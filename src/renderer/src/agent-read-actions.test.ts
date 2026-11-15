import type { ConversationWithReadState } from "@openbot/contracts/ipc";
import { describe, expect, it, vi } from "vitest";
import { markSidebarConversationRead } from "./agent-read-actions";

function snapshot(messages = true): ConversationWithReadState {
  return {
    botId: "research",
    threadId: "t",
    activeTurnId: null,
    revision: 2,
    messages: messages
      ? [
          {
            id: "newest",
            author: "assistant",
            text: "A new result",
            createdAt: "2026-11-16T00:00:00Z",
            status: "completed",
          },
        ]
      : [],
  };
}
function api(value = snapshot()) {
  return {
    readConversation: vi.fn().mockResolvedValue(value),
    markConversationRead: vi
      .fn()
      .mockResolvedValue({ unreadCount: 0, firstUnreadMessageId: null, throughMessageId: "newest" }),
  };
}
describe("sidebar read action", () => {
  it("reads a fresh background-agent boundary before writing its watermark", async () => {
    const client = api();
    await markSidebarConversationRead(client, "research");
    expect(client.readConversation).toHaveBeenCalledWith("research");
    expect(client.markConversationRead).toHaveBeenCalledWith({ botId: "research", throughMessageId: "newest" });
  });
  it("passes null only for an empty conversation", async () => {
    const client = api(snapshot(false));
    await markSidebarConversationRead(client, "research");
    expect(client.markConversationRead).toHaveBeenCalledWith({ botId: "research", throughMessageId: null });
  });
  it("does not write after a failed read", async () => {
    const client = api();
    client.readConversation.mockRejectedValue(new Error("Offline"));
    await expect(markSidebarConversationRead(client, "research")).rejects.toThrow("Offline");
    expect(client.markConversationRead).not.toHaveBeenCalled();
  });
  it("does not write if the selected server changed while history loaded", async () => {
    const client = api();
    await expect(markSidebarConversationRead(client, "research", () => false)).rejects.toThrow("server changed");
    expect(client.markConversationRead).not.toHaveBeenCalled();
  });
  it("rejects a mismatched conversation instead of marking another agent", async () => {
    const client = api({ ...snapshot(), botId: "chief" });
    await expect(markSidebarConversationRead(client, "research")).rejects.toThrow("conversation changed");
    expect(client.markConversationRead).not.toHaveBeenCalled();
  });
  it("returns a newer unread count from the engine and propagates write failures", async () => {
    const client = api();
    client.markConversationRead.mockResolvedValueOnce({
      unreadCount: 1,
      firstUnreadMessageId: "later",
      throughMessageId: "newest",
    });
    expect(await markSidebarConversationRead(client, "research")).toMatchObject({ unreadCount: 1 });
    client.markConversationRead.mockRejectedValueOnce(new Error("Write failed"));
    await expect(markSidebarConversationRead(client, "research")).rejects.toThrow("Write failed");
  });
});
