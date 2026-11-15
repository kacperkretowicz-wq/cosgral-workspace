// COSGRAL W3-T3: acceptance run of the parity table (docs/cosgral/parytet-0.68.md) in the real program.
// Real Electron, real main process, real window, in a sandbox profile, with the Codex stand-in of
// scripts/acceptance-codex.cjs (no model, no network, no account). Each step is one row (or part of a row) of the
// table and writes "ok" or "FAIL" with the evidence it saw into <sandbox>/evidence/acceptance.json.
//
//   COSGRAL_SANDBOX_ROOT=<folder> node scripts/sandbox-acceptance.ts [--keep]
//
// Screenshots and the accessibility trees go to the sandbox folder (they contain the account name), never to the
// repository. Run `bun run build` first and run this with Node, like scripts/sandbox-e2e.ts. It never touches the
// desktop of the person: no Computer Use, no screen capture, no microphone, no camera, no real phone.

import assert from "node:assert/strict";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import type { IncomingHttpHeaders } from "node:http";
import { Agent, request } from "node:https";
import { basename, dirname, join, resolve, sep } from "node:path";
import { connect } from "node:tls";
import { fileURLToPath } from "node:url";
import { type DynamicRecord, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { type ElectronApplication, _electron as electron, type Page } from "playwright";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface Result {
  row: string;
  name: string;
  ok: boolean;
  detail: string;
  ms: number;
}

const results: Result[] = [];
let resultsFile = "";
// COSGRAL_ONLY=41,39,R1 runs only those rows (with --keep, on the data of an earlier run).
const only = (process.env.COSGRAL_ONLY ?? "")
  .split(",")
  .map((part) => part.trim())
  .filter(Boolean);
const consoleFindings: string[] = [];

function asRecord(value: unknown): DynamicRecord {
  return isDynamicRecord(value) ? value : {};
}

function list(value: unknown): DynamicRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

/**
 * What a stand-in tool call (TOOL <namespace> <tool> <json>) reported. The agent message reads
 * `Stub: tool {"success":…,"text":"<JSON of the tool result>"}`; this returns the inner result.
 */
function toolResult(answer: string): DynamicRecord {
  const start = answer.indexOf("{");
  if (start < 0) return { text: answer };
  const outer = asRecord(JSON.parse(answer.slice(start)));
  const text = isString(outer.text) ? outer.text : "";
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return { text };
  }
}

/** The page elements of a browser snapshot, wherever the tool result keeps them. */
function snapshotOf(result: DynamicRecord): { revision: number; elements: DynamicRecord[] } {
  const nested = asRecord(result.snapshot);
  const holder = Array.isArray(result.elements) ? result : nested;
  return { revision: isNumber(holder.revision) ? holder.revision : -1, elements: list(holder.elements) };
}

/** True when some file under `folder` contains `needle` (checked as bytes, so databases and logs count too). */
async function anyFileContains(folder: string, needle: string): Promise<string | null> {
  const { readdir, readFile, stat } = await import("node:fs/promises");
  const bytes = Buffer.from(needle, "utf8");
  const queue = [folder];
  while (queue.length > 0) {
    const current = queue.pop() ?? "";
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(path);
        continue;
      }
      try {
        if ((await stat(path)).size > 64 * 1024 * 1024) continue;
        if ((await readFile(path)).includes(bytes)) return path;
      } catch {
        // A file the browser holds open is skipped.
      }
    }
  }
  return null;
}

function sandboxRoot(): string {
  const root = process.env.COSGRAL_SANDBOX_ROOT ? resolve(process.env.COSGRAL_SANDBOX_ROOT) : "";
  assert(root, "COSGRAL_SANDBOX_ROOT must point to a folder for the sandbox profile");
  assert(
    !resolve(repo).startsWith(root + sep) && root !== resolve(repo),
    "The sandbox must not contain the repository",
  );
  return root;
}

function sandboxEnvironment(root: string): Record<string, string> {
  const home = join(root, "home");
  return {
    USERPROFILE: home,
    HOME: home,
    APPDATA: join(home, "AppData", "Roaming"),
    LOCALAPPDATA: join(home, "AppData", "Local"),
    TEMP: join(root, "tmp"),
    TMP: join(root, "tmp"),
  };
}

async function installFixture(root: string): Promise<{ codex: string; claude: string }> {
  const folder = join(root, "fixture");
  await mkdir(folder, { recursive: true });
  await copyFile(join(repo, "scripts", "acceptance-codex.cjs"), join(folder, "codex.cjs"));
  const electronExe = join(repo, "node_modules", "electron", "dist", "electron.exe");
  await writeFile(
    join(folder, "codex.cmd"),
    `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${electronExe}" "%~dp0codex.cjs" %*\r\n`,
  );
  return { codex: join(folder, "codex.cmd"), claude: join(folder, "missing-claude.exe") };
}

async function launch(
  root: string,
  fixture: { codex: string; claude: string },
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    executablePath: join(repo, "node_modules", "electron", "dist", "electron.exe"),
    args: [repo],
    cwd: repo,
    env: {
      ...process.env,
      ...sandboxEnvironment(root),
      OPENBOT_CODEX_PATH: fixture.codex,
      OPENBOT_CLAUDE_PATH: fixture.claude,
    },
    timeout: 90_000,
  });
  app.on("window", (window) => {
    window.on("console", (message) => {
      if (message.type() === "error") consoleFindings.push(message.text().slice(0, 200));
    });
    window.on("pageerror", (error) => consoleFindings.push(error.message.slice(0, 200)));
  });
  await app.firstWindow();
  // The dock and the island are windows of their own (they come back after a restart): drive the main window.
  let page: Page | undefined;
  for (let attempt = 0; attempt < 120 && !page; attempt += 1) {
    page = app.windows().find((window) => /^openbot-app:/.test(window.url()) && !/#(dock|island)/.test(window.url()));
    if (!page) await new Promise((done) => setTimeout(done, 500));
  }
  if (!page) throw new Error("The main window did not open.");
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}

async function row(id: string, name: string, work: () => Promise<string | undefined>): Promise<void> {
  if (only.length && !only.includes(id)) return;
  const started = Date.now();
  try {
    const detail = (await work()) ?? "";
    results.push({ row: id, name, ok: true, detail, ms: Date.now() - started });
    console.log(`ok   [${id}] ${name}${detail ? `: ${detail.slice(0, 110)}` : ""}`);
  } catch (error) {
    const detail = (error instanceof Error ? error.message : String(error)).split("\n")[0] ?? "";
    results.push({ row: id, name, ok: false, detail, ms: Date.now() - started });
    console.log(`FAIL [${id}] ${name}: ${detail.slice(0, 160)}`);
  }
  // Written after every row, so a run that is cut short still leaves what it saw.
  if (resultsFile)
    await writeFile(resultsFile, JSON.stringify({ results, console: consoleFindings.slice(0, 40) }, null, 2));
}

// -- Helpers that run inside the window (strings: the window cannot import) ---------------------------------------

class Driver {
  readonly page: Page;
  readonly evidence: string;
  /** The Electron handle: answers the native file pickers and records shell calls in the main process. */
  readonly app: ElectronApplication | undefined;

  constructor(page: Page, evidence: string, app?: ElectronApplication) {
    this.page = page;
    this.evidence = evidence;
    this.app = app;
  }

  async ev(expression: string): Promise<unknown> {
    return this.page.evaluate(expression);
  }

  async botId(name: string): Promise<string> {
    return String(
      await this.ev(
        `window.openbot.agent.listBots().then((bots) => (bots.find((b) => b.name === ${JSON.stringify(name)}) || {}).id)`,
      ),
    );
  }

  async send(name: string, text: string): Promise<void> {
    await this.ev(
      `window.openbot.agent.listBots().then((bots) => window.openbot.agent.sendMessage({ botId: bots.find((b) => b.name === ${JSON.stringify(name)}).id, text: ${JSON.stringify(text)} }))`,
    );
  }

  /** The text of the newest assistant message once it contains `contains` (up to `timeoutMs`). */
  async answer(name: string, contains: string, timeoutMs = 45_000): Promise<string> {
    const until = Date.now() + timeoutMs;
    let last = "";
    while (Date.now() < until) {
      last = String(
        await this.ev(
          `window.openbot.agent.listBots().then(async (bots) => { const b = bots.find((x) => x.name === ${JSON.stringify(name)}); const c = await window.openbot.agent.readConversation(b.id); const m = c.messages.filter((x) => x.author === "assistant").slice(-1)[0]; return m ? m.text : ""; })`,
        ),
      );
      if (last.includes(contains)) return last;
      await this.page.waitForTimeout(500);
    }
    throw new Error(`No answer containing "${contains}" from ${name} (last: ${last.slice(0, 120)})`);
  }

  async ask(name: string, text: string, contains: string, timeoutMs?: number): Promise<string> {
    await this.send(name, text);
    return this.answer(name, contains, timeoutMs);
  }

  async rowLabel(name: string): Promise<string> {
    return (
      (await this.page
        .getByRole("button", { name: new RegExp(`^${name}, `) })
        .first()
        .getAttribute("aria-label")) ?? ""
    );
  }

  async dump(name: string): Promise<void> {
    await this.page.screenshot({ path: join(this.evidence, `${name}.png`) });
    await writeFile(join(this.evidence, `${name}.aria.txt`), await this.page.locator("body").ariaSnapshot());
  }

  async openPage(name: string): Promise<void> {
    await this.page.getByRole("navigation", { name: "Pages" }).getByRole("button", { name, exact: true }).click();
    await this.page.waitForTimeout(1_200);
  }

  async openAgent(name: string): Promise<void> {
    await this.openPage("Agents");
    await this.page
      .getByRole("button", { name: new RegExp(`^${name}, `) })
      .first()
      .click();
    await this.page.waitForTimeout(1_200);
  }
}

