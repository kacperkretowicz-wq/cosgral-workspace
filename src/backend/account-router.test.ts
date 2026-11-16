// @vitest-environment node
// COSGRAL W5-K1: the account pool in front of the CLI clients, tested with a fake pool and fake CLI processes.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AccountsSnapshot, ProviderAccount, ProviderAccountProvider } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AccountEvent,
  type AccountPoolPort,
  AccountRouter,
  type RoutedClient,
  sqlSessionAccounts,
} from "./account-router";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const MINUTE = 60_000;
const START = Date.parse("2026-11-16T12:00:00.000Z");

class FakeClient implements RoutedClient {
  stopped = false;
  constructor(readonly accountId: string) {}
  async stop(): Promise<void> {
    this.stopped = true;
  }
}

function account(
  id: string,
  provider: ProviderAccountProvider,
  fields: Partial<ProviderAccount> = {},
): ProviderAccount {
  const system = id.startsWith("system-");
  return {
    id,
    provider,
    label: system ? `${provider} (this computer)` : id,
    stateDir: system ? "System" : id,
    system,
    loggedIn: true,
    account: null,
    plan: null,
    isDefault: system,
    inPool: true,
    poolOrder: 1,
    enabled: true,
    limitedUntil: null,
    login: { phase: "idle", message: null, url: null, userCode: null },
    checkedAt: "2026-11-16T11:00:00.000Z",
    ...fields,
  };
}

/** A pool with a system account and two more accounts per provider, in the order sys, a, b. */
function standardAccounts(): ProviderAccount[] {
  return [
    account("system-codex", "codex", { poolOrder: 1 }),
    account("acc-aaaaaaaa", "codex", { poolOrder: 2, label: "Work" }),
    account("acc-bbbbbbbb", "codex", { poolOrder: 3, label: "Home" }),
    account("system-claude", "claude", { poolOrder: 1 }),
    account("acc-cccccccc", "claude", { poolOrder: 2, label: "Claude B" }),
  ];
}

class FakePool implements AccountPoolPort {
  accounts: ProviderAccount[];
  assignments: Array<{ botId: string; accountId: string | null }> = [];
  active = new Map<string, string>();
  limitCalls: Array<{ id: string; until: string | null }> = [];
  constructor(accounts = standardAccounts()) {
    this.accounts = accounts;
  }
  snapshot(): AccountsSnapshot {
    return structuredClone({
      accounts: this.accounts,
      pool: { maxAccountsPerProvider: 3, switchBeforeFirstAction: true },
      assignments: this.assignments,
    });
  }
  environment(id: string): NodeJS.ProcessEnv {
    return { CODEX_HOME: `state/${id}` };
  }
  async limitUntil(id: string, until: Date | null): Promise<ProviderAccount> {
    const found = this.accounts.find((item) => item.id === id);
    if (!found) throw new Error("Unknown account.");
    found.limitedUntil = until ? until.toISOString() : null;
    this.limitCalls.push({ id, until: found.limitedUntil });
    return found;
  }
  setActive(botId: string, accountId: string | null): void {
    if (accountId) this.active.set(botId, accountId);
    else this.active.delete(botId);
  }
  set(id: string, fields: Partial<ProviderAccount>): void {
    Object.assign(this.accounts.find((item) => item.id === id) ?? {}, fields);
  }
  remove(id: string): void {
    this.accounts = this.accounts.filter((item) => item.id !== id);
    this.assignments = this.assignments.filter((item) => item.accountId !== id);
  }
}

