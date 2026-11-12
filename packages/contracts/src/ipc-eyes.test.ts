import { describe, expect, it } from "vitest";
import { emptyAgentEyesState, isAgentEvent } from "./ipc";

describe("agent eyes IPC contract", () => {
  it("accepts an eyes-changed event with sessions and grants", () => {
    expect(isAgentEvent({ type: "eyes-changed", state: emptyAgentEyesState() })).toBe(true);
    expect(
      isAgentEvent({
        type: "eyes-changed",
        state: {
          sessions: [
            {
              id: "eyes-1",
              botId: "chief",
              threadId: "thread-1",
              turnId: "turn-1",
              source: "window",
              targetLabel: "Notepad",
              phase: "watching",
              framesCaptured: 1,
              framesPlanned: 3,
              startedAt: "2026-11-12T10:00:00.000Z",
              endsAt: "2026-11-12T10:00:06.000Z",
            },
          ],
          grants: [{ botId: "chief", threadId: "thread-1", source: "screen", grantedAt: "2026-11-12T10:00:00.000Z" }],
        },
      }),
    ).toBe(true);
  });

  it("rejects an eyes-changed event without its lists", () => {
    expect(isAgentEvent({ type: "eyes-changed" })).toBe(false);
    expect(isAgentEvent({ type: "eyes-changed", state: { sessions: [] } })).toBe(false);
  });
});
