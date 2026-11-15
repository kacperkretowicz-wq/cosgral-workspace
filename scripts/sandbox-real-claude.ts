// COSGRAL W4-T1: a connection test with the REAL Claude CLI in the sandbox program, like sandbox-real-codex.ts does
// for Codex. At most 5 short turns: a chat, a question card, a confirm card and a channel with its lead (4 turns; the
// fifth is left unused). Each turn asks for a one-word answer.
//
//   COSGRAL_SANDBOX_ROOT=<folder outside the repo>
//   COSGRAL_REAL_CLAUDE_PATH=<claude executable>
//   COSGRAL_REAL_CLAUDE_CONFIG_DIR=<the existing Claude config folder of the signed-in person; used in place>
//   node scripts/sandbox-real-claude.ts
//
// The sandbox gets its own USERPROFILE, APPDATA, LOCALAPPDATA and TEMP, so the program's data stays in the sandbox.
// The login is NOT read, copied or printed by this script: the Claude CLI reads it itself from
// CLAUDE_CONFIG_DIR (which is pointed at the person's own folder; Claude also writes its session files there).
// Nothing from the login ends up in the report: it keeps only states, versions and times, never the account's e-mail.
// If the CLI says the person is signed out, the script stops and says so; it never signs in.
// Codex is not used: CODEX_HOME and the Codex path are removed so no other account can leak in.
// Run `bun run build` first, and run this with Node (Playwright's Electron launcher does not finish under Bun).

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { type ElectronApplication, _electron as electron, type Page } from "playwright";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TURN_MS = 240_000;

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
  delete env.CODEX_HOME;
  Object.assign(env, {
    USERPROFILE: home,
    HOME: home,
    APPDATA: join(home, "AppData", "Roaming"),
    LOCALAPPDATA: join(home, "AppData", "Local"),
    TEMP: join(root, "tmp"),
    TMP: join(root, "tmp"),
    OPENBOT_CLAUDE_PATH: required("COSGRAL_REAL_CLAUDE_PATH"),
    OPENBOT_CODEX_PATH: join(root, "no-codex.exe"),
    CLAUDE_CONFIG_DIR: required("COSGRAL_REAL_CLAUDE_CONFIG_DIR"),
  });
  const app = await electron.launch({
    executablePath: join(repo, "node_modules", "electron", "dist", "electron.exe"),
    args: [repo],
    cwd: repo,
    env,
    timeout: 90_000,
  });
  const findings: string[] = [];
  await app.firstWindow();
  let page: Page | undefined;
  for (let attempt = 0; attempt < 120 && !page; attempt += 1) {
    page = app.windows().find((window) => /^openbot-app:/.test(window.url()) && !/#(dock|island)/.test(window.url()));
    if (!page) await new Promise((done) => setTimeout(done, 500));
  }
  if (!page) throw new Error("The main window did not open");
  page.on("console", (message) => {
    if (message.type() === "error") findings.push(message.text().slice(0, 300));
  });
  page.on("pageerror", (error) => findings.push(`pageerror: ${error.message.slice(0, 300)}`));
  await page.waitForLoadState("domcontentloaded");
  return { app, page, findings };
}

