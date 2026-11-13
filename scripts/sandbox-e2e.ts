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
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type { IncomingHttpHeaders } from "node:http";
import { Agent, request } from "node:https";
import { dirname, join, resolve, sep } from "node:path";
import { connect } from "node:tls";
import { fileURLToPath } from "node:url";
import { type DynamicRecord, isDynamicRecord } from "@openbot/contracts/runtime-values";
import { type ElectronApplication, _electron as electron, type Page } from "playwright";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface Finding {
  where: string;
  level: string;
  text: string;
}

const findings: Finding[] = [];
const steps: Array<{ name: string; ok: boolean; detail?: string; ms: number }> = [];
const mainOutput: string[] = [];
const MESSAGE = "Hello from the sandbox";
const PHONE_MESSAGE = "Hello from the sandbox phone";

/** Runs inside the window (a string, because the window cannot import): calls every read-only call without arguments. */
const GETTER_SMOKE = `(async () => {
  const api = window.openbot;
  const wanted = /^(get[A-Za-z]*|list[A-Za-z]*|status)$/;
  const skip = new Set(["getMacPermissions"]);
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
      if (typeof fn !== "function" || !wanted.test(method) || skip.has(method) || fn.length !== 0) continue;
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
      ...process.env,
      ...sandboxEnvironment(root),
      OPENBOT_CODEX_PATH: fixture.codex,
      OPENBOT_CLAUDE_PATH: fixture.claude,
    },
    timeout: 60_000,
  });
  app.process().stdout?.on("data", (chunk) => mainOutput.push(String(chunk)));
  app.process().stderr?.on("data", (chunk) => mainOutput.push(String(chunk)));
  app.on("window", (window) => watch(window, "window"));
  const page = await app.firstWindow();
  watch(page, "main");
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}

/** Goes through the first-run screens when they are shown; returns once the main window with the page rail is up. */
async function reachMainWindow(page: Page, choose: { agent: string | null }): Promise<string[]> {
  const seen: string[] = [];
  const welcome = page.getByRole("dialog", { name: "Welcome setup" });
  const where = page.getByRole("dialog", { name: "Where will COSGRAL Workspace run?" });
  const local = page.getByRole("dialog", { name: "Set up this computer" });
  const pages = page.getByRole("navigation", { name: "Pages" });
  for (let round = 0; round < 40; round += 1) {
    if (await pages.count()) return seen;
    if (await welcome.count()) {
      seen.push("welcome");
      if (choose.agent) await page.getByRole("combobox", { name: "First agent" }).selectOption({ label: choose.agent });
      await page.getByRole("button", { name: "Finish setup" }).click({ timeout: 10_000 });
      await welcome.waitFor({ state: "detached", timeout: 15_000 });
    } else if (await where.count()) {
      seen.push("where");
      await page.getByRole("button", { name: /Use this computer/ }).click({ timeout: 10_000 });
      await where.waitFor({ state: "detached", timeout: 15_000 });
    } else if (await local.count()) {
      seen.push("local");
      await page.getByRole("button", { name: "Continue with Codex" }).click({ timeout: 10_000 });
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
      await page.getByRole("textbox", { name: "Message New agent" }).fill("DATA CREATE");
      await page.getByRole("button", { name: "Send message" }).click();
      await page
        .getByText(/DATA-RESULT/)
        .first()
        .waitFor({ timeout: 45_000 });
      const tables = JSON.stringify(await page.evaluate("window.openbot.tables.list()"));
      assert(tables.includes("Sandbox leads"), `The table is listed through the window's API: ${tables.slice(0, 200)}`);
      await dump(page, evidence, "07-agent-tools");
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
      const needsInput = /required|Expected an object|Invalid [a-z ]*request|not configured/i;
      const failed = results.filter((result) => !result.ok && !needsInput.test(result.error ?? ""));
      const asked = results.filter((result) => !result.ok && needsInput.test(result.error ?? ""));
      console.log(
        `     ${results.length} calls: ${results.length - failed.length - asked.length} answered, ${asked.length} need arguments, ${failed.length} failed`,
      );
      for (const result of failed) console.log(`       ${result.name}: ${result.error}`);
      assert(failed.length === 0, `${failed.length} calls failed: ${failed.map((result) => result.name).join(", ")}`);
    });
    for (const [index, name] of PAGES.entries()) {
      await step(`page: ${name} opens without console errors`, async () => {
        const before = findings.length;
        await page.getByRole("navigation", { name: "Pages" }).getByRole("button", { name }).click();
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
        const settings = page.getByRole("dialog", { name: "Providers & permissions" });
        if (await settings.count()) {
          await settings.getByRole("button", { name: "Cancel" }).click();
          await settings.waitFor({ state: "detached", timeout: 10_000 });
        }
      });
    }
  } finally {
    await second.app.close().catch(() => undefined);
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
