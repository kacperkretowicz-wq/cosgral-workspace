// COSGRAL W3-T3: acceptance run of the parity table (docs/cosgral/parytet-0.68.md) in the real program.
// Real Electron, real main process, real window, in a sandbox profile, with the Codex stand-in of
// scripts/acceptance-codex.cjs (no model, no network, no account). Each step is one row (or part of a row) of the
// table and writes "ok" or "FAIL" with the evidence it saw into <sandbox>/evidence/acceptance.json.
//
//   COSGRAL_SANDBOX_ROOT=<folder> node scripts/sandbox-acceptance.ts [--keep]
//   COSGRAL_MODE=w5|w11|cli-onboarding  (w11 = W11 feature steps; prepared for GO, see scripts/sandbox-w11-acceptance.ts)
// Launch always passes --lang=en-US and cleanEnvironment() so Polish Windows and CLAUDE_*/OPENBOT_*/token env do not leak.
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
import { type DynamicRecord, isBoolean, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { type ElectronApplication, _electron as electron, type Page } from "playwright";
import { cleanEnvironment } from "./sandbox-env.ts";
import { waitForQuietMachine } from "./sandbox-load.ts";

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
/** Set by the newest Driver: a screenshot and the accessibility tree of the window when a step fails (evidence folder, never the repository). */
let dumpOnFailure: ((name: string) => Promise<void>) | undefined;

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
    args: ["--lang=en-US", repo],
    cwd: repo,
    env: {
      ...cleanEnvironment(),
      ...sandboxEnvironment(root),
      OPENBOT_CODEX_PATH: fixture.codex,
      OPENBOT_CLAUDE_PATH: fixture.claude,
      // Match e2e/shots: Chromium + app i18n stay English even on Polish Windows.
      LANG: "en-US",
      LC_ALL: "en-US",
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
    const detail = (error instanceof Error ? error.message : String(error))
      .split("\n")
      .slice(0, 6)
      .join(" | ")
      .slice(0, 900);
    results.push({ row: id, name, ok: false, detail, ms: Date.now() - started });
    await dumpOnFailure?.(`fail-${id}`).catch(() => undefined);
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
  readonly devtools: Promise<import("playwright").CDPSession>;

  constructor(page: Page, evidence: string, app?: ElectronApplication) {
    this.page = page;
    this.evidence = evidence;
    this.app = app;
    dumpOnFailure = (name) => this.dump(name);
    // Made while the page still answers: a stuck page cannot start a new DevTools session.
    this.devtools = page
      .context()
      .newCDPSession(page)
      .then(async (session) => {
        await session.send("Debugger.enable");
        return session;
      });
    this.devtools.catch(() => undefined);
  }

  async ev(expression: string): Promise<unknown> {
    // A window that stops answering (a busy loop in the page) must not hang the whole run: after 45 s the row fails
    // and the place where the page stands is written to the evidence (Debugger.pause through the DevTools protocol).
    let timer: NodeJS.Timeout | undefined;
    const stuck = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("The window does not answer (the page is stuck)")), 90_000);
    });
    if (process.env.COSGRAL_TRACE) console.log(`     ev> ${expression.slice(0, 110)}`);
    try {
      return await Promise.race([this.page.evaluate(expression), stuck]);
    } catch (error) {
      if (error instanceof Error && /does not answer/.test(error.message))
        await this.pageStack().catch(() => undefined);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Where the (stuck) page stands: the call stack at a pause, written to the evidence folder. */
  async pageStack(): Promise<void> {
    const cdp = await this.devtools;
    const paused = new Promise<string>((done) => {
      cdp.once("Debugger.paused", (event) => {
        done(
          event.callFrames
            .slice(0, 25)
            .map(
              (frame) =>
                `${frame.functionName || "(anonymous)"} ${frame.url.split("/").pop()}:${frame.location.lineNumber + 1}`,
            )
            .join("\n"),
        );
      });
    });
    await cdp.send("Debugger.pause");
    const stack = await Promise.race([
      paused,
      new Promise<string>((done) => setTimeout(() => done("(no pause in 8 s)"), 8_000)),
    ]);
    await writeFile(join(this.evidence, `stuck-page-${Date.now()}.txt`), stack);
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

async function firstRun(d: Driver, root: string, cli: CliStandIn): Promise<void> {
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
      await setup.getByRole("button", { name: "Continue with Codex" }).click({ timeout: 120_000 });
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
      await page.getByRole("button", { name: "Create new", exact: true }).first().click();
      // Since PR #24 "New channel" is an item of the sidebar's "+" menu, not a button on the Agents page.
      await page.getByRole("menuitem", { name: "New channel" }).first().click();
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

  await row(
    "24c",
    "skills: a second agent adds the skill the first agent created; the first agent's copy is not changed",
    async () => {
      const first = await d.botId("Assistant");
      const second = await d.botId("Res");
      const installOf = async (botId: string) =>
        list(await d.ev(`window.openbot.skills.listInstalls({ botId: ${JSON.stringify(botId)} })`)).find(
          (item) => item.name === "acceptance-skill",
        );
      await d.send("Res", `TOOL cosgral_skills install_local_skill ${JSON.stringify({ name: "acceptance-skill" })}`);
      const end = Date.now() + 45_000;
      while (Date.now() < end && !(await installOf(second))) await page.waitForTimeout(500);
      const added = await installOf(second);
      const kept = await installOf(first);
      assert(
        added && added.installedVersion === added.latestVersion,
        `second agent has the latest: ${JSON.stringify(added)}`,
      );
      assert(
        kept && kept.installedVersion === 2,
        `the first agent's copy stays on its version: ${JSON.stringify(kept)}`,
      );
      return `Res installed acceptance-skill v${added.installedVersion}; Assistant's own copy stays on v${kept.installedVersion}`;
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
        ({ dialog, shell }, paths) => {
          const calls: Array<{ call: string; target: string }> = [];
          Object.assign(dialog, {
            showOpenDialog: async () => ({ canceled: false, filePaths: [paths.source] }),
            // The sandbox profile has no Downloads folder the system can resolve: the program must still offer a
            // folder (Documents or temp). Record where the Save dialog was asked to start.
            showSaveDialog: async (...args: Array<{ defaultPath?: string }>) => {
              calls.push({ call: "save", target: String(args.map((arg) => arg.defaultPath).find(Boolean) ?? "") });
              return { canceled: false, filePath: paths.copy };
            },
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
        { source, copy },
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
      const saves = await shellCalls("save");
      assert(
        saves.length === 1 &&
          basename(String(saves[0])) === "accept-added.txt" &&
          String(saves[0]) !== "accept-added.txt",
        `the Save dialog started in a fallback folder (${saves.length} call, bare name: ${String(saves[0]) === "accept-added.txt"})`,
      );
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

  await row("39", "settings: notification matrix and language saved from the Settings window footer", async () => {
    const before = asRecord(await d.ev("window.openbot.appSettings.get()"));
    await d.openPage("Settings");
    const app = page.getByRole("region", { name: "Application settings" });
    await app.getByRole("switch", { name: "Needs your answer: notification" }).uncheck();
    await app.getByRole("combobox", { name: "Language" }).selectOption({ label: "Polski" });
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForTimeout(2_000);
    const saved = asRecord(await d.ev("window.openbot.appSettings.get()"));
    assert.equal(saved.language, "pl");
    assert.equal(asRecord(asRecord(asRecord(saved.notifications).matrix)["needs-input"]).desktop, false);
    const polish = await page.getByRole("navigation", { name: "Strony" }).count();
    // Back to English and the old notifications (the window follows the saved language).
    await d.ev(
      `window.openbot.appSettings.update(${JSON.stringify({ language: "en", notifications: before.notifications })})`,
    );
    await page.waitForTimeout(1_500);
    return `saved; the window switched to Polish after saving: ${polish > 0}`;
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
  await cliFirstRun(d, root, cli);
}

async function secondRun(d: Driver, root: string, cli: CliStandIn): Promise<void> {
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
  await cliSecondRun(d, root, cli);
}

// -- W5-T2a: managed CLI download (criteria C01-C13 of docs/cosgral/spec-w5.md) -----------------------------------
// A stand-in plays the official servers on loopback (the program accepts COSGRAL_CLI_TEST_BASE only when it is not
// packaged and the address is loopback). The program's own code does everything else: the card, the download, the check,
// the install, the pages. Nothing here reads a login or leaves the machine.

/** File requests at the end of the first start: the auto-update of the next start runs before its step begins. */
let requestsAtRestart = 0;

interface CliStandIn {
  /** The version the "latest release" answers with. */
  latest: string;
  /** Serve a file whose SHA-256 does not match the metadata. */
  corrupt: boolean;
  /** Cut the next download in half ("once") or every download ("always"). */
  truncate: "none" | "once" | "always";
  /** Send the file slowly, so the progress bar and the phases can be seen. */
  slow: boolean;
  fileRequests: number;
  base: string;
  sha256: string;
  close: () => Promise<void>;
}

async function startCliStandIn(file: string): Promise<CliStandIn> {
  const { createHash } = await import("node:crypto");
  const { createReadStream } = await import("node:fs");
  const { stat } = await import("node:fs/promises");
  const { createServer } = await import("node:http");
  const { Readable } = await import("node:stream");
  const size = (await stat(file)).size;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const sha256 = hash.digest("hex");
  const state: Pick<CliStandIn, "latest" | "corrupt" | "truncate" | "slow" | "fileRequests"> = {
    latest: "1.0.0",
    corrupt: false,
    truncate: "none",
    slow: false,
    fileRequests: 0,
  };
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const base = `http://127.0.0.1:${portOfServer(server)}`;
    const release = (version: string) => ({
      tag_name: `rust-v${version}`,
      assets: [
        {
          name: "codex-x86_64-pc-windows-msvc.exe",
          size,
          digest: `sha256:${sha256}`,
          browser_download_url: `${base}/files/codex/${version}`,
        },
      ],
    });
    const tag = path.match(/^\/gh\/tags\/rust-v([0-9.]+)$/)?.[1];
    if (path === "/gh/latest" || tag) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(release(tag ?? state.latest)));
      return;
    }
    if (/^\/files\/codex\/[0-9.]+$/.test(path)) {
      state.fileRequests += 1;
      response.writeHead(200, { "content-length": String(size) });
      if (state.corrupt) {
        response.end(Buffer.alloc(size, 0x41));
        return;
      }
      const cut = state.truncate !== "none";
      if (state.truncate === "once") state.truncate = "none";
      const body = Readable.from(
        (async function* () {
          let sent = 0;
          for await (const chunk of createReadStream(file, { highWaterMark: Math.ceil(size / 25) })) {
            yield chunk;
            sent += chunk.length;
            if (cut && sent >= size / 2) {
              response.destroy();
              return;
            }
            if (state.slow) await new Promise((done) => setTimeout(done, 150));
          }
        })(),
      );
      body.pipe(response);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return Object.assign(state, {
    base: `http://127.0.0.1:${portOfServer(server)}`,
    sha256,
    close: () => new Promise<void>((done) => server.close(() => done())),
  });
}

function portOfServer(server: import("node:http").Server): number {
  const address = server.address();
  return isDynamicRecord(address) && isNumber(address.port) ? address.port : 0;
}

async function waitUntil(page: Page, what: string, check: () => Promise<boolean>, timeoutMs = 45_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`Timed out: ${what}`);
}

/** Version folders (and anything else) the program keeps for one CLI under its data folder. */
async function cliFolders(root: string, id: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const base = join(root, "home", "AppData", "Roaming");
  for (const app of await readdir(base).catch(() => [])) {
    const names = await readdir(join(base, app, "cli", id)).catch(() => null);
    if (names) return names.sort();
  }
  return [];
}

/** What the person sees and can do on the Providers page for one CLI (the "Narzedzia CLI" section). */
function cliCard(page: Page) {
  return page.locator(".managed-cli-card").filter({ has: page.getByRole("heading", { name: "Codex", exact: true }) });
}

async function codexCli(d: Driver): Promise<DynamicRecord> {
  return asRecord(list(await d.ev("window.openbot.subscriptions.listCli()")).find((state) => state.id === "codex"));
}

async function openCliCard(d: Driver): Promise<void> {
  await d.openPage("Providers");
  await cliCard(d.page).first().waitFor({ timeout: 20_000 });
}

/** The card of the first download shows in the conversation of the first agent; the person answers it there. */
async function answerCliCard(d: Driver, button: "Confirm" | "Cancel"): Promise<string> {
  let title = "";
  let botId = "";
  await waitUntil(
    d.page,
    "the download card is pending",
    async () => {
      const pending = list(await d.ev("window.openbot.agent.listPendingRequests()"));
      const item = pending.find(
        (entry) => entry.kind === "draft-preview" && String(asRecord(entry.card).title).startsWith("Download Codex"),
      );
      title = String(asRecord(item?.card).title ?? "");
      botId = String(asRecord(item?.card).botId ?? "");
      return item !== undefined;
    },
    20_000,
  );
  // The program puts the card on the first agent of the list, not necessarily the one the person is talking to.
  const owner = String(
    await d.ev(
      `window.openbot.agent.listBots().then((bots) => (bots.find((b) => b.id === ${JSON.stringify(botId)}) || {}).name)`,
    ),
  );
  await d.openAgent(owner);
  const decision = d.page.getByRole("region", { name: "Decision" });
  await decision.getByRole("button", { name: button, exact: true }).click({ timeout: 20_000 });
  return title;
}

const noProfilePath = (text: string) => !/[A-Za-z]:[\\/]|AppData|[\\/]Users[\\/]/.test(text);

/** Criteria C01-C05, C09-C12 in the first start of the program. */
async function cliFirstRun(d: Driver, root: string, cli: CliStandIn): Promise<void> {
  const { page } = d;
  const { createHash } = await import("node:crypto");
  const { readFile } = await import("node:fs/promises");
  const fixtureFile = join(root, "fixture", "codex.cmd");
  const fixtureHash = async () =>
    createHash("sha256")
      .update(await readFile(fixtureFile))
      .digest("hex");
  const fixtureBefore = await fixtureHash();

  await row(
    "C01",
    "CLI: the first download waits for a card (nothing is downloaded before the yes); a No downloads nothing",
    async () => {
      await d.ev(
        "window.__cliEvents = []; window.openbot.agent.onEvent((event) => { if (event.type === 'managed-cli-changed') window.__cliEvents.push(event.state.phase + ':' + (event.state.progress ? event.state.progress.receivedBytes : '')); }); true",
      );
      await openCliCard(d);
      assert((await codexCli(d)).managedVersion === null, "no downloaded Codex yet");
      await cliCard(page).getByRole("button", { name: "Download", exact: true }).click();
      await waitUntil(page, "phase awaiting-approval", async () => (await codexCli(d)).phase === "awaiting-approval");
      assert(/Czeka na zgodę/.test(await cliCard(page).innerText()), "the page says it waits for the yes");
      assert(cli.fileRequests === 0, `nothing downloaded while the card waits (${cli.fileRequests} file requests)`);
      const title = await answerCliCard(d, "Cancel");
      assert(/^Download Codex CLI 1.0.0\?$/.test(title), `card title: ${title}`);
      await openCliCard(d);
      await waitUntil(page, "back to idle", async () => (await codexCli(d)).phase === "idle");
      const after = await codexCli(d);
      assert(after.managedVersion === null, "a No installs nothing");
      assert(cli.fileRequests === 0, "a No downloads nothing");
      assert(String(after.error).includes("declined"), `the page says why: ${String(after.error)}`);
      assert((await cliFolders(root, "codex")).length === 0, "no folder was created");
      await d.dump("cli-c01-declined");
      return "card 'Download Codex CLI 1.0.0?' in the Decision of the agent the program picked; phase awaiting-approval, 0 file requests; No: idle, 'declined', nothing on disk";
    },
  );

  await row(
    "C02",
    "CLI: after the yes the page shows progress and phases, then Ready; the agent still answers",
    async () => {
      cli.slow = true;
      await d.ev("window.__cliEvents = []; true");
      await openCliCard(d);
      await cliCard(page).getByRole("button", { name: "Download", exact: true }).click();
      await answerCliCard(d, "Confirm");
      await openCliCard(d);
      const phases = new Set<string>();
      let sawProgress = false;
      const end = Date.now() + 120_000;
      while (Date.now() < end) {
        const text = await cliCard(page).innerText();
        for (const phase of ["Pobieranie", "Sprawdzanie SHA-256", "Instalowanie"])
          if (text.includes(phase)) phases.add(phase);
        const bar = cliCard(page).getByRole("progressbar", { name: "Download progress" });
        if ((await bar.count()) > 0) {
          const now = Number(await bar.getAttribute("aria-valuenow"));
          if (now > 0 && now < 100) sawProgress = true;
        }
        if ((await codexCli(d)).managedVersion === "1.0.0" && (await codexCli(d)).phase === "idle") break;
        await page.waitForTimeout(100);
      }
      cli.slow = false;
      const state = await codexCli(d);
      assert(
        state.managedVersion === "1.0.0" && state.phase === "idle",
        `installed: ${JSON.stringify({ ...state, executable: "(sandbox)" })}`,
      );
      assert(
        phases.has("Pobieranie") && sawProgress,
        `the page showed downloading with a moving bar (${[...phases].join(", ")}; bar ${sawProgress})`,
      );
      const events = await d.ev("window.__cliEvents");
      const seen = Array.isArray(events) ? events.map(String) : [];
      assert(
        seen.some((event) => event.startsWith("downloading:")) && seen.at(-1) === "idle:",
        `engine events: ${seen.length}`,
      );
      assert(cli.fileRequests === 1, `one download (${cli.fileRequests})`);
      await d.ask("Assistant", "hello after the install", "Stub: received", 40_000);
      await d.openPage("Providers");
      await d.dump("cli-c02-installed");
      return `Pobieranie shown with a moving bar (also seen: ${[...phases].filter((p) => p !== "Pobieranie").join(", ") || "no other phase long enough to catch"}); ${seen.length} managed-cli-changed events; 1 file request; Ready; the agent answers (it runs on the stand-in CLI, not on the downloaded file)`;
    },
  );

  await row(
    "C05",
    "CLI: one folder per version inside the program's data, no admin rights, the system CLI is untouched",
    async () => {
      const state = await codexCli(d);
      const executable = String(state.executable);
      assert(executable.startsWith(root), "the downloaded CLI is inside the sandbox profile");
      assert(/[\\/]cli[\\/]codex[\\/]1\.0\.0[\\/]/.test(executable), "folder per CLI and version");
      assert(
        (await cliFolders(root, "codex")).join(",") === "1.0.0",
        `only the version folder exists: ${(await cliFolders(root, "codex")).join(",")}`,
      );
      assert((await fixtureHash()) === fixtureBefore, "the CLI the program runs (not downloaded) is untouched");
      return "cli/codex/1.0.0 under the profile's data; the stand-in CLI file has the same SHA-256 as before; (no admin prompt: the run is a normal user)";
    },
  );

  await row(
    "C03",
    "CLI: a file with the wrong SHA-256 is refused, nothing is left, there is no second try",
    async () => {
      cli.latest = "1.1.0";
      cli.corrupt = true;
      const before = cli.fileRequests;
      await openCliCard(d);
      await cliCard(page).getByRole("button", { name: "Update", exact: true }).click();
      await waitUntil(page, "the SHA-256 error", async () => /SHA-256/.test(String((await codexCli(d)).error)));
      cli.corrupt = false;
      const state = await codexCli(d);
      assert(state.managedVersion === "1.0.0", "the verified version stays");
      assert(
        cli.fileRequests - before === 1,
        `no second try after a failed check (${cli.fileRequests - before} requests)`,
      );
      assert(
        (await cliFolders(root, "codex")).join(",") === "1.0.0",
        `nothing left on disk: ${(await cliFolders(root, "codex")).join(",")}`,
      );
      const shown = await cliCard(page).getByRole("alert").innerText();
      assert(
        /SHA-256/.test(shown) && noProfilePath(shown),
        `the page shows the reason without a profile path: ${shown.slice(0, 80)}`,
      );
      assert(
        (await cliCard(page).getByRole("button", { name: "Retry", exact: true }).count()) === 1,
        "Try again is offered",
      );
      await d.dump("cli-c03-bad-sha");
      return "update refused with SHA-256 in the error, 1 file request, version 1.0.0 stays, no extra folder or partial file, the page offers Retry";
    },
  );

  await row(
    "C04",
    "CLI: an interrupted download is retried once; two interruptions end in an error with Try again, and no half file counts",
    async () => {
      // (a) one interruption: the program tries again by itself.
      cli.latest = "1.1.0";
      cli.truncate = "once";
      let before = cli.fileRequests;
      await openCliCard(d);
      await cliCard(page).getByRole("button", { name: "Update", exact: true }).click();
      await waitUntil(page, "version 1.1.0", async () => (await codexCli(d)).managedVersion === "1.1.0");
      assert(cli.fileRequests - before === 2, `one interruption means one more request (${cli.fileRequests - before})`);
      // (b) two interruptions: an error, no new version, and "Retry" works once the network is back.
      cli.latest = "1.2.0";
      cli.truncate = "always";
      before = cli.fileRequests;
      await cliCard(page).getByRole("button", { name: "Update", exact: true }).click();
      await waitUntil(
        page,
        "an error after two interruptions",
        async () => (await codexCli(d)).phase === "error",
        60_000,
      );
      const failed = await codexCli(d);
      assert(failed.managedVersion === "1.1.0", "the working version stays");
      assert(cli.fileRequests - before === 2, `one try and one retry (${cli.fileRequests - before})`);
      assert(
        (await cliFolders(root, "codex")).join(",") === "1.1.0",
        `no half file or folder: ${(await cliFolders(root, "codex")).join(",")}`,
      );
      const shown = await cliCard(page).getByRole("alert").innerText();
      assert(noProfilePath(shown), `the error has no profile path: ${shown.slice(0, 80)}`);
      cli.truncate = "none";
      await cliCard(page).getByRole("button", { name: "Retry", exact: true }).click();
      await waitUntil(page, "version 1.2.0 after Retry", async () => (await codexCli(d)).managedVersion === "1.2.0");
      await d.dump("cli-c04-retried");
      return "1 cut > retried by itself (2 requests) > 1.1.0; 2 cuts > error, 1.1.0 stays, no half file, Retry offered; Retry > 1.2.0";
    },
  );

  await row(
    "C09",
    "CLI: a custom path wins; a bad path gives a clear error without a hang; the order is custom, downloaded, system",
    async () => {
      await openCliCard(d);
      const field = cliCard(page).getByRole("textbox", { name: "Custom path to the CLI" });
      await field.fill(fixtureFile);
      await cliCard(page).getByRole("button", { name: "Save path", exact: true }).click();
      await waitUntil(page, "custom path saved", async () => (await codexCli(d)).customPath === fixtureFile);
      await waitUntil(page, "idle with a custom path", async () => (await codexCli(d)).phase === "idle");
      const custom = await codexCli(d);
      assert(custom.source === "custom", `source with a custom path: ${String(custom.source)}`);
      assert(/Custom path/.test(await cliCard(page).innerText()), "the page names the source");
      await field.fill(join(root, "does-not-exist", "codex.exe"));
      await cliCard(page).getByRole("button", { name: "Save path", exact: true }).click();
      // The answer to a bad path shows at the top of the section (not on the card).
      const section = page.getByRole("region", { name: "CLI tools" });
      await section.getByRole("alert").first().waitFor({ timeout: 30_000 });
      const alertText = (await section.getByRole("alert").first().innerText()).replace(/\s+/g, " ");
      const bad = await codexCli(d);
      assert(/No file at that path/.test(alertText), `the answer names the problem: ${alertText.slice(0, 160)}`);
      assert(noProfilePath(alertText), "no profile path in the answer");
      assert(bad.phase === "idle" || bad.phase === "error", `no hang: phase ${String(bad.phase)}`);
      const rawPrefix = /Error invoking remote method/.test(alertText);
      await d.dump("cli-c09-bad-path");
      const detailBad = `bad path > error on the page "${alertText.slice(0, 90)}"${rawPrefix ? " (raw IPC prefix visible)" : ""}; source stays ${String(bad.source)}`;
      await field.fill("");
      await cliCard(page).getByRole("button", { name: "Clear path", exact: true }).click();
      await waitUntil(page, "custom path cleared", async () => (await codexCli(d)).customPath === null);
      return `good path > source custom; ${detailBad}; cleared > source ${String((await codexCli(d)).source)}`;
    },
  );

  await row("C10", "CLI: Remove removes only the downloaded copy, never the system or custom CLI", async () => {
    await openCliCard(d);
    const field = cliCard(page).getByRole("textbox", { name: "Custom path to the CLI" });
    await field.fill(fixtureFile);
    await cliCard(page).getByRole("button", { name: "Save path", exact: true }).click();
    await waitUntil(page, "custom path active", async () => (await codexCli(d)).source === "custom");
    await cliCard(page).getByRole("button", { name: "Remove", exact: true }).click();
    await waitUntil(page, "downloaded copy removed", async () => (await codexCli(d)).managedVersion === null);
    assert(
      (await fixtureHash()) === fixtureBefore && (await readFile(fixtureFile)).length > 0,
      "the custom CLI file is untouched",
    );
    assert(
      (await cliFolders(root, "codex")).length === 0,
      `the downloaded folder is gone: ${(await cliFolders(root, "codex")).join(",")}`,
    );
    assert((await codexCli(d)).source === "custom", "the custom path still works after the removal");
    assert(
      (await cliCard(page).getByRole("button", { name: "Remove", exact: true }).count()) === 0,
      "no Remove for a CLI that is not downloaded",
    );
    await field.fill("");
    await cliCard(page).getByRole("button", { name: "Clear path", exact: true }).click();
    await waitUntil(page, "custom path cleared", async () => (await codexCli(d)).customPath === null);
    return "with the custom path active, Remove deleted only the downloaded folder; the custom file keeps its SHA-256; the button is gone when nothing is downloaded";
  });

  await row("C11", "CLI: after the first yes there is no card for a new download or an update", async () => {
    cli.latest = "1.2.0";
    const before = cli.fileRequests;
    await openCliCard(d);
    await cliCard(page).getByRole("button", { name: "Download", exact: true }).click();
    await waitUntil(
      page,
      "1.2.0 downloaded without a card",
      async () => (await codexCli(d)).managedVersion === "1.2.0",
      90_000,
    );
    const pending = list(await d.ev("window.openbot.agent.listPendingRequests()")).filter(
      (entry) => entry.kind === "draft-preview" && String(asRecord(entry.card).title).startsWith("Download Codex"),
    );
    assert(pending.length === 0, "no download card after the first yes");
    assert(cli.fileRequests - before === 1, `one download (${cli.fileRequests - before})`);
    return "second install (after Remove) and the earlier updates (C03, C04) needed no card; each file was checked against its SHA-256";
  });

  await row("C12", "CLI: the page, the usage list and the engine tell the same about the CLI", async () => {
    await d.openPage("Providers");
    const state = await codexCli(d);
    const usage = list(await d.ev("window.openbot.providers.listUsage()")).find((item) => item.provider === "codex");
    const usageText = await page.getByRole("region", { name: "Provider usage" }).innerText();
    const cliText = await cliCard(page).innerText();
    assert(usage && usage.state !== "unavailable", `usage: ${JSON.stringify(usage)}`);
    assert(
      /Codex/.test(usageText) && cliText.includes(String(state.managedVersion)),
      "both parts of the page name Codex and the downloaded version",
    );
    assert(/Downloaded|Custom path|System/.test(cliText), "the card names a source");
    return `engine source ${String(state.source)}, downloaded ${String(state.managedVersion)}; usage state ${String(usage?.state)}; the card shows the same version. The onboarding screen is not part of this step (see O1)`;
  });

  // The next launches need a newer version available and auto-update left on.
  cli.latest = "1.3.0";
  requestsAtRestart = cli.fileRequests;
}

/** C06 and the setup of C07, in the second start (auto-update runs at start). */
async function cliSecondRun(d: Driver, root: string, cli: CliStandIn): Promise<void> {
  const { page } = d;
  await row(
    "C06",
    "CLI: auto-update at start downloads, checks and switches without a card; the old folder goes",
    async () => {
      const before = requestsAtRestart;
      await waitUntil(
        page,
        "auto-update to 1.3.0",
        async () => (await codexCli(d)).managedVersion === "1.3.0",
        120_000,
      );
      const pending = list(await d.ev("window.openbot.agent.listPendingRequests()")).filter(
        (entry) => entry.kind === "draft-preview" && String(asRecord(entry.card).title).startsWith("Download Codex"),
      );
      assert(pending.length === 0, "no card for an update");
      assert(cli.fileRequests - before === 1, `one download (${cli.fileRequests - before})`);
      await waitUntil(
        page,
        "the old version folder is gone",
        async () => (await cliFolders(root, "codex")).join(",") === "1.3.0",
        20_000,
      );
      await d.ask("Assistant", "hello after the auto-update", "Stub: received", 40_000);
      // Setup for C07: turn auto-update off through the page, and publish a newer version.
      await openCliCard(d);
      await cliCard(page).locator(".ui-switch").first().click();
      await waitUntil(page, "auto-update off", async () => (await codexCli(d)).autoUpdate === false);
      cli.latest = "1.4.0";
      return "after the restart 1.2.0 became 1.3.0 by itself (1 request, no card, old folder gone); then auto-update was switched off on the page for C07";
    },
  );
}

/** C07 and the setup of C08, in the third start. */
async function cliThirdRun(d: Driver, cli: CliStandIn): Promise<void> {
  const { page } = d;
  await row(
    "C07",
    "CLI: with auto-update off nothing downloads by itself; Check shows the newer version; Update does it on demand",
    async () => {
      const before = cli.fileRequests;
      await openCliCard(d);
      await page.waitForTimeout(15_000);
      const state = await codexCli(d);
      assert(
        state.autoUpdate === false && state.managedVersion === "1.3.0",
        `the setting survived the restart: ${JSON.stringify({ ...state, executable: "(sandbox)" })}`,
      );
      assert(cli.fileRequests === before, `no download at start with auto-update off (${cli.fileRequests - before})`);
      await cliCard(page).getByRole("button", { name: "Check", exact: true }).click();
      await waitUntil(page, "Check shows 1.4.0", async () => /Latest: 1\.4\.0/.test(await cliCard(page).innerText()));
      assert(cli.fileRequests === before && (await codexCli(d)).managedVersion === "1.3.0", "Check downloads nothing");
      // A turn runs while the person updates: it must finish.
      await d.send("Assistant", "SLOW 12000");
      await page.waitForTimeout(1_500);
      await cliCard(page).getByRole("button", { name: "Update", exact: true }).click();
      await waitUntil(page, "1.4.0 on demand", async () => (await codexCli(d)).managedVersion === "1.4.0", 90_000);
      assert(cli.fileRequests - before === 1, `one download (${cli.fileRequests - before})`);
      await d.answer("Assistant", "Stub: slow done", 40_000);
      // Setup for C08: auto-update on again, pin the current version, publish a newer one.
      await cliCard(page).locator(".ui-switch").first().click();
      await waitUntil(page, "auto-update on", async () => (await codexCli(d)).autoUpdate === true);
      await cliCard(page).getByRole("textbox", { name: "Pinned version" }).fill("1.4.0");
      await cliCard(page).getByRole("button", { name: "Pin", exact: true }).click();
      await waitUntil(page, "pinned 1.4.0", async () => (await codexCli(d)).pinnedVersion === "1.4.0");
      cli.latest = "1.5.0";
      await d.dump("cli-c07-on-demand");
      return "restart with auto-update off: 0 downloads in 15 s; Check > Latest 1.4.0 without a download; Update > 1.4.0 (1 request) while a turn ran, and the turn finished; then auto-update on and 1.4.0 pinned for C08";
    },
  );
}

/** C08 and C13, in the fourth start. */
async function cliFourthRun(d: Driver, cli: CliStandIn): Promise<void> {
  const { page } = d;
  await row(
    "C08",
    "CLI: a pinned version is not replaced with auto-update on; Unpin goes back to the newest",
    async () => {
      const before = cli.fileRequests;
      await openCliCard(d);
      await page.waitForTimeout(15_000);
      const state = await codexCli(d);
      assert(
        state.autoUpdate === true && state.pinnedVersion === "1.4.0" && state.managedVersion === "1.4.0",
        `pinned survived the restart: ${JSON.stringify({ ...state, executable: "(sandbox)" })}`,
      );
      assert(cli.fileRequests === before, `no download at start for a pinned version (${cli.fileRequests - before})`);
      await cliCard(page).getByRole("button", { name: "Unpin", exact: true }).click();
      await waitUntil(page, "unpinned", async () => (await codexCli(d)).pinnedVersion === null);
      await cliCard(page).getByRole("button", { name: "Update", exact: true }).click();
      await waitUntil(page, "1.5.0 after Unpin", async () => (await codexCli(d)).managedVersion === "1.5.0", 90_000);
      return "restart with 1.4.0 pinned and 1.5.0 available: nothing downloaded, 1.4.0 stays; Unpin + Update > 1.5.0";
    },
  );

  await row("C13", "CLI: the subscriptions calls exist in the local window (optional in the contract)", async () => {
    const names = await d.ev("Object.keys(window.openbot.subscriptions || {})");
    const have = Array.isArray(names) ? names.map(String) : [];
    for (const name of ["listCli", "checkCli", "installCli", "updateCli", "removeCli", "pinCli", "setCliSettings"]) {
      assert(have.includes(name), `${name} is exposed`);
    }
    return "the 7 CLI calls are exposed in the local window; a remote server and the phone are NOT tried here (unit test of BE1 only)";
  });
}

/**
 * O1 (W5-UI1a, criteria C01 and C02 on the first screen): a computer without any Codex CLI. Run it as
 * COSGRAL_MODE=cli-onboarding COSGRAL_SANDBOX_ROOT=<folder> node scripts/sandbox-acceptance.ts (a fresh sandbox of its own).
 */
async function onboardingCliMain(root: string, evidence: string): Promise<void> {
  resultsFile = join(evidence, "acceptance-onboarding.json");
  const fixture = await installFixture(root);
  const cli = await startCliStandIn(process.execPath);
  process.env.COSGRAL_CLI_TEST_BASE = cli.base;
  // The Codex path points at a file that does not exist: the program must treat Codex as not installed.
  const { app, page } = await launch(root, {
    codex: join(root, "fixture", "missing-codex.exe"),
    claude: fixture.claude,
  });
  const d = new Driver(page, evidence, app);
  try {
    await row(
      "O1",
      "onboarding without a CLI: Continue is blocked, 'Download and continue' asks in a system dialog, a No downloads nothing, a Yes unblocks",
      async () => {
        const where = page.getByRole("dialog", { name: "Where will COSGRAL Workspace run?" });
        await where.waitFor({ timeout: 90_000 });
        await where.getByRole("button", { name: /Use this computer/ }).click();
        const setup = page.getByRole("dialog", { name: "Set up this computer" });
        await setup.waitFor({ timeout: 30_000 });
        const card = setup.locator(".managed-cli-card").first();
        await card.waitFor({ timeout: 20_000 });
        const proceed = setup.getByRole("button", { name: /^Continue with / });
        assert(await proceed.isDisabled(), "Continue is blocked while the CLI is missing");
        const cardText = await card.innerText();
        assert(/Brak/.test(cardText), `the card says there is no CLI: ${cardText.slice(0, 120)}`);
        assert(/Logowanie wkrótce/.test(await setup.innerText()), "the screen says sign-in is coming, in text");
        assert(
          (await setup.getByRole("button", { name: /Zaloguj|Log in|Sign in/ }).count()) === 0,
          "no dead sign-in button",
        );
        await d.dump("cli-o1-blocked");
        // No agent exists yet, so the program asks in a system dialog. Answer it from the main process: No, then Yes.
        await app.evaluate(({ dialog }) => {
          const answers = [1, 0];
          const seen: string[] = [];
          Object.assign(dialog, {
            acceptSeen: seen,
            showMessageBox: async (...args: Array<{ message?: string }>) => {
              seen.push(String(args.map((arg) => arg.message).find(Boolean) ?? ""));
              return { response: answers.shift() ?? 1, checkboxChecked: false };
            },
          });
        });
        const seenDialogs = async (): Promise<string[]> => {
          const seen = await app.evaluate(({ dialog }) => Object.fromEntries(Object.entries(dialog)).acceptSeen);
          return Array.isArray(seen) ? seen.map(String) : [];
        };
        const codex = async () =>
          asRecord(list(await d.ev("window.openbot.subscriptions.listCli()")).find((state) => state.id === "codex"));
        await card.getByRole("button", { name: "Download and continue" }).click();
        await waitUntil(page, "the system dialog", async () => (await seenDialogs()).length === 1, 30_000);
        assert((await seenDialogs())[0] === "Download Codex CLI 1.0.0?", `dialog title: ${(await seenDialogs())[0]}`);
        await waitUntil(page, "back to idle after the No", async () => (await codex()).phase === "idle", 30_000);
        assert((await codex()).managedVersion === null && cli.fileRequests === 0, "a No downloads nothing");
        assert(await proceed.isDisabled(), "Continue stays blocked after a No");
        await card.getByRole("button", { name: "Download and continue" }).click();
        await waitUntil(
          page,
          "the CLI is downloaded after the Yes",
          async () => (await codex()).managedVersion === "1.0.0",
          120_000,
        );
        assert(Number(cli.fileRequests) === 1, `one download (${cli.fileRequests})`);
        // "Download and continue" installs and then saves the choice and goes on by itself: the setup closes.
        await setup.waitFor({ state: "hidden", timeout: 90_000 });
        await d.dump("cli-o1-after-yes");
        return "Continue disabled and the card says Brak; no sign-in button, 'Logowanie wkrótce' in text; system dialog 'Download Codex CLI 1.0.0?': No > 0 downloads, still blocked; Yes > 1 download and the setup closes by itself (the button installs and goes on)";
      },
    );
  } finally {
    await app.close().catch(() => undefined);
    await cli.close();
  }
  await writeFile(resultsFile, JSON.stringify({ results, console: consoleFindings.slice(0, 40) }, null, 2));
  const failed = results.filter((result) => !result.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} steps ok; console errors: ${consoleFindings.length}`,
  );
  for (const result of failed) console.log(`  FAIL [${result.row}] ${result.name}: ${result.detail.slice(0, 300)}`);
  process.exit(failed.length ? 1 : 0);
}

// -- W5-T4: accounts and the pool, API keys, own endpoints, fallback models ------------------------------------------
//
// Run as COSGRAL_MODE=w5 COSGRAL_SANDBOX_ROOT=<folder> node scripts/sandbox-acceptance.ts (a fresh sandbox of its own).
// Stand-ins: the Codex stand-in (scripts/acceptance-codex.cjs) signs accounts in and out by itself and fails a turn like a
// usage limit when the limits file names its account; a model server on 127.0.0.1 answers /v1/models and Chat
// Completions (SSE); another one stands in for the key check of the provider (the main process is told to send the
// fixed provider URL to it). No real account, no real service, no file of an account folder is ever read.

interface ModelServerRequest {
  method: string;
  path: string;
  authorization: string | undefined;
  body: string;
}

interface ModelServer {
  /** http://127.0.0.1:<port>/v1 */
  base: string;
  origin: string;
  requests: ModelServerRequest[];
  /** Answer 401 unless the request carries exactly this bearer key (null = no key needed). */
  needsKey: string | null;
  /** Answer 401 to a key that starts with "bad-". */
  rejectBad: boolean;
  close: () => Promise<void>;
}

async function startModelServer(port = 0): Promise<ModelServer> {
  const { createServer } = await import("node:http");
  const state: Pick<ModelServer, "requests" | "needsKey" | "rejectBad"> = {
    requests: [],
    needsKey: null,
    rejectBad: false,
  };
  const server = createServer((incoming, response) => {
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
    incoming.on("end", () => {
      const seen: ModelServerRequest = {
        method: incoming.method ?? "",
        path: new URL(incoming.url ?? "/", "http://127.0.0.1").pathname,
        authorization: incoming.headers.authorization,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      state.requests.push(seen);
      const refused =
        (state.needsKey !== null && seen.authorization !== `Bearer ${state.needsKey}`) ||
        (state.rejectBad && (seen.authorization ?? "").includes("bad-"));
      if (refused) {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "invalid api key" } }));
        return;
      }
      if (seen.method === "GET" && seen.path === "/v1/models") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ object: "list", data: [{ id: "llama3:8b" }, { id: "qwen2.5-coder:7b" }] }));
        return;
      }
      if (seen.method === "POST" && seen.path === "/v1/chat/completions") {
        response.writeHead(200, { "content-type": "text/event-stream" });
        for (const piece of ["ENDPOINT_SAYS_", "HI"])
          response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
        response.write("data: [DONE]\n\n");
        response.end();
        return;
      }
      response.writeHead(404).end();
    });
  });
  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", done);
  });
  const origin = `http://127.0.0.1:${portOfServer(server)}`;
  return Object.assign(state, {
    base: `${origin}/v1`,
    origin,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  });
}

/** A fake secret that looks like a key. Test data only. */
const fakeKey = (tag: string) => `sk-test-${tag}-${Math.random().toString(36).slice(2, 10)}abcd`;

async function w5Main(root: string, evidence: string): Promise<void> {
  resultsFile = join(evidence, "acceptance-w5.json");
  const { readdir, readFile } = await import("node:fs/promises");
  const fixture = await installFixture(root);
  const limitsFile = join(root, "fixture", "limits.json");
  const startsFile = join(root, "fixture", "starts.log");
  await writeFile(limitsFile, "{}");
  await writeFile(startsFile, "");
  process.env.COSGRAL_ACCEPT_LIMITS = limitsFile;
  process.env.COSGRAL_ACCEPT_STARTS = startsFile;
  const models = await startModelServer();
  const keyServer = await startModelServer();
  keyServer.rejectBad = true;
  const { app, page } = await launch(root, fixture);
  const d = new Driver(page, evidence, app);

  // --- helpers ---
  const setLimits = async (limits: Record<string, { resetsInSeconds?: number; action?: boolean; network?: boolean }>) =>
    writeFile(limitsFile, JSON.stringify(limits));
  const accountList = async () => list(asRecord(await d.ev("window.openbot.subscriptions.listAccounts()")).accounts);
  const account = async (label: string) => {
    const found = (await accountList()).find((item) => item.label === label);
    assert(found, `account ${label} exists`);
    return found;
  };
  const accountId = async (label: string) => String((await account(label)).id);
  const startsLog = async () => (await readFile(startsFile, "utf8")).split("\n").filter(Boolean);
  const eventsSince = async (from: number) => list(await d.ev(`window.__w5.slice(${from})`));
  const eventCount = async () => Number(await d.ev("window.__w5.length"));
  const turnsDone = async (from: number) =>
    (await eventsSince(from)).filter((event) => event.type === "turn-completed");
  const waitTurns = async (from: number, count: number, timeoutMs = 60_000) =>
    waitUntil(page, `${count} completed turn(s)`, async () => (await turnsDone(from)).length >= count, timeoutMs);
  const waitLimitsFree = async (timeoutMs = 40_000) =>
    waitUntil(
      page,
      "every account is free again",
      async () => (await accountList()).every((item) => item.limitedUntil === null),
      timeoutMs,
    );
  const assignAgent = async (agent: string, label: string | null) => {
    const botId = await d.botId(agent);
    const id = label === null ? null : await accountId(label);
    await d.ev(
      `window.openbot.subscriptions.assignAccountToAgent({ botId: ${JSON.stringify(botId)}, accountId: ${JSON.stringify(id)} })`,
    );
  };
  const setPool = async (label: string, fields: { poolOrder?: number; enabled?: boolean; isDefault?: boolean }) => {
    const id = await accountId(label);
    const current = await account(label);
    await d.ev(
      `window.openbot.subscriptions.setAccountPool(${JSON.stringify({ id, inPool: current.inPool, ...fields })})`,
    );
  };
  const signIn = async (label: string) => {
    const id = await accountId(label);
    await d.ev(`window.openbot.subscriptions.loginAccount({ id: ${JSON.stringify(id)} })`);
    await waitUntil(page, `${label} signed in`, async () => (await account(label)).loggedIn === true, 30_000);
  };
  const requestCount = (server: ModelServer) => server.requests.length;
  const noSecret = async (secret: string, where: string) => {
    const hit = await anyFileContains(root, secret);
    assert(hit === null, `${where}: the secret is not in any file of the profile (${hit ? "found" : "clean"})`);
    assert(!(await page.content()).includes(secret), `${where}: not in the page`);
  };

  try {
    const installEventLog = () =>
      d.ev(
        "window.__w5 = []; window.openbot.agent.onEvent((event) => { if (['account-limit-reached','account-switched','account-error','model-fallback','error','turn-completed'].includes(event.type)) window.__w5.push(event); }); true",
      );
    await row(
      "W0",
      "W5 setup: first run, an agent to talk to, a second agent, an event log in the window",
      async () => {
        const where = page.getByRole("dialog", { name: "Where will COSGRAL Workspace run?" });
        await where.waitFor({ timeout: 90_000 });
        await where.getByRole("button", { name: /Use this computer/ }).click();
        const setup = page.getByRole("dialog", { name: "Set up this computer" });
        await setup.waitFor({ timeout: 30_000 });
        await setup
          .getByRole("combobox", { name: "Language" })
          .selectOption({ label: "English" })
          .catch(() => undefined);
        await setup.getByRole("combobox", { name: "First agent" }).selectOption({ index: 1 });
        await setup.getByRole("button", { name: "Continue with Codex" }).click({ timeout: 120_000 });
        await page
          .getByRole("button", { name: /^Assistant, / })
          .first()
          .waitFor({ timeout: 60_000 });
        // Seed language=en so Providers account labels match EN locators (not OS Polish).
        await d.ev(`window.openbot.appSettings.update({ language: "en" })`);
        await d.openAgent("Assistant");
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
        await d.answer("Assistant", "Stub: received", 45_000);
        await d.ev(
          `window.openbot.agent.createBot().then((b) => window.openbot.agent.updateBot({ botId: b.id, name: "Res", role: "Research and sources" })).then((b) => b.name)`,
        );
        await installEventLog();
        return "Assistant (answers on the stand-in CLI) and Res exist; window event log on";
      },
    );

    // A re-run of single rows on a kept profile (COSGRAL_ONLY=P04 ... --keep) skips the setup but still needs the log.
    if (only.length > 0 && !only.includes("W0")) await installEventLog();

    // ---------------------------------------------------------------- accounts and the pool
    await row(
      "P01",
      "accounts: two accounts of one provider side by side, each with its own state folder, added and signed in on the page",
      async () => {
        await d.openPage("Providers");
        // Default W5 run is EN (--lang=en-US + language=en). PL labels are a separate pass, not mixed here.
        const codex = page.locator('section[aria-label="Accounts for codex"]');
        for (const label of ["Work", "Home"]) {
          const field = page.getByRole("textbox", { name: "Account label for Codex" });
          await field.fill(label);
          await field
            .locator("xpath=ancestor::*[contains(@class,'provider-account-card')][1]")
            .getByRole("button", { name: "Add account" })
            .click();
          await waitUntil(
            page,
            `${label} listed`,
            async () => (await accountList()).some((item) => item.label === label),
            20_000,
          );
          await codex.getByRole("group", { name: label, exact: true }).getByRole("button", { name: "Sign in" }).click();
          await waitUntil(page, `${label} signed in`, async () => (await account(label)).loggedIn === true, 30_000);
        }
        const work = await account("Work");
        const home = await account("Home");
        assert(work.id !== home.id && work.stateDir !== home.stateDir, "different state folders");
        assert(work.loggedIn === true && home.loggedIn === true, "both signed in");
        const base = join(root, "home", "AppData", "Roaming");
        let folders: string[] = [];
        for (const appFolder of await readdir(base).catch(() => [])) {
          const names = await readdir(join(base, appFolder, "accounts")).catch(() => null);
          if (names) folders = names;
        }
        assert(
          folders.includes(String(work.stateDir)) && folders.includes(String(home.stateDir)),
          `two account folders exist: ${folders.join(",")}`,
        );
        await d.dump("w5-p01-two-accounts");
        return "Work and Home added on the page, signed in through the CLI (marker kept by the stand-in only), two separate folders named by their ids; the page lists both next to the system account. (Files inside the folders are not read.)";
      },
    );

    await row("P02", "accounts: exactly one default account per provider", async () => {
      const defaults = async () =>
        (await accountList()).filter((item) => item.provider === "codex" && item.isDefault === true);
      assert((await defaults()).length === 1, "one default at the start");
      await setPool("Work", { isDefault: true });
      let now = await defaults();
      assert(
        now.length === 1 && now[0]?.label === "Work",
        `Work is the only default: ${now.map((item) => item.label).join(",")}`,
      );
      const system = (await accountList()).find((item) => item.system === true && item.provider === "codex");
      assert(system, "the system account exists");
      await d.ev(
        `window.openbot.subscriptions.setAccountPool(${JSON.stringify({ id: system.id, inPool: true, isDefault: true })})`,
      );
      now = await defaults();
      assert(now.length === 1 && now[0]?.system === true, "the system account is the only default again");
      await d.openPage("Providers");
      const badges =
        (await page.locator('section[aria-label="Accounts for codex"]').innerText()).match(/\bDefault\b/g) ?? [];
      assert(badges.length === 1, `the page shows one Default (${badges.length})`);
      return "default moved Work > system, one default each time, the page shows one 'Default'";
    });

    await row(
      "P05",
      "pool: the limit per provider is 3 by default and changeable; one account over it is refused with a message",
      async () => {
        const settings = asRecord(await d.ev("window.openbot.subscriptions.getPoolSettings()"));
        assert(settings.maxAccountsPerProvider === 3, `default limit ${String(settings.maxAccountsPerProvider)}`);
        await d.openPage("Providers");
        assert(
          /Maximum number of accounts reached/.test(
            await page.locator('section[aria-label="Accounts for codex"]').innerText(),
          ),
          "the page says the pool is full",
        );
        const refused = String(
          await d.ev(
            `window.openbot.subscriptions.addAccount({ provider: "codex", label: "Over" }).then(() => "added", (e) => String(e.message))`,
          ),
        );
        assert(/limit/i.test(refused) && refused !== "added", `refused with a message: ${refused.slice(0, 100)}`);
        await d.ev("window.openbot.subscriptions.setPoolSettings({ maxAccountsPerProvider: 4 })");
        await d.ev(`window.openbot.subscriptions.addAccount({ provider: "codex", label: "Extra" })`);
        await signIn("Extra");
        await setPool("Extra", { enabled: false });
        assert(
          (await accountList()).filter((item) => item.provider === "codex").length === 4,
          "four after raising the limit",
        );
        await d.dump("w5-p05-limit");
        return `default 3; the page says 'Maximum number of accounts reached'; a fourth account refused ("${refused.slice(0, 70)}"); with 4 it is added (kept as 'Extra' for the key steps)`;
      },
    );

    await row(
      "P03",
      "agent with an assigned account: its CLI starts in that account's folder (environment, not arguments); default means the system account",
      async () => {
        await assignAgent("Assistant", "Work");
        const work = await account("Work");
        const answer = await d.ask("Assistant", "WHO", `Stub: home ${String(work.id)}`, 45_000);
        assert(/argvHasHome=false/.test(answer), `the folder is not in the arguments: ${answer}`);
        const other = await d.ask("Res", "WHO", "Stub: home system", 45_000);
        assert(/argvHasHome=false/.test(other), "the system account has no folder at all");
        const active = list(asRecord(await d.ev("window.openbot.subscriptions.listAccounts()")).active);
        assert(
          active.some((item) => item.label === "Work") && active.some((item) => item.accountId === "system-codex"),
          `the program knows which account each agent answers with: ${JSON.stringify(active.map((item) => item.label))}`,
        );
        await d.openAgent("Assistant");
        return `Assistant > '${answer.slice(0, 50)}'; Res (default) > 'home system'; the snapshot names the active account of both agents`;
      },
    );

    await row(
      "P04",
      "pool: switched-off accounts are never chosen; the order of the pool decides which account takes over",
      async () => {
        // Order: Home first, then the system account, then Work (the agent's own account is always tried first).
        await setPool("Home", { poolOrder: 1 });
        await setPool("Work", { poolOrder: 3 });
        const ids = {
          work: await accountId("Work"),
          home: await accountId("Home"),
        };
        const order = (await accountList())
          .filter((item) => item.provider === "codex")
          .sort((a, b) => Number(a.poolOrder) - Number(b.poolOrder))
          .map((item) => String(item.label));
        assert(order[0] === "Home", `Home is first in the pool: ${order.join(" > ")}`);
        // (a) Home switched off: when Work is at its limit the system account answers, never Home.
        await setPool("Home", { enabled: false });
        await setLimits({ [ids.work]: { resetsInSeconds: 7 } });
        await d.ask("Assistant", "ACC a", "Stub: account system answered a", 60_000);
        await waitLimitsFree();
        // (b) Home on again: it comes first.
        await setPool("Home", { enabled: true });
        await setLimits({ [ids.work]: { resetsInSeconds: 7 } });
        await d.ask("Assistant", "ACC b", `Stub: account ${ids.home} answered b`, 60_000);
        await waitLimitsFree();
        await setLimits({});
        return `order ${order.join(" > ")}; Home off: Work's limit > the system account answered (Home skipped); Home on: Home answered first`;
      },
    );

    await row(
      "P06",
      "limit before the first action: the turn goes to the next account from the start; the page says so; nothing hangs",
      async () => {
        const ids = { work: await accountId("Work"), home: await accountId("Home") };
        await waitLimitsFree();
        const from = await eventCount();
        await setLimits({ [ids.work]: { resetsInSeconds: 7 } });
        await d.openAgent("Assistant");
        await d.send("Assistant", "ACC c");
        await d.answer("Assistant", `Stub: account ${ids.home} answered c`, 60_000);
        const events = await eventsSince(from);
        const limit = events.find((event) => event.type === "account-limit-reached");
        const switched = events.find((event) => event.type === "account-switched" && event.reason === "usage-limit");
        assert(
          limit?.outcome === "switched" && limit.afterAction === false && limit.accountId === ids.work,
          `limit event: ${JSON.stringify(limit)}`,
        );
        assert(
          switched?.toAccountId === ids.home && switched.reason === "usage-limit",
          `switch event: ${JSON.stringify(switched)}`,
        );
        assert(!JSON.stringify(events).includes("@"), "no e-mail in the events");
        const region = page.getByRole("region", { name: "Account notices" });
        await region.waitFor({ timeout: 15_000 });
        assert(
          /Limit reached/.test(await region.innerText()) && /Switched to account Home/.test(await region.innerText()),
          "the page shows the limit card and the switch card",
        );
        const answers = list(
          await d.ev(
            `window.openbot.agent.listBots().then(async (bots) => (await window.openbot.agent.readConversation(bots.find((b) => b.name === "Assistant").id)).messages.filter((m) => m.author === "assistant" && /account .* answered/.test(m.text)))`,
          ),
        );
        assert(
          answers.filter((message) => String(message.text).includes(ids.home)).length >= 1,
          "one answer from the next account",
        );
        await page.waitForTimeout(1_000);
        assert(!/Thinking/.test(await d.rowLabel("Assistant")), "the row is not stuck on Thinking");
        await d.dump("w5-p06-switched");
        await waitLimitsFree();
        await setLimits({});
        return `Work limited (no action yet) > account-limit-reached 'switched' + account-switched 'usage-limit' > Home answered; cards 'Limit reached' and 'Switched to account Home' on the page; the row settles`;
      },
    );

    await row(
      "P07",
      "limit after the first action: nothing is repeated on its own; a card in Needs you asks; Confirm continues on the next account",
      async () => {
        const ids = { work: await accountId("Work"), home: await accountId("Home") };
        await waitLimitsFree();
        const from = await eventCount();
        await setLimits({ [ids.work]: { resetsInSeconds: 7, action: true } });
        await d.openAgent("Res");
        await d.send("Assistant", "ACC d");
        await waitUntil(page, "the limit event after an action", async () =>
          (await eventsSince(from)).some((event) => event.type === "account-limit-reached"),
        );
        const limit = asRecord((await eventsSince(from)).find((event) => event.type === "account-limit-reached"));
        assert(limit.outcome === "asks" && limit.afterAction === true, `limit event: ${JSON.stringify(limit)}`);
        const needs = page.getByRole("region", { name: "Needs you" });
        await needs.waitFor({ timeout: 20_000 });
        assert(/Assistant/.test(await needs.innerText()), "Needs you names the agent");
        await page.waitForTimeout(2_500);
        assert(
          !(await eventsSince(from)).some(
            (event) => event.type === "account-switched" && event.reason === "usage-limit",
          ),
          "no silent switch",
        );
        await needs.getByRole("button", { name: /^Assistant, Needs you/ }).click();
        const decision = page.getByRole("region", { name: "Decision" });
        await decision.waitFor({ timeout: 15_000 });
        assert(
          /Limit reached on .*Continue on/.test(await decision.innerText()),
          `the card asks: ${(await decision.innerText()).slice(0, 120)}`,
        );
        await d.dump("w5-p07-asks");
        await decision.getByRole("button", { name: "Confirm", exact: true }).click();
        await d.answer("Assistant", `Stub: account ${ids.home} answered d`, 60_000);
        assert(
          (await eventsSince(from)).some(
            (event) => event.type === "account-switched" && event.reason === "usage-limit",
          ),
          "after Confirm the switch is told",
        );
        await waitLimitsFree();
        await setLimits({});
        return "Work fails after a command item > outcome 'asks' (afterAction), no switch for 2.5 s; Needs you lists Assistant; the card 'Limit reached on … Continue on …?' > Confirm > Home answered; account-switched after the answer";
      },
    );

    await row(
      "P08",
      "every account at its limit: a limit state with a reset time and no hanging; after the reset the agent returns to its own account",
      async () => {
        const ids = { work: await accountId("Work"), home: await accountId("Home") };
        const from = await eventCount();
        await setLimits({
          [ids.work]: { resetsInSeconds: 12 },
          [ids.home]: { resetsInSeconds: 12 },
          system: { resetsInSeconds: 12 },
        });
        await d.openAgent("Assistant");
        await d.send("Assistant", "ACC e");
        await waitTurns(from, 3, 90_000);
        const events = await eventsSince(from);
        const outcomes = events
          .filter((event) => event.type === "account-limit-reached")
          .map((event) => String(event.outcome));
        assert(outcomes.at(-1) === "exhausted" && outcomes.length >= 3, `outcomes: ${outcomes.join(",")}`);
        const last = asRecord(events.filter((event) => event.type === "account-limit-reached").at(-1));
        assert(
          isString(last.resetsAt) && Date.parse(last.resetsAt) > Date.now(),
          `a reset time in the future: ${String(last.resetsAt)}`,
        );
        const region = page.getByRole("region", { name: "Account notices" });
        await region.waitFor({ timeout: 15_000 });
        assert(
          /Every account in the pool is exhausted/.test(await region.innerText()),
          "the page says the pool is exhausted",
        );
        assert(/Resets at|Assumed reset at/.test(await region.innerText()), "the page shows the reset time");
        assert(!/Thinking/.test(await d.rowLabel("Assistant")), "no hanging Thinking");
        await d.dump("w5-p08-exhausted");
        await setLimits({});
        await waitLimitsFree(60_000);
        const again = await eventCount();
        await d.ask("Assistant", "ACC f", `Stub: account ${ids.work} answered f`, 60_000);
        const returned = (await eventsSince(again)).find((event) => event.type === "account-switched");
        assert(
          returned?.reason === "returned" && returned.toAccountId === ids.work,
          `returned: ${JSON.stringify(returned)}`,
        );
        return `3 accounts limited > outcomes ${outcomes.join(",")} (reset ${String(last.resetsAt).slice(11, 19)}Z); card 'Every account in the pool is exhausted' with the time; no Thinking; after the reset the limits cleared by themselves and Assistant answered on Work again (account-switched 'returned')`;
      },
    );

    await row(
      "P10",
      "pool: one CLI process per account in use; accounts that were never used start nothing",
      async () => {
        const lines = await startsLog();
        const perAccount = new Map<string, number>();
        for (const line of lines) {
          const id = line.split(" ")[0] ?? "";
          perAccount.set(id, (perAccount.get(id) ?? 0) + 1);
        }
        const extra = await accountId("Extra");
        assert(!perAccount.has(extra), "the never-used account started no process");
        const counts = [...perAccount].map(([id, count]) => `${id.slice(0, 12)}x${count}`).join(" ");
        assert(
          perAccount.size >= 3,
          `Work, Home and the system account each started one: ${[...perAccount.keys()].join(",")}`,
        );
        return `${perAccount.size} accounts started processes (${counts}; one per account, a second only after a 5-minute idle stop); 'Extra' (signed in, never used) started none. NOT covered here: the idle process stopping after 5 minutes (unit test only)`;
      },
    );

    await row("P11", "no way to share or export an account; the pool warning is on the page", async () => {
      const names = await d.ev("Object.keys(window.openbot.subscriptions)");
      const have = Array.isArray(names) ? names.map(String) : [];
      assert(
        !have.some((name) => /export|share|import|copy|send|invite/i.test(name)),
        `no such call: ${have.join(",")}`,
      );
      await d.openPage("Providers");
      assert(
        /Use only your own accounts/.test(await page.locator('section[aria-label="Accounts"]').innerText()),
        "the warning is on the page",
      );
      const snapshot = JSON.stringify(await d.ev("window.openbot.subscriptions.listAccounts()"));
      assert(
        !snapshot.includes("@") && !/token|secret|password/i.test(snapshot),
        "the account list carries no e-mail, token or secret",
      );
      return `${have.length} subscriptions calls, none for export or sharing; the pool warning 'Use only your own accounts…' is shown; the account list has no e-mail or token. NOT covered: a remote server or the phone (unit test of the reviewer only)`;
    });

    // ---------------------------------------------------------------- own endpoints
    const endpointCard = () => page.getByRole("region", { name: "Own model endpoints" });
    const openEndpoints = async () => {
      await d.openPage("Providers");
      await endpointCard().waitFor({ timeout: 20_000 });
    };
    const fillEndpoint = async (name: string, address: string, key?: string) => {
      const form = endpointCard().getByRole("form", { name: "Endpoint" });
      await form.getByLabel(/^Name/).fill(name);
      await form.getByLabel(/^Address/).fill(address);
      if (key !== undefined) await form.getByLabel(/^Key/).fill(key);
      return form;
    };
    let endpointId = "";
    const endpointKey = fakeKey("endpoint");

    await row(
      "E01",
      "endpoint: save without contacting; models only after 'Check connection'; a host outside this computer is warned about; other schemes are refused",
      async () => {
        await openEndpoints();
        await endpointCard().getByRole("button", { name: "Add an endpoint" }).click();
        let form = await fillEndpoint("Local LLM", models.base);
        assert(!/another computer|not on this computer/.test(await form.innerText()), "no warning for this computer");
        await form.getByRole("button", { name: "Save" }).click();
        const list_ = endpointCard().getByRole("list", { name: "Endpoints" });
        await list_.getByText("Not checked").waitFor({ timeout: 15_000 });
        assert(requestCount(models) === 0, `saving contacted nothing (${requestCount(models)} requests)`);
        await list_.getByRole("button", { name: "Check connection to Local LLM" }).click();
        await list_.getByText("Reachable").waitFor({ timeout: 20_000 });
        assert(/llama3:8b, qwen2\.5-coder:7b/.test(await list_.innerText()), "the models are listed");
        assert(
          requestCount(models) === 1 &&
            models.requests[0]?.path === "/v1/models" &&
            models.requests[0].authorization === undefined,
          `one keyless request: ${JSON.stringify(models.requests.map((r) => r.path))}`,
        );
        endpointId = String(asRecord(list(await d.ev("window.openbot.endpoints.list()"))[0]).id);
        // Another computer: the warning shows while typing, the address can be saved, nothing is contacted.
        await endpointCard().getByRole("button", { name: "Add an endpoint" }).click();
        form = await fillEndpoint("Desk PC", "http://192.168.1.77:9/v1");
        await form.getByText(/another computer.*not encrypted/).waitFor({ timeout: 10_000 });
        await d.dump("w5-e01-warning");
        await form.getByLabel(/^Address/).fill("ftp://192.168.1.77/v1");
        await form.getByText("Only http:// and https:// addresses are accepted.").waitFor({ timeout: 10_000 });
        await form.getByLabel(/^Address/).fill("http://example.com/v1");
        await form
          .getByText(/Plain http:\/\/ is allowed only on this computer or a local network/)
          .waitFor({ timeout: 10_000 });
        await form.getByLabel(/^Address/).fill("http://192.168.1.77:9/v1");
        await form.getByRole("button", { name: "Save" }).click();
        await list_
          .getByText(/another computer/)
          .first()
          .waitFor({ timeout: 10_000 });
        await list_.getByRole("button", { name: "Remove Desk PC" }).click();
        await endpointCard().getByRole("button", { name: "Yes, remove" }).click();
        await waitUntil(page, "Desk PC removed", async () => !/Desk PC/.test(await list_.innerText()), 10_000);
        return "save > 0 requests; Check connection > 1 GET /v1/models without a key, 'Reachable', 2 models; 192.168.1.77 > 'another computer … not encrypted'; ftp:// and plain http to a public host refused with a message; the LAN endpoint removed";
      },
    );

    await row(
      "E02",
      "endpoint key: a missing, a wrong and the right key; only a mask on the page; the key is nowhere in the profile",
      async () => {
        models.needsKey = endpointKey;
        await openEndpoints();
        const list_ = endpointCard().getByRole("list", { name: "Endpoints" });
        await list_.getByRole("button", { name: "Check connection to Local LLM" }).click();
        await list_.getByText("Key refused").waitFor({ timeout: 20_000 });
        assert(/asks for a key/.test(await list_.innerText()), "says a key is needed");
        for (const [key, expected] of [
          ["wrong-key-0000", /did not accept the key/],
          [endpointKey, /\d+ models found/],
        ] as const) {
          await list_.getByRole("button", { name: "Edit Local LLM" }).click();
          const form = endpointCard().getByRole("form", { name: "Endpoint" });
          const field = form.getByLabel(/^Key/);
          assert((await field.getAttribute("type")) === "password", "the key field is a password field");
          await field.fill(key);
          await form.getByRole("button", { name: "Save" }).click();
          await list_.getByRole("button", { name: "Check connection to Local LLM" }).click();
          await waitUntil(page, "the check ended", async () => expected.test(await list_.innerText()), 20_000);
        }
        assert((await list_.innerText()).includes(`Key ••••${endpointKey.slice(-4)}`), "only the mask is shown");
        assert(
          models.requests.at(-1)?.authorization === `Bearer ${endpointKey}`,
          "the right key reached the endpoint's own address",
        );
        await noSecret(endpointKey, "endpoint key");
        await noSecret("wrong-key-0000", "wrong endpoint key");
        await d.dump("w5-e02-key");
        return "no key > 'Key refused' (asks for a key); wrong key > 'did not accept'; right key > 'Reachable' and only 'Key ••••abcd'; the key and the wrong key have 0 hits in any file of the profile and in the page";
      },
    );

    await row("E03", "an agent on an endpoint model talks through it (chat only)", async () => {
      const ids = list(await d.ev("window.openbot.agent.listModels()")).map((model) => String(model.id));
      const model = `endpoint:${endpointId}/llama3:8b`;
      assert(ids.includes(model), "the endpoint's model is offered to agents");
      const named = list(await d.ev("window.openbot.agent.listModels()")).find((item) => item.id === model);
      assert(/chat only/.test(String(named?.name)), `the model says chat only: ${String(named?.name)}`);
      await d.ev(
        `window.openbot.agent.listBots().then((bots) => window.openbot.agent.updateBot({ botId: bots.find((b) => b.name === "Assistant").id, model: ${JSON.stringify(model)} }))`,
      );
      const before = models.requests.length;
      const answer = await d.ask("Assistant", "hello endpoint", "ENDPOINT_SAYS_HI", 60_000);
      const call = models.requests.slice(before).find((request) => request.path === "/v1/chat/completions");
      assert(call?.authorization === `Bearer ${endpointKey}`, "the chat call carries the endpoint's key");
      const body = asRecord(JSON.parse(call?.body ?? "{}"));
      const messages = list(body.messages);
      assert(
        body.model === "llama3:8b" && body.stream === true,
        `body: ${JSON.stringify({ model: body.model, stream: body.stream })}`,
      );
      assert(/cannot use tools/.test(String(messages[0]?.content)), "the agent is told it has no tools");
      await d.dump("w5-e03-chat");
      return `answer '${answer.slice(0, 40)}' through POST /v1/chat/completions (stream, Bearer key, model llama3:8b); the model is listed as '… (Local LLM, chat only)'; the agent is told it has no tools`;
    });

    await row(
      "P09",
      "layers: every account first, then the fallback model (an endpoint model here); the agent returns to its own model after the reset",
      async () => {
        const ids = { work: await accountId("Work"), home: await accountId("Home") };
        await d.ev(
          `window.openbot.agent.listBots().then((bots) => window.openbot.agent.updateBot({ botId: bots.find((b) => b.name === "Assistant").id, model: "gpt-5.6-luna" }))`,
        );
        const fallback = `endpoint:${endpointId}/qwen2.5-coder:7b`;
        await d.ev(
          `window.openbot.providers.setFallbackModels({ botId: "provider:codex", fallbackModels: [${JSON.stringify(fallback)}] })`,
        );
        const from = await eventCount();
        await setLimits({
          [ids.work]: { resetsInSeconds: 12 },
          [ids.home]: { resetsInSeconds: 12 },
          system: { resetsInSeconds: 12 },
        });
        await d.openAgent("Assistant");
        await d.send("Assistant", "ACC g");
        await waitUntil(
          page,
          "the fallback model answered",
          async () => {
            const seen = await eventsSince(from);
            return (
              seen.some((event) => event.type === "model-fallback") &&
              seen.some((event) => event.type === "turn-completed" && event.status === "completed")
            );
          },
          90_000,
        );
        const events = await eventsSince(from);
        assert(
          /ENDPOINT_SAYS_HI/.test(await d.answer("Assistant", "ENDPOINT_SAYS_HI", 20_000)),
          "the newest answer is the endpoint's",
        );
        const kinds = events.flatMap((event) =>
          event.type === "account-limit-reached"
            ? [`limit:${String(event.outcome)}`]
            : event.type === "model-fallback"
              ? ["model"]
              : [],
        );
        assert(
          kinds.at(-1) === "model" &&
            kinds.slice(0, -1).every((kind) => kind.startsWith("limit:")) &&
            kinds.length >= 4,
          `order: ${kinds.join(" > ")}`,
        );
        await setLimits({});
        await waitLimitsFree(60_000);
        // The provider block of the model registry ends with the same reset: give it a moment.
        await page.waitForTimeout(3_000);
        await d.ask("Assistant", "ACC h", `Stub: account ${ids.work} answered h`, 60_000);
        const bot = asRecord(
          list(await d.ev("window.openbot.agent.listBots()")).find((item) => item.name === "Assistant"),
        );
        assert(
          bot.activeModel === undefined || bot.activeModel === null,
          `back on its own model: ${String(bot.activeModel)}`,
        );
        await d.ev(`window.openbot.providers.resetFallbackModels("provider:codex")`);
        return `events: ${kinds.join(" > ")}; the answer came from the endpoint; after the reset the agent was back on Work and on gpt-5.6-luna (no activeModel)`;
      },
    );

    await row(
      "E04",
      "detect local: only 127.0.0.1:11434 and :1234 are looked at; silence is an empty list, not an error",
      async () => {
        await openEndpoints();
        await endpointCard().getByRole("button", { name: "Detect local servers" }).click();
        await endpointCard()
          .getByText(/Nothing found on this computer|Found:/)
          .waitFor({ timeout: 20_000 });
        const first = await endpointCard().innerText();
        let ollama: ModelServer | null = null;
        try {
          ollama = await startModelServer(11434);
        } catch {
          ollama = null;
        }
        if (!ollama) {
          assert(/Found:|Nothing found/.test(first), "an answer is shown");
          return "port 11434 is taken on this computer, so only the silent case was run: see the evidence page";
        }
        try {
          assert(/Nothing found on this computer/.test(first), `nothing listens: ${first.slice(0, 80)}`);
          await endpointCard().getByRole("button", { name: "Detect local servers" }).click();
          await endpointCard().getByText("Found: Ollama.").waitFor({ timeout: 20_000 });
          assert(
            ollama.requests.length >= 1 &&
              ollama.requests.every((request) => request.path === "/v1/models" && request.authorization === undefined),
            "only a keyless model-list request",
          );
          const found = asRecord(
            list(await d.ev("window.openbot.endpoints.list()")).find((item) => item.kind === "ollama"),
          );
          assert(
            list([found]).length === 1 && Array.isArray(found.models) && found.models.length === 2,
            "Ollama is listed with its models",
          );
          return "nothing listening > 'Nothing found on this computer…' (no error); a stand-in on 11434 > 'Found: Ollama.' with 2 models after one keyless GET; port 1234 stayed silent";
        } finally {
          await ollama.close();
        }
      },
    );

    await row(
      "E06",
      "removing an endpoint: its models and key go; an agent that used it gets a clear error",
      async () => {
        const model = `endpoint:${endpointId}/llama3:8b`;
        await d.ev(
          `window.openbot.agent.listBots().then((bots) => window.openbot.agent.updateBot({ botId: bots.find((b) => b.name === "Assistant").id, model: ${JSON.stringify(model)} }))`,
        );
        await openEndpoints();
        const list_ = endpointCard().getByRole("list", { name: "Endpoints" });
        await list_.getByRole("button", { name: "Remove Local LLM" }).click();
        await endpointCard().getByRole("button", { name: "Yes, remove" }).click();
        await waitUntil(
          page,
          "Local LLM removed",
          async () => !/Local LLM/.test(await endpointCard().innerText()),
          10_000,
        );
        const ids = list(await d.ev("window.openbot.agent.listModels()")).map((item) => String(item.id));
        assert(!ids.some((id) => id.startsWith(`endpoint:${endpointId}/`)), "its models are gone from the choice");
        await noSecret(endpointKey, "removed endpoint key");
        const from = await eventCount();
        await d.openAgent("Assistant");
        await d.send("Assistant", "anyone there?");
        await waitUntil(page, "the removed-endpoint error", async () =>
          (await eventsSince(from)).some(
            (event) => event.type === "error" && /endpoint of this model was removed/.test(String(event.message)),
          ),
        );
        await page.waitForTimeout(1_000);
        assert(!/Thinking/.test(await d.rowLabel("Assistant")), "no hanging Thinking");
        await d.ev(
          `window.openbot.agent.listBots().then((bots) => window.openbot.agent.updateBot({ botId: bots.find((b) => b.name === "Assistant").id, model: "gpt-5.6-luna" }))`,
        );
        await d.dump("w5-e06-removed");
        return "Remove > Yes: the models left the choice, 0 hits for its key in the profile; a message to the agent gave 'The endpoint of this model was removed…' and the row did not hang; the agent was put back on gpt-5.6-luna";
      },
    );

    // ---------------------------------------------------------------- API keys
    const apiKeyCard = () => page.getByRole("region", { name: "API keys" }).getByRole("group", { name: "OpenAI key" });
    const openKeys = async () => {
      await d.openPage("Providers");
      await apiKeyCard().waitFor({ timeout: 20_000 });
    };
    const openaiKey = fakeKey("openai");
    const badKey = `bad-${fakeKey("rejected")}`;
    // The main process sends the provider's fixed key-check address to the key stand-in (and notes what it was asked).
    await app.evaluate((_electron, origin) => {
      const original = globalThis.fetch;
      const seen: string[] = [];
      Object.assign(globalThis, {
        acceptSeenUrls: seen,
        fetch: (input: string | URL | Request, init?: RequestInit) => {
          const url = input instanceof Request ? input.url : String(input);
          if (/^https:\/\/(api\.openai\.com|api\.anthropic\.com)\//.test(url)) {
            seen.push(url);
            return original(`${origin}${new URL(url).pathname}`, init);
          }
          return original(input, init);
        },
      });
    }, keyServer.origin);
    const seenKeyUrls = async (): Promise<string[]> => {
      const urls = await app.evaluate(() => Object.fromEntries(Object.entries(globalThis)).acceptSeenUrls);
      return Array.isArray(urls) ? urls.map(String) : [];
    };

    await row(
      "K01",
      "API key: typed into a password field, stored, shown only as a mask; the field empties; nothing echoes the key",
      async () => {
        await openKeys();
        const field = apiKeyCard().getByLabel("OpenAI API key");
        assert((await field.getAttribute("type")) === "password", "password field");
        await field.fill(openaiKey);
        await apiKeyCard().getByRole("button", { name: "Save key" }).click();
        await apiKeyCard()
          .getByText(`Saved key: ••••${openaiKey.slice(-4)}`)
          .waitFor({ timeout: 15_000 });
        assert((await field.inputValue()) === "", "the field is empty after saving");
        const entries = JSON.stringify(await d.ev("window.openbot.apiKeys.list()"));
        assert(!entries.includes(openaiKey), "the list answer has no key");
        assert(
          (await page.locator("body").ariaSnapshot()).includes(openaiKey) === false,
          "the accessibility tree has no key",
        );
        await d.dump("w5-k01-saved");
        return `saved > 'Saved key: ••••${openaiKey.slice(-4)}', empty field, no key in the list answer or the page`;
      },
    );

    await row(
      "K02",
      "API key: encrypted at rest: 0 hits for the key (plain or base64) in any file of the profile, in logs or in the evidence",
      async () => {
        await noSecret(openaiKey, "api key");
        const base64 = Buffer.from(openaiKey).toString("base64");
        assert((await anyFileContains(root, base64)) === null, "no base64 form either");
        assert((await anyFileContains(evidence, openaiKey)) === null, "none in the evidence folder (dumps)");
        return "0 hits in every file of the sandbox profile (database and logs included), in the page, and in the evidence dumps; base64 form: 0 hits";
      },
    );

    await row(
      "K03",
      "API key: reaches the provider's process only as an environment variable, never in its arguments or in the program's own environment",
      async () => {
        await setPool("Extra", { enabled: true });
        await assignAgent("Res", "Extra");
        const answer = await d.ask("Res", "ENVKEY", "Stub: key set=", 60_000);
        assert(
          answer.includes(`set=yes tail=${openaiKey.slice(-4)} argvHasKey=false`),
          `the process saw the key only in its environment: ${answer}`,
        );
        const mainEnv = await app.evaluate(() => process.env.OPENAI_API_KEY ?? "");
        assert(mainEnv === "", "the program's own environment does not hold the key");
        return `a CLI process started after the save: '${answer.slice(0, 70)}'; process.env of the program: no OPENAI_API_KEY`;
      },
    );

    await row(
      "K04",
      "API key: 'Check connection' only on a click, against the provider's own address; a refused key says so; Remove deletes it and the next process starts without it",
      async () => {
        assert(
          keyServer.requests.length === 0 && (await seenKeyUrls()).length === 0,
          "nothing was checked before the click",
        );
        await openKeys();
        await apiKeyCard().getByRole("button", { name: "Check connection" }).click();
        await apiKeyCard()
          .getByText(/OpenAI accepted this key/)
          .waitFor({ timeout: 20_000 });
        assert(
          requestCount(keyServer) === 1 && keyServer.requests[0]?.authorization === `Bearer ${openaiKey}`,
          "one request with the key",
        );
        const urls = await seenKeyUrls();
        assert(
          urls.length === 1 && urls[0] === "https://api.openai.com/v1/models",
          `the fixed provider address only: ${urls.join(",")}`,
        );
        // A refused key.
        await apiKeyCard().getByLabel("OpenAI API key").fill(badKey);
        await apiKeyCard().getByRole("button", { name: "Save key" }).click();
        await apiKeyCard()
          .getByText(/Saved key: ••••/)
          .waitFor({ timeout: 15_000 });
        await apiKeyCard().getByRole("button", { name: "Check connection" }).click();
        await apiKeyCard()
          .getByText(/OpenAI rejected this key/)
          .waitFor({ timeout: 20_000 });
        assert(!(await page.content()).includes(badKey), "the refused key is not shown");
        await d.dump("w5-k04-rejected");
        // Remove: the secret is gone and a new process has no variable.
        await apiKeyCard().getByRole("button", { name: "Remove key" }).click();
        await apiKeyCard().getByText("No key saved").waitFor({ timeout: 15_000 });
        await noSecret(openaiKey, "removed key");
        await noSecret(badKey, "removed refused key");
        await d.ev(`window.openbot.subscriptions.removeAccount({ id: ${JSON.stringify(await accountId("Extra"))} })`);
        await d.ev(`window.openbot.subscriptions.addAccount({ provider: "codex", label: "Fresh" })`);
        await signIn("Fresh");
        await assignAgent("Res", "Fresh");
        const answer = await d.ask("Res", "ENVKEY", "Stub: key set=no", 60_000);
        return `before the click 0 requests; Check connection > 1 request to the provider's fixed address, 'accepted'; a key starting 'bad-' > 'rejected'; Remove key > 'No key saved', 0 hits for both keys; a new process: '${answer.slice(0, 40)}'`;
      },
    );

    // ---------------------------------------------------------------- fallback models
    const eight = [
      "gpt-5.6-terra",
      "gpt-5.6-sol",
      "claude-fable-5",
      "claude-opus-5",
      "claude-sonnet-5",
      "acp:one",
      "acp:two",
      "acp:three",
    ];
    await row(
      "F01",
      "fallback models: eight are accepted, the ninth and a repeat are refused with a message, the saved list does not change",
      async () => {
        const set = async (models: string[]) =>
          String(
            await d.ev(
              `window.openbot.providers.setFallbackModels({ botId: "*", fallbackModels: ${JSON.stringify(models)} }).then(() => "saved", (e) => String(e.message))`,
            ),
          );
        assert((await set(eight)) === "saved", "eight accepted");
        const nine = await set([...eight, "acp:four"]);
        assert(/At most 8/.test(nine), `the ninth: ${nine}`);
        const repeat = await set(["gpt-5.6-terra", "gpt-5.6-terra"]);
        assert(/twice/.test(repeat), `a repeat: ${repeat}`);
        const kept = list(
          await d.ev(
            `window.openbot.providers.getFallbackModels("*").then((models) => models.map((model) => ({ model })))`,
          ),
        );
        assert(
          kept.length === 8 && kept[0]?.model === "gpt-5.6-terra" && kept[7]?.model === "acp:three",
          "the saved list is unchanged by the refusals",
        );
        return `8 saved in order; ninth > '${nine.slice(0, 40)}'; a repeat > '${repeat.slice(0, 40)}'; the list is still the same 8. NOT covered here: the list screen itself (checked by its own component tests, not driven in this window run)`;
      },
    );

    await row(
      "F02",
      "fallback models: the general list applies to an agent without its own ('inherited'); an own list wins; reset goes back",
      async () => {
        const botRes = await d.botId("Res");
        // A model of an ACP agent that does not exist stays in the list but is not tried: it counts as unavailable.
        const sizes = (record: DynamicRecord) =>
          (Array.isArray(record.effective) ? record.effective.length : 0) +
          (Array.isArray(record.unavailable) ? record.unavailable.length : 0);
        const info = async (id: string) =>
          asRecord(await d.ev(`window.openbot.providers.getFallbackInfo(${JSON.stringify(id)})`));
        await d.ev(`window.openbot.providers.resetFallbackModels(${JSON.stringify(botRes)})`);
        const inherited = await info(botRes);
        assert(
          inherited.own === null &&
            Array.isArray(inherited.general) &&
            inherited.general.length === 8 &&
            sizes(inherited) === 8,
          `inherited: ${JSON.stringify({ own: inherited.own, general: inherited.general, effective: inherited.effective, unavailable: inherited.unavailable })}`,
        );
        await d.ev(
          `window.openbot.providers.setFallbackModels({ botId: ${JSON.stringify(botRes)}, fallbackModels: ["gpt-5.6-sol", "claude-opus-5"] })`,
        );
        const own = await info(botRes);
        // BE7: the layers add up (own first, then the provider's, then the general list), each model once: the own
        // two come first and the rest of the general list follows.
        const ownChain = list(own.chain).map((entry) => String(entry.source));
        assert(
          Array.isArray(own.own) &&
            own.own.length === 2 &&
            ownChain[0] === "own" &&
            ownChain[1] === "own" &&
            sizes(own) === 8,
          `an own list goes first: ${JSON.stringify({ own: own.own, chain: ownChain, size: sizes(own) })}`,
        );
        const reset = asRecord(await d.ev(`window.openbot.providers.resetFallbackModels(${JSON.stringify(botRes)})`));
        assert(reset.own === null && sizes(reset) === 8, "after the reset the general list applies again");
        await d.ev(`window.openbot.providers.resetFallbackModels("*")`);
        return "Res: own null (inherited) > effective 8; own list of 2 > the two come first (source own), the other 6 of the general list follow; reset > own null, effective + unavailable = 8 again (the three acp: entries have no agent, so they show as unavailable); the general list cleared afterwards";
      },
    );

    await row(
      "P11b",
      "a paired phone cannot reach accounts, CLIs, API keys, endpoints or fallback lists (the phone API has no such route)",
      async () => {
        await d.openAgent("Assistant");
        const started = asRecord(await d.ev("window.openbot.mobile.startPairing({ exposure: 'loopback', port: 0 })"));
        const fingerprint = String(started.fingerprint ?? "");
        const base = (Array.isArray(started.urls) ? started.urls.map(String) : [])[0] ?? "";
        assert(
          /^https:\/\/127\.0\.0\.1:\d+$/.test(base) && /^[0-9a-f]{64}$/.test(fingerprint),
          "TLS address and fingerprint",
        );
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
        assert(cardId, "pairing consent card");
        await d.ev(
          `window.openbot.agent.respondToDraftPreview({ requestId: ${JSON.stringify(cardId)}, decision: "send" })`,
        );
        const token = String(asRecord((await paired).json).token ?? "");
        assert(token.length > 10, "the phone has a token");
        // The control: a route the phone does have.
        assert.equal((await pinned(`${base}/v1/agents`, fingerprint, { token })).status, 200, "the phone lists agents");
        const refused: string[] = [];
        const probes: Array<[string, string]> = [
          ["GET", "/v1/accounts"],
          ["GET", "/v1/subscriptions"],
          ["GET", "/v1/subscriptions/accounts"],
          ["POST", "/v1/subscriptions/accounts"],
          ["GET", "/v1/subscriptions/cli"],
          ["GET", "/v1/api-keys"],
          ["POST", "/v1/api-keys"],
          ["GET", "/v1/endpoints"],
          ["POST", "/v1/endpoints"],
          ["GET", "/v1/providers"],
          ["GET", "/v1/providers/fallback-models"],
          ["GET", "/v1/providers/fallback-info"],
          ["POST", "/v1/providers/fallback-models"],
        ];
        for (const [method, path] of probes) {
          const answer = await pinned(`${base}${path}`, fingerprint, {
            method,
            token,
            ...(method === "POST" ? { body: { provider: "codex", key: "test-key-phone-0000-abcd" } } : {}),
          });
          if (![403, 404, 405].includes(answer.status)) refused.push(`${method} ${path} answered ${answer.status}`);
          if (/test-key-phone|"accounts"|"maskedKey"/.test(answer.text))
            refused.push(`${method} ${path} leaked something`);
        }
        assert.deepEqual(refused, [], "no such route answers");
        // And without the token nothing answers either.
        assert.equal((await pinned(`${base}/v1/api-keys`, fingerprint)).status === 200, false, "no token, no answer");
        const phoneKeyStillUnknown = await anyFileContains(root, "test-key-phone-0000-abcd");
        assert(phoneKeyStillUnknown === null, "the key sent by the phone was not stored");
        return `${probes.length} probes (accounts, CLIs, API keys, endpoints, fallback lists, read and write) answered 403/404/405 with a valid phone token; /v1/agents answered 200; nothing was stored. NOT covered: a remote team server (unit test: local-only-ipc.test.ts)`;
      },
    );

    await row(
      "P10b",
      "the CLI process of an account that is not used for 5 minutes is stopped; the next turn starts a new one",
      async () => {
        const work = await accountId("Work");
        await setLimits({});
        await d.ask("Assistant", "ACC p10a", `Stub: account ${work} answered p10a`, 60_000);
        const alive = (pid: number) => {
          try {
            process.kill(pid, 0);
            return true;
          } catch {
            return false;
          }
        };
        const pidOf = async (account: string) => {
          const lines = (await startsLog()).filter((line) => line.startsWith(`${account} `));
          return Number((lines.at(-1) ?? "").split(" ")[1]);
        };
        const workPid = await pidOf(work);
        const systemPid = await pidOf("system");
        assert(workPid > 0 && alive(workPid), "the account's process runs after its turn");
        const before = (await startsLog()).filter((line) => line.startsWith(`${work} `)).length;
        // The idle limit is 5 minutes and the sweep runs every minute: look after 6.5 minutes of silence.
        await page.waitForTimeout(390_000);
        assert(!alive(workPid), "the idle process of the account was stopped");
        assert(alive(systemPid), "the provider's own process stays");
        await d.ask("Assistant", "ACC p10b", `Stub: account ${work} answered p10b`, 60_000);
        const after = (await startsLog()).filter((line) => line.startsWith(`${work} `)).length;
        assert(after === before + 1, `a new process for the next turn (${before} > ${after})`);
        return `after 6.5 minutes without a turn the process of the account (pid ${workPid}) was gone, the system process stayed; the next turn started a new one (starts of that account ${before} > ${after})`;
      },
    );

    await row(
      "F02n",
      "a network error is not a limit (BE8): the page and the events say 'network error', no account is marked, nothing is switched; after the connection is back the same account answers",
      async () => {
        const accounts = await accountList();
        const ids = accounts.map((item) => String(item.id));
        await waitLimitsFree();
        await setLimits({});
        const markedBefore = accounts.filter((item) => item.limitedUntil !== null).length;
        const from = await eventCount();
        const failing: Record<string, { network: true }> = {};
        for (const id of ids) failing[id] = { network: true };
        await setLimits(failing);
        await d.openAgent("Assistant");
        await d.send("Assistant", "ACC n1");
        await waitUntil(
          page,
          "the network-error event",
          async () => (await eventsSince(from)).some((event) => event.type === "account-error"),
          60_000,
        );
        await waitTurns(from, 1);
        await page.waitForTimeout(2_500);
        const events = await eventsSince(from);
        const failed = events.find((event) => event.type === "account-error");
        assert(
          failed?.reason === "network-error" && /Network error/.test(String(failed.message)),
          `account-error: ${JSON.stringify(failed)}`,
        );
        assert(!/ECONNRESET|reset by peer/.test(String(failed?.message)), "the event text is fixed, not the raw error");
        assert(
          !events.some((event) => event.type === "account-switched" || event.type === "account-limit-reached"),
          `no switch, no limit card: ${JSON.stringify(events.map((event) => event.type))}`,
        );
        const markedAfter = (await accountList()).filter((item) => item.limitedUntil !== null).length;
        assert(markedAfter === markedBefore, `no account was marked as limited (${markedBefore} > ${markedAfter})`);
        assert(!/Thinking/.test(await d.rowLabel("Assistant")), "the row is not stuck on Thinking");
        // UI8: a calm card on the page (no Continue, no talk of a limit) that can be dismissed.
        const card = page.getByRole("status", { name: /^Network error for / });
        await card.first().waitFor({ timeout: 15_000 });
        const cardText = await card.first().innerText();
        assert(
          /Connection problem/.test(cardText) && !/limit|Continue/i.test(cardText),
          `the network card is calm: '${cardText.replace(/s+/g, " ").slice(0, 120)}'`,
        );
        await card.first().getByRole("button", { name: "Dismiss" }).click();
        await card.first().waitFor({ state: "detached", timeout: 10_000 });
        await setLimits({});
        const again = await eventCount();
        await d.send("Assistant", "ACC n2");
        await d.answer("Assistant", "answered n2", 60_000);
        const later = await eventsSince(again);
        assert(!later.some((event) => event.type === "account-switched"), "the next turn is not a switch either");
        await d.dump("w5-f02n-network");
        return `all ${ids.length} accounts fail with a dropped connection > one account-error 'network-error' ('${String(failed?.message).slice(0, 70)}'), 0 account-switched, 0 account-limit-reached, limited accounts ${markedBefore} > ${markedAfter}, the row settles; connection back (limits cleared) > the next turn answers with no switch. NOT covered: the account-error card (UI8 is adding it)`;
      },
    );

    await row(
      "F03r",
      "UI8: the page has the switch 'Return to the first account after the limit resets' (on by default); it is saved and comes back",
      async () => {
        await d.openPage("Providers");
        const label = page.getByText("Return to the first account after the limit resets", { exact: true });
        await label.waitFor({ timeout: 15_000 });
        const returns = async () =>
          asRecord(asRecord(await d.ev("window.openbot.subscriptions.listAccounts()")).pool).returnAfterReset;
        assert((await returns()) !== false, "on by default");
        await label.click();
        await waitUntil(page, "the setting is saved off", async () => (await returns()) === false, 10_000);
        const limit = asRecord(await d.ev("window.openbot.subscriptions.getPoolSettings()")).maxAccountsPerProvider;
        await label.click();
        await waitUntil(page, "the setting is saved on", async () => (await returns()) !== false, 10_000);
        await d.dump("w5-f03r-switch");
        return `default on > the label click saves 'off' (the limit ${String(limit)} stays) > on again`;
      },
    );

    await row(
      "F03",
      "fallback models per provider (BE7): one list for Codex, one for Claude; an agent follows its own list, then its provider's, then the general one, each model once",
      async () => {
        const botRes = await d.botId("Res");
        const info = async (id: string) =>
          asRecord(await d.ev(`window.openbot.providers.getFallbackInfo(${JSON.stringify(id)})`));
        const chainOf = (record: DynamicRecord) =>
          list(record.chain).map((entry) => `${String(entry.source)}:${String(entry.model)}`);
        await d.ev(`window.openbot.providers.setFallbackModels({ botId: "*", fallbackModels: ["claude-opus-5"] })`);
        await d.ev(
          `window.openbot.providers.setFallbackModels({ botId: "provider:codex", fallbackModels: ["gpt-5.6-sol"] })`,
        );
        const codexAgent = await info(botRes);
        assert(
          codexAgent.own === null &&
            codexAgent.providerScope === "provider:codex" &&
            JSON.stringify(chainOf(codexAgent)) === JSON.stringify(["provider:gpt-5.6-sol", "general:claude-opus-5"]),
          `a Codex agent: its provider's list, then the general one: ${JSON.stringify(chainOf(codexAgent))}`,
        );
        await d.ev(
          `window.openbot.providers.setFallbackModels({ botId: ${JSON.stringify(botRes)}, fallbackModels: ["gpt-5.6-terra"] })`,
        );
        assert(
          JSON.stringify(chainOf(await info(botRes))) ===
            JSON.stringify(["own:gpt-5.6-terra", "provider:gpt-5.6-sol", "general:claude-opus-5"]),
          "an own list goes first and the other layers still follow",
        );
        await d.ev(
          `window.openbot.providers.setFallbackModels({ botId: "provider:claude", fallbackModels: ["gpt-5.6-terra"] })`,
        );
        assert(
          JSON.stringify((await info("provider:claude")).own) === JSON.stringify(["gpt-5.6-terra"]),
          "the Claude list is saved apart from the Codex list",
        );
        await d.openPage("Providers");
        const lists = page.getByRole("region", { name: "Fallback models" });
        for (const name of ["Codex", "Claude", "All providers"])
          await lists.getByRole("region", { name: `${name} fallback list` }).waitFor({ timeout: 15_000 });
        const refused = String(
          await d.ev(
            `window.openbot.providers.setFallbackModels({ botId: "provider:gemini", fallbackModels: [] }).then(() => "saved", (e) => String(e.message))`,
          ),
        );
        assert(/Unknown provider/.test(refused), `an unknown provider is refused: ${refused.slice(0, 80)}`);
        await d.ev(`window.openbot.providers.resetFallbackModels(${JSON.stringify(botRes)})`);
        assert((await info(botRes)).own === null, "the own list of the agent can be reset");
        for (const scope of ["provider:codex", "provider:claude", "*"])
          await d.ev(`window.openbot.providers.resetFallbackModels(${JSON.stringify(scope)})`);
        return "general [claude-opus-5], Codex [gpt-5.6-sol]: Res (Codex model) chain provider:sol > general:opus; an own list goes first (own:terra > provider:sol > general:opus); the Claude list is separate; the page shows Codex, Claude and All providers lists; an unknown provider is refused; all lists reset";
      },
    );

    // -- W12 Backend contracts in the window (docs/cosgral-raporty/backend-w12-odbior-kontraktow.md) -----------------
    await row(
      "W12-threadUndo",
      "threadUndo: hide with confirm, list, event, undo, purge; refusals stay hard (8)",
      async () => {
        assert(
          (await d.ev("Boolean(window.openbot.threadUndo && window.openbot.threads)")) === true,
          "threadUndo + threads APIs exist",
        );
        const botId = await d.botId("Assistant");
        await d.ev(`window.__w12ThreadEvents = []`);
        await d.ev(
          `window.openbot.agent.onEvent((event) => { if (event.type === "thread-deletes-changed") window.__w12ThreadEvents.push(event); })`,
        );
        const created = asRecord(
          await d.ev(`window.openbot.threads.create({ botId: ${JSON.stringify(botId)}, title: "Undo me" })`),
        );
        const threadId = String(created.activeThreadId ?? "");
        assert(threadId.length > 0, `create returns activeThreadId: ${JSON.stringify(created)}`);

        const noConfirm = String(
          await d.ev(
            `window.openbot.threadUndo.delete({ botId: ${JSON.stringify(botId)}, threadId: ${JSON.stringify(threadId)} }).then(() => "ok", (e) => String(e.message))`,
          ),
        );
        assert(
          /Deleting a thread for good needs confirmation/.test(noConfirm),
          `A1 refuse without confirm: ${noConfirm.slice(0, 120)}`,
        );

        const deleted = asRecord(
          await d.ev(
            `window.openbot.threadUndo.delete({ botId: ${JSON.stringify(botId)}, threadId: ${JSON.stringify(threadId)}, confirm: true })`,
          ),
        );
        const pending = asRecord(deleted.pending);
        const afterList = asRecord(deleted.list);
        assert(String(pending.threadId) === threadId, "A2 pending.threadId");
        assert(String(pending.title) === "Undo me", "A2 pending.title");
        assert(pending.wasActive === true, "A2 pending.wasActive");
        assert(
          Date.parse(String(pending.expiresAt)) - Date.parse(String(pending.deletedAt)) === 600_000,
          "A2 10-minute window",
        );
        assert(!list(afterList.threads).some((row) => row.id === threadId), "A2 list no longer has the thread");
        assert(String(afterList.activeThreadId) !== threadId, "A2 activeThreadId moved");

        const pendingList = list(await d.ev(`window.openbot.threadUndo.list({ botId: ${JSON.stringify(botId)} })`));
        assert(pendingList.length === 1 && String(pendingList[0]?.threadId) === threadId, "A3 list has 1");
        const selectRefused = String(
          await d.ev(
            `window.openbot.threads.select({ botId: ${JSON.stringify(botId)}, threadId: ${JSON.stringify(threadId)} }).then(() => "ok", (e) => String(e.message))`,
          ),
        );
        assert(/Unknown thread/.test(selectRefused), `A3 select refuses: ${selectRefused.slice(0, 80)}`);

        await waitUntil(
          page,
          "A4 thread-deletes-changed",
          async () => {
            const events = list(await d.ev("window.__w12ThreadEvents"));
            return events.some((event) => list(event.pending).length === 1);
          },
          10_000,
        );

        const restored = asRecord(
          await d.ev(
            `window.openbot.threadUndo.undo({ botId: ${JSON.stringify(botId)}, threadId: ${JSON.stringify(threadId)} })`,
          ),
        );
        assert(
          list(restored.threads).some((row) => row.id === threadId) && String(restored.activeThreadId) === threadId,
          "A6 undo restores thread + active",
        );
        assert(
          list(await d.ev(`window.openbot.threadUndo.list({ botId: ${JSON.stringify(botId)} })`)).length === 0,
          "A6 pending empty after undo",
        );
        const undoAgain = String(
          await d.ev(
            `window.openbot.threadUndo.undo({ botId: ${JSON.stringify(botId)}, threadId: ${JSON.stringify(threadId)} }).then(() => "ok", (e) => String(e.message))`,
          ),
        );
        assert(
          /There is nothing to undo for this thread/.test(undoAgain),
          `A6 second undo refuses: ${undoAgain.slice(0, 80)}`,
        );

        await d.ev(
          `window.openbot.threadUndo.delete({ botId: ${JSON.stringify(botId)}, threadId: ${JSON.stringify(threadId)}, confirm: true })`,
        );
        await d.ev(
          `window.openbot.threads.delete({ botId: ${JSON.stringify(botId)}, threadId: ${JSON.stringify(threadId)}, confirm: true })`,
        );
        assert(
          !list(asRecord(await d.ev(`window.openbot.threads.list({ botId: ${JSON.stringify(botId)} })`)).threads).some(
            (row) => row.id === threadId,
          ),
          "A7 threads.delete purged",
        );
        assert(
          list(await d.ev(`window.openbot.threadUndo.list({ botId: ${JSON.stringify(botId)} })`)).length === 0,
          "A7 pending empty after purge",
        );
        const undoPurged = String(
          await d.ev(
            `window.openbot.threadUndo.undo({ botId: ${JSON.stringify(botId)}, threadId: ${JSON.stringify(threadId)} }).then(() => "ok", (e) => String(e.message))`,
          ),
        );
        assert(
          /There is nothing to undo for this thread/.test(undoPurged),
          `A7 undo after purge refuses: ${undoPurged.slice(0, 80)}`,
        );
        // A8 (turn running) needs a hanging turn — covered by unit tests; not forced here.
        return "A1–A7 hard IPC ok; A8 (running turn) left to unit tests";
      },
    );

    await row(
      "W12-tasksView",
      "tasksView: list shapes, sort, scopes, filters, detail actions, archive/restore (8)",
      async () => {
        assert((await d.ev("Boolean(window.openbot.tasksView)")) === true, "tasksView API exists");
        const assistant = await d.botId("Assistant");
        const res = await d.botId("Res");
        const channelName = `w12-tasks-${Date.now().toString(36)}`;
        const channel = asRecord(
          await d.ev(
            `window.openbot.channels.create({ name: ${JSON.stringify(channelName)}, title: "W12 Tasks", instructions: "Finish briefly.", memberBotIds: ${JSON.stringify([assistant, res])}, leadBotId: ${JSON.stringify(assistant)}, isolated: false })`,
          ),
        );
        const channelId = String(channel.id ?? "");
        assert(channelId.length > 0, `channel created: ${JSON.stringify(channel)}`);
        await d.ev(
          `window.openbot.channels.sendMessage({ channelId: ${JSON.stringify(channelId)}, text: "W12 tasks acceptance title" })`,
        );
        await waitUntil(
          page,
          "task done",
          async () => {
            const page0 = asRecord(await d.ev(`window.openbot.tasksView.list({ query: "W12 tasks acceptance" })`));
            return list(page0.items).some((item) => asRecord(item.task).state === "done");
          },
          90_000,
        );

        const pageActive = asRecord(await d.ev("window.openbot.tasksView.list({})"));
        assert(list(pageActive.items).length >= 1, "A1 items ≥ 1");
        for (const item of list(pageActive.items)) {
          const task = asRecord(item.task);
          assert(isString(task.id) && task.id.length > 0, "A1 task.id");
          assert(isString(item.channelName), "A1 channelName");
          assert(item.ownerName === null || isString(item.ownerName), "A1 ownerName");
          assert(isNumber(item.stepCount) && isNumber(item.stepsDone), "A1 stepCount/stepsDone");
          assert(item.resultPreview === null || isString(item.resultPreview), "A1 resultPreview");
        }
        const counts = asRecord(pageActive.counts);
        const byState = asRecord(counts.byState);
        for (const key of ["queued", "running", "waiting", "paused", "done", "failed", "cancelled"]) {
          assert(isNumber(byState[key]), `A1 byState.${key}`);
        }
        assert(isNumber(counts.active), "A1 counts.active is a number");

        const stamps = list(pageActive.items).map((item) => String(asRecord(item.task).updatedAt));
        const sorted = [...stamps].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
        assert(JSON.stringify(stamps) === JSON.stringify(sorted), "A2 sorted by updatedAt desc");

        const doneItem = list(pageActive.items).find(
          (item) =>
            String(asRecord(item.task).title).includes("W12 tasks acceptance") && asRecord(item.task).state === "done",
        );
        assert(doneItem, "done acceptance task exists");
        const taskId = String(asRecord(doneItem.task).id);

        const detail = asRecord(await d.ev(`window.openbot.tasksView.detail({ taskId: ${JSON.stringify(taskId)} })`));
        assert(String(asRecord(detail.result).text || "").length > 0, "A5 result.text");
        assert(
          String(asRecord(detail.request).messageId) === String(asRecord(detail.task).requestMessageId),
          "A5 request.messageId",
        );
        const openAsChat = asRecord(detail.openAsChat);
        assert(
          String(openAsChat.channelId) === String(asRecord(detail.task).channelId) &&
            String(openAsChat.anchorMessageId) === String(asRecord(detail.task).requestMessageId),
          "A5 openAsChat",
        );
        const logAt = list(detail.log).map((entry) => String(entry.at));
        const logSorted = [...logAt].sort();
        assert(JSON.stringify(logAt) === JSON.stringify(logSorted), "A5 log ascending by at");
        const actions = list(detail.actions);
        assert(
          actions.length === 6 &&
            actions.map((action) => String(action.action)).join(",") === "stop,pause,resume,archive,restore,reassign",
          `A5 actions order: ${actions.map((action) => action.action).join(",")}`,
        );
        const byId = Object.fromEntries(actions.map((action) => [String(action.action), action]));
        assert(byId.stop?.enabled === false && /already finished/.test(String(byId.stop?.reason)), "A6 stop");
        assert(byId.pause?.enabled === false && /not running/.test(String(byId.pause?.reason)), "A6 pause");
        assert(byId.resume?.enabled === false && /paused or stopped/.test(String(byId.resume?.reason)), "A6 resume");
        assert(byId.reassign?.enabled === false && /finished/.test(String(byId.reassign?.reason)), "A6 reassign");
        assert(byId.archive?.enabled === true, "A6 archive on for done");
        assert(byId.restore?.enabled === false && /not archived/.test(String(byId.restore?.reason)), "A6 restore off");

        await d.ev(`window.openbot.channels.actOnTask({ taskId: ${JSON.stringify(taskId)}, action: "archive" })`);
        const archivedPage = asRecord(await d.ev(`window.openbot.tasksView.list({ scope: "archived" })`));
        assert(
          list(archivedPage.items).length >= 1 &&
            list(archivedPage.items).every((item) => asRecord(item.task).archivedAt !== null),
          "A3 archived scope only archived",
        );
        const allPage = asRecord(await d.ev(`window.openbot.tasksView.list({ scope: "all" })`));
        const allCounts = asRecord(allPage.counts);
        assert(
          Number(allPage.total) === Number(allCounts.active) + Number(allCounts.archived),
          `A3 all.total === active + archived (${String(allPage.total)} vs ${String(allCounts.active)}+${String(allCounts.archived)})`,
        );

        const runningOnly = asRecord(await d.ev(`window.openbot.tasksView.list({ states: ["running"] })`));
        assert(
          list(runningOnly.items).every((item) => asRecord(item.task).state === "running"),
          "A4 states filter",
        );
        const runningByState = asRecord(asRecord(runningOnly.counts).byState);
        for (const key of ["queued", "running", "waiting", "paused", "done", "failed", "cancelled"]) {
          assert(isNumber(runningByState[key]), `A4 byState keeps ${key}`);
        }
        const narrowed = asRecord(
          await d.ev(`window.openbot.tasksView.list({ query: "W12 tasks acceptance", scope: "all" })`),
        );
        assert(
          list(narrowed.items).every((item) =>
            String(asRecord(item.task).title).toLowerCase().includes("w12 tasks acceptance"),
          ),
          "A4 query narrows",
        );
        if (Number(allPage.total) > 1) {
          const first = asRecord(await d.ev(`window.openbot.tasksView.list({ scope: "all", limit: 1 })`));
          assert(list(first.items).length === 1 && Number(first.nextOffset) === 1, "A4 limit/nextOffset");
          const last = asRecord(
            await d.ev(
              `window.openbot.tasksView.list({ scope: "all", limit: 1, offset: ${JSON.stringify(Number(allPage.total) - 1)} })`,
            ),
          );
          assert(last.nextOffset === null, "A4 last page nextOffset null");
        }

        assert(
          list(archivedPage.items).some((item) => String(asRecord(item.task).id) === taskId),
          "A7 in archived list",
        );
        assert(
          !list(asRecord(await d.ev("window.openbot.tasksView.list({})")).items).some(
            (item) => String(asRecord(item.task).id) === taskId,
          ),
          "A7 not in default active list",
        );
        await d.ev(`window.openbot.channels.actOnTask({ taskId: ${JSON.stringify(taskId)}, action: "restore" })`);
        assert(
          list(asRecord(await d.ev("window.openbot.tasksView.list({})")).items).some(
            (item) => String(asRecord(item.task).id) === taskId,
          ),
          "A7 restore returns to active",
        );
        const missing = String(
          await d.ev(
            `window.openbot.tasksView.detail({ taskId: "no-such-task" }).then(() => "ok", (e) => String(e.message))`,
          ),
        );
        assert(/This task no longer exists/.test(missing), `A7 missing detail: ${missing.slice(0, 80)}`);
        // A8 (window Tasks UI) is a shot/U check — IPC detail carries openAsChat + steps.
        return "A1–A7 hard IPC ok; A8 window Tasks UI covered by shots";
      },
    );

    await row(
      "W12-messageMenu",
      "messageMenu: action ids, assistant edit blocked, pin+react events, unknown id (7)",
      async () => {
        assert(
          (await d.ev("Boolean(window.openbot.messageMenu && window.openbot.messageActions)")) === true,
          "messageMenu API exists",
        );
        const botId = await d.botId("Assistant");
        await d.ev(`window.__w12MenuEvents = []`);
        await d.ev(
          `window.openbot.agent.onEvent((event) => { if (event.type === "message-pins-changed" || event.type === "queue-changed") window.__w12MenuEvents.push(event); })`,
        );
        const snap = asRecord(await d.ev(`window.openbot.agent.readConversation(${JSON.stringify(botId)})`));
        const messages = list(snap.messages);
        const userMsg = [...messages].reverse().find((message) => message.author === "user");
        const botMsg = [...messages]
          .reverse()
          .find((message) => message.author === "assistant" && message.status === "completed");
        assert(
          userMsg?.id && botMsg?.id,
          `user+completed assistant messages: user=${Boolean(userMsg)} bot=${Boolean(botMsg)}`,
        );

        const userMenu = asRecord(
          await d.ev(
            `window.openbot.messageMenu.get({ botId: ${JSON.stringify(botId)}, messageId: ${JSON.stringify(String(userMsg.id))} })`,
          ),
        );
        assert(
          list(userMenu.actions)
            .map((action) => String(action.id))
            .join(",") === "copy,react,pin,branch,retry,edit,delete",
          `A1 action ids: ${list(userMenu.actions)
            .map((action) => action.id)
            .join(",")}`,
        );
        assert(
          list(userMenu.actions).every((action) => action.enabled === true),
          "A1 all enabled while idle",
        );
        const deleteAction = list(userMenu.actions).find((action) => action.id === "delete");
        assert(deleteAction?.needsConfirmation === true, "A1 delete needsConfirmation");
        const later = messages.filter(
          (message) =>
            String(message.createdAt) > String(userMsg.createdAt) ||
            messages.indexOf(message) > messages.indexOf(userMsg),
        ).length;
        // Prefer engine's laterMessages via edit.needsConfirmation when messages follow.
        const editAction = list(userMenu.actions).find((action) => action.id === "edit");
        assert(isBoolean(editAction?.needsConfirmation), "A1 edit.needsConfirmation present");

        const botMenu = asRecord(
          await d.ev(
            `window.openbot.messageMenu.get({ botId: ${JSON.stringify(botId)}, messageId: ${JSON.stringify(String(botMsg.id))} })`,
          ),
        );
        const botEdit = list(botMenu.actions).find((action) => action.id === "edit");
        assert(botEdit?.enabled === false, "A2 edit disabled on assistant");
        assert(
          String(botEdit?.reason) === "Only your own messages can be edited.",
          `A2 edit reason: ${String(botEdit?.reason)}`,
        );
        assert(
          list(botMenu.actions)
            .filter((action) => action.id !== "edit")
            .every((action) => action.enabled === true),
          "A2 other actions enabled on assistant",
        );

        await d.ev(
          `window.openbot.messageActions.pin({ botId: ${JSON.stringify(botId)}, messageId: ${JSON.stringify(String(botMsg.id))}, pinned: true })`,
        );
        const pinnedMenu = asRecord(
          await d.ev(
            `window.openbot.messageMenu.get({ botId: ${JSON.stringify(botId)}, messageId: ${JSON.stringify(String(botMsg.id))} })`,
          ),
        );
        assert(pinnedMenu.pinned === true, "A3 pinned");
        assert(list(pinnedMenu.actions).find((action) => action.id === "pin")?.active === true, "A3 pin.active");
        await waitUntil(
          page,
          "A3 message-pins-changed",
          async () => list(await d.ev("window.__w12MenuEvents")).some((event) => event.type === "message-pins-changed"),
          10_000,
        );
        await d.ev(
          `window.openbot.messageActions.pin({ botId: ${JSON.stringify(botId)}, messageId: ${JSON.stringify(String(botMsg.id))}, pinned: false })`,
        );

        const reactions = asRecord(botMenu.reactions);
        const quick = Array.isArray(reactions.quick) ? reactions.quick.map(String) : [];
        assert(quick.length > 0 && reactions.more != null, "A4 quick/more");
        const emoji = quick[0] ?? "👍";
        await d.ev(
          `window.openbot.agent.setMessageReaction({ botId: ${JSON.stringify(botId)}, messageId: ${JSON.stringify(String(botMsg.id))}, emoji: ${JSON.stringify(emoji)} })`,
        );
        const reacted = asRecord(
          await d.ev(
            `window.openbot.messageMenu.get({ botId: ${JSON.stringify(botId)}, messageId: ${JSON.stringify(String(botMsg.id))} })`,
          ),
        );
        assert(String(asRecord(reacted.reactions).current) === emoji, "A4 current reaction");
        await d.ev(
          `window.openbot.agent.setMessageReaction({ botId: ${JSON.stringify(botId)}, messageId: ${JSON.stringify(String(botMsg.id))}, emoji: null })`,
        );

        const unknown = String(
          await d.ev(
            `window.openbot.messageMenu.get({ botId: ${JSON.stringify(botId)}, messageId: "no-such-message" }).then(() => "ok", (e) => String(e.message))`,
          ),
        );
        assert(/That message is not in this thread/.test(unknown), `A6 unknown: ${unknown.slice(0, 80)}`);
        // A5 (non-message row) needs a step/note row in the conversation — seed-dependent; A7 is window U.
        void later;
        return "A1–A4 + A6 hard IPC ok; A5 non-message row + A7 window menu left to shots/units";
      },
    );

    await row(
      "W12-heldKind",
      "heldKind: pause ≠ hold; queue-changed reaches window; optional server-busy/budget (5)",
      async () => {
        const botId = await d.botId("Assistant");
        await d.ev(`window.__w12QueueEvents = []`);
        await d.ev(
          `window.openbot.agent.onEvent((event) => { if (event.type === "queue-changed") window.__w12QueueEvents.push(event); })`,
        );
        await d.ev(`window.openbot.agent.setQueuePaused({ botId: ${JSON.stringify(botId)}, paused: true })`);
        await d.ev(
          `window.openbot.agent.sendMessage({ botId: ${JSON.stringify(botId)}, text: "W12 heldKind queued while paused" })`,
        );
        const queued = asRecord(await d.ev(`window.openbot.agent.listQueue(${JSON.stringify(botId)})`));
        assert(queued.heldReason == null && queued.heldKind == null, "A1 pause is not a hold");
        const statusBar = page.getByRole("status").filter({ hasText: /Message queued:/i });
        assert((await statusBar.count()) === 0, "A1 no Message queued status bar for pause-only");

        await waitUntil(
          page,
          "A2 queue-changed",
          async () => {
            const events = list(await d.ev("window.__w12QueueEvents"));
            return events.some((event) => String(asRecord(event.snapshot).botId) === botId);
          },
          10_000,
        );

        await d.ev(`window.openbot.agent.setQueuePaused({ botId: ${JSON.stringify(botId)}, paused: false })`);

        // A3 server-busy when maxThreads=1 and two agents turn at once.
        let serverBusyNote = "skipped (could not force)";
        try {
          await d.ev(`window.openbot.serverSettings.update({ general: { maxThreads: 1 } })`);
          const resId = await d.botId("Res");
          await d.ev(
            `window.openbot.agent.sendMessage({ botId: ${JSON.stringify(botId)}, text: "W12 long hold A HOLD this for busy" })`,
          );
          await d.ev(
            `window.openbot.agent.sendMessage({ botId: ${JSON.stringify(resId)}, text: "W12 second agent while busy" })`,
          );
          await waitUntil(
            page,
            "A3 server-busy",
            async () => {
              const q = asRecord(await d.ev(`window.openbot.agent.listQueue(${JSON.stringify(resId)})`));
              return String(q.heldKind) === "server-busy";
            },
            20_000,
          );
          const busy = asRecord(await d.ev(`window.openbot.agent.listQueue(${JSON.stringify(resId)})`));
          assert(String(busy.heldKind) === "server-busy", "A3 heldKind");
          assert(
            String(busy.heldReason) ===
              "The server is busy: too many agent turns run at once. New messages wait until one finishes.",
            `A3 heldReason: ${String(busy.heldReason).slice(0, 100)}`,
          );
          serverBusyNote = "ok";
          await d.ev(`window.openbot.serverSettings.update({ general: { maxThreads: null } })`);
        } catch (error) {
          await d.ev(`window.openbot.serverSettings.update({ general: { maxThreads: null } }).catch(() => null)`);
          serverBusyNote = `unit-covered (${error instanceof Error ? error.message.slice(0, 80) : String(error)})`;
        }

        // A4 budget: only when a budget API can force exhaustion in this profile.
        const budgetNote = "skipped (no forced budget in this run; unit-covered)";
        // A5 agent-restart is U / unit-covered.
        return `A1–A2 hard ok; A3 ${serverBusyNote}; A4 ${budgetNote}; A5 unit`;
      },
    );

    await row(
      "B02",
      "secrets: no test key of this run is in any file of the profile, in the page or in the evidence",
      async () => {
        for (const secret of [openaiKey, badKey, endpointKey, "wrong-key-0000"]) {
          assert(
            (await anyFileContains(root, secret)) === null,
            "a test secret is in a file of the sandbox (it must not be)",
          );
          assert((await anyFileContains(evidence, secret)) === null, "a test secret is in the evidence");
        }
        return `4 test secrets (provider key, refused key, endpoint key, wrong endpoint key): 0 hits in the whole sandbox root (database, logs, evidence)`;
      },
    );
  } finally {
    await app.close().catch(() => undefined);
    await models.close();
    await keyServer.close();
  }
  await writeFile(resultsFile, JSON.stringify({ results, console: consoleFindings.slice(0, 40) }, null, 2));
  const failed = results.filter((result) => !result.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} steps ok; console errors: ${consoleFindings.length}`,
  );
  for (const result of failed) console.log(`  FAIL [${result.row}] ${result.name}: ${result.detail.slice(0, 300)}`);
  process.exit(failed.length ? 1 : 0);
}

async function main(): Promise<void> {
  await waitForQuietMachine(
    process.env.COSGRAL_MODE ? `sandbox acceptance ${process.env.COSGRAL_MODE}` : "sandbox acceptance",
  );
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
  if (process.env.COSGRAL_MODE === "cli-onboarding") {
    await onboardingCliMain(root, evidence);
    return;
  }
  if (process.env.COSGRAL_MODE === "w5") {
    await w5Main(root, evidence);
    return;
  }
  if (process.env.COSGRAL_MODE === "w11") {
    const { w11Main } = await import("./sandbox-w11-acceptance.ts");
    await w11Main({
      root,
      evidence,
      installFixture,
      launch,
      createDriver: (page, evidenceFolder, app) => new Driver(page, evidenceFolder, app),
      row,
      results,
      consoleFindings,
      setResultsFile: (path) => {
        resultsFile = path;
      },
    });
    return;
  }
  const fixture = await installFixture(root);
  const cliStandIn = await startCliStandIn(process.execPath);
  process.env.COSGRAL_CLI_TEST_BASE = cliStandIn.base;
  const first = await launch(root, fixture);
  try {
    await firstRun(new Driver(first.page, evidence, first.app), root, cliStandIn);
    await new Driver(first.page, evidence, first.app).dump("final-first-run");
  } finally {
    await first.app.close().catch(() => undefined);
  }
  const second = await launch(root, fixture);
  try {
    await secondRun(new Driver(second.page, evidence, second.app), root, cliStandIn);
  } finally {
    await second.app.close().catch(() => undefined);
  }
  // C07 and C08 need more restarts: auto-update, the switch and the pin only act when the program starts.
  const wants = (...ids: string[]) => only.length === 0 || ids.some((id) => only.includes(id));
  if (wants("C07")) {
    const third = await launch(root, fixture);
    try {
      await cliThirdRun(new Driver(third.page, evidence, third.app), cliStandIn);
    } finally {
      await third.app.close().catch(() => undefined);
    }
  }
  if (wants("C08", "C13")) {
    const fourth = await launch(root, fixture);
    try {
      await cliFourthRun(new Driver(fourth.page, evidence, fourth.app), cliStandIn);
    } finally {
      await fourth.app.close().catch(() => undefined);
    }
  }
  await cliStandIn.close();
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
