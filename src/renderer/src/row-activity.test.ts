import type { AgentActivity } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { formatLimitResume, rowStateFor, sidebarAgentStateLabel } from "./row-activity";

function activity(overrides: Partial<AgentActivity> = {}): AgentActivity {
  return {
    botId: "chief",
    kind: "idle",
    pendingRequests: 0,
    limit: null,
    error: null,
    updatedAt: "2026-11-12T12:00:00.000Z",
    ...overrides,
  };
}

/** Local time on 12 Nov 2026, as Unix seconds (what `AccountUsageWindow.resetsAt` carries). */
function localSeconds(hour: number, minute: number, day = 12): number {
  return new Date(2026, 10, day, hour, minute).getTime() / 1000;
}

const NOW = new Date(2026, 10, 12, 14, 0);
const none = { localNeedsYou: false, localWorking: false, unread: 0, responded: false };

describe("formatLimitResume", () => {
  it("shows the local time of the reset on the same day", () => {
    expect(formatLimitResume(localSeconds(15, 40), NOW)).toBe("Limit · resumes 15:40");
    expect(formatLimitResume(localSeconds(9, 5), new Date(2026, 10, 12, 8, 0))).toBe("Limit · resumes 09:05");
  });

  it("adds the weekday when it resets on another day", () => {
    // 12 Nov 2026 is a Thursday.
    expect(formatLimitResume(localSeconds(7, 30, 13), NOW)).toBe("Limit · resumes Fri 07:30");
  });

  it("adds the date when the reset is a week or more away", () => {
    expect(formatLimitResume(localSeconds(7, 30, 21), NOW)).toBe("Limit · resumes Nov 21 07:30");
  });

  it("does not invent a time", () => {
    expect(formatLimitResume(null, NOW)).toBe("Limit reached");
    expect(formatLimitResume(localSeconds(13, 0), NOW)).toBe("Limit · resuming");
  });
});

describe("rowStateFor", () => {
  it("shows no badge for an idle agent with nothing unread", () => {
    expect(rowStateFor({ ...none, activity: activity() })).toBeUndefined();
    expect(rowStateFor({ ...none, activity: undefined })).toBeUndefined();
  });

  it("maps waiting, working and limited from the backend", () => {
    expect(rowStateFor({ ...none, activity: activity({ kind: "waiting", pendingRequests: 1 }) })).toEqual({
      kind: "needs-you",
    });
    expect(rowStateFor({ ...none, activity: activity({ kind: "working" }) })).toEqual({ kind: "working" });
    const limit = { provider: "codex" as const, limitId: "codex", resetsAt: 1_800_000_000 };
    expect(rowStateFor({ ...none, activity: activity({ kind: "limited", limit }) })).toEqual({
      kind: "limited",
      resetsAt: 1_800_000_000,
    });
  });

  it("maps an error to its short message", () => {
    const error = { code: "agent_error", message: "Codex stopped: the CLI exited.", at: "2026-11-12T12:00:00.000Z" };
    expect(rowStateFor({ ...none, activity: activity({ kind: "error", error }) })).toEqual({
      kind: "error",
      message: "Codex stopped: the CLI exited.",
    });
  });

  it("shortens a long error to one line", () => {
    const message = `First line\nsecond line ${"x".repeat(200)}`;
    const state = rowStateFor({
      ...none,
      activity: activity({ kind: "error", error: { code: "x", message, at: "2026-11-12T12:00:00.000Z" } }),
    });
    expect(state?.kind === "error" ? state.message : "").toBe("First line");
    const long = rowStateFor({
      ...none,
      activity: activity({
        kind: "error",
        error: { code: "x", message: "y".repeat(200), at: "2026-11-12T12:00:00.000Z" },
      }),
    });
    expect(long?.kind === "error" ? long.message : "").toHaveLength(80);
  });

  it("prefers waiting, working, limited and error over responded and unread", () => {
    const base = { ...none, unread: 3, responded: true };
    expect(rowStateFor({ ...base, activity: activity({ kind: "waiting" }) })?.kind).toBe("needs-you");
    expect(rowStateFor({ ...base, activity: activity({ kind: "working" }) })?.kind).toBe("working");
    const limit = { provider: "codex" as const, limitId: "codex", resetsAt: null };
    expect(rowStateFor({ ...base, activity: activity({ kind: "limited", limit }) })?.kind).toBe("limited");
    const error = { code: "x", message: "Failed", at: "2026-11-12T12:00:00.000Z" };
    expect(rowStateFor({ ...base, activity: activity({ kind: "error", error }) })?.kind).toBe("error");
  });

  it("still shows unread, then responded, when the agent is idle", () => {
    expect(rowStateFor({ ...none, unread: 2, responded: true, activity: activity() })).toEqual({
      kind: "unread",
      count: 2,
    });
    expect(rowStateFor({ ...none, responded: true, activity: activity() })).toEqual({ kind: "responded" });
  });

  it("keeps the local signals when the backend has not reported yet", () => {
    expect(rowStateFor({ ...none, localNeedsYou: true, localWorking: true, activity: undefined })?.kind).toBe(
      "needs-you",
    );
    expect(rowStateFor({ ...none, localWorking: true, activity: activity() })?.kind).toBe("working");
  });

  it("a needs-you card beats a working turn", () => {
    expect(rowStateFor({ ...none, localWorking: true, activity: activity({ kind: "waiting" }) })?.kind).toBe(
      "needs-you",
    );
  });
});

describe("sidebarAgentStateLabel", () => {
  it("uses English labels", () => {
    expect(sidebarAgentStateLabel({ kind: "needs-you" })).toBe("Needs you");
    expect(sidebarAgentStateLabel({ kind: "working" })).toBe("Thinking");
    expect(sidebarAgentStateLabel({ kind: "responded" })).toBe("Responded");
    expect(sidebarAgentStateLabel({ kind: "unread", count: 1 })).toBe("1 new reply");
    expect(sidebarAgentStateLabel({ kind: "unread", count: 3 })).toBe("3 new replies");
    expect(sidebarAgentStateLabel({ kind: "error", message: "The last turn failed." })).toBe(
      "Error · The last turn failed.",
    );
  });

  it("shows when a limit resumes", () => {
    expect(
      sidebarAgentStateLabel({ kind: "limited", resetsAt: localSeconds(15, 40) }, new Date(2026, 10, 12, 14)),
    ).toBe("Limit · resumes 15:40");
  });
});
