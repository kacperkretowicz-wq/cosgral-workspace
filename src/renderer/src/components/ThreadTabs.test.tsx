import type { ThreadList, ThreadSummary, ThreadTabs as ThreadTabsState } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ThreadTabs } from "./ThreadTabs";

function thread(id: string, title: string, active = false): ThreadSummary {
  return {
    id,
    botId: "bot",
    title,
    titled: true,
    state: "idle",
    active,
    unread: 0,
    queued: 0,
    needsYou: 0,
    createdAt: "2026-11-17T10:00:00.000Z",
    updatedAt: "2026-11-17T10:00:00.000Z",
    archivedAt: null,
    preview: "",
    parentThreadId: null,
    parentTitle: null,
    branchedFromMessageId: null,
  };
}

let shown = "a";
let openTabs: string[] = ["a", "b"];
const all = [thread("a", "Alpha"), thread("b", "Beta"), thread("c", "Gamma")];
const listOf = (): ThreadList => ({
  botId: "bot",
  activeThreadId: shown,
  threads: all.map((item) => ({ ...item, active: item.id === shown })),
});
const tabState = (): ThreadTabsState => ({ botId: "bot", open: [...openTabs] });

const threads = {
  list: vi.fn(async () => listOf()),
  select: vi.fn(async ({ threadId }: { threadId: string }) => {
    shown = threadId;
    return listOf();
  }),
  create: vi.fn(async () => listOf()),
};
const threadTabs = {
  get: vi.fn(async () => tabState()),
  open: vi.fn(async ({ threadId }: { threadId: string }) => {
    if (!openTabs.includes(threadId)) openTabs = [...openTabs, threadId];
    return tabState();
  }),
  close: vi.fn(async ({ threadId, mode }: { threadId: string; mode: string }) => {
    openTabs = mode === "this" ? openTabs.filter((id) => id !== threadId) : [threadId];
    return tabState();
  }),
  reorder: vi.fn(async () => tabState()),
};

beforeEach(() => {
  shown = "a";
  openTabs = ["a", "b"];
  vi.clearAllMocks();
  Object.assign(window, { openbot: { threads, threadTabs, agent: { onEvent: () => () => undefined } } });
});
afterEach(cleanup);

it("shows the open threads, marks the shown one and switches on click", async () => {
  render(() => <ThreadTabs botId="bot" />);
  const alpha = await screen.findByRole("button", { name: "Alpha" });
  expect(alpha).toHaveAttribute("aria-current", "true");
  await fireEvent.click(screen.getByRole("button", { name: "Beta" }));
  await waitFor(() => expect(threads.select).toHaveBeenCalledWith({ botId: "bot", threadId: "b" }));
  expect(screen.queryByRole("button", { name: "Gamma" })).not.toBeInTheDocument();
});

it("closing the shown tab only closes the tab and shows its neighbour", async () => {
  render(() => <ThreadTabs botId="bot" />);
  await screen.findByRole("button", { name: "Alpha" });
  await fireEvent.click(screen.getByRole("button", { name: "Close tab: Alpha" }));
  await waitFor(() => expect(threadTabs.close).toHaveBeenCalledWith({ botId: "bot", threadId: "a", mode: "this" }));
  await waitFor(() => expect(threads.select).toHaveBeenCalledWith({ botId: "bot", threadId: "b" }));
  expect(threads.create).not.toHaveBeenCalled();
});

it("opens a thread that has no tab from the list of all threads", async () => {
  render(() => <ThreadTabs botId="bot" />);
  await screen.findByRole("button", { name: "Alpha" });
  await fireEvent.pointerDown(screen.getByRole("button", { name: "All threads" }), { button: 0, pointerType: "mouse" });
  const item = await screen.findByRole("menuitem", { name: "Gamma" });
  await fireEvent.pointerUp(item, { button: 0 });
  await waitFor(() => expect(threadTabs.open).toHaveBeenCalledWith({ botId: "bot", threadId: "c" }));
  await waitFor(() => expect(threads.select).toHaveBeenCalledWith({ botId: "bot", threadId: "c" }));
});

it("creates a new thread from the plus button", async () => {
  render(() => <ThreadTabs botId="bot" />);
  await fireEvent.click(await screen.findByRole("button", { name: "New thread" }));
  await waitFor(() => expect(threads.create).toHaveBeenCalledWith({ botId: "bot" }));
});

it("draws nothing without the tabs contract", async () => {
  Object.assign(window, { openbot: { threads, agent: { onEvent: () => () => undefined } } });
  const view = render(() => <ThreadTabs botId="bot" />);
  await Promise.resolve();
  expect(view.container.querySelector(".thread-tabs")).toBeNull();
});
