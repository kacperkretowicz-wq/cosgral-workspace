import { describe, expect, it } from "vitest";
import { isAgentEvent } from "./ipc-conversation";
import {
  isManagedCliState,
  type ManagedCliState,
  parseInstallManagedCliInput,
  parseManagedCliSettingsInput,
  parsePinManagedCliInput,
} from "./ipc-subscriptions";

const state: ManagedCliState = {
  id: "codex",
  source: "managed",
  executable: "C:\\data\\cli\\codex\\0.170.0\\codex.exe",
  version: "0.170.0",
  managedVersion: "0.170.0",
  pinnedVersion: null,
  latestVersion: "0.170.0",
  autoUpdate: true,
  customPath: null,
  phase: "downloading",
  progress: { receivedBytes: 10, totalBytes: 100 },
  error: null,
  checkedAt: "2026-11-16T00:00:00.000Z",
};

describe("managed CLI contract (W5-BE1)", () => {
  it("accepts a full state and the managed-cli-changed event", () => {
    expect(isManagedCliState(state)).toBe(true);
    expect(isAgentEvent({ type: "managed-cli-changed", state })).toBe(true);
    expect(isManagedCliState({ ...state, id: "gemini" })).toBe(false);
    expect(isManagedCliState({ ...state, autoUpdate: "yes" })).toBe(false);
  });

  it("parses the inputs and refuses bad ones", () => {
    expect(parseInstallManagedCliInput({ id: "claude" })).toEqual({ id: "claude" });
    expect(parseInstallManagedCliInput({ id: "codex", version: "0.170.0" })).toEqual({
      id: "codex",
      version: "0.170.0",
    });
    expect(() => parseInstallManagedCliInput({ id: "codex", version: "../evil" })).toThrow();
    expect(parsePinManagedCliInput({ id: "codex", version: null })).toEqual({ id: "codex", version: null });
    expect(
      parseManagedCliSettingsInput({ id: "claude", autoUpdate: false, customPath: "  C:\\Tools\\claude.exe " }),
    ).toEqual({
      id: "claude",
      autoUpdate: false,
      customPath: "C:\\Tools\\claude.exe",
    });
    expect(parseManagedCliSettingsInput({ id: "claude", customPath: null })).toEqual({
      id: "claude",
      customPath: null,
    });
    expect(() => parseManagedCliSettingsInput({ id: "claude", customPath: "" })).toThrow();
    expect(() => parseManagedCliSettingsInput({ id: "other" })).toThrow();
  });
});
