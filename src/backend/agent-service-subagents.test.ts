// @vitest-environment node
// COSGRAL W6-BE4 (step 2): subagents on the real AgentService (spec-w6.md 1D, W23-W28; Q10, Q11). A fake Codex runs the
// parent's turn (held open) and the subagents' turns; the agent starts subagents with `cosgral_subagents.spawn`.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, BrowserControlState, BrowserTab, Subagent } from "@openbot/contracts/ipc";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  root = await mkdtemp(join(tmpdir(), "openbot-subagents-"));
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

async function open(cli = new ThreadCli()) {
  const userData = join(root, "user-data");
  const store = new BotStore(userData, join(root, "home"), testDatabase(userData));
  const mailbox = new MailboxStore(userData, store.sharedRoot, testDatabase(userData));
  const service = new AgentService(store, mailbox, fakeBrowser(), null, 30_000, "codex", () => cli);
  services.push(service);
  const events: AgentEvent[] = [];
  service.on("event", (event) => events.push(event));
  await service.initialize();
  await store.getOrCreate("chief");
  return { service, store, cli, events, userData };
}

/** A parent turn the fake keeps open, so the agent can call its tools inside it. */
async function parentTurn(service: AgentService, cli: ThreadCli, text = "Do the big job") {
  const before = cli.pending.length;
  cli.hold = true;
  await service.sendMessage({ botId: "chief", text });
  await waitFor(() => cli.pending.length === before + 1);
  const turn = cli.pending[cli.pending.length - 1];
  if (!turn) throw new Error("No held turn.");
  return { threadId: turn.threadId, turnId: turn.turnId };
}

function changes(events: AgentEvent[]): Subagent[] {
  return events.flatMap((event) => (event.type === "subagent-changed" ? [event.subagent] : []));
}

function responseText(cli: ThreadCli, index: number): string {
  return JSON.stringify(cli.responses[index]);
}

