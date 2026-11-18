import type { AgentEvent, ThreadSummary } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, it } from "vitest";
import { createMockThreads } from "../../stories/mock-threads";
import { ThreadPanel } from "./ThreadPanel";

afterEach(cleanup);

function thread(id: string, title: string, active = false): ThreadSummary {
  return {
    id,
    botId: "chief",
    title,
    titled: true,
    state: "idle",
    active,
    unread: 0,
    queued: 0,
    needsYou: 0,
    createdAt: "2026-11-16T12:00:00Z",
    updatedAt: "2026-11-16T12:00:00Z",
    archivedAt: null,
    preview: "",
    parentThreadId: null,
    parentTitle: null,
    branchedFromMessageId: null,
  };
}

function fixture() {
  const listeners = new Set<(event: AgentEvent) => void>();
  const api = createMockThreads(
    (event) => {
      for (const listener of listeners) listener(event);
    },
    { chief: [thread("first", "First", true), thread("second", "Second")] },
    { clock: () => new Date() },
  );
  const onEvent = (listener: (event: AgentEvent) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return { api, onEvent };
}

async function click(name: string) {
  const button = await screen.findByRole("button", { name });
  await waitFor(() => expect(button).toBeEnabled());
  await fireEvent.click(button);
}

it("deletes with undo, shows the bar and brings the thread back", async () => {
  const f = fixture();
  render(() => <ThreadPanel botId="chief" api={f.api} undoApi={f.api.undo} onEvent={f.onEvent} />);
  await fireEvent.click(screen.getByText(/^Threads:/));
  await click("Delete Second");
  await click("Delete");
  expect(await screen.findByText("Deleted “Second”")).toBeInTheDocument();
  expect((await f.api.list({ botId: "chief" })).threads.some((t) => t.id === "second")).toBe(false);
  await click("Undo");
  await waitFor(async () =>
    expect((await f.api.list({ botId: "chief" })).threads.some((t) => t.id === "second")).toBe(true),
  );
  await waitFor(() => expect(screen.queryByText("Deleted “Second”")).not.toBeInTheDocument());
});

it("shows threads that were already waiting after a refresh", async () => {
  const f = fixture();
  await f.api.undo.delete({ botId: "chief", threadId: "second", confirm: true });
  render(() => <ThreadPanel botId="chief" api={f.api} undoApi={f.api.undo} onEvent={f.onEvent} />);
  expect(await screen.findByText("Deleted “Second”")).toBeInTheDocument();
});