function setup(accounts?: ProviderAccount[]) {
  const pool = new FakePool(accounts);
  const events: AccountEvent[] = [];
  const clock = { now: START };
  const opened: FakeClient[] = [];
  const failing = new Set<string>();
  const router = new AccountRouter<FakeClient>({
    pool,
    openClient: async (_provider, _env, accountId) => {
      if (failing.has(accountId)) throw new Error("This account's CLI would not start.");
      const client = new FakeClient(accountId);
      opened.push(client);
      return client;
    },
    emit: (event) => events.push(event),
    now: () => clock.now,
    idleMs: 5 * MINUTE,
    timers: false,
  });
  return { pool, events, clock, opened, failing, router };
}

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("choosing the account of a turn", () => {
  it("stays out of the way when only the system account exists (nothing configured)", async () => {
    const { router } = setup([account("system-codex", "codex"), account("system-claude", "claude")]);
    expect(router.route("chief", "codex")).toEqual({ kind: "off" });
    await expect(router.acquire("chief", "codex")).resolves.toEqual({
      accountId: "system-codex",
      tracked: false,
      client: null,
    });
  });

  it("stays out of the way when the other accounts are switched off, so the old path is the only path", () => {
    const { pool, router } = setup();
    pool.set("acc-aaaaaaaa", { enabled: false });
    pool.set("acc-bbbbbbbb", { inPool: false });
    expect(router.route("chief", "codex")).toEqual({ kind: "off" });
  });

  it("uses the default (system) account first and tracks it once a pool exists", async () => {
    const { router, opened } = setup();
    const route = router.route("chief", "codex");
    expect(route).toMatchObject({ kind: "use", account: { id: "system-codex" } });
    await expect(router.acquire("chief", "codex")).resolves.toEqual({
      accountId: "system-codex",
      tracked: true,
      client: null,
    });
    expect(opened).toHaveLength(0); // the system account runs on the program's normal client
  });

  it("uses the account assigned to the agent, and the default one for an agent without a choice", async () => {
    const { pool, router, opened } = setup();
    pool.assignments = [{ botId: "chief", accountId: "acc-bbbbbbbb" }];
    const lane = await router.acquire("chief", "codex");
    expect(lane).toMatchObject({ accountId: "acc-bbbbbbbb", tracked: true });
    expect(lane.client?.accountId).toBe("acc-bbbbbbbb");
    expect(opened.map((client) => client.accountId)).toEqual(["acc-bbbbbbbb"]);
    expect(router.route("writer", "codex")).toMatchObject({ kind: "use", account: { id: "system-codex" } });
  });

  it("follows the pool order (poolOrder) after the agent's own account and skips switched-off accounts", () => {
    const { pool, router } = setup();
    pool.set("system-codex", { limitedUntil: new Date(START + 10 * MINUTE).toISOString() });
    pool.set("acc-aaaaaaaa", { poolOrder: 3 });
    pool.set("acc-bbbbbbbb", { poolOrder: 2 });
    expect(router.route("chief", "codex")).toMatchObject({ account: { id: "acc-bbbbbbbb" } });
    pool.set("acc-bbbbbbbb", { enabled: false });
    expect(router.route("chief", "codex")).toMatchObject({ account: { id: "acc-aaaaaaaa" } });
  });

  it("never picks an account that is signed out, but trusts the system account until its state was read", () => {
    const { pool, router } = setup();
    pool.set("system-codex", { loggedIn: false, checkedAt: null });
    expect(router.route("chief", "codex")).toMatchObject({ account: { id: "system-codex" } });
    pool.set("system-codex", { loggedIn: false, checkedAt: "2026-11-16T11:00:00.000Z" });
    pool.set("acc-aaaaaaaa", { loggedIn: false, checkedAt: null });
    expect(router.route("chief", "codex")).toMatchObject({ account: { id: "acc-bbbbbbbb" } });
  });

  it("skips accounts that are not in the pool, unless the agent is assigned to one", () => {
    const { pool, router } = setup();
    pool.set("system-codex", { enabled: false });
    pool.set("acc-aaaaaaaa", { inPool: false });
    expect(router.route("chief", "codex")).toMatchObject({ account: { id: "acc-bbbbbbbb" } });
    pool.assignments = [{ botId: "chief", accountId: "acc-aaaaaaaa" }];
    expect(router.route("chief", "codex")).toMatchObject({ account: { id: "acc-aaaaaaaa" } });
  });

  it("ignores an assignment to an account of another provider", () => {
    const { pool, router } = setup();
    pool.assignments = [{ botId: "chief", accountId: "acc-cccccccc" }]; // a Claude account, asked for Codex
    expect(router.route("chief", "codex")).toMatchObject({ account: { id: "system-codex" } });
    expect(router.route("chief", "claude")).toMatchObject({ account: { id: "acc-cccccccc" } });
  });

  it("falls to the next account when the chosen account's CLI would not start, and to the old path when none starts", async () => {
    const { pool, router, failing } = setup();
    pool.set("system-codex", { enabled: false });
    failing.add("acc-aaaaaaaa");
    await expect(router.acquire("chief", "codex")).resolves.toMatchObject({ accountId: "acc-bbbbbbbb", tracked: true });
    failing.add("acc-bbbbbbbb");
    const { router: second } = (() => {
      const next = setup();
      next.pool.set("system-codex", { enabled: false });
      next.failing.add("acc-aaaaaaaa");
      next.failing.add("acc-bbbbbbbb");
      return next;
    })();
    await expect(second.acquire("chief", "codex")).resolves.toEqual({
      accountId: "system-codex",
      tracked: false,
      client: null,
    });
  });
});

