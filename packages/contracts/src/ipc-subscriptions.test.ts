import { describe, expect, it } from "vitest";
import { isAgentEvent } from "./ipc-conversation";
import {
  ACCOUNT_POOL_WARNING,
  isAccountsSnapshot,
  isManagedCliState,
  isProviderAccount,
  type ManagedCliState,
  type ProviderAccount,
  parseAccountIdInput,
  parseAddAccountInput,
  parseAgentAccountAssignment,
  parseInstallManagedCliInput,
  parseManagedCliSettingsInput,
  parsePinManagedCliInput,
  parsePoolSettingsInput,
  parseSetAccountPoolInput,
  parseSubmitLoginCodeInput,
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

const account: ProviderAccount = {
  id: "acc-1a2b3c4d",
  provider: "claude",
  label: "Work",
  stateDir: "acc-1a2b3c4d",
  system: false,
  loggedIn: true,
  account: "p***@e***.com",
  plan: "max",
  isDefault: false,
  inPool: true,
  poolOrder: 2,
  enabled: true,
  limitedUntil: null,
  login: { phase: "code-required", message: "Paste the code.", url: "https://example.com", userCode: null },
  checkedAt: null,
};

describe("provider accounts contract (W5-BE2)", () => {
  it("accepts an account, the snapshot and the accounts-changed event", () => {
    expect(isProviderAccount(account)).toBe(true);
    expect(isProviderAccount({ ...account, login: { ...account.login, phase: "signing" } })).toBe(false);
    const snapshot = {
      accounts: [account],
      pool: { maxAccountsPerProvider: 3, switchBeforeFirstAction: true },
      assignments: [{ botId: "bot-1", accountId: null }],
    };
    expect(isAccountsSnapshot(snapshot)).toBe(true);
    expect(isAgentEvent({ type: "accounts-changed", ...snapshot })).toBe(true);
    expect(
      isAccountsSnapshot({ ...snapshot, pool: { maxAccountsPerProvider: 3, switchBeforeFirstAction: false } }),
    ).toBe(false);
  });

  it("parses the inputs and refuses bad ones", () => {
    expect(parseAddAccountInput({ provider: "codex", label: "  Work " })).toEqual({ provider: "codex", label: "Work" });
    expect(() => parseAddAccountInput({ provider: "codex", label: " " })).toThrow();
    expect(() => parseAddAccountInput({ provider: "gemini", label: "x" })).toThrow();
    expect(parseAccountIdInput({ id: "system-codex" })).toEqual({ id: "system-codex" });
    expect(() => parseAccountIdInput({ id: "../acc-1a2b3c4d" })).toThrow();
    expect(() => parseAccountIdInput({ id: "acc-UPPER123" })).toThrow();
    expect(parseSubmitLoginCodeInput({ id: "acc-1a2b3c4d", code: " abc#123 " })).toEqual({
      id: "acc-1a2b3c4d",
      code: "abc#123",
    });
    expect(() => parseSubmitLoginCodeInput({ id: "acc-1a2b3c4d", code: "a\nb" })).toThrow();
    expect(parseSetAccountPoolInput({ id: "acc-1a2b3c4d", inPool: true, poolOrder: 1, enabled: false })).toEqual({
      id: "acc-1a2b3c4d",
      inPool: true,
      poolOrder: 1,
      enabled: false,
    });
    expect(() => parseSetAccountPoolInput({ id: "acc-1a2b3c4d", inPool: true, poolOrder: 0 })).toThrow();
    expect(() => parseSetAccountPoolInput({ id: "acc-1a2b3c4d", inPool: true, isDefault: false })).toThrow();
    expect(parseAgentAccountAssignment({ botId: "bot-1", accountId: null })).toEqual({
      botId: "bot-1",
      accountId: null,
    });
    expect(parsePoolSettingsInput({ maxAccountsPerProvider: 5 })).toEqual({ maxAccountsPerProvider: 5 });
    expect(() => parsePoolSettingsInput({ maxAccountsPerProvider: 0 })).toThrow();
    expect(() => parsePoolSettingsInput({ maxAccountsPerProvider: 2.5 })).toThrow();
    expect(ACCOUNT_POOL_WARNING).toMatch(/own accounts/);
  });
});

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
