// @vitest-environment node
// COSGRAL W8-BE1: the access levels on the real AgentService (spec-w8.md 1A, W8-01…08; Q2, Q3, Q4, Q9). A fake Codex starts
// the threads and turns, and asks the program for approvals and tools like the real one does.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, BrowserControlState, BrowserTab } from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccessStore } from "./access-store";
import { AgentService } from "./agent-service";
import { BotStore } from "./bot-store";
import { MailboxStore } from "./mailbox-store";
import { SUBAGENT_NAMESPACE } from "./subagent-tools";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { writeFakeCli } from "./testing/fake-cli";
import { ThreadCli } from "./testing/thread-cli";

let root: string;
const services: AgentService[] = [];
const originalCodexPath = process.env.OPENBOT_CODEX_PATH;
const originalClaudePath = process.env.OPENBOT_CLAUDE_PATH;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "openbot-access-"));
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

async function open(options: { levels?: boolean } = {}) {
  const userData = join(root, "user-data");
  const store = new BotStore(userData, join(root, "home"), testDatabase(userData));
  const mailbox = new MailboxStore(userData, store.sharedRoot, testDatabase(userData));
  const cli = new ThreadCli();
  const service = new AgentService(store, mailbox, fakeBrowser(), null, 30_000, "codex", () => cli);
  if (options.levels !== false) service.useAccess(new AccessStore({ filePath: join(userData, "agent-access.json") }));
  services.push(service);
  const events: AgentEvent[] = [];
  service.on("event", (event) => events.push(event));
  await service.initialize();
  const bot = await store.getOrCreate("chief");
  return { service, store, cli, events, bot };
}

/** A turn the fake keeps open, so the CLI can ask for approvals and tools inside it. */
async function heldTurn(service: AgentService, cli: ThreadCli, text = "Do the job") {
  const before = cli.pending.length;
  cli.hold = true;
  await service.sendMessage({ botId: "chief", text });
  await waitFor(() => cli.pending.length === before + 1);
  const turn = cli.pending[cli.pending.length - 1];
  if (!turn) throw new Error("No held turn.");
  return { threadId: turn.threadId, turnId: turn.turnId };
}

interface ApprovalParams {
  grantRoot?: string;
  command?: string;
  cwd?: string;
}

function ask(
  cli: ThreadCli,
  turn: { threadId: string; turnId: string },
  method: string,
  id: string,
  params: ApprovalParams,
) {
  cli.emit("request", { method, id, params: { ...turn, ...params } });
}

function answerOf(cli: ThreadCli, id: string): DynamicRecord | undefined {
  const result = cli.responses.find((response) => response.id === id)?.result;
  return isDynamicRecord(result) ? result : undefined;
}

async function raiseTo(service: AgentService, level: "ask-first" | "full") {
  const access = service.access;
  if (!access) throw new Error("No access.");
  const result = await access.setLevel({ botId: "chief", level });
  expect(result.raiseRequested).toBe(true);
  await waitFor(() => service.listPendingRequests().some((request) => request.kind === "draft-preview"));
  const card = service
    .listPendingRequests()
    .flatMap((request) => (request.kind === "draft-preview" ? [request.card] : []));
  await service.respondToDraftPreview({ requestId: card[0]?.requestId ?? "", decision: "send" });
  await waitFor(() => access.get("chief").level === level);
}

function textOf(params: unknown, key: string): string | undefined {
  const value = isDynamicRecord(params) ? params[key] : undefined;
  return isString(value) ? value : undefined;
}

function listOf(params: unknown, key: string): string[] | undefined {
  const value = isDynamicRecord(params) ? params[key] : undefined;
  return Array.isArray(value) && value.every(isString) ? value : undefined;
}

function recordOf(params: unknown, key: string): DynamicRecord | undefined {
  const value = isDynamicRecord(params) ? params[key] : undefined;
  return isDynamicRecord(value) ? value : undefined;
}

