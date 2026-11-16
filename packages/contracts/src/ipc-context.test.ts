import { describe, expect, it } from "vitest";
import {
  applyContextSettings,
  contextPercent,
  contextWarning,
  defaultContextSettings,
  isContextSettings,
  isContextState,
  isContextThreadInput,
  isUpdateContextSettingsInput,
  unavailableContextState,
} from "./ipc-context";
import { isAgentEvent } from "./ipc-conversation";

const reported = {
  ...unavailableContextState("bot", "thread", "x", true),
  source: "reported" as const,
  unavailableReason: null,
  used: 45_000,
  limit: 100_000,
  percent: 45,
  updatedAt: "2026-11-16T12:00:00.000Z",
};

describe("context contract (W6-BE2)", () => {
  it("never makes a percent out of nothing", () => {
    expect(contextPercent(null, 100)).toBeNull();
    expect(contextPercent(10, null)).toBeNull();
    expect(contextPercent(10, 0)).toBeNull();
    expect(contextPercent(-1, 100)).toBeNull();
    expect(contextPercent(Number.NaN, 100)).toBeNull();
    expect(contextPercent(0, 100)).toBe(0);
    expect(contextPercent(45_000, 100_000)).toBe(45);
    expect(contextPercent(130_000, 100_000)).toBe(100);
  });

  it("warns from 80 percent and never without a number", () => {
    expect(contextWarning(null)).toBe(false);
    expect(contextWarning(79)).toBe(false);
    expect(contextWarning(80)).toBe(true);
  });

  it("an unavailable state has no numbers and says why; a reported one has all three", () => {
    const unavailable = unavailableContextState(
      "bot",
      "thread",
      "Claude Code does not report its context size.",
      false,
    );
    expect(isContextState(unavailable)).toBe(true);
    expect(unavailable).toMatchObject({ used: null, limit: null, percent: null, source: "unavailable" });
    expect(isContextState({ ...unavailable, percent: 0 })).toBe(false);
    expect(isContextState({ ...unavailable, unavailableReason: "" })).toBe(false);
    expect(isContextState({ ...unavailable, unavailableReason: null })).toBe(false);
    expect(isContextState(reported)).toBe(true);
    expect(isContextState({ ...reported, percent: null })).toBe(false);
    expect(isContextState({ ...reported, used: null })).toBe(false);
    expect(isContextState({ ...reported, source: "guessed" })).toBe(false);
    expect(isContextState({ ...reported, used: Number.NaN })).toBe(false);
  });

  it("settings: defaults 90 % and on; a change applies; a bad value is refused, not clamped", () => {
    const base = defaultContextSettings();
    expect(base).toEqual({ autoCompact: true, thresholdPercent: 90 });
    expect(applyContextSettings(base, { autoCompact: false })).toEqual({ autoCompact: false, thresholdPercent: 90 });
    expect(applyContextSettings(base, { thresholdPercent: 70 }).thresholdPercent).toBe(70);
    expect(applyContextSettings(base, {})).toEqual(base);
    for (const bad of [49, 96, 80.5, Number.NaN]) {
      expect(() => applyContextSettings(base, { thresholdPercent: bad })).toThrow(/whole number from 50 to 95/);
    }
    expect(isContextSettings(base)).toBe(true);
    expect(isContextSettings({ autoCompact: true, thresholdPercent: 99 })).toBe(false);
  });

  it("inputs: a thread is optional, an agent is not", () => {
    expect(isContextThreadInput({ botId: "bot" })).toBe(true);
    expect(isContextThreadInput({ botId: "bot", threadId: null })).toBe(true);
    expect(isContextThreadInput({ botId: "bot", threadId: "t" })).toBe(true);
    expect(isContextThreadInput({ botId: "" })).toBe(false);
    expect(isContextThreadInput({ threadId: "t" })).toBe(false);
    expect(isUpdateContextSettingsInput({ autoCompact: false })).toBe(true);
    expect(isUpdateContextSettingsInput({ thresholdPercent: "90" })).toBe(false);
  });

  it("the two events are part of the agent event union", () => {
    expect(isAgentEvent({ type: "context-changed", ...reported })).toBe(true);
    expect(isAgentEvent({ type: "context-changed", ...reported, percent: null })).toBe(false);
    expect(isAgentEvent({ type: "context-settings-changed", ...defaultContextSettings() })).toBe(true);
    expect(isAgentEvent({ type: "context-settings-changed", autoCompact: "yes", thresholdPercent: 90 })).toBe(false);
  });
});
