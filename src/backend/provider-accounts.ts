// COSGRAL W5-BE2: provider accounts (subscriptions) and the account pool settings.
//
// - Every added account has its own CLI state folder `<root>/<accountId>`; the CLI gets it only as an environment
//   variable (`CODEX_HOME` / `CLAUDE_CONFIG_DIR`). The program never opens, copies or prints the files inside.
// - The system account per provider is the login that already works today (the CLI's own default folder). It is the
//   default, it cannot be signed in, signed out or removed here, and nothing changes its files.
// - Sign-in runs the official CLI command as a child process; the CLI opens the browser or prints a page or a code.
//   The window shows the page and the code and can pass a pasted code to the process (never stored). A sign-in that
//   fails or takes too long ends as "error"; only the process this program started is stopped.
// - The state comes only from status commands without secrets (`codex login status`, `claude auth status --json`):
//   loggedIn, a masked account and the plan. Raw CLI output is never logged or sent to the window.
// - The pool limit (accounts per provider, default 3) is enforced here. Using the pool (assignments at agent start,
//   switching on a limit) is W5-K1.

import { type ChildProcess, execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { lstat, mkdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  ACCOUNT_LIMITS,
  type AccountLogin,
  type AccountsSnapshot,
  type AgentAccountAssignment,
  type PoolSettings,
  type ProviderAccount,
  type ProviderAccountProvider,
  type SetAccountPoolInput,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isBoolean, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { cliCommand } from "./cli";

const PROVIDERS: readonly ProviderAccountProvider[] = ["codex", "claude"];
const NAMES: Record<ProviderAccountProvider, string> = { codex: "Codex", claude: "Claude" };
const STATE_VARIABLE: Record<ProviderAccountProvider, "CODEX_HOME" | "CLAUDE_CONFIG_DIR"> = {
  codex: "CODEX_HOME",
  claude: "CLAUDE_CONFIG_DIR",
};
const COMMANDS: Record<ProviderAccountProvider, { login: string[]; status: string[]; logout: string[] }> = {
  codex: { login: ["login"], status: ["login", "status"], logout: ["logout"] },
  claude: { login: ["auth", "login"], status: ["auth", "status", "--json"], logout: ["auth", "logout"] },
};
const NEW_ACCOUNT_ID = /^acc-[a-z0-9]{8,32}$/;
export const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const STATUS_TIMEOUT_MS = 30_000;
const OUTPUT_LIMIT = 64 * 1024;
const EXIT_GRACE_MS = 750;
const IDLE: AccountLogin = { phase: "idle", message: null, url: null, userCode: null };

/** A running sign-in process (the default runs the CLI; tests use a fake CLI). */
export interface LoginProcess {
  onOutput: (listener: (text: string) => void) => void;
  onExit: (listener: (code: number | null) => void) => void;
  write: (text: string) => void;
  /** Stops this process and its children only. */
  stop: () => void;
}

export interface AccountCliRunner {
  /** A short command (status, logout): exit code and stdout + stderr (kept in memory only). */
  run: (
    executable: string,
    args: readonly string[],
    env: NodeJS.ProcessEnv,
    timeoutMs: number,
  ) => Promise<{ code: number; output: string }>;
  start: (executable: string, args: readonly string[], env: NodeJS.ProcessEnv) => LoginProcess;
  /** Opens a terminal window with the sign-in command ready (workaround R2). */
  openTerminal: (executable: string, args: readonly string[], env: NodeJS.ProcessEnv) => Promise<void>;
}

export interface ProviderAccountsDeps {
  /** `<COSGRAL data folder>/accounts`. */
  root: string;
  /** The CLI to use (custom > downloaded > system, from cli.ts); throws a readable error when missing. */
  resolveExecutable: (provider: ProviderAccountProvider) => Promise<string>;
  runner?: AccountCliRunner;
  /** Ask the person (card or dialog); true = yes. Used before opening a terminal. */
  confirm: (input: { title: string; preview: string }) => Promise<boolean>;
  emit: (snapshot: AccountsSnapshot) => void;
  baseEnv?: NodeJS.ProcessEnv;
  loginTimeoutMs?: number;
  now?: () => Date;
}

interface StoredAccount {
  id: string;
  provider: ProviderAccountProvider;
  label: string;
  loggedIn: boolean;
  account: string | null;
  plan: string | null;
  isDefault: boolean;
  inPool: boolean;
  poolOrder: number;
  enabled: boolean;
  limitedUntil: string | null;
  checkedAt: string | null;
}

/** "person@example.com" → "p***@e***.com"; other names → "p***". Never returns the full value. */
export function maskAccount(value: string): string {
  const text = value.trim();
  if (!text) return "***";
  const at = text.indexOf("@");
  if (at < 0) return `${text[0]}***`;
  const local = text.slice(0, at);
  const domain = text.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${local[0] ?? ""}***@${domain[0] ?? ""}***${tld}`;
}

/** The sign-in page, a device code and whether the CLI waits for a pasted code, from its output (never stored). */
export function readLoginOutput(text: string): { url: string | null; userCode: string | null; codeRequired: boolean } {
  const url = text.match(/https:\/\/[^\s"'<>]+/)?.[0]?.replace(/[).,;]+$/, "") ?? null;
  const userCode = text.match(/\b([A-Z0-9]{4}-[A-Z0-9]{4,5})\b/)?.[1] ?? null;
  const codeRequired =
    /paste (the |your )?(authentication |authorization )?code|enter (the |your )?code|code here/i.test(text);
  return { url, userCode, codeRequired };
}

/** Status of an account from the CLI's status command (no secrets): loggedIn, masked account, plan. */
export function readAccountStatus(
  provider: ProviderAccountProvider,
  result: { code: number; output: string },
): { loggedIn: boolean; account: string | null; plan: string | null } {
  if (provider === "claude") {
    const start = result.output.indexOf("{");
    try {
      const status = JSON.parse(result.output.slice(start, result.output.lastIndexOf("}") + 1));
      if (!isDynamicRecord(status) || status.loggedIn !== true) return { loggedIn: false, account: null, plan: null };
      return {
        loggedIn: true,
        account: isString(status.email) && status.email ? maskAccount(status.email) : null,
        plan: isString(status.subscriptionType)
          ? status.subscriptionType
          : isString(status.authMethod)
            ? status.authMethod
            : null,
      };
    } catch {
      return { loggedIn: false, account: null, plan: null };
    }
  }
  const signedIn = result.code === 0 && /logged in/i.test(result.output) && !/not logged in/i.test(result.output);
  if (!signedIn) return { loggedIn: false, account: null, plan: null };
  const method = result.output.match(/logged in using (?:an? )?([A-Za-z][\w -]{0,30})/i)?.[1]?.trim() ?? null;
  return { loggedIn: true, account: null, plan: method };
}

export class ProviderAccounts {
  readonly #deps: ProviderAccountsDeps;
  readonly #runner: AccountCliRunner;
  #accounts: StoredAccount[] = [];
  #pool: PoolSettings = { maxAccountsPerProvider: 3, switchBeforeFirstAction: true };
  #assignments: AgentAccountAssignment[] = [];
  readonly #logins = new Map<string, AccountLogin>();
  readonly #running = new Map<string, { process: LoginProcess; timer: NodeJS.Timeout }>();
  /** COSGRAL W5-K1: the account each agent's latest turn runs on (botId -> accountId). In memory only. */
  readonly #active = new Map<string, string>();

  constructor(deps: ProviderAccountsDeps) {
    this.#deps = deps;
    this.#runner = deps.runner ?? nodeCliRunner;
    this.#load();
  }

  /** The environment for a CLI process of this account (also for W5-K1 at agent start). */
  environment(id: string): NodeJS.ProcessEnv {
    const account = this.#find(id);
    const env = { ...(this.#deps.baseEnv ?? process.env) };
    if (!isSystemId(account.id)) env[STATE_VARIABLE[account.provider]] = this.#folder(account.id);
    return env;
  }

  snapshot(): AccountsSnapshot {
    return structuredClone({
      accounts: this.#sorted().map((account) => this.#view(account)),
      pool: this.#pool,
      assignments: this.#assignments,
      active: this.#activeList(),
    });
  }

  account(id: string): ProviderAccount {
    return this.#view(this.#find(id));
  }

  pool(): PoolSettings {
    return { ...this.#pool };
  }

  async add(provider: ProviderAccountProvider, label: string): Promise<ProviderAccount> {
    const count = this.#accounts.filter((account) => account.provider === provider).length;
    if (count >= this.#pool.maxAccountsPerProvider)
      throw new Error(
        `You have ${count} ${NAMES[provider]} accounts and the limit is ${this.#pool.maxAccountsPerProvider}. Remove one or raise the limit in the pool settings.`,
      );
    const id = `acc-${randomBytes(6).toString("hex")}`;
    await mkdir(this.#folder(id), { recursive: true });
    this.#accounts.push({
      ...systemDefaults(provider),
      id,
      label: label.trim().slice(0, ACCOUNT_LIMITS.label),
      isDefault: false,
      poolOrder: count + 1,
    });
    await this.#changed();
    return this.account(id);
  }

  /** Deletes the account and only its own state folder. The system account is never removed. */
  async remove(id: string): Promise<AccountsSnapshot> {
    const account = this.#find(id);
    if (isSystemId(id)) throw new Error("The sign-in of this computer stays. It cannot be removed here.");
    this.#stopLogin(id);
    await this.#deleteFolder(id);
    this.#accounts = this.#accounts.filter((item) => item.id !== id);
    this.#assignments = this.#assignments.filter((item) => item.accountId !== id);
    for (const [botId, accountId] of this.#active) if (accountId === id) this.#active.delete(botId);
    if (account.isDefault) {
      const system = this.#accounts.find((item) => item.id === `system-${account.provider}`);
      if (system) system.isDefault = true;
    }
    this.#renumber(account.provider);
    this.#logins.delete(id);
    await this.#changed();
    return this.snapshot();
  }

  /** Starts the official sign-in of the CLI for this account; the state follows in accounts-changed. */
  async login(id: string): Promise<ProviderAccount> {
    const account = this.#find(id);
    if (isSystemId(id))
      throw new Error("The sign-in of this computer is managed by the CLI itself. Add an account to sign in here.");
    if (this.#running.has(id)) return this.account(id);
    let executable: string;
    try {
      executable = await this.#deps.resolveExecutable(account.provider);
    } catch (error) {
      return this.#setLogin(id, { ...IDLE, phase: "error", message: message(error) });
    }
    await mkdir(this.#folder(id), { recursive: true });
    const child = this.#runner.start(executable, COMMANDS[account.provider].login, this.environment(id));
    const timer = setTimeout(() => {
      this.#stopLogin(id);
      void this.#setLogin(id, {
        ...IDLE,
        phase: "error",
        message: "The sign-in took too long and was stopped. Try again.",
      });
    }, this.#deps.loginTimeoutMs ?? LOGIN_TIMEOUT_MS);
    this.#running.set(id, { process: child, timer });
    let output = "";
    child.onOutput((text) => {
      output = (output + text).slice(-OUTPUT_LIMIT);
      const seen = readLoginOutput(output);
      const current = this.#logins.get(id) ?? IDLE;
      if (current.phase !== "waiting-for-browser" && current.phase !== "code-required") return;
      const phase = seen.codeRequired ? "code-required" : current.phase;
      void this.#setLogin(id, {
        phase,
        url: seen.url ?? current.url,
        userCode: seen.userCode ?? current.userCode,
        message:
          phase === "code-required"
            ? "Sign in in the browser, then paste the code shown there."
            : seen.userCode
              ? "Enter this code on the sign-in page."
              : "Finish signing in in the browser. If it did not open, use the link.",
      });
    });
    child.onExit((code) => {
      const running = this.#running.get(id);
      if (!running || running.process !== child) return;
      clearTimeout(running.timer);
      this.#running.delete(id);
      void this.#finishLogin(id, code);
    });
    return this.#setLogin(id, {
      ...IDLE,
      phase: "waiting-for-browser",
      message: "Opening the sign-in page in your browser…",
    });
  }

  /** Passes a pasted code to the running sign-in. The code is not stored anywhere. */
  async submitCode(id: string, code: string): Promise<ProviderAccount> {
    this.#find(id);
    const running = this.#running.get(id);
    if (!running) throw new Error("No sign-in is running for this account. Choose Sign in first.");
    running.process.write(`${code}\n`);
    return this.#setLogin(id, {
      ...(this.#logins.get(id) ?? IDLE),
      phase: "waiting-for-browser",
      message: "Checking the code…",
    });
  }

  async cancelLogin(id: string): Promise<ProviderAccount> {
    this.#find(id);
    this.#stopLogin(id);
    return this.#setLogin(id, { ...IDLE });
  }

  /**
   * Workaround R2: when the sign-in cannot run in the window, a terminal window opens with the official command and
   * this account's folder, after the person says yes. Never silently.
   */
  async openLoginTerminal(id: string): Promise<ProviderAccount> {
    const account = this.#find(id);
    if (isSystemId(id))
      throw new Error("The sign-in of this computer is managed by the CLI itself. Add an account to sign in here.");
    const executable = await this.#deps.resolveExecutable(account.provider);
    const allowed = await this.#deps.confirm({
      title: `Open a terminal to sign in to ${NAMES[account.provider]}?`,
      preview: `Signing in inside COSGRAL Workspace did not work, so a terminal window will open with the official command "${account.provider} ${COMMANDS[account.provider].login.join(" ")}" for the account "${account.label}". Sign in there, close the window, then choose Refresh. Nothing else runs.`,
    });
    if (!allowed) return this.account(id);
    this.#stopLogin(id);
    await mkdir(this.#folder(id), { recursive: true });
    await this.#runner.openTerminal(executable, COMMANDS[account.provider].login, this.environment(id));
    return this.#setLogin(id, {
      ...IDLE,
      phase: "waiting-for-browser",
      message: "Finish signing in in the terminal window, then choose Refresh.",
    });
  }

  /** Signs the account out with the CLI's own command. The system account is never signed out here. */
  async logout(id: string): Promise<ProviderAccount> {
    const account = this.#find(id);
    if (isSystemId(id))
      throw new Error("The sign-in of this computer stays as it is. Sign out in the CLI itself if you want to.");
    this.#stopLogin(id);
    const executable = await this.#deps.resolveExecutable(account.provider);
    const result = await this.#runner.run(
      executable,
      COMMANDS[account.provider].logout,
      this.environment(id),
      STATUS_TIMEOUT_MS,
    );
    if (result.code !== 0) throw new Error(`${NAMES[account.provider]} could not sign out (exit ${result.code}).`);
    this.#logins.set(id, { ...IDLE });
    return this.refresh(id);
  }

  /** Reads the state again with the status command (no secrets). */
  async refresh(id: string): Promise<ProviderAccount> {
    const account = this.#find(id);
    try {
      const executable = await this.#deps.resolveExecutable(account.provider);
      const result = await this.#runner.run(
        executable,
        COMMANDS[account.provider].status,
        this.environment(id),
        STATUS_TIMEOUT_MS,
      );
      Object.assign(account, readAccountStatus(account.provider, result), { checkedAt: this.#now() });
    } catch {
      // No CLI or no answer: keep the last known state.
    }
    await this.#changed();
    return this.account(id);
  }

  /** At start: reads the state of every account, one after another (never all CLIs at once). */
  async refreshAll(): Promise<void> {
    for (const account of [...this.#accounts]) await this.refresh(account.id).catch(() => undefined);
  }

  async setPool(input: SetAccountPoolInput): Promise<AccountsSnapshot> {
    const account = this.#find(input.id);
    // COSGRAL W5-K1: the limit counts the pool too: after a lower limit, no more accounts may join it.
    if (input.inPool && !account.inPool) {
      const inPool = this.#accounts.filter(
        (item) => item.provider === account.provider && item.inPool && item.id !== account.id,
      ).length;
      if (inPool >= this.#pool.maxAccountsPerProvider)
        throw new Error(
          `The ${NAMES[account.provider]} pool has ${inPool} accounts and the limit is ${this.#pool.maxAccountsPerProvider}. Take one out of the pool or raise the limit in the pool settings.`,
        );
    }
    account.inPool = input.inPool;
    if (input.enabled !== undefined) account.enabled = input.enabled;
    if (input.isDefault)
      for (const item of this.#accounts)
        if (item.provider === account.provider) item.isDefault = item.id === account.id;
    if (input.poolOrder !== undefined) {
      const others = this.#sorted().filter((item) => item.provider === account.provider && item.id !== account.id);
      others.splice(Math.min(input.poolOrder, others.length + 1) - 1, 0, account);
      others.forEach((item, index) => {
        item.poolOrder = index + 1;
      });
    }
    await this.#changed();
    return this.snapshot();
  }

  async assign(botId: string, accountId: string | null): Promise<AccountsSnapshot> {
    if (accountId) this.#find(accountId);
    this.#assignments = [
      ...this.#assignments.filter((item) => item.botId !== botId),
      ...(accountId ? [{ botId, accountId }] : []),
    ];
    await this.#changed();
    return this.snapshot();
  }

  /**
   * COSGRAL W5-K1: the account is limited until this time (null = free again). Set by the pool when a turn hits a
   * usage limit; the pool also clears it when the time has passed.
   */
  async limitUntil(id: string, until: Date | null): Promise<ProviderAccount> {
    const account = this.#find(id);
    account.limitedUntil = until ? until.toISOString() : null;
    await this.#changed();
    return this.account(id);
  }

  /** COSGRAL W5-K1: remembers which account an agent's latest turn runs on, and tells the window. */
  setActive(botId: string, accountId: string | null): void {
    if (accountId === null) {
      if (!this.#active.delete(botId)) return;
    } else {
      if (this.#active.get(botId) === accountId) return;
      this.#find(accountId);
      this.#active.set(botId, accountId);
    }
    this.#emit();
  }

  /** A lower limit keeps existing accounts; only new ones are refused. */
  async setPoolSettings(maxAccountsPerProvider: number): Promise<PoolSettings> {
    this.#pool = { ...this.#pool, maxAccountsPerProvider };
    await this.#changed();
    return this.pool();
  }

  /** Stops running sign-ins (program exit). */
  close(): void {
    for (const id of [...this.#running.keys()]) this.#stopLogin(id);
  }

  async #finishLogin(id: string, code: number | null): Promise<void> {
    if (code !== 0) {
      await this.#setLogin(id, {
        ...IDLE,
        phase: "error",
        message: `The sign-in did not finish${code === null ? "" : ` (exit ${code})`}. Try again.`,
      });
      return;
    }
    await this.refresh(id);
    const signedIn = this.#find(id).loggedIn;
    await this.#setLogin(
      id,
      signedIn
        ? { ...IDLE, phase: "success", message: "Signed in." }
        : { ...IDLE, phase: "error", message: "The CLI finished, but the account is not signed in. Try again." },
    );
  }

  #stopLogin(id: string): void {
    const running = this.#running.get(id);
    if (!running) return;
    clearTimeout(running.timer);
    this.#running.delete(id);
    running.process.stop();
  }

  async #setLogin(id: string, login: AccountLogin): Promise<ProviderAccount> {
    this.#logins.set(id, login);
    this.#emit();
    return this.account(id);
  }

  /** Removes `<root>/<id>` only: a link (junction) is unlinked, never followed. */
  async #deleteFolder(id: string): Promise<void> {
    if (!NEW_ACCOUNT_ID.test(id)) throw new Error("Unknown account.");
    const root = resolve(this.#deps.root);
    const folder = resolve(root, id);
    if (!folder.startsWith(root + sep)) throw new Error("The account folder is outside the accounts folder.");
    const info = await lstat(folder).catch(() => null);
    if (!info) return;
    if (info.isSymbolicLink()) {
      await unlink(folder);
      return;
    }
    await rm(folder, { recursive: true, force: true });
  }

  #activeList(): Array<{ botId: string; accountId: string; label: string }> {
    return [...this.#active].flatMap(([botId, accountId]) => {
      const account = this.#accounts.find((item) => item.id === accountId);
      return account ? [{ botId, accountId, label: account.label }] : [];
    });
  }

  #view(account: StoredAccount): ProviderAccount {
    return {
      ...account,
      stateDir: isSystemId(account.id)
        ? `System (~/${account.provider === "codex" ? ".codex" : ".claude"})`
        : account.id,
      system: isSystemId(account.id),
      login: { ...(this.#logins.get(account.id) ?? IDLE) },
    };
  }

  #sorted(): StoredAccount[] {
    return [...this.#accounts].sort(
      (a, b) => PROVIDERS.indexOf(a.provider) - PROVIDERS.indexOf(b.provider) || a.poolOrder - b.poolOrder,
    );
  }

  #renumber(provider: ProviderAccountProvider): void {
    this.#sorted()
      .filter((item) => item.provider === provider)
      .forEach((item, index) => {
        item.poolOrder = index + 1;
      });
  }

  #find(id: string): StoredAccount {
    const account = this.#accounts.find((item) => item.id === id);
    if (!account) throw new Error("Unknown account.");
    return account;
  }

  #folder(id: string): string {
    return join(this.#deps.root, id);
  }

  #now(): string {
    return (this.#deps.now?.() ?? new Date()).toISOString();
  }

  #file(): string {
    return join(this.#deps.root, "accounts.json");
  }

  #load(): void {
    try {
      const saved = JSON.parse(readFileSync(this.#file(), "utf8"));
      if (isDynamicRecord(saved)) {
        if (Array.isArray(saved.accounts)) this.#accounts = saved.accounts.flatMap(parseStored);
        if (isDynamicRecord(saved.pool) && isNumber(saved.pool.maxAccountsPerProvider))
          this.#pool = { maxAccountsPerProvider: saved.pool.maxAccountsPerProvider, switchBeforeFirstAction: true };
        if (Array.isArray(saved.assignments))
          this.#assignments = saved.assignments.flatMap((item) =>
            isDynamicRecord(item) && isString(item.botId) && isString(item.accountId)
              ? [{ botId: item.botId, accountId: item.accountId }]
              : [],
          );
      }
    } catch {
      // No saved accounts yet.
    }
    for (const provider of PROVIDERS) {
      if (!this.#accounts.some((item) => item.id === `system-${provider}`))
        this.#accounts.unshift(systemDefaults(provider));
      // Accounts whose folder disappeared stay listed (signed out); the folder is created again on sign-in.
      if (!this.#accounts.some((item) => item.provider === provider && item.isDefault)) {
        const system = this.#accounts.find((item) => item.id === `system-${provider}`);
        if (system) system.isDefault = true;
      }
    }
  }

  async #changed(): Promise<void> {
    await mkdir(this.#deps.root, { recursive: true });
    const temporary = `${this.#file()}.tmp`;
    await writeFile(
      temporary,
      `${JSON.stringify({ accounts: this.#accounts, pool: this.#pool, assignments: this.#assignments }, null, 2)}\n`,
    );
    await rename(temporary, this.#file());
    this.#emit();
  }

  #emit(): void {
    this.#deps.emit(this.snapshot());
  }
}

