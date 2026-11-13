import type { AgentEvent, ChannelTask, WorkspaceChannel } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TasksPage } from "./TasksPage";

afterEach(() => vi.unstubAllGlobals());

function channel(id: string, name: string): WorkspaceChannel {
  return {
    id,
    name,
    title: "",
    instructions: "",
    leadBotId: null,
    memberBotIds: [],
    isolated: false,
    archived: false,
    createdAt: "2026-11-13T08:00:00.000Z",
    updatedAt: "2026-11-13T08:00:00.000Z",
  };
}

function task(overrides: Partial<ChannelTask>): ChannelTask {
  return {
    id: "t1",
    channelId: "c1",
    ownerBotId: "b1",
    state: "running",
    title: "Write the report",
    requestMessageId: "m1",
    resultMessageId: null,
    parentTaskId: null,
    dependencyTaskIds: [],
    resourceKey: null,
    assignmentCount: 1,
    archivedAt: null,
    createdAt: "2026-11-13T10:00:00.000Z",
    updatedAt: "2026-11-13T10:00:00.000Z",
    ...overrides,
  };
}

function setup(tasks: Record<string, ChannelTask[]>, actOnTask = vi.fn()) {
  let listener: (event: AgentEvent) => void = () => undefined;
  vi.stubGlobal("openbot", {
    channels: {
      list: vi.fn().mockResolvedValue([channel("c1", "design"), channel("c2", "backend")]),
      listTasks: vi.fn(async (id: string) => tasks[id] ?? []),
      actOnTask,
    },
    agent: {
      onEvent: (fn: (event: AgentEvent) => void) => {
        listener = fn;
        return () => undefined;
      },
    },
  });
  render(() => <TasksPage bots={[{ id: "b1", name: "Writer" }]} />);
  return { emit: (event: AgentEvent) => listener(event) };
}

describe("Tasks page", () => {
  it("lists the tasks of every channel, newest first, with channel, owner and state", async () => {
    setup({
      c1: [task({ id: "old", title: "Older task", state: "done", updatedAt: "2026-11-13T09:00:00.000Z" })],
      c2: [task({ id: "new", channelId: "c2", title: "Newer task", state: "waiting" })],
    });
    const rows = await screen.findAllByRole("listitem");
    expect(rows.map((row) => within(row).getByRole("heading").textContent)).toEqual(["Newer task", "Older task"]);
    expect(rows[0]).toHaveTextContent("#backend");
    expect(rows[0]).toHaveTextContent("Writer");
    expect(rows[0]).toHaveTextContent("Waiting");
  });

  it("filters by state and keeps archived tasks apart", async () => {
    setup({
      c1: [
        task({ id: "a", title: "Running task", state: "running" }),
        task({ id: "b", title: "Finished task", state: "done" }),
        task({ id: "c", title: "Archived task", state: "done", archivedAt: "2026-11-13T11:00:00.000Z" }),
      ],
    });
    await screen.findByText("Running task");
    expect(screen.queryByText("Archived task")).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByText("Running task")).toBeInTheDocument();
    expect(screen.queryByText("Finished task")).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Archived" }));
    expect(screen.getByText("Archived task")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  it("offers only the actions the task's state allows and applies the answer", async () => {
    const actOnTask = vi.fn(async (input: { taskId: string; action: string }) =>
      task({ id: input.taskId, state: "paused", title: "Write the report" }),
    );
    setup({ c1: [task({ id: "t1", state: "running" })] }, actOnTask);
    const row = firstRow(await screen.findAllByRole("listitem"));
    expect(within(row).queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    await fireEvent.click(within(row).getByRole("button", { name: "Pause" }));
    expect(actOnTask).toHaveBeenCalledWith({ taskId: "t1", action: "pause" });
    // The row is drawn again for the task the engine answered with.
    expect(await screen.findByRole("button", { name: "Resume" })).toBeInTheDocument();
    const paused = firstRow(screen.getAllByRole("listitem"));
    expect(paused).toHaveTextContent("Paused");
    expect(within(paused).getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(within(paused).queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
  });

  it("follows task-changed events", async () => {
    const { emit } = setup({ c1: [] });
    expect(await screen.findByText("No tasks here yet.")).toBeInTheDocument();
    const changed: AgentEvent = { type: "task-changed", task: task({ id: "live", title: "Live task" }) };
    emit(changed);
    expect(await screen.findByText("Live task")).toBeInTheDocument();
  });
});

function firstRow(rows: HTMLElement[]): HTMLElement {
  const row = rows[0];
  if (!row) throw new Error("No task row");
  return row;
}
