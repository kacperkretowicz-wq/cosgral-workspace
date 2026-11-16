// COSGRAL W5-K1: which provider account answers an agent's turn, and what a usage limit does to that choice.
//
// - An agent uses the account it was assigned, else the provider's default account. When that account cannot be used
//   (switched off, not signed in, at its limit) the pool takes over: the other accounts of the pool, in `poolOrder`.
//   Every turn starts from the first choice again, so the agent is back on its own account as soon as the limit has
//   passed ("returned").
// - A usage limit marks the account `limitedUntil` the time the provider gave (else one hour, said so). If the turn had
//   not done anything yet, the turn goes to the next account on its own. If it had (a command, a file, a tool call),
//   nothing is repeated on its own: the caller asks the person first (R7).
// - Every non-system account has its own CLI process (the state folder only as an environment variable of that
//   process). One process per account in use; a process that has been idle for a while is stopped (R6).
// - Nothing here opens, copies or prints a file of an account folder. With no pool configured the router stays out of
//   the way (kind "off") and the program behaves as it did before accounts.

import type { DatabaseSync } from "node:sqlite";
import type {
  AccountError,
  AccountLimitReached,
  AccountSwitched,
  AccountsSnapshot,
  ProviderAccount,
  ProviderAccountProvider,
} from "@openbot/contracts/ipc";
import { PROVIDER_LIMITS } from "@openbot/contracts/ipc";
import { isString } from "@openbot/contracts/runtime-values";

/** What the router needs from the program's CLI processes. */
export interface RoutedClient {
  stop(): Promise<void>;
}

/** What the router needs from the accounts (ProviderAccounts). */
export interface AccountPoolPort {
  snapshot(): AccountsSnapshot;
  environment(id: string): NodeJS.ProcessEnv;
  limitUntil(id: string, until: Date | null): Promise<ProviderAccount>;
  setActive(botId: string, accountId: string | null): void;
}

/** Which account created a provider session (a thread of the CLI lives in that account's state folder). */
export interface SessionAccounts {
  get(sessionId: string): string | null;
  set(sessionId: string, accountId: string): void;
}

export type AccountEvent =
  | ({ type: "account-switched" } & AccountSwitched)
  | ({ type: "account-limit-reached" } & AccountLimitReached)
  | ({ type: "account-error" } & AccountError);

const NETWORK_ERROR_TEXT =
  /network|offline|connection (?:reset|refused|closed|lost|error|dropped)|\bECONN\w+|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|timed? ?out|socket hang up|fetch failed|error sending request|stream disconnected|bad gateway|service unavailable|overloaded|\b5\d\d\b/i;

/**
 * W5-BE8 (F02): what a failed turn is for the account pool. Only a usage limit counts against the account; a network
 * error (no connection, a dropped connection, a server error) never does; anything else is a plain error.
 */
export function accountFailureKind(failure: {
  kind: "usage-limit" | "unavailable" | null;
  message: string;
}): "usage-limit" | "network" | "other" {
  if (failure.kind === "usage-limit") return "usage-limit";
  if (failure.kind === "unavailable" || NETWORK_ERROR_TEXT.test(failure.message)) return "network";
  return "other";
}

export interface AccountRouterDeps<TClient extends RoutedClient> {
  pool: AccountPoolPort;
  /** Starts and checks the CLI of one account (initialize, signed in); throws a readable error when it cannot. */
  openClient: (provider: ProviderAccountProvider, env: NodeJS.ProcessEnv, accountId: string) => Promise<TClient>;
  sessions?: SessionAccounts;
  emit: (event: AccountEvent) => void;
  now?: () => number;
  /** How long an account's CLI process may sit idle before it is stopped (default 5 minutes). */
  idleMs?: number;
  /** false in tests: no timers; call reconcile() and sweepIdle() by hand. */
  timers?: boolean;
}

export type AccountRoute =
  /** No pool to use: the provider's normal client, nothing remembered. */
  | { kind: "off" }
  | { kind: "use"; account: ProviderAccount }
  /** Every account is out of use; `resetsAtSeconds` is when the first one is free (null when it is not a limit). */
  | { kind: "exhausted"; account: ProviderAccount; resetsAtSeconds: number | null };

