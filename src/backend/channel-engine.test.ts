// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChannelTask } from "@openbot/contracts/ipc";
import { afterEach, expect, it, vi } from "vitest";
import { ChannelEngine, type ChannelRunInput, type ChannelTurnResult } from "./channel-engine";
import { ChannelStore } from "./channel-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [],
  engines: ChannelEngine[] = [];
afterEach(async () => {
  await Promise.all(engines.splice(0).map((e) => e.stop()));
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })));
});
async function setup(run: (input: ChannelRunInput) => Promise<ChannelTurnResult>) {
  const root = await mkdtemp(join(tmpdir(), "channel-engine-"));
  roots.push(root);
  const db = testDatabase(root);
  await db.initialize();
  const store = new ChannelStore(db);
  const channel = store.create({
    name: "team",
    title: "Team",
    instructions: "Short",
    memberBotIds: ["lead", "a", "b"],
    leadBotId: "lead",
    isolated: true,
  });
  const engine = new ChannelEngine(store, { run }, { workspaceForBot: (id) => `C:\\work\\${id}` });
  engines.push(engine);
  engine.start();
  return { store, channel, engine };
}
const turn = (text: string): ChannelTurnResult => ({ status: "completed", text });
const until = async (predicate: () => boolean) => {
  await vi.waitFor(() => expect(predicate()).toBe(true), { timeout: 4000, interval: 10 });
};

it("gives a human request to the lead, runs helpers and wakes the parent once with their results", async () => {
  const seen: ChannelRunInput[] = [];
  const { engine, store, channel } = await setup(async (input) => {
    seen.push(input);
    if (input.task.parentTaskId) return turn(`result from ${input.task.ownerBotId}`);
    if (seen.filter((i) => i.task.parentTaskId === null).length === 1) {
      await input.tool("assign", { ownerBotId: "a", text: "Find facts" });
      await input.tool("assign", { ownerBotId: "b", text: "Check facts" });
      return turn("Waiting for helpers");
    }
    expect(input.history.some((m) => m.text === "result from a")).toBe(true);
    expect(input.history.some((m) => m.text === "result from b")).toBe(true);
    return turn("Combined");
  });
  const { task } = engine.sendMessage({ channelId: channel.id, text: "Do the report" });
  await until(() => store.getTask(task.id).state === "done");
  expect(seen.map((i) => i.task.ownerBotId)).toEqual(["lead", "a", "b", "lead"]);
  expect(store.getMessage(channel.id, store.getTask(task.id).resultMessageId ?? "missing").text).toBe("Combined");
  expect(store.listTasks(channel.id)).toHaveLength(3);
});

it("lets a person reply to a message of the same channel and refuses a message of another channel", async () => {
  const { engine, store, channel } = await setup(async () => turn("Done"));
  const first = engine.sendMessage({ channelId: channel.id, text: "First request" });
  await until(() => store.getTask(first.task.id).state === "done");
  const resultId = store.getTask(first.task.id).resultMessageId ?? "missing";

  const reply = engine.sendMessage({ channelId: channel.id, text: "One more change", replyToMessageId: resultId });
  expect(reply.message.replyToMessageId).toBe(resultId);
  expect(store.getMessage(channel.id, reply.message.id).replyToMessageId).toBe(resultId);
  expect(
    engine.sendMessage({ channelId: channel.id, text: "New topic", replyToMessageId: null }).message,
  ).toMatchObject({
    replyToMessageId: null,
  });

  const other = store.create({
    name: "other",
    title: "Other",
    instructions: "Short",
    memberBotIds: ["lead"],
    leadBotId: "lead",
    isolated: true,
  });
  expect(() => engine.sendMessage({ channelId: other.id, text: "Wrong place", replyToMessageId: resultId })).toThrow(
    /not in the channel/,
  );
  expect(store.listTasks(other.id)).toEqual([]);
});

it("never keeps the lead's waiting text as the result when helpers finish before the lead's turn ends", async () => {
  let leadTurns = 0;
  const { engine, store, channel } = await setup(async (input) => {
    if (input.task.parentTaskId) return turn("helper done");
    leadTurns++;
    if (leadTurns === 1) {
      await input.tool("assign", { ownerBotId: "a", text: "Quick" });
      const child = store.listTasks(channel.id).find((t) => t.parentTaskId === input.task.id);
      await until(() => child !== undefined && store.getTask(child.id).state === "done");
      return turn("Waiting for helpers");
    }
    return turn("Final answer");
  });
  const { task } = engine.sendMessage({ channelId: channel.id, text: "Fast helpers" });
  await until(() => store.getTask(task.id).state === "done");
  const results = store.listMessages(channel.id).filter((m) => m.taskId === task.id && m.kind === "result");
  expect(results.map((m) => m.text)).toEqual(["Final answer"]);
  expect(leadTurns).toBe(2);
});

it("keeps same-resource work serial until the cancelled runner actually exits and rejects late tools", async () => {
  const runs: ChannelRunInput[] = [],
    finishes: Array<(r: ChannelTurnResult) => void> = [];
  const { engine, store, channel } = await setup((input) => {
    runs.push(input);
    return new Promise((resolve) => finishes.push(resolve));
  });
  const first = engine.sendMessage({ channelId: channel.id, text: "One", resourceKey: "browser" }).task;
  const second = engine.sendMessage({ channelId: channel.id, text: "Two", resourceKey: "browser" }).task;
  await until(() => runs.length === 1);
  engine.actOnTask({ taskId: first.id, action: "stop" });
  expect(runs[0].signal.aborted).toBe(true);
  await expect(runs[0].tool("remember", { text: "late" })).rejects.toThrow(/stopped|active/);
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(runs).toHaveLength(1);
  finishes[0](turn("stale result"));
  await until(() => runs.length === 2);
  finishes[1](turn("Second result"));
  await until(() => store.getTask(second.id).state === "done");
  expect(store.getTask(first.id).resultMessageId).toBeNull();
  expect(store.listMemory(channel.id)).toEqual([]);
});

