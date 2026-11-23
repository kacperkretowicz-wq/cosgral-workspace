// @vitest-environment node
// COSGRAL W12 (BE-R): routines of a channel on the real database, with a fake channel, a fake clock and a fake task state.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgentEvent,
  CHANNEL_ROUTINE_LIMITS,
  type ChannelRoutineRun,
  type ChannelTaskState,
  isChannelRoutine,
  isChannelRoutineRun,
} from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChannelRoutineService, ChannelRoutineStore, routeWebhook } from "./channel-routines";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { WebhookReceiver } from "./webhook-receiver";
import { signWebhook } from "./webhook-signature";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "channel-routines-"));
});
afterEach(async () => {
  closeTestDatabases();
  await rm(root, { recursive: true, force: true });
});

async function setup() {
  const database = testDatabase(root);
  await database.initialize();
  let now = new Date("2026-11-18T10:00:00.000Z");
  const channels = new Map<string, { archived: boolean; leadBotId: string | null }>([
    ["c1", { archived: false, leadBotId: "chief" }],
    ["c2", { archived: false, leadBotId: null }],
  ]);
  const states = new Map<string, ChannelTaskState>();
  const sent: Array<{ channelId: string; text: string }> = [];
  const events: AgentEvent[] = [];
  const state = { sendFails: false };
  const store = new ChannelRoutineStore(database);
  const service = new ChannelRoutineService({
    store,
    channel: (channelId) => channels.get(channelId) ?? null,
    send: (channelId, text) => {
      if (state.sendFails) throw new Error("This channel is archived.");
      sent.push({ channelId, text });
      const id = `t${sent.length}`;
      states.set(id, "queued");
      return { messageId: `m${sent.length}`, taskId: id };
    },
    taskState: (taskId) => states.get(taskId) ?? null,
    emit: (event) => events.push(event),
    now: () => now,
    timeZone: () => "Europe/Warsaw",
    after: () => () => undefined,
  });
  return {
    database,
    store,
    service,
    channels,
    states,
    sent,
    events,
    state,
    at: (iso: string) => {
      now = new Date(iso);
    },
  };
}

const every30 = { type: "interval", everyMinutes: 30 } as const;
const weekly = (patch = {}) => ({
  channelId: "c1",
  name: "Review",
  prompt: "Summarise the week.",
  schedule: every30,
  ...patch,
});

describe("routines of a channel: making and changing them (W12 BE-R)", () => {
  it("makes a routine, plans its first start in the person's time zone and tells the window", async () => {
    const { service, events } = await setup();
    const routine = service.create(weekly());
    expect(isChannelRoutine(routine)).toBe(true);
    expect(routine).toMatchObject({
      channelId: "c1",
      name: "Review",
      timezone: "Europe/Warsaw",
      paused: false,
      nextRunAt: "2026-11-18T10:30:00.000Z",
      lastRunAt: null,
    });
    expect(service.list({ channelId: "c1" })).toHaveLength(1);
    expect(service.list({ channelId: "c2" })).toEqual([]);
    expect(events.at(-1)).toMatchObject({
      type: "channel-routines-changed",
      channelId: "c1",
      routines: [{ id: routine.id }],
    });
    const daily = service.create(weekly({ name: "Daily", schedule: { type: "daily", time: "11:30" } }));
    // 10:00 UTC is 11:00 in Warsaw in November: the next 11:30 is today, 10:30 UTC.
    expect(daily.nextRunAt).toBe("2026-11-18T10:30:00.000Z");
  });

  it("refuses what the rules refuse: a channel without a lead, a gone channel, a bad time zone, a bad schedule", async () => {
    const { service, channels } = await setup();
    expect(() => service.create(weekly({ channelId: "c2" }))).toThrow("no lead");
    expect(() => service.create(weekly({ channelId: "nope" }))).toThrow("no longer exists");
    expect(() => service.create(weekly({ timezone: "Mars/Base" }))).toThrow("time zone");
    expect(() => service.create(weekly({ schedule: { type: "interval", everyMinutes: 0 } }))).toThrow(
      "interval is from",
    );
    expect(() => service.create(weekly({ name: " " }))).toThrow("name");
    channels.set("c1", { archived: true, leadBotId: "chief" });
    expect(() => service.create(weekly())).toThrow("archived");
  });

  it("allows at most 16 routines in a channel", async () => {
    const { service } = await setup();
    for (let index = 0; index < CHANNEL_ROUTINE_LIMITS.perChannel; index += 1)
      service.create(weekly({ name: `R${index}` }));
    expect(() => service.create(weekly({ name: "one more" }))).toThrow("at most 16 routines");
  });

  it("pauses (no next start), resumes (a new one), changes the schedule and removes the routine with its history", async () => {
    const { service, at, store } = await setup();
    const routine = service.create(weekly());
    expect(service.update({ routineId: routine.id, paused: true })).toMatchObject({ paused: true, nextRunAt: null });
    at("2026-11-18T12:07:00.000Z");
    expect(service.update({ routineId: routine.id, paused: false })).toMatchObject({
      nextRunAt: "2026-11-18T12:37:00.000Z",
    });
    const changed = service.update({
      routineId: routine.id,
      schedule: { type: "interval", everyMinutes: 60 },
      name: "Hourly",
    });
    expect(changed).toMatchObject({ name: "Hourly", nextRunAt: "2026-11-18T13:07:00.000Z" });
    expect(service.update({ routineId: routine.id, prompt: "New text" }).nextRunAt).toBe("2026-11-18T13:07:00.000Z");
    expect(() => service.update({ routineId: routine.id, timezone: "Mars/Base" })).toThrow("time zone");
    service.runNow({ routineId: routine.id });
    service.delete({ routineId: routine.id });
    expect(service.list()).toEqual([]);
    expect(store.runs(routine.id)).toEqual([]);
    expect(() => service.delete({ routineId: routine.id })).toThrow("no longer exists");
  });
});

