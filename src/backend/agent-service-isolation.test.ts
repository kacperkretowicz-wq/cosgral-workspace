// @vitest-environment node
// COSGRAL W8-BE2: isolation of agent processes on the real AgentService (spec-w8.md 1B, W8-09…11; Q2). A fake Codex asks for
// approvals like the real one; the check of the computer is a fake too (the real one is tested in isolation-service.test.ts).

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, BrowserControlState, BrowserTab, IsolationAvailability } from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord } from "@openbot/contracts/runtime-values";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccessStore } from "./access-store";
import { AgentService } from "./agent-service";
import { BotStore } from "./bot-store";
import { IsolationStore } from "./isolation-service";
import { MailboxStore } from "./mailbox-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { writeFakeCli } from "./testing/fake-cli";
import { ThreadCli } from "./testing/thread-cli";
import { suiteTimeout } from "./testing/timeouts";

const CAN: IsolationAvailability = {
  checkedAt: "2026-11-16T12:00:00.000Z",
  mechanism: "app-container-job",
  jobObject: { ok: true, reason: null },
  appContainer: { ok: true, reason: null },
  windows: "10.0.19045",
};
const CANNOT: IsolationAvailability = {
  checkedAt: "2026-11-16T12:00:00.000Z",
  mechanism: "none",
  jobObject: { ok: false, reason: "Windows only." },
  appContainer: { ok: false, reason: "Windows only." },
  windows: null,
};

let root: string;
const services: AgentService[] = [];
const originalCodexPath = process.env.OPENBOT_CODEX_PATH;
const originalClaudePath = process.env.OPENBOT_CLAUDE_PATH;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "openbot-isolation-"));
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

async function open(options: { availability?: IsolationAvailability; gate?: Promise<void> } = {}) {
  const userData = join(root, "user-data");
  const store = new BotStore(userData, join(root, "home"), testDatabase(userData));
  const mailbox = new MailboxStore(userData, store.sharedRoot, testDatabase(userData));
  const cli = new ThreadCli();
  const service = new AgentService(store, mailbox, fakeBrowser(), null, 30_000, "codex", () => cli);
  service.useAccess(new AccessStore({ filePath: join(userData, "agent-access.json") }));
  service.useIsolation(
    new IsolationStore({ filePath: join(userData, "agent-isolation.json") }),
    join(userData, "isolation"),
    async () => {
      await options.gate;
      return {
        availability: options.availability ?? CAN,
        host: options.availability === CANNOT ? null : "C:\\host\\cosgral-job-host.exe",
      };
    },
  );
  services.push(service);
  const events: AgentEvent[] = [];
  service.on("event", (event) => events.push(event));
  await service.initialize();
  await store.getOrCreate("chief");
  return { service, store, cli, events, bot: await store.getOrCreate("chief") };
}

async function heldTurn(service: AgentService, cli: ThreadCli) {
  cli.hold = true;
  await service.sendMessage({ botId: "chief", text: "Do the job" });
  await waitFor(() => cli.pending.length === 1);
  const turn = cli.pending[0];
  if (!turn) throw new Error("No held turn.");
  return { threadId: turn.threadId, turnId: turn.turnId };
}

function ask(cli: ThreadCli, turn: { threadId: string; turnId: string }, id: string, grantRoot: string) {
  cli.emit("request", { method: "item/fileChange/requestApproval", id, params: { ...turn, grantRoot } });
}

function answerOf(cli: ThreadCli, id: string): DynamicRecord | undefined {
  const result = cli.responses.find((response) => response.id === id)?.result;
  return isDynamicRecord(result) ? result : undefined;
}

describe.sequential("isolation on the service", {
  timeout: suiteTimeout(30_000, 10_000),
}, () => {
  it("says what is in force: a Codex agent shares one program, so it is not called isolated (W8-09)", async () => {
    const { service } = await open();
    await service.isolation?.initialize();
    expect(service.isolation?.get("chief")).toMatchObject({ state: "shared-process", mechanism: "none" });
    expect(service.isolation?.availability().jobObject.ok).toBe(true);
  });

  it("when the computer cannot isolate, the disk tools of an agent below Full are refused, with the reason and no card (Q2, W8-11)", async () => {
    const { service, cli, events, bot } = await open({ availability: CANNOT });
    await service.isolation?.initialize();
    const turn = await heldTurn(service, cli);
    ask(cli, turn, "fc-1", join(bot.workspacePath, "src"));
    await waitFor(() => answerOf(cli, "fc-1") !== undefined);
    expect(answerOf(cli, "fc-1")).toEqual({ decision: "decline" });
    expect(events.some((event) => event.type === "approval")).toBe(false);
    const denial = events.find((event) => event.type === "access-denied");
    expect(denial).toMatchObject({ reason: "isolation-unavailable", kind: "file-change" });
    expect(denial && "message" in denial ? denial.message : "").toContain("Windows only.");
  });

  it("at Full access the same request is not refused for that reason: the person chose it with a card", async () => {
    const { service, cli, events, bot } = await open({ availability: CANNOT });
    await service.isolation?.initialize();
    const result = await service.access?.setLevel({ botId: "chief", level: "full" });
    expect(result?.raiseRequested).toBe(true);
    await waitFor(() => service.listPendingRequests().some((request) => request.kind === "draft-preview"));
    const card = service
      .listPendingRequests()
      .flatMap((request) => (request.kind === "draft-preview" ? [request.card] : []));
    await service.respondToDraftPreview({ requestId: card[0]?.requestId ?? "", decision: "send" });
    await waitFor(() => service.access?.get("chief").level === "full");
    const turn = await heldTurn(service, cli);
    ask(cli, turn, "fc-2", join(bot.workspacePath, "src"));
    await waitFor(() => events.some((event) => event.type === "approval"));
    expect(events.some((event) => event.type === "access-denied")).toBe(false);
  });

  it("when isolation works the usual rules and cards decide, as before", async () => {
    const { service, cli, events, bot } = await open();
    await service.isolation?.initialize();
    const turn = await heldTurn(service, cli);
    ask(cli, turn, "fc-3", join(bot.workspacePath, "src"));
    await waitFor(() => events.some((event) => event.type === "approval"));
    expect(events.some((event) => event.type === "access-denied")).toBe(false);
  });

  it("no turn starts before the first check of the computer is done", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { service, cli } = await open({ gate });
    void service.isolation?.initialize();
    await service.sendMessage({ botId: "chief", text: "Early" });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(cli.calls("turn/start")).toHaveLength(0);
    release();
    await waitFor(() => cli.calls("turn/start").length === 1);
  });

  it("turning isolation off is a card; the agent's list says it", async () => {
    const { service } = await open();
    await service.isolation?.initialize();
    const result = await service.isolation?.setEnabled({ botId: "chief", enabled: false });
    expect(result?.offRequested).toBe(true);
    await waitFor(() => service.listPendingRequests().some((request) => request.kind === "draft-preview"));
    const card = service
      .listPendingRequests()
      .flatMap((request) => (request.kind === "draft-preview" ? [request.card] : []));
    expect(card[0]?.title).toContain("Turn off isolation");
    await service.respondToDraftPreview({ requestId: card[0]?.requestId ?? "", decision: "send" });
    await waitFor(() => service.isolation?.get("chief").state === "off");
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
