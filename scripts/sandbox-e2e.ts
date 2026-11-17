// COSGRAL W3-BE8: starts the whole program (real Electron, real main process, real window) in a sandbox profile and
// drives it like a person would, with the deterministic Codex fixture instead of a model. It collects the console of
// the window and the output of the main process, takes screenshots and writes evidence into the sandbox.
//
//   COSGRAL_SANDBOX_ROOT=<folder> node scripts/sandbox-e2e.ts [--keep]    (or: bun run sandbox:e2e)
//
// The sandbox folder gets its own USERPROFILE, APPDATA, LOCALAPPDATA and TEMP, so the data of the person's own
// programs is never touched (the program keeps everything under APPDATA and the home folder). Without --keep the
// sandbox is emptied first. Run `bun run build` first. Test data only; nothing leaves this computer.
// Run it with Node (Playwright's Electron launcher does not finish its handshake under Bun).

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { Agent, request } from "node:https";
import { dirname, join, resolve, sep } from "node:path";
import { connect } from "node:tls";
import { fileURLToPath } from "node:url";
import { type DynamicRecord, isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { type ElectronApplication, _electron as electron, type Page } from "playwright";
import { cleanEnvironment } from "./sandbox-env.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface Finding {
  where: string;
  level: string;
  text: string;
}

const findings: Finding[] = [];
const steps: Array<{ name: string; ok: boolean; detail?: string; ms: number }> = [];
let failureDump: ((name: string) => Promise<void>) | undefined;
const mainOutput: string[] = [];
const MESSAGE = "Hello from the sandbox";
const PHONE_MESSAGE = "Hello from the sandbox phone";

/** Runs inside the window (a string, because the window cannot import): calls every read-only call without arguments. */
const GETTER_SMOKE = `(async () => {
  const api = window.openbot;
  const wanted = /^(get[A-Za-z]*|list[A-Za-z]*|status)$/;
  // context.getState needs an agent id (a call with none is refused on purpose: no state without a thread).
  const skip = new Set(["getMacPermissions", "context.getState"]);
  const out = [];
  const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
  const call = async (name, fn) => {
    try {
      await Promise.race([Promise.resolve(fn()), timeout(8000)]);
      out.push({ name, ok: true });
    } catch (error) {
      out.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  };
  for (const [space, value] of Object.entries(api)) {
    if (typeof value === "function") {
      if (wanted.test(space) && !skip.has(space) && value.length === 0) await call(space, () => value());
      continue;
    }
    if (typeof value !== "object" || value === null) continue;
    for (const [method, fn] of Object.entries(value)) {
      if (typeof fn !== "function" || !wanted.test(method) || skip.has(method) || skip.has(space + "." + method) || fn.length !== 0) continue;
      await call(space + "." + method, () => fn());
    }
  }
  return out;
})()`;

function asRecord(value: unknown): DynamicRecord {
  return isDynamicRecord(value) ? value : {};
}

/** An HTTPS agent that trusts one certificate only: the one with this SHA-256 fingerprint (like a phone that pinned the QR code's). */
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

interface PinnedAnswer {
  status: number;
  headers: IncomingHttpHeaders;
  text: string;
  json: unknown;
}

function pinned(
  url: string,
  fingerprintHex: string,
  init: { method?: string; token?: string; body?: DynamicRecord } = {},
): Promise<PinnedAnswer> {
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

/** The first text of an event stream (up to 5 s), then the connection is closed. */
function pinnedFirstEvents(url: string, fingerprintHex: string, token: string): Promise<string> {
  return new Promise((resolveText, reject) => {
    const outgoing = request(
      url,
      { agent: pinnedAgent(fingerprintHex), headers: { authorization: `Bearer ${token}` } },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        const finish = () => {
          clearTimeout(timer);
          response.destroy();
          resolveText(text);
        };
        const timer = setTimeout(finish, 5_000);
        response.on("data", (chunk: string) => {
          text += chunk;
          // `retry: 3000` comes first; wait for the first real event (event, data and the blank line).
          if (/event: [a-z-]+\ndata: .*\n\n/.test(text)) finish();
        });
      },
    );
    outgoing.once("error", reject);
    outgoing.end();
  });
}
const PAGES = [
  "Schedule",
  "Tasks",
  "Workflows",
  "Usage",
  "Library",
  "Marketplace",
  "Remote desktop",
  "Settings",
  "Agents",
];

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

// W5-BE1: a loopback stand-in for the official CLI release servers (GitHub releases of openai/codex). The "CLI" it
// serves is a copy of the Node that runs this script (it answers `--version`), so nothing from the internet runs.
interface CliStandIn {
  base: string;
  /** Version the "latest" endpoints name. */
  latest: string;
  /** Serve other bytes than the release metadata says (a failed SHA-256 check). */
  corrupt: boolean;
  fileRequests: number;
  sha256: string;
  close: () => Promise<void>;
}

async function startCliStandIn(file: string): Promise<CliStandIn> {
  const size = (await stat(file)).size;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const sha256 = hash.digest("hex");
  const state = { latest: "1.0.0", corrupt: false, fileRequests: 0 };
  const server: Server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const base = `http://127.0.0.1:${portOf(server)}`;
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
      createReadStream(file).pipe(response);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return Object.assign(state, {
    base: `http://127.0.0.1:${portOf(server)}`,
    sha256,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  });
}

function portOf(server: Server): number {
  const address = server.address();
  if (!address || isString(address)) throw new Error("The CLI stand-in has no port.");
  return address.port;
}

async function installFixture(root: string): Promise<{ codex: string; claude: string }> {
  const folder = join(root, "fixture");
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "codex.cjs"), await readFile(join(repo, "src/backend/testing/channel-codex.cjs")));
  const codex = join(folder, "codex.cmd");
  // The stand-in runs on Electron's own Node mode, like in start-cosgral-sandbox.cmd, so no separate Node is needed.
  const electronExe = join(repo, "node_modules", "electron", "dist", "electron.exe");
  await writeFile(codex, `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${electronExe}" "%~dp0codex.cjs" %*\r\n`);
  return { codex, claude: join(folder, "missing-claude.exe") };
}

