import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { createMockMessageActions } from "../../stories/mock-message-actions";
import { MessageHistoryActions } from "./MessageHistoryActions";

afterEach(() => {
  cleanup();
  Object.assign(window, { openbot: {} });
});

// The person's own message: edit and retry are offered on it (an agent message cannot be edited).
const message = { id: "m1", author: "you" as const, body: "Original question", time: "now" };

function mountMenu(reasonForRetry: string | null) {
  const api = createMockMessageActions(() => {});
  api.seed("chief", "thread-chief", [
    { id: "m1", author: "user", text: "Original question", createdAt: "2026-11-16T12:00:00Z", status: "completed" },
    { id: "m2", author: "assistant", text: "Original answer", createdAt: "2026-11-16T12:00:01Z", status: "completed" },
  ]);
  const action = (id: string, reason: string | null = null) => ({
    id,
    enabled: reason === null,
    reason,
    needsConfirmation: id === "delete",
    active: false,
  });
  Object.assign(window, {
    openbot: {
      messageMenu: {
        get: vi.fn().mockResolvedValue({
          botId: "chief",
          threadId: "thread-chief",
          messageId: "m1",
          pinned: false,
          actions: [
            action("copy"),
            action("pin"),
            action("branch"),
            action("retry", reasonForRetry),
            action("edit"),
            action("delete"),
          ],
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
      onCopy={() => undefined}
      onBranch={() => undefined}
    />
  ));
}

// KK-AC (MISS 1 of the 17-11-g shots): the menu of a message lists Copy, Pin, Branch, Retry, Edit and Delete.
it("lists all six actions of a message when the menu is opened with one press", async () => {
  mountMenu(null);
  fireEvent.pointerDown(screen.getByRole("button", { name: "More message actions" }), { button: 0 });
  for (const name of [/^Copy$/, /^Pin message$/, /^Branch from here/, /^Retry/, /^Edit message$/, /^Delete message$/]) {
    expect(await screen.findByRole("menuitem", { name })).toBeInTheDocument();
  }
});

it("marks an action the engine refuses as disabled and says why, instead of hiding it", async () => {
  const reason = "Only your own messages can be retried here.";
  mountMenu(reason);
  fireEvent.pointerDown(screen.getByRole("button", { name: "More message actions" }), { button: 0 });
  const retry = await screen.findByRole("menuitem", { name: /^Retry/ });
  await waitFor(() => expect(retry).toHaveAttribute("aria-disabled", "true"));
  expect(screen.getByText(reason)).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /^Edit message$/ })).not.toHaveAttribute("aria-disabled", "true");
});