it("transfers ownership without losing the request and scopes tools to members of this channel", async () => {
  const seen: ChannelRunInput[] = [];
  const { engine, store, channel } = await setup(async (input) => {
    seen.push(input);
    if (input.task.ownerBotId === "lead") {
      await expect(input.tool("assign", { ownerBotId: "outsider", text: "bad" })).rejects.toThrow(/member/);
      await input.tool("transfer", { ownerBotId: "a" });
      await expect(input.tool("result", { text: "late" })).rejects.toThrow();
      return turn("stale");
    }
    return turn("Owned by A");
  });
  const task = engine.sendMessage({ channelId: channel.id, text: "Transfer me" }).task;
  await until(() => store.getTask(task.id).state === "done");
  expect(store.listTasks(channel.id)).toHaveLength(1);
  expect(store.getTask(task.id)).toMatchObject({
    ownerBotId: "a",
    requestMessageId: task.requestMessageId,
    assignmentCount: 2,
  });
  expect(seen).toHaveLength(2);
});

it("pauses an automatic loop at the budget and human resume alone permits another turn", async () => {
  let calls = 0;
  const { engine, store, channel } = await setup(async (input) => {
    calls++;
    await input.tool("transfer", { ownerBotId: input.task.ownerBotId === "lead" ? "a" : "lead" });
    return turn("transfer");
  });
  const task = engine.sendMessage({ channelId: channel.id, text: "Loop" }).task;
  await until(() => store.getTask(task.id).state === "paused");
  expect(calls).toBe(8);
  const input = store.getTask(task.id);
  expect(input.pauseReason).toContain("human");
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(calls).toBe(8);
  engine.actOnTask({ taskId: task.id, action: "resume" });
  await until(() => calls > 8);
});

it("keeps short answers in child tasks with the shared two-answer cap and channel memory in context", async () => {
  let answerMessage: string | undefined,
    roots = 0;
  const { engine, store, channel } = await setup(async (input) => {
    if (input.task.kind === "question") {
      return turn("short answer");
    }
    roots++;
    if (roots === 1) {
      await input.tool("remember", { text: "Channel only" });
      await input.tool("ask", { ownerBotId: "a", text: "Which format?" });
    } else if (roots === 2) {
      answerMessage = input.history.findLast((m) => m.kind === "reply")?.id;
      await input.tool("reply", { messageId: answerMessage, text: "One detail?" });
    } else {
      await expect(
        input.tool("reply", { messageId: input.history.findLast((m) => m.kind === "reply")?.id, text: "Third?" }),
      ).rejects.toThrow(/two|2/);
      return turn("done");
    }
    return turn("waiting");
  });
  const task = engine.sendMessage({ channelId: channel.id, text: "Short help" }).task;
  await until(() => store.getTask(task.id).state === "done");
  expect(store.listTasks(channel.id).filter((t) => t.parentTaskId === null)).toHaveLength(1);
  expect(store.listMessages(channel.id).filter((m) => m.kind === "reply")).toHaveLength(2);
  expect(store.listMemory(channel.id)[0].text).toBe("Channel only");
});

it("blocks dependencies, cancels children with their parent and recovers running work paused", async () => {
  let input: ChannelRunInput | undefined;
  const { engine, store, channel } = await setup(async (run) => {
    input = run;
    await new Promise<void>((resolve) => run.signal.addEventListener("abort", () => resolve(), { once: true }));
    return turn("stopped");
  });
  const parent = engine.sendMessage({ channelId: channel.id, text: "Wait" }).task;
  await until(() => !!input);
  if (!input) throw new Error("Missing active run.");
  await input.tool("assign", { ownerBotId: "a", text: "Child", dependencyTaskIds: [parent.id] }).then(
    () => {
      throw Error("expected rejection");
    },
    (e) => expect(String(e)).toMatch(/ancestor|depend/),
  );
  await input.tool("assign", { ownerBotId: "a", text: "Child" });
  engine.actOnTask({ taskId: parent.id, action: "stop" });
  expect(store.listTasks(channel.id).every((t: ChannelTask) => t.state === "cancelled")).toBe(true);
});

it("caps helper fan-out in one task and cannot finish while a child is still open", async () => {
  let helpers = 0;
  const { engine, store, channel } = await setup(async (input) => {
    if (input.task.parentTaskId) return turn("helper");
    for (let n = 0; n < 20; n++) {
      try {
        await input.tool("assign", { ownerBotId: "a", text: `help ${n}` });
        helpers++;
      } catch {
        break;
      }
      await expect(input.tool("result", { text: "too early" })).rejects.toThrow(/child|helper/);
    }
    return turn("waiting");
  });
  const task = engine.sendMessage({ channelId: channel.id, text: "Fan out" }).task;
  await until(() => store.getTask(task.id).state === "paused");
  expect(helpers).toBeLessThanOrEqual(8);
});
