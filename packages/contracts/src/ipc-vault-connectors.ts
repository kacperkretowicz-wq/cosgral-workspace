// COSGRAL W11-KK (d): Vault connectors (1Password, Bitwarden, Proton Pass) and the person's tools for Vault items
// (reveal, copy, import from CSV, two-step codes, reset). Our own contract for the behaviour of OpenBot 0.71 (parity row 26).
//
// A connector lets agents use the logins of a password manager WITHOUT copying them into the local Vault: the program asks the
// manager's own command-line tool (or SDK) for the logins of the page an agent is on, and the secret goes to the built-in browser
// only. What the person gives a connector (a service-account token, a session key, a sign-in) is WRITE-ONLY: it never comes back
// in a status, an event, a log or an error. Everything is about THIS computer only.

import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const VAULT_CONNECTOR_IDS = ["onepassword", "bitwarden", "protonpass"] as const;
export type VaultConnectorId = (typeof VAULT_CONNECTOR_IDS)[number];

/**
 * disconnected: nothing saved.
 * connecting: a connection attempt runs (it can be cancelled).
 * choose-account: 1Password has several accounts and the person has not picked one (`accounts`); nothing was created.
 * connected: the manager answers; `loginCount` and `vaultNames` say what agents may use.
 * failed: the last attempt or the saved connection does not work; `errorCode` and `error` say why.
 */
export const VAULT_CONNECTOR_STATES = ["disconnected", "connecting", "choose-account", "connected", "failed"] as const;
export type VaultConnectorState = (typeof VAULT_CONNECTOR_STATES)[number];

/** How the person can connect: the manager's desktop app (CLI), a token or key the person made, or a sign-in the program runs. */
export const VAULT_CONNECTOR_METHODS = ["app", "token", "session-key", "browser"] as const;
export type VaultConnectorMethod = (typeof VAULT_CONNECTOR_METHODS)[number];

/**
 * The command-line tool of a manager (`op`, `bw`, `pass-cli`):
 * checking: not looked for yet; ready: found and new enough; missing: not found or too old; installing: the program downloads its own copy.
 */
export const VAULT_CONNECTOR_CLI_STATES = ["checking", "ready", "missing", "installing"] as const;
export type VaultConnectorCliState = (typeof VAULT_CONNECTOR_CLI_STATES)[number];

/**
 * Why a connection failed, when the screen shows more than the sentence:
 * cli-missing: the manager's tool is not installed (or too old); cli-signed-out: the manager's app has no signed-in account;
 * token-rejected: the manager refused the token or key; locked: the vault is locked or the session ended;
 * folder-missing: the shared folder/vault that agents may read does not exist; plan: the account's plan does not allow it;
 * unknown: anything else (the sentence is fixed, never the manager's own text).
 */
export const VAULT_CONNECTOR_ERROR_CODES = [
  "cli-missing",
  "cli-signed-out",
  "token-rejected",
  "locked",
  "folder-missing",
  "plan",
  "unknown",
] as const;
export type VaultConnectorErrorCode = (typeof VAULT_CONNECTOR_ERROR_CODES)[number];

export const VAULT_CONNECTOR_LIMITS = {
  /** A service-account token, session key or API key. */
  secret: 4_096,
  accountId: 200,
  /** Logins read per page (every listed login costs the manager one read). */
  loginsPerPage: 10,
  /** Seconds a copied secret stays on the clipboard. */
  clipboardSeconds: 30,
  /** The CSV a person imports, in characters (an export of thousands of logins fits). */
  csvCharacters: 4_194_304,
  csvLogins: 5_000,
} as const;

/** The name of the shared place in the manager that agents may read; the person moves logins into it. */
export const VAULT_CONNECTOR_SHARED_NAME = "Shared with COSGRAL";

export interface VaultConnectorAccount {
  id: string;
  /** "email (address)"; the person recognises the account by it. */
  label: string;
}

export interface VaultConnectorSetup {
  cli: VaultConnectorCliState;
  cliVersion: string | null;
  /** The program has its own build of the tool for this computer and can download it (always after the person agrees). */
  canInstall: boolean;
  /** 1Password: the desktop app lets the tool use an account. null when not checked or not a 1Password concern. */
  appIntegration: boolean | null;
}

