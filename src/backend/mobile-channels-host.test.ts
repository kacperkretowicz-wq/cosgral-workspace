// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { ChannelEngine } from "./channel-engine";
import { ChannelStore } from "./channel-store";
import { mobilePhoneChannels } from "./mobile-channels-host";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
const engines: ChannelEngine[] = [];
afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.stop()));
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("reads and writes the real channel store and engine the way the phone API needs", async () => {
  const root = await mkdtemp(join(tmpdir(), "mobile-channels-host-"));
  roots.push(root);
  const database = testDatabase(root);
  await database.initialize();
  const store = new ChannelStore(database);
  const channel = store.create({
    name: "team",
    title: "Team",
    instructions: "Short",
    memberBotIds: ["lead", "a"],
    leadBotId: "lead",
    isolated: false,
  });
  // The runner never answers, so the task stays where the engine put it and the test does not depend on timing.
  const engine = new ChannelEngine(store, { run: () => new Promise(() => undefined) });
  engines.push(engine);
  const host = mobilePhoneChannels(store, engine);

  expect(host.list().map((item) => item.id)).toEqual([channel.id]);
  const { message, task } = host.send({ channelId: channel.id, text: "Plan the launch" });
  expect(host.tasks(channel.id).map((item) => item.id)).toEqual([task.id]);
  const page = host.messages(channel.id, { before: null, limit: 10 });
  expect(page.map((item) => item.id)).toContain(message.id);
  expect(host.messages(channel.id, { before: message.id, limit: 10 }).every((item) => item.id !== message.id)).toBe(
    true,
  );
  expect(() => host.messages(channel.id, { before: "nope", limit: 10 })).toThrow("This message is not in the channel.");
  expect(host.act({ taskId: task.id, action: "stop" }).state).toBe("cancelled");
});

it("reads one message of a channel, or nothing for an unknown one (BE-AD)", async () => {
  const root = await mkdtemp(join(tmpdir(), "mobile-channels-host-"));
  roots.push(root);
  const database = testDatabase(root);
  await database.initialize();
  const store = new ChannelStore(database);
  const channel = store.create({
    name: "team",
    title: "Team",
    instructions: "Short",
    memberBotIds: ["lead"],
    leadBotId: "lead",
    isolated: false,
  });
  const engine = new ChannelEngine(store, { run: () => new Promise(() => undefined) });
  engines.push(engine);
  const host = mobilePhoneChannels(store, engine);
  const { message } = host.send({ channelId: channel.id, text: "Hello" });
  expect(host.message(channel.id, message.id)?.text).toBe("Hello");
  expect(host.message(channel.id, "nope")).toBeNull();
});
