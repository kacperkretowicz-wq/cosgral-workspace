import { describe, expect, it } from "vitest";
import {
  COMPUTER_USE_ACTIONS,
  COMPUTER_USE_LIMITS,
  emptyComputerUseState,
  IPC_CHANNELS,
  isAgentEvent,
  isComputerUseState,
} from "./ipc";

const AT = "2026-11-13T07:00:00.000Z";
const state = {
  available: true,
  unavailableReason: null,
  sessions: [
    {
      id: "s1",
      botId: "chief",
      threadId: "thread-1",
      phase: "acting",
      lastAction: "click",
      actions: 3,
      startedAt: AT,
      lastActionAt: AT,
    },
  ],
  grants: [{ botId: "chief", threadId: "thread-1", grantedAt: AT }],
};

describe("W3 Computer Use contract", () => {
  it("describes who controls the computer and who may", () => {
    expect(isComputerUseState(state)).toBe(true);
    expect(isComputerUseState(emptyComputerUseState())).toBe(true);
    expect(isComputerUseState({ ...state, available: false, unavailableReason: "Windows only" })).toBe(true);
    expect(isComputerUseState({ ...state, sessions: [{ ...state.sessions[0], phase: "dancing" }] })).toBe(false);
    expect(isComputerUseState({ ...state, sessions: [{ ...state.sessions[0], lastAction: "format_disk" }] })).toBe(
      false,
    );
    expect(isComputerUseState({ ...state, grants: [{ botId: "chief" }] })).toBe(false);
  });

  it("lists the actions an agent has and keeps limits in one place", () => {
    expect(COMPUTER_USE_ACTIONS).toEqual([
      "screenshot",
      "click",
      "double_click",
      "scroll",
      "type_text",
      "press_keys",
      "list_windows",
      "switch_window",
    ]);
    expect(COMPUTER_USE_LIMITS.typeChunk).toBeLessThan(COMPUTER_USE_LIMITS.typeTextLength);
    expect(IPC_CHANNELS.computerUseGetState).toBe("computer-use:get-state");
    expect(IPC_CHANNELS.computerUseStop).toBe("computer-use:stop");
  });

  it("sends state changes as an agent event", () => {
    expect(isAgentEvent({ type: "computer-use-changed", state })).toBe(true);
    expect(isAgentEvent({ type: "computer-use-changed", state: { sessions: [] } })).toBe(false);
  });
});