export interface AccountLane<TClient extends RoutedClient> {
  accountId: string;
  /** false = the router is out of the way (no pool): the caller keeps no account bookkeeping for this turn. */
  tracked: boolean;
  /** The CLI process of a non-system account; null = the provider's normal client (the system account). */
  client: TClient | null;
}

export type LimitDecision =
  | { action: "none" }
  | { action: "switch"; from: ProviderAccount; to: ProviderAccount }
  | { action: "ask"; from: ProviderAccount; to: ProviderAccount }
  | { action: "exhausted"; from: ProviderAccount };

interface AccountPlan {
  primary: ProviderAccount;
  order: ProviderAccount[];
  configured: boolean;
}

export const IDLE_CLIENT_MS = 5 * 60 * 1000;
const ASSUMED_LIMIT_MS = PROVIDER_LIMITS.limitWithoutResetMinutes * 60 * 1000;
/** Item types that change nothing outside the conversation: a limit after only these may still switch on its own. */
const QUIET_ITEMS = new Set(["userMessage", "agentMessage", "reasoning", "plan", "contextCompaction"]);

function systemId(provider: ProviderAccountProvider): string {
  return `system-${provider}`;
}

export class AccountRouter<TClient extends RoutedClient> {
  readonly #deps: AccountRouterDeps<TClient>;
  readonly #sessions = new Map<string, string>();
  readonly #clients = new Map<string, { client: TClient; lastUsed: number }>();
  readonly #opening = new Map<string, Promise<TClient>>();
  readonly #turns = new Map<string, { accountId: string; botId: string }>();
  readonly #actions = new Set<string>();
  readonly #lastAccount = new Map<string, { accountId: string; primaryId: string | null }>();
  readonly #expiry = new Map<string, NodeJS.Timeout>();
  #sweeper: NodeJS.Timeout | null = null;

  constructor(deps: AccountRouterDeps<TClient>) {
    this.#deps = deps;
    if (deps.timers !== false) {
      this.#sweeper = setInterval(() => void this.sweepIdle(), 60_000);
      this.#sweeper.unref();
    }
  }

