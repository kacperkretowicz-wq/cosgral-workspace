// @vitest-environment node
// COSGRAL W6-BE3 (step 1): the context of a conversation per thread, with the threads of W6-BE1. A question about a thread
// other than the one on screen is answered for that thread; compacting needs a thread that is active, or idle and resumable.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, BrowserControlState, BrowserTab } from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentService } from "./agent-service";
import { BotStore } from "./bot-store";
import { MailboxStore } from "./mailbox-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { writeFakeCli } from "./testing/fake-cli";
import { stringParam, ThreadCli } from "./testing/thread-cli";
import { suiteTimeout } from "./testing/timeouts";

let root: string;
const services: AgentService[] = [];
const originalCodexPath = process.env.OPENBOT_CODEX_PATH;
const originalClaudePath = process.env.OPENBOT_CLAUDE_PATH;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "openbot-context-threads-"));
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

async function fixture(cli = new ThreadCli()) {
  const userData = join(root, "user-data");
  const store = new BotStore(userData, join(root, "home"), testDatabase(userData));
  const mailbox = new MailboxStore(userData, store.sharedRoot, testDatabase(userData));
  const service = new AgentService(store, mailbox, fakeBrowser(), null, 30_000, "codex", () => cli);
  services.push(service);
  const events: AgentEvent[] = [];
  service.on("event", (event) => events.push(event));
  await service.initialize();
  await store.getOrCreate("chief");
  await store.getOrCreate("scout");
  return { service, store, cli, events };
}