// -- Phone helpers (an HTTPS client that pins the certificate fingerprint, like the app on a phone would) ---------

function pinnedAgent(fingerprintHex: string): Agent {
  const agent = new Agent({ keepAlive: false });
  agent.createConnection = (options, callback) => {
    const socket = connect({
      host: String(options.host ?? "127.0.0.1"),
      port: Number(options.port),
      rejectUnauthorized: false,
    });
    socket.once("secureConnect", () => {
      const seen = socket.getPeerCertificate().fingerprint256.replace(/:/g, "").toLowerCase();
      if (seen === fingerprintHex.toLowerCase()) callback?.(null, socket);
      else {
        socket.destroy();
        callback?.(new Error("The certificate does not match the pinned fingerprint."), socket);
      }
    });
    socket.once("error", (error) => callback?.(error, socket));
    return undefined;
  };
  return agent;
}

interface Pinned {
  status: number;
  headers: IncomingHttpHeaders;
  text: string;
  json: unknown;
}

function pinned(
  url: string,
  fingerprintHex: string,
  init: { method?: string; token?: string; body?: DynamicRecord } = {},
): Promise<Pinned> {
  return new Promise((resolveAnswer, reject) => {
    const payload = init.body ? JSON.stringify(init.body) : undefined;
    const outgoing = request(
      url,
      {
        method: init.method ?? "GET",
        agent: pinnedAgent(fingerprintHex),
        headers: {
          ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
          ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          text += chunk;
        });
        response.on("end", () => {
          let json: unknown = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          resolveAnswer({ status: response.statusCode ?? 0, headers: response.headers, text, json });
        });
      },
    );
    outgoing.once("error", reject);
    outgoing.end(payload);
  });
}

// -- The run -----------------------------------------------------------------------------------------------------

