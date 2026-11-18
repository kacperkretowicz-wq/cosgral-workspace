import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockTasksView } from "../../stories/mock-tasks-view";
import { TasksViewScreen } from "./TasksViewScreen";

let tasks = createMockTasksView();

beforeEach(() => {
  tasks = createMockTasksView();
  Object.assign(window, { openbot: { tasksView: tasks, agent: { onEvent: () => () => undefined } } });
});
afterEach(cleanup);

it("lists the tasks with counts for active and archived", async () => {
  render(() => <TasksViewScreen bots={[]} />);
  const active = await screen.findByRole("button", { name: /Active/ });
  expect(active).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("button", { name: /Archived/ })).toBeInTheDocument();
  expect(screen.getByText(/Hand off the work/)).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: /Needs you/ })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: /Failed/ })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: /Stopped/ })).toBeInTheDocument();
});

it("shows failed and stopped tasks on the board columns", async () => {
  const board = vi.spyOn(tasks, "board");
  render(() => <TasksViewScreen bots={[]} />);
  await waitFor(() => expect(board).toHaveBeenCalled());
  expect(await screen.findByText("Fetch the price list")).toBeInTheDocument();
  expect(await screen.findByText("Draft the press kit")).toBeInTheDocument();
});

it("switches to the archived tasks", async () => {
  const list = vi.spyOn(tasks, "list");
  render(() => <TasksViewScreen bots={[]} />);
  await screen.findByRole("button", { name: /Active/ });
  await fireEvent.click(screen.getByRole("button", { name: /Archived/ }));
  await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "archived" })));
});

it("opens the details of a task and offers Open as chat with the anchor", async () => {
  const open = vi.fn();
  render(() => <TasksViewScreen bots={[]} onOpenChannel={open} />);
  const rows = await screen.findAllByRole("button", { name: /#/ });
  const first = rows[0];
  if (!first) throw new Error("no task row");
  await fireEvent.click(first);
  await fireEvent.click(await screen.findByRole("button", { name: "Open as chat" }));
  expect(open).toHaveBeenCalledWith(expect.any(String), expect.any(String));
});

it("says so without the contract", () => {
  Object.assign(window, { openbot: {} });
  render(() => <TasksViewScreen bots={[]} />);
  expect(screen.getByText("The task list is not available in this version.")).toBeInTheDocument();
});
