// COSGRAL W4-T2 (light): a connection test with the REAL Codex CLI in the sandbox program. At most 4 short turns:
// a chat, a question card, a confirm card and a channel with its lead. Each turn asks for a one-word answer.
//
//   COSGRAL_SANDBOX_ROOT=<folder outside the repo>
//   COSGRAL_REAL_CODEX_PATH=<codex executable or .cmd shim>
//   CODEX_HOME=<the existing Codex home of the signed-in person; used in place, never copied>
//   node scripts/sandbox-real-codex.ts
//
// The sandbox gets its own USERPROFILE, APPDATA, LOCALAPPDATA and TEMP; only Codex reads its own login from
// CODEX_HOME (Codex also writes its session files there). Nothing is printed from the login. Claude is not used:
// CLAUDE_CONFIG_DIR from the parent process is removed so no other program's account can leak in.
// Run `bun run build` first.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { type ElectronApplication, _electron as electron, type Page } from "playwright";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TURN_MS = 180_000;

interface Turn {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  assert(value, `${name} must be set`);
  return value;
}

async function launch(root: string): Promise<{ app: ElectronApplication; page: Page; findings: string[] }> {
  const home = join(root, "home");
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  delete env.CLAUDE_CONFIG_DIR;
  Object.assign(env, {
    USERPROFILE: home,
    HOME: home,
    APPDATA: join(home, "AppData", "Roaming"),
    LOCALAPPDATA: join(home, "AppData", "Local"),
    TEMP: join(root, "tmp"),
    TMP: join(root, "tmp"),
    OPENBOT_CODEX_PATH: required("COSGRAL_REAL_CODEX_PATH"),
    OPENBOT_CLAUDE_PATH: join(root, "no-claude.exe"),
    CODEX_HOME: required("CODEX_HOME"),
  });
  const app = await electron.launch({
    executablePath: join(repo, "node_modules", "electron", "dist", "electron.exe"),
    args: [repo],
    cwd: repo,
    env,
    timeout: 90_000,
  });
  const findings: string[] = [];
  const page = await app.firstWindow();
  page.on("console", (message) => {
    if (message.type() === "error") findings.push(message.text().slice(0, 300));
  });
  page.on("pageerror", (error) => findings.push(`pageerror: ${error.message.slice(0, 300)}`));
  await page.waitForLoadState("domcontentloaded");
  return { app, page, findings };
}

async function firstRun(page: Page): Promise<void> {
  const pages = page.getByRole("navigation", { name: "Pages" });
  for (let round = 0; round < 180; round += 1) {
    if (await pages.count()) return;
    const where = page.getByRole("button", { name: /Use this computer/ });
    const go = page.getByRole("button", { name: "Continue with Codex" });
    if ((await where.count()) && (await where.isEnabled())) await where.click();
    else if ((await go.count()) && (await go.isEnabled())) await go.click();
    await page.waitForTimeout(500);
  }
  throw new Error("The main window did not appear");
}

async function timed(turns: Turn[], name: string, work: () => Promise<string>): Promise<void> {
  const started = Date.now();
  try {
    const detail = await work();
    turns.push({ name, ok: true, ms: Date.now() - started, detail });
  } catch (error) {
    turns.push({ name, ok: false, ms: Date.now() - started, detail: String(error).slice(0, 400) });
  }
  const last = turns[turns.length - 1];
  console.log(`${last?.ok ? "ok  " : "FAIL"} ${name} (${Math.round((last?.ms ?? 0) / 1000)} s): ${last?.detail}`);
}

/** Sends one message through the window's API and waits for the agent's last answer of that turn. */
const CHAT = `async ({ botId, text, timeoutMs, answerCards }) => {
  const api = window.openbot.agent;
  const before = (await api.readConversation(botId)).messages.length;
  await api.sendMessage({ botId, text });
  const cards = [];
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1000));
    if (answerCards) {
      for (const item of await api.listPendingRequests()) {
        if (item.kind === "prompt" && item.botId === botId) {
          const answers = {};
          for (const q of item.questions) answers[q.id] = [q.options?.[0]?.label ?? "Yes"];
          await api.respondToPrompt({ requestId: item.requestId, answers });
          cards.push("prompt");
        } else if (item.kind === "draft-preview") {
          await api.respondToDraftPreview({ requestId: item.card.requestId, decision: "send" });
          cards.push("draft-preview");
        } else if (item.kind === "approval" && item.approval.botId === botId) {
          await api.respondToApproval({ requestId: item.approval.requestId, decision: "accept" });
          cards.push("approval:" + item.approval.kind);
        }
      }
    }
    const conversation = await api.readConversation(botId);
    if (conversation.activeTurnId) continue;
    const fresh = conversation.messages.slice(before);
    const errors = fresh.filter((m) => m.status === "failed").map((m) => m.text);
    const answer = fresh.filter((m) => m.author === "assistant").map((m) => m.text).filter(Boolean).pop();
    if (answer || errors.length) return { answer: answer ?? null, errors, cards };
  }
  return { answer: null, errors: ["timed out"], cards };
}`;

