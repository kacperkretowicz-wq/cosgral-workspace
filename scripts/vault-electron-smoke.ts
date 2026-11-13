// COSGRAL W2 sandbox proof for the Vault, run inside Electron (real BrowserHost and safeStorage):
//   electron <bundle of this file>, with USERPROFILE / APPDATA / LOCALAPPDATA in COSGRAL_VAULT_SANDBOX.
// A loopback test page asks for a user name, password and one-time code. The person saves a test login with a
// two-step key; an agent on the Codex fixture signs in with Vault tools. The script checks that the page got the
// right values, that nothing the agent saw and no file of the sandbox profile holds them in plain text, and that
// the item is still there after a restart. Test data only.

import assert from "node:assert/strict";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { join, resolve } from "node:path";
import { isDynamicRecord, isNumber } from "@openbot/contracts/runtime-values";
import { app, BrowserWindow, safeStorage } from "electron";
import { AgentService } from "../src/backend/agent-service";
import { BotStore } from "../src/backend/bot-store";
import { BrowserHost } from "../src/backend/browser-host";
import { ChannelEngine } from "../src/backend/channel-engine";
import { ChannelStore } from "../src/backend/channel-store";
import { MailboxStore } from "../src/backend/mailbox-store";
import { OpenBotDatabase } from "../src/backend/openbot-database";
import { totp } from "../src/backend/totp";
import { type SecretBox, VaultStore } from "../src/backend/vault-store";

const TEST_PASSWORD = "Sandbox-Only-Pass-4821!";
const TEST_TWO_STEP_KEY = "KRSXG5CTMVRXEZLUKN2XAZLSKNSWG4TF";

const box: SecretBox = {
  canEncrypt: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain).toString("base64"),
  decrypt: (cipher) => safeStorage.decryptString(Buffer.from(cipher, "base64")),
};

const LOGIN_PAGE = `<!doctype html><html><head><title>COSGRAL test sign-in</title></head><body>
<form method="post" action="/submit" id="sign-in">
<p><input name="username" aria-label="User name" autocomplete="off"></p>
<p><input name="password" type="password" aria-label="Password" autocomplete="off"></p>
<p><input name="otp" aria-label="One-time code" inputmode="numeric" autocomplete="off"
  oninput="if (this.value.length === 6) document.getElementById('sign-in').submit()"></p>
<p><button type="submit">Sign in</button></p>
</form></body></html>`;

async function body(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

/** Files of the sandbox that contain one of the values in UTF-8 or UTF-16. */
async function filesContaining(root: string, values: string[]): Promise<string[]> {
  const needles = values.flatMap((value) => [Buffer.from(value, "utf8"), Buffer.from(value, "utf16le")]);
  const found: string[] = [];
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (!entry.isFile() || (await stat(path)).size > 200 * 1024 * 1024) continue;
      let bytes: Buffer;
      try {
        bytes = await readFile(path);
      } catch {
        continue;
      }
      if (needles.some((needle) => bytes.includes(needle))) found.push(path);
    }
  };
  await walk(root);
  return found;
}