describe("routines of a channel: runs (W12 BE-R)", () => {
  it("starts at the planned time: the message with the name first, the next start moves, the task state is read live", async () => {
    const { service, sent, states, at } = await setup();
    const routine = service.create(weekly());
    service.tick();
    expect(sent).toEqual([]);
    at("2026-11-18T10:30:00.000Z");
    service.tick();
    expect(sent).toEqual([{ channelId: "c1", text: "Scheduled: Review\n\nSummarise the week." }]);
    const after = service.list({ channelId: "c1" })[0];
    expect(after).toMatchObject({ lastRunAt: "2026-11-18T10:30:00.000Z", nextRunAt: "2026-11-18T11:00:00.000Z" });
    const first = service.listRuns({ routineId: routine.id })[0];
    expect(isChannelRoutineRun(first)).toBe(true);
    expect(first).toMatchObject({
      cause: "schedule",
      outcome: "started",
      messageId: "m1",
      taskId: "t1",
      taskState: "queued",
    });
    states.set("t1", "done");
    expect(service.listRuns({ routineId: routine.id })[0]?.taskState).toBe("done");
    states.delete("t1");
    expect(service.listRuns({ routineId: routine.id })[0]?.taskState).toBeNull();
  });

  it("skips a start while the previous run is still going, and starts again when its task ended", async () => {
    const { service, sent, states, at } = await setup();
    const routine = service.create(weekly());
    at("2026-11-18T10:30:00.000Z");
    service.tick();
    at("2026-11-18T11:00:00.000Z");
    service.tick();
    expect(sent).toHaveLength(1);
    const runs = service.listRuns({ routineId: routine.id });
    expect(runs[0]).toMatchObject({ outcome: "skipped", reason: "The previous run is still going.", taskId: null });
    states.set("t1", "done");
    at("2026-11-18T11:30:00.000Z");
    service.tick();
    expect(sent).toHaveLength(2);
    expect(service.listRuns({ routineId: routine.id })[0]).toMatchObject({ outcome: "started", taskId: "t2" });
  });

  it("writes down a skip with the reason when the channel is archived or has no lead, or refuses the message", async () => {
    const { service, channels, state, at } = await setup();
    const routine = service.create(weekly());
    channels.set("c1", { archived: true, leadBotId: "chief" });
    at("2026-11-18T10:30:00.000Z");
    service.tick();
    expect(service.listRuns({ routineId: routine.id })[0]).toMatchObject({
      outcome: "skipped",
      reason: "This channel is archived.",
    });
    channels.set("c1", { archived: false, leadBotId: null });
    at("2026-11-18T11:00:00.000Z");
    service.tick();
    expect(service.listRuns({ routineId: routine.id })[0]?.reason).toContain("no lead");
    channels.set("c1", { archived: false, leadBotId: "chief" });
    state.sendFails = true;
    at("2026-11-18T11:30:00.000Z");
    service.tick();
    expect(service.listRuns({ routineId: routine.id })[0]).toMatchObject({
      outcome: "skipped",
      reason: "This channel is archived.",
    });
    expect(service.listRuns({ routineId: routine.id })).toHaveLength(3);
  });

  it("runs now without moving the next planned start, and refuses with the reason when it cannot", async () => {
    const { service, sent, at } = await setup();
    const routine = service.create(weekly());
    at("2026-11-18T10:10:00.000Z");
    const run = service.runNow({ routineId: routine.id });
    expect(run).toMatchObject({ cause: "manual", outcome: "started", taskState: "queued" });
    expect(sent).toHaveLength(1);
    expect(service.list()[0]).toMatchObject({
      nextRunAt: "2026-11-18T10:30:00.000Z",
      lastRunAt: "2026-11-18T10:10:00.000Z",
    });
    expect(() => service.runNow({ routineId: routine.id })).toThrow("previous run is still going");
    expect(service.listRuns({ routineId: routine.id })).toHaveLength(2);
  });

  it("does not start a paused routine", async () => {
    const { service, sent, at } = await setup();
    service.create(weekly({ paused: true }));
    at("2026-11-18T12:00:00.000Z");
    service.tick();
    expect(sent).toEqual([]);
  });

  it("at the start of the program writes down a missed start as skipped, moves the plan, and leaves a start that is just due", async () => {
    const { service, store, at, sent } = await setup();
    const late = service.create(weekly({ name: "Late" }));
    const due = service.create(weekly({ name: "Due", schedule: { type: "interval", everyMinutes: 60 } }));
    expect(late.nextRunAt).toBe("2026-11-18T10:30:00.000Z");
    expect(due.nextRunAt).toBe("2026-11-18T11:00:00.000Z");
    // 30 s after the start of "Due" is not missed; half an hour after "Late" is.
    at("2026-11-18T11:00:30.000Z");
    service.start();
    expect(sent).toEqual([]);
    const lateRuns = store.runs(late.id);
    expect(lateRuns[0]).toMatchObject({
      cause: "schedule",
      outcome: "skipped",
      reason: "The program was off at the planned time.",
      at: "2026-11-18T10:30:00.000Z",
    });
    expect(service.list().find((routine) => routine.id === late.id)).toMatchObject({
      nextRunAt: "2026-11-18T11:30:00.000Z",
    });
    expect(store.runs(due.id)).toEqual([]);
    expect(service.list().find((routine) => routine.id === due.id)).toMatchObject({
      nextRunAt: "2026-11-18T11:00:00.000Z",
    });
    service.dispose();
  });

  it("keeps the routines and their history across a restart, and at most 100 entries of history", async () => {
    const { service, store } = await setup();
    const routine = service.create(weekly());
    for (let index = 0; index < CHANNEL_ROUTINE_LIMITS.runsKept + 5; index += 1) {
      const run: ChannelRoutineRun = {
        id: `r${index}`,
        routineId: routine.id,
        at: new Date(Date.UTC(2026, 10, 18, 10, 0, index)).toISOString(),
        cause: "schedule",
        outcome: "skipped",
        reason: "x",
        messageId: null,
        taskId: null,
        taskState: null,
      };
      store.addRun(run);
    }
    expect(store.runs(routine.id)).toHaveLength(CHANNEL_ROUTINE_LIMITS.runsKept);
    expect(store.runs(routine.id)[0]?.id).toBe(`r${CHANNEL_ROUTINE_LIMITS.runsKept + 4}`);
    closeTestDatabases();
    const again = testDatabase(root);
    await again.initialize();
    const reopened = new ChannelRoutineStore(again);
    expect(reopened.list().map((item) => item.id)).toEqual([routine.id]);
    expect(reopened.runs(routine.id)).toHaveLength(CHANNEL_ROUTINE_LIMITS.runsKept);
  });
});