describe("a usage limit", () => {
  async function turn(
    router: AccountRouter<FakeClient>,
    botId: string,
    turnId: string,
    provider: ProviderAccountProvider = "codex",
  ) {
    const lane = await router.acquire(botId, provider);
    router.begin(botId, provider, turnId, lane.accountId);
    return lane;
  }

  it("marks the account limited until the time the provider gave and moves a quiet turn to the next account", async () => {
    const { pool, router, events, clock } = setup();
    await turn(router, "chief", "turn-1");
    const resetsAt = (clock.now + 30 * MINUTE) / 1000;
    const decision = await router.onLimit({
      botId: "chief",
      provider: "codex",
      turnId: "turn-1",
      resetsAtSeconds: resetsAt,
    });
    expect(decision).toMatchObject({ action: "switch", from: { id: "system-codex" }, to: { id: "acc-aaaaaaaa" } });
    expect(pool.limitCalls).toEqual([{ id: "system-codex", until: new Date(clock.now + 30 * MINUTE).toISOString() }]);
    expect(events).toContainEqual({
      type: "account-limit-reached",
      botId: "chief",
      provider: "codex",
      accountId: "system-codex",
      accountLabel: "codex (this computer)",
      resetsAt: new Date(clock.now + 30 * MINUTE).toISOString(),
      resetsAtAssumed: false,
      outcome: "switched",
      nextAccountId: "acc-aaaaaaaa",
      nextAccountLabel: "Work",
      afterAction: false,
    });
    expect(router.route("chief", "codex")).toMatchObject({ account: { id: "acc-aaaaaaaa" } });
  });

  it("assumes one hour and says so when the provider gave no time or one that has passed", async () => {
    const { router, events, clock } = setup();
    await turn(router, "chief", "turn-1");
    await router.onLimit({ botId: "chief", provider: "codex", turnId: "turn-1", resetsAtSeconds: null });
    expect(events.at(-1)).toMatchObject({
      type: "account-limit-reached",
      resetsAt: new Date(clock.now + 60 * MINUTE).toISOString(),
      resetsAtAssumed: true,
    });
    await turn(router, "writer", "turn-2");
    await router.onLimit({
      botId: "writer",
      provider: "codex",
      turnId: "turn-2",
      resetsAtSeconds: clock.now / 1000 - 5,
    });
    // The second agent runs on the next account (the first is limited), which had no limit yet: a time that has already
    // passed says nothing, so one hour is assumed and said so.
    expect(events.at(-1)).toMatchObject({ accountId: "acc-aaaaaaaa", resetsAtAssumed: true });
  });

  it("keeps the later of two limit times for the same account", async () => {
    const { pool, router, clock } = setup();
    await turn(router, "chief", "turn-1");
    await router.onLimit({
      botId: "chief",
      provider: "codex",
      turnId: "turn-1",
      resetsAtSeconds: (clock.now + 50 * MINUTE) / 1000,
    });
    await turn(router, "writer", "turn-2");
    pool.set("system-codex", { limitedUntil: new Date(clock.now + 50 * MINUTE).toISOString() });
    await router.onLimit({
      botId: "writer",
      provider: "codex",
      turnId: "turn-2",
      resetsAtSeconds: (clock.now + 10 * MINUTE) / 1000,
    });
    expect(pool.accounts[0]?.limitedUntil).toBe(new Date(clock.now + 50 * MINUTE).toISOString());
  });

  it("does not move a turn on its own once it had changed something: it asks (R7)", async () => {
    const { router, events } = setup();
    await turn(router, "chief", "turn-1");
    router.noteItem("turn-1", "agentMessage");
    router.noteItem("turn-1", "reasoning");
    expect(router.turnChangedSomething("turn-1")).toBe(false);
    router.noteItem("turn-1", "commandExecution");
    expect(router.turnChangedSomething("turn-1")).toBe(true);
    const decision = await router.onLimit({
      botId: "chief",
      provider: "codex",
      turnId: "turn-1",
      resetsAtSeconds: null,
    });
    expect(decision).toMatchObject({ action: "ask", from: { id: "system-codex" }, to: { id: "acc-aaaaaaaa" } });
    expect(events.at(-1)).toMatchObject({ type: "account-limit-reached", outcome: "asks", afterAction: true });
  });

  it("counts tool calls, file changes and unknown item types as changes", async () => {
    const { router } = setup();
    for (const type of ["fileChange", "mcpToolCall", "dynamicToolCall", "webSearch", "somethingNew"]) {
      await turn(router, "chief", `turn-${type}`);
      router.noteItem(`turn-${type}`, type);
      expect(router.turnChangedSomething(`turn-${type}`)).toBe(true);
    }
  });

  it("says the pool is exhausted when every account is at its limit, and tells when the first one is free", async () => {
    const { pool, router, events, clock } = setup();
    const soon = new Date(clock.now + 20 * MINUTE).toISOString();
    pool.set("acc-aaaaaaaa", { limitedUntil: new Date(clock.now + 40 * MINUTE).toISOString() });
    pool.set("acc-bbbbbbbb", { limitedUntil: soon });
    await turn(router, "chief", "turn-1");
    const decision = await router.onLimit({
      botId: "chief",
      provider: "codex",
      turnId: "turn-1",
      resetsAtSeconds: (clock.now + 90 * MINUTE) / 1000,
    });
    expect(decision).toMatchObject({ action: "exhausted", from: { id: "system-codex" } });
    expect(events.at(-1)).toMatchObject({ outcome: "exhausted", nextAccountId: null, nextAccountLabel: null });
    const route = router.route("chief", "codex");
    expect(route).toMatchObject({ kind: "exhausted", account: { id: "system-codex" } });
    expect(route.kind === "exhausted" ? route.resetsAtSeconds : null).toBe(Date.parse(soon) / 1000);
    expect(router.exhaustedUntil("chief", "codex")).toBe(Date.parse(soon) / 1000);
  });

  it("does not call a signed-out account a limit: exhausted without a reset time", () => {
    const { pool, router, clock } = setup();
    pool.set("system-codex", { limitedUntil: new Date(clock.now + MINUTE).toISOString() });
    pool.set("acc-aaaaaaaa", { loggedIn: false });
    pool.set("acc-bbbbbbbb", { limitedUntil: new Date(clock.now + 5 * MINUTE).toISOString() });
    const route = router.route("chief", "codex");
    expect(route).toMatchObject({ kind: "exhausted" });
    expect(router.exhaustedUntil("chief", "codex")).toBeNull();
  });

  it("goes back to the first account when its limit has passed, and clears the mark", async () => {
    const { pool, router, events, clock } = setup();
    await turn(router, "chief", "turn-1");
    await router.onLimit({
      botId: "chief",
      provider: "codex",
      turnId: "turn-1",
      resetsAtSeconds: (clock.now + 30 * MINUTE) / 1000,
    });
    router.end("turn-1");
    await turn(router, "chief", "turn-2"); // on the Work account now
    expect(events.at(-1)).toMatchObject({
      type: "account-switched",
      reason: "usage-limit",
      fromAccountId: "system-codex",
      toAccountId: "acc-aaaaaaaa",
    });
    router.end("turn-2");

    clock.now += 31 * MINUTE;
    expect(router.route("chief", "codex")).toMatchObject({ account: { id: "system-codex" } });
    await router.reconcile();
    expect(pool.accounts[0]?.limitedUntil).toBeNull();
    await turn(router, "chief", "turn-3");
    expect(events.at(-1)).toMatchObject({
      type: "account-switched",
      reason: "returned",
      fromAccountId: "acc-aaaaaaaa",
      toAccountId: "system-codex",
    });
    expect(pool.active.get("chief")).toBe("system-codex");
  });

  it("is not a limit for a turn the router does not know (no pool): nothing is marked", async () => {
    const { pool, router, events } = setup([account("system-codex", "codex")]);
    const lane = await router.acquire("chief", "codex");
    expect(lane.tracked).toBe(false);
    await expect(
      router.onLimit({ botId: "chief", provider: "codex", turnId: "turn-x", resetsAtSeconds: null }),
    ).resolves.toEqual({ action: "none" });
    expect(pool.limitCalls).toEqual([]);
    expect(events).toEqual([]);
  });

  it("survives the account being removed while its turn runs", async () => {
    const { pool, router, events } = setup();
    pool.assignments = [{ botId: "chief", accountId: "acc-aaaaaaaa" }];
    await turn(router, "chief", "turn-1");
    pool.remove("acc-aaaaaaaa");
    const decision = await router.onLimit({
      botId: "chief",
      provider: "codex",
      turnId: "turn-1",
      resetsAtSeconds: null,
    });
    // The removed account cannot be found any more, so nothing is marked and the agent simply uses the pool again.
    expect(decision).toEqual({ action: "none" });
    expect(events).toEqual([]);
    expect(router.route("chief", "codex")).toMatchObject({ account: { id: "system-codex" } });
  });

  it("marks nothing for an account that disappears between the start of the limit and the mark, and still decides", async () => {
    const { pool, router } = setup();
    // The agent was given the Work account; it is deleted while its turn hits the limit (a system account cannot be).
    pool.assignments = [{ botId: "chief", accountId: "acc-aaaaaaaa" }];
    await turn(router, "chief", "turn-1");
    const original = pool.limitUntil.bind(pool);
    pool.limitUntil = async (id, until) => {
      pool.remove("acc-aaaaaaaa");
      return original(id, until);
    };
    const decision = await router.onLimit({
      botId: "chief",
      provider: "codex",
      turnId: "turn-1",
      resetsAtSeconds: null,
    });
    // The assignment went with the account: the default (system) account takes over.
    expect(decision).toMatchObject({ action: "switch", to: { id: "system-codex" } });
  });

  it("two agents on the same account share one CLI process, and a limit seen by one is known to the other at once", async () => {
    const { pool, router, opened } = setup();
    pool.assignments = [
      { botId: "chief", accountId: "acc-aaaaaaaa" },
      { botId: "writer", accountId: "acc-aaaaaaaa" },
    ];
    const [first, second] = await Promise.all([router.acquire("chief", "codex"), router.acquire("writer", "codex")]);
    expect(opened).toHaveLength(1);
    expect(first.client).toBe(second.client);
    router.begin("chief", "codex", "turn-1", first.accountId);
    router.begin("writer", "codex", "turn-2", second.accountId);

    const decision = await router.onLimit({
      botId: "chief",
      provider: "codex",
      turnId: "turn-1",
      resetsAtSeconds: null,
    });
    expect(decision).toMatchObject({ action: "switch", to: { id: "system-codex" } });
    // The writer's running turn fails on the same limit: the answer is the same, and nothing is marked twice with a worse time.
    const again = await router.onLimit({ botId: "writer", provider: "codex", turnId: "turn-2", resetsAtSeconds: null });
    expect(again).toMatchObject({ action: "switch", from: { id: "acc-aaaaaaaa" }, to: { id: "system-codex" } });
    expect(router.route("writer", "codex")).toMatchObject({ account: { id: "system-codex" } });
  });

  it("keeps the providers apart: a Claude limit does not touch Codex accounts", async () => {
    const { pool, router } = setup();
    await turn(router, "chief", "turn-c", "claude");
    await router.onLimit({ botId: "chief", provider: "claude", turnId: "turn-c", resetsAtSeconds: null });
    expect(pool.accounts.filter((item) => item.provider === "codex").every((item) => item.limitedUntil === null)).toBe(
      true,
    );
    expect(pool.accounts.find((item) => item.id === "system-claude")?.limitedUntil).not.toBeNull();
  });
});

