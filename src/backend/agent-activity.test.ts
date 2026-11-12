// @vitest-environment node

import { ACTIVITY_ERROR_MESSAGE_LIMIT, type AccountUsage } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { activityErrorMessage, activityKind, exhaustedCodexLimit } from "./agent-activity";

const NOW_MS = 1_800_000_000_000;
const NOW_S = NOW_MS / 1_000;

function usage(windows: Array<{ id: string; usedPercent: number; resetsAt: number | null }>): AccountUsage {
  return {
    limits: windows.map((window) => ({
      id: window.id,
      primary: { usedPercent: window.usedPercent, windowDurationMins: 300, resetsAt: window.resetsAt },
      secondary: null,
    })),
  };
}

describe("agent row activity", () => {
  it("is limited only by a full window that has not reset yet", () => {
    expect(exhaustedCodexLimit(null, NOW_MS)).toBeNull();
    expect(exhaustedCodexLimit(usage([{ id: "codex", usedPercent: 99.5, resetsAt: NOW_S + 60 }]), NOW_MS)).toBeNull();
    expect(exhaustedCodexLimit(usage([{ id: "codex", usedPercent: 100, resetsAt: NOW_S }]), NOW_MS)).toBeNull();
    expect(exhaustedCodexLimit(usage([{ id: "codex", usedPercent: 100, resetsAt: NOW_S + 60 }]), NOW_MS)).toEqual({
      provider: "codex",
      limitId: "codex",
      resetsAt: NOW_S + 60,
    });
  });

  it("waits for the full window that resets last, and an unknown reset counts as last", () => {
    const two = usage([
      { id: "codex", usedPercent: 100, resetsAt: NOW_S + 60 },
      { id: "codex-weekly", usedPercent: 100, resetsAt: NOW_S + 3_600 },
    ]);
    expect(exhaustedCodexLimit(two, NOW_MS)).toMatchObject({ limitId: "codex-weekly", resetsAt: NOW_S + 3_600 });

    const unknown = usage([
      { id: "codex", usedPercent: 100, resetsAt: null },
      { id: "codex-weekly", usedPercent: 100, resetsAt: NOW_S + 3_600 },
    ]);
    expect(exhaustedCodexLimit(unknown, NOW_MS)).toMatchObject({ limitId: "codex", resetsAt: null });
  });

  it("puts an open card first, then work, the limit and the last error", () => {
    const limit = { provider: "codex" as const, limitId: "codex", resetsAt: null };
    const error = { code: "agent_error", message: "Failed", at: "2026-11-12T20:00:00.000Z" };
    expect(activityKind(1, true, limit, error)).toBe("waiting");
    expect(activityKind(0, true, limit, error)).toBe("working");
    expect(activityKind(0, false, limit, error)).toBe("limited");
    expect(activityKind(0, false, null, error)).toBe("error");
    expect(activityKind(0, false, null, null)).toBe("idle");
  });

  it("keeps one short line of an error for the row", () => {
    expect(activityErrorMessage("\n  Stream disconnected.  \nstack trace")).toBe("Stream disconnected.");
    expect(activityErrorMessage("   ")).toBe("The last turn failed.");
    const long = activityErrorMessage("x".repeat(500));
    expect(long).toHaveLength(ACTIVITY_ERROR_MESSAGE_LIMIT);
    expect(long.endsWith("…")).toBe(true);
  });
});
