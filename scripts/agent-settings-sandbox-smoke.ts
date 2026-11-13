// COSGRAL W3-BE2 sandbox: onboarding, the agent creator, templates, tool switches and app settings through the real
// AgentService and the deterministic Codex fixture (no model, network or real data). Run with a sandbox USERPROFILE,
// APPDATA and LOCALAPPDATA.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AgentEvent, BotSummary } from "@openbot/contracts/ipc";
import { AgentService } from "../src/backend/agent-service";
import { BotStore } from "../src/backend/bot-store";
import { MailboxStore } from "../src/backend/mailbox-store";
import { OpenBotDatabase } from "../src/backend/openbot-database";
import { writeFakeCli } from "../src/backend/testing/fake-cli";
import { notificationForAgentEvent } from "../src/main/agent-notifications";
import { Onboarding } from "../src/main/onboarding";

function services(root: string) {
  const db = new OpenBotDatabase(join(root, "data"));
  const bots = new BotStore(join(root, "data"), join(root, "home"), db);
  const mailbox = new MailboxStore(join(root, "data"), bots.sharedRoot, db);
  const service = new AgentService(bots, mailbox, {
    onChanged: () => () => {},
    onControlChanged: () => () => {},
    clearControls: () => {},
    endControl: () => {},
    handleDynamicTool: async () => ({ success: true, contentItems: [{ type: "inputText", text: "{}" }] }),
  });
  // The same wiring as registerAgentSettingsIpc in the program.
  const onboarding = new Onboarding({
    setupFile: join(root, "data", "openbot-setup-v2.json"),
    templates: () => service.agentTemplates.list(),
    appSettings: () => service.agentSettings.appSettings(),
    updateLanguage: async (language) => {
      await service.agentSettings.updateAppSettings({ language });
    },
    computerUse: () => {
      const state = service.computerUse.getState();
      return { available: state.available, reason: state.unavailableReason };
    },
    applyProvider: async (provider) => service.setPreferredProvider(provider),
    createAgent: (input) => service.agentTemplates.createAgent(input),
    botExists: (botId) => service.listBots().some((bot) => bot.id === botId),
  });
  return { db, service, onboarding };
}

