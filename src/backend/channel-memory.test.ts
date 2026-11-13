// @vitest-environment node
// COSGRAL W2: the person's side of channel memory (add, edit, delete) and its change events.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "@openbot/contracts/ipc";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";
import { afterEach, expect, it } from "vitest";
import { ChannelStore } from "./channel-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "channel-memory-"));
  roots.push(root);
  const database = testDatabase(root);
  await database.initialize();
  const store = new ChannelStore(database);
  const events: AgentEvent[] = [];
  store.on("event", (event: AgentEvent) => events.push(event));
  const channel = store.create({
    name: "work",
    title: "",
    instructions: "",
    isolated: true,
    memberBotIds: ["a"],
    leadBotId: "a",
  });
  events.length = 0;
  return { root, store, channel, events };
}

it("lets a person add, edit and delete channel memory, with an event for every change", async () => {
  const { store, channel, events } = await setup();
  const byAgent = store.remember(channel.id, "a", "Use short sentences.");
  const byPerson = store.saveMemoryByPerson({ channelId: channel.id, text: "Deadline: Friday" });
  expect(byPerson).toMatchObject({ authorBotId: null, text: "Deadline: Friday" });

  const edited = store.saveMemoryByPerson({
    channelId: channel.id,
    memoryId: byAgent.id,
    text: "Use very short sentences.",
  });
  expect(edited).toMatchObject({ id: byAgent.id, authorBotId: "a", createdAt: byAgent.createdAt });
  expect(edited.updatedAt).toBeDefined();
  expect(store.listMemory(channel.id).map((memory) => memory.text)).toEqual([
    "Use very short sentences.",
    "Deadline: Friday",
  ]);

  expect(store.forgetMemory({ channelId: channel.id, memoryId: byPerson.id })).toEqual(byPerson);
  expect(store.listMemory(channel.id).map((memory) => memory.id)).toEqual([byAgent.id]);
  expect(events.filter((event) => event.type === "channel-memory-changed")).toEqual([
    { type: "channel-memory-changed", channelId: channel.id, action: "saved", memory: byAgent },
    { type: "channel-memory-changed", channelId: channel.id, action: "saved", memory: byPerson },
    { type: "channel-memory-changed", channelId: channel.id, action: "saved", memory: edited },
    { type: "channel-memory-changed", channelId: channel.id, action: "deleted", memory: byPerson },
  ]);
});

it("keeps the 500-character limit and refuses unknown entries or another channel's entry", async () => {
  const { store, channel } = await setup();
  const other = store.create({
    name: "other",
    title: "",
    instructions: "",
    isolated: true,
    memberBotIds: ["a"],
    leadBotId: "a",
  });
  const entry = store.saveMemoryByPerson({ channelId: channel.id, text: "Only here" });

  expect(() => store.saveMemoryByPerson({ channelId: channel.id, text: "x".repeat(501) })).toThrow(/500/);
  expect(() => store.saveMemoryByPerson({ channelId: channel.id, text: "  " })).toThrow(/500/);
  expect(() => store.forgetMemory({ channelId: other.id, memoryId: entry.id })).toThrow(/no longer exists/);
  expect(() => store.saveMemoryByPerson({ channelId: other.id, memoryId: entry.id, text: "Moved" })).toThrow(
    /no longer exists/,
  );
  expect(store.listMemory(other.id)).toEqual([]);
});

it("leaves no forgotten or replaced channel memory text in the event log", async () => {
  const { root, store, channel } = await setup();
  const entry = store.remember(channel.id, "a", "Door code hint: blue");
  store.saveMemoryByPerson({ channelId: channel.id, memoryId: entry.id, text: "Door code hint: red" });
  store.saveMemoryByPerson({ channelId: channel.id, text: "Other entry stays" });
  const database = testDatabase(root);
  await database.initialize();
  const logged = (needle: string) =>
    Number(
      loggedCount(
        database.connection
          .prepare("SELECT COUNT(*) AS count FROM orchestration_events WHERE payload_json LIKE ?")
          .get(`%${needle}%`),
      ),
    );
  expect(logged("hint: blue")).toBe(0);
  expect(logged("hint: red")).toBe(1);
  store.forgetMemory({ channelId: channel.id, memoryId: entry.id });
  expect(logged("hint: red")).toBe(0);
  expect(logged("Other entry stays")).toBe(1);
});

it("keeps a person's edits across a restart", async () => {
  const { root, store, channel } = await setup();
  const entry = store.saveMemoryByPerson({ channelId: channel.id, text: "First" });
  store.saveMemoryByPerson({ channelId: channel.id, memoryId: entry.id, text: "Second" });
  closeTestDatabases();

  const database = testDatabase(root);
  await database.initialize();
  expect(new ChannelStore(database).listMemory(channel.id)).toMatchObject([
    { id: entry.id, text: "Second", authorBotId: null },
  ]);
});

/** COUNT(*) of one SQLite row. */
function loggedCount(row: unknown): number {
  return isDynamicRecord(row) ? Number(row.count) : -1;
}