async function main(): Promise<void> {
  const root = process.env.COSGRAL_VAULT_SANDBOX ? resolve(process.env.COSGRAL_VAULT_SANDBOX) : "";
  assert(
    root &&
      resolve(process.env.USERPROFILE ?? "").startsWith(root) &&
      resolve(process.env.APPDATA ?? "").startsWith(root) &&
      resolve(process.env.LOCALAPPDATA ?? "").startsWith(root),
    "Run only with a dedicated sandbox profile",
  );
  const node = process.env.COSGRAL_NODE_PATH;
  assert(node, "COSGRAL_NODE_PATH must point to node.exe for the Codex fixture");
  app.setPath("userData", join(root, "user-data"));
  await app.whenReady();
  assert(safeStorage.isEncryptionAvailable(), "The operating system must encrypt (safeStorage) in the sandbox");

  const received: Array<{ username: string; password: string; otp: string; at: number }> = [];
  const server = createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/submit") {
      const form = await body(request);
      received.push({
        username: form.get("username") ?? "",
        password: form.get("password") ?? "",
        otp: form.get("otp") ?? "",
        at: Date.now(),
      });
      response.writeHead(303, { Location: `/welcome?user=${encodeURIComponent(form.get("username") ?? "")}` });
      response.end();
      return;
    }
    if (request.url?.startsWith("/welcome")) {
      const user = new URL(request.url, "http://127.0.0.1").searchParams.get("user") ?? "";
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><title>Signed in</title><p>Signed in as ${user.replace(/[^a-z0-9-]/gi, "")}</p>`);
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(LOGIN_PAGE);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert(isDynamicRecord(address) && isNumber(address.port), "The test page listens on a TCP port");
  const site = `http://127.0.0.1:${address.port}`;
  process.env.COSGRAL_VAULT_SITE = site;

  const fixture = join(root, "Codex Fixture");
  await mkdir(fixture, { recursive: true });
  await writeFile(
    join(fixture, "codex.cjs"),
    await readFile(join(process.cwd(), "src/backend/testing/channel-codex.cjs")),
  );
  await writeFile(join(fixture, "codex.cmd"), `@echo off\r\n"${node}" "%~dp0codex.cjs" %*\r\n`);
  process.env.OPENBOT_CODEX_PATH = join(fixture, "codex.cmd");
  process.env.OPENBOT_CLAUDE_PATH = join(root, "missing-claude.exe");

  const window = new BrowserWindow({ show: false, width: 1100, height: 800 });
  const browser = new BrowserHost(window, join(root, "downloads"), join(root, "user-data", "browser-state.json"));
  await browser.setVisible({ visible: true, bounds: { x: 0, y: 0, width: 1000, height: 700 } });
  const dataDir = join(root, "data");
  const database = new OpenBotDatabase(dataDir);
  const bots = new BotStore(dataDir, join(root, "home"), database);
  const mailbox = new MailboxStore(dataDir, bots.sharedRoot, database);
  const service = new AgentService(bots, mailbox, browser);
  service.useSecretBox(box);
  await service.initialize();
  const lead = await service.createBot();
  const login = service.vault.save({
    kind: "login",
    url: `${site}/login`,
    username: "test-user",
    password: TEST_PASSWORD,
    twoStepKey: TEST_TWO_STEP_KEY,
  });

  const channels = new ChannelStore(database, { botExists: (id) => service.listBots().some((bot) => bot.id === id) });
  const channel = channels.create({
    name: "vault",
    title: "Vault sandbox",
    instructions: "Use the fixture only",
    memberBotIds: [lead.id],
    leadBotId: lead.id,
    isolated: true,
  });
  const engine = new ChannelEngine(channels, { run: (input) => service.runChannelTurn(input) });
  engine.start();
  const task = engine.sendMessage({ channelId: channel.id, text: "VAULT SMOKE", resourceKey: "browser" }).task;
  const deadline = Date.now() + 60_000;
  while (!["done", "failed"].includes(channels.getTask(task.id).state)) {
    assert(Date.now() < deadline, "The Vault sign-in timed out");
    await new Promise((done) => setTimeout(done, 100));
  }
  const resultId = channels.getTask(task.id).resultMessageId;
  const agentText = resultId ? channels.getMessage(channel.id, resultId).text : "";
  assert.equal(channels.getTask(task.id).state, "done", agentText.slice(0, 300));
  const seen = JSON.parse(agentText);
  assert.match(String(seen.welcome), /Signed in as test-user/);
  assert.equal(received.length, 1, "The test page got exactly one sign-in");
  const sent = received[0];
  assert(sent?.username === "test-user", "The page got the Vault user name");
  assert(sent.password === TEST_PASSWORD, "The page got the Vault password");
  const codes = [-1, 0, 1].map((step) => totp({ secret: TEST_TWO_STEP_KEY }, sent.at + step * 30_000));
  assert(codes.includes(sent.otp), "The page got a current two-step code");
  const secrets = [TEST_PASSWORD, TEST_TWO_STEP_KEY, sent.otp];
  const agentVisible = JSON.stringify(channels.listMessages(channel.id));
  for (const secret of secrets) assert(!agentVisible.includes(secret), "Nothing the agent saw holds a secret value");

  await engine.stop();
  await service.stop();
  await browser.destroy();
  database.close();
  const leaks = await filesContaining(root, [TEST_PASSWORD, TEST_TWO_STEP_KEY]);
  assert.deepEqual(leaks, [], "No file of the sandbox profile holds the password or the two-step key in plain text");

  const reopened = new OpenBotDatabase(dataDir);
  await reopened.initialize();
  const vault = new VaultStore(reopened, box);
  assert(
    vault.list().some((item) => item.id === login.id && item.username === "test-user"),
    "The login survives a restart",
  );
  const restored = vault.secrets(login.id);
  assert(restored.kind === "login" && restored.password === TEST_PASSWORD, "The login decrypts after a restart");
  const itemsAfterRestart = vault.list().length;
  reopened.close();

  const evidence = {
    ok: true,
    electron: process.versions.electron,
    site,
    pageReceived: { username: sent.username, passwordMatches: true, otpValid: true },
    agentSaw: seen,
    sandboxFilesWithPlaintextSecret: leaks.length,
    vaultAfterRestart: itemsAfterRestart,
  };
  await writeFile(join(root, "evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(
    JSON.stringify({
      ok: true,
      signedIn: true,
      pageGotVaultValues: true,
      agentSawSecret: false,
      plaintextInSandboxFiles: leaks.length,
      itemAfterRestart: true,
      evidence: join(root, "evidence.json"),
    }),
  );
  server.close();
}

main()
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    app.exit(1);
  });