async function main(): Promise<void> {
  const root = resolve(required("COSGRAL_SANDBOX_ROOT"));
  assert(
    !resolve(repo).startsWith(root + sep) && root !== resolve(repo),
    "The sandbox must not contain the repository",
  );
  assert(existsSync(required("CODEX_HOME")), "CODEX_HOME must be an existing folder (it is used in place)");
  await rm(root, { recursive: true, force: true });
  for (const folder of [
    join(root, "home", "AppData", "Roaming"),
    join(root, "home", "AppData", "Local"),
    join(root, "tmp"),
  ])
    await mkdir(folder, { recursive: true });
  const turns: Turn[] = [];
  const startedAt = Date.now();
  const { app, page, findings } = await launch(root);
  type Status = { phase: string; cliVersion: string | null; message: string | null };
  let status: Status | null = null;
  try {
    await timed(turns, "start: first run with the real Codex CLI", async () => {
      await firstRun(page);
      for (let i = 0; i < 120; i += 1) {
        status = await page.evaluate<Status>("window.openbot.agent.getStatus()");
        if (status.phase === "ready") break;
        await page.waitForTimeout(1000);
      }
      assert(status, "no status");
      assert.equal(status.phase, "ready", `status ${status.phase}: ${status.message}`);
      return `ready, Codex CLI ${status.cliVersion}`;
    });
    const setup = await page.evaluate<{ botId: string; model: string | null; models: string[] }>(`(async () => {
      const api = window.openbot.agent;
      const models = await api.listModels();
      const codex = models.filter((m) => !String(m.id).startsWith("claude") && !String(m.id).startsWith("acp:"));
      const bot = await api.createBot();
      if (codex[0]) await api.updateBot({ botId: bot.id, model: codex[0].id, reasoningEffort: "low" });
      return { botId: bot.id, model: codex[0]?.id ?? null, models: codex.map((m) => m.id) };
    })()`);
    console.log(`     models: ${setup.models.join(", ")}; using ${setup.model}`);
    const chat = async (text: string, answerCards = false) =>
      await page.evaluate<{ answer: string | null; errors: string[]; cards: string[] }>(
        `(${CHAT})(${JSON.stringify({ botId: setup.botId, text, timeoutMs: TURN_MS, answerCards })})`,
      );

    await timed(turns, "1 chat: a one-word answer", async () => {
      const result = await chat("Reply with exactly one word: OK");
      assert(result.answer && /\bOK\b/i.test(result.answer), `answer ${JSON.stringify(result)}`);
      return `answer "${result.answer.slice(0, 60)}"`;
    });
    await timed(turns, "2 question card: the agent asks, the person answers", async () => {
      const result = await chat(
        "Use your ask_user tool to ask me one yes/no question with the options Yes and No. After I answer, reply with exactly one word: OK",
        true,
      );
      assert(result.cards.includes("prompt"), `no question card: ${JSON.stringify(result)}`);
      return `cards ${result.cards.join(", ")}; answer "${(result.answer ?? "").slice(0, 60)}"`;
    });
    await timed(turns, "3 confirm card: the agent asks before sending", async () => {
      const result = await chat(
        "Use the confirm tool of cosgral_cards with the title 'Connection test' and the preview 'OK'. After my decision, reply with exactly one word: OK",
        true,
      );
      assert(result.cards.includes("draft-preview"), `no confirm card: ${JSON.stringify(result)}`);
      return `cards ${result.cards.join(", ")}; answer "${(result.answer ?? "").slice(0, 60)}"`;
    });
    await timed(turns, "4 channel: the lead answers a task", async () => {
      const outcome = await page.evaluate<{ state: string; result: string | null }>(`(async () => {
        const api = window.openbot.channels;
        const channel = await api.create({ name: "real-" + Date.now().toString(36), title: "Real test", instructions: "Answer in one word.", memberBotIds: [${JSON.stringify(setup.botId)}], leadBotId: ${JSON.stringify(setup.botId)}, isolated: true });
        const sent = await api.sendMessage({ channelId: channel.id, text: "Reply with exactly one word: OK" });
        let task = sent.task;
        for (let i = 0; i < ${TURN_MS / 1000} && !["done", "failed", "cancelled"].includes(task.state); i += 1) {
          await new Promise((r) => setTimeout(r, 1000));
          task = (await api.listTasks(channel.id)).find((t) => t.id === sent.task.id) ?? task;
        }
        const messages = await api.listMessages({ channelId: channel.id });
        return { state: task.state, result: messages.filter((m) => m.kind === "result").map((m) => m.text).pop() ?? null };
      })()`);
      assert.equal(outcome.state, "done", JSON.stringify(outcome));
      return `task ${outcome.state}; result "${(outcome.result ?? "").slice(0, 60)}"`;
    });
  } finally {
    const report = { startedAt: new Date(startedAt).toISOString(), turns, consoleErrors: findings, status };
    await writeFile(join(root, "real-codex.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`console errors: ${findings.length}`);
    await app.close().catch(() => undefined);
  }
}

await main();