describe.sequential("the context of a conversation, per thread", {
  timeout: suiteTimeout(30_000, 10_000),
}, () => {
  it("answers for the thread it is asked about, not only for the one on screen", async () => {
    const { service: s, cli, events } = await fixture();
    cli.usage.set("cli-thread-1", 85_000);
    cli.usage.set("cli-thread-2", 20_000);
    await s.sendMessage({ botId: "chief", text: "Work in A" });
    await waitFor(() => completed(events) === 1);
    const a = (await s.listThreads("chief")).activeThreadId ?? "";
    const b = (await s.createThread({ botId: "chief", title: "B" })).activeThreadId ?? "";
    // B is on screen and has no report yet; A keeps its own numbers and can still be asked about.
    expect(s.contextState("chief")).toMatchObject({ threadId: b, source: "unavailable", used: null, percent: null });
    expect(s.contextState("chief", a)).toMatchObject({ threadId: a, source: "reported", used: 85_000, percent: 85 });
    expect(s.contextState("chief", a).warning).toBe(true);
    await s.sendMessage({ botId: "chief", text: "Work in B" });
    await waitFor(() => completed(events) === 2);
    expect(s.contextState("chief")).toMatchObject({ threadId: b, source: "reported", used: 20_000, percent: 20 });
    expect(s.contextState("chief", a)).toMatchObject({ used: 85_000 });
    // Another agent has its own.
    expect(s.contextState("scout").source).toBe("unavailable");
  });

  it("a report from a turn that goes on in the background lands in its own thread", async () => {
    const { service: s, cli, events } = await fixture();
    cli.usage.set("cli-thread-1", 60_000);
    cli.hold = true;
    await s.sendMessage({ botId: "chief", text: "Long work in A" });
    await waitFor(() => cli.pending.length === 1);
    const a = (await s.listThreads("chief")).activeThreadId ?? "";
    const b = (await s.createThread({ botId: "chief" })).activeThreadId ?? "";
    cli.finish();
    await waitFor(() => completed(events) === 1);
    expect(s.contextState("chief", a)).toMatchObject({ source: "reported", used: 60_000, percent: 60 });
    expect(s.contextState("chief", b).source).toBe("unavailable");
    // The window hears about thread A, with its id.
    const heard = events.flatMap((event) => (event.type === "context-changed" ? [event] : []));
    expect(heard.at(-1)).toMatchObject({ botId: "chief", threadId: a, used: 60_000 });
  });

  it("a thread that does not exist (or belongs to another agent) is 'unavailable', and cannot be compacted", async () => {
    const { service: s, cli, events } = await fixture();
    cli.usage.set("cli-thread-1", 50_000);
    await s.sendMessage({ botId: "scout", text: "Scout work" });
    await waitFor(() => completed(events) === 1);
    const scoutThread = (await s.listThreads("scout")).activeThreadId ?? "";
    for (const id of ["no-such-thread", scoutThread]) {
      expect(s.contextState("chief", id)).toMatchObject({
        source: "unavailable",
        used: null,
        canCompact: false,
        unavailableReason: expect.stringMatching(/does not exist/),
      });
      await expect(s.compactContext("chief", id)).rejects.toThrow(/Unknown thread/);
    }
    expect(() => s.contextState("nobody")).toThrow(/does not exist/);
  });

  it("compacts a thread that is not on screen when it is idle, and says so for that thread only", async () => {
    const { service: s, cli, events } = await fixture();
    // Below the automatic threshold (90 %): at 95 % the program compacted A by itself right after the turn, and
    // whether that ran before or after the request below decided between one and two compactions (a flaky test).
    cli.usage.set("cli-thread-1", 85_000);
    await s.sendMessage({ botId: "chief", text: "Big work in A" });
    await waitFor(() => completed(events) === 1);
    const a = (await s.listThreads("chief")).activeThreadId ?? "";
    const aSession = cli.calls("turn/start").map((params) => stringParam(params, "threadId"))[0] ?? "";
    const b = (await s.createThread({ botId: "chief", title: "B" })).activeThreadId ?? "";
    expect(s.contextState("chief", a).canCompact).toBe(true);
    const asked = await s.compactContext("chief", a);
    expect(asked.threadId).toBe(a);
    await waitFor(() => s.contextState("chief", a).compactions === 1);
    expect(cli.calls("thread/compact/start")).toEqual([{ threadId: aSession }]);
    expect(s.contextState("chief", a)).toMatchObject({
      compacting: false,
      stale: true,
      lastCompactedFromTokens: 85_000,
    });
    expect(s.contextState("chief", b)).toMatchObject({ compactions: 0, compacting: false });
    // The conversation on screen (B) was not touched by it.
    expect((await s.readConversation("chief")).threadId).toBe(b);
  });

  it("resumes the CLI thread of an idle thread after a restart before it asks it to compact", async () => {
    const first = await fixture();
    first.cli.usage.set("cli-thread-1", 92_000);
    await first.service.sendMessage({ botId: "chief", text: "Work before restart" });
    await waitFor(() => completed(first.events) === 1);
    const a = (await first.service.listThreads("chief")).activeThreadId ?? "";
    const aSession = first.store.database.listProviderSessions(a)[0]?.externalSessionId ?? "";
    await first.service.createThread({ botId: "chief", title: "B" });
    await first.service.stop();
    closeTestDatabases();

    const second = await fixture();
    expect(second.service.contextState("chief", a)).toMatchObject({ source: "reported", used: 92_000 });
    await second.service.compactContext("chief", a);
    await waitFor(() => second.service.contextState("chief", a).compactions === 1);
    const order = second.cli.requests
      .filter((request) => ["thread/resume", "thread/compact/start"].includes(request.method))
      .map((request) => `${request.method}:${stringParam(request.params, "threadId")}`);
    expect(order).toEqual([`thread/resume:${aSession}`, `thread/compact/start:${aSession}`]);
  });

  it("refuses to compact another thread while the agent is busy, and says so", async () => {
    const { service: s, cli, events } = await fixture();
    // Below the threshold of the settings (90 %): the program does not compact by itself here.
    cli.usage.set("cli-thread-1", 85_000);
    await s.sendMessage({ botId: "chief", text: "Work in A" });
    await waitFor(() => completed(events) === 1);
    const a = (await s.listThreads("chief")).activeThreadId ?? "";
    await s.createThread({ botId: "chief", title: "B" });
    cli.hold = true;
    await s.sendMessage({ botId: "chief", text: "Running in B" });
    await waitFor(() => cli.pending.length === 1);
    await expect(s.compactContext("chief", a)).rejects.toThrow(/busy/);
    expect(cli.calls("thread/compact/start")).toEqual([]);
    expect(s.contextState("chief", a).compacting).toBe(false);
  });

  it("an archived thread cannot be compacted, and its numbers and counters are cleared; so are a deleted thread's", async () => {
    const { service: s, store, cli, events } = await fixture();
    cli.usage.set("cli-thread-1", 91_000);
    cli.usage.set("cli-thread-2", 40_000);
    await s.sendMessage({ botId: "chief", text: "Work in A" });
    await waitFor(() => completed(events) === 1);
    const a = (await s.listThreads("chief")).activeThreadId ?? "";
    const b = (await s.createThread({ botId: "chief", title: "B" })).activeThreadId ?? "";
    await s.sendMessage({ botId: "chief", text: "Work in B" });
    await waitFor(() => completed(events) === 2);
    expect(s.contextState("chief", a).used).toBe(91_000);

    await s.archiveThread({ botId: "chief", threadId: a });
    const archived = s.contextState("chief", a);
    expect(archived).toMatchObject({ source: "unavailable", used: null, compactions: 0, canCompact: false });
    await expect(s.compactContext("chief", a)).rejects.toThrow(/archived|Restore/);
    const told = events.flatMap((event) => (event.type === "context-changed" ? [event] : []));
    expect(told.at(-1)).toMatchObject({ threadId: a, source: "unavailable" });

    // B is on screen now; deleting it clears its context too, and the row is gone from the database.
    const c = (await s.listThreads("chief")).activeThreadId ?? "";
    expect(c).toBe(b);
    await s.deleteThread({ botId: "chief", threadId: b, confirm: true });
    expect(s.contextState("chief", b)).toMatchObject({ source: "unavailable", canCompact: false });
    const rows = store.database.connection
      .prepare("SELECT COUNT(*) AS n FROM projection_context_state WHERE agent_id = ? AND thread_id IN (?, ?)")
      .get("chief", a, b);
    expect(rows?.n).toBe(0);
  });
});

function completed(events: AgentEvent[]): number {
  return events.filter((event) => event.type === "turn-completed" && event.status === "completed").length;
}

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
  const deadline = Date.now() + suiteTimeout(10_000, 4_000);
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the fake CLI.");
}
