import { describe, expect, it } from "vitest";
import { isAgentEvent } from "./ipc";

describe("agent-live-status event", () => {
  const base = { type: "agent-live-status", botId: "chief", threadId: "t1", turnId: "turn-1", kind: "reading" };

  it("accepts a status with or without a detail and a missing thread", () => {
    expect(isAgentEvent(base)).toBe(true);
    expect(isAgentEvent({ ...base, detail: "plan.md" })).toBe(true);
    expect(isAgentEvent({ ...base, threadId: null })).toBe(true);
  });

  it("refuses an unknown kind or a detail that is not text", () => {
    expect(isAgentEvent({ ...base, kind: "dancing" })).toBe(false);
    expect(isAgentEvent({ ...base, detail: 3 })).toBe(false);
    expect(isAgentEvent({ ...base, turnId: undefined })).toBe(false);
  });
});