function watch(page: Page, label: string): void {
  page.on("console", (message) => {
    const level = message.type();
    if (level === "error" || level === "warning") findings.push({ where: label, level, text: message.text() });
  });
  page.on("pageerror", (error) => findings.push({ where: label, level: "pageerror", text: error.message }));
  page.on("requestfailed", (request) =>
    findings.push({ where: label, level: "requestfailed", text: `${request.url()} ${request.failure()?.errorText}` }),
  );
}

/** A screenshot and the accessibility tree of the window, as evidence (and to find the next control). */
async function dump(page: Page, evidence: string, name: string): Promise<void> {
  await page.screenshot({ path: join(evidence, `${name}.png`) });
  await writeFile(join(evidence, `${name}.aria.txt`), await page.locator("body").ariaSnapshot());
}

async function step<T>(name: string, work: () => Promise<T>): Promise<T | undefined> {
  const before = findings.length;
  const started = Date.now();
  try {
    const value = await work();
    steps.push({ name, ok: true, ms: Date.now() - started });
    console.log(`ok   ${name}${findings.length > before ? `  (+${findings.length - before} console)` : ""}`);
    return value;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    steps.push({ name, ok: false, detail, ms: Date.now() - started });
    console.log(`FAIL ${name}: ${detail.split("\n")[0]}`);
    // What the window showed when the step failed (in the sandbox folder, never in the repository).
    await failureDump?.(`fail-${steps.length}`).catch(() => undefined);
    return undefined;
  }
}

interface Session {
  app: ElectronApplication;
  page: Page;
}

async function launch(root: string, fixture: { codex: string; claude: string }): Promise<Session> {
  const app = await electron.launch({
    executablePath: join(repo, "node_modules", "electron", "dist", "electron.exe"),
    args: [repo],
    cwd: repo,
    env: {
      ...cleanEnvironment(),
      ...sandboxEnvironment(root),
      OPENBOT_CODEX_PATH: fixture.codex,
      OPENBOT_CLAUDE_PATH: fixture.claude,
      // W4-BE2: while this file exists the Codex stand-in refuses to start (a CLI that cannot start).
      COSGRAL_FIXTURE_DOWN: join(root, "fixture", "codex-down"),
      // W4-BE5: after "Delete my data" the program only quits; this script starts it again itself.
      COSGRAL_WIPE_NO_RELAUNCH: "1",
    },
    timeout: 60_000,
  });
  app.process().stdout?.on("data", (chunk) => mainOutput.push(String(chunk)));
  app.process().stderr?.on("data", (chunk) => mainOutput.push(String(chunk)));
  app.on("window", (window) => watch(window, "window"));
  const page = await app.firstWindow();
  watch(page, "main");
  await page.waitForLoadState("domcontentloaded");
  failureDump = (name) => dump(page, join(root, "evidence"), name);
  return { app, page };
}