describe("what a limit on an account must not do to the model fallback", () => {
  it("reports no pool limit while another account is free: the model is not blocked", async () => {
    const { pool, router, clock } = setup();
    pool.set("system-codex", { limitedUntil: new Date(clock.now + 30 * MINUTE).toISOString() });
    expect(router.exhaustedUntil("chief", "codex")).toBeNull();
    expect(router.route("chief", "codex")).toMatchObject({ kind: "use", account: { id: "acc-aaaaaaaa" } });
  });

  it("reports the reset time only when every account is at its limit (then the model fallbacks take over)", () => {
    const { pool, router, clock } = setup();
    for (const item of pool.accounts.filter((entry) => entry.provider === "codex")) {
      pool.set(item.id, { limitedUntil: new Date(clock.now + 15 * MINUTE).toISOString() });
    }
    expect(router.exhaustedUntil("chief", "codex")).toBe((clock.now + 15 * MINUTE) / 1000);
    expect(router.exhaustedUntil("chief", "claude")).toBeNull(); // Claude has its own pool
  });
});

describe("account switches the person sees", () => {
  async function turn(router: AccountRouter<FakeClient>, turnId: string) {
    const lane = await router.acquire("chief", "codex");
    router.begin("chief", "codex", turnId, lane.accountId);
    router.end(turnId);
  }

  it("says nothing on the first turn and nothing when the person assigns another account themselves", async () => {
    const { pool, router, events } = setup();
    await turn(router, "turn-1");
    expect(events).toEqual([]);
    pool.assignments = [{ botId: "chief", accountId: "acc-bbbbbbbb" }];
    await turn(router, "turn-2");
    expect(events).toEqual([]);
    expect(pool.active.get("chief")).toBe("acc-bbbbbbbb");
  });
});

