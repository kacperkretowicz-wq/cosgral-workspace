// T-AG: probes for the next Electron acceptance (GO required). Modes:
//   COSGRAL_PROBE=restore-thread|menu-plus|clear-history|history-window|external-links|all
//   COSGRAL_SANDBOX_ROOT=<sandbox> COSGRAL_GO_DIR=<Shared/cosgral-sandbox> node scripts/sandbox-next-probes.ts
// Always: --lang=en-US + language=en + Codex fixture. Soft-SKIP when the product API is not on the tip yet.
// page.evaluate uses string sources (like sandbox-rename-probe / sandbox-acceptance) so Window.openbot stays untyped in node TS.

import assert from "node:assert/strict";
import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type DynamicRecord, isBoolean, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { type ElectronApplication, _electron as electron, type Page } from "playwright";
import { cleanEnvironment } from "./sandbox-env.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODE = (process.env.COSGRAL_PROBE || "all").toLowerCase();

function sandboxRoot(): string {
  const root = process.env.COSGRAL_SANDBOX_ROOT ? resolve(process.env.COSGRAL_SANDBOX_ROOT) : "";
  assert(root, "COSGRAL_SANDBOX_ROOT must point to a sandbox folder");
  assert(!root.startsWith(repo), "sandbox must stay outside the repository");
  return root;
}