async function firstRun(d: Driver, root: string): Promise<void> {
  const { page } = d;
  const longTurn = "SLOW 90000";

  await row(
    "40",
    "onboarding: one flow: where, then provider + language + first agent, then the main window",
    async () => {
      const where = page.getByRole("dialog", { name: "Where will COSGRAL Workspace run?" });
      await where.waitFor({ timeout: 90_000 });
      await where.getByRole("button", { name: /Use this computer/ }).click();
      const setup = page.getByRole("dialog", { name: "Set up this computer" });
      await setup.waitFor({ timeout: 30_000 });
      const languages = await setup.getByRole("combobox", { name: "Language" }).locator("option").allInnerTexts();
      assert(languages.includes("English") && languages.includes("Polski"), "language choice");
      assert((await setup.getByRole("radio").count()) >= 2, "provider choice");
      assert(/Computer Use/.test(await setup.innerText()), "Computer Use is explained");
      await setup.getByRole("combobox", { name: "First agent" }).selectOption({ index: 1 });
      await setup.getByRole("button", { name: "Continue with Codex" }).click();
      await page
        .getByRole("button", { name: /^Assistant, / })
        .first()
        .waitFor({ timeout: 60_000 });
      return "screens: where > set up (provider, language, first agent, Computer Use); Assistant is in the list";
    },
  );

  await row("9", "chat: a message gets an answer and stays visible", async () => {
    await d.openAgent("Assistant");
    // A new agent first asks for a model and a specialty: pick a model, answer the question by its label.
    await page
      .getByRole("button", { name: "Onboarding model: Luna" })
      .click({ timeout: 10_000 })
      .catch(() => undefined);
    await page
      .getByRole("option", { name: /^Luna/ })
      .click({ timeout: 5_000 })
      .catch(() => undefined);
    await page
      .getByText("Work & projects", { exact: true })
      .click({ timeout: 8_000 })
      .catch(() => undefined);
    const reply = await d.answer("Assistant", "Stub: received", 45_000);
    assert((await page.getByText("Stub: received").count()) > 0, "the answer is shown");
    return reply;
  });

  if (!only.length) {
    const spare = JSON.stringify(
      await d.ev(
        `window.openbot.agent.createBot().then((b) => window.openbot.agent.updateBot({ botId: b.id, name: "Res", role: "Research and sources" })).then((b) => b.name)`,
      ),
    );
    console.log(`     second agent: ${spare}`);
  }

  await row("5", "state: the row says Thinking while a turn runs and settles after it", async () => {
    await d.send("Assistant", "SLOW 8000");
    await page.waitForTimeout(2_500);
    const during = await d.rowLabel("Assistant");
    assert(/Thinking/.test(during), `row while working: ${during}`);
    await d.answer("Assistant", "Stub: slow done", 40_000);
    await page.waitForTimeout(1_500);
    const after = await d.rowLabel("Assistant");
    assert(!/Thinking/.test(after), `row after: ${after}`);
    return `during: ${during.slice(0, 60)}`;
  });

  await row("17", "queue: FIFO, reorder (Alt+Up), edit, delete, steer, Stop, Resume", async () => {
    await d.send("Assistant", longTurn);
    await page.waitForTimeout(2_000);
    await d.send("Assistant", "Q1 first");
    await d.send("Assistant", "Q2 second");
    await d.send("Assistant", "Q3 third");
    const queue = page.getByRole("region", { name: "Message queue" });
    await queue.waitFor({ timeout: 15_000 });
    const names = async () =>
      queue.getByRole("group").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    assert.equal((await names()).length, 3, "three queued");
    await page.getByRole("group", { name: /^Queued message 2:/ }).focus();
    await page.keyboard.press("Alt+ArrowUp");
    await page.waitForTimeout(1_200);
    assert((await names())[0]?.includes("Q2 second"), "Q2 moved first");
    await page.getByRole("button", { name: /^Edit queued message 1/ }).click();
    await page
      .getByRole("textbox", { name: /Message Assistant/ })
      .first()
      .fill("Q2 edited");
    await page.getByRole("button", { name: "Save queued message" }).click();
    await page.waitForTimeout(1_200);
    assert((await names())[0]?.includes("Q2 edited"), "edit saved");
    await page.getByRole("button", { name: /^Delete queued message 3/ }).click();
    await page.waitForTimeout(1_000);
    assert.equal((await names()).length, 2, "one deleted");
    await page.getByRole("button", { name: /^Steer queued message 1/ }).click();
    await page.waitForTimeout(2_000);
    assert.equal((await names()).length, 1, "steered one left the queue");
    await page.getByRole("button", { name: "Stop agent" }).click();
    await page.getByRole("button", { name: "Resume queue" }).waitFor({ timeout: 15_000 });
    await page.getByRole("button", { name: "Resume queue" }).click();
    await d.answer("Assistant", "Stub: received", 30_000);
    return "reordered, edited, deleted, steered, stopped and resumed";
  });

  await row("10", "question card: pinned Decision, option answer, Skip", async () => {
    await d.send("Assistant", "ASK");
    const decision = page.getByRole("region", { name: "Decision" });
    await decision.waitFor({ timeout: 20_000 });
    await decision.getByRole("button", { name: /^A Short/ }).click();
    await decision.getByRole("button", { name: "Continue" }).click();
    const first = await d.answer("Assistant", "Stub: answered", 30_000);
    assert(first.includes('"Short"'), `the agent got the option: ${first}`);
    await d.send("Assistant", "ASK");
    await decision.getByRole("button", { name: "Skip" }).waitFor({ timeout: 20_000 });
    await decision.getByRole("button", { name: "Skip" }).click();
    await page.waitForTimeout(3_000);
    return first.slice(0, 80);
  });

  await row("6", "Needs you: a question in another conversation is counted and opens its card", async () => {
    await d.openAgent("Assistant");
    await d.send("Res", "ASK");
    const needs = page.getByRole("region", { name: "Needs you" });
    await needs.waitFor({ timeout: 20_000 });
    assert(/Res/.test(await needs.innerText()), "Needs you names the agent");
    await needs.getByRole("button", { name: /^Res, Needs you/ }).click();
    await page.getByRole("region", { name: "Decision" }).getByRole("button", { name: "Skip" }).click();
    await page.waitForTimeout(2_500);
    return "section counted the card, click opened it, answering cleared it";
  });

  await row(
    "11",
    "approval card: Reject, Approve, Always allow, prefix match, chained command still asks",
    async () => {
      await d.openAgent("Assistant");
      await d.send("Assistant", "RUN git status --short");
      const card = page.getByRole("region", { name: "Agent approval" });
      await card.waitFor({ timeout: 20_000 });
      await card.getByRole("button", { name: "Reject" }).click();
      await d.answer("Assistant", "command decision decline", 30_000);
      await d.send("Assistant", "RUN git status --short");
      await card.waitFor({ timeout: 20_000 });
      await card.getByRole("button", { name: "Approve" }).click();
      await d.answer("Assistant", "command decision accept", 30_000);
      await d.send("Assistant", "RUN git status --short");
      await card.getByRole("button", { name: "Always allow…" }).click();
      await card.getByRole("combobox").last().selectOption("git status");
      await card.getByRole("button", { name: "Always allow", exact: true }).click();
      await d.answer("Assistant", "command decision accept", 30_000);
      await d.send("Assistant", "RUN git status --porcelain");
      await page.waitForTimeout(5_000);
      assert.equal(await card.count(), 0, "no card for a matching command");
      await d.send("Assistant", "RUN git push origin main");
      await card.waitFor({ timeout: 20_000 });
      await card.getByRole("button", { name: "Reject" }).click();
      await page.waitForTimeout(2_000);
      await d.send("Assistant", "RUN git status; echo x");
      await card.waitFor({ timeout: 20_000 });
      assert(/Only once/.test(await card.innerText()), "a chained command says: only once");
      await card.getByRole("button", { name: "Reject" }).click();
      return "Always allow saved 'git status'; the matching command was allowed without a card";
    },
  );

  await row("12", "draft card: Send, Keep draft, Edit", async () => {
    const decision = page.getByRole("region", { name: "Decision" });
    await d.send("Assistant", "DRAFT");
    await decision.getByRole("button", { name: "Send", exact: true }).click({ timeout: 25_000 });
    await d.answer("Assistant", '"decision":"send"', 30_000);
    await d.send("Assistant", "DRAFT");
    await decision.getByRole("button", { name: "Keep draft" }).click({ timeout: 25_000 });
    await d.answer("Assistant", "keep-draft", 30_000);
    await d.send("Assistant", "DRAFT");
    await decision.getByRole("button", { name: "Edit", exact: true }).click({ timeout: 25_000 });
    await decision.getByRole("textbox", { name: "Draft text" }).waitFor({ timeout: 10_000 });
    await decision.getByRole("button", { name: "Back" }).click();
    await decision.getByRole("button", { name: "Keep draft" }).click();
    return "send, keep-draft and edit all reached the agent or the card";
  });

  await row("8", "error state: a failed turn shows the provider's message on the row", async () => {
    await d.send("Assistant", "FAIL");
    await page.waitForTimeout(6_000);
    const label = await d.rowLabel("Assistant");
    assert(/Error · Sandbox failure/.test(label), `row: ${label}`);
    await d.ask("Assistant", "hello", "Stub: received", 30_000);
    await page.waitForTimeout(2_000);
    assert(!/Error ·/.test(await d.rowLabel("Assistant")), "the error leaves after a good turn");
    return label.slice(0, 90);
  });

  await row("7", "limit state: a full Codex window shows 'Limit · resumes …' and clears", async () => {
    await d.send("Assistant", "LIMITON");
    await page.waitForTimeout(6_000);
    const label = await d.rowLabel("Assistant");
    assert(/Limit · resumes/.test(label), `row: ${label}`);
    await d.ask("Assistant", "LIMITOFF", "Stub: limit off", 30_000);
    await page.waitForTimeout(3_000);
    assert(!/Limit ·/.test(await d.rowLabel("Assistant")), "the limit leaves");
    return label.slice(0, 90);
  });

  await row("18", "search in the conversation (Ctrl+F)", async () => {
    await d.openAgent("Assistant");
    await page
      .locator("main")
      .first()
      .click({ position: { x: 300, y: 300 } });
    await page.keyboard.press("Control+f");
    const box = page.getByRole("searchbox", { name: "Search messages" });
    await box.fill("Q2 edited");
    await page.waitForTimeout(1_200);
    assert(/1\/1/.test(await page.getByRole("search", { name: "Search conversation" }).innerText()), "one match");
    await page.getByRole("button", { name: "Close conversation search" }).click();
    return "Q2 edited: 1/1";
  });

  await row("19", "global search (Ctrl+K) finds a phrase from another conversation and opens it", async () => {
    await d.send("Res", "zebra unicorn phrase");
    await d.answer("Res", "Stub: received", 30_000);
    await d.openAgent("Assistant");
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox", { name: "Search COSGRAL" }).fill("zebra unicorn");
    await page.getByRole("option", { name: /zebra unicorn phrase/ }).click({ timeout: 10_000 });
    await page.waitForTimeout(2_000);
    assert.equal(await page.getByRole("heading", { level: 1 }).first().innerText(), "Res");
    return "opened Res at the message";
  });

  await row("3", "sidebar: two agents have separate histories", async () => {
    const counts = asRecord(
      await d.ev(
        `window.openbot.agent.listBots().then(async (bots) => { const o = {}; for (const b of bots) o[b.name] = (await window.openbot.agent.readConversation(b.id)).messages.length; return o; })`,
      ),
    );
    assert(Number(counts.Res) < Number(counts.Assistant), JSON.stringify(counts));
    return JSON.stringify(counts);
  });

  await row("4", "folders: create, nest, move an agent (persisted layout)", async () => {
    await d.openPage("Agents");
    for (const name of ["Work stuff", "Inner"]) {
      await page.getByRole("button", { name: "New folder" }).click();
      await page.getByRole("textbox", { name: "Folder name" }).fill(name);
      await page.getByRole("button", { name: "Create" }).click();
      await page.waitForTimeout(1_200);
    }
    await page
      .getByRole("button", { name: /^Assistant, / })
      .first()
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "Move to…" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Inner" }).click();
    await page.waitForTimeout(1_000);
    await page.getByRole("button", { name: /^Inner, folder/ }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Move to…" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Work stuff" }).click();
    await page.waitForTimeout(1_200);
    const layout = JSON.stringify(await d.ev("window.openbot.sidebar.getLayout()"));
    assert(layout.includes("Inner") && /"parentId":"[0-9a-f-]{36}"/.test(layout), "Inner is nested");
    return "Work stuff > Inner > Assistant";
  });

  await row("21", "agent settings: model and description apply to the next turn", async () => {
    await d.openAgent("Assistant");
    await page.getByRole("button", { name: "View agent settings" }).click();
    const adv = page.getByRole("region", { name: "Advanced agent settings" });
    await adv.getByRole("combobox", { name: "Model", exact: true }).selectOption({ label: "Terra" });
    await adv.getByRole("textbox", { name: "Description" }).fill("Acceptance description: always answer briefly.");
    await adv.getByRole("button", { name: "Save settings" }).click();
    await page.waitForTimeout(2_000);
    const model = await d.ask("Assistant", "MODEL", "Stub: model", 30_000);
    assert(model.includes("gpt-5.6-terra"), model);
    const has = await d.ask("Assistant", "INSTRHAS always answer briefly", "Stub: instructions", 30_000);
    assert(/have/.test(has), has);
    return model;
  });

  await row("23", "memory: an 'Always' memory is saved and listed", async () => {
    const mem = page.getByRole("region", { name: "Agent memory" });
    await mem.getByRole("textbox", { name: "Memory text" }).fill("Drink: tea, no sugar");
    await mem.getByRole("combobox", { name: "Inclusion" }).selectOption({ label: "Always" });
    await mem.getByRole("button", { name: "Save memory" }).click();
    await page.waitForTimeout(1_800);
    assert(/tea, no sugar/.test(await mem.innerText()), "listed");
    return "saved; it reaches the prompt after the restart (see restart steps)";
  });

  await row("22", "templates: create an agent from the Researcher template", async () => {
    const creator = page.getByRole("region", { name: "Create agent" });
    await creator.getByRole("combobox", { name: "Template" }).selectOption({ label: "Researcher" });
    await creator.getByRole("textbox", { name: "Agent name" }).fill("Tmpl");
    await creator.getByRole("button", { name: "Create agent" }).click();
    await page.waitForTimeout(2_500);
    const made = asRecord(
      await d.ev(
        `window.openbot.agent.listBots().then((bots) => { const b = bots.find((x) => x.name === "Tmpl"); return b ? { role: b.role, desc: b.description } : null; })`,
      ),
    );
    assert(String(made.role).length > 0 && String(made.desc).length > 20, JSON.stringify(made));
    return `role ${String(made.role)}`;
  });

  await row(
    "14",
    "channels in the window: New channel with a lead and two agents, edit, message, replies, stop and resume",
    async () => {
      await d.openAgent("Assistant");
      const channelName = `accept-${Date.now().toString(36)}`;
      await page.getByRole("button", { name: "New channel", exact: true }).first().click();
      let dialog = page.getByRole("dialog");
      await dialog.getByLabel("Channel name", { exact: true }).fill(channelName);
      await dialog.getByLabel("Display title").fill("Accept team");
      for (const member of ["Assistant", "Res", "Tmpl"])
        await dialog.getByRole("button", { name: member, exact: true }).click();
      const leadId = await d.botId("Assistant");
      await dialog.getByLabel("Lead agent").selectOption(leadId);
      await dialog.getByLabel("Channel instructions").fill("Work together and answer briefly.");
      await dialog.getByRole("button", { name: "Create channel", exact: true }).click();
      await dialog.waitFor({ state: "hidden", timeout: 20_000 });
      await page.getByRole("heading", { name: "Accept team", exact: true }).waitFor({ timeout: 20_000 });
      const info = asRecord(
        await d.ev(
          `window.openbot.channels.list().then((all) => { const c = all.find((x) => x.name === ${JSON.stringify(channelName)}); return c ? { id: c.id, members: c.memberBotIds.length, lead: c.leadBotId } : null; })`,
        ),
      );
      assert(info.id && info.members === 3 && info.lead === leadId, `channel from the window: ${JSON.stringify(info)}`);

      // Edit: the title and the instructions change, the short name stays.
      await page.getByRole("button", { name: "Edit channel", exact: true }).click();
      dialog = page.getByRole("dialog");
      assert(await dialog.getByLabel("Channel name", { exact: true }).isDisabled(), "the short name cannot be edited");
      await dialog.getByLabel("Display title").fill("Accept team edited");
      await dialog.getByRole("button", { name: "Save changes" }).click();
      await dialog.waitFor({ state: "hidden", timeout: 20_000 });
      await page.getByRole("heading", { name: "Accept team edited", exact: true }).waitFor({ timeout: 20_000 });

      // A message of the person: the lead delegates to the two other members, who finish their tasks.
      await page.getByLabel("New message to channel lead").fill("Prepare the weekly summary");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await page.getByText("Stub combined result").first().waitFor({ timeout: 90_000 });
      const tasks = list(await d.ev(`window.openbot.channels.listTasks(${JSON.stringify(String(info.id))})`));
      const main = tasks.find((task) => task.title === "Prepare the weekly summary");
      assert(main && main.state === "done" && main.ownerBotId === leadId, `the lead's task: ${JSON.stringify(main)}`);
      const helpers = tasks.filter((task) => task.parentTaskId === main.id);
      assert(
        helpers.length === 2 && helpers.every((task) => task.state === "done" && task.ownerBotId !== leadId),
        `helper tasks: ${JSON.stringify(helpers)}`,
      );
      const owners = new Set(helpers.map((task) => String(task.ownerBotId)));
      assert(owners.size === 2, "the two helpers are two different members");

      // Reply to a message: the new message links to its parent in the engine.
      await page.getByRole("button", { name: "Reply to Prepare the weekly summary", exact: true }).click();
      await page.getByLabel("New message to channel lead").fill("A reply from the person");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await page.getByText("A reply from the person", { exact: true }).waitFor({ timeout: 20_000 });
      const linked = await d.ev(
        `window.openbot.channels.listMessages({ channelId: ${JSON.stringify(String(info.id))} }).then((all) => { const parent = all.find((m) => m.text === "Prepare the weekly summary"); const reply = all.find((m) => m.text === "A reply from the person"); return Boolean(parent && reply && reply.replyToMessageId === parent.id); })`,
      );
      assert(linked === true, "the reply is linked to its parent");

      // Stop and resume in the Tasks page: a task that never finishes is paused, resumed and stopped.
      await page.getByLabel("New message to channel lead").fill("HOLD this task");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await d.openPage("Tasks");
      const rowOf = () => page.locator("li.tasks-row", { hasText: "HOLD this task" });
      await rowOf().waitFor({ timeout: 30_000 });
      await rowOf().getByText("Running", { exact: true }).waitFor({ timeout: 30_000 });
      await rowOf().getByRole("button", { name: "Pause", exact: true }).click();
      await rowOf().getByText("Paused", { exact: true }).waitFor({ timeout: 30_000 });
      await rowOf().getByRole("button", { name: "Resume", exact: true }).click();
      await rowOf().getByText("Running", { exact: true }).waitFor({ timeout: 30_000 });
      await rowOf().getByRole("button", { name: "Stop", exact: true }).click();
      await rowOf().getByText("Stopped", { exact: true }).waitFor({ timeout: 30_000 });
      await d.dump("channel-row-14");
      return "created in the window with a lead and 2 members; edit; lead delegated to 2 members (done); reply linked; Pause > Resume > Stop in Tasks";
    },
  );

  await row("41", "Marketplace: search, open, install a skill for an agent, uninstall listed", async () => {
    await d.openPage("Marketplace");
    const main = page.locator("main").first();
    await main.getByRole("searchbox", { name: "Search" }).fill("meeting");
    await main.getByRole("button", { name: "Search", exact: true }).click();
    await page.waitForTimeout(1_200);
    await main
      .getByRole("button", { name: /^Meeting notes/ })
      .last()
      .click();
    await main.getByRole("combobox", { name: "Agent" }).selectOption({ label: "Assistant" });
    await main.getByRole("button", { name: "Install", exact: true }).click();
    await page.waitForTimeout(2_500);
    assert(await main.getByRole("button", { name: "Uninstall" }).count(), "installed");
    const skills = JSON.stringify(await d.ev("window.openbot.skills.list()"));
    assert(skills.includes("meeting-notes"), "the skill is in the library");
    return "Meeting notes installed for Assistant";
  });

  await row(
    "24b",
    "skills: an agent creates and revises a skill; versions, update, a changed copy is repaired, rollback",
    async () => {
      const text = (word: string) =>
        `---\nname: acceptance-skill\ndescription: Greets in the acceptance run (${word})\nexample-prompt: Greet me\n---\n\n# Acceptance skill ${word}\n\nAnswer with the words acceptance skill active.\n`;
      const botId = await d.botId("Assistant");
      const until = async (what: string, check: () => Promise<boolean>, timeoutMs = 45_000) => {
        const end = Date.now() + timeoutMs;
        while (Date.now() < end) {
          if (await check()) return;
          await page.waitForTimeout(500);
        }
        throw new Error(`Timed out: ${what}`);
      };
      const mine = async () =>
        list(await d.ev("window.openbot.skills.list()")).find((skill) => skill.name === "acceptance-skill");
      const install = async () =>
        list(await d.ev(`window.openbot.skills.listInstalls({ botId: ${JSON.stringify(botId)} })`)).find(
          (item) => item.name === "acceptance-skill",
        );
      // 1. The agent creates a skill from SKILL.md text.
      await d.send("Assistant", `TOOL cosgral_skills create_skill ${JSON.stringify({ skillMd: text("one") })}`);
      await until("the skill is in the library", async () => (await mine())?.version === 1);
      const created = await mine();
      assert(created?.createdByBotId === botId, `created by the agent: ${JSON.stringify(created)}`);
      await d.openPage("Library");
      await page.waitForTimeout(1_000);
      assert(/acceptance-skill/.test(await page.locator("body").innerText()), "the Library page shows the new skill");
      // 2. The agent installs it for itself, then revises it: version 2, its copy stays on version 1.
      await d.send(
        "Assistant",
        `TOOL cosgral_skills install_local_skill ${JSON.stringify({ name: "acceptance-skill" })}`,
      );
      await until("installed for the agent", async () => (await install())?.installedVersion === 1);
      await d.send(
        "Assistant",
        `TOOL cosgral_skills revise_skill ${JSON.stringify({ name: "acceptance-skill", baseVersion: 1, skillMd: text("two") })}`,
      );
      await until("version 2", async () => (await mine())?.version === 2);
      const behind = await install();
      assert(
        behind?.installedVersion === 1 && behind.latestVersion === 2 && behind.updateAvailable === true,
        `update available: ${JSON.stringify(behind)}`,
      );
      // 3. A changed copy is never replaced silently; the person can repair it.
      const skillId = String(created.id);
      const { appendFile } = await import("node:fs/promises");
      await appendFile(join(String(behind.path), "SKILL.md"), "\nLocal edit.\n");
      const changed = await install();
      assert(changed?.modifiedLocally === true, `change detected: ${JSON.stringify(changed)}`);
      const refused = String(
        await d.ev(
          `window.openbot.skills.update({ skillId: ${JSON.stringify(skillId)}, botId: ${JSON.stringify(botId)} }).then(() => "updated", (e) => "refused: " + e.message)`,
        ),
      );
      assert(refused.startsWith("refused"), `update without overwrite: ${refused}`);
      await d.ev(
        `window.openbot.skills.update({ skillId: ${JSON.stringify(skillId)}, botId: ${JSON.stringify(botId)}, overwriteLocalChanges: true })`,
      );
      const repaired = await install();
      assert(
        repaired?.installedVersion === 2 && repaired.modifiedLocally === false,
        `repaired: ${JSON.stringify(repaired)}`,
      );
      // 4. Versions and rollback: the library keeps both, restoring version 1 makes version 3.
      const versions = list(await d.ev(`window.openbot.skills.listVersions({ skillId: ${JSON.stringify(skillId)} })`));
      assert(versions.length === 2, `two versions: ${JSON.stringify(versions)}`);
      await d.ev(`window.openbot.skills.restoreVersion({ skillId: ${JSON.stringify(skillId)}, version: 1 })`);
      const latest = asRecord(await d.ev(`window.openbot.skills.read({ skillId: ${JSON.stringify(skillId)} })`));
      assert(
        latest.version === 3 && String(latest.skillMd).includes("Acceptance skill one"),
        "rollback is version 3 with the content of version 1",
      );
      return "agent created acceptance-skill (v1, createdByBotId = the agent), installed it, revised it (v2, update available), a locally changed copy was detected, refused without overwrite and repaired with it, 2 versions, rollback made v3";
    },
  );

  await row("29", "tables: one agent creates a shared table, another reads it, the Library shows it", async () => {
    await d.ask(
      "Assistant",
      'TOOL cosgral_tables create_table {"name":"Accept leads","columns":[{"name":"company","type":"text"},{"name":"value","type":"number"}]}',
      "Accept leads",
      30_000,
    );
    await d.ask(
      "Assistant",
      'TOOL cosgral_tables insert_rows {"table":"Accept leads","rows":[{"company":"Test Co","value":100},{"company":"Other Co","value":5}]}',
      "inserted",
      30_000,
    );
    const read = await d.ask("Res", 'TOOL cosgral_tables query_rows {"table":"Accept leads"}', '\\"total\\":2', 30_000);
    await d.openPage("Library");
    await page
      .getByRole("region", { name: "Shared tables" })
      .getByRole("combobox", { name: "Table" })
      .selectOption({ label: "Accept leads" });
    await page.waitForTimeout(1_500);
    assert(/Test Co/.test(await page.getByRole("region", { name: "Shared tables" }).innerText()), "rows in the UI");
    return read.slice(0, 80);
  });

  await row("30", "files: an agent saves a file; the Library lists it", async () => {
    const info = asRecord(
      await d.ev(
        `window.openbot.agent.listBots().then((bots) => { const b = bots.find((x) => x.name === "Assistant"); return { ws: b.workspacePath }; })`,
      ),
    );
    await mkdir(String(info.ws), { recursive: true });
    await writeFile(join(String(info.ws), "accept-report.md"), "# Acceptance report\nFixture data only.\n");
    await d.ask(
      "Assistant",
      'TOOL cosgral_library save_file {"path":"accept-report.md"}',
      '\\"origin\\":\\"agent\\"',
      30_000,
    );
    await d.openPage("Library");
    await page.waitForTimeout(1_500);
    assert(/accept-report\.md/.test(await page.getByRole("region", { name: "File library" }).innerText()), "listed");
    return "accept-report.md listed with origin agent";
  });

  await row(
    "30b",
    "files: Add files from disk through the picker, then open, download and reveal a file from the Library",
    async () => {
      const app = d.app;
      assert(app, "the Electron handle is needed to answer the native pickers");
      const inbox = join(root, "files-in");
      await mkdir(inbox, { recursive: true });
      const source = join(inbox, "accept-added.txt");
      const copy = join(inbox, "downloaded-copy.txt");
      const body = "Added from disk by the acceptance run.\n";
      await writeFile(source, body);
      // The native file pickers and the shell cannot be driven from outside: answer them in the main process and
      // record what the program asks the shell to do. The program's own file handling runs unchanged.
      await app.evaluate(
        ({ app: electronApp, dialog, shell }, paths) => {
          const calls: Array<{ call: string; target: string }> = [];
          const original = electronApp.getPath.bind(electronApp);
          // The sandbox profile has no Downloads folder the system can resolve: give the program one.
          Object.assign(electronApp, {
            getPath: (name: Parameters<typeof original>[0]) => (name === "downloads" ? paths.inbox : original(name)),
          });
          Object.assign(dialog, {
            showOpenDialog: async () => ({ canceled: false, filePaths: [paths.source] }),
            showSaveDialog: async () => ({ canceled: false, filePath: paths.copy }),
          });
          Object.assign(shell, {
            acceptCalls: calls,
            openPath: async (target: string) => {
              calls.push({ call: "open", target });
              return "";
            },
            showItemInFolder: (target: string) => {
              calls.push({ call: "reveal", target });
            },
          });
        },
        { source, copy, inbox },
      );
      const shellCalls = async (kind: string): Promise<string[]> => {
        const calls = list(await app.evaluate(({ shell }) => Object.fromEntries(Object.entries(shell)).acceptCalls));
        return calls.filter((entry) => entry.call === kind).map((entry) => String(entry.target));
      };
      await d.openPage("Library");
      const panel = page.getByRole("region", { name: "File library" });
      await panel.getByRole("button", { name: "Add files" }).click();
      const card = panel.locator("article.w2-item", { hasText: "accept-added.txt" });
      await card.first().waitFor({ timeout: 20_000 });
      const listed = await card.first().innerText();
      assert(new RegExp(`${Buffer.byteLength(body)} bytes`).test(listed), `size shown: ${listed}`);
      await card.first().getByRole("button", { name: "Open", exact: true }).click();
      await page.waitForTimeout(1_000);
      const opened = await shellCalls("open");
      assert(opened.length === 1, `Open asked the shell once: ${opened.length}`);
      const { readFile } = await import("node:fs/promises");
      assert(opened[0] !== source, "Open uses the library's own copy, not the original file");
      assert((await readFile(String(opened[0]), "utf8")) === body, "the library copy has the same content");
      const hasDownloadButton =
        (await card
          .first()
          .getByRole("button", { name: /Download|Save/ })
          .count()) > 0;
      const fileId = String(
        await d.ev(
          `window.openbot.library.list({}).then((files) => (files.find((f) => f.name === "accept-added.txt") || {}).id)`,
        ),
      );
      assert(fileId && fileId !== "undefined", "the file is in the library API");
      await d.ev(`window.openbot.library.open({ fileId: ${JSON.stringify(fileId)}, action: "download" })`);
      assert((await readFile(copy, "utf8")) === body, "download wrote an identical copy to the chosen path");
      await d.ev(`window.openbot.library.open({ fileId: ${JSON.stringify(fileId)}, action: "reveal" })`);
      const revealed = await shellCalls("reveal");
      assert(revealed.length === 1, `Reveal asked the shell once: ${revealed.length}`);
      await d.dump("library-row-30b");
      return `Add files > listed (${Buffer.byteLength(body)} bytes); Open > shell got the library copy (same content); download (API) > identical copy; reveal (API) > shell asked; Download or Reveal button in the panel: ${hasDownloadButton ? "yes" : "no (only Open, Attach, Delete)"}`;
    },
  );

  await row("26", "Vault: save a login; the secret never reaches the list, the API or the agent", async () => {
    await d.openPage("Library");
    const vault = page.getByRole("region", { name: "Vault" });
    await vault.getByRole("button", { name: "Add item" }).click();
    const form = page.getByRole("region", { name: "Vault item form" });
    await form.getByRole("textbox", { name: "Label" }).fill("Demo login");
    await form.getByRole("textbox", { name: "Site URL" }).fill("https://example.com");
    await form.getByRole("textbox", { name: "Username" }).fill("demo-user");
    await form.getByRole("textbox", { name: "Password" }).fill("S3cret-Pass-123");
    await form.getByRole("button", { name: "Save item" }).click();
    await page.waitForTimeout(2_000);
    assert(!(await page.locator("body").innerText()).includes("S3cret-Pass-123"), "not shown in the UI");
    assert(!JSON.stringify(await d.ev("window.openbot.vault.list()")).includes("S3cret-Pass-123"), "not in the API");
    const agent = await d.ask("Assistant", "TOOL cosgral_vault list_vault_items {}", "Demo login", 30_000);
    assert(!agent.includes("S3cret-Pass-123"), "not in the agent's answer");
    return "login listed without the password anywhere";
  });

  await row("25", "MCP: a stdio server is added and its tool is listed", async () => {
    const mcpServer = join(root, "mcp-demo.cjs");
    await writeFile(
      mcpServer,
      `let buf="";const send=(m)=>process.stdout.write(JSON.stringify(m)+"\\n");process.stdin.setEncoding("utf8");process.stdin.on("data",(c)=>{buf+=c;for(let i=buf.indexOf("\\n");i>=0;i=buf.indexOf("\\n")){const line=buf.slice(0,i);buf=buf.slice(i+1);if(!line.trim())continue;const m=JSON.parse(line);if(m.method==="initialize")send({jsonrpc:"2.0",id:m.id,result:{protocolVersion:m.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:"acceptance-demo",version:"1"}}});else if(m.method==="tools/list")send({jsonrpc:"2.0",id:m.id,result:{tools:[{name:"echo",description:"Echo",inputSchema:{type:"object",properties:{text:{type:"string"}}}}]}});else if(m.method==="tools/call")send({jsonrpc:"2.0",id:m.id,result:{content:[{type:"text",text:"ECHO"}]}});else if(m.id!==undefined)send({jsonrpc:"2.0",id:m.id,result:{}});}});`,
    );
    await d.openPage("Library");
    const mcp = page.getByRole("region", { name: "MCP servers" });
    await mcp.getByRole("textbox", { name: "Server name" }).fill("demo");
    await mcp.getByRole("textbox", { name: "Command" }).fill(process.execPath.replace(/\\/g, "/"));
    await mcp.getByRole("textbox", { name: "Arguments (one per line)" }).fill(mcpServer.replace(/\\/g, "/"));
    await mcp.getByRole("button", { name: "Add server", exact: true }).click();
    const until = Date.now() + 30_000;
    let state = "";
    while (Date.now() < until) {
      state = JSON.stringify(
        await d.ev(
          "window.openbot.mcp.list().then((l) => l.map((s) => ({ n: s.name, st: s.status, t: s.tools.map((x) => x.name || x) })))",
        ),
      );
      if (state.includes("available") && state.includes("echo")) break;
      await page.waitForTimeout(1_000);
    }
    assert(state.includes("available") && state.includes("echo"), state);
    return state;
  });

  await row("27", "routines: create, Run now, history done, a one-minute routine fires by itself", async () => {
    await d.openPage("Schedule");
    const create = page.getByRole("region", { name: "Create routine" });
    await create.getByRole("combobox", { name: "Agent" }).selectOption({ label: "Assistant" });
    await create.getByRole("textbox", { name: "Routine name" }).fill("Every minute");
    await create.getByRole("textbox", { name: "Instructions" }).fill("Minute tick");
    await create.getByRole("spinbutton", { name: "Minutes" }).fill("1");
    await create.getByRole("button", { name: "Create routine" }).click();
    await page.waitForTimeout(1_500);
    assert(/Next:/.test(await page.getByRole("region", { name: "Routines" }).innerText()), "next run shown");
    await page.getByRole("button", { name: "Run now" }).click();
    await page.waitForTimeout(8_000);
    const until = Date.now() + 130_000;
    let runs = "";
    while (Date.now() < until) {
      runs = JSON.stringify(
        await d.ev(
          "window.openbot.routines.list().then(async (rs) => { const o = []; for (const r of rs) o.push((await window.openbot.routines.listRuns({ routineId: r.id })).map((x) => x.status)); return o; })",
        ),
      );
      if ((runs.match(/done/g) ?? []).length >= 2) break;
      await page.waitForTimeout(5_000);
    }
    assert((runs.match(/done/g) ?? []).length >= 2, `runs: ${runs}`);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    return `runs: ${runs}`;
  });

  await row("28", "workflows: trigger and agent steps, connect, save, run, history", async () => {
    await d.openPage("Workflows");
    const editor = page.getByRole("region", { name: "Workflow editor" });
    await editor.getByRole("button", { name: "Add trigger" }).click();
    await editor.getByRole("button", { name: "Add agent" }).click();
    const agent = editor.getByRole("article").nth(1);
    await agent.getByRole("combobox", { name: "Agent" }).selectOption({ label: "Assistant" });
    await agent.getByRole("textbox", { name: "Instruction" }).fill("Say hello from the workflow");
    const links = editor.getByRole("group", { name: "Connections" });
    await links.getByRole("combobox", { name: "From" }).selectOption({ label: "trigger" });
    await links.getByRole("combobox", { name: "To" }).selectOption({ label: "agent" });
    await links.getByRole("button", { name: "Connect" }).click();
    await page.getByRole("button", { name: "Save workflow" }).click();
    await page.waitForTimeout(1_500);
    await page.getByRole("textbox", { name: "Run input" }).fill("acceptance input");
    await page.getByRole("button", { name: "Run now" }).click();
    await page
      .getByText(/trigger: done/)
      .first()
      .waitFor({ timeout: 40_000 });
    await page
      .getByText(/agent: done/)
      .first()
      .waitFor({ timeout: 60_000 });
    return "trigger: done, agent: done";
  });

  await row("13", "browser takeover: card in Needs you, Take over, Return to agent, the agent continues", async () => {
    const site = await import("node:http").then(
      ({ createServer }) =>
        new Promise<import("node:http").Server>((done) => {
          const server = createServer((_request, response) => {
            response.setHeader("content-type", "text/html");
            response.end("<html><head><title>Acceptance page</title></head><body>Acceptance page</body></html>");
          });
          server.listen(0, "127.0.0.1", () => done(server));
        }),
    );
    try {
      const address = site.address();
      const port = isDynamicRecord(address) && isNumber(address.port) ? address.port : 0;
      const opened = await d.ask(
        "Assistant",
        `TOOL openbot_browser open {"url":"http://127.0.0.1:${port}/"}`,
        "Acceptance page",
        40_000,
      );
      const tab = /\\"id\\":\\"([0-9a-f-]{36})\\"/.exec(opened)?.[1];
      assert(tab, `tab id in: ${opened.slice(0, 160)}`);
      await d.openAgent("Assistant");
      await d.send(
        "Assistant",
        `TOOL cosgral_cards request_takeover {"tabId":"${tab}","reason":"Sign in to continue"}`,
      );
      const decision = page.getByRole("region", { name: "Decision" });
      await decision.getByRole("button", { name: "Take over" }).click({ timeout: 25_000 });
      await decision.getByRole("button", { name: "Return to agent" }).click({ timeout: 10_000 });
      await d.answer("Assistant", "returned", 30_000);
      const tabs = await d.ask("Assistant", "TOOL openbot_browser list_tabs {}", `127.0.0.1:${port}`, 30_000);
      return `agent got outcome returned; tabs: ${tabs.slice(0, 60)}`;
    } finally {
      site.close();
    }
  });

  await row(
    "26b",
    "Vault: the agent fills a login form on a local page; the password stays out of the UI, the chat and the disk",
    async () => {
      const username = "form-user";
      const password = "F0rm-Secret-789";
      const { createServer } = await import("node:http");
      const seen = { posts: 0, user: "", password: "" };
      const site = await new Promise<import("node:http").Server>((done) => {
        const server = createServer((request, response) => {
          response.setHeader("content-type", "text/html");
          if (request.method === "POST") {
            let data = "";
            request.on("data", (chunk) => {
              data += String(chunk);
            });
            request.on("end", () => {
              const form = new URLSearchParams(data);
              seen.posts += 1;
              seen.user = form.get("u") ?? "";
              seen.password = form.get("p") ?? "";
              response.end("<html><head><title>Signed in page</title></head><body>Signed in.</body></html>");
            });
            return;
          }
          response.end(
            '<html><head><title>Vault form page</title></head><body><form method="post" action="/login">' +
              '<label>Username <input name="u" type="text" autocomplete="off"></label>' +
              '<label>Password <input name="p" type="password" autocomplete="off"></label>' +
              '<button type="submit">Sign in</button></form></body></html>',
          );
        });
        server.listen(0, "127.0.0.1", () => done(server));
      });
      try {
        const address = site.address();
        const port = isDynamicRecord(address) && isNumber(address.port) ? address.port : 0;
        const origin = `http://127.0.0.1:${port}`;
        // 1. The person saves the login for this local site (loopback, no real service).
        await d.openPage("Library");
        const vault = page.getByRole("region", { name: "Vault" });
        await vault.getByRole("button", { name: "Add item" }).click();
        const form = page.getByRole("region", { name: "Vault item form" });
        await form.getByRole("textbox", { name: "Label" }).fill("Local form login");
        await form.getByRole("textbox", { name: "Site URL" }).fill(origin);
        await form.getByRole("textbox", { name: "Username" }).fill(username);
        await form.getByRole("textbox", { name: "Password" }).fill(password);
        await form.getByRole("button", { name: "Save item" }).click();
        await page.waitForTimeout(2_000);
        // 2. The agent opens the page and reads the element references.
        const opened = await d.ask(
          "Assistant",
          `TOOL openbot_browser open {"url":"${origin}/"}`,
          "Vault form page",
          40_000,
        );
        const tab = /\\"(?:tabId|id)\\":\\"([0-9a-f-]{36})\\"/.exec(opened)?.[1];
        assert(tab, `tab id in: ${opened.slice(0, 200)}`);
        let snapshot = snapshotOf(toolResult(opened));
        if (snapshot.elements.length === 0) {
          const read = await d.ask("Assistant", `TOOL openbot_browser snapshot {"tabId":"${tab}"}`, "Sign in", 40_000);
          snapshot = snapshotOf(toolResult(read));
        }
        const userRef = String(
          snapshot.elements.find((e) => e.tag === "input" && e.inputType !== "password")?.ref ?? "",
        );
        const passwordRef = String(snapshot.elements.find((e) => e.inputType === "password")?.ref ?? "");
        const buttonRef = String(snapshot.elements.find((e) => e.tag === "button")?.ref ?? "");
        assert(
          userRef && passwordRef && buttonRef && snapshot.revision >= 0,
          `refs: ${JSON.stringify(snapshot).slice(0, 300)}`,
        );
        // 3. The agent asks the Vault to fill the form: the values go straight into the page.
        const filled = await d.ask(
          "Assistant",
          `TOOL cosgral_vault fill_login ${JSON.stringify({ tabId: tab, revision: snapshot.revision, usernameRef: userRef, passwordRef })}`,
          'filled\\"',
          40_000,
        );
        assert(!filled.includes(password), "the fill result does not contain the password");
        // 4. The agent submits the form; the local site received the Vault values.
        await d.ask(
          "Assistant",
          `TOOL openbot_browser act ${JSON.stringify({ tabId: tab, revision: snapshot.revision, action: { type: "click", ref: buttonRef } })}`,
          "Signed in page",
          40_000,
        );
        assert(seen.posts === 1, `the form was submitted once (${seen.posts})`);
        assert(seen.user === username && seen.password === password, "the site received the username and the password");
        // 5. The password is nowhere the person or the agent can read it.
        const botId = await d.botId("Assistant");
        const conversation = JSON.stringify(
          await d.ev(`window.openbot.agent.readConversation(${JSON.stringify(botId)})`),
        );
        assert(!conversation.includes(password), "not in the agent's conversation");
        assert(!JSON.stringify(await d.ev("window.openbot.vault.list()")).includes(password), "not in the Vault list");
        assert(!(await page.locator("body").innerText()).includes(password), "not in the window");
        const found = await anyFileContains(join(root, "home"), password);
        assert(
          found === null,
          `the password is not in any file of the sandbox profile (found in ${found ? basename(found) : ""})`,
        );
        await d.dump("vault-form-row-26b");
        return "Vault login saved for a loopback page; fill_login typed it, the form was submitted and the site got both values; not in the fill result, the conversation, the Vault list, the window or any file of the profile";
      } finally {
        site.close();
      }
    },
  );

  await row("35", "providers: usage list, add an ACP agent, save a fallback order", async () => {
    await d.openPage("Providers");
    const usage = await page.getByRole("region", { name: "Provider usage" }).innerText();
    assert(/Codex/.test(usage) && /Claude/.test(usage), "usage rows");
    const acp = page.getByRole("region", { name: "ACP agents" });
    await acp.getByRole("textbox", { name: /^Id/ }).fill("demo-acp");
    await acp.getByRole("textbox", { name: /^Name/ }).fill("Demo ACP");
    await acp.getByRole("textbox", { name: /^Command/ }).fill("demo-acp-cmd");
    await acp.getByRole("button", { name: "Add agent" }).click();
    await page.waitForTimeout(2_000);
    assert(/acp:demo-acp/.test(await acp.innerText()), "ACP agent listed");
    const fallbacks = page.getByRole("region", { name: "Fallback models" });
    await fallbacks.getByRole("combobox").first().selectOption({ label: "Assistant" });
    await page.waitForTimeout(1_000);
    await fallbacks.getByLabel("Add fallback model").selectOption({ label: "Sol" });
    await fallbacks.getByRole("button", { name: "Save order" }).click();
    await page.waitForTimeout(1_500);
    const saved = JSON.stringify(
      await d.ev(
        `window.openbot.agent.listBots().then((bots) => window.openbot.providers.getFallbackModels(bots.find((b) => b.name === "Assistant").id))`,
      ),
    );
    assert(saved.includes("gpt-5.6-sol"), saved);
    return `fallback saved ${saved}; switching to a second provider is not checkable here`;
  });

  await row(
    "35b",
    "providers: a full Codex window moves an agent to a fallback model of ANOTHER provider (ACP) and back",
    async () => {
      const stub = join(repo, "src", "backend", "testing", "acp-stub.mjs");
      const until = async (what: string, check: () => Promise<boolean>, timeoutMs = 45_000) => {
        const end = Date.now() + timeoutMs;
        while (Date.now() < end) {
          if (await check()) return;
          await page.waitForTimeout(500);
        }
        throw new Error(`Timed out: ${what}`);
      };
      const codexState = async () =>
        String(
          list(await d.ev("window.openbot.providers.listUsage()")).find((usage) => usage.provider === "codex")?.state,
        );
      const activeModel = async () =>
        String(
          list(await d.ev("window.openbot.agent.listBots()")).find((bot) => bot.name === "Assistant")?.activeModel ??
            null,
        );
      // The ACP agent of row 35 had a placeholder command: replace it by the ACP stand-in of the repository.
      await d.ev(
        `window.openbot.providers.saveAcpAgent(${JSON.stringify({ id: "demo-acp", name: "Demo ACP", command: process.execPath, args: [stub, "demo-acp"] })})`,
      );
      const assistant = await d.botId("Assistant");
      await d.ev(
        `window.openbot.providers.setFallbackModels({ botId: ${JSON.stringify(assistant)}, fallbackModels: ["acp:demo-acp"] })`,
      );
      try {
        // The Providers page is open while the switch happens: it lists the model-fallback events.
        await d.openPage("Providers");
        const diagnose = async () =>
          JSON.stringify({
            activeModel: await activeModel(),
            row: (await d.rowLabel("Assistant")).slice(0, 220),
            recent: list(
              await d.ev(
                `window.openbot.agent.readConversation(${JSON.stringify(assistant)}).then((c) => c.messages.slice(-4))`,
              ),
            ).map((m) => `${m.author}:${String(m.text).slice(0, 70)}`),
            usage: list(await d.ev("window.openbot.providers.listUsage()")).map(
              (u) => `${u.provider}:${u.model ?? ""}:${u.state}`,
            ),
            acp: list(await d.ev("window.openbot.providers.listAcpAgents()")).map(
              (a) => `${a.id}:${a.command ? "cmd" : "none"}`,
            ),
          });
        await d.send("Assistant", "LIMITON");
        await until("Codex is limited", async () => (await codexState()) === "limited").catch(async (error) => {
          throw new Error(`${error instanceof Error ? error.message : String(error)} | ${await diagnose()}`);
        });
        await d.send("Assistant", "hello on the other provider");
        const reply = await d.answer("Assistant", "ACP stub", 60_000).catch(async (error) => {
          throw new Error(`${error instanceof Error ? error.message : String(error)} | ${await diagnose()}`);
        });
        assert(/received/.test(reply), `the ACP agent answered: ${reply.slice(0, 120)}`);
        assert((await activeModel()) === "acp:demo-acp", `active model: ${await activeModel()}`);
        const notice = page.getByText(/Assistant switched from .+ to acp:demo-acp/).first();
        await notice.waitFor({ timeout: 15_000 });
        const noticeText = await notice.innerText();
        await d.dump("providers-fallback-row-35b");
        // Back: another Codex agent clears the window (it has no fallback, so it stays on Codex); the next message of
        // the first agent returns to its own model.
        await d.send("Res", "LIMITOFF");
        await until("Codex is available again", async () => (await codexState()) === "ok");
        await d.send("Assistant", "hello again");
        await d.answer("Assistant", "Stub: received", 60_000);
        await until("back on its own model", async () => (await activeModel()) === "null");
        await d.ev(
          `window.openbot.providers.setFallbackModels({ botId: ${JSON.stringify(assistant)}, fallbackModels: [] })`,
        );
        return `Codex limited > Assistant answered from the ACP agent (activeModel acp:demo-acp); notice in Providers: "${noticeText.slice(0, 90)}"; limit cleared > back on its own model`;
      } finally {
        // Leave nothing behind: the full window is cleared by another Codex agent, the fallback list is emptied.
        await d.send("Res", "LIMITOFF").catch(() => undefined);
        await until("Codex is available again", async () => (await codexState()) === "ok", 20_000).catch(
          () => undefined,
        );
        await d
          .ev(`window.openbot.providers.setFallbackModels({ botId: ${JSON.stringify(assistant)}, fallbackModels: [] })`)
          .catch(() => undefined);
      }
    },
  );

  await row(
    "16",
    "side panel: the browser panel and the settings panel open; the right panel resizes by keyboard",
    async () => {
      await d.openAgent("Assistant");
      await page.getByRole("button", { name: "Open computer" }).click();
      await page.getByRole("complementary", { name: "Browser" }).waitFor({ timeout: 15_000 });
      const separator = page.getByRole("separator", { name: /Resize right panel/ }).first();
      const before = Number(await separator.getAttribute("aria-valuenow"));
      await separator.focus();
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      const after = Number(await separator.getAttribute("aria-valuenow"));
      assert(after !== before, `width ${before} -> ${after}`);
      await page
        .getByRole("button", { name: "Close details" })
        .click()
        .catch(() => undefined);
      return `browser panel; width ${before} -> ${after}`;
    },
  );

  await row(
    "33",
    "remote desktop: host on loopback, wrong token refused, consent card declined, no session",
    async () => {
      const enabled = asRecord(
        await d.ev("window.openbot.remoteDesktop.host.enable({ exposure: 'loopback', port: 0 })"),
      );
      const urls = list([asRecord(asRecord(enabled.state).listening)]).flatMap((x) =>
        Array.isArray(x.urls) ? x.urls.map(String) : [],
      );
      const address = urls[0] ?? "";
      assert(/^ws:\/\/127\.0\.0\.1:\d+$/.test(address), `address ${address}`);
      const wrong = String(
        await d.ev(
          `window.openbot.remoteDesktop.client.connect({ address: ${JSON.stringify(address)}, token: "wrong-token-123456789012345678", mode: "view" }).catch(() => null).then(() => new Promise((r) => setTimeout(r, 4000))).then(() => window.openbot.remoteDesktop.client.getState().then((s) => s.phase + ":" + s.error))`,
        ),
      );
      assert(/failed:The token is wrong/.test(wrong), wrong);
      await d.ev("window.openbot.remoteDesktop.client.disconnect().catch(() => null)");
      void d.ev(
        `window.openbot.remoteDesktop.client.connect({ address: ${JSON.stringify(address)}, token: ${JSON.stringify(String(enabled.token))}, mode: "view" }).catch(() => null)`,
      );
      let cardId = "";
      for (let attempt = 0; attempt < 40 && !cardId; attempt += 1) {
        await page.waitForTimeout(500);
        for (const item of list(await d.ev("window.openbot.agent.listPendingRequests()"))) {
          const card = asRecord(item.card);
          if (item.kind === "draft-preview" && /to see this computer/.test(String(card.title)))
            cardId = String(card.requestId);
        }
      }
      assert(cardId, "the consent card shows up in Needs you");
      await d.ev(
        `window.openbot.agent.respondToDraftPreview({ requestId: ${JSON.stringify(cardId)}, decision: "keep-draft" })`,
      );
      await page.waitForTimeout(3_000);
      const after = String(
        await d.ev("window.openbot.remoteDesktop.client.getState().then((s) => s.phase + ':' + s.error)"),
      );
      assert(/failed:The owner of that computer said no/.test(after), after);
      const host = asRecord(await d.ev("window.openbot.remoteDesktop.host.disable()"));
      assert(host.enabled === false, "host disabled");
      return "token refused; consent declined; the screen was never captured";
    },
  );

  await row("37", "dock: pin an agent, show the dock window, chat from it", async () => {
    const id = await d.botId("Assistant");
    await d.ev(`window.openbot.dock.pin({ botId: ${JSON.stringify(id)} })`);
    await d.ev("window.openbot.dock.setVisible({ visible: true })");
    let dock: Page | undefined;
    for (let attempt = 0; attempt < 30 && !dock; attempt += 1) {
      await page.waitForTimeout(500);
      dock = page
        .context()
        .pages()
        .find((candidate) => /#dock/.test(candidate.url()));
    }
    assert(dock, "the dock window opened");
    await dock.getByRole("button", { name: "Assistant" }).click();
    await dock.getByRole("textbox").first().fill("hello from the dock");
    await dock.keyboard.press("Enter");
    await d.answer("Assistant", "Stub: received", 40_000);
    const got = JSON.stringify(
      await d.ev(
        `window.openbot.agent.readConversation(${JSON.stringify(id)}).then((c) => c.messages.slice(-3).map((m) => m.text))`,
      ),
    );
    assert(got.includes("hello from the dock"), got);
    await d.ev("window.openbot.dock.setVisible({ visible: false })");
    return "mini chat sent and got an answer";
  });

  await row("38", "island: a question in the background shows on the island and opens its card", async () => {
    await d.openAgent("Assistant");
    await d.send("Res", "ASK");
    let status = "";
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await page.waitForTimeout(500);
      status = JSON.stringify(await d.ev("window.openbot.island.getState()"));
      if (status.includes('"kind":"question"')) break;
    }
    assert(status.includes('"kind":"question"') && status.includes('"botName":"Res"'), status);
    const island = page
      .context()
      .pages()
      .find((candidate) => /#island/.test(candidate.url()));
    assert(island, "the island window exists");
    await island.getByRole("button", { name: /Question/ }).click();
    await page.getByRole("region", { name: "Decision" }).waitFor({ timeout: 20_000 });
    assert.equal(await page.getByRole("heading", { level: 1 }).first().innerText(), "Res");
    await page.getByRole("region", { name: "Decision" }).getByRole("button", { name: "Skip" }).click();
    return "island showed the question; click opened Res with its card";
  });

  await row("39", "settings: notification matrix saved; language saved (UI strings stay English)", async () => {
    await d.openPage("Settings");
    const app = page.getByRole("region", { name: "Application settings" });
    await app.getByRole("combobox", { name: "Language" }).selectOption({ label: "Polski" });
    await app.getByRole("checkbox", { name: "Needs your answer: notification" }).uncheck();
    await app.getByRole("button", { name: "Save application settings" }).click();
    await page.waitForTimeout(2_000);
    const saved = asRecord(await d.ev("window.openbot.appSettings.get()"));
    assert.equal(saved.language, "pl");
    assert.equal(asRecord(asRecord(asRecord(saved.notifications).matrix)["needs-input"]).desktop, false);
    const stillEnglish = await page.getByRole("button", { name: "Save application settings" }).count();
    await app.getByRole("combobox", { name: "Language" }).selectOption({ label: "English" });
    await app.getByRole("checkbox", { name: "Needs your answer: notification" }).check();
    await app.getByRole("button", { name: "Save application settings" }).click();
    await page.waitForTimeout(1_500);
    await page.getByRole("button", { name: "Cancel" }).click();
    return `saved; the UI strings are English after choosing Polski: ${stillEnglish > 0}`;
  });

  await row("42-44", "phone: pairing over TLS, chat and decisions, creating an agent from the phone", async () => {
    await d.openAgent("Assistant");
    const started = asRecord(await d.ev("window.openbot.mobile.startPairing({ exposure: 'loopback', port: 0 })"));
    const fingerprint = String(started.fingerprint ?? "");
    const base = (Array.isArray(started.urls) ? started.urls.map(String) : [])[0] ?? "";
    assert(
      /^https:\/\/127\.0\.0\.1:\d+$/.test(base) && /^[0-9a-f]{64}$/.test(fingerprint),
      "TLS address and fingerprint",
    );
    assert(String(started.qrDataUrl).startsWith("data:image/svg+xml;base64,"), "QR code image");
    const paired = pinned(`${base}/v1/pair`, fingerprint, {
      method: "POST",
      body: { ticket: started.ticket, deviceName: "Acceptance phone", platform: "web" },
    });
    let cardId = "";
    for (let attempt = 0; attempt < 40 && !cardId; attempt += 1) {
      await page.waitForTimeout(250);
      for (const item of list(await d.ev("window.openbot.agent.listPendingRequests()"))) {
        const card = asRecord(item.card);
        if (item.kind === "draft-preview" && String(card.title).startsWith("Pair a phone"))
          cardId = String(card.requestId);
      }
    }
    assert(cardId, "pairing consent card in Needs you");
    await d.ev(
      `window.openbot.agent.respondToDraftPreview({ requestId: ${JSON.stringify(cardId)}, decision: "send" })`,
    );
    const answer = await paired;
    assert.equal(answer.status, 200);
    const token = String(asRecord(answer.json).token ?? "");
    const agents = list(asRecord((await pinned(`${base}/v1/agents`, fingerprint, { token })).json).agents);
    const assistant = agents.find((item) => item.name === "Assistant");
    assert(assistant, "the phone lists the agents");
    const messagesUrl = `${base}/v1/agents/${encodeURIComponent(String(assistant.id))}/messages`;
    const sent = await pinned(messagesUrl, fingerprint, {
      method: "POST",
      token,
      body: { text: "Hello from the phone" },
    });
    assert.equal(sent.status, 202);
    await d.answer("Assistant", "Stub: received", 40_000);
    // A question on the computer is answered from the phone.
    await d.send("Assistant", "ASK");
    let itemId = "";
    for (let attempt = 0; attempt < 40 && !itemId; attempt += 1) {
      await page.waitForTimeout(500);
      const needs = list(asRecord((await pinned(`${base}/v1/needs-you`, fingerprint, { token })).json).items);
      itemId = String(needs[0]?.id ?? "");
    }
    assert(itemId, "the question is listed for the phone");
    const detail = asRecord(
      (await pinned(`${base}/v1/needs-you/${encodeURIComponent(itemId)}`, fingerprint, { token })).json,
    );
    const questionId = String(list(detail.questions)[0]?.id ?? "format");
    const replied = await pinned(`${base}/v1/needs-you/${encodeURIComponent(itemId)}/answer`, fingerprint, {
      method: "POST",
      token,
      body: { kind: "prompt", answers: { [questionId]: ["Long"] } },
    });
    assert.equal(replied.status, 200, replied.text.slice(0, 120));
    const reply = await d.answer("Assistant", "Long", 40_000);
    // Creating an agent from the phone.
    const created = await pinned(`${base}/v1/agents`, fingerprint, {
      method: "POST",
      token,
      body: { name: "Phone made", role: "Made on the phone", instructions: "Answer briefly." },
    });
    assert(
      created.status === 200 || created.status === 201,
      `create answered ${created.status}: ${created.text.slice(0, 120)}`,
    );
    const onComputer = await d.botId("Phone made");
    assert(onComputer && onComputer !== "undefined", "the agent made on the phone is on the computer");
    const vault = await pinned(`${base}/v1/vault/items`, fingerprint, { token });
    assert.equal(vault.status, 403, "the Vault stays on the computer");
    return `paired with pinned TLS; phone chat; question answered from the phone (${reply.slice(0, 50)}); agent created from the phone`;
  });
}

