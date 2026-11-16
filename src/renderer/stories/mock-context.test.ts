// @vitest-environment node
import { type AgentEvent, isContextState } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockContext } from "./mock-context";

function setup() {
  const events: AgentEvent[] = [];
  const api = createMockContext(
    (event) => events.push(event),
    (botId) => `${botId}-active`,
  );
  return { api, events };
}

describe("mock context (W6-BE2)", () => {
  it("a thread without a report is unavailable, with a reason and no numbers", async () => {
    const { api } = setup();
    const state = await api.getState({ botId: "chief" });
    expect(isContextState(state)).toBe(true);
    expect(state).toMatchObject({
      source: "unavailable",
      used: null,
      limit: null,
      percent: null,
      threadId: "chief-active",
    });
    expect(state.unavailableReason).toMatch(/No usage/);
  });

  it("a report gives numbers, a warning from 80 percent, and tells the window", async () => {
    const { api, events } = setup();
    api.simulate.report("chief", "t1", 50_000, 100_000);
    expect(await api.getState({ botId: "chief", threadId: "t1" })).toMatchObject({
      source: "reported",
      percent: 50,
      warning: false,
    });
    api.simulate.report("chief", "t1", 85_000, 100_000);
    expect(await api.getState({ botId: "chief", threadId: "t1" })).toMatchObject({ percent: 85, warning: true });
    expect(events.filter((event) => event.type === "context-changed")).toHaveLength(2);
  });

  it("two threads of one agent and two agents keep their own state", async () => {
    const { api } = setup();
    api.simulate.report("chief", "t1", 10_000, 100_000);
    api.simulate.report("chief", "t2", 90_000, 100_000);
    api.simulate.report("scout", "t1", 30_000, 100_000);
    expect((await api.getState({ botId: "chief", threadId: "t1" })).percent).toBe(10);
    expect((await api.getState({ botId: "chief", threadId: "t2" })).percent).toBe(90);
    expect((await api.getState({ botId: "scout", threadId: "t1" })).percent).toBe(30);
  });

  it("compaction: refused without numbers or for a provider that cannot be asked; otherwise it runs and keeps stale numbers", async () => {
    const { api } = setup();
    await expect(api.compact({ botId: "chief", threadId: "t1" })).rejects.toThrow(/nothing to compact/);
    api.simulate.silent("claude-agent", "t1", "Claude Code does not report its context size.", false);
    await expect(api.compact({ botId: "claude-agent", threadId: "t1" })).rejects.toThrow(/compacts its own context/);
    api.simulate.report("chief", "t1", 92_000, 100_000);
    const running = await api.compact({ botId: "chief", threadId: "t1" });
    expect(running.compacting).toBe(true);
    api.simulate.finishCompaction("chief", "t1");
    const done = await api.getState({ botId: "chief", threadId: "t1" });
    expect(done).toMatchObject({
      compacting: false,
      stale: true,
      compactions: 1,
      lastCompactedFromTokens: 92_000,
      used: 92_000,
    });
    api.simulate.report("chief", "t1", 20_000, 100_000);
    expect(await api.getState({ botId: "chief", threadId: "t1" })).toMatchObject({
      stale: false,
      percent: 20,
      compactions: 1,
    });
  });

  it("settings: defaults, a change is announced, a bad threshold is refused", async () => {
    const { api, events } = setup();
    expect(await api.getSettings()).toEqual({ autoCompact: true, thresholdPercent: 90 });
    expect(await api.updateSettings({ autoCompact: false, thresholdPercent: 75 })).toEqual({
      autoCompact: false,
      thresholdPercent: 75,
    });
    expect(events.at(-1)).toMatchObject({ type: "context-settings-changed", thresholdPercent: 75 });
    await expect(api.updateSettings({ thresholdPercent: 10 })).rejects.toThrow(/whole number/);
    expect(await api.getSettings()).toEqual({ autoCompact: false, thresholdPercent: 75 });
  });
});
