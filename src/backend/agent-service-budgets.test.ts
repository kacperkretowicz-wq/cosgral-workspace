// @vitest-environment node
// COSGRAL W8-BE2 (step 1): the budgets of W8-KK2 on the real AgentService (spec-w8.md 1E, W8-25…29; Q6, Q7). A fake Codex
// reports the tokens of its threads like the real one does; the meter counts them once per turn, and the gate keeps a new
// turn in the queue (with the reason) while the budget is used up. A running turn is never cut.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, BrowserControlState, BrowserTab, QueueSnapshot } from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentService } from "./agent-service";
import { BotStore } from "./bot-store";
import { BudgetMeter } from "./budget-meter";
import { MailboxStore } from "./mailbox-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { writeFakeCli } from "./testing/fake-cli";
import { ThreadCli } from "./testing/thread-cli";
import { suiteTimeout } from "./testing/timeouts";

let root: string;
const services: AgentService[] = [];
const originalCodexPath = process.env.OPENBOT_CODEX_PATH;
const originalClaudePath = process.env.OPENBOT_CLAUDE_PATH;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "openbot-budgets-"));
  process.env.OPENBOT_CODEX_PATH = await writeFakeCli(
    join(root, "Codex CLI"),
    "codex",
    `if (process.argv.includes("--version")) process.stdout.write("codex-cli 0.144.1\\n");`,
  );
  process.env.OPENBOT_CLAUDE_PATH = join(root, "missing-claude");
});

afterEach(async () => {
  for (const service of services.splice(0)) await service.stop();
  if (originalCodexPath === undefined) delete process.env.OPENBOT_CODEX_PATH;
  else process.env.OPENBOT_CODEX_PATH = originalCodexPath;
  if (originalClaudePath === undefined) delete process.env.OPENBOT_CLAUDE_PATH;
  else process.env.OPENBOT_CLAUDE_PATH = originalClaudePath;
  closeTestDatabases();
  await rm(root, { recursive: true, force: true });
});

async function open(options: { cli?: ThreadCli; clock?: { now: Date } } = {}) {
  const userData = join(root, "user-data");
  const store = new BotStore(userData, join(root, "home"), testDatabase(userData));
  const mailbox = new MailboxStore(userData, store.sharedRoot, testDatabase(userData));
  const cli = options.cli ?? new ThreadCli();
  const service = new AgentService(store, mailbox, fakeBrowser(), null, 30_000, "codex", () => cli);
  const events: AgentEvent[] = [];
  const clock = options.clock ?? { now: new Date("2026-11-16T12:00:00.000Z") };
  const meter = new BudgetMeter({
    database: store.database,
    emit: (event) => {
      events.push(event);
      if (event.type === "budgets-changed") service.budgetsChanged();
    },
    now: () => clock.now,
  });
  service.useBudgets(meter);
  services.push(service);
  service.on("event", (event) => events.push(event));
  await service.initialize();
  await store.getOrCreate("chief");
  return { service, store, cli, events, meter, clock };
}

const used = (meter: BudgetMeter) => meter.status({ kind: "agent", botId: "chief" }).usage;
const limit = (tokens: number) =>
  ({
    scope: { kind: "agent", botId: "chief" },
    period: "month",
    tokenLimit: tokens,
    costLimitUsd: null,
    hardStop: true,
  }) as const;

function queue(events: AgentEvent[]): QueueSnapshot | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === "queue-changed") return event.snapshot;
  }
  return undefined;
}