describe.sequential("access levels on the service", {
  timeout: process.platform === "win32" ? 30_000 : 10_000,
}, () => {
  it("starts an agent in its working folder only: the CLI gets a narrow sandbox (W8-01)", async () => {
    const { service, cli, bot } = await open();
    await service.sendMessage({ botId: "chief", text: "Hello" });
    await waitFor(() => cli.calls("turn/start").length === 1);
    const [start] = cli.calls("thread/start");
    const [turn] = cli.calls("turn/start");
    expect(textOf(start, "sandbox")).toBe("workspace-write");
    expect(textOf(start, "approvalPolicy")).toBe("on-request");
    expect(listOf(start, "runtimeWorkspaceRoots")).toEqual([bot.workspacePath, expect.any(String)]);
    expect(recordOf(turn, "sandboxPolicy")).toMatchObject({ type: "workspaceWrite", networkAccess: true });
    expect(service.access?.get("chief").level).toBe("working-folder");
  });

  it("without the levels attached nothing changes: the wide sandbox of before", async () => {
    const { service, cli } = await open({ levels: false });
    await service.sendMessage({ botId: "chief", text: "Hello" });
    await waitFor(() => cli.calls("turn/start").length === 1);
    expect(textOf(cli.calls("thread/start")[0], "sandbox")).toBe("danger-full-access");
    expect(recordOf(cli.calls("turn/start")[0], "sandboxPolicy")).toEqual({ type: "dangerFullAccess" });
  });

  it("raising to full is a card; only after Allow does the next turn run in the wide sandbox (Q2, W8-04)", async () => {
    const { service, cli, events } = await open();
    await service.sendMessage({ botId: "chief", text: "First" });
    await waitFor(() => cli.calls("turn/start").length === 1);
    const asked = await service.access?.setLevel({ botId: "chief", level: "full" });
    expect(asked?.raiseRequested).toBe(true);
    // The card is open and nothing changed yet.
    await waitFor(() => service.listPendingRequests().some((request) => request.kind === "draft-preview"));
    expect(service.access?.get("chief").level).toBe("working-folder");
    await service.sendMessage({ botId: "chief", text: "Second, before the answer" });
    await waitFor(() => cli.calls("turn/start").length === 2);
    expect(recordOf(cli.calls("turn/start")[1], "sandboxPolicy")).toMatchObject({ type: "workspaceWrite" });

    const card = service
      .listPendingRequests()
      .flatMap((request) => (request.kind === "draft-preview" ? [request.card] : []));
    await service.respondToDraftPreview({ requestId: card[0]?.requestId ?? "", decision: "send" });
    await waitFor(() => service.access?.get("chief").level === "full");
    expect(events.some((event) => event.type === "access-changed" && event.access.level === "full")).toBe(true);
    await service.sendMessage({ botId: "chief", text: "Third, at full" });
    await waitFor(() => cli.calls("turn/start").length === 3);
    expect(recordOf(cli.calls("turn/start")[2], "sandboxPolicy")).toEqual({ type: "dangerFullAccess" });
  });

  it("refuses a file change outside the folders at working-folder, with no card, and tells the window (W8-02)", async () => {
    const { service, cli, events } = await open();
    const turn = await heldTurn(service, cli);
    ask(cli, turn, "item/fileChange/requestApproval", "fc-1", { grantRoot: join(root, "elsewhere") });
    await waitFor(() => answerOf(cli, "fc-1") !== undefined);
    expect(answerOf(cli, "fc-1")).toEqual({ decision: "decline" });
    expect(events.some((event) => event.type === "approval")).toBe(false);
    expect(events.find((event) => event.type === "access-denied")).toMatchObject({
      botId: "chief",
      kind: "file-change",
      reason: "outside-folder",
    });
  });

  it("a change inside the working folder still reaches the person as the usual card", async () => {
    const { service, cli, events, bot } = await open();
    const turn = await heldTurn(service, cli);
    ask(cli, turn, "item/fileChange/requestApproval", "fc-2", { grantRoot: join(bot.workspacePath, "src") });
    await waitFor(() => events.some((event) => event.type === "approval"));
    expect(answerOf(cli, "fc-2")).toBeUndefined();
    expect(events.some((event) => event.type === "access-denied")).toBe(false);
  });

  it("at ask-first a request outside the folders is a card with Allow and Deny (W8-03)", async () => {
    const { service, cli, events } = await open();
    await raiseTo(service, "ask-first");
    const turn = await heldTurn(service, cli);
    ask(cli, turn, "item/commandExecution/requestApproval", "cmd-1", {
      command: `del ${join(root, "elsewhere", "a.txt")}`,
      cwd: join(root, "home"),
    });
    await waitFor(() => events.some((event) => event.type === "approval"));
    const approval = events.flatMap((event) => (event.type === "approval" ? [event.approval] : []))[0];
    expect(approval?.kind).toBe("command");
    await service.respondToApproval({ requestId: approval?.requestId ?? "", decision: "decline" });
    expect(answerOf(cli, "cmd-1")).toEqual({ decision: "decline" });
  });

  it("an excluded folder is refused at full too, even with an Always rule's help (Q3, W8-05)", async () => {
    const { service, cli, events } = await open();
    await raiseTo(service, "full");
    const secret = join(root, "secret");
    service.access?.setFolders({ botId: "chief", excludedFolders: [secret] });
    const turn = await heldTurn(service, cli);
    ask(cli, turn, "item/fileChange/requestApproval", "fc-3", { grantRoot: join(secret, "keys") });
    await waitFor(() => answerOf(cli, "fc-3") !== undefined);
    expect(answerOf(cli, "fc-3")).toEqual({ decision: "decline" });
    expect(events.find((event) => event.type === "access-denied")).toMatchObject({ reason: "excluded" });
    // The same request elsewhere is not refused by the level.
    ask(cli, turn, "item/fileChange/requestApproval", "fc-4", { grantRoot: join(root, "other") });
    await waitFor(() => events.some((event) => event.type === "approval"));
  });

  it("a tool of the program that names an excluded folder is refused with a readable text", async () => {
    const { service, cli } = await open();
    const secret = join(root, "secret");
    service.access?.setFolders({ botId: "chief", excludedFolders: [secret] });
    const turn = await heldTurn(service, cli);
    cli.callTool(turn, "cosgral_library", "add_file", { path: join(secret, "a.txt") });
    await waitFor(() => cli.responses.length === 1);
    expect(JSON.stringify(cli.responses[0]?.result)).toContain("excluded");
    expect(JSON.stringify(cli.responses[0]?.result)).toContain('"success":false');
  });

  it("the settings and the level are kept: a restart finds them (W8-06)", async () => {
    const { service } = await open();
    await raiseTo(service, "ask-first");
    service.access?.setFolders({ botId: "chief", additionalFolders: [join(root, "docs")] });
    const reopened = new AccessStore({ filePath: join(root, "user-data", "agent-access.json") });
    expect(reopened.get("chief")).toMatchObject({ level: "ask-first", additionalFolders: [join(root, "docs")] });
  });

  it("a subagent gets exactly the sandbox and the roots of its parent, never more (W8-07, L4)", async () => {
    const { service, cli } = await open();
    const turn = await heldTurn(service, cli);
    cli.callTool(turn, SUBAGENT_NAMESPACE, "spawn", { task: "Side job", wait: false });
    await waitFor(() => cli.pending.length === 2);
    const [parentStart, childStart] = cli.calls("thread/start");
    expect(textOf(childStart, "sandbox")).toBe("workspace-write");
    for (const key of ["approvalPolicy", "sandbox", "cwd"]) {
      expect(textOf(childStart, key)).toBe(textOf(parentStart, key));
    }
    expect(listOf(childStart, "runtimeWorkspaceRoots")).toEqual(listOf(parentStart, "runtimeWorkspaceRoots"));
  });

  it("a request of a subagent is judged by the level of its parent (W8-07)", async () => {
    const { service, cli, events } = await open();
    const turn = await heldTurn(service, cli);
    cli.callTool(turn, SUBAGENT_NAMESPACE, "spawn", { task: "Side job", wait: false });
    await waitFor(() => cli.pending.length === 2);
    const child = cli.pending[1];
    if (!child) throw new Error("No subagent turn.");
    ask(cli, { threadId: child.threadId, turnId: child.turnId }, "item/fileChange/requestApproval", "sub-1", {
      grantRoot: join(root, "elsewhere"),
    });
    await waitFor(() => answerOf(cli, "sub-1") !== undefined);
    expect(answerOf(cli, "sub-1")).toEqual({ decision: "decline" });
    expect(events.some((event) => event.type === "access-denied")).toBe(true);
  });

  it("an agent made from a template or copied from a full agent starts at working-folder (Q9, L6)", async () => {
    const { service } = await open();
    await raiseTo(service, "full");
    const fromTemplate = await service.agentTemplates.createAgent({ templateId: "builtin:assistant" });
    expect(service.access?.get(fromTemplate.bot.id).level).toBe("working-folder");
    const copy = await service.agentTemplates.duplicateAgent({ sourceBotId: "chief" });
    expect(service.access?.get(copy.bot.id)).toMatchObject({
      level: "working-folder",
      additionalFolders: [],
      excludedFolders: [],
    });
    expect(service.access?.get("chief").level).toBe("full");
  });

  it("no tool lets an agent change its own level: the only way up is the card (Q2, 1G)", async () => {
    const { service, cli } = await open();
    const turn = await heldTurn(service, cli);
    for (const [namespace, tool] of [
      ["openbot", "set_access"],
      ["cosgral_cards", "set_access_level"],
    ] as const) {
      cli.callTool(turn, namespace, tool, { level: "full", botId: "chief" });
    }
    // The program does not know such a tool: it answers nothing useful and the level stays where it was, with no card.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(service.access?.get("chief").level).toBe("working-folder");
    expect(service.listPendingRequests().some((request) => request.kind === "draft-preview")).toBe(false);
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
  const deadline = Date.now() + (process.platform === "win32" ? 10_000 : 4_000);
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the fake CLI.");
}
