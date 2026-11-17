import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { expect, it, vi } from "vitest";
import { createMockMessageActions } from "../../stories/mock-message-actions";
import { MessageHistoryActions } from "./MessageHistoryActions";

function fixture() {
  const api = createMockMessageActions(() => {});
  api.seed("chief", "thread-chief", [
    { id: "m1", author: "user", text: "Original question", createdAt: "2026-11-16T12:00:00Z", status: "completed" },
    { id: "m2", author: "assistant", text: "Original answer", createdAt: "2026-11-16T12:00:01Z", status: "completed" },
  ]);
  return api;
}
const message = { id: "m1", author: "you" as const, body: "Original question", time: "now" };
it("requires explicit delete confirmation and targets only this message", async () => {
  const api = fixture();
  const remove = vi.spyOn(api, "delete");
  render(() => (
    <MessageHistoryActions
      botId="chief"
      threadId="thread-chief"
      message={message}
      laterMessages={1}
      busyMessages={0}
      turnRunning={false}
      api={api}
    />
  ));
  fireEvent.pointerDown(screen.getByRole("button", { name: "More message actions" }), { button: 0 });
  fireEvent.pointerUp(await screen.findByRole("menuitem", { name: "Delete message" }), { button: 0 });
  const dialog = within(await screen.findByRole("dialog", { name: "Delete message?" }));
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(dialog.getByRole("button", { name: "Delete message" }));
  await waitFor(() =>
    expect(remove).toHaveBeenCalledWith({ botId: "chief", threadId: "thread-chief", messageId: "m1", confirm: true }),
  );
});
it("explains removal of later messages before editing and sending", async () => {
  const api = fixture();
  const edit = vi.spyOn(api, "edit");
  render(() => (
    <MessageHistoryActions
      botId="chief"
      threadId="thread-chief"
      message={message}
      laterMessages={1}
      busyMessages={0}
      turnRunning={false}
      api={api}
    />
  ));
  fireEvent.pointerDown(screen.getByRole("button", { name: "More message actions" }), { button: 0 });
  fireEvent.pointerUp(await screen.findByRole("menuitem", { name: "Edit message" }), { button: 0 });
  const dialog = within(await screen.findByRole("dialog", { name: "Edit message" }));
  expect(dialog.getByText(/remove 1 later message/)).toBeInTheDocument();
  await fireEvent.input(dialog.getByLabelText("Message text"), { target: { value: "Revised question" } });
  await fireEvent.click(dialog.getByRole("button", { name: "Replace and send" }));
  await waitFor(() =>
    expect(edit).toHaveBeenCalledWith({
      botId: "chief",
      threadId: "thread-chief",
      messageId: "m1",
      text: "Revised question",
      confirm: true,
    }),
  );
});
it("explains a busy refusal while keeping pin enabled", async () => {
  const api = fixture();
  render(() => (
    <MessageHistoryActions
      botId="chief"
      threadId="thread-chief"
      message={message}
      laterMessages={1}
      busyMessages={1}
      turnRunning
      api={api}
    />
  ));
  fireEvent.pointerDown(screen.getByRole("button", { name: "More message actions" }), { button: 0 });
  const retry = await screen.findByRole("menuitem", { name: /Retry.*This thread is busy/ });
  expect(retry).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("menuitem", { name: "Pin message" })).not.toHaveAttribute("aria-disabled", "true");
});

it("shows the reason the engine gives for an action that is not offered now", async () => {
  const api = fixture();
  const reason = "An agent has at most 200 threads.";
  Object.assign(window, {
    openbot: {
      messageMenu: {
        get: vi.fn().mockResolvedValue({
          botId: "chief",
          threadId: "thread-chief",
          messageId: "m1",
          pinned: false,
          actions: [{ id: "branch", enabled: false, reason, needsConfirmation: false, active: false }],
          reactions: { quick: [], more: [], current: null },
        }),
      },
    },
  });
  render(() => (
    <MessageHistoryActions
      botId="chief"
      threadId="thread-chief"
      message={message}
      laterMessages={0}
      busyMessages={0}
      turnRunning={false}
      api={api}
      onBranch={() => undefined}
    />
  ));
  fireEvent.pointerDown(screen.getByRole("button", { name: "More message actions" }), { button: 0 });
  expect(await screen.findByText(reason)).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /Branch from here/ })).toHaveAttribute("aria-disabled", "true");
  Object.assign(window, { openbot: {} });
});