describe.sequential("subagents on the service", {
  timeout: process.platform === "win32" ? 30_000 : 10_000,
}, () => {
  it("runs a subagent in a session of its own and returns its answer to the parent as a tool result (W23)", async () => {
    const { service, cli, events } = await open();
    const turn = await parentTurn(service, cli);
    cli.callTool(turn, SUBAGENT_NAMESPACE, "spawn", { task: "Check the side job", title: "Side job" });
    await waitFor(() => cli.pending.length === 2);
    const child = cli.pending[1];
    expect(child?.threadId).not.toBe(turn.threadId);

    const starting = changes(events).find((item) => item.state === "starting");
    expect(starting).toMatchObject({ botId: "chief", title: "Side job", parentTurnId: turn.turnId });
    const parentThread = (await service.listThreads("chief")).activeThreadId;
    expect(starting?.threadId).toBe(parentThread);

    cli.finish(child?.threadId);
    await waitFor(() => cli.responses.length === 1);
    expect(responseText(cli, 0)).toContain("ANSWER_TO[Check the side job]");
    expect(responseText(cli, 0)).toContain('\\"state\\":\\"done\\"');

    const listed = await service.listSubagents({ botId: "chief" });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ state: "done", result: "ANSWER_TO[Check the side job]", preview: null });

    // Its session is not part of the parent's conversation and it never looked like a turn of the agent.
    cli.finish(turn.threadId);
    await waitFor(() => events.some((event) => event.type === "turn-completed"));
    const conversation = await service.readConversation("chief");
    expect(conversation.messages.some((message) => message.text.includes("Check the side job"))).toBe(false);
    expect(events.filter((event) => event.type === "turn-started")).toHaveLength(1);
    expect(events.filter((event) => event.type === "turn-completed")).toHaveLength(1);
  });

  it("gives the subagent the parent's tools minus the subagent tools, and the parent's access (never more)", async () => {
    const { service, cli } = await open();
    const turn = await parentTurn(service, cli);
    cli.callTool(turn, SUBAGENT_NAMESPACE, "spawn", { task: "Inspect tools", wait: false });
    await waitFor(() => cli.pending.length === 2);
    const [parentStart, childStart] = cli.calls("thread/start");
    const names = (params: unknown) => JSON.stringify(params);
    expect(names(parentStart)).toContain(SUBAGENT_NAMESPACE);
    expect(names(parentStart)).toContain("up to 3 subagents");
    expect(names(childStart)).not.toContain(SUBAGENT_NAMESPACE);
    expect(names(childStart)).not.toContain("up to 3 subagents");
    expect(names(childStart)).toContain("You are a SUBAGENT");
    expect(names(childStart)).toContain("cosgral_cards");
    if (!isDynamicRecord(parentStart) || !isDynamicRecord(childStart)) throw new Error("Expected thread/start params.");
    expect(childStart).toMatchObject({ ephemeral: true });
    for (const key of ["approvalPolicy", "sandbox", "runtimeWorkspaceRoots", "cwd"]) {
      expect(childStart[key]).toEqual(parentStart[key]);
    }
  });

  it("refuses the fourth at the same time and a subagent of a subagent with a readable reason (W26)", async () => {
    const { service, cli } = await open();
    const turn = await parentTurn(service, cli);
    for (let index = 0; index < 3; index += 1) {
      cli.callTool(turn, SUBAGENT_NAMESPACE, "spawn", { task: `job ${index}`, wait: false });
    }
    await waitFor(() => cli.responses.length === 3);
    cli.callTool(turn, SUBAGENT_NAMESPACE, "spawn", { task: "one too many", wait: false });
    await waitFor(() => cli.responses.length === 4);
    expect(responseText(cli, 3)).toMatch(/At most 3 subagents/);
    expect(JSON.stringify(cli.responses[3])).toContain('"success":false');

    const child = cli.pending[1];
    cli.callTool({ threadId: child?.threadId ?? "", turnId: child?.turnId ?? "" }, SUBAGENT_NAMESPACE, "spawn", {
      task: "deep",
    });
    await waitFor(() => cli.responses.length === 5);
    expect(responseText(cli, 4)).toMatch(/cannot start subagents/);
    expect(await service.listSubagents({ botId: "chief" })).toHaveLength(3);
  });

  it("a question of a subagent shows in Needs you of the PARENT's thread, linked to it, and it works again after the answer (W24)", async () => {
    const { service, cli, events } = await open();
    const turn = await parentTurn(service, cli);
    cli.callTool(turn, SUBAGENT_NAMESPACE, "spawn", { task: "Needs approval", wait: false });
    await waitFor(() => cli.pending.length === 2);
    const child = cli.pending[1];
    const childTurn = { threadId: child?.threadId ?? "", turnId: child?.turnId ?? "" };
    cli.callTool(childTurn, "cosgral_cards", "confirm", { title: "Send it?", preview: "Hello", recipient: "Anna" });
    await waitFor(() => events.some((event) => event.type === "draft-preview"));
    const card = events.find((event) => event.type === "draft-preview");
    if (card?.type !== "draft-preview") throw new Error("Expected a card.");
    const parentThread = (await service.listThreads("chief")).activeThreadId;
    expect(card.card.threadId).toBe(parentThread);
    expect(card.card.botId).toBe("chief");

    await waitFor(() => (changes(events).at(-1)?.state ?? "") === "waiting");
    expect(changes(events).at(-1)?.waitingRequestIds).toEqual([card.card.requestId]);
    const threads = await service.listThreads("chief");
    expect(threads.threads.find((thread) => thread.id === parentThread)?.needsYou).toBe(1);

    await service.respondToDraftPreview({ requestId: card.card.requestId, decision: "send" });
    await waitFor(() => (changes(events).at(-1)?.state ?? "") === "working");
    expect(changes(events).at(-1)?.waitingRequestIds).toEqual([]);
  });

  it("Stop ends the subagent at once, closes its open card and answers the parent instead of leaving it waiting (W25)", async () => {
    const { service, cli, events } = await open();
    const turn = await parentTurn(service, cli);
    cli.callTool(turn, SUBAGENT_NAMESPACE, "spawn", { task: "Will be stopped" });
    await waitFor(() => cli.pending.length === 2);
    const child = cli.pending[1];
    cli.callTool({ threadId: child?.threadId ?? "", turnId: child?.turnId ?? "" }, "cosgral_cards", "confirm", {
      preview: "Hi",
    });
    await waitFor(() => events.some((event) => event.type === "draft-preview"));
    const id = (await service.listSubagents({ botId: "chief" }))[0]?.id ?? "";

    const stopped = await service.stopSubagent({ subagentId: id });
    expect(stopped).toMatchObject({ state: "stopped", error: "Stopped by the user." });
    await waitFor(() => cli.responses.length === 2);
    const texts = [responseText(cli, 0), responseText(cli, 1)].join(" ");
    expect(texts).toContain('\\"state\\":\\"stopped\\"');
    expect(texts).toContain("expired");
    expect(service.listPendingRequests()).toEqual([]);
    expect(cli.calls("turn/interrupt")).toHaveLength(1);
    expect((await service.stopSubagent({ subagentId: id })).state).toBe("stopped");
    await expect(service.stopSubagent({ subagentId: "nope" })).rejects.toThrow(/Unknown subagent/);
  });

  it("ending the parent's turn stops the subagents that still work (nothing runs without its parent)", async () => {
    const { service, cli, events } = await open();
    const turn = await parentTurn(service, cli);
    cli.callTool(turn, SUBAGENT_NAMESPACE, "spawn", { task: "Orphan", wait: false });
    await waitFor(() => cli.pending.length === 2);
    cli.finish(turn.threadId);
    await waitFor(() => events.some((event) => event.type === "turn-completed"));
    await waitFor(() => (changes(events).at(-1)?.state ?? "") === "stopped");
    expect(changes(events).at(-1)).toMatchObject({ error: "The turn of the agent ended." });
    expect((await service.listSubagents({ botId: "chief" }))[0]?.state).toBe("stopped");
  });

  it("keeps the answers after a restart, closes what was working, and a deleted thread takes its subagents", async () => {
    const first = await open();
    const turn = await parentTurn(first.service, first.cli);
    first.cli.callTool(turn, SUBAGENT_NAMESPACE, "spawn", { task: "Finishes" });
    await waitFor(() => first.cli.pending.length === 2);
    first.cli.finish(first.cli.pending[1]?.threadId);
    await waitFor(() => first.cli.responses.length === 1);
    first.cli.callTool(turn, SUBAGENT_NAMESPACE, "spawn", { task: "Still working", wait: false });
    await waitFor(() => first.cli.pending.length === 2);
    const threadId = (await first.service.listThreads("chief")).activeThreadId ?? "";
    services.splice(services.indexOf(first.service), 1);
    await first.service.stop();
    closeTestDatabases();

    const userData = join(root, "user-data");
    const store = new BotStore(userData, join(root, "home"), testDatabase(userData));
    const mailbox = new MailboxStore(userData, store.sharedRoot, testDatabase(userData));
    const again = new AgentService(store, mailbox, fakeBrowser(), null, 30_000, "codex", () => new ThreadCli());
    services.push(again);
    await again.initialize();
    const listed = await again.listSubagents({ botId: "chief", threadId });
    expect(listed.map((item) => [item.title, item.state])).toEqual([
      ["Still working", "stopped"],
      ["Finishes", "done"],
    ]);
    // Closing the program stops it at once and says so; a crash would leave it for `recover` (runner test).
    expect(listed[0]?.error).toBe("The program is closing.");
    await again.createThread({ botId: "chief", title: "Other" });
    await again.deleteThread({ botId: "chief", threadId, confirm: true });
    expect(await again.listSubagents({ botId: "chief", threadId })).toEqual([]);
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

async function waitFor(check: () => boolean | undefined): Promise<void> {
  const deadline = Date.now() + (process.platform === "win32" ? 10_000 : 4_000);
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the fake CLI.");
}