function isSystemId(id: string): boolean {
  return id.startsWith("system-");
}

function systemDefaults(provider: ProviderAccountProvider): StoredAccount {
  return {
    id: `system-${provider}`,
    provider,
    label: `${NAMES[provider]} (this computer)`,
    loggedIn: false,
    account: null,
    plan: null,
    isDefault: true,
    inPool: true,
    poolOrder: 1,
    enabled: true,
    limitedUntil: null,
    checkedAt: null,
  };
}

function parseStored(value: unknown): StoredAccount[] {
  if (!isDynamicRecord(value)) return [];
  const entry: DynamicRecord = value;
  const provider = entry.provider === "codex" || entry.provider === "claude" ? entry.provider : null;
  if (!provider || !isString(entry.id) || !(NEW_ACCOUNT_ID.test(entry.id) || entry.id === `system-${provider}`))
    return [];
  const text = (item: unknown) => (isString(item) && item.length > 0 ? item : null);
  return [
    {
      id: entry.id,
      provider,
      label: text(entry.label) ?? NAMES[provider],
      loggedIn: entry.loggedIn === true,
      // Only a masked value is ever saved; mask again in case an older file had more.
      account: text(entry.account) ? maskAccount(String(entry.account).replace(/\*+/g, "")) : null,
      plan: text(entry.plan),
      isDefault: entry.isDefault === true,
      inPool: isBoolean(entry.inPool) ? entry.inPool : true,
      poolOrder: isNumber(entry.poolOrder) ? entry.poolOrder : 99,
      enabled: isBoolean(entry.enabled) ? entry.enabled : true,
      limitedUntil: text(entry.limitedUntil),
      checkedAt: text(entry.checkedAt),
    },
  ];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Stops a process and its children (Windows: taskkill /T on this PID only). */
function stopTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === "win32") {
    execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, () => undefined);
  } else {
    child.kill("SIGTERM");
  }
}

