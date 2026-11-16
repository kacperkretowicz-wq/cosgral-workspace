import type { AgentEvent, ThreadSummary } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { createMockThreads } from "../../stories/mock-threads";
import { promptCard } from "../pending-cards";
import { cardsInThread, threadAttentionItems, threadRowLabel } from "../thread-view";
import { ThreadPanel } from "./ThreadPanel";

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
      listeners.forEach((listener) => {
        listener(event);
      });
    },
    { chief: [thread("first", "First", true), thread("second", "Second")] },
  );
  const onEvent = (listener: (event: AgentEvent) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return { api, onEvent };
}
async function clickButton(name: string) {
  const button = await screen.findByRole("button", { name });
  await waitFor(() => expect(button).toBeEnabled());
  await fireEvent.click(button);
}
async function panel(f = fixture()) {
  render(() => <ThreadPanel botId="chief" api={f.api} onEvent={f.onEvent} />);
  await fireEvent.click(screen.getByText(/^Threads:/));
  await screen.findByRole("button", { name: "Rename First" });
  return f;
}
describe("agent threads UI", () => {
  it("creates and selects an empty thread then returns to the previous thread", async () => {
    const { api } = await panel();
    await clickButton("New thread");
    await waitFor(async () => expect((await api.list({ botId: "chief" })).threads).toHaveLength(3));
    await clickButton("Open First");
    await waitFor(async () => expect((await api.list({ botId: "chief" })).activeThreadId).toBe("first"));
  });
  it("renames a thread and cancels a draft without saving", async () => {
    const { api } = await panel();
    await clickButton("Rename First");
    await fireEvent.input(screen.getByLabelText("Thread title"), { target: { value: "Project" } });
    await clickButton("Save title");
    await screen.findByRole("heading", { name: "Project" });
    await clickButton("Rename Project");
    await fireEvent.input(screen.getByLabelText("Thread title"), { target: { value: "Not saved" } });
    await clickButton("Cancel rename");
    expect((await api.list({ botId: "chief" })).threads.find((t) => t.id === "first")?.title).toBe("Project");
  });
  it("archives reversibly without stopping the running turn", async () => {
    const f = fixture();
    f.api.simulate("chief", "first", { state: "running" });
    await panel(f);
    await clickButton("Archive First");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Open First" })).toBeNull());
    await fireEvent.click(screen.getByRole("switch", { name: "Show archived threads" }));
    await fireEvent.click(await screen.findByRole("button", { name: "Restore First" }));
    await screen.findByRole("button", { name: "Open First" });
    expect((await f.api.list({ botId: "chief" })).threads.find((t) => t.id === "first")?.state).not.toBe("archived");
  });
  it("does not permanently delete until confirmation and supports keeping the thread", async () => {
    const f = fixture();
    const remove = vi.spyOn(f.api, "delete");
    await panel(f);
    await clickButton("Delete First");
    expect(remove).not.toHaveBeenCalled();
    await clickButton("Keep thread");
    expect(remove).not.toHaveBeenCalled();
    await clickButton("Delete First");
    await clickButton("Delete permanently");
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ botId: "chief", threadId: "first", confirm: true }));
    expect((await f.api.list({ botId: "chief" })).threads.some((t) => t.id === "first")).toBe(false);
  });
  it("shows a branch origin and opens the parent thread", async () => {
    const f = fixture();
    await f.api.branch({ botId: "chief", threadId: "first", fromMessageId: "message" });
    await panel(f);
    await clickButton("From thread: First");
    await waitFor(async () => expect((await f.api.list({ botId: "chief" })).activeThreadId).toBe("first"));
  });
  it("shows per-thread activity, queue, unread and Needs you with a thread title", async () => {
    const f = fixture();
    await panel(f);
    f.api.simulate("chief", "second", { state: "waiting", unread: 2, queued: 3, needsYou: 1 });
    await screen.findByRole("region", { name: "Needs you by thread" });
    await clickButton("Second: 1 Needs you");
    await waitFor(async () => expect((await f.api.list({ botId: "chief" })).activeThreadId).toBe("second"));
    expect(screen.getByText(/2 unread; 3 queued; 1 Needs you/)).toBeInTheDocument();
  });
  it("keeps the actionable cards scoped to their thread and labels the combined list", async () => {
    const f = fixture();
    const list = await f.api.list({ botId: "chief" });
    const cards = [
      promptCard(
        { type: "prompt", requestId: "p1", botId: "chief", threadId: "first", turnId: "a", questions: [] },
        "2026-11-16T12:00:00Z",
      ),
      promptCard(
        { type: "prompt", requestId: "p2", botId: "chief", threadId: "second", turnId: "b", questions: [] },
        "2026-11-16T12:00:01Z",
      ),
    ];
    expect(cardsInThread(cards, "chief", "second").map((c) => c.requestId)).toEqual(["p2"]);
    expect(
      threadAttentionItems([{ id: "chief", name: "Chief" }], cards, { chief: list }).map((item) => item.threadTitle),
    ).toEqual(["First", "Second"]);
  });
  it("uses reported thread states for the agent row", async () => {
    const f = fixture();
    f.api.simulate("chief", "first", { state: "running" });
    f.api.simulate("chief", "second", { state: "waiting" });
    expect(threadRowLabel(await f.api.list({ botId: "chief" }))).toBe("Thread: First; 1 running, 1 waiting");
  });
  it("keeps an action error visible and offers reload", async () => {
    const f = fixture();
    vi.spyOn(f.api, "create").mockRejectedValue(new Error("Demo offline"));
    await panel(f);
    await clickButton("New thread");
    expect(await screen.findByRole("alert")).toHaveTextContent("Demo offline");
    expect(screen.getByRole("button", { name: "Reload threads" })).toBeEnabled();
  });
});
