// T-AF/T-AI: Electron probes — tray (keepBackground), Restore workspace, Launch at login (sandbox setting only).
//   COSGRAL_SANDBOX_ROOT=<sandbox> node scripts/sandbox-behavior-probe.ts
// Does not enable real Windows autostart permanently: launchAtLogin is toggled true then false; registry left as before.
// String evaluate + runtime-values (same as sandbox-next-probes / sandbox-rename-probe).

import assert from "node:assert/strict";
import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type DynamicRecord, isBoolean, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { type ElectronApplication, _electron as electron, type Page } from "playwright";
import { cleanEnvironment } from "./sandbox-env.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function sandboxRoot(): string {
  const root = process.env.COSGRAL_SANDBOX_ROOT ? resolve(process.env.COSGRAL_SANDBOX_ROOT) : "";
  assert(root, "COSGRAL_SANDBOX_ROOT must point to a sandbox folder");
  assert(!root.startsWith(repo), "sandbox must stay outside the repository");
  return root;
}

async function requireGo(): Promise<void> {
  if (process.env.COSGRAL_SKIP_GO === "1") return;
  const gate = process.env.COSGRAL_GO_DIR
    ? resolve(process.env.COSGRAL_GO_DIR)
    : resolve(repo, "..", "..", "cosgral-sandbox");
  const candidates = [gate, resolve(repo, "..", "..", "cosgral-sandbox"), resolve(repo, "..", "cosgral-sandbox")];
  for (const dir of candidates) {
    const empty: string[] = [];
    const names = await readdir(dir).catch(() => empty);
    const go = names.find((name) => /^GO-tester-.*\.txt$/i.test(name));
    if (go) {
      console.log(`GO ok: ${join(dir, go)}`);
      return;
    }
  }
  assert.fail("Missing GO-tester-*.txt");
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

function asRecord(value: unknown): DynamicRecord {
  return isDynamicRecord(value) ? value : {};
}

function asStr(value: unknown): string {
  return isString(value) ? value : "";
}

function asBool(value: unknown): boolean {
  return isBoolean(value) && value;
}

function loginFlag(value: unknown): boolean {
  return asBool(asRecord(value).openAtLogin);
}

async function seedTwoAgents(page: Page): Promise<{ agentA: string; agentB: string }> {
  const raw = asRecord(
    await page.evaluate(`(async () => {
    const api = window.openbot;
    const bots = await api.agent.listBots();
    for (const bot of bots) {
      if (!bot.hidden) await api.agent.updateBot({ botId: bot.id, hidden: true }).catch(() => undefined);
    }
    const a = await api.agent.createBot();
    await api.agent.updateBot({ botId: a.id, name: "Probe Agent A" });
    const b = await api.agent.createBot();
    await api.agent.updateBot({ botId: b.id, name: "Probe Agent B" });
    return { agentA: a.id, agentB: b.id };
  })()`),
  );
  return { agentA: asStr(raw.agentA), agentB: asStr(raw.agentB) };
}

async function openLibraryAgentB(page: Page, agentB: string): Promise<void> {
  await page.getByRole("button", { name: /^Library$|^Biblioteka$/i }).click({ timeout: 15_000 });
  await page.waitForTimeout(400);
  const chatList = page.getByRole("navigation", { name: "Chat list" }).or(page.getByRole("region", { name: "Agents" }));
  const row = chatList
    .getByRole("button")
    .filter({ hasText: /Probe Agent B/i })
    .first();
  if (await row.count()) await row.click();
  await page.waitForTimeout(900);
  await page.evaluate(`(async (botId) => {
    await window.openbot.appSettings?.update({
      workspace: { restore: true, last: { page: "library", botId, threadId: null } },
    });
  })(${JSON.stringify(agentB)})`);
  await page.waitForTimeout(700);
}

async function main(): Promise<void> {
  await requireGo();
  const root = sandboxRoot();
  if (!process.argv.includes("--keep")) await rm(root, { recursive: true, force: true });
  for (const folder of [
    join(root, "home", "AppData", "Roaming"),
    join(root, "home", "AppData", "Local"),
    join(root, "tmp"),
    join(root, "evidence"),
  ])
    await mkdir(folder, { recursive: true });
  const fixture = await installFixture(root);
  type ProbeSummary = { ok: boolean };
  type Evidence = {
    launchAtLogin?: ProbeSummary;
    tray?: ProbeSummary;
    restore?: ProbeSummary & { onOk: boolean; offOk: boolean };
    restoreStored?: unknown;
    restoreOnRelaunch?: DynamicRecord;
    restoreOffRelaunch?: DynamicRecord;
    restoreOnOk?: boolean;
    restoreOnAgentMatch?: boolean;
  };
  const evidence: Evidence = {};

  // --- Launch at login (setting only; restore false before exit) ---
  {
    const app = await launchApp(root, fixture);
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    try {
      await reachMain(page);
      await page.evaluate(`(async () => {
        await window.openbot.appSettings.update({ language: "en" });
      })()`);
      const beforeLogin = await app.evaluate(({ app: electronApp }) => electronApp.getLoginItemSettings());
      await page.evaluate(`(async () => {
        await window.openbot.appSettings.update({ behavior: { launchAtLogin: true } });
      })()`);
      const mid = await page.evaluate(
        `(async () => (await window.openbot.appSettings.get()).behavior.launchAtLogin)()`,
      );
      const midLogin = await app.evaluate(({ app: electronApp }) => electronApp.getLoginItemSettings());
      await page.evaluate(`(async () => {
        await window.openbot.appSettings.update({ behavior: { launchAtLogin: false } });
      })()`);
      const after = await page.evaluate(
        `(async () => (await window.openbot.appSettings.get()).behavior.launchAtLogin)()`,
      );
      const afterLogin = await app.evaluate(({ app: electronApp }) => electronApp.getLoginItemSettings());
      const launchAtLogin = {
        settingWentTrue: mid === true,
        settingBackFalse: after === false,
        systemOpenAtLoginBefore: loginFlag(beforeLogin),
        systemOpenAtLoginWhileTrue: loginFlag(midLogin),
        systemOpenAtLoginAfter: loginFlag(afterLogin),
        leftMatchingBefore: loginFlag(afterLogin) === loginFlag(beforeLogin),
        ok: mid === true && after === false,
      };
      evidence.launchAtLogin = launchAtLogin;
      console.log("launchAtLogin", JSON.stringify(launchAtLogin));
    } finally {
      await app.close().catch(() => undefined);
    }
  }

  // --- Tray / keepBackground ---
  {
    const app = await launchApp(root, fixture);
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    try {
      await reachMain(page);
      await page.evaluate(`(async () => {
        await window.openbot.appSettings.update({ language: "en", behavior: { keepBackground: true } });
      })()`);
      await page.waitForTimeout(500);
      const keep = await page.evaluate(
        `(async () => (await window.openbot.appSettings.get()).behavior.keepBackground)()`,
      );
      const beforeVisible = asRecord(
        await app.evaluate(({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows()[0];
          return win ? { visible: win.isVisible(), destroyed: win.isDestroyed() } : null;
        }),
      );
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.close();
      });
      await page.waitForTimeout(800);
      const afterClose = asRecord(
        await app.evaluate(({ BrowserWindow }) => {
          const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
          const win = wins[0];
          return {
            windowCount: wins.length,
            visible: win ? win.isVisible() : false,
            destroyed: win ? win.isDestroyed() : true,
          };
        }),
      );
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
        if (win) {
          win.show();
          win.focus();
        }
      });
      await page.waitForTimeout(500);
      const afterOpen = asRecord(
        await app.evaluate(({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
          return win ? { visible: win.isVisible(), destroyed: win.isDestroyed() } : null;
        }),
      );
      const pagesNav = await page.getByRole("navigation", { name: "Pages" }).count();
      const tray = {
        keepBackground: keep === true,
        beforeVisible,
        afterClose,
        afterOpen,
        pagesNav,
        ok:
          keep === true &&
          asBool(beforeVisible.visible) &&
          isNumber(afterClose.windowCount) &&
          afterClose.windowCount >= 1 &&
          afterClose.visible === false &&
          afterClose.destroyed === false &&
          asBool(afterOpen.visible) &&
          pagesNav > 0,
      };
      evidence.tray = tray;
      console.log("tray", JSON.stringify(tray));
    } finally {
      await page
        .evaluate(`(async () => {
          await window.openbot.appSettings.update({ behavior: { keepBackground: false } });
        })()`)
        .catch(() => undefined);
      await app.close().catch(() => undefined);
    }
  }

  // --- Restore workspace ON then OFF ---
  {
    let app = await launchApp(root, fixture);
    let page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    let agentB = "";
    try {
      await reachMain(page);
      await page.evaluate(`(async () => {
        await window.openbot.appSettings.update({ language: "en" });
      })()`);
      const agents = await seedTwoAgents(page);
      agentB = agents.agentB;
      await page.waitForTimeout(600);
      await openLibraryAgentB(page, agentB);
      evidence.restoreStored = await page.evaluate(`(async () => {
        const s = await window.openbot.appSettings.get();
        return s.workspace;
      })()`);
    } finally {
      await app.close().catch(() => undefined);
    }

    app = await launchApp(root, fixture);
    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    try {
      await reachMain(page);
      await page.waitForTimeout(1500);
      const place = asRecord(
        await page.evaluate(`(async () => {
        const s = await window.openbot.appSettings.get();
        const libraryVisible = Boolean(document.body?.innerText?.match(/Files of the Library|Library sections|Pliki Biblioteki/i));
        const agentBVisible = Boolean(document.body?.innerText?.includes("Probe Agent B"));
        return { workspace: s.workspace, libraryVisible, agentBVisible };
      })()`),
      );
      evidence.restoreOnRelaunch = place;
      const workspace = asRecord(place.workspace);
      const last = asRecord(workspace.last);
      const restoreOnOk = asBool(workspace.restore) && (asStr(last.page) === "library" || asBool(place.libraryVisible));

      await page.evaluate(`(async () => {
        await window.openbot.appSettings.update({
          workspace: { restore: false, last: { page: "agents", botId: null, threadId: null } },
        });
      })()`);
      await page
        .getByRole("button", { name: /^Agents$|^Agenci$/i })
        .click({ timeout: 10_000 })
        .catch(() => undefined);
      await page.waitForTimeout(700);
      evidence.restoreOnOk = restoreOnOk;
      evidence.restoreOnAgentMatch = asStr(last.botId) === agentB || asBool(place.agentBVisible);
    } finally {
      await app.close().catch(() => undefined);
    }

    app = await launchApp(root, fixture);
    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    try {
      await reachMain(page);
      await page.waitForTimeout(1500);
      const placeOff = asRecord(
        await page.evaluate(`(async () => {
        const s = await window.openbot.appSettings.get();
        const libraryVisible = Boolean(document.body?.innerText?.match(/Files of the Library|Library sections|Pliki Biblioteki/i));
        return { workspace: s.workspace, libraryVisible };
      })()`),
      );
      evidence.restoreOffRelaunch = placeOff;
      const offWorkspace = asRecord(placeOff.workspace);
      const restoreOffOk = offWorkspace.restore === false && placeOff.libraryVisible !== true;
      const onPlace = asRecord(evidence.restoreOnRelaunch);
      const onLast = asRecord(asRecord(onPlace.workspace).last);
      const restore = {
        onOk: asStr(onLast.page) === "library",
        offOk: restoreOffOk,
        ok: asStr(onLast.page) === "library" && restoreOffOk,
      };
      evidence.restore = restore;
      console.log("restore", JSON.stringify({ ...restore, on: evidence.restoreOnRelaunch, off: placeOff }));
    } finally {
      await app.close().catch(() => undefined);
    }
  }

  const launch = asRecord(evidence.launchAtLogin);
  const tray = asRecord(evidence.tray);
  const restore = asRecord(evidence.restore);
  const summary = {
    launchAtLogin: evidence.launchAtLogin,
    tray: evidence.tray,
    restore: evidence.restore,
    ok: asBool(launch.ok) && asBool(tray.ok) && asBool(restore.ok),
  };
  await writeFile(join(root, "evidence", "behavior-probe.json"), JSON.stringify({ summary, evidence }, null, 2));
  console.log(JSON.stringify(summary));
  assert(summary.ok, `behavior probe failed: ${JSON.stringify(summary)}`);
}

await main();
