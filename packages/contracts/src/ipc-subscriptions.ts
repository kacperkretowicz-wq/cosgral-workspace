// COSGRAL W5-BE1: managed agent CLIs (Codex, Claude Code). The program downloads the official CLI when none is found,
// checks it (SHA-256 from the official manifest), keeps one folder per version and updates it automatically unless the
// person switched that off or pinned a version. A custom path always wins over the downloaded CLI, which wins over a
// CLI on PATH. Only downloaded CLIs are ever removed. This computer only (not the phone, not a remote server).
// The first download of a CLI asks on a confirm card in Needs you; updates after that run without a card.

import { type DynamicRecord, isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const MANAGED_CLI_IDS = ["codex", "claude"] as const;
export type ManagedCliId = (typeof MANAGED_CLI_IDS)[number];

/** Where the CLI in use comes from: the person's own path, downloaded by COSGRAL, found on the system, or none. */
export const MANAGED_CLI_SOURCES = ["custom", "managed", "system", "none"] as const;
export type ManagedCliSource = (typeof MANAGED_CLI_SOURCES)[number];

export const MANAGED_CLI_PHASES = [
  "idle",
  "checking",
  "awaiting-approval",
  "downloading",
  "verifying",
  "installing",
  "removing",
  "error",
] as const;
export type ManagedCliPhase = (typeof MANAGED_CLI_PHASES)[number];

export const MANAGED_CLI_LIMITS = {
  customPath: 1024,
  version: 64,
} as const;

export interface ManagedCliProgress {
  receivedBytes: number;
  /** 0 when the server did not say. */
  totalBytes: number;
}

export interface ManagedCliState {
  id: ManagedCliId;
  source: ManagedCliSource;
  /** The executable in use (custom, managed or system); null when there is none. */
  executable: string | null;
  /** Version of the CLI in use. */
  version: string | null;
  /** The downloaded (managed) version, also when a custom or system CLI is in use. */
  managedVersion: string | null;
  /** Pinned version for downloads and updates; null = the newest from the official source. */
  pinnedVersion: string | null;
  /** Newest version seen at the official source; null until checked. */
  latestVersion: string | null;
  /** Update the downloaded CLI without asking (default true, owner decision 16.11). Ignored while pinned. */
  autoUpdate: boolean;
  /** The person's own executable; when set it is used instead of the downloaded or system CLI. */
  customPath: string | null;
  phase: ManagedCliPhase;
  progress: ManagedCliProgress | null;
  /** Readable reason of the last failure; null when fine. */
  error: string | null;
  /** When the official source was last checked (ISO time); null when never. */
  checkedAt: string | null;
}

export interface ManagedCliIdInput {
  id: ManagedCliId;
}

export interface InstallManagedCliInput {
  id: ManagedCliId;
  /** A specific version; omitted = pinned version, else the newest. */
  version?: string;
}

export interface PinManagedCliInput {
  id: ManagedCliId;
  /** null unpins (follow the newest version). */
  version: string | null;
}

export interface ManagedCliSettingsInput {
  id: ManagedCliId;
  autoUpdate?: boolean;
  /** A path to the person's own CLI; null clears it (back to downloaded or system). */
  customPath?: string | null;
}

// ---------------------------------------------------------------------------------------------------------------
// COSGRAL W5-BE2: provider accounts (subscriptions) and the account pool. Each account has its own CLI state folder
// under the COSGRAL data folder (`CODEX_HOME` / `CLAUDE_CONFIG_DIR`); the program never opens the files inside. The
// person signs in in the window (the official CLI opens the browser or shows a code); agents never sign in. The
// "system" account is the CLI's own default folder (the login that already works today), only referenced, never
// deleted. The pool takes only the owner's own accounts (plan terms may forbid sharing an account).

export type ProviderAccountProvider = ManagedCliId;

export const ACCOUNT_LOGIN_PHASES = ["idle", "waiting-for-browser", "code-required", "success", "error"] as const;
export type AccountLoginPhase = (typeof ACCOUNT_LOGIN_PHASES)[number];

export const ACCOUNT_LIMITS = {
  label: 64,
  /** A pasted sign-in code (only passed to the CLI, never stored). */
  code: 512,
  maxAccountsPerProvider: { min: 1, max: 10 },
} as const;

/** Shown wherever accounts are added to the pool (R1). */
export const ACCOUNT_POOL_WARNING =
  "Use only your own accounts. The terms of ChatGPT and Claude plans may forbid sharing an account or using several accounts to get around limits.";

export interface AccountLogin {
  phase: AccountLoginPhase;
  /** Readable state ("Waiting for the browser…", the reason of a failure); null when idle. */
  message: string | null;
  /** The sign-in page the CLI printed (to open again when the browser did not open); null when none. */
  url: string | null;
  /** A device code the CLI printed for the person to enter on the sign-in page; null when none. */
  userCode: string | null;
}

export interface ProviderAccount {
  id: string;
  provider: ProviderAccountProvider;
  label: string;
  /** A name for the CLI state folder (e.g. "acc-1a2b3c4d" or "System (~/.codex)"); never a full path. */
  stateDir: string;
  /** The CLI's own default folder (the login that works today); never deleted, only signed out. */
  system: boolean;
  loggedIn: boolean;
  /** The signed-in account from the CLI, masked ("k***@g***.com"); null when unknown or signed out. */
  account: string | null;
  /** Plan or sign-in method from the CLI ("max", "ChatGPT"); null when unknown. */
  plan: string | null;
  /** Exactly one default account per provider; agents without an own choice use it. */
  isDefault: boolean;
  inPool: boolean;
  /** Order in the pool (1 = tried first), per provider. */
  poolOrder: number;
  /** A disabled account is never chosen. */
  enabled: boolean;
  /** Limited until this time (ISO); null when free. Set by the pool (W5-K1). */
  limitedUntil: string | null;
  login: AccountLogin;
  /** When the state was last read from the CLI (ISO); null when never. */
  checkedAt: string | null;
}

export interface PoolSettings {
  /** How many accounts one provider may have (default 3, changeable). Adding more is refused. */
  maxAccountsPerProvider: number;
  /** Switch accounts on a limit only before the first action of a turn (never repeat side effects). */
  switchBeforeFirstAction: true;
}

export interface AgentAccountAssignment {
  botId: string;
  /** null = the provider's default account. */
  accountId: string | null;
}

export interface AccountsSnapshot {
  accounts: ProviderAccount[];
  pool: PoolSettings;
  assignments: AgentAccountAssignment[];
}

export interface AddAccountInput {
  provider: ProviderAccountProvider;
  label: string;
}

export interface AccountIdInput {
  id: string;
}

export interface SubmitLoginCodeInput {
  id: string;
  /** Passed to the sign-in process only; never stored, logged or sent in an event. */
  code: string;
}

export interface SetAccountPoolInput {
  id: string;
  inPool: boolean;
  /** Move to this place in the provider's pool (1 = first). */
  poolOrder?: number;
  enabled?: boolean;
  /** true makes this the provider's only default account. */
  isDefault?: boolean;
}

export interface PoolSettingsInput {
  maxAccountsPerProvider: number;
}

/** COSGRAL W5: subscriptions API. Optional in the window until every mock has it. */
export interface SubscriptionsDesktopApi {
  // W5-BE2: accounts and the pool.
  listAccounts: () => Promise<AccountsSnapshot>;
  /** Creates the account's own state folder; the account starts signed out. Refused over the pool limit. */
  addAccount: (input: AddAccountInput) => Promise<ProviderAccount>;
  /** Deletes the account and its state folder (the window confirms first); the system account cannot be removed. */
  removeAccount: (input: AccountIdInput) => Promise<AccountsSnapshot>;
  /** Starts the official sign-in of the CLI; follow `login` in accounts-changed. */
  loginAccount: (input: AccountIdInput) => Promise<ProviderAccount>;
  /** Passes a pasted code to the running sign-in (phase code-required). */
  submitLoginCode: (input: SubmitLoginCodeInput) => Promise<ProviderAccount>;
  cancelLogin: (input: AccountIdInput) => Promise<ProviderAccount>;
  /** Workaround when the sign-in cannot run in the window (R2): a terminal window with the command ready. */
  openLoginTerminal: (input: AccountIdInput) => Promise<ProviderAccount>;
  logoutAccount: (input: AccountIdInput) => Promise<ProviderAccount>;
  /** Reads the state again from the CLI (no secrets). */
  refreshAccount: (input: AccountIdInput) => Promise<ProviderAccount>;
  setAccountPool: (input: SetAccountPoolInput) => Promise<AccountsSnapshot>;
  /** Stores which account an agent uses (null = default). Applied when agents start (W5-K1). */
  assignAccountToAgent: (input: AgentAccountAssignment) => Promise<AccountsSnapshot>;
  getPoolSettings: () => Promise<PoolSettings>;
  setPoolSettings: (input: PoolSettingsInput) => Promise<PoolSettings>;
  // W5-BE1: managed CLIs.
  listCli: () => Promise<ManagedCliState[]>;
  /** Ask the official source for the newest version (no download). */
  checkCli: (input: ManagedCliIdInput) => Promise<ManagedCliState>;
  /** Download, verify and install; the first download of a CLI asks on a confirm card first. */
  installCli: (input: InstallManagedCliInput) => Promise<ManagedCliState>;
  /** Install the newest (or pinned) version now. */
  updateCli: (input: ManagedCliIdInput) => Promise<ManagedCliState>;
  /** Remove the downloaded CLI only; a custom or system CLI is never touched. */
  removeCli: (input: ManagedCliIdInput) => Promise<ManagedCliState>;
  pinCli: (input: PinManagedCliInput) => Promise<ManagedCliState>;
  setCliSettings: (input: ManagedCliSettingsInput) => Promise<ManagedCliState>;
}

export function isManagedCliId(value: unknown): value is ManagedCliId {
  return isOneOf(MANAGED_CLI_IDS, value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isProgress(value: unknown): value is ManagedCliProgress {
  return isDynamicRecord(value) && isNumber(value.receivedBytes) && isNumber(value.totalBytes);
}

export function isManagedCliState(value: unknown): value is ManagedCliState {
  return (
    isDynamicRecord(value) &&
    isManagedCliId(value.id) &&
    isOneOf(MANAGED_CLI_SOURCES, value.source) &&
    isNullableString(value.executable) &&
    isNullableString(value.version) &&
    isNullableString(value.managedVersion) &&
    isNullableString(value.pinnedVersion) &&
    isNullableString(value.latestVersion) &&
    isBoolean(value.autoUpdate) &&
    isNullableString(value.customPath) &&
    isOneOf(MANAGED_CLI_PHASES, value.phase) &&
    (value.progress === null || isProgress(value.progress)) &&
    isNullableString(value.error) &&
    isNullableString(value.checkedAt)
  );
}

export function isManagedCliStateList(value: unknown): value is ManagedCliState[] {
  return Array.isArray(value) && value.every(isManagedCliState);
}

function parseVersion(value: unknown): string {
  if (!isString(value) || !/^[0-9A-Za-z.+-]{1,64}$/.test(value)) throw new Error("The version is not valid.");
  return value;
}

function parseId(value: unknown): ManagedCliId {
  if (!isDynamicRecord(value) || !isManagedCliId(value.id)) throw new Error("Choose Codex or Claude.");
  return value.id;
}

export function parseManagedCliIdInput(value: unknown): ManagedCliIdInput {
  return { id: parseId(value) };
}

export function parseInstallManagedCliInput(value: unknown): InstallManagedCliInput {
  const id = parseId(value);
  const record = isDynamicRecord(value) ? value : {};
  return record.version === undefined ? { id } : { id, version: parseVersion(record.version) };
}

export function parsePinManagedCliInput(value: unknown): PinManagedCliInput {
  const id = parseId(value);
  const record = isDynamicRecord(value) ? value : {};
  return { id, version: record.version === null ? null : parseVersion(record.version) };
}

// --- W5-BE2 guards and parsers ---

/** `acc-<8–32 lowercase letters or digits>` or `system-codex` / `system-claude`. */
export const ACCOUNT_ID_PATTERN = /^(acc-[a-z0-9]{8,32}|system-(codex|claude))$/;

function isAccountLogin(value: unknown): value is AccountLogin {
  return (
    isDynamicRecord(value) &&
    isOneOf(ACCOUNT_LOGIN_PHASES, value.phase) &&
    isNullableString(value.message) &&
    isNullableString(value.url) &&
    isNullableString(value.userCode)
  );
}

export function isProviderAccount(value: unknown): value is ProviderAccount {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isManagedCliId(value.provider) &&
    isString(value.label) &&
    isString(value.stateDir) &&
    isBoolean(value.system) &&
    isBoolean(value.loggedIn) &&
    isNullableString(value.account) &&
    isNullableString(value.plan) &&
    isBoolean(value.isDefault) &&
    isBoolean(value.inPool) &&
    isNumber(value.poolOrder) &&
    isBoolean(value.enabled) &&
    isNullableString(value.limitedUntil) &&
    isAccountLogin(value.login) &&
    isNullableString(value.checkedAt)
  );
}

export function isPoolSettings(value: unknown): value is PoolSettings {
  return isDynamicRecord(value) && isNumber(value.maxAccountsPerProvider) && value.switchBeforeFirstAction === true;
}

export function isAccountsSnapshot(value: unknown): value is AccountsSnapshot {
  return (
    isDynamicRecord(value) &&
    Array.isArray(value.accounts) &&
    value.accounts.every(isProviderAccount) &&
    isPoolSettings(value.pool) &&
    Array.isArray(value.assignments) &&
    value.assignments.every((item) => isDynamicRecord(item) && isString(item.botId) && isNullableString(item.accountId))
  );
}

function parseAccountId(value: unknown): string {
  if (!isString(value) || !ACCOUNT_ID_PATTERN.test(value)) throw new Error("Unknown account.");
  return value;
}

function record(value: unknown): DynamicRecord {
  if (!isDynamicRecord(value)) throw new Error("Expected an object.");
  return value;
}

export function parseAccountIdInput(value: unknown): AccountIdInput {
  return { id: parseAccountId(record(value).id) };
}

export function parseAddAccountInput(value: unknown): AddAccountInput {
  const input = record(value);
  if (!isManagedCliId(input.provider)) throw new Error("Choose Codex or Claude.");
  const label = isString(input.label) ? input.label.trim() : "";
  if (label.length === 0 || label.length > ACCOUNT_LIMITS.label)
    throw new Error(`Give the account a name of 1 to ${ACCOUNT_LIMITS.label} characters.`);
  return { provider: input.provider, label };
}

export function parseSubmitLoginCodeInput(value: unknown): SubmitLoginCodeInput {
  const input = record(value);
  const code = isString(input.code) ? input.code.trim() : "";
  if (code.length === 0 || code.length > ACCOUNT_LIMITS.code || /[\r\n]/.test(code))
    throw new Error("Paste the code from the sign-in page.");
  return { id: parseAccountId(input.id), code };
}

export function parseSetAccountPoolInput(value: unknown): SetAccountPoolInput {
  const input = record(value);
  if (!isBoolean(input.inPool)) throw new Error("inPool must be true or false.");
  const parsed: SetAccountPoolInput = { id: parseAccountId(input.id), inPool: input.inPool };
  if (input.poolOrder !== undefined) {
    if (!isNumber(input.poolOrder) || !Number.isInteger(input.poolOrder) || input.poolOrder < 1)
      throw new Error("The pool position must be a whole number from 1.");
    parsed.poolOrder = input.poolOrder;
  }
  if (input.enabled !== undefined) {
    if (!isBoolean(input.enabled)) throw new Error("enabled must be true or false.");
    parsed.enabled = input.enabled;
  }
  if (input.isDefault !== undefined) {
    if (input.isDefault !== true) throw new Error("Choose another account as the default instead.");
    parsed.isDefault = true;
  }
  return parsed;
}

export function parseAgentAccountAssignment(value: unknown): AgentAccountAssignment {
  const input = record(value);
  if (!isString(input.botId) || input.botId.length === 0 || input.botId.length > 128)
    throw new Error("Choose an agent.");
  return { botId: input.botId, accountId: input.accountId === null ? null : parseAccountId(input.accountId) };
}

export function parsePoolSettingsInput(value: unknown): PoolSettingsInput {
  const input = record(value);
  const { min, max } = ACCOUNT_LIMITS.maxAccountsPerProvider;
  if (
    !isNumber(input.maxAccountsPerProvider) ||
    !Number.isInteger(input.maxAccountsPerProvider) ||
    input.maxAccountsPerProvider < min ||
    input.maxAccountsPerProvider > max
  )
    throw new Error(`The account limit must be a whole number from ${min} to ${max}.`);
  return { maxAccountsPerProvider: input.maxAccountsPerProvider };
}

export function parseManagedCliSettingsInput(value: unknown): ManagedCliSettingsInput {
  const id = parseId(value);
  const record = isDynamicRecord(value) ? value : {};
  const input: ManagedCliSettingsInput = { id };
  if (record.autoUpdate !== undefined) {
    if (!isBoolean(record.autoUpdate)) throw new Error("autoUpdate must be true or false.");
    input.autoUpdate = record.autoUpdate;
  }
  if (record.customPath !== undefined) {
    if (record.customPath === null) input.customPath = null;
    else if (
      isString(record.customPath) &&
      record.customPath.trim().length > 0 &&
      record.customPath.length <= MANAGED_CLI_LIMITS.customPath
    )
      input.customPath = record.customPath.trim();
    else throw new Error("The CLI path is not valid.");
  }
  return input;
}