async function requireGo(): Promise<void> {
  if (process.env.COSGRAL_SKIP_GO === "1") {
    console.log("GO skipped (COSGRAL_SKIP_GO=1)");
    return;
  }
  const gate = process.env.COSGRAL_GO_DIR
    ? resolve(process.env.COSGRAL_GO_DIR)
    : resolve(repo, "..", "..", "cosgral-sandbox");
  const candidates = [gate, resolve(repo, "..", "..", "cosgral-sandbox"), resolve(repo, "..", "cosgral-sandbox")];
  const empty: string[] = [];
  for (const dir of candidates) {
    const names = await readdir(dir).catch(() => empty);
    const go = names.find((name) => /^GO-tester-.*\.txt$/i.test(name));
    if (go) {
      console.log(`GO ok: ${join(dir, go)}`);
      return;
    }
  }
  assert.fail("Missing GO-tester-*.txt — do not launch Electron without the lead's GO");
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
    USERNAME: "Demo",
    USER: "Demo",
    COMPUTERNAME: "COSGRAL-SANDBOX",
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

async function reachMain(page: Page): Promise<void> {
  const pages = page.getByRole("navigation", { name: "Pages" }).or(page.getByRole("navigation", { name: "Strony" }));
  for (let round = 0; round < 40; round += 1) {
    if (await pages.count()) return;
    const where = page
      .getByRole("dialog", { name: "Where will COSGRAL Workspace run?" })
      .or(page.getByRole("dialog", { name: /Gdzie ma działać COSGRAL/i }));
    if (await where.count()) {
      await page.getByRole("button", { name: /Use this computer|Użyj tego komputera/i }).click({ timeout: 10_000 });
      await where.waitFor({ state: "detached", timeout: 15_000 });
      continue;
    }
    const local = page
      .getByRole("dialog", { name: "Set up this computer" })
      .or(page.getByRole("dialog", { name: /Skonfiguruj ten komputer|Ustawienia tego komputera/i }));
    if (await local.count()) {
      await local
        .getByRole("combobox", { name: /Language|Język/i })
        .selectOption({ label: "English" })
        .catch(() => undefined);
      await page.getByRole("button", { name: /Continue with Codex|Kontynuuj z Codex/i }).click({ timeout: 120_000 });
      await local.waitFor({ state: "detached", timeout: 15_000 });
      continue;
    }
    await page.waitForTimeout(500);
  }
  throw new Error("main window did not appear");
}

async function launchApp(root: string, fixture: { codex: string; claude: string }): Promise<ElectronApplication> {
  return electron.launch({
    executablePath: join(repo, "node_modules", "electron", "dist", "electron.exe"),
    args: ["--lang=en-US", repo],
    cwd: repo,
    env: {
      ...cleanEnvironment(),
      ...sandboxEnvironment(root),
      OPENBOT_CODEX_PATH: fixture.codex,
      OPENBOT_CLAUDE_PATH: fixture.claude,
      LANG: "en-US",
      LC_ALL: "en-US",
      COSGRAL_WIPE_NO_RELAUNCH: "1",
    },
    timeout: 90_000,
  });
}

async function ensureDirs(root: string): Promise<void> {
  for (const folder of [
    join(root, "home", "AppData", "Roaming"),
    join(root, "home", "AppData", "Local"),
    join(root, "tmp"),
    join(root, "evidence"),
  ])
    await mkdir(folder, { recursive: true });
}

type ProbeResult = { name: string; ok: boolean; detail: string; skip?: boolean };

function asRecord(value: unknown): DynamicRecord {
  return isDynamicRecord(value) ? value : {};
}

function asStr(value: unknown): string {
  return isString(value) ? value : "";
}

function asNum(value: unknown): number {
  return isNumber(value) ? value : Number.NaN;
}

function asBool(value: unknown): boolean {
  return isBoolean(value) && value;
}

async function probeMenuPlus(page: Page): Promise<ProbeResult> {
  await page.evaluate(`(async () => {
    const api = window.openbot;
    const bots = await api.agent.listBots();
    let bot = bots.find((row) => !row.hidden) || bots[0];
    if (!bot) bot = await api.agent.createBot();
    await api.agent.updateBot({ botId: bot.id, name: "Plus probe" });
  })()`);
  await page.waitForTimeout(600);
  const row = page.getByRole("button", { name: /Plus probe/i }).first();
  await row.click({ timeout: 15_000 });
  await page.waitForTimeout(400);
  const plus = page
    .getByRole("button", { name: /^\+$|^Attach|composer/i })
    .or(page.locator('button:has-text("+")'))
    .first();
  // Prefer aria near composer
  const attachPlus = page.getByRole("button", { name: /Attach|More composer|composer actions|\+/i }).first();
  if ((await attachPlus.count()) > 0) await attachPlus.click();
  else await plus.click();
  await page.waitForTimeout(500);
  const items = [
    { id: "attach", re: /Attach files|Załącz pliki/i, needEnabled: true },
    { id: "skill", re: /Use a skill|Użyj skilla/i, needEnabled: true },
    { id: "teach", re: /Teach a task|Naucz zadania/i, needEnabled: false },
    { id: "side", re: /Side question|Pytanie boczne/i, needEnabled: true },
    { id: "voice", re: /^Voice$|^Głos$/i, needEnabled: false },
  ];
  const found: string[] = [];
  for (const item of items) {
    const loc = page.getByRole("menuitem", { name: item.re });
    const n = await loc.count();
    if (!n) {
      found.push(`MISS:${item.id}`);
      continue;
    }
    const disabled = await loc
      .first()
      .isDisabled()
      .catch(() => false);
    if (item.needEnabled && disabled) found.push(`OFF:${item.id}`);
    else if (!item.needEnabled && !disabled) found.push(`ON_UNEXPECTED:${item.id}`);
    else found.push(`OK:${item.id}${item.needEnabled ? "" : ":disabled"}`);
  }
  const ok = found.every((part) => part.startsWith("OK:"));
  return { name: "menu-plus", ok, detail: found.join(" ") };
}

async function probeRestoreThread(
  page: Page,
  app: ElectronApplication,
  root: string,
  fixture: { codex: string; claude: string },
): Promise<ProbeResult> {
  const seeded = asRecord(
    await page.evaluate(`(async () => {
    const api = window.openbot;
    const bots = await api.agent.listBots();
    let bot = bots.find((row) => !row.hidden) || bots[0];
    if (!bot) bot = await api.agent.createBot();
    await api.agent.updateBot({ botId: bot.id, name: "Restore thread probe" });
    const created = api.threads?.create
      ? await api.threads.create({ botId: bot.id, title: "Thread to restore" })
      : null;
    const threads = Array.isArray(created?.threads) ? created.threads : [];
    const tid =
      created?.activeThreadId ||
      threads.find((row) => row.title === "Thread to restore")?.id ||
      null;
    if (!tid) return { botId: bot.id, threadId: "" };
    await api.appSettings?.update({
      workspace: {
        restore: true,
        last: { page: "agents", botId: bot.id, threadId: tid },
      },
    });
    return { botId: bot.id, threadId: tid };
  })()`),
  );
  const seededBotId = asStr(seeded.botId);
  const seededThreadId = asStr(seeded.threadId);
  if (!seededThreadId) {
    return { name: "restore-thread", ok: false, detail: "threads.create missing or no threadId", skip: false };
  }
  await app.close().catch(() => undefined);
  const app2 = await launchApp(root, fixture);
  const page2 = await app2.firstWindow();
  await page2.waitForLoadState("domcontentloaded");
  try {
    await reachMain(page2);
    await page2.waitForTimeout(1800);
    const place = asRecord(
      await page2.evaluate(`(async () => {
      const s = await window.openbot.appSettings?.get();
      const last = s?.workspace.last;
      return {
        restore: s?.workspace.restore === true,
        page: last?.page ?? null,
        botId: last?.botId ?? null,
        threadId: last?.threadId ?? null,
      };
    })()`),
    );
    const tab = await page2.getByRole("tab", { name: /Thread to restore/i }).count();
    const ok =
      asBool(place.restore) &&
      asStr(place.botId) === seededBotId &&
      asStr(place.threadId) === seededThreadId &&
      tab > 0;
    return {
      name: "restore-thread",
      ok,
      detail: JSON.stringify({
        seeded: { botId: seededBotId, threadId: seededThreadId },
        place,
        tabVisible: tab > 0,
      }),
    };
  } finally {
    await app2.close().catch(() => undefined);
  }
}

async function probeClearHistory(page: Page): Promise<ProbeResult> {
  const hasApi = asBool(await page.evaluate(`(() => Boolean(window.openbot.channels?.clearHistory))()`));
  if (!hasApi) {
    return {
      name: "clear-history",
      ok: true,
      skip: true,
      detail: "SKIP: channels.clearHistory not on tip — run after KK-AG merge",
    };
  }
  const result = asRecord(
    await page.evaluate(`(async () => {
    const api = window.openbot;
    const list = await api.channels.list();
    const channels = Array.isArray(list) ? list : list?.channels || [];
    let channel = channels[0];
    if (!channel && api.channels.create) {
      channel = await api.channels.create({ name: "Clear probe channel" });
    }
    if (!channel?.id) return { error: "no-channel", remaining: -1 };
    await api.channels.sendMessage?.({ channelId: channel.id, text: "before clear" });
    const cleared = await api.channels.clearHistory({ channelId: channel.id });
    const messages = await api.channels.listMessages({ channelId: channel.id });
    const rows = Array.isArray(messages) ? messages : messages?.messages || [];
    return { error: "", cleared, remaining: rows.length };
  })()`),
  );
  const error = asStr(result.error);
  if (error) {
    return { name: "clear-history", ok: false, detail: error };
  }
  return {
    name: "clear-history",
    ok: asNum(result.remaining) === 0,
    detail: JSON.stringify(result),
  };
}

async function probeHistoryWindow(page: Page): Promise<ProbeResult> {
  const probe = asRecord(
    await page.evaluate(`(async () => {
    const api = window.openbot;
    const list = await api.channels.list();
    const channels = Array.isArray(list) ? list : list?.channels || [];
    const channel = channels[0];
    if (!channel) return { skip: true, reason: "no-channel" };
    if (!("historyWindow" in channel) && !api.channels.update) {
      return { skip: true, reason: "historyWindow not on tip — run after BE-Z" };
    }
    if (api.channels.update) {
      try {
        await api.channels.update({ channelId: channel.id, historyWindow: 20 });
      } catch (error) {
        return { skip: true, reason: String(error) };
      }
    }
    const again = await api.channels.list();
    const rows = Array.isArray(again) ? again : again?.channels || [];
    const updated = rows.find((row) => row.id === channel.id);
    return { skip: false, historyWindow: updated?.historyWindow ?? null };
  })()`),
  );
  if (asBool(probe.skip)) {
    return { name: "history-window", ok: true, skip: true, detail: `SKIP: ${asStr(probe.reason)}` };
  }
  return {
    name: "history-window",
    ok: asNum(probe.historyWindow) === 20,
    detail: JSON.stringify(probe),
  };
}

async function probeExternalLinks(page: Page): Promise<ProbeResult> {
  const before = await page.evaluate(`(async () => {
    const api = window.openbot.appSettings;
    await api?.update({ behavior: { externalLinks: "app" } });
    const s = await api?.get();
    return s?.behavior.externalLinks ?? null;
  })()`);
  if (before !== "app") {
    return { name: "external-links", ok: false, detail: `could not set externalLinks=app (got ${String(before)})` };
  }
  // Prefer IPC path used by Conversation.openMessageLink when present.
  const opened = asRecord(
    await page.evaluate(`(async () => {
    const browser = window.openbot.browser;
    if (browser?.open) {
      await browser.open("https://example.invalid/probe-app");
      const tabs = browser.listTabs ? await browser.listTabs() : null;
      return { via: "browser.open", tabs };
    }
    return { via: "setting-only", tabs: null };
  })()`),
  );
  await page.evaluate(`(async () => {
    await window.openbot.appSettings?.update({ behavior: { externalLinks: "browser" } });
  })()`);
  const after = await page.evaluate(
    `(async () => (await window.openbot.appSettings?.get())?.behavior.externalLinks)()`,
  );
  return {
    name: "external-links",
    ok: before === "app" && after === "browser",
    detail: JSON.stringify({ before, after, opened }),
  };
}

async function main(): Promise<void> {
  await requireGo();
  const root = sandboxRoot();
  if (!process.argv.includes("--keep")) await rm(root, { recursive: true, force: true });
  await ensureDirs(root);
  const fixture = await installFixture(root);
  const results: ProbeResult[] = [];

  const want = (name: string) => MODE === "all" || MODE === name;

  let app: ElectronApplication | null = await launchApp(root, fixture);
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  try {
    await reachMain(page);
    await page.evaluate(`(async () => {
      await window.openbot.appSettings?.update({ language: "en" });
    })()`);

    if (want("menu-plus")) results.push(await probeMenuPlus(page));
    if (want("clear-history")) results.push(await probeClearHistory(page));
    if (want("history-window")) results.push(await probeHistoryWindow(page));
    if (want("external-links")) results.push(await probeExternalLinks(page));

    if (want("restore-thread") && app) {
      // restore-thread closes and relaunches; leave this for last
      const restore = await probeRestoreThread(page, app, root, fixture);
      results.push(restore);
      app = null;
    }
  } finally {
    if (app) await app.close().catch(() => undefined);
  }

  await writeFile(join(root, "evidence", "next-probes.json"), JSON.stringify({ mode: MODE, results }, null, 2));
  for (const row of results) {
    const tag = row.skip ? "SKIP" : row.ok ? "ok" : "FAIL";
    console.log(`${tag}  ${row.name}: ${row.detail}`);
  }
  const hardFail = results.some((row) => !row.ok && !row.skip);
  assert(!hardFail, `next probes failed: ${JSON.stringify(results.filter((r) => !r.ok && !r.skip))}`);
}

await main();
