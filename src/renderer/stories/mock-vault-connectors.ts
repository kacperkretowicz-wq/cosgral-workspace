// COSGRAL W11-KK (d): Vault connectors and the person's Vault tools for Storybook and the preview. Demo data only; no manager, tool
// or network is touched. The same rules as the program: a token or key is write-only (never in any answer), a connection attempt
// can be cancelled, several 1Password accounts need a choice first, disconnecting forgets the token, a reveal needs an existing item.
// `simulate` plays the things a real manager does: no tool installed, signed out, a token refused, a locked vault, new logins.

import {
  type AgentEvent,
  type ConnectVaultConnectorInput,
  emptyVaultConnectorStatus,
  isVaultConnectorId,
  parseConnectVaultConnectorInput,
  parseImportVaultCsvInput,
  parseLoginCsv,
  parseVaultConnectorIdInput,
  parseVaultItemFieldInput,
  VAULT_CONNECTOR_ERROR_SENTENCES,
  VAULT_CONNECTOR_IDS,
  VAULT_CONNECTOR_LIMITS,
  VAULT_CONNECTOR_SHARED_NAME,
  type VaultCodes,
  type VaultConnectorAccount,
  type VaultConnectorErrorCode,
  type VaultConnectorId,
  type VaultConnectorList,
  type VaultConnectorStatus,
  type VaultConnectorsDesktopApi,
  type VaultSecretsDesktopApi,
} from "@openbot/contracts/ipc";

export interface MockVaultConnectors {
  connectors: Required<VaultConnectorsDesktopApi>;
  secrets: Required<VaultSecretsDesktopApi>;
  simulate: {
    /** The manager's tool is (not) installed; `installable` lets the person download the program's own copy. */
    cli: (connector: VaultConnectorId, found: boolean, installable?: boolean) => void;
    /** 1Password: the accounts the app shows (several = the person must choose; none = signed out). */
    accounts: (accounts: VaultConnectorAccount[]) => void;
    /** The manager refuses the next connection with this reason. */
    refuseNext: (connector: VaultConnectorId, code: VaultConnectorErrorCode) => void;
    /** A connected manager loses its session (a locked vault). */
    lock: (connector: VaultConnectorId) => void;
    /** The person moved logins into the shared vault: the count changes. */
    loginsChanged: (connector: VaultConnectorId, count: number) => void;
    /** What the demo clipboard holds now (and what is cleared). */
    clipboard: () => string;
    /** Time passes (the clipboard timer and the two-step codes follow it). */
    advance: (ms: number) => void;
  };
}

interface DemoItem {
  id: string;
  kind: "login" | "card" | "apiKey";
  secrets: Partial<Record<"password" | "number" | "securityCode" | "key", string>>;
  /** Base32 key of a login that has two-step codes (a public example value, not a real one). */
  twoStepKey?: string;
}

const DEMO_ITEMS: DemoItem[] = [
  { id: "demo-login", kind: "login", secrets: { password: "demo-password-1" }, twoStepKey: "JBSWY3DPEHPK3PXP" },
  { id: "demo-card", kind: "card", secrets: { number: "4242424242424242", securityCode: "123" } },
  { id: "demo-key", kind: "apiKey", secrets: { key: "demo-api-key-value" } },
];