/** Goes through the first-run screens and chooses Claude as the provider. */
async function firstRun(page: Page): Promise<void> {
  const pages = page.getByRole("navigation", { name: "Pages" });
  for (let round = 0; round < 240; round += 1) {
    if (await pages.count()) return;
    const where = page.getByRole("button", { name: /Use this computer/ });
    const setup = page.getByRole("dialog", { name: "Set up this computer" });
    if ((await where.count()) && (await where.isEnabled())) await where.click();
    else if (await setup.count()) {
      const claude = setup.getByRole("radio", { name: /^Claude/ });
      if ((await claude.count()) && (await claude.isEnabled().catch(() => false))) await claude.check({ force: true }).catch(() => undefined);
      const go = setup.getByRole("button", { name: /^Continue with/ });
      if ((await go.count()) && (await go.isEnabled())) await go.click();
    }
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

interface Safe {
  phase: string;
  cliVersion: string | null;
  message: string | null;
  providers: Array<{ id: string; state: string; version: string | null; message: string | null }>;
}

/** The program's status without anything that names the account. */
const SAFE_STATUS = `window.openbot.agent.getStatus().then((s) => ({
  phase: s.phase,
  cliVersion: s.cliVersion,
  message: s.message,
  providers: (s.providers || []).map((p) => ({ id: p.id, state: p.state, version: p.version, message: p.message })),
}))`;

async function main(): Promise<void> {
  const root = resolve(required("COSGRAL_SANDBOX_ROOT"));
  assert(!resolve(repo).startsWith(root + sep) && root !== resolve(repo), "The sandbox must not contain the repository");
  assert(existsSync(required("COSGRAL_REAL_CLAUDE_PATH")), "COSGRAL_REAL_CLAUDE_PATH must be the Claude executable");
  assert(existsSync(required("COSGRAL_REAL_CLAUDE_CONFIG_DIR")), "COSGRAL_REAL_CLAUDE_CONFIG_DIR must be an existing folder (used in place)");
  await rm(root, { recursive: true, force: true });
  for (const folder of [join(root, "home", "AppData", "Roaming"), join(root, "home", "AppData", "Local"), join(root, "tmp")]) {
    await mkdir(folder, { recursive: true });
  }
  const turns: Turn[] = [];
  const startedAt = Date.now();
  const { app, page, findings } = await launch(root);
  let status: Safe | null = null;
  let signedOut = false;
  try {
    await timed(turns, "start: first run with the real Claude CLI", async () => {
      await firstRun(page);
      for (let i = 0; i < 150; i += 1) {
        status = await page.evaluate<Safe>(SAFE_STATUS);
        const claude = status.providers.find((provider) => provider.id === "claude");
        if (claude?.state === "sign-in-required") {
          signedOut = true;
          throw new Error("Claude CLI reports: Sign in required. The person must run `claude auth login`; this script does not sign in.");
        }
        if (status.phase === "ready" && claude?.state === "available") break;
        await page.waitForTimeout(1000);
      }
      assert(status, "no status");
      const claude = status.providers.find((provider) => provider.id === "claude");
      assert.equal(status.phase, "ready", `phase ${status.phase}: ${status.message}`);
      assert.equal(claude?.state, "available", `claude ${claude?.state}: ${claude?.message}`);
      return `ready, Claude CLI ${claude?.version ?? status.cliVersion}`;
    });
    if (signedOut || turns[0]?.ok !== true) return;

    const setup = await page.evaluate<{ botId: string; model: string | null; models: string[] }>(`(async () => {
      const api = window.openbot.agent;
      const models = (await api.listModels()).filter((m) => String(m.id).startsWith("claude"));
      const pick = models.find((m) => /sonnet/.test(m.id)) ?? models[0];
      const bot = await api.createBot();
      if (pick) await api.updateBot({ botId: bot.id, model: pick.id, reasoningEffort: "low" });
      return { botId: bot.id, model: pick?.id ?? null, models: models.map((m) => m.id) };
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
    if (turns.at(-1)?.ok !== true && /sign in|log ?in|authenticat|credential|401/i.test(turns.at(-1)?.detail ?? "")) {
      console.log("     The first turn failed like a sign-in problem: stopping (the person runs `claude auth login`).");
      signedOut = true;
      return;
    }
    await timed(turns, "2 question card: the agent asks, the person answers", async () => {
      const result = await chat(
        "Use your AskUserQuestion tool (or the ask_user tool of the openbot server) to ask me one yes/no question with the options Yes and No. After I answer, reply with exactly one word: OK",
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
    const report = { startedAt: new Date(startedAt).toISOString(), signedOut, turns, consoleErrors: findings, status };
    await writeFile(join(root, "real-claude.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`console errors: ${findings.length}`);
    await app.close().catch(() => undefined);
  }
}

await main();