export interface VaultConnectorStatus {
  connector: VaultConnectorId;
  label: string;
  state: VaultConnectorState;
  methods: VaultConnectorMethod[];
  setup: VaultConnectorSetup;
  /** choose-account: the accounts to pick from; otherwise empty. */
  accounts: VaultConnectorAccount[];
  /** connected: the names of the shared vaults/folders agents read. */
  vaultNames: string[];
  /** connected: logins agents may use now; null while unknown. */
  loginCount: number | null;
  /** Bitwarden: the server address (https only), when it is not the default. */
  serverUrl: string | null;
  /** A fixed sentence for `failed`; never a token, a command output or the manager's own text. */
  error: string | null;
  errorCode: VaultConnectorErrorCode | null;
}

export interface VaultConnectorList {
  connectors: VaultConnectorStatus[];
}

export interface VaultConnectorIdInput {
  connector: VaultConnectorId;
}

export interface ConnectVaultConnectorInput extends VaultConnectorIdInput {
  method: VaultConnectorMethod;
  /** 1Password `app`: the account to use (omit when there is one). */
  accountId?: string;
  /** `token`/`session-key`: write-only. Checked for its length here and with the manager by the program. */
  secret?: string;
  /** Bitwarden: an `https:` server address of a self-hosted server. */
  serverUrl?: string;
}

/** The fields of a Vault item the person may reveal or copy. */
export const VAULT_REVEAL_FIELDS = ["password", "number", "securityCode", "key"] as const;
export type VaultRevealField = (typeof VAULT_REVEAL_FIELDS)[number];

export interface VaultItemFieldInput {
  itemId: string;
  field: VaultRevealField;
}

export interface ImportVaultCsvInput {
  /** The text of a CSV export of a password manager (logins only; other rows are skipped). */
  csv: string;
}

export interface VaultCsvImportResult {
  imported: number;
  skipped: number;
}

/** The current two-step code of a login or an authenticator item; the code is shown to the person only. */
export interface VaultTwoStepCode {
  itemId: string;
  code: string;
  period: number;
  remainingMs: number;
}

export interface VaultCodes {
  codes: VaultTwoStepCode[];
}

export interface VaultConnectorsDesktopApi {
  list: () => Promise<VaultConnectorList>;
  status: (input: VaultConnectorIdInput) => Promise<VaultConnectorStatus>;
  /** Looks for the manager's tool and asks it, without unlocking or approving anything. Overlapping checks share one run. */
  checkSetup: (input: VaultConnectorIdInput) => Promise<VaultConnectorStatus>;
  /** Downloads the program's own copy of the tool (the person agreed by pressing the button), then checks again. */
  installCli: (input: VaultConnectorIdInput) => Promise<VaultConnectorStatus>;
  /** Opens the manager's app, where the person turns on the tool's integration, or its download page. */
  openApp: (input: VaultConnectorIdInput) => Promise<void>;
  /** Replaces an earlier connection. With several 1Password accounts and none named it answers `choose-account` and creates nothing. */
  connect: (input: ConnectVaultConnectorInput) => Promise<VaultConnectorStatus>;
  /** Stops a connection attempt. */
  cancel: (input: VaultConnectorIdInput) => Promise<VaultConnectorStatus>;
  /** Forgets the saved token or key. What exists in the manager (the shared vault, a service account) stays: only the person removes it there. */
  disconnect: (input: VaultConnectorIdInput) => Promise<VaultConnectorStatus>;
}

/** The person's own tools for Vault items (the screen of the local Vault). Agents never get these. */
export interface VaultSecretsDesktopApi {
  /** A saved secret, for the person who asked to see it. The only way a value leaves the Vault; never in an event or a log. */
  reveal: (input: VaultItemFieldInput) => Promise<{ value: string }>;
  /** Puts the secret on the clipboard and clears it after `clipboardSeconds` (if the clipboard still holds it). */
  copy: (input: VaultItemFieldInput) => Promise<{ clearsInSeconds: number }>;
  importCsv: (input: ImportVaultCsvInput) => Promise<VaultCsvImportResult>;
  /** The current two-step codes of every item that has a key. */
  codes: () => Promise<VaultCodes>;
  /** Removes every item of the local Vault (the person confirmed in the screen). Connectors stay connected. */
  reset: () => Promise<void>;
}

/** Event `vault-connectors-changed`: the whole list. */
export interface VaultConnectorsChanged extends VaultConnectorList {}

// --- rules shared by the engine and the mock ---

const CONNECTOR_LABELS: Readonly<Record<VaultConnectorId, string>> = {
  onepassword: "1Password",
  bitwarden: "Bitwarden",
  protonpass: "Proton Pass",
};

