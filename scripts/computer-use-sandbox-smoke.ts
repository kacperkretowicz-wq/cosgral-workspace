// COSGRAL W3-BE1 sandbox: Computer Use through the real AgentService, the deterministic Codex fixture and a FAKE
// desktop driver (no real mouse, keyboard or screen). Run with a sandbox USERPROFILE, APPDATA and LOCALAPPDATA.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AgentEvent, BotSummary, DraftPreviewDecision } from "@openbot/contracts/ipc";
import { AgentService } from "../src/backend/agent-service";
import { BotStore } from "../src/backend/bot-store";
import { MailboxStore } from "../src/backend/mailbox-store";
import { OpenBotDatabase } from "../src/backend/openbot-database";
import { writeFakeCli } from "../src/backend/testing/fake-cli";
import { FakeComputerDriver, fakeWindow } from "../src/backend/testing/fake-computer-driver";

const TEST_PASSWORD = "Test-Pass-1234!"; // test data only

async function main() {
  const root = process.env.COSGRAL_COMPUTER_SANDBOX;
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
    handleDynamicTool: async () => ({ success: true, contentItems: [{ type: "inputText", text: "{}" }] }),
  });
  // A pretend desktop: the test window, another window of the person, and COSGRAL Workspace itself.
  const driver = new FakeComputerDriver([
    fakeWindow({
      handle: "101",
      title: "COSGRAL test window",
      processId: 5001,
      processName: "powershell",
      foreground: true,
      bounds: { x: 800, y: 600, width: 1200, height: 800 },
    }),
    fakeWindow({
      handle: "102",
      title: "Other window",
      processId: 5002,
      bounds: { x: 0, y: 0, width: 600, height: 400 },
    }),
    fakeWindow({
      handle: "103",
      title: "COSGRAL Workspace",
      processId: process.pid,
      processName: "COSGRAL Workspace",
      bounds: { x: 2400, y: 0, width: 800, height: 600 },
    }),
  ]);
  service.computerUse.useDriver(driver);
  // Test-only reversible box: the Vault needs encryption to save the test login.
  service.useSecretBox({
    canEncrypt: () => true,
    encrypt: (plain) => `box:${Buffer.from(plain).toString("base64")}`,
    decrypt: (cipher) => Buffer.from(cipher.slice(4), "base64").toString(),
  });
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
  const cards: Array<{ title: string; preview: string; decision: DraftPreviewDecision }> = [];
  const pendingCard = () => service.listPendingRequests().find((request) => request.kind === "draft-preview");
  /** Sends a message as the person; answers the consent card when one is expected; returns the agent's reply. */
  const say = async (bot: BotSummary, text: string, decision?: DraftPreviewDecision) => {
    const before = (await replies(bot)).length;
    await service.sendMessage({ botId: bot.id, text });
    if (decision) {
      await wait(() => pendingCard() !== undefined);
      const request = pendingCard();
      assert(request?.kind === "draft-preview");
      assert.equal(request.card.variant, "confirm");
      cards.push({ title: request.card.title, preview: request.card.preview, decision });
      await service.respondToDraftPreview({ requestId: request.card.requestId, decision });
    }
    await wait(async () => (await replies(bot)).length > before);
    const reply = (await replies(bot)).at(-1)?.text ?? "";
    assert(reply.startsWith("DATA-RESULT "), reply);
    return JSON.parse(reply.slice("DATA-RESULT ".length));
  };
  try {
    await service.initialize();
    const bot = await service.createBot();
    service.vault.save({ kind: "login", url: "https://bank.example", username: "tester", password: TEST_PASSWORD });

    // 1. The first action asks with a confirm card; then the agent sees the screen, clicks the field and types.
    const work = await say(bot, "COMPUTER WORK", "send");
    assert.equal(cards.length, 1);
    assert.match(cards[0]?.title ?? "", /control this computer/);
    assert.equal(work.shot.width, 1600);
    assert.equal(driver.typed(), "Hello from COSGRAL");
    const click = driver.steps.find((step) => step.kind === "click");
    assert(click?.kind === "click" && click.x >= 800 && click.x < 2000 && click.y >= 600 && click.y < 1400);
    assert.deepEqual(
      driver.steps.filter((step) => step.kind === "keys").map((step) => step.kind === "keys" && step.keys),
      [["ctrl", "s"]],
    );
    const afterTurn = service.computerUse.getState();
    assert.equal(afterTurn.sessions.length, 0, "The session ends with the turn");
    assert.equal(afterTurn.grants.length, 1, "The permission stays for the conversation");

    // 2. The next action in the same conversation does not ask again.
    const again = await say(bot, 'COMPUTER TRY double_click {"x":700,"y":500}');
    assert.equal(again.success, true);
    assert.equal(cards.length, 1);

    // 3. Stop in the middle of typing: the session ends at once and the permission is taken back.
    driver.typingDelayMs = 30;
    const typedBefore = driver.typed().length;
    const longText = "x".repeat(400);
    const before = (await replies(bot)).length;
    await service.sendMessage({ botId: bot.id, text: `COMPUTER TRY type_text {"text":"${longText}"}` });
    await wait(() => driver.typed().length >= typedBefore + 48);
    const during = service.computerUse.getState();
    assert.equal(during.sessions[0]?.phase, "acting");
    assert.equal(during.sessions[0]?.lastAction, "type_text");
    const stopped = service.computerUse.stop({ botId: bot.id });
    await wait(async () => (await replies(bot)).length > before);
    const stopReply = JSON.parse(((await replies(bot)).at(-1)?.text ?? "").slice("DATA-RESULT ".length));
    assert.equal(stopReply.success, false);
    assert.match(stopReply.text, /Stopped by the person/);
    const typedDuringStop = driver.typed().length - typedBefore;
    assert(typedDuringStop < longText.length, "Typing stopped before the end");
    assert.deepEqual(stopped.sessions, []);
    assert.deepEqual(stopped.grants, []);
    driver.typingDelayMs = 0;

    // 4. After Stop the next action asks again; a declined card does nothing.
    const declined = await say(bot, "COMPUTER TRY screenshot {}", "keep-draft");
    assert.equal(declined.success, false);
    assert.match(declined.text, /did not allow/);
    const allowed = await say(bot, "COMPUTER TRY screenshot {}", "send");
    assert.equal(allowed.success, true);

    // 5. Refusals with a clear message: locked screen, UAC prompt, a Vault value, COSGRAL Workspace itself.
    driver.locked = true;
    const locked = await say(bot, 'COMPUTER TRY click {"x":700,"y":500}');
    driver.locked = false;
    driver.uacPrompt = true;
    const uac = await say(bot, 'COMPUTER TRY type_text {"text":"hello"}');
    driver.uacPrompt = false;
    const vault = await say(bot, `COMPUTER TRY type_text {"text":"${TEST_PASSWORD}"}`);
    const self = await say(bot, 'COMPUTER TRY click {"x":1400,"y":150}');
    assert.match(locked.text, /locked/);
    assert.match(uac.text, /UAC/);
    assert.match(vault.text, /Vault/);
    assert.match(self.text, /COSGRAL Workspace itself/);
    assert.equal(driver.typed().includes(TEST_PASSWORD), false);
    assert.equal(cards.length, 3, "Only the first action and the two after Stop asked");

    const stateEvents = events.filter((event) => event.type === "computer-use-changed").length;
    const cardEvents = events.filter((event) => event.type === "draft-preview").length;
    const evidence = {
      fixture: true,
      fakeDesktop: true,
      cards,
      steps: driver.steps,
      typedTotal: driver.typed().length,
      typedBeforeStop: typedDuringStop,
      driverCancels: driver.cancels,
      sessionDuringTyping: during.sessions,
      afterStop: stopped,
      refusals: { locked: locked.text, uac: uac.text, vault: vault.text, self: self.text },
      stateEvents,
      cardEvents,
    };
    await writeFile(join(root, "evidence.json"), JSON.stringify(evidence, null, 2));
    console.log(
      JSON.stringify({
        ok: true,
        fixture: true,
        fakeDesktop: true,
        consentCards: cards.map((card) => card.decision),
        firstActionAskedOnce: true,
        stopMidTyping: { typed: typedDuringStop, of: longText.length, driverCancels: driver.cancels },
        askedAgainAfterStop: true,
        declinedDidNothing: true,
        refusals: ["locked", "uac", "vault", "cosgral-itself"],
        stateEvents,
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