  #now(): number {
    return this.#deps.now?.() ?? Date.now();
  }

  #limited(account: ProviderAccount): boolean {
    return account.limitedUntil !== null && Date.parse(account.limitedUntil) > this.#now();
  }

  /** A switched-off, signed-out or limited account is never chosen. The system account counts as usable until its state was read. */
  #usable(account: ProviderAccount, exclude: ReadonlySet<string>): boolean {
    if (exclude.has(account.id) || !account.enabled || this.#limited(account)) return false;
    return account.loggedIn || (account.system && account.checkedAt === null);
  }

  /** The agent's own account first (assigned, else default), then the pool in its order. */
  #order(botId: string, provider: ProviderAccountProvider, snapshot: AccountsSnapshot): AccountPlan | null {
    const accounts = snapshot.accounts.filter((account) => account.provider === provider);
    const assignedId = snapshot.assignments.find((item) => item.botId === botId)?.accountId ?? null;
    const assigned = assignedId ? (accounts.find((account) => account.id === assignedId) ?? null) : null;
    const primary = assigned ?? accounts.find((account) => account.isDefault) ?? accounts.find((a) => a.system) ?? null;
    if (!primary) return null;
    const members = accounts.filter((account) => account.inPool && account.id !== primary.id);
    members.sort((a, b) => a.poolOrder - b.poolOrder);
    // With no assigned account and no other (switched-on) account in the pool there is nothing to route.
    const configured =
      (assigned !== null && !assigned.system) || members.some((account) => !account.system && account.enabled);
    return { primary, order: [primary, ...members], configured };
  }

  /**
   * W5-BE8 (F03): with `returnAfterReset` off, the agent stays on the account its last turn ran on while that account can
   * answer and the person changed nothing (the same first account as then). The first account being free again is not
   * a reason to move. null = no such account (the normal order decides).
   */
  #stay(
    botId: string,
    snapshot: AccountsSnapshot,
    plan: AccountPlan,
    exclude: ReadonlySet<string>,
  ): ProviderAccount | null {
    if (snapshot.pool.returnAfterReset !== false) return null;
    const last = this.#lastAccount.get(botId);
    if (!last || last.primaryId !== plan.primary.id || last.accountId === plan.primary.id) return null;
    const account = plan.order.find((item) => item.id === last.accountId);
    return account && this.#usable(account, exclude) ? account : null;
  }

  /** The account for the agent's next turn (never opens a process). */
  route(botId: string, provider: ProviderAccountProvider, exclude: ReadonlySet<string> = new Set()): AccountRoute {
    const snapshot = this.#deps.pool.snapshot();
    const plan = this.#order(botId, provider, snapshot);
    if (!plan?.configured) return { kind: "off" };
    const chosen =
      this.#stay(botId, snapshot, plan, exclude) ?? plan.order.find((account) => this.#usable(account, exclude));
    if (chosen) return { kind: "use", account: chosen };
    const considered = plan.order.filter((account) => account.enabled && !exclude.has(account.id));
    const limited = considered.filter((account) => this.#limited(account));
    // Only a pool that is out of use because of limits alone counts as limited; a signed-out account is another problem.
    const onlyLimits = limited.length > 0 && limited.length === considered.length;
    return {
      kind: "exhausted",
      account: plan.primary,
      resetsAtSeconds: onlyLimits
        ? Math.min(...limited.map((account) => Math.ceil(Date.parse(account.limitedUntil ?? "") / 1000)))
        : null,
    };
  }

  /** When every account of the agent's pool is at its limit: the Unix second the first one is free again. */
  exhaustedUntil(botId: string, provider: ProviderAccountProvider): number | null {
    const route = this.route(botId, provider);
    return route.kind === "exhausted" ? route.resetsAtSeconds : null;
  }

  /** Picks the account for the agent's next turn and opens its CLI process when it is not the system account. */
  async acquire(botId: string, provider: ProviderAccountProvider): Promise<AccountLane<TClient>> {
    const tried = new Set<string>();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const route = this.route(botId, provider, tried);
      if (route.kind === "off") return { accountId: systemId(provider), tracked: false, client: null };
      // Accounts of the pool failed to start and none is left: the old path (the provider's normal client) takes the turn.
      if (route.kind === "exhausted" && tried.size > 0) break;
      const account = route.account;
      if (account.system) return { accountId: account.id, tracked: true, client: null };
      try {
        return { accountId: account.id, tracked: true, client: await this.#client(account) };
      } catch {
        // The account is gone, signed out or its CLI would not start: the next account of the pool takes the turn.
        tried.add(account.id);
      }
    }
    return { accountId: systemId(provider), tracked: false, client: null };
  }

  async #client(account: ProviderAccount): Promise<TClient> {
    const existing = this.#clients.get(account.id);
    if (existing) {
      existing.lastUsed = this.#now();
      return existing.client;
    }
    const pending = this.#opening.get(account.id);
    if (pending) return pending;
    const opening = this.#deps
      .openClient(account.provider, this.#deps.pool.environment(account.id), account.id)
      .then((client) => {
        this.#clients.set(account.id, { client, lastUsed: this.#now() });
        return client;
      })
      .finally(() => this.#opening.delete(account.id));
    this.#opening.set(account.id, opening);
    return opening;
  }

  /** The agent's turn starts on this account: remember it, say so when it changed and tell the window. */
  begin(botId: string, provider: ProviderAccountProvider, turnId: string, accountId: string): void {
    this.#turns.set(turnId, { accountId, botId });
    const snapshot = this.#deps.pool.snapshot();
    const primaryId = this.#order(botId, provider, snapshot)?.primary.id ?? null;
    const previous = this.#lastAccount.get(botId);
    this.#lastAccount.set(botId, { accountId, primaryId });
    if (previous && previous.accountId !== accountId) {
      const label = (id: string) => snapshot.accounts.find((account) => account.id === id)?.label ?? id;
      const before = snapshot.accounts.find((account) => account.id === previous.accountId);
      // A change the person made (another assigned account) says nothing here: only limits and the way back do.
      const reason =
        before && this.#limited(before)
          ? "usage-limit"
          : primaryId === accountId && previous.primaryId === primaryId
            ? "returned"
            : null;
      if (reason)
        this.#deps.emit({
          type: "account-switched",
          botId,
          provider,
          fromAccountId: previous.accountId,
          fromLabel: label(previous.accountId),
          toAccountId: accountId,
          toLabel: label(accountId),
          reason,
        });
    }
    this.#deps.pool.setActive(botId, accountId);
  }

  /**
   * W5-BE8 (F02): the turn failed on the network, not on a limit. Says so with a fixed text and changes nothing else: the
   * account is not marked, the agent is not moved, the pool is not touched. Nothing for a turn the router does not know.
   */
  noteNetworkError(input: { botId: string; provider: ProviderAccountProvider; turnId: string }): void {
    const used = this.#turns.get(input.turnId);
    const account = used && this.#deps.pool.snapshot().accounts.find((item) => item.id === used.accountId);
    if (!account) return;
    this.#deps.emit({
      type: "account-error",
      botId: input.botId,
      provider: input.provider,
      accountId: account.id,
      accountLabel: account.label,
      reason: "network-error",
      message: `Network error on ${account.label}. The account was not counted as at its limit; nothing was switched.`,
    });
  }

  /** A turn started something besides talking (a command, a file change, a tool call): it is no longer free to repeat. */
  noteItem(turnId: string, itemType: string): void {
    if (!QUIET_ITEMS.has(itemType)) this.#actions.add(turnId);
  }

  turnChangedSomething(turnId: string): boolean {
    return this.#actions.has(turnId);
  }

  /** The turn has ended (any way). */
  end(turnId: string): void {
    const turn = this.#turns.get(turnId);
    this.#turns.delete(turnId);
    this.#actions.delete(turnId);
    const entry = turn ? this.#clients.get(turn.accountId) : undefined;
    if (entry) entry.lastUsed = this.#now();
  }

  accountOfTurn(turnId: string): string | null {
    return this.#turns.get(turnId)?.accountId ?? null;
  }

  /**
   * The open CLI process of the account that owns this provider session (a thread lives in that account's state
   * folder, so every request about it must go to that process). null for the system account (the provider's normal
   * client) and when no process of that account is open.
   */
  clientForSession(sessionId: string, provider: ProviderAccountProvider): TClient | null {
    return this.#clients.get(this.sessionAccount(sessionId, provider))?.client ?? null;
  }

  /**
   * A turn failed on a usage limit. Marks the account limited and says what happens next. "switch": nothing had been
   * changed, the caller puts the message back in the queue (the next turn starts from the first usable account).
   * "ask": the turn had changed something: the caller asks the person. "exhausted": no other account is free.
   */
  async onLimit(input: {
    botId: string;
    provider: ProviderAccountProvider;
    turnId: string;
    /** Unix seconds from the provider; null when it gave none. */
    resetsAtSeconds: number | null;
  }): Promise<LimitDecision> {
    const used = this.#turns.get(input.turnId);
    if (!used) return { action: "none" };
    const from = this.#deps.pool.snapshot().accounts.find((account) => account.id === used.accountId);
    if (!from) return { action: "none" };
    const provided = input.resetsAtSeconds !== null && input.resetsAtSeconds * 1000 > this.#now();
    const until = new Date(provided ? (input.resetsAtSeconds ?? 0) * 1000 : this.#now() + ASSUMED_LIMIT_MS);
    const later = from.limitedUntil !== null && Date.parse(from.limitedUntil) > until.getTime();
    const marked = later ? new Date(Date.parse(from.limitedUntil ?? "")) : until;
    await this.#deps.pool
      .limitUntil(from.id, marked)
      .then(() => this.#scheduleExpiry(from.id, marked))
      // The account was removed while its turn ran: nothing to mark, the pool simply goes on without it.
      .catch(() => undefined);
    const next = this.route(input.botId, input.provider);
    const afterAction = this.#actions.has(input.turnId);
    const to = next.kind === "use" && next.account.id !== from.id ? next.account : null;
    this.#deps.emit({
      type: "account-limit-reached",
      botId: input.botId,
      provider: input.provider,
      accountId: from.id,
      accountLabel: from.label,
      resetsAt: marked.toISOString(),
      resetsAtAssumed: !provided && !later,
      outcome: to ? (afterAction ? "asks" : "switched") : "exhausted",
      nextAccountId: to?.id ?? null,
      nextAccountLabel: to?.label ?? null,
      afterAction,
    });
    if (!to) return { action: "exhausted", from };
    return afterAction ? { action: "ask", from, to } : { action: "switch", from, to };
  }

  // --- sessions: a provider thread belongs to the account whose state folder it lives in ---

  /** The account that created this session; the system account when nothing was remembered (all older sessions). */
  sessionAccount(sessionId: string, provider: ProviderAccountProvider): string {
    return this.#sessions.get(sessionId) ?? this.#deps.sessions?.get(sessionId) ?? systemId(provider);
  }

  bindSession(sessionId: string, accountId: string): void {
    this.#sessions.set(sessionId, accountId);
    this.#deps.sessions?.set(sessionId, accountId);
  }

  // --- limits that end, CLI processes that are not needed ---

  #scheduleExpiry(accountId: string, until: Date): void {
    if (this.#deps.timers === false) return;
    clearTimeout(this.#expiry.get(accountId));
    const timer = setTimeout(
      () => void this.reconcile(),
      Math.min(Math.max(until.getTime() - this.#now(), 0) + 500, 2 ** 31 - 1),
    );
    timer.unref();
    this.#expiry.set(accountId, timer);
  }

  /** Clears the limit of every account whose time has passed, so the window shows it free again. */
  async reconcile(): Promise<void> {
    for (const account of this.#deps.pool.snapshot().accounts) {
      if (account.limitedUntil === null || this.#limited(account)) continue;
      await this.#deps.pool.limitUntil(account.id, null).catch(() => undefined);
    }
  }

  /** Stops the CLI process of an account that is gone or idle (no turn on it) so it does not hold memory. */
  async sweepIdle(): Promise<void> {
    const alive = new Set(this.#deps.pool.snapshot().accounts.map((account) => account.id));
    const busy = new Set([...this.#turns.values()].map((turn) => turn.accountId));
    const idleMs = this.#deps.idleMs ?? IDLE_CLIENT_MS;
    for (const [accountId, entry] of [...this.#clients]) {
      if (busy.has(accountId)) continue;
      if (alive.has(accountId) && this.#now() - entry.lastUsed < idleMs) continue;
      this.#clients.delete(accountId);
      await entry.client.stop().catch(() => undefined);
    }
  }

  /** The CLI process ended on its own: forget it, the next turn opens a new one. */
  clientExited(client: TClient): void {
    for (const [accountId, entry] of this.#clients) if (entry.client === client) this.#clients.delete(accountId);
  }

  openClients(): string[] {
    return [...this.#clients.keys()];
  }

  async stopAll(): Promise<void> {
    if (this.#sweeper) clearInterval(this.#sweeper);
    for (const timer of this.#expiry.values()) clearTimeout(timer);
    this.#expiry.clear();
    const entries = [...this.#clients.values()];
    this.#clients.clear();
    await Promise.all(entries.map((entry) => entry.client.stop().catch(() => undefined)));
  }
}

/** Remembers which account created each provider session (table created here, like the other W3 tables). */
export function sqlSessionAccounts(connection: () => DatabaseSync): SessionAccounts {
  let ready: DatabaseSync | null = null;
  const db = (): DatabaseSync => {
    const current = connection();
    if (ready !== current) {
      current.exec(`
        CREATE TABLE IF NOT EXISTS projection_session_accounts (
          external_session_id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL
        );
      `);
      ready = current;
    }
    return current;
  };
  return {
    get: (sessionId) => {
      const row = db()
        .prepare("SELECT account_id FROM projection_session_accounts WHERE external_session_id = ?")
        .get(sessionId);
      return row && isString(row.account_id) ? row.account_id : null;
    },
    set: (sessionId, accountId) => {
      db()
        .prepare(
          `INSERT INTO projection_session_accounts (external_session_id, account_id) VALUES (?, ?)
           ON CONFLICT(external_session_id) DO UPDATE SET account_id = excluded.account_id`,
        )
        .run(sessionId, accountId);
    },
  };
}