const CONNECTOR_METHODS: Readonly<Record<VaultConnectorId, readonly VaultConnectorMethod[]>> = {
  onepassword: ["app", "token"],
  bitwarden: ["session-key"],
  protonpass: ["browser", "token"],
};

/** The sentence of each failure. Fixed: no manager output, no token. */
export const VAULT_CONNECTOR_ERROR_SENTENCES: Readonly<Record<VaultConnectorErrorCode, string>> = {
  "cli-missing": "The manager's command-line tool was not found. Install it or let the program download its own copy.",
  "cli-signed-out":
    "The manager's app has no signed-in account. Sign in there and turn on the command-line integration.",
  "token-rejected": "The manager did not accept that token or key.",
  locked: "The vault is locked or the session ended. Connect again.",
  "folder-missing": `The shared folder "${VAULT_CONNECTOR_SHARED_NAME}" was not found in the manager.`,
  plan: "This account's plan does not allow the command-line tool.",
  unknown: "Something went wrong with the manager. Try again.",
};

export function vaultConnectorLabel(connector: VaultConnectorId): string {
  return CONNECTOR_LABELS[connector];
}

export function vaultConnectorMethods(connector: VaultConnectorId): VaultConnectorMethod[] {
  return [...CONNECTOR_METHODS[connector]];
}

export function emptyVaultConnectorStatus(connector: VaultConnectorId): VaultConnectorStatus {
  return {
    connector,
    label: CONNECTOR_LABELS[connector],
    state: "disconnected",
    methods: vaultConnectorMethods(connector),
    setup: { cli: "checking", cliVersion: null, canInstall: false, appIntegration: null },
    accounts: [],
    vaultNames: [],
    loginCount: null,
    serverUrl: null,
    error: null,
    errorCode: null,
  };
}

