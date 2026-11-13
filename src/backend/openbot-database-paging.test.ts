// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BotSummary, ConversationMessage } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const BOT: BotSummary = {
  id: "scout",
  name: "Scout",
  role: "",
  description: "",
  notifications: true,
  model: "gpt-5.6-luna",
  reasoningEffort: "medium",
  threadId: "thread-scout",
  workspacePath: "C:\\work\\scout",
  preview: "",
  updatedAt: null,
  avatarSeed: "scout",
  avatarHue: null,
  avatarUrl: null,
};

function message(index: number): ConversationMessage {
  return {
    id: `m${index}`,
    author: index % 2 ? "user" : "assistant",
    text: `Message ${index}`,
    createdAt: new Date(Date.UTC(2026, 10, 13, 19, 0, index)).toISOString(),
    status: "completed",
  };
}

async function setup(count: number) {
  const root = await mkdtemp(join(tmpdir(), "db-paging-"));
  roots.push(root);
  const database = testDatabase(join(root, "data"));
  await database.initialize();
  database.replaceAgents("seed", [BOT], "agents.seeded");
  database.persistConversation(
    {
      botId: BOT.id,
      threadId: BOT.threadId,
      activeTurnId: null,
      revision: 1,
      messages: Array.from({ length: count }, (_, index) => message(index + 1)),
    },
    "conversation.seeded",
  );
  return database;
}

describe("thread message pages", () => {
  it("reads the newest page and older pages, oldest first, without the whole thread", async () => {
    const database = await setup(7);
    const newest = database.readThreadMessagesPage("thread-scout", { beforeMessageId: null, limit: 3 });
    expect(newest?.messages.map((item) => item.id)).toEqual(["m5", "m6", "m7"]);
    expect(newest?.hasMore).toBe(true);
    const older = database.readThreadMessagesPage("thread-scout", { beforeMessageId: "m5", limit: 3 });
    expect(older?.messages.map((item) => item.id)).toEqual(["m2", "m3", "m4"]);
    expect(older?.hasMore).toBe(true);
    const oldest = database.readThreadMessagesPage("thread-scout", { beforeMessageId: "m2", limit: 3 });
    expect(oldest?.messages.map((item) => item.id)).toEqual(["m1"]);
    expect(oldest?.hasMore).toBe(false);
    expect(oldest?.messages[0]).toEqual(message(1));
  });

  it("returns null for a cursor that is not in the thread, and nothing for an empty thread", async () => {
    const database = await setup(2);
    expect(database.readThreadMessagesPage("thread-scout", { beforeMessageId: "nope", limit: 3 })).toBeNull();
    expect(database.readThreadMessagesPage("thread-none", { beforeMessageId: null, limit: 3 })).toEqual({
      messages: [],
      hasMore: false,
    });
  });
});