async function main() {
  const root = process.env.COSGRAL_SETTINGS_SANDBOX;
  assert(
    root && process.env.USERPROFILE && resolve(process.env.USERPROFILE).startsWith(resolve(root)),
    "Use a dedicated sandbox USERPROFILE",
  );
  assert(
    process.env.APPDATA?.startsWith(root) && process.env.LOCALAPPDATA?.startsWith(root),
    "Sandbox APPDATA and LOCALAPPDATA required",
  );
  await mkdir(join(root, "data"), { recursive: true });
  process.env.OPENBOT_CODEX_PATH = await writeFakeCli(
    join(root, "Codex Fixture"),
    "codex",
    await readFile(join(process.cwd(), "src/backend/testing/channel-codex.cjs"), "utf8"),
  );
  process.env.OPENBOT_CLAUDE_PATH = join(root, "missing-claude");
  const { db, service, onboarding } = services(root);
  const events: AgentEvent[] = [];
  service.on("event", (event) => events.push(event));
  const wait = async (predicate: () => Promise<boolean> | boolean) => {
    const end = Date.now() + 30_000;
    while (!(await predicate())) {
      assert(Date.now() < end, "Sandbox step timed out");
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  const replies = async (bot: BotSummary) =>
    (await service.readConversation(bot.id)).messages.filter(
      (message) => message.author === "assistant" && message.status !== "streaming" && message.text,
    );
  const say = async (bot: BotSummary, text: string) => {
    const before = (await replies(bot)).length;
    await service.sendMessage({ botId: bot.id, text });
    await wait(async () => (await replies(bot)).length > before);
    const reply = (await replies(bot)).at(-1)?.text ?? "";
    assert(reply.startsWith("DATA-RESULT "), reply);
    return JSON.parse(reply.slice("DATA-RESULT ".length));
  };
  try {
    await service.initialize();

    // 1. Onboarding: language, provider, first agent from a proposal.
    const fresh = await onboarding.state();
    assert.equal(fresh.completed, false);
    assert.deepEqual(
      fresh.proposals.map((template) => template.id),
      ["builtin:assistant", "builtin:researcher", "builtin:writer", "builtin:developer"],
    );
    const done = await onboarding.complete({
      language: "pl",
      preferredProvider: "codex",
      firstAgent: { templateId: "builtin:writer", name: "Pisarz" },
    });
    assert.equal(done.completed, true);
    assert(done.firstAgentId);
    const writer = service.listBots().find((bot) => bot.id === done.firstAgentId);
    assert(writer && writer.name === "Pisarz" && writer.role === "Writing and editing");
    const again = await onboarding.complete({
      language: "pl",
      preferredProvider: "codex",
      firstAgent: { templateId: "builtin:writer" },
    });
    assert.equal(again.firstAgentId, done.firstAgentId, "Onboarding creates the first agent only once");

    // 2. The template's switched-off tools and the language reach the agent's thread.
    const first = await say(writer, "SETTINGS CHECK");
    assert.equal(first.polish, true);
    assert.equal(first.switchedOff, "computer use, routines");
    assert(first.tools.includes("cosgral_vault") && first.tools.includes("openbot.send_message"));

    // 3. A switch changes the tools of the next turn (the thread is resumed) and the call is refused.
    await service.agentSettings.update({ botId: writer.id, tools: { vault: false, messaging: false } });
    const second = await say(writer, "SETTINGS CHECK");
    assert(!second.tools.includes("cosgral_vault"), "Vault left the thread");
    assert(!second.tools.includes("openbot.send_message"), "Messaging left the thread");
    assert(second.tools.includes("openbot.ask_user"), "Questions stay");
    const refused = await say(writer, "COMPUTER TRY screenshot {}");
    assert.equal(refused.success, false);
    assert.match(refused.text, /switched off the computer use/);

    // 4. The creator, a saved template and an agent from it.
    const created = await service.agentTemplates.createAgent({ templateId: "builtin:researcher", name: "Scout" });
    assert.deepEqual(created.warnings, []);
    const saved = await service.agentTemplates.saveFromAgent({ botId: created.bot.id, includeMemories: true });
    const copy = await service.agentTemplates.createAgent({ templateId: saved.id, name: "Scout 2" });
    assert.deepEqual(service.agentSettings.toolSwitches(copy.bot.id), { computer: false, vault: false });
    assert.equal(copy.bot.reasoningEffort, "high");
    const settings = await service.agentSettings.get(copy.bot.id);
    assert.equal(settings.memory.essentialCount, 1);

    // 5. App settings: the notification matrix decides system notifications.
    await service.agentSettings.updateAppSettings({ notifications: { matrix: { finished: { desktop: false } } } });
    const preferences = service.agentSettings.appSettings().notifications;
    const finished: AgentEvent = {
      type: "turn-completed",
      botId: writer.id,
      threadId: "t",
      turnId: "u",
      status: "completed",
    };
    const failed: AgentEvent = { ...finished, status: "failed" };
    assert.equal(notificationForAgentEvent(finished, service.listBots(), preferences), null);
    assert.deepEqual(notificationForAgentEvent(failed, service.listBots(), preferences), {
      title: "Pisarz",
      body: "Stopped with an error.",
      silent: true,
    });

    const evidence = {
      fixture: true,
      onboarding: { fresh: { completed: fresh.completed, proposals: fresh.proposals.map((t) => t.id) }, done },
      firstTurn: first,
      afterSwitch: second,
      refused,
      creator: { created: created.bot.name, saved: saved.id, copy: copy.bot.name, copySettings: settings.tools },
      appSettings: service.agentSettings.appSettings(),
      eventTypes: [...new Set(events.map((event) => event.type))].filter((type) =>
        ["agent-settings-changed", "agent-templates-changed", "app-settings-changed", "bots-changed"].includes(type),
      ),
    };
    await writeFile(join(root, "evidence.json"), JSON.stringify(evidence, null, 2));
    await service.stop();
    db.close();

    // 6. After a restart: onboarding done, switches, saved template, language and matrix are kept.
    const after = services(root);
    await after.service.initialize();
    const restarted = await after.onboarding.state();
    assert.equal(restarted.completed, true);
    assert.equal(restarted.firstAgentId, writer.id);
    assert.equal(restarted.language, "pl");
    assert.deepEqual(after.service.agentSettings.toolSwitches(writer.id), {
      computer: false,
      routines: false,
      vault: false,
      messaging: false,
    });
    assert(after.service.agentTemplates.list().some((template) => template.id === saved.id));
    assert.equal(after.service.agentSettings.appSettings().notifications.matrix.finished.desktop, false);
    await after.service.stop();
    after.db.close();
    console.log(
      JSON.stringify({
        ok: true,
        fixture: true,
        onboarding: { firstAgent: writer.name, once: true, language: "pl" },
        templateToolsInThread: first.switchedOff,
        switchLeavesThread: ["cosgral_vault", "openbot.send_message"],
        refusedCall: "computer use",
        creator: { fromBuiltIn: created.bot.name, fromSaved: copy.bot.name },
        matrix: { finishedDesktop: false, failedNotifies: true },
        afterRestart: true,
        evidence: join(root, "evidence.json"),
      }),
    );
  } finally {
    await service.stop();
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