export function createMockVaultConnectors(emit: (event: AgentEvent) => void): MockVaultConnectors {
  let clock = Date.parse("2026-11-17T08:00:00.000Z");
  const statuses = new Map<VaultConnectorId, VaultConnectorStatus>(
    VAULT_CONNECTOR_IDS.map((connector) => [connector, emptyVaultConnectorStatus(connector)]),
  );
  const refusals = new Map<VaultConnectorId, VaultConnectorErrorCode>();
  const tokens = new Map<VaultConnectorId, string>();
  let accounts: VaultConnectorAccount[] = [{ id: "demo-account", label: "demo@example.test (demo.example.test)" }];
  let items = DEMO_ITEMS.map((item) => ({ ...item, secrets: { ...item.secrets } }));
  let clipboard = "";
  let clipboardClearsAt = 0;

  const current = (connector: VaultConnectorId): VaultConnectorStatus => {
    const status = statuses.get(connector);
    if (status === undefined) throw new Error("Unknown connector.");
    return status;
  };
  const snapshot = (): VaultConnectorList => ({
    connectors: VAULT_CONNECTOR_IDS.map((connector) => structuredClone(current(connector))),
  });
  const changed = () => emit({ type: "vault-connectors-changed", ...snapshot() });
  const set = (connector: VaultConnectorId, change: Partial<VaultConnectorStatus>) => {
    statuses.set(connector, { ...current(connector), ...change });
    changed();
    return structuredClone(current(connector));
  };
  const fail = (connector: VaultConnectorId, code: VaultConnectorErrorCode) =>
    set(connector, {
      state: "failed",
      accounts: [],
      vaultNames: [],
      loginCount: null,
      error: VAULT_CONNECTOR_ERROR_SENTENCES[code],
      errorCode: code,
    });
  const connected = (connector: VaultConnectorId, input: ConnectVaultConnectorInput) =>
    set(connector, {
      state: "connected",
      accounts: [],
      vaultNames: [VAULT_CONNECTOR_SHARED_NAME],
      loginCount: 3,
      serverUrl: input.serverUrl ?? null,
      error: null,
      errorCode: null,
    });
  const tick = () => {
    clock += 1;
    if (clipboardClearsAt > 0 && clock >= clipboardClearsAt) {
      clipboard = "";
      clipboardClearsAt = 0;
    }
  };

  const connectors: Required<VaultConnectorsDesktopApi> = {
    list: async () => snapshot(),
    status: async (input) => structuredClone(current(parseVaultConnectorIdInput(input).connector)),
    checkSetup: async (input) => {
      const { connector } = parseVaultConnectorIdInput(input);
      const status = current(connector);
      if (status.setup.cli === "checking") {
        return set(connector, {
          setup: {
            ...status.setup,
            cli: "ready",
            cliVersion: "2.30.0",
            appIntegration: connector === "onepassword" ? accounts.length > 0 : null,
          },
        });
      }
      return structuredClone(status);
    },
    installCli: async (input) => {
      const { connector } = parseVaultConnectorIdInput(input);
      const status = current(connector);
      if (!status.setup.canInstall || status.setup.cli === "installing") return structuredClone(status);
      return set(connector, { setup: { ...status.setup, cli: "ready", cliVersion: "2.30.0", canInstall: true } });
    },
    openApp: async (input) => {
      parseVaultConnectorIdInput(input);
    },
    connect: async (input) => {
      const request = parseConnectVaultConnectorInput(input);
      const { connector } = request;
      const status = current(connector);
      if (connector === "onepassword" && request.method === "app") {
        if (status.setup.cli === "missing") return fail(connector, "cli-missing");
        if (accounts.length === 0) return fail(connector, "cli-signed-out");
        if (!request.accountId && accounts.length > 1) {
          return set(connector, {
            state: "choose-account",
            accounts: structuredClone(accounts),
            error: null,
            errorCode: null,
          });
        }
        if (request.accountId && !accounts.some((account) => account.id === request.accountId)) {
          return fail(connector, "cli-signed-out");
        }
      }
      const refusal = refusals.get(connector);
      if (refusal !== undefined) {
        refusals.delete(connector);
        return fail(connector, refusal);
      }
      if (request.secret !== undefined) tokens.set(connector, request.secret);
      return connected(connector, request);
    },
    cancel: async (input) => {
      const { connector } = parseVaultConnectorIdInput(input);
      const status = current(connector);
      if (status.state !== "connecting" && status.state !== "choose-account") return structuredClone(status);
      return set(connector, { state: "disconnected", accounts: [], error: null, errorCode: null });
    },
    disconnect: async (input) => {
      const { connector } = parseVaultConnectorIdInput(input);
      tokens.delete(connector);
      return set(connector, {
        state: "disconnected",
        accounts: [],
        vaultNames: [],
        loginCount: null,
        serverUrl: null,
        error: null,
        errorCode: null,
      });
    },
  };

  const item = (itemId: string, field: keyof DemoItem["secrets"]): string => {
    const found = items.find((entry) => entry.id === itemId);
    const value = found?.secrets[field];
    if (value === undefined) throw new Error("That Vault item has no such secret.");
    return value;
  };

  const secrets: Required<VaultSecretsDesktopApi> = {
    reveal: async (input) => {
      const request = parseVaultItemFieldInput(input);
      return { value: item(request.itemId, request.field) };
    },
    copy: async (input) => {
      const request = parseVaultItemFieldInput(input);
      clipboard = item(request.itemId, request.field);
      clipboardClearsAt = clock + VAULT_CONNECTOR_LIMITS.clipboardSeconds * 1000;
      return { clearsInSeconds: VAULT_CONNECTOR_LIMITS.clipboardSeconds };
    },
    importCsv: async (input) => {
      const request = parseImportVaultCsvInput(input);
      const parsed = parseLoginCsv(request.csv);
      let imported = 0;
      let skipped = parsed.otherRows;
      for (const login of parsed.logins) {
        const valid = /^https:\/\//i.test(login.website) && login.password.trim().length > 0;
        if (!valid) {
          skipped += 1;
          continue;
        }
        imported += 1;
        items = [...items, { id: `imported-${imported}`, kind: "login", secrets: { password: login.password } }];
      }
      return { imported, skipped };
    },
    codes: async (): Promise<VaultCodes> => ({
      codes: items
        .filter((entry) => entry.twoStepKey !== undefined)
        .map((entry) => ({
          itemId: entry.id,
          // A fixed demo code that changes with every 30-second step, so the screen can show it changing.
          code: String(100000 + (Math.floor(clock / 30_000) % 800000)).padStart(6, "0"),
          period: 30,
          remainingMs: 30_000 - (clock % 30_000),
        })),
    }),
    reset: async () => {
      items = [];
    },
  };

  return {
    connectors,
    secrets,
    simulate: {
      cli: (connector, found, installable = true) => {
        const status = current(connector);
        set(connector, {
          setup: {
            ...status.setup,
            cli: found ? "ready" : "missing",
            cliVersion: found ? "2.30.0" : null,
            canInstall: installable,
          },
        });
      },
      accounts: (next) => {
        accounts = next;
      },
      refuseNext: (connector, code) => {
        if (isVaultConnectorId(connector)) refusals.set(connector, code);
      },
      lock: (connector) => {
        if (current(connector).state === "connected") fail(connector, "locked");
      },
      loginsChanged: (connector, count) => {
        if (current(connector).state === "connected") set(connector, { loginCount: Math.max(0, Math.floor(count)) });
      },
      clipboard: () => {
        tick();
        return clipboard;
      },
      advance: (ms) => {
        clock += Math.max(0, ms);
        tick();
      },
    },
  };
}
