import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, expect, it, vi } from "vitest";
import { useRestoreWorkspace, type WorkspacePlace } from "./useRestoreWorkspace";

afterEach(() => {
  cleanup();
  Object.assign(window, { openbot: {} });
});

type Last = { page: string; botId: string | null; threadId: string | null } | null;

function setup(options: { restore: boolean; last: Last; bots?: string[] }) {
  const get = vi.fn().mockResolvedValue({ workspace: { restore: options.restore, last: options.last } });
  const update = vi.fn().mockResolvedValue(undefined);
  Object.assign(window, { openbot: { appSettings: { get, update } } });
  const opened: Array<{ page: string | null; botId: string | null }> = [];
  const [ready, setReady] = createSignal(false);
  const [place, setPlace] = createSignal<WorkspacePlace>({ page: "agents", botId: "chief" });
  function Probe() {
    useRestoreWorkspace({
      ready,
      place,
      hasBot: (id) => (options.bots ?? ["chief", "research"]).includes(id),
      open: (next) => opened.push(next),
      delayMs: 10,
    });
    return null;
  }
  render(() => <Probe />);
  return { get, update, opened, setReady, setPlace };
}

it("opens the remembered page and agent once the agents are loaded", async () => {
  const s = setup({ restore: true, last: { page: "library", botId: "research", threadId: null } });
  expect(s.get).not.toHaveBeenCalled();
  s.setReady(true);
  await waitFor(() => expect(s.opened).toEqual([{ page: "library", botId: "research" }]));
});

it("does not open anything when the setting is off", async () => {
  const s = setup({ restore: false, last: { page: "library", botId: "research", threadId: null } });
  s.setReady(true);
  await waitFor(() => expect(s.get).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(s.opened).toEqual([]);
});

it("keeps the page but drops an agent that is gone", async () => {
  const s = setup({ restore: true, last: { page: "usage", botId: "deleted", threadId: null } });
  s.setReady(true);
  await waitFor(() => expect(s.opened).toEqual([{ page: "usage", botId: null }]));
});

it("remembers a change of page or agent a moment after it, and not before the restore is done", async () => {
  const s = setup({ restore: true, last: null });
  s.setPlace({ page: "tasks", botId: "chief" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(s.update).not.toHaveBeenCalled();
  s.setReady(true);
  await waitFor(() => expect(s.get).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 10));
  s.setPlace({ page: "schedule", botId: "research" });
  await waitFor(() =>
    expect(s.update).toHaveBeenLastCalledWith({
      workspace: { last: { page: "schedule", botId: "research", threadId: null } },
    }),
  );
});