describe("webhook of a channel routine", () => {
  const box = {
    canEncrypt: () => true,
    encrypt: (plain: string) => `box:${Buffer.from(plain, "utf8").toString("base64")}`,
    decrypt: (cipher: string) => Buffer.from(cipher.slice(4), "base64").toString("utf8"),
  };

  async function webhookSetup(withBox = true) {
    const base = await setup();
    const store = new ChannelRoutineStore(base.database, withBox ? box : null);
    let now = new Date("2026-11-18T10:00:00.000Z");
    const service = new ChannelRoutineService({
      store,
      channel: (channelId) => base.channels.get(channelId) ?? null,
      send: (channelId, text) => {
        base.sent.push({ channelId, text });
        const id = `t${base.sent.length}`;
        base.states.set(id, "queued");
        return { messageId: `m${base.sent.length}`, taskId: id };
      },
      taskState: (taskId) => base.states.get(taskId) ?? null,
      emit: (event) => base.events.push(event),
      now: () => now,
      timeZone: () => "Europe/Warsaw",
      after: () => () => undefined,
      webhookBase: () => "http://127.0.0.1:8787",
    });
    const routine = service.create({
      channelId: "c1",
      name: "Deploy report",
      prompt: "Summarise the deploy.",
      schedule: { type: "interval", everyMinutes: 60 },
    });
    const deliver = (secret: string, id: string, body: string) => {
      const seconds = Math.floor(now.getTime() / 1000);
      const raw = Buffer.from(body, "utf8");
      return service.handleWebhook(
        routine.id,
        { id, timestamp: String(seconds), signature: signWebhook(secret, id, seconds, raw) },
        raw,
      );
    };
    return { ...base, store, service, routine, deliver, setNow: (iso: string) => (now = new Date(iso)) };
  }

  it("is off by default, answers 404 while off, and an unknown id is left to the routines of agents (null)", async () => {
    const { service, routine } = await webhookSetup();
    expect(routine.webhookEnabled).toBeUndefined();
    const empty = Buffer.from("{}");
    expect(service.handleWebhook(routine.id, { id: "d1", timestamp: "1", signature: "v1,x" }, empty)).toEqual({
      status: 404,
      body: { error: "unknown routine" },
    });
    expect(
      service.handleWebhook("not-a-channel-routine", { id: "d1", timestamp: "1", signature: "v1,x" }, empty),
    ).toBeNull();
  });

  it("turning it on gives the address and a secret once, kept encrypted; a signed delivery starts the routine with the body", async () => {
    const { service, routine, deliver, sent, database } = await webhookSetup();
    const on = service.enableWebhook({ routineId: routine.id });
    expect(on.url).toBe(`http://127.0.0.1:8787/webhooks/${routine.id}`);
    expect(on.secret.startsWith("whsec_")).toBe(true);
    expect(on.routine.webhookEnabled).toBe(true);
    expect(isChannelRoutine(on.routine)).toBe(true);
    const stored = database.connection.prepare("SELECT secret_encrypted FROM projection_channel_routine_secrets").all();
    expect(JSON.stringify(stored)).not.toContain(on.secret);
    expect(JSON.stringify(service.list())).not.toContain(on.secret);

    const answer = deliver(on.secret, "msg_1", '{"event":"deploy.finished","env":"prod"}');
    expect(answer).toMatchObject({ status: 202, body: { status: "accepted" } });
    expect(sent.at(-1)?.text).toContain("Scheduled: Deploy report");
    expect(sent.at(-1)?.text).toContain('Webhook:\n{"event":"deploy.finished","env":"prod"}');
    const runs = service.listRuns({ routineId: routine.id });
    expect(runs[0]).toMatchObject({ cause: "webhook", outcome: "started" });
    expect(runs.every(isChannelRoutineRun)).toBe(true);
  });

  it("refuses a wrong signature, an old timestamp and a repeat, and writes a paused routine's delivery down as skipped", async () => {
    const { service, routine, deliver, sent, setNow } = await webhookSetup();
    const { secret } = service.enableWebhook({ routineId: routine.id });
    expect(deliver("whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", "a", "{}")?.status).toBe(401);
    expect(deliver(secret, "b", "{}")?.status).toBe(202);
    expect(deliver(secret, "b", "{}")).toEqual({ status: 200, body: { status: "duplicate" } });
    expect(sent).toHaveLength(1);
    // A delivery signed for another time is refused (the timestamp tolerance of Standard Webhooks).
    const seconds = Math.floor(Date.parse("2026-11-18T09:00:00.000Z") / 1000);
    const raw = Buffer.from("{}");
    expect(
      service.handleWebhook(
        routine.id,
        { id: "c", timestamp: String(seconds), signature: signWebhook(secret, "c", seconds, raw) },
        raw,
      )?.status,
    ).toBe(401);
    service.update({ routineId: routine.id, paused: true });
    setNow("2026-11-18T10:05:00.000Z");
    expect(deliver(secret, "d", "{}")).toMatchObject({ status: 202, body: { status: "ignored" } });
    expect(service.listRuns({ routineId: routine.id })[0]).toMatchObject({
      cause: "webhook",
      outcome: "skipped",
      reason: "The routine is paused.",
    });
    expect(sent).toHaveLength(1);
  });

  it("a new secret replaces the old one; turning it off forgets the secret; deleting the routine removes it", async () => {
    const { service, routine, deliver, database } = await webhookSetup();
    const first = service.enableWebhook({ routineId: routine.id });
    const second = service.enableWebhook({ routineId: routine.id });
    expect(second.secret).not.toBe(first.secret);
    expect(deliver(first.secret, "x1", "{}")?.status).toBe(401);
    expect(deliver(second.secret, "x2", "{}")?.status).toBe(202);
    expect(service.disableWebhook({ routineId: routine.id }).webhookEnabled).toBe(false);
    expect(deliver(second.secret, "x3", "{}")?.status).toBe(404);
    service.enableWebhook({ routineId: routine.id });
    service.delete({ routineId: routine.id });
    const left = database.connection.prepare("SELECT COUNT(*) AS n FROM projection_channel_routine_secrets").get();
    expect(left).toEqual({ n: 0 });
  });

  it("without system encryption or a running receiver the webhook is not turned on, with a sentence", async () => {
    const noBox = await webhookSetup(false);
    expect(() => noBox.service.enableWebhook({ routineId: noBox.routine.id })).toThrow(/cannot be stored safely/);
    expect(noBox.service.list()[0]?.webhookEnabled).toBeUndefined();
  });
});