describe("CLI processes of accounts", () => {
  it("stops a process that has been idle for a while and keeps one that has a turn on it", async () => {
    const { pool, router, opened, clock } = setup();
    pool.assignments = [
      { botId: "chief", accountId: "acc-aaaaaaaa" },
      { botId: "writer", accountId: "acc-bbbbbbbb" },
    ];
    const a = await router.acquire("chief", "codex");
    const b = await router.acquire("writer", "codex");
    router.begin("chief", "codex", "turn-1", a.accountId); // still running
    router.begin("writer", "codex", "turn-2", b.accountId);
    router.end("turn-2");
    clock.now += 6 * MINUTE;
    await router.sweepIdle();
    expect(opened.map((client) => client.stopped)).toEqual([false, true]);
    expect(router.openClients()).toEqual(["acc-aaaaaaaa"]);
    router.end("turn-1");
    clock.now += 6 * MINUTE;
    await router.sweepIdle();
    expect(router.openClients()).toEqual([]);
    // The next turn opens a new process.
    await router.acquire("writer", "codex");
    expect(opened).toHaveLength(3);
  });

  it("stops the process of an account that was removed, even before it is idle", async () => {
    const { pool, router, opened } = setup();
    pool.assignments = [{ botId: "chief", accountId: "acc-aaaaaaaa" }];
    await router.acquire("chief", "codex");
    pool.remove("acc-aaaaaaaa");
    await router.sweepIdle();
    expect(opened[0]?.stopped).toBe(true);
    expect(router.openClients()).toEqual([]);
  });

  it("forgets a process that ended by itself and opens a new one for the next turn", async () => {
    const { pool, router, opened } = setup();
    pool.assignments = [{ botId: "chief", accountId: "acc-aaaaaaaa" }];
    const lane = await router.acquire("chief", "codex");
    if (lane.client) router.clientExited(lane.client);
    expect(router.openClients()).toEqual([]);
    await router.acquire("chief", "codex");
    expect(opened).toHaveLength(2);
  });

  it("stops everything on exit", async () => {
    const { pool, router, opened } = setup();
    pool.assignments = [
      { botId: "chief", accountId: "acc-aaaaaaaa" },
      { botId: "writer", accountId: "acc-bbbbbbbb" },
    ];
    await router.acquire("chief", "codex");
    await router.acquire("writer", "codex");
    await router.stopAll();
    expect(opened.every((client) => client.stopped)).toBe(true);
    expect(router.openClients()).toEqual([]);
  });
});