/** Goes through the first-run screens when they are shown; returns once the main window with the page rail is up. */
async function reachMainWindow(page: Page, choose: { agent: string | null }): Promise<string[]> {
  const seen: string[] = [];
  const where = page.getByRole("dialog", { name: "Where will COSGRAL Workspace run?" });
  const local = page.getByRole("dialog", { name: "Set up this computer" });
  const pages = page.getByRole("navigation", { name: "Pages" });
  for (let round = 0; round < 40; round += 1) {
    if (await pages.count()) return seen;
    if (await where.count()) {
      seen.push("where");
      await page.getByRole("button", { name: /Use this computer/ }).click({ timeout: 10_000 });
      await where.waitFor({ state: "detached", timeout: 15_000 });
    } else if (await local.count()) {
      // W3-BE9: one first-run flow; language and the first agent are fields of this step.
      seen.push("local");
      if (choose.agent) {
        const firstAgent = page.getByRole("combobox", { name: "First agent" });
        const option = firstAgent.locator("option", { hasText: choose.agent }).first();
        await firstAgent.selectOption((await option.getAttribute("value")) ?? "");
      }
      await page.getByRole("button", { name: "Continue with Codex" }).click({ timeout: 30_000 });
      await local.waitFor({ state: "detached", timeout: 15_000 });
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`The main window did not appear (saw: ${seen.join(", ")})`);
}

async function main(): Promise<void> {
  const root = sandboxRoot();
  const evidence = join(root, "evidence");
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
  // W5-BE1: the official CLI release servers are replaced by a loopback stand-in (the program is not packaged).
  const cliStandIn = await startCliStandIn(process.execPath);
  process.env.COSGRAL_CLI_TEST_BASE = cliStandIn.base;
  const phone: { fingerprint: string; base: string } = { fingerprint: "", base: "" };
  const first = await launch(root, fixture);
  try {
    const { page } = first;
    await step("start: first-run screens lead to the main window", async () => {
      await page.screenshot({ path: join(evidence, "01-start.png") });
      const seen = await reachMainWindow(page, { agent: null });
      console.log(`     first-run screens: ${seen.join(" -> ") || "(none)"}`);
      await dump(page, evidence, "02-main-empty");
    });
    await step("agent: create a new agent in the window", async () => {
      const list = page.getByRole("region", { name: "Agents" });
      if (await list.getByRole("button", { name: /^New agent/ }).count()) return; // kept sandbox: agent exists already
      await page.getByRole("button", { name: "New agent" }).click();
      await page.getByRole("option", { name: "Create new agent" }).click();
      await list.getByRole("button", { name: /^New agent/ }).waitFor({ timeout: 15_000 });
      await page.getByRole("heading", { name: "New agent", level: 1 }).waitFor({ timeout: 15_000 });
      await dump(page, evidence, "03-agent-created");
    });
    await step("chat: a message gets the answer of the Codex fixture", async () => {
      const box = page.getByRole("textbox", { name: "Message New agent" });
      await box.fill(MESSAGE);
      await page.getByRole("button", { name: "Send message" }).click();
      await page.getByText("Stub: received").first().waitFor({ timeout: 45_000 });
      await dump(page, evidence, "04-answer");
      assert((await page.getByText(MESSAGE).count()) > 0, "The sent message stays visible");
    });
    await step("windows: every window of the program finishes loading and none has crashed", async () => {
      const until = Date.now() + 30_000;
      let windows: Array<{ url: string; loading: boolean; crashed: boolean }> = [];
      do {
        windows = await first.app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().map((window) => ({
            url: window.webContents.getURL(),
            loading: window.webContents.isLoading(),
            crashed: window.webContents.isCrashed(),
          })),
        );
        if (windows.every((window) => !window.loading)) break;
        await page.waitForTimeout(500);
      } while (Date.now() < until);
      console.log(`     windows: ${windows.map((window) => window.url.split("/").pop()).join(", ")}`);
      assert(
        windows.every((window) => !window.loading),
        "A window is still loading after 30 s",
      );
      assert(
        windows.every((window) => !window.crashed),
        "A window crashed",
      );
    });
    await step("phone: pairing over TLS with a pinned fingerprint in the real program", async () => {
      const started = asRecord(
        await page.evaluate("window.openbot.mobile.startPairing({ exposure: 'loopback', port: 0 })"),
      );
      const urls = Array.isArray(started.urls) ? started.urls.map(String) : [];
      const fingerprint = String(started.fingerprint ?? "");
      assert(/^https:\/\/127\.0\.0\.1:\d+$/.test(urls[0] ?? ""), `The phone address is HTTPS on loopback: ${urls[0]}`);
      assert(/^[0-9a-f]{64}$/.test(fingerprint), "The pairing has the certificate fingerprint");
      assert(String(started.qrPayload).includes(`f=${fingerprint}`), "The QR code carries the fingerprint");
      assert(String(started.appUrl).endsWith("/app/"), "The QR code opens the phone web app");
      phone.base = urls[0] ?? "";
      phone.fingerprint = fingerprint;
      const shell = await pinned(`${phone.base}/app/`, fingerprint);
      assert.equal(shell.status, 200);
      assert(String(shell.headers["content-type"]).startsWith("text/html"), "The shell is HTML");
      assert(
        String(shell.headers["content-security-policy"]).includes("default-src 'none'"),
        "The shell has the strict CSP",
      );
      const script = await pinned(`${phone.base}/app/app.js`, fingerprint);
      assert(script.status === 200 && script.text.includes("cosgral.phone.v1"), "The app script is served");

      // The phone sends the ticket; the person approves on the card in Needs you (here through the window's own API).
      const paired = pinned(`${phone.base}/v1/pair`, fingerprint, {
        method: "POST",
        body: { ticket: started.ticket, deviceName: "Sandbox phone", platform: "web" },
      });
      let cardId = "";
      for (let attempt = 0; attempt < 40 && !cardId; attempt += 1) {
        await page.waitForTimeout(250);
        const pending = await page.evaluate("window.openbot.agent.listPendingRequests()");
        for (const item of Array.isArray(pending) ? pending : []) {
          const record = asRecord(item);
          const card = asRecord(record.card);
          if (record.kind === "draft-preview" && String(card.title).startsWith("Pair a phone"))
            cardId = String(card.requestId);
        }
      }
      assert(cardId, "The pairing consent card shows up in Needs you");
      await page.evaluate(
        `window.openbot.agent.respondToDraftPreview({ requestId: ${JSON.stringify(cardId)}, decision: "send" })`,
      );
      const answer = await paired;
      assert.equal(answer.status, 200, `pairing answered ${answer.status}: ${answer.text.slice(0, 200)}`);
      const token = String(asRecord(answer.json).token ?? "");
      assert(token.length >= 20, "The phone got a device token");
      const deviceId = String(asRecord(answer.json).deviceId ?? "");

      const agents = asRecord((await pinned(`${phone.base}/v1/agents`, fingerprint, { token })).json);
      const agent = (Array.isArray(agents.agents) ? agents.agents.map(asRecord) : []).find(
        (item) => item.name === "New agent",
      );
      assert(agent, "The phone lists the agent made in the window");
      const botId = String(agent.id);
      const messagesUrl = `${phone.base}/v1/agents/${encodeURIComponent(botId)}/messages`;
      const history = asRecord((await pinned(`${messagesUrl}?limit=10`, fingerprint, { token })).json);
      const texts = (Array.isArray(history.messages) ? history.messages.map(asRecord) : []).map((item) =>
        String(item.text),
      );
      assert(
        texts.includes(MESSAGE) && texts.includes("Stub: received"),
        `The page from the database has the chat: ${texts.join(" | ")}`,
      );

      const sent = await pinned(messagesUrl, fingerprint, { method: "POST", token, body: { text: PHONE_MESSAGE } });
      assert.equal(sent.status, 202, `phone message answered ${sent.status}: ${sent.text.slice(0, 200)}`);
      let answered = false;
      for (let attempt = 0; attempt < 120 && !answered; attempt += 1) {
        await page.waitForTimeout(500);
        const again = asRecord((await pinned(`${messagesUrl}?limit=10`, fingerprint, { token })).json);
        const list = (Array.isArray(again.messages) ? again.messages.map(asRecord) : []).map((item) =>
          String(item.text),
        );
        answered = list.includes(PHONE_MESSAGE) && list.filter((text) => text === "Stub: received").length >= 2;
      }
      assert(answered, "The agent answered the message from the phone");

      const stream = await pinnedFirstEvents(`${phone.base}/v1/events`, fingerprint, token);
      assert(
        stream.includes("event: needs-you") && /\nid: \d+\n|^id: \d+\n/.test(stream),
        `The event stream starts with a numbered list: ${stream.slice(0, 120)}`,
      );
      assert.equal(
        (await pinned(`${phone.base}/v1/vault/items`, fingerprint, { token })).status,
        403,
        "The Vault stays on the computer",
      );

      const state = asRecord(await page.evaluate("window.openbot.mobile.getState()"));
      assert(
        state.enabled === true && state.transport === "tls" && state.unencrypted === false,
        "The state says: running, TLS",
      );
      assert.equal(String(state.fingerprint).replace(/:/g, "").toLowerCase(), fingerprint);
      await page.evaluate(`window.openbot.mobile.revokeDevice({ deviceId: ${JSON.stringify(deviceId)} })`);
      assert.equal(
        (await pinned(`${phone.base}/v1/agents`, fingerprint, { token })).status,
        401,
        "A removed phone is refused at once",
      );
      await dump(page, evidence, "06-phone-paired");
    });
  } finally {
    await first.app.close().catch(() => undefined);
  }
  const second = await launch(root, fixture);
  try {
    const { page } = second;
    await step("restart: the program starts again with the same data", async () => {
      const seen = await reachMainWindow(page, { agent: null });
      assert.deepEqual(seen, [], "No first-run screen after a restart");
    });
    await step("restart: the phone server runs again with the same certificate", async () => {
      assert(phone.fingerprint, "The first run did not pair a phone");
      const state = asRecord(await page.evaluate("window.openbot.mobile.getState()"));
      assert(state.enabled === true, "Mobile Connect resumes by itself");
      assert.equal(
        String(state.fingerprint).replace(/:/g, "").toLowerCase(),
        phone.fingerprint,
        "The certificate is the same",
      );
      const urls = Array.isArray(state.urls) ? state.urls.map(String) : [];
      const answer = await pinned(`${urls[0]}/app/`, phone.fingerprint);
      assert.equal(answer.status, 200, "The phone web app is served after the restart");
      assert.equal(Array.isArray(state.devices) ? state.devices.length : -1, 0, "The removed phone is still removed");
    });
    await step("restart: the agent and its history are still there", async () => {
      await page
        .getByRole("region", { name: "Agents" })
        .getByRole("button", { name: /^New agent/ })
        .click();
      await page.getByText("Stub: received").first().waitFor({ timeout: 20_000 });
      assert((await page.getByText(MESSAGE).count()) > 0, "The message from before the restart is shown");
      await dump(page, evidence, "05-after-restart");
    });
    await step("agent tools: the agent builds a shared table through the program's tool bridge", async () => {
      // After a restart the agent CLI connects again; the composer stays disabled until then.
      await page.getByRole("textbox", { name: "Message New agent" }).fill("DATA CREATE", { timeout: 90_000 });
      await page.getByRole("button", { name: "Send message" }).click();
      await page
        .getByText(/DATA-RESULT/)
        .first()
        .waitFor({ timeout: 45_000 });
      const tables = JSON.stringify(await page.evaluate("window.openbot.tables.list()"));
      assert(tables.includes("Sandbox leads"), `The table is listed through the window's API: ${tables.slice(0, 200)}`);
      await dump(page, evidence, "07-agent-tools");
    });
    await step("navigation: mark a background agent read from its row menu", async () => {
      // W5-UI3: earlier runs timed out on the row regex `/^Unread helper,/` (role is optional, so
      // the accessible name is often "Unread helper. …" without a comma). Wait for a stable unread
      // row, then for the menu item, instead of a fixed delay.
      const helperId = String(
        await page.evaluate(`(async () => {
        const api = window.openbot;
        const helper = (await api.agentSettings.createAgent({ name: "Unread helper" })).bot;
        await api.agent.sendMessage({ botId: helper.id, text: "Sidebar read test" });
        return helper.id;
      })()`),
      );
      await page.waitForFunction(
        `async () => {
        const snapshot = await window.openbot.agent.readConversation(${JSON.stringify(helperId)});
        return !snapshot.activeTurnId && snapshot.messages.some((item) => item.author === "assistant");
      }`,
        undefined,
        { timeout: 45_000 },
      );
      await page.waitForFunction(
        `async () => {
        const state = (await window.openbot.agent.listConversationReads())[${JSON.stringify(helperId)}];
        return (state?.unreadCount ?? 0) > 0;
      }`,
        undefined,
        { timeout: 15_000 },
      );
      const list = page.getByRole("navigation", { name: "Chat list" });
      const row = list.getByRole("button", { name: /^Unread helper(\.|,)/ });
      await row.waitFor({ state: "visible", timeout: 30_000 });
      await row.scrollIntoViewIfNeeded();
      await row.click({ button: "right" });
      const markRead = page.getByRole("menuitem", { name: "Mark as read", exact: true });
      await markRead.waitFor({ state: "visible", timeout: 10_000 });
      await markRead.click();
      await page.waitForFunction(
        `async () => {
        const api = window.openbot.agent;
        const snapshot = await api.readConversation(${JSON.stringify(helperId)});
        const state = (await api.listConversationReads())[${JSON.stringify(helperId)}];
        return state?.unreadCount === 0 && state.throughMessageId === snapshot.messages.at(-1)?.id;
      }`,
        undefined,
        { timeout: 15_000 },
      );
      await page.getByRole("heading", { name: "New agent", level: 1 }).waitFor();
      await dump(page, evidence, "navigation-mark-read");
    });
    await step("navigation: overflow pages remain reachable in a short viewport", async () => {
      const bounds = asRecord(await page.evaluate("({ width: innerWidth, height: innerHeight })"));
      const previousViewport = page.viewportSize() ?? { width: Number(bounds.width), height: Number(bounds.height) };
      try {
        await page.setViewportSize({ width: 1100, height: 400 });
        await page.getByRole("button", { name: /^More pages/ }).click();
        await page
          .getByRole("menu", { name: "More pages" })
          .getByRole("menuitem", { name: "Library", exact: true })
          .click();
        await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
        await dump(page, evidence, "navigation-overflow");
      } finally {
        await page.setViewportSize(previousViewport);
        await page
          .getByRole("navigation", { name: "Pages" })
          .getByRole("button", { name: "Agents", exact: true })
          .click();
      }
    });
    await step("channel UI: create, edit and reply", async () => {
      await page.getByRole("button", { name: "New channel", exact: true }).first().click();
      let dialog = page.getByRole("dialog");
      await dialog.getByLabel("Channel name", { exact: true }).fill(`ui-${Date.now().toString(36)}`);
      await dialog.getByLabel("Display title").fill("UI acceptance");
      await dialog.getByRole("button", { name: "New agent", exact: true }).click();
      const botId = String(
        await page.evaluate(
          `window.openbot.agent.listBots().then((bots) => bots.find((bot) => bot.name === "New agent")?.id ?? "")`,
        ),
      );
      assert(botId.length > 0, "The sandbox agent exists");
      await dialog.getByLabel("Lead agent").selectOption(botId);
      await dialog.getByLabel("Channel instructions").fill("Answer briefly.");
      await dialog.getByRole("button", { name: "Create channel", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Edit channel", exact: true }).click();
      dialog = page.getByRole("dialog");
      await dialog.getByLabel("Display title").fill("UI acceptance edited");
      await dialog.getByRole("button", { name: "Save changes" }).click();
      await dialog.waitFor({ state: "hidden" });
      await page.getByRole("heading", { name: "UI acceptance edited", exact: true }).waitFor();
      await page.getByLabel("New message to channel lead").fill("UI reply target");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await page.getByRole("button", { name: "Reply to UI reply target", exact: true }).click();
      await page.getByLabel("New message to channel lead").fill("UI reply linked");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await page.getByText("UI reply linked", { exact: true }).waitFor();
      const linked = await page.evaluate(`(async () => {
        const api = window.openbot.channels;
        const channel = (await api.list()).find((item) => item.title === "UI acceptance edited");
        if (!channel) return false;
        const messages = await api.listMessages({ channelId: channel.id });
        const target = messages.find((item) => item.text === "UI reply target");
        const reply = messages.find((item) => item.text === "UI reply linked");
        return Boolean(target && reply && reply.replyToMessageId === target.id);
      })()`);
      assert(linked, "The reply links to its parent in the engine");
      await dump(page, evidence, "channel-ui");
    });
    await step("channel: the lead delegates to a member and the task ends Done", async () => {
      // W4-BE2: a new channel with a lead and one member; one message from the person. The Codex fixture's lead
      // assigns the work to the member, waits for its result and then answers: queued -> running -> waiting -> done.
      const outcome = asRecord(
        await page.evaluate(`(async () => {
          const api = window.openbot.channels;
          const bots = await window.openbot.agent.listBots();
          const lead = bots.find((bot) => bot.name === "New agent");
          const helper = (await window.openbot.agentSettings.createAgent({ name: "Channel helper" })).bot;
          const channel = await api.create({
            name: "e2e-" + Date.now().toString(36), title: "E2E channel", instructions: "",
            memberBotIds: [lead.id, helper.id], leadBotId: lead.id, isolated: true,
          });
          const states = [];
          const off = window.openbot.agent.onEvent((event) => {
            if (event.type === "task-changed" && event.task.channelId === channel.id && !event.task.parentTaskId)
              states.push(event.task.state);
          });
          const sent = await api.sendMessage({ channelId: channel.id, text: "Plan the sandbox launch" });
          let task = sent.task;
          for (let i = 0; i < 240 && !["done", "failed", "cancelled"].includes(task.state); i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            task = (await api.listTasks(channel.id)).find((item) => item.id === sent.task.id) ?? task;
          }
          off();
          const tasks = await api.listTasks(channel.id);
          const messages = await api.listMessages({ channelId: channel.id });
          return {
            state: task.state,
            states,
            helperTasks: tasks.filter((item) => item.parentTaskId === task.id).map((item) => ({ owner: item.ownerBotId === helper.id ? "helper" : "other", state: item.state })),
            result: messages.filter((m) => m.kind === "result" && m.taskId === task.id).map((m) => m.text),
          };
        })()`),
      );
      console.log(`     channel: ${JSON.stringify(outcome)}`);
      await writeFile(join(evidence, "channel-outcome.json"), JSON.stringify(outcome, null, 2));
      assert.equal(outcome.state, "done", "The lead's task ends Done");
      const helpers = Array.isArray(outcome.helperTasks) ? outcome.helperTasks.map(asRecord) : [];
      assert(
        helpers.some((item) => item.owner === "helper" && item.state === "done"),
        "The member's task ends Done",
      );
      assert(Array.isArray(outcome.result) && outcome.result.length > 0, "The task has a result message");
    });
    await step("providers: a missing Claude CLI is Not installed in the status and in Usage", async () => {
      // W4-BE1: onboarding reads the status, Providers and Usage read listUsage; they must say the same.
      const seen = asRecord(
        await page.evaluate(`(async () => {
          const status = await window.openbot.agent.getStatus();
          const usage = await window.openbot.providers.listUsage();
          return {
            status: (status.providers ?? []).find((item) => item.id === "claude")?.state ?? null,
            usage: usage.find((item) => item.provider === "claude") ?? null,
            codex: usage.find((item) => item.provider === "codex")?.state ?? null,
          };
        })()`),
      );
      console.log(`     providers: ${JSON.stringify(seen)}`);
      assert.equal(seen.status, "not-installed");
      const usage = asRecord(seen.usage);
      assert.equal(usage.state, "unavailable", "Usage does not call a missing CLI available");
      assert(String(usage.reason).startsWith("Not installed"), `Usage says why: ${String(usage.reason)}`);
      assert.equal(seen.codex, "ok");
    });
    await step(
      "cli: download from the stand-in asks first, checks SHA-256, updates without a card, removes",
      async () => {
        // W5-BE1: the first download asks on a card in Needs you; the loopback stand-in plays the official servers.
        const downloadCards = async () => {
          const pending = await page.evaluate("window.openbot.agent.listPendingRequests()");
          return (Array.isArray(pending) ? pending : [])
            .map(asRecord)
            .filter(
              (item) => item.kind === "draft-preview" && String(asRecord(item.card).title).startsWith("Download Codex"),
            )
            .map((item) => String(asRecord(item.card).requestId));
        };
        const cliState = async (call: string) => asRecord(await page.evaluate(`window.openbot.subscriptions.${call}`));
        // Started without waiting: it answers only after the card below.
        await page.evaluate(
          "(() => { window.__cosgralCliInstall = window.openbot.subscriptions.installCli({ id: 'codex' }); return true; })()",
        );
        let cards: string[] = [];
        for (let attempt = 0; attempt < 40 && cards.length === 0; attempt += 1) {
          await page.waitForTimeout(250);
          cards = await downloadCards();
        }
        assert.equal(cards.length, 1, "One download card shows up in Needs you");
        await page.evaluate(
          `window.openbot.agent.respondToDraftPreview({ requestId: ${JSON.stringify(cards[0])}, decision: "send" })`,
        );
        const installed = asRecord(await page.evaluate("window.__cosgralCliInstall"));
        console.log(`     installed: ${JSON.stringify({ ...installed, executable: "(sandbox)" })}`);
        assert.equal(installed.error, null, `no error: ${String(installed.error)}`);
        assert.equal(installed.managedVersion, "1.0.0");
        const executable = String(installed.executable);
        assert(executable.startsWith(root), "The downloaded CLI is inside the sandbox profile");
        const bytes = await readFile(executable);
        assert.equal(
          createHash("sha256").update(bytes).digest("hex"),
          cliStandIn.sha256,
          "The file is the verified one",
        );

        cliStandIn.latest = "1.1.0";
        const updated = await cliState("updateCli({ id: 'codex' })");
        assert.equal(updated.managedVersion, "1.1.0", `updated: ${String(updated.error)}`);
        assert.equal((await downloadCards()).length, 0, "An update after the first yes needs no card");
        assert(!existsSync(dirname(executable)), "The older version folder is gone");

        cliStandIn.latest = "1.2.0";
        cliStandIn.corrupt = true;
        const requestsBefore = cliStandIn.fileRequests;
        const refused = await cliState("updateCli({ id: 'codex' })");
        cliStandIn.corrupt = false;
        assert.match(String(refused.error), /SHA-256/, "A file that fails the check is refused");
        assert.equal(refused.managedVersion, "1.1.0", "The verified version stays");
        assert.equal(cliStandIn.fileRequests - requestsBefore, 1, "No second try after a failed check");

        const removed = await cliState("removeCli({ id: 'codex' })");
        assert.equal(removed.managedVersion, null);
        assert(!existsSync(String(updated.executable)), "The downloaded CLI is removed");
        assert(existsSync(fixture.codex), "The CLI the program runs (not downloaded) is untouched");
      },
    );
    await step("accounts: add, sign in and out on the fake CLI, limit, remove; the system account stays", async () => {
      // W5-BE2: the Codex stand-in plays `codex login` / `login status` / `logout` with its own marker in CODEX_HOME.
      const call = async (code: string) => asRecord(await page.evaluate(`window.openbot.subscriptions.${code}`));
      const refused = async (code: string) =>
        page
          .evaluate(`window.openbot.subscriptions.${code}.then(() => "ok", (error) => String(error.message ?? error))`)
          .then(String);
      const accountsOf = (snapshot: DynamicRecord) =>
        Array.isArray(snapshot.accounts) ? snapshot.accounts.map(asRecord) : [];
      const first = await call("listAccounts()");
      const system = accountsOf(first).find((item) => item.id === "system-codex");
      assert.equal(system?.isDefault, true, "The system account is the default");
      assert.equal(asRecord(first.pool).maxAccountsPerProvider, 3);
      assert.match(await refused("logoutAccount({ id: 'system-codex' })"), /stays/);
      assert.match(await refused("removeAccount({ id: 'system-codex' })"), /cannot be removed/);

      const added = await call("addAccount({ provider: 'codex', label: 'Sandbox work' })");
      const id = String(added.id);
      assert.equal(added.loggedIn, false, "A new account starts signed out");
      const roaming = join(root, "home", "AppData", "Roaming");
      const folders = (await readdir(roaming)).map((name) => join(roaming, name, "accounts", id)).filter(existsSync);
      assert.equal(folders.length, 1, "The account has its own folder in the sandbox data folder");

      await call(`loginAccount({ id: ${JSON.stringify(id)} })`);
      let account: DynamicRecord = {};
      for (let attempt = 0; attempt < 160; attempt += 1) {
        await page.waitForTimeout(250);
        account = accountsOf(await call("listAccounts()")).find((item) => item.id === id) ?? {};
        const phase = asRecord(account.login).phase;
        if (phase === "success" || phase === "error") break;
      }
      console.log(
        `     signed in: ${JSON.stringify({ loggedIn: account.loggedIn, plan: account.plan, login: account.login })}`,
      );
      assert.equal(asRecord(account.login).phase, "success", "The fake sign-in finishes");
      assert.equal(account.loggedIn, true);
      assert.equal(account.plan, "ChatGPT");
      // The sign-in page is shown while waiting (unit tests); after success the link is cleared.
      assert.equal(asRecord(account.login).url, null, "The sign-in link is cleared after success");

      const out = await call(`logoutAccount({ id: ${JSON.stringify(id)} })`);
      assert.equal(out.loggedIn, false, "Signed out");
      const second = await call("addAccount({ provider: 'codex', label: 'Second' })");
      assert.match(await refused("addAccount({ provider: 'codex', label: 'Third' })"), /limit is 3/);
      await call(`removeAccount({ id: ${JSON.stringify(id)} })`);
      const last = await call(`removeAccount({ id: ${JSON.stringify(String(second.id))} })`);
      assert(!existsSync(folders[0] ?? ""), "The account folder is removed");
      assert.deepEqual(
        accountsOf(last).map((item) => item.id),
        ["system-codex", "system-claude"],
        "Only the system accounts stay",
      );
    });
    await step("ipc: every read-only call of window.openbot answers", async () => {
      const answers = await page.evaluate(GETTER_SMOKE);
      const results = (Array.isArray(answers) ? answers : []).map((item) => {
        const record = asRecord(item);
        return {
          name: String(record.name),
          ok: record.ok === true,
          error: record.error === undefined ? undefined : String(record.error),
        };
      });
      await writeFile(join(evidence, "ipc-getters.json"), JSON.stringify(results, null, 2));
      // A call that needs an agent, a routine or a channel answers with a validation message: the wiring works. Only
      // other answers (timeouts, "not a function", crashes) are failures.
      const needsInput = /required|Expected an object|Invalid [a-z ]*request|request is malformed|not configured/i;
      const failed = results.filter((result) => !result.ok && !needsInput.test(result.error ?? ""));
      const asked = results.filter((result) => !result.ok && needsInput.test(result.error ?? ""));
      console.log(
        `     ${results.length} calls: ${results.length - failed.length - asked.length} answered, ${asked.length} need arguments, ${failed.length} failed`,
      );
      for (const result of failed) console.log(`       ${result.name}: ${result.error}`);
      assert(failed.length === 0, `${failed.length} calls failed: ${failed.map((result) => result.name).join(", ")}`);
    });
    // W4-UI5: UI actions, sandbox-only accounts/data. Written for KK; not run by the UI task.
    const navigationName = `Navigation helper ${Date.now()}`;
    let navigationHelperId = "";
    await step("navigation: hide and show an agent from the row menu", async () => {
      navigationHelperId = String(
        await page.evaluate(
          `(async()=> (await window.openbot.agentSettings.createAgent({name:${JSON.stringify(navigationName)}})).bot.id)()`,
        ),
      );
      const rows = page.getByRole("navigation", { name: "Chat list" });
      const row = rows.getByRole("button", { name: new RegExp(`^${navigationName}`) });
      await row.click({ button: "right" });
      await page.getByRole("menuitem", { name: "Hide", exact: true }).click();
      await row.waitFor({ state: "detached" });
      await page.waitForFunction(
        `async()=> (await window.openbot.agent.listBots()).find(bot=>bot.id===${JSON.stringify(navigationHelperId)})?.hidden===true`,
      );
      await page.getByRole("switch", { name: "Show hidden" }).click({ force: true });
      await row.waitFor();
      await row.click({ button: "right" });
      await page.getByRole("menuitem", { name: "Show", exact: true }).click();
      await page.waitForFunction(
        `async()=> (await window.openbot.agent.listBots()).find(bot=>bot.id===${JSON.stringify(navigationHelperId)})?.hidden!==true`,
      );
      await page.getByRole("switch", { name: "Show hidden" }).click({ force: true });
      await row.waitFor();
      await dump(page, evidence, "navigation-hide-show");
    });
    await step("navigation: duplicate selects a new agent and explains excluded data", async () => {
      const rows = page.getByRole("navigation", { name: "Chat list" });
      await rows.getByRole("button", { name: new RegExp(`^${navigationName}`) }).click({ button: "right" });
      await page.getByRole("menuitem", { name: "Duplikuj", exact: true }).click();
      await page.getByRole("heading", { name: `${navigationName} kopia`, exact: true, level: 1 }).waitFor();
      await page.getByText(/Kopia gotowa.*Pamięć, historia/).waitFor();
      await page.waitForFunction(
        `async()=>{const bots=await window.openbot.agent.listBots();const source=bots.find(bot=>bot.id===${JSON.stringify(navigationHelperId)});const copy=bots.find(bot=>bot.name===${JSON.stringify(`${navigationName} kopia`)});return source && copy && source.id!==copy.id && source.workspacePath!==copy.workspacePath;}`,
      );
      await dump(page, evidence, "navigation-duplicate");
      // Remove only fixtures created in these two steps and return to the original conversation.
      await page.evaluate(
        `(async()=>{const bots=await window.openbot.agent.listBots();for(const bot of bots)if(bot.id===${JSON.stringify(navigationHelperId)} || bot.name===${JSON.stringify(`${navigationName} kopia`)})await window.openbot.agent.deleteBot(bot.id);})()`,
      );
      await rows.getByRole("button", { name: /^New agent/ }).click();
    });

    for (const [index, name] of PAGES.entries()) {
      await step(`page: ${name} opens without console errors`, async () => {
        const before = findings.length;
        const rail = page.getByRole("navigation", { name: "Pages" });
        const direct = rail.getByRole("button", { name, exact: true });
        if (await direct.count()) await direct.click();
        else {
          await rail.getByRole("button", { name: /^More pages/ }).click();
          await page.getByRole("menu", { name: "More pages" }).getByRole("menuitem", { name, exact: true }).click();
        }
        await page.waitForTimeout(2_000);
        const label = `page-${String(index + 1).padStart(2, "0")}-${name.toLowerCase().replace(/\s+/g, "-")}`;
        await dump(page, evidence, label);
        const text = (
          await page
            .locator("main")
            .first()
            .innerText()
            .catch(() => "")
        )
          .replace(/\s+/g, " ")
          .trim();
        console.log(`     ${name}: ${text.slice(0, 160)}`);
        assert(
          !/something went wrong|unexpected error|cannot read prop|is not a function/i.test(text),
          "Error text on the page",
        );
        const added = findings.slice(before).filter((finding) => finding.level !== "warning");
        assert(added.length === 0, `console: ${added.map((finding) => finding.text.slice(0, 160)).join(" | ")}`);
        // Settings is a full-screen dialog: leave it again.
        const settings = page.getByRole("dialog", { name: /^(Settings|Providers & permissions)$/ });
        if (await settings.count()) {
          await settings.getByRole("button", { name: "Cancel" }).click();
          await settings.waitFor({ state: "detached", timeout: 10_000 });
        }
      });
    }
  } finally {
    await second.app.close().catch(() => undefined);
  }
  // W4-BE2: the agent CLI cannot start. The window says so, keeps nothing "Working", and "Try again" recovers.
  const down = join(root, "fixture", "codex-down");
  await writeFile(down, "down");
  const third = await launch(root, fixture);
  try {
    const { page } = third;
    await step("blocked: a CLI that cannot start shows the reason and Try again, nothing stays Working", async () => {
      await page
        .getByRole("region", { name: "Agents" })
        .getByRole("button", { name: /^New agent/ })
        .first()
        .click();
      const card = page.locator(".agent-setup-card");
      await card.getByRole("button", { name: "Try again" }).waitFor({ timeout: 90_000 });
      const text = (await card.innerText()).replace(/\s+/g, " ");
      console.log(`     card: ${text.slice(0, 200)}`);
      assert(/could not be started|did not answer/i.test(text), "The card names the reason");
      assert.equal(await page.getByRole("status", { name: /is working/i }).count(), 0, "Nothing shows Working");
      await dump(page, evidence, "08-blocked");
      await rm(down, { force: true });
      await card.getByRole("button", { name: "Try again" }).click();
      const box = page.getByRole("textbox", { name: "Message New agent" });
      await box.fill("Hello after Try again", { timeout: 90_000 });
      await page.getByRole("button", { name: "Send message" }).click();
      await page.getByText("Stub: received").last().waitFor({ timeout: 45_000 });
      await dump(page, evidence, "09-after-try-again");
    });
  } finally {
    await rm(down, { force: true });
    await third.app.close().catch(() => undefined);
  }
  // W4-BE5: "Delete my data" removes the COSGRAL folders only. Sentinels: the regular OpenBot folder, the Codex
  // sign-in folder, a file outside, and a junction inside the data folder that points outside (never followed).
  const home = join(root, "home");
  const userData = join(home, "AppData", "Roaming", "COSGRAL Workspace Dev");
  const sentinels = [
    join(home, "AppData", "Roaming", "OpenBot", "sentinel.txt"),
    join(home, ".codex", "sentinel.txt"),
    join(root, "outside", "sentinel.txt"),
  ];
  for (const file of sentinels) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, "keep me");
  }
  // Files that must go: one in the program's data folder, one in the agents' shared folder (the start recreates
  // empty folders, so the files are the proof).
  const doomed = [join(userData, "wipe-me.txt"), join(home, "COSGRAL Workspace", "Shared", "wipe-me.txt")];
  for (const file of doomed) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, "delete me");
  }
  await rm(join(userData, "escape"), { force: true, recursive: false }).catch(() => undefined);
  await symlink(join(root, "outside"), join(userData, "escape"), "junction");
  const fourth = await launch(root, fixture);
  const later: { fifth: Session | null } = { fifth: null };
  try {
    await step("data wipe: Delete my data restarts into onboarding, keeps everything outside COSGRAL", async () => {
      const { page, app } = fourth;
      await page
        .getByRole("region", { name: "Agents" })
        .getByRole("button", { name: /^New agent/ })
        .first()
        .waitFor({ timeout: 30_000 });
      await page
        .getByRole("navigation", { name: "Pages" })
        .getByRole("button", { name: "Settings", exact: true })
        .click();
      const settings = page.getByRole("dialog", { name: /^(Settings|Providers & permissions)$/ });
      await settings.getByRole("button", { name: "Delete my data…" }).click({ timeout: 15_000 });
      await settings.getByLabel("Type DELETE to confirm").fill("DELETE");
      await settings.getByRole("button", { name: "Delete and restart" }).scrollIntoViewIfNeeded();
      await dump(page, evidence, "10-delete-my-data");
      const exited = new Promise<void>((resolveExit) => app.process().once("exit", () => resolveExit()));
      await settings.getByRole("button", { name: "Delete and restart" }).click();
      await Promise.race([
        exited,
        new Promise((_, reject) => setTimeout(() => reject(new Error("The program did not quit")), 60_000)),
      ]);
      assert(existsSync(`${userData}.wipe-pending`), "The wipe marker sits next to the data folder");

      const fifth = await launch(root, fixture);
      later.fifth = fifth;
      const seen = await reachMainWindow(fifth.page, { agent: null });
      console.log(`     after wipe: first-run screens ${seen.join(" -> ") || "(none)"}`);
      assert(seen.length > 0, "The first-run screens show again");
      await fifth.page.waitForTimeout(1500);
      assert.equal(
        await fifth.page
          .getByRole("region", { name: "Agents" })
          .getByRole("button", { name: /^New agent/ })
          .count(),
        0,
        "No agent is left",
      );
      assert(!existsSync(`${userData}.wipe-pending`), "The marker is gone");
      for (const file of doomed) assert(!existsSync(file), `Deleted: ${file.slice(root.length)}`);
      for (const file of sentinels)
        assert.equal(await readFile(file, "utf8"), "keep me", `Kept: ${file.slice(root.length)}`);
      await dump(fifth.page, evidence, "11-after-wipe");
    });
  } finally {
    await fourth.app.close().catch(() => undefined);
    await later.fifth?.app.close().catch(() => undefined);
    await cliStandIn.close().catch(() => undefined);
  }
  await writeFile(
    join(evidence, "run.json"),
    JSON.stringify({ steps, findings, main: mainOutput.join("").slice(0, 20_000) }, null, 2),
  );
  console.log(`findings: ${findings.length}`);
  for (const finding of findings.slice(0, 30)) {
    console.log(`  [${finding.where}] ${finding.level}: ${finding.text.slice(0, 220)}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
