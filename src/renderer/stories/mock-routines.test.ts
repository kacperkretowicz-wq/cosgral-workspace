// @vitest-environment node
import { type AgentEvent, isRoutine, isRoutineRun, isRoutineWithSecret } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockRoutines } from "./mock-routines";

const NOW = new Date(2026, 10, 17, 8, 0, 0);

function setup(seed = true) {
  const events: AgentEvent[] = [];
  const mock = createMockRoutines((event) => events.push(event), {
    botExists: (botId) => botId === "chief" || botId === "writer",
    seed: seed ? { botId: "chief" } : null,
    now: () => new Date(NOW),
  });
  return { mock, events };
}

describe("mock routines: the page", () => {
  it("starts with a weekly review and a webhook routine with history, or empty", async () => {
    const { mock } = setup();
    const list = await mock.api.list();
    expect(list.every(isRoutine)).toBe(true);
    expect(list.map((routine) => routine.trigger)).toEqual(["schedule", "webhook"]);
    const daily = list[0];
    // It is 08:00 on the 17th: the review is today at 09:00 (this computer's time).
    expect(daily?.nextRunAt).toBe(new Date(2026, 10, 17, 9, 0, 0).toISOString());
    expect(list[1]?.nextRunAt).toBeNull();
    const runs = await mock.api.listRuns({ routineId: "routine-demo" });
    expect(runs.every(isRoutineRun)).toBe(true);
    expect(runs.map((run) => run.status)).toEqual(["done", "skipped"]);
    expect(await setup(false).mock.api.list()).toEqual([]);
    expect(await mock.api.list("writer")).toEqual([]);
  });
});

describe("mock routines: saving", () => {
  it("a schedule routine gets its next start; a webhook routine gets a secret once", async () => {
    const { mock, events } = setup(false);
    const daily = await mock.api.create({
      botId: "chief",
      name: "Standup",
      prompt: "Summarise yesterday",
      trigger: "schedule",
      schedule: { type: "daily", time: "09:30", weekdays: [1, 2, 3, 4, 5] },
      timezone: "UTC",
    });
    expect(isRoutineWithSecret(daily)).toBe(true);
    expect(daily.secret).toBeNull();
    expect(daily.routine.nextRunAt).not.toBeNull();
    const hook = await mock.api.create({
      botId: "chief",
      name: "Hook",
      prompt: "React",
      trigger: "webhook",
      eventTypes: [" a ", "a", "b"],
    });
    expect(hook.secret).toBe("whsec_DEMO_ONLY");
    expect(hook.routine.webhook?.eventTypes).toEqual(["a", "b"]);
    expect(hook.routine.nextRunAt).toBeNull();
    expect(events.filter((event) => event.type === "routines-changed")).toHaveLength(2);
    const again = await mock.api.regenerateSecret({ routineId: hook.routine.id });
    expect(again.secret).toBe("whsec_DEMO_REPLACEMENT");
    await expect(mock.api.regenerateSecret({ routineId: daily.routine.id })).rejects.toThrow(/Only a webhook routine/);
  });

  it("checks the schedule, the texts and the agent with the program's sentences", async () => {
    const { mock } = setup(false);
    const base = { botId: "chief", name: "X", prompt: "Do", trigger: "schedule" as const };
    await expect(mock.api.create({ ...base, schedule: { type: "interval", everyMinutes: 0 } })).rejects.toThrow(
      /whole number of minutes/,
    );
    await expect(mock.api.create({ ...base, schedule: { type: "daily", time: "25:00" } })).rejects.toThrow(/HH:MM/);
    await expect(
      mock.api.create({ ...base, schedule: { type: "daily", time: "09:00", weekdays: [7] } }),
    ).rejects.toThrow(/weekdays/);
    await expect(mock.api.create({ ...base, schedule: { type: "cron", expression: "* *" } })).rejects.toThrow(
      /five fields/,
    );
    await expect(mock.api.create({ ...base })).rejects.toThrow(/needs a schedule/);
    await expect(
      mock.api.create({ ...base, name: " ", schedule: { type: "interval", everyMinutes: 5 } }),
    ).rejects.toThrow(/routine name/);
    await expect(
      mock.api.create({ ...base, botId: "ghost", schedule: { type: "interval", everyMinutes: 5 } }),
    ).rejects.toThrow(/no longer exists/);
  });

  it("pausing clears the next start, resuming brings it back, a webhook routine takes no schedule", async () => {
    const { mock } = setup();
    const paused = await mock.api.update({ routineId: "routine-demo", paused: true });
    expect(paused.nextRunAt).toBeNull();
    const resumed = await mock.api.update({
      routineId: "routine-demo",
      paused: false,
      schedule: { type: "interval", everyMinutes: 30 },
    });
    expect(resumed.nextRunAt).toBe(new Date(NOW.getTime() + 30 * 60_000).toISOString());
    await expect(
      mock.api.update({ routineId: "rt-demo-pipeline", schedule: { type: "interval", everyMinutes: 5 } }),
    ).rejects.toThrow(/no schedule/);
    await mock.api.delete({ routineId: "rt-demo-pipeline" });
    await expect(mock.api.listRuns({ routineId: "rt-demo-pipeline" })).rejects.toThrow(/no routine/);
  });
});

describe("mock routines: running", () => {
  it("run now starts one run at a time, finishing it frees the routine, a paused one is not started", async () => {
    const { mock, events } = setup();
    const run = await mock.api.runNow({ routineId: "routine-demo" });
    expect(run).toMatchObject({ cause: "manual", status: "running", finishedAt: null });
    expect(events.at(-1)).toMatchObject({ type: "routine-run" });
    await expect(mock.api.runNow({ routineId: "routine-demo" })).rejects.toThrow(/already running/);
    expect(mock.simulate.finishRun(run.id).status).toBe("done");
    expect(() => mock.simulate.finishRun(run.id)).toThrow(/already ended/);
    const again = await mock.api.runNow({ routineId: "routine-demo" });
    expect(mock.simulate.finishRun(again.id, { status: "failed", reason: "The agent is busy." })).toMatchObject({
      status: "failed",
      reason: "The agent is busy.",
    });
    await mock.api.update({ routineId: "routine-demo", paused: true });
    await expect(mock.api.runNow({ routineId: "routine-demo" })).rejects.toThrow(/paused/);
  });

  it("a webhook starts a run, an unknown event type is ignored, a busy routine skips", () => {
    const { mock } = setup();
    expect(mock.simulate.webhook("rt-demo-pipeline", "pipeline.finished")).toMatchObject({
      cause: "webhook",
      status: "running",
    });
    expect(mock.simulate.webhook("rt-demo-pipeline", "pipeline.finished")).toMatchObject({ status: "skipped" });
    expect(mock.simulate.webhook("rt-demo-pipeline", "other.event")).toMatchObject({ status: "ignored" });
    expect(() => mock.simulate.webhook("routine-demo")).toThrow(/Only a webhook routine/);
  });
});