function spawnCli(executable: string, args: readonly string[], env: NodeJS.ProcessEnv): ChildProcess {
  const command = cliCommand(executable, args);
  return spawn(command.command, command.args, {
    env,
    windowsHide: true,
    windowsVerbatimArguments: command.windowsVerbatimArguments,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export const nodeCliRunner: AccountCliRunner = {
  run: (executable, args, env, timeoutMs) =>
    new Promise((done, fail) => {
      const child = spawnCli(executable, args, env);
      let output = "";
      const collect = (chunk: Buffer) => {
        output = (output + chunk.toString("utf8")).slice(0, OUTPUT_LIMIT);
      };
      child.stdout?.on("data", collect);
      child.stderr?.on("data", collect);
      child.stdin?.end();
      const timer = setTimeout(() => {
        stopTree(child);
        fail(new Error("The CLI did not answer in time."));
      }, timeoutMs);
      child.once("error", (error) => {
        clearTimeout(timer);
        fail(error);
      });
      let settled = false;
      const settle = (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        done({ code: code ?? 1, output });
      };
      child.once("close", settle);
      // A helper process that keeps the output open must not hold the answer back after the CLI itself has exited.
      child.once("exit", (code) => {
        setTimeout(() => settle(code), EXIT_GRACE_MS).unref();
      });
    }),
  start: (executable, args, env) => {
    const child = spawnCli(executable, args, env);
    const exitListeners: ((code: number | null) => void)[] = [];
    let exited = false;
    const finish = (code: number | null) => {
      if (exited) return;
      exited = true;
      for (const listener of exitListeners) listener(code);
    };
    child.once("error", () => finish(null));
    child.once("close", (code) => finish(code));
    // The CLI itself has exited: do not wait for a helper that keeps its output open (it would stall the sign-in).
    child.once("exit", (code) => {
      setTimeout(() => finish(code), EXIT_GRACE_MS).unref();
    });
    return {
      onOutput: (listener) => {
        child.stdout?.on("data", (chunk: Buffer) => listener(chunk.toString("utf8")));
        child.stderr?.on("data", (chunk: Buffer) => listener(chunk.toString("utf8")));
      },
      onExit: (listener) => {
        exitListeners.push(listener);
      },
      write: (text) => {
        child.stdin?.write(text);
      },
      stop: () => stopTree(child),
    };
  },
  openTerminal: async (executable, args, env) => {
    if (process.platform !== "win32") throw new Error("Opening a terminal is available on Windows only.");
    const line = [`"${executable.replaceAll("%", "%%")}"`, ...args].join(" ");
    const child = spawn(
      process.env.ComSpec?.trim() || "cmd.exe",
      ["/d", "/s", "/c", `start "COSGRAL sign-in" cmd.exe /k ${line}`],
      { env, detached: true, stdio: "ignore", windowsVerbatimArguments: true },
    );
    child.unref();
  },
};
