// @vitest-environment node
import { type AgentEvent, isChannelRoutine, isChannelRoutineRun, type WorkspaceChannel } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockChannelRoutines } from "./mock-channel-routines";

const channel = (patch: Partial<WorkspaceChannel> = {}): WorkspaceChannel => ({
  id: "c1",
  name: "project",
  title: "Project",
  instructions: "",
  leadBotId: "chief",
  memberBotIds: ["chief"],
  isolated: false,
  archived: false,
  createdAt: "2026-11-18T09:00:00.000Z",
  updatedAt: "2026-11-18T09:00:00.000Z",
  ...patch,
});

const input = {
  channelId: "c1",
  name: "Review",
  prompt: "Summarise.",
  schedule: { type: "interval", everyMinutes: 30 },
} as const;

function setup(channels = [channel()]) {
  const events: AgentEvent[] = [];
  const mock = createMockChannelRoutines({ channels: () => channels, emit: (event) => events.push(event) });
  return { mock, events, channels };
}

describe("mock routines of a channel (W12 BE-R)", () => {
  it("makes, lists, changes and removes routines with the same rules as the program, and says so", async () => {
    const { mock, events } = setup();
    const routine = await mock.create(input);
    expect(isChannelRoutine(routine)).toBe(true);
    expect(routine.nextRunAt).toBe("2026-11-18T10:30:00.000Z");
    expect(events.at(-1)).toMatchObject({ type: "channel-routines-changed", channelId: "c1" });
    expect(await mock.list({ channelId: "c1" })).toHaveLength(1);
    expect(await mock.update({ routineId: routine.id, paused: true })).toMatchObject({ paused: true, nextRunAt: null });
    await mock.delete({ routineId: routine.id });
    expect(await mock.list()).toEqual([]);
    await expect(mock.create({ ...input, channelId: "nope" })).rejects.toThrow("no longer exists");
    await expect(mock.create({ ...input, name: "" })).rejects.toThrow("name");
    await expect(mock.update({ routineId: "nope", paused: true })).rejects.toThrow("no longer exists");
  });

  it("starts a run when the time comes, keeps one run at a time, and reads the task state live", async () => {
    const { mock } = setup();
    const routine = await mock.create(input);
    mock.tick(29);
    expect(mock.sent()).toEqual([]);
    mock.tick(1);
    expect(mock.sent()).toMatchObject([{ channelId: "c1", text: "Scheduled: Review\n\nSummarise." }]);
    mock.tick(30);
    const runs = await mock.listRuns({ routineId: routine.id });
    expect(runs.every(isChannelRoutineRun)).toBe(true);
    expect(runs[0]).toMatchObject({ outcome: "skipped", reason: "The previous run is still going." });
    expect(runs[1]).toMatchObject({ outcome: "started", taskState: "queued" });
    mock.setTaskState(runs[1]?.taskId ?? "", "done");
    expect((await mock.listRuns({ routineId: routine.id }))[1]?.taskState).toBe("done");
    mock.tick(30);
    expect(mock.sent()).toHaveLength(2);
  });

  it("runs now without moving the plan, and refuses with the reason (archived channel, run still going)", async () => {
    const { mock, channels } = setup();
    const routine = await mock.create(input);
    const run = await mock.runNow({ routineId: routine.id });
    expect(run).toMatchObject({ cause: "manual", outcome: "started" });
    expect((await mock.list())[0]?.nextRunAt).toBe("2026-11-18T10:30:00.000Z");
    await expect(mock.runNow({ routineId: routine.id })).rejects.toThrow("still going");
    mock.setTaskState(run.taskId ?? "", "done");
    channels[0] = channel({ archived: true });
    await expect(mock.runNow({ routineId: routine.id })).rejects.toThrow("archived");
  });
});
