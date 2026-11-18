// @vitest-environment node
import { isTaskDetail, isTasksViewPage } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockTasksView } from "./mock-tasks-view";

describe("mock tasks view (W12 BE-J)", () => {
  it("lists the active tasks of the sample, newest first, and the archive on request", async () => {
    const mock = createMockTasksView();
    const page = await mock.list();
    expect(isTasksViewPage(page)).toBe(true);
    expect(page.items.map((item) => item.task.title)).toEqual([
      "Compare the competitors",
      "Write the launch post",
      "Collect the facts",
    ]);
    expect(page.items[1]).toMatchObject({
      stepCount: 1,
      stepsDone: 1,
      resultPreview: "Here is the post. It is short and clear.",
    });
    expect(page.counts).toMatchObject({ active: 3, archived: 1 });
    expect((await mock.list({ scope: "archived" })).items.map((item) => item.task.id)).toEqual(["sample-task-4"]);
    expect((await mock.list({ states: ["running"] })).total).toBe(1);
  });

  it("gives the detail with the result, the steps, the log and what the task allows", async () => {
    const detail = await createMockTasksView().detail({ taskId: "sample-task-1" });
    expect(isTaskDetail(detail)).toBe(true);
    expect(detail.result?.text).toContain("It is short and clear.");
    expect(detail.steps.map((step) => step.title)).toEqual(["Collect the facts"]);
    expect(detail.log.map((entry) => entry.kind)).toEqual(["assigned", "result"]);
    expect(detail.openAsChat).toEqual({ channelId: "sample-channel", anchorMessageId: "sample-request" });
    expect(detail.actions.find((action) => action.action === "pause")).toMatchObject({ enabled: false });
  });

  it("refuses a task that is not there and a query it cannot answer, like the program", async () => {
    const mock = createMockTasksView();
    await expect(mock.detail({ taskId: "nope" })).rejects.toThrow("no longer exists");
    await expect(mock.list({ limit: 0 })).rejects.toThrow("whole number");
  });

  it("answers from the data it is given, so a window can share its channels", async () => {
    const mock = createMockTasksView({
      channels: () => [],
      tasks: () => [],
      messages: () => [],
    });
    expect((await mock.list()).total).toBe(0);
  });
});