describe.sequential("budgets on the service", {
  timeout: suiteTimeout(30_000, 10_000),
}, () => {
  it("counts the tokens of a turn once: the growth of the thread's total, not the total again (Q6)", async () => {
    const { service, cli, meter } = await open();
    cli.usage.set("cli-thread-1", 1_000);
    await service.sendMessage({ botId: "chief", text: "First" });
    await waitFor(() => used(meter).turns === 1);
    expect(used(meter)).toMatchObject({ tokens: 1_000, turns: 1, costUsd: 0, pricedTurns: 0, costComplete: false });
    cli.usage.set("cli-thread-1", 2_500);
    await service.sendMessage({ botId: "chief", text: "Second" });
    await waitFor(() => used(meter).turns === 2);
    expect(used(meter)).toMatchObject({ tokens: 2_500, turns: 2 });
  });

  it("W12: keeps what a turn used by kind of token and by model, only the growth of each part, and nothing when the CLI reports no parts", async () => {
    const { service, cli, meter } = await open();
    cli.usage.set("cli-thread-1", 1_000);
    cli.usageParts.set("cli-thread-1", { input: 800, cached: 300, output: 200, reasoning: 40 });
    await service.sendMessage({ botId: "chief", text: "First" });
    await waitFor(() => used(meter).turns === 1);
    cli.usage.set("cli-thread-1", 2_500);
    cli.usageParts.set("cli-thread-1", { input: 1_900, cached: 900, output: 600, reasoning: 100 });
    await service.sendMessage({ botId: "chief", text: "Second" });
    await waitFor(() => used(meter).turns === 2);
    const rows = meter.dailyDetail("2026-11-01");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ botId: "chief", turns: 2, input: 1_900, cached: 900, output: 600, reasoning: 100 });
    expect(rows[0]?.model.length).toBeGreaterThan(0);
    expect(used(meter).tokens).toBe(2_500);
  });

  it("W12: a CLI that reports only the total leaves the detail empty but still counts the tokens", async () => {
    const { service, cli, meter } = await open();
    cli.usage.set("cli-thread-1", 700);
    await service.sendMessage({ botId: "chief", text: "Hello" });
    await waitFor(() => used(meter).turns === 1);
    expect(meter.dailyDetail("2026-11-01")).toEqual([]);
    expect(used(meter).tokens).toBe(700);
  });

  it("never invents dollars: Codex gives no price, so none is counted", async () => {
    const { service, cli, meter } = await open();
    cli.usage.set("cli-thread-1", 700);
    await service.sendMessage({ botId: "chief", text: "Hello" });
    await waitFor(() => used(meter).turns === 1);
    expect(used(meter).pricedTurns).toBe(0);
    expect(used(meter).costUsd).toBe(0);
  });

  it("keeps the next message in the queue, with the reason, once the budget is used up; the turn before it is not cut", async () => {
    const { service, cli, events, meter } = await open();
    meter.set(limit(1_000));
    cli.usage.set("cli-thread-1", 1_200);
    await service.sendMessage({ botId: "chief", text: "Uses it all" });
    await waitFor(() => used(meter).turns === 1);
    expect(cli.calls("turn/interrupt")).toHaveLength(0);
    await service.sendMessage({ botId: "chief", text: "Blocked" });
    await waitFor(() => queue(events)?.heldReason != null);
    expect(cli.calls("turn/start")).toHaveLength(1);
    const held = queue(events);
    expect(held?.heldReason).toMatch(/budget/i);
    expect(held?.deliveries.find((delivery) => delivery.text === "Blocked")?.status).toBe("queued");
    // Nothing starts on its own while the budget stays used up.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(cli.calls("turn/start")).toHaveLength(1);
  });

  it("starts the waiting message when the limit is raised, and the reason goes away", async () => {
    const { service, cli, events, meter } = await open();
    meter.set(limit(1_000));
    cli.usage.set("cli-thread-1", 1_200);
    await service.sendMessage({ botId: "chief", text: "Uses it all" });
    await waitFor(() => used(meter).turns === 1);
    await service.sendMessage({ botId: "chief", text: "Waits" });
    await waitFor(() => queue(events)?.heldReason != null);
    cli.usage.set("cli-thread-1", 1_500);
    meter.set(limit(10_000));
    await waitFor(() => cli.calls("turn/start").length === 2);
    await waitFor(() => used(meter).turns === 2);
    expect(queue(events)?.heldReason ?? null).toBeNull();
  });

  it("starts the waiting message when a new period begins, with no event at all (UTC midnight)", async () => {
    const clock = { now: new Date("2026-11-16T23:59:00.000Z") };
    const { service, cli, events, meter } = await open({ clock });
    meter.set({ ...limit(1_000), period: "day" });
    cli.usage.set("cli-thread-1", 1_200);
    await service.sendMessage({ botId: "chief", text: "Uses the day" });
    await waitFor(() => used(meter).turns === 1);
    await service.sendMessage({ botId: "chief", text: "Waits for tomorrow" });
    await waitFor(() => queue(events)?.heldReason != null);
    clock.now = new Date("2026-11-17T00:01:00.000Z");
    service.budgetsChanged();
    await waitFor(() => cli.calls("turn/start").length === 2);
  });

  it("a turn that is already running is not cut when the budget runs out in the middle of it", async () => {
    const { service, cli, meter } = await open();
    cli.hold = true;
    await service.sendMessage({ botId: "chief", text: "Long job" });
    await waitFor(() => cli.pending.length === 1);
    meter.set(limit(100));
    meter.record({ botId: "chief", tokens: 500, costUsd: null });
    expect(meter.gate("chief").allowed).toBe(false);
    expect(cli.calls("turn/interrupt")).toHaveLength(0);
    cli.usage.set("cli-thread-1", 400);
    cli.finish();
    await waitFor(() => used(meter).turns === 2);
    const conversation = await service.readConversation("chief");
    expect(conversation.messages.some((message) => message.text.startsWith("ANSWER_TO[Long job]"))).toBe(true);
  });

  it("the budget of an agent does not stop another agent (W8-25)", async () => {
    const { service, store, cli, meter } = await open();
    await store.getOrCreate("scout");
    meter.set(limit(10));
    meter.record({ botId: "chief", tokens: 50, costUsd: null });
    await service.sendMessage({ botId: "scout", text: "I am free" });
    await waitFor(() => cli.calls("turn/start").length === 1);
  });

  it("the budget of the space stops every agent, and says which budget stopped it", async () => {
    const { service, cli, events, meter } = await open();
    meter.set({ scope: { kind: "space" }, period: "month", tokenLimit: 10, costLimitUsd: null, hardStop: true });
    meter.record({ botId: "chief", tokens: 50, costUsd: null });
    await service.sendMessage({ botId: "chief", text: "Blocked by the space" });
    await waitFor(() => queue(events)?.heldReason != null);
    expect(cli.calls("turn/start")).toHaveLength(0);
  });

  it("a counter and a budget survive a restart, and the thread is not counted again after it", async () => {
    const first = await open();
    first.meter.set(limit(5_000));
    first.cli.usage.set("cli-thread-1", 1_000);
    await first.service.sendMessage({ botId: "chief", text: "Before restart" });
    await waitFor(() => used(first.meter).turns === 1);
    await first.service.stop();
    services.splice(services.indexOf(first.service), 1);

    const cli = new ThreadCli();
    const second = await open({ cli });
    expect(used(second.meter)).toMatchObject({ tokens: 1_000, turns: 1 });
    expect(second.meter.status({ kind: "agent", botId: "chief" }).budget?.tokenLimit).toBe(5_000);
    // The same CLI thread goes on (resumed) and reports a bigger total: only the growth counts.
    cli.usage.set("cli-thread-1", 1_800);
    await second.service.sendMessage({ botId: "chief", text: "After restart" });
    await waitFor(() => used(second.meter).turns === 2);
    expect(used(second.meter).tokens).toBe(1_800);
  });

  it("without a meter attached nothing is counted or held (the old behaviour)", async () => {
    const userData = join(root, "plain-data");
    const store = new BotStore(userData, join(root, "plain-home"), testDatabase(userData));
    const mailbox = new MailboxStore(userData, store.sharedRoot, testDatabase(userData));
    const cli = new ThreadCli();
    const service = new AgentService(store, mailbox, fakeBrowser(), null, 30_000, "codex", () => cli);
    services.push(service);
    await service.initialize();
    await store.getOrCreate("chief");
    cli.usage.set("cli-thread-1", 900);
    await service.sendMessage({ botId: "chief", text: "Hi" });
    await waitFor(() => cli.calls("turn/start").length === 1);
  });
});

function fakeBrowser() {
  return {
    onChanged: (_listener: (tabs: BrowserTab[], activeTabId: string | null) => void) => () => undefined,
    onControlChanged: (_listener: (state: BrowserControlState) => void) => () => undefined,
    clearControls: () => undefined,
    endControl: () => undefined,
    handleDynamicTool: async () => ({ success: true, contentItems: [] }),
  };
}

async function waitFor(check: () => boolean | undefined | Promise<boolean | undefined>): Promise<void> {
  const deadline = Date.now() + suiteTimeout(10_000, 4_000);
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the fake CLI.");
}
