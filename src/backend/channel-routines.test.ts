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
import { ChannelRoutineService, ChannelRoutineStore } from "./channel-routines";
import { closeTestDatabases, testDatabase } from "./testing/databases";

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
const weekly = (patch = {}) => ({ channelId: "c1", name: "Review", prompt: "Summarise the week.", schedule: every30, ...patch });

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
    expect(events.at(-1)).toMatchObject({ type: "channel-routines-changed", channelId: "c1", routines: [{ id: routine.id }] });
    const daily = service.create(weekly({ name: "Daily", schedule: { type: "daily", time: "11:30" } }));
    // 10:00 UTC is 11:00 in Warsaw in November: the next 11:30 is today, 10:30 UTC.
    expect(daily.nextRunAt).toBe("2026-11-18T10:30:00.000Z");
  });

  it("refuses what the rules refuse: a channel without a lead, a gone channel, a bad time zone, a bad schedule", async () => {
    const { service, channels } = await setup();
    expect(() => service.create(weekly({ channelId: "c2" }))).toThrow("no lead");
    expect(() => service.create(weekly({ channelId: "nope" }))).toThrow("no longer exists");
    expect(() => service.create(weekly({ timezone: "Mars/Base" }))).toThrow("time zone");
    expect(() => service.create(weekly({ schedule: { type: "interval", everyMinutes: 0 } }))).toThrow("interval is from");
    expect(() => service.create(weekly({ name: " " }))).toThrow("name");
    channels.set("c1", { archived: true, leadBotId: "chief" });
    expect(() => service.create(weekly())).toThrow("archived");
  });

  it("allows at most 16 routines in a channel", async () => {
    const { service } = await setup();
    for (let index = 0; index < CHANNEL_ROUTINE_LIMITS.perChannel; index += 1) service.create(weekly({ name: `R${index}` }));
    expect(() => service.create(weekly({ name: "one more" }))).toThrow("at most 16 routines");
  });

  it("pauses (no next start), resumes (a new one), changes the schedule and removes the routine with its history", async () => {
    const { service, at, store } = await setup();
    const routine = service.create(weekly());
    expect(service.update({ routineId: routine.id, paused: true })).toMatchObject({ paused: true, nextRunAt: null });
    at("2026-11-18T12:07:00.000Z");
    expect(service.update({ routineId: routine.id, paused: false })).toMatchObject({ nextRunAt: "2026-11-18T12:37:00.000Z" });
    const changed = service.update({ routineId: routine.id, schedule: { type: "interval", everyMinutes: 60 }, name: "Hourly" });
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
    expect(first).toMatchObject({ cause: "schedule", outcome: "started", messageId: "m1", taskId: "t1", taskState: "queued" });
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
    expect(service.listRuns({ routineId: routine.id })[0]).toMatchObject({ outcome: "skipped", reason: "This channel is archived." });
    channels.set("c1", { archived: false, leadBotId: null });
    at("2026-11-18T11:00:00.000Z");
    service.tick();
    expect(service.listRuns({ routineId: routine.id })[0]?.reason).toContain("no lead");
    channels.set("c1", { archived: false, leadBotId: "chief" });
    state.sendFails = true;
    at("2026-11-18T11:30:00.000Z");
    service.tick();
    expect(service.listRuns({ routineId: routine.id })[0]).toMatchObject({ outcome: "skipped", reason: "This channel is archived." });
    expect(service.listRuns({ routineId: routine.id })).toHaveLength(3);
  });

  it("runs now without moving the next planned start, and refuses with the reason when it cannot", async () => {
    const { service, sent, at } = await setup();
    const routine = service.create(weekly());
    at("2026-11-18T10:10:00.000Z");
    const run = service.runNow({ routineId: routine.id });
    expect(run).toMatchObject({ cause: "manual", outcome: "started", taskState: "queued" });
    expect(sent).toHaveLength(1);
    expect(service.list()[0]).toMatchObject({ nextRunAt: "2026-11-18T10:30:00.000Z", lastRunAt: "2026-11-18T10:10:00.000Z" });
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
    expect(service.list().find((routine) => routine.id === late.id)).toMatchObject({ nextRunAt: "2026-11-18T11:30:00.000Z" });
    expect(store.runs(due.id)).toEqual([]);
    expect(service.list().find((routine) => routine.id === due.id)).toMatchObject({ nextRunAt: "2026-11-18T11:00:00.000Z" });
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