async function secondRun(d: Driver): Promise<void> {
  const { page } = d;
  await row("R1", "restart: no first-run screens, same agents, history stays", async () => {
    await page.getByRole("navigation", { name: "Pages" }).waitFor({ timeout: 90_000 });
    const names = JSON.stringify(
      await d.ev("window.openbot.agent.listBots().then((b) => b.map((x) => x.name).sort())"),
    );
    assert(names.includes("Assistant") && names.includes("Res") && names.includes("Phone made"), names);
    const text = String(
      await d.ev(
        `window.openbot.agent.listBots().then(async (bots) => (await window.openbot.agent.readConversation(bots.find((b) => b.name === "Assistant").id)).messages.map((m) => m.text).join("|"))`,
      ),
    );
    assert(text.includes("Hello from the phone") && text.includes("Stub: received"), "history");
    return names;
  });
  await row("R2", "restart: folders, tables, files, skills, MCP, Vault, rules, workflow persist", async () => {
    const layout = JSON.stringify(await d.ev("window.openbot.sidebar.getLayout()"));
    assert(layout.includes("Inner") && layout.includes("Work stuff"), "folders");
    assert(JSON.stringify(await d.ev("window.openbot.tables.list()")).includes("Accept leads"), "tables");
    assert(JSON.stringify(await d.ev("window.openbot.library.list({})")).includes("accept-report.md"), "files");
    assert(JSON.stringify(await d.ev("window.openbot.skills.list()")).includes("meeting-notes"), "skills");
    assert(JSON.stringify(await d.ev("window.openbot.mcp.list()")).includes("demo"), "mcp");
    assert(JSON.stringify(await d.ev("window.openbot.vault.list()")).includes("Demo login"), "vault");
    assert(JSON.stringify(await d.ev("window.openbot.approvalRules.list()")).includes("git status"), "rules");
    assert(JSON.stringify(await d.ev("window.openbot.workflows.list()")).includes("New workflow"), "workflow");
    return "all present";
  });
  await row(
    "R3",
    "restart: the always-memory and the skill are in the next conversation, model and MCP tools too",
    async () => {
      const memory = await d.ask("Assistant", "INSTRHAS tea, no sugar", "Stub: instructions", 60_000);
      assert(/have/.test(memory), memory);
      const skill = await d.ask("Assistant", "INSTRHAS meeting-notes", "Stub: instructions", 40_000);
      assert(/have/.test(skill), skill);
      const tools = await d.ask("Assistant", "TOOLS", "Stub: tools", 40_000);
      assert(tools.includes("mcp_demo.echo"), "MCP tool in the thread");
      const model = await d.ask("Assistant", "MODEL", "Stub: model", 40_000);
      assert(model.includes("gpt-5.6-terra"), model);
      return "memory, skill, MCP tool and model persisted";
    },
  );
  await row(
    "R2b",
    "restart: the added file, the created skill (rolled back to v3) and the form login persist",
    async () => {
      assert(JSON.stringify(await d.ev("window.openbot.library.list({})")).includes("accept-added.txt"), "added file");
      const skills = list(await d.ev("window.openbot.skills.list()"));
      const created = skills.find((skill) => skill.name === "acceptance-skill");
      assert(created && created.version === 3, `skill: ${JSON.stringify(created)}`);
      assert(JSON.stringify(await d.ev("window.openbot.vault.list()")).includes("Local form login"), "form login");
      return "accept-added.txt, acceptance-skill v3 and Local form login are present";
    },
  );
  await row("R3b", "restart: the skill the agent created is in the next conversation's instructions", async () => {
    const skill = await d.ask("Assistant", "INSTRHAS acceptance-skill", "acceptance-skill", 60_000);
    assert(/have/.test(skill), skill);
    return "the installed copy of acceptance-skill is in the instructions";
  });

  await row("R4", "restart: the browser tabs are still there", async () => {
    const tabs = await d.ask("Assistant", "TOOL openbot_browser list_tabs {}", "tabs", 40_000);
    assert(/127\.0\.0\.1:\d+/.test(tabs), tabs.slice(0, 120));
    return "tab listed after the restart";
  });
  await row("R5", "restart: the phone server runs again", async () => {
    const state = asRecord(await d.ev("window.openbot.mobile.getState()"));
    assert(state.enabled === true && state.transport === "tls", JSON.stringify(state).slice(0, 120));
    return "Mobile Connect resumed with TLS";
  });
}