describe("the local receiver routes a real signed POST", () => {
  it("to the routine of a channel first and to the routines of agents for other ids", async () => {
    const base = await setup();
    const box = {
      canEncrypt: () => true,
      encrypt: (plain: string) => `box:${Buffer.from(plain, "utf8").toString("base64")}`,
      decrypt: (cipher: string) => Buffer.from(cipher.slice(4), "base64").toString("utf8"),
    };
    let receiverUrl: string | null = null;
    const service = new ChannelRoutineService({
      store: new ChannelRoutineStore(base.database, box),
      channel: (channelId) => base.channels.get(channelId) ?? null,
      send: (channelId, text) => {
        base.sent.push({ channelId, text });
        return { messageId: "m1", taskId: "t1" };
      },
      taskState: () => "queued",
      emit: () => undefined,
      timeZone: () => "Europe/Warsaw",
      after: () => () => undefined,
      webhookBase: () => receiverUrl,
    });
    const agentCalls: string[] = [];
    const receiver = new WebhookReceiver({
      handle: routeWebhook(() => service, {
        handleWebhook: async (routineId) => {
          agentCalls.push(routineId);
          return { status: 404, body: { error: "unknown routine" } };
        },
      }),
    });
    receiverUrl = await receiver.start(0);
    try {
      const routine = service.create({
        channelId: "c1",
        name: "Deploy report",
        prompt: "Summarise the deploy.",
        schedule: { type: "interval", everyMinutes: 60 },
      });
      const { url, secret } = service.enableWebhook({ routineId: routine.id });
      expect(url.startsWith("http://127.0.0.1:")).toBe(true);
      const body = '{"event":"deploy.finished"}';
      const seconds = Math.floor(Date.now() / 1000);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "webhook-id": "msg_live_1",
          "webhook-timestamp": String(seconds),
          "webhook-signature": signWebhook(secret, "msg_live_1", seconds, Buffer.from(body)),
        },
        body,
      });
      expect(response.status).toBe(202);
      expect(base.sent.at(-1)?.text).toContain('Webhook:\n{"event":"deploy.finished"}');
      expect(agentCalls).toEqual([]);
      const other = await fetch(`${receiverUrl}/webhooks/agent-routine-1`, { method: "POST", body: "{}" });
      expect(other.status).toBe(404);
      expect(agentCalls).toEqual(["agent-routine-1"]);
    } finally {
      await receiver.stop();
    }
  });
});
