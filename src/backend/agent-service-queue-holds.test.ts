// @vitest-environment node
// COSGRAL W12 (BE-N, from the work of KAPI): the queue says why it waits beyond budget: server-busy (concurrent turns) shows heldKind/heldReason
// to the window and goes away when the agent starts. The rules themselves are in ipc-queue-holds.ts (own test).

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgentEvent,
  type BrowserControlState,
  type BrowserTab,
  QUEUE_HOLD_REASONS,
  type QueueSnapshot,
} from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentService } from "./agent-service";
import { BotStore } from "./bot-store";
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
  root = await mkdtemp(join(tmpdir(), "openbot-queue-holds-"));
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

async function open() {
  const userData = join(root, "user-data");
  const store = new BotStore(userData, join(root, "home"), testDatabase(userData));
  const mailbox = new MailboxStore(userData, store.sharedRoot, testDatabase(userData));
  const cli = new ThreadCli();
  const service = new AgentService(store, mailbox, fakeBrowser(), null, 30_000, "codex", () => cli);
  const events: AgentEvent[] = [];
  service.useAgentPolicy({
    maxTurns: () => 1,
    instructions: () => "",
    quickAcknowledgement: () => false,
  });
  services.push(service);
  service.on("event", (event) => events.push(event));
  await service.initialize();
  await store.getOrCreate("chief");
  await store.getOrCreate("scout");
  return { service, cli, events };
}

function queueFor(events: AgentEvent[], botId: string): QueueSnapshot | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === "queue-changed" && event.snapshot.botId === botId) return event.snapshot;
  }
  return undefined;
}

describe.sequential("queue holds on the service", {
  timeout: suiteTimeout(30_000, 10_000),
}, () => {
  it("W12 BE-N: a second agent waits with server-busy while one turn already runs", async () => {
    const { service, cli, events } = await open();
    cli.hold = true;
    await service.sendMessage({ botId: "chief", text: "Long job" });
    await waitFor(() => cli.pending.length === 1);
    await service.sendMessage({ botId: "scout", text: "I wait" });
    await waitFor(() => queueFor(events, "scout")?.heldKind === "server-busy");
    const held = queueFor(events, "scout");
    expect(held?.heldReason).toBe(QUEUE_HOLD_REASONS["server-busy"]);
    expect(held?.deliveries.find((d) => d.text === "I wait")?.status).toBe("queued");
    expect(cli.calls("turn/start")).toHaveLength(1);
    cli.finish();
    await waitFor(() => cli.calls("turn/start").length === 2);
    await waitFor(() => (queueFor(events, "scout")?.heldKind ?? null) === null);
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
  const deadline = Date.now() + suiteTimeout(12_000, 5_000);
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the queue hold.");
}