/** An `https:` address without credentials, query or fragment and without a trailing slash; null otherwise. */
export function normalizeServerUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/u, "")}`;
  } catch {
    return null;
  }
}

/** The tool's version ("2.18.0") is at least `minimum` ([2, 18]). */
export function cliVersionAtLeast(version: string, minimum: readonly [number, number]): boolean {
  const [major = 0, minor = 0] = version.trim().split(".").map(Number);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
  return major > minimum[0] || (major === minimum[0] && minor >= minimum[1]);
}

// --- guards and parsers ---

export function isVaultConnectorId(value: unknown): value is VaultConnectorId {
  return isOneOf(VAULT_CONNECTOR_IDS, value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isAccount(value: unknown): value is VaultConnectorAccount {
  return isDynamicRecord(value) && isString(value.id) && value.id.length > 0 && isString(value.label);
}

function isSetup(value: unknown): value is VaultConnectorSetup {
  return (
    isDynamicRecord(value) &&
    isOneOf(VAULT_CONNECTOR_CLI_STATES, value.cli) &&
    isNullableString(value.cliVersion) &&
    isBoolean(value.canInstall) &&
    (value.appIntegration === null || isBoolean(value.appIntegration))
  );
}

export function isVaultConnectorStatus(value: unknown): value is VaultConnectorStatus {
  if (!isDynamicRecord(value)) return false;
  if (
    !(
      isVaultConnectorId(value.connector) &&
      isString(value.label) &&
      isOneOf(VAULT_CONNECTOR_STATES, value.state) &&
      Array.isArray(value.methods) &&
      value.methods.every((method) => isOneOf(VAULT_CONNECTOR_METHODS, method)) &&
      isSetup(value.setup) &&
      Array.isArray(value.accounts) &&
      value.accounts.every(isAccount) &&
      Array.isArray(value.vaultNames) &&
      value.vaultNames.every(isString) &&
      (value.loginCount === null || (isNumber(value.loginCount) && value.loginCount >= 0)) &&
      isNullableString(value.serverUrl) &&
      isNullableString(value.error) &&
      (value.errorCode === null || isOneOf(VAULT_CONNECTOR_ERROR_CODES, value.errorCode))
    )
  )
    return false;
  // The state and the fields agree.
  if (value.state === "choose-account") return value.accounts.length > 0;
  if (value.accounts.length > 0) return false;
  if (value.state === "failed") return value.error !== null && value.errorCode !== null;
  if (value.state !== "connected") return value.loginCount === null && value.vaultNames.length === 0;
  return true;
}

export function isVaultConnectorList(value: unknown): value is VaultConnectorList {
  if (!isDynamicRecord(value) || !Array.isArray(value.connectors)) return false;
  const connectors: unknown[] = value.connectors;
  if (!connectors.every(isVaultConnectorStatus)) return false;
  return (
    new Set(connectors.map((entry) => (isVaultConnectorStatus(entry) ? entry.connector : ""))).size ===
    connectors.length
  );
}

export function isVaultConnectorsChanged(
  value: unknown,
): value is VaultConnectorsChanged & { type: "vault-connectors-changed" } {
  return isDynamicRecord(value) && value.type === "vault-connectors-changed" && isVaultConnectorList(value);
}

export function isVaultCodes(value: unknown): value is VaultCodes {
  return (
    isDynamicRecord(value) &&
    Array.isArray(value.codes) &&
    value.codes.every(
      (entry) =>
        isDynamicRecord(entry) &&
        isString(entry.itemId) &&
        isString(entry.code) &&
        /^\d{6,8}$/.test(entry.code) &&
        isNumber(entry.period) &&
        entry.period > 0 &&
        isNumber(entry.remainingMs) &&
        entry.remainingMs >= 0,
    )
  );
}

export function isVaultCsvImportResult(value: unknown): value is VaultCsvImportResult {
  return (
    isDynamicRecord(value) &&
    isNumber(value.imported) &&
    value.imported >= 0 &&
    isNumber(value.skipped) &&
    value.skipped >= 0
  );
}

export function parseVaultConnectorIdInput(input: unknown): VaultConnectorIdInput {
  if (!isDynamicRecord(input)) throw new Error("The connector request is malformed.");
  if (!isVaultConnectorId(input.connector))
    throw new Error(`The connector is one of: ${VAULT_CONNECTOR_IDS.join(", ")}.`);
  return { connector: input.connector };
}

/** The secret is checked for its length only. An error never repeats what was typed. */
export function parseConnectVaultConnectorInput(input: unknown): ConnectVaultConnectorInput {
  const { connector } = parseVaultConnectorIdInput(input);
  if (!isDynamicRecord(input)) throw new Error("The connector request is malformed.");
  const record = input;
  if (!isOneOf(VAULT_CONNECTOR_METHODS, record.method) || !CONNECTOR_METHODS[connector].includes(record.method))
    throw new Error(`${CONNECTOR_LABELS[connector]} connects with: ${CONNECTOR_METHODS[connector].join(", ")}.`);
  const method = record.method;
  const parsed: ConnectVaultConnectorInput = { connector, method };
  if (record.accountId !== undefined) {
    if (
      !isString(record.accountId) ||
      record.accountId.length === 0 ||
      record.accountId.length > VAULT_CONNECTOR_LIMITS.accountId
    )
      throw new Error("Choose one of the accounts that were offered.");
    if (!(connector === "onepassword" && method === "app"))
      throw new Error("Only 1Password's app connection takes an account.");
    parsed.accountId = record.accountId;
  }
  if (method === "token" || method === "session-key") {
    const secret = isString(record.secret) ? record.secret.trim() : "";
    if (secret.length === 0) throw new Error("Paste the token or key first.");
    if (secret.length > VAULT_CONNECTOR_LIMITS.secret) throw new Error("That token or key is too long.");
    parsed.secret = secret;
  } else if (record.secret !== undefined) {
    throw new Error("This way of connecting takes no token or key.");
  }
  if (record.serverUrl !== undefined) {
    if (connector !== "bitwarden") throw new Error("Only Bitwarden takes a server address.");
    const address = isString(record.serverUrl) ? normalizeServerUrl(record.serverUrl) : null;
    if (address === null)
      throw new Error("A server address starts with https:// and has no user name, query or fragment.");
    parsed.serverUrl = address;
  }
  return parsed;
}

export function parseVaultItemFieldInput(input: unknown): VaultItemFieldInput {
  if (!isDynamicRecord(input)) throw new Error("The Vault request is malformed.");
  if (!isString(input.itemId) || input.itemId.length === 0 || input.itemId.length > 200)
    throw new Error("Choose a Vault item.");
  if (!isOneOf(VAULT_REVEAL_FIELDS, input.field))
    throw new Error(`The field is one of: ${VAULT_REVEAL_FIELDS.join(", ")}.`);
  return { itemId: input.itemId, field: input.field };
}

export function parseImportVaultCsvInput(input: unknown): ImportVaultCsvInput {
  if (!isDynamicRecord(input) || !isString(input.csv)) throw new Error("The import request is malformed.");
  if (input.csv.trim().length === 0) throw new Error("The file is empty.");
  if (input.csv.length > VAULT_CONNECTOR_LIMITS.csvCharacters) throw new Error("That file is too large to import.");
  return { csv: input.csv };
}
