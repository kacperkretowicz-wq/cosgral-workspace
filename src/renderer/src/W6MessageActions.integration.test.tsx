import type { ConversationMessage } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import { beforeEach, expect, it } from "vitest";
import { createMockMessageActions } from "../stories/mock-message-actions";
import { createMockOpenBot } from "../stories/mock-openbot";
import { App } from "./App";

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
});

it("adds a regenerated answer beside the old one and applies pin events", async () => {
  const messages: ConversationMessage[] = [
    { id: "u1", author: "user", text: "Original question", createdAt: "2026-11-16T12:00:00Z", status: "completed" },
    { id: "a1", author: "assistant", text: "Original answer", createdAt: "2026-11-16T12:00:01Z", status: "completed" },
  ];
  const mock = createMockOpenBot({
    snapshots: { chief: { botId: "chief", threadId: "thread-chief", revision: 0, activeTurnId: null, messages } },
  });
  window.openbot = mock.api;
  const actions = createMockMessageActions(mock.emitAgentEvent);
  actions.seed("chief", "thread-chief", messages);
  mock.api.messageActions = actions;
  const view = render(() => <App />);
  await screen.findByRole("heading", { name: "Chief" });
  const answer = (await screen.findByText("Original answer")).closest("article");
  if (!answer) throw new Error("missing message row");
  await fireEvent.pointerDown(within(answer).getByRole("button", { name: "More message actions" }), { button: 0 });
  await fireEvent.pointerUp(await screen.findByRole("menuitem", { name: "Retry" }), { button: 0 });
  expect(await screen.findByText("A new answer to the same message.")).toBeInTheDocument();
  expect(screen.getByText("Original answer")).toBeInTheDocument();
  expect(screen.getByText("Regenerated answer")).toBeInTheDocument();
  await actions.pin({ botId: "chief", threadId: "thread-chief", messageId: "a1", pinned: true });
  expect(await screen.findByText("Pinned")).toBeInTheDocument();
  view.unmount();
  mock.dispose();
});
it("counts raw later messages for edit confirmation even when thinking rows are grouped", async () => {
  const messages: ConversationMessage[] = [
    { id: "u1", author: "user", text: "Editable question", createdAt: "2026-11-16T12:00:00Z", status: "completed" },
    {
      id: "c1",
      turnId: "turn",
      author: "assistant",
      itemType: "commentary",
      text: "Checking first",
      createdAt: "2026-11-16T12:00:01Z",
      status: "completed",
    },
    {
      id: "c2",
      turnId: "turn",
      author: "assistant",
      itemType: "commentary",
      text: "Checking second",
      createdAt: "2026-11-16T12:00:02Z",
      status: "completed",
    },
    { id: "a1", author: "assistant", text: "Final answer", createdAt: "2026-11-16T12:00:03Z", status: "completed" },
  ];
  const mock = createMockOpenBot({
    snapshots: { chief: { botId: "chief", threadId: "thread-chief", revision: 0, activeTurnId: null, messages } },
  });
  window.openbot = mock.api;
  const view = render(() => <App />);
  await screen.findByRole("heading", { name: "Chief" });
  const row = (await screen.findByText("Editable question")).closest("article");
  if (!row) throw new Error("missing row");
  await fireEvent.pointerDown(within(row).getByRole("button", { name: "More message actions" }), { button: 0 });
  await fireEvent.pointerUp(await screen.findByRole("menuitem", { name: "Edit message" }), { button: 0 });
  expect(await screen.findByRole("dialog", { name: "Edit message" })).toHaveTextContent("remove 3 later messages");
  view.unmount();
  mock.dispose();
});
