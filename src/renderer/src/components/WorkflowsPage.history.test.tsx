import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resetWorkflowDraft, WorkflowsPage } from "./WorkflowsPage";

beforeEach(() => {
  resetWorkflowDraft();
  Object.assign(window, {
    openbot: {
      agent: { listBots: async () => [], onEvent: () => () => undefined },
      channels: { list: async () => [] },
      routines: { list: async () => [] },
      workflows: { list: async () => [], listRuns: async () => [] },
    },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const stepCount = () => document.querySelectorAll("[data-workflow-node]").length;
const undo = () => screen.getByRole("button", { name: "Undo" });
const redo = () => screen.getByRole("button", { name: "Redo" });

it("undoes and redoes adding steps, with buttons and with Ctrl+Z", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  render(() => <WorkflowsPage />);
  expect(undo()).toBeDisabled();
  await fireEvent.click(await screen.findByRole("button", { name: "Add trigger" }));
  vi.setSystemTime(Date.now() + 5000);
  await fireEvent.click(screen.getByRole("button", { name: "Add agent" }));
  expect(stepCount()).toBe(2);
  expect(undo()).toBeEnabled();

  await fireEvent.click(undo());
  expect(stepCount()).toBe(1);
  expect(redo()).toBeEnabled();
  await fireEvent.click(redo());
  expect(stepCount()).toBe(2);

  const editor = screen.getByRole("region", { name: "Workflow" });
  await fireEvent.keyDown(editor, { key: "z", ctrlKey: true });
  expect(stepCount()).toBe(1);
  await fireEvent.keyDown(editor, { key: "z", ctrlKey: true, shiftKey: true });
  expect(stepCount()).toBe(2);
  await fireEvent.keyDown(editor, { key: "z", ctrlKey: true });
  await fireEvent.keyDown(editor, { key: "y", ctrlKey: true });
  expect(stepCount()).toBe(2);
});

it("leaves Ctrl+Z to a text field that has the focus", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  render(() => <WorkflowsPage />);
  await fireEvent.click(await screen.findByRole("button", { name: "Add trigger" }));
  vi.setSystemTime(Date.now() + 5000);
  await fireEvent.click(screen.getByRole("button", { name: "Add agent" }));
  await fireEvent.keyDown(screen.getByRole("textbox", { name: "Name" }), { key: "z", ctrlKey: true });
  expect(stepCount()).toBe(2);
});

it("keeps the draft when the page is left and opened again", async () => {
  const first = render(() => <WorkflowsPage />);
  await fireEvent.click(await screen.findByRole("button", { name: "Add trigger" }));
  await fireEvent.input(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Moje szkice" } });
  first.unmount();

  render(() => <WorkflowsPage />);
  expect(stepCount()).toBe(1);
  expect(await screen.findByRole("textbox", { name: "Name" })).toHaveValue("Moje szkice");
  // The undo steps stay too.
  expect(undo()).toBeEnabled();
});