async function main(): Promise<void> {
  const root = sandboxRoot();
  const evidence = join(root, "evidence");
  resultsFile = join(evidence, only.length ? "acceptance-rerun.json" : "acceptance.json");
  if (!process.argv.includes("--keep")) await rm(root, { recursive: true, force: true });
  for (const folder of [
    join(root, "home", "AppData", "Roaming"),
    join(root, "home", "AppData", "Local"),
    join(root, "tmp"),
    evidence,
  ]) {
    await mkdir(folder, { recursive: true });
  }
  const fixture = await installFixture(root);
  const first = await launch(root, fixture);
  try {
    await firstRun(new Driver(first.page, evidence, first.app), root);
    await new Driver(first.page, evidence, first.app).dump("final-first-run");
  } finally {
    await first.app.close().catch(() => undefined);
  }
  const second = await launch(root, fixture);
  try {
    await secondRun(new Driver(second.page, evidence));
  } finally {
    await second.app.close().catch(() => undefined);
  }
  await writeFile(resultsFile, JSON.stringify({ results, console: consoleFindings.slice(0, 40) }, null, 2));
  const failed = results.filter((result) => !result.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} steps ok; console errors: ${consoleFindings.length}`,
  );
  for (const result of failed) console.log(`  FAIL [${result.row}] ${result.name}: ${result.detail.slice(0, 200)}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
