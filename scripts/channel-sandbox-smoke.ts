import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AgentEvent } from "@openbot/contracts/ipc";
import { AgentService } from "../src/backend/agent-service";
import { BotStore } from "../src/backend/bot-store";
import { ChannelEngine } from "../src/backend/channel-engine";
import { ChannelStore } from "../src/backend/channel-store";
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
  const service = new AgentService(bots, mailbox, {
    onChanged: () => () => {},
    onControlChanged: () => () => {},
    clearControls: () => {},
    endControl: () => {},
    handleDynamicTool: async () => ({ success: false, contentItems: [] }),
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
    reopened.close();
    console.log(
      JSON.stringify({
        ok: true,
        fixture: true,
        agents: 3,
        resultVersions: 2,
        fastHelperWaitingTextNotResult: true,
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
function storeMessageCount(_messages: unknown[], events: AgentEvent[]): number {
  return events.filter((e) => e.type === "channel-message").length;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