describe("which account created a provider session", () => {
  it("is the system account for every session nobody remembered (all older sessions)", () => {
    const { router } = setup();
    expect(router.sessionAccount("thread-old", "codex")).toBe("system-codex");
    expect(router.sessionAccount("thread-old", "claude")).toBe("system-claude");
  });

  it("remembers the account of a session, in memory and, when asked, in the database", async () => {
    const dir = await mkdtemp(join(tmpdir(), "account-sessions-"));
    roots.push(dir);
    const database = testDatabase(join(dir, "data"));
    await database.initialize();
    const sessions = sqlSessionAccounts(() => database.connection);
    expect(sessions.get("thread-1")).toBeNull();
    sessions.set("thread-1", "acc-aaaaaaaa");
    sessions.set("thread-1", "acc-bbbbbbbb");
    expect(sessions.get("thread-1")).toBe("acc-bbbbbbbb");

    const pool = new FakePool();
    const router = new AccountRouter<FakeClient>({
      pool,
      openClient: async () => new FakeClient("x"),
      emit: () => undefined,
      sessions,
      timers: false,
    });
    router.bindSession("thread-2", "acc-aaaaaaaa");
    expect(sessions.get("thread-2")).toBe("acc-aaaaaaaa");
    const restarted = new AccountRouter<FakeClient>({
      pool,
      openClient: async () => new FakeClient("x"),
      emit: () => undefined,
      sessions,
      timers: false,
    });
    expect(restarted.sessionAccount("thread-2", "codex")).toBe("acc-aaaaaaaa");
  });
});
