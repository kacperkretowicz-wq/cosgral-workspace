import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AgentEvent } from "@openbot/contracts/ipc";
import { AgentService } from "../src/backend/agent-service";
import { BotStore } from "../src/backend/bot-store";
import { ChannelEngine } from "../src/backend/channel-engine";
import { ChannelStore } from "../src/backend/channel-store";
import { DraftStore } from "../src/backend/draft-store";
import { MailboxStore } from "../src/backend/mailbox-store";
import { OpenBotDatabase } from "../src/backend/openbot-database";
import { writeFakeCli } from "../src/backend/testing/fake-cli";

async function main() {
  const root = process.env.COSGRAL_CHANNEL_SANDBOX;
  assert(
    root && process.env.USERPROFILE && resolve(process.env.USERPROFILE).startsWith(resolve(root)),
    "Use a dedicated sandbox USERPROFILE",
  );
  assert(
    process.env.APPDATA?.startsWith(root) && process.env.LOCALAPPDATA?.startsWith(root),
    "Sandbox APPDATA and LOCALAPPDATA required",
  );
  await mkdir(root, { recursive: true });
  process.env.OPENBOT_CODEX_PATH = await writeFakeCli(
    join(root, "Codex Fixture"),
    "codex",
    await readFile(join(process.cwd(), "src/backend/testing/channel-codex.cjs"), "utf8"),
  );
  process.env.OPENBOT_CLAUDE_PATH = join(root, "missing-claude");
  const db = new OpenBotDatabase(join(root, "data"));
  const bots = new BotStore(join(root, "data"), join(root, "home"), db);
  const mailbox = new MailboxStore(join(root, "data"), bots.sharedRoot, db);
  // A fake browser with one tab: the fixture never drives a real page.
  const activatedTabs: string[] = [];
  const browserCalls: string[] = [];
  const service = new AgentService(bots, mailbox, {
    onChanged: () => () => {},
    onControlChanged: () => () => {},
    clearControls: () => {},
    endControl: () => {},
    handleDynamicTool: async (params) => {
      browserCalls.push(params.tool);
      return { success: true, contentItems: [{ type: "inputText", text: "{}" }] };
    },
    listTabs: () => [
      {
        id: "tab-1",
        title: "Sign in",
        url: "https://login.example/",
        loading: false,
        ownerThreadId: null,
        ownerBotId: null,
      },
    ],
    activate: async (tabId) => {
      activatedTabs.push(tabId);
    },
  });
  const events: AgentEvent[] = [];
  service.on("event", (e) => events.push(e));
  let engine: ChannelEngine | undefined;
  const wait = async (predicate: () => boolean) => {
    const end = Date.now() + 30_000;
    while (!predicate()) {
      assert(Date.now() < end, "Sandbox step timed out");
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  try {
    await service.initialize();
    const lead = await service.createBot(),
      a = await service.createBot(),
      b = await service.createBot();
    const store = new ChannelStore(db, { botExists: (id) => service.listBots().some((bot) => bot.id === id) });
    store.on("event", (e) => events.push(e));
    const channel = store.create({
      name: "sandbox",
      title: "Sandbox team",
      instructions: "Use the fixture only",
      memberBotIds: [lead.id, a.id, b.id],
      leadBotId: lead.id,
      isolated: true,
    });
    engine = new ChannelEngine(
      store,
      { run: (input) => service.runChannelTurn(input) },
      { workspaceForBot: (id) => service.listBots().find((bot) => bot.id === id)?.workspacePath ?? null },
    );
    engine.start();
    const task = engine.sendMessage({ channelId: channel.id, text: "TEAM SMOKE" }).task;
    await wait(() => store.getTask(task.id).state === "done");
    const messages = store.listMessages(channel.id);
    assert.equal(store.listTasks(channel.id).length, 3);
    assert.equal(messages.filter((m) => m.taskId === task.id && m.kind === "result").length, 2);
    assert(messages.some((m) => m.resultVersion === 1 && m.superseded));
    assert(messages.some((m) => m.resultVersion === 2 && !m.superseded));
    assert.equal(store.listMemory(channel.id)[0]?.text, "Sandbox channel memory only");
    for (const bot of [lead, a, b]) assert.equal((await service.readConversation(bot.id)).messages.length, 0);
    const fast = engine.sendMessage({ channelId: channel.id, text: "FAST SMOKE" }).task;
    await wait(() => store.getTask(fast.id).state === "done");
    const fastResults = store.listMessages(channel.id).filter((m) => m.taskId === fast.id && m.kind === "result");
    assert.deepEqual(
      fastResults.map((m) => m.text),
      ["Stub: fast combined"],
    );
    const limited = engine.sendMessage({ channelId: channel.id, text: "LIMIT SMOKE" }).task;
    await wait(() => store.getTask(limited.id).state === "paused");
    assert.equal(store.getTask(limited.id).assignmentCount, 8);
    store.update({ channelId: channel.id, instructions: "FINISH LIMIT" });
    engine.actOnTask({ taskId: limited.id, action: "resume" });
    await wait(() => store.getTask(limited.id).state === "done");
    const question = engine.sendMessage({ channelId: channel.id, text: "QUESTION SMOKE" }).task;
    await wait(() => service.listPendingRequests().length === 1);
    assert.equal(store.getTask(question.id).state, "waiting");
    const prompt = service.listPendingRequests()[0];
    assert(prompt.kind === "prompt");
    await service.respondToPrompt({ requestId: prompt.requestId, answers: { format: ["Short"] } });
    await wait(() => store.getTask(question.id).state === "done");
    // W1-BE3: draft card (Send, then Keep draft) and browser takeover inside channel turns.
    const pendingKind = (kind: string) => service.listPendingRequests().filter((request) => request.kind === kind);
    const sent = engine.sendMessage({ channelId: channel.id, text: "CARD SMOKE send" }).task;
    await wait(() => pendingKind("draft-preview").length === 1);
    assert.equal(store.getTask(sent.id).state, "waiting");
    const firstCard = pendingKind("draft-preview")[0];
    assert(firstCard?.kind === "draft-preview");
    assert.equal(firstCard.card.preview, "Hi Anna, the report is ready.");
    await service.respondToDraftPreview({ requestId: firstCard.card.requestId, decision: "send" });
    await wait(() => store.getTask(sent.id).state === "done");
    assert.equal(resultText(store, channel.id, sent.id), "Stub: card decision send");
    const kept = engine.sendMessage({ channelId: channel.id, text: "CARD SMOKE keep" }).task;
    await wait(() => pendingKind("draft-preview").length === 1);
    const secondCard = pendingKind("draft-preview")[0];
    assert(secondCard?.kind === "draft-preview");
    await service.respondToDraftPreview({ requestId: secondCard.card.requestId, decision: "keep-draft" });
    await wait(() => store.getTask(kept.id).state === "done");
    assert.equal(resultText(store, channel.id, kept.id), "Stub: card decision keep-draft");
    assert.equal(service.listDrafts().length, 1);
    const takeover = engine.sendMessage({ channelId: channel.id, text: "TAKEOVER SMOKE", resourceKey: "browser" }).task;
    await wait(() => pendingKind("browser-takeover").length === 1);
    const request = pendingKind("browser-takeover")[0];
    assert(request?.kind === "browser-takeover" && request.phase === "requested");
    await service.respondToBrowserTakeover({ requestId: request.request.requestId, action: "take-over" });
    assert.deepEqual(activatedTabs, ["tab-1"]);
    assert.equal(pendingKind("browser-takeover")[0]?.kind, "browser-takeover");
    await service.respondToBrowserTakeover({ requestId: request.request.requestId, action: "return" });
    await wait(() => store.getTask(takeover.id).state === "done");
    assert.equal(resultText(store, channel.id, takeover.id), "Stub: takeover returned");
    assert.deepEqual(browserCalls, ["snapshot"]);
    const stopped = engine.sendMessage({ channelId: channel.id, text: "STOP SMOKE", resourceKey: "browser" }).task;
    await wait(() => store.getTask(stopped.id).state === "running");
    engine.actOnTask({ taskId: stopped.id, action: "stop" });
    await engine.stop();
    assert.equal(store.getTask(stopped.id).state, "cancelled");
    assert.equal(store.getTask(stopped.id).resultMessageId, null);
    await writeFile(
      join(root, "evidence.json"),
      JSON.stringify(
        {
          fixture: true,
          channel,
          tasks: store.listTasks(channel.id),
          messages: store.listMessages(channel.id),
          memory: store.listMemory(channel.id),
          events,
        },
        null,
        2,
      ),
    );
    await service.stop();
    db.close();
    const reopened = new OpenBotDatabase(join(root, "data"));
    await reopened.initialize();
    assert.equal(new ChannelStore(reopened).listMessages(channel.id).length, storeMessageCount(messages, events));
    assert.equal(new DraftStore(reopened).list().length, 1, "The kept draft survives a restart");
    reopened.close();
    console.log(
      JSON.stringify({
        ok: true,
        fixture: true,
        agents: 3,
        resultVersions: 2,
        fastHelperWaitingTextNotResult: true,
        draftCardSend: true,
        draftCardKeptDrafts: 1,
        browserTakeoverReturned: true,
        assignmentLimit: 8,
        humanResume: true,
        question: true,
        stop: true,
        dmMessages: 0,
        evidence: join(root, "evidence.json"),
      }),
    );
  } finally {
    await Promise.all([engine?.stop(), service.stop()]);
    db.close();
  }
}
function resultText(store: ChannelStore, channelId: string, taskId: string): string | undefined {
  const resultId = store.getTask(taskId).resultMessageId;
  return resultId ? store.getMessage(channelId, resultId).text : undefined;
}

function storeMessageCount(_messages: unknown[], events: AgentEvent[]): number {
  return events.filter((e) => e.type === "channel-message").length;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
