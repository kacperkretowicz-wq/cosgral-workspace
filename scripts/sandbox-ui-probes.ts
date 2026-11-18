// T-AJ: Electron probes — sendShortcut, unreadFirst, Tasks board columns (GO required).
//   COSGRAL_PROBE=send-shortcut|unread-first|tasks-board|all
//   COSGRAL_SANDBOX_ROOT=<sandbox> COSGRAL_GO_DIR=<Shared/cosgral-sandbox> node scripts/sandbox-ui-probes.ts

import assert from "node:assert/strict";
import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type DynamicRecord, isBoolean, isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
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

type ProbeResult = { name: string; ok: boolean; detail: string; skip?: boolean };

function asRecord(value: unknown): DynamicRecord {
  return isDynamicRecord(value) ? value : {};
}

function asStr(value: unknown): string {
  return isString(value) ? value : "";
}

function asBool(value: unknown): boolean {
  return isBoolean(value) && value;
}

async function probeSendShortcut(page: Page): Promise<ProbeResult> {
  const result = asRecord(
    await page.evaluate(`(async () => {
    const api = window.openbot;
    await api.appSettings.update({ appearance: { sendShortcut: "enter" } });
    await new Promise((r) => setTimeout(r, 200));
    const enter = document.documentElement.dataset.sendShortcut;
    await api.appSettings.update({ appearance: { sendShortcut: "mod-enter" } });
    await new Promise((r) => setTimeout(r, 200));
    const mod = document.documentElement.dataset.sendShortcut;
    const saved = (await api.appSettings.get())?.appearance?.sendShortcut;
    await api.appSettings.update({ appearance: { sendShortcut: "enter" } });
    return { enter, mod, saved };
  })()`),
  );
  const ok =
    asStr(result.enter) === "enter" && asStr(result.mod) === "mod-enter" && asStr(result.saved) === "mod-enter";
  return { name: "send-shortcut", ok, detail: JSON.stringify(result) };
}

async function probeUnreadFirst(page: Page): Promise<ProbeResult> {
  const result = asRecord(
    await page.evaluate(`(async () => {
    const api = window.openbot;
    const bots = await api.agent.listBots();
    let a = bots.find((row) => !row.hidden) || bots[0];
    if (!a) a = await api.agent.createBot();
    let b = bots.find((row) => row.id !== a.id && !row.hidden);
    if (!b) {
      b = await api.agent.createBot();
      await api.agent.updateBot({ botId: b.id, name: "Unread Probe B" });
    }
    await api.agent.updateBot({ botId: a.id, name: "Unread Probe A" });
    await api.appSettings.update({ appearance: { unreadFirst: false } });
    await new Promise((r) => setTimeout(r, 200));
    const off = document.documentElement.dataset.unreadFirst;
    await api.appSettings.update({ appearance: { unreadFirst: true } });
    await new Promise((r) => setTimeout(r, 200));
    const on = document.documentElement.dataset.unreadFirst;
    const saved = (await api.appSettings.get())?.appearance?.unreadFirst;
    return { off, on, saved, botA: a.id, botB: b.id };
  })()`),
  );
  const ok = asStr(result.off) === "false" && asStr(result.on) === "true" && asBool(result.saved) === true;
  return { name: "unread-first", ok, detail: JSON.stringify(result) };
}

async function probeTasksBoard(page: Page): Promise<ProbeResult> {
  const nav = page.getByRole("navigation", { name: "Pages" }).or(page.getByRole("navigation", { name: "Strony" }));
  const tasksBtn = nav.getByRole("button", { name: /^(Tasks|Zadania)$/i });
  if (await tasksBtn.count()) await tasksBtn.click({ timeout: 10_000 });
  else {
    // PageRail overflow: accessible name is "More" (was "More pages").
    const more = nav.getByRole("button", { name: /^(More|More pages|Więcej|Więcej stron)$/i });
    if (await more.count()) {
      await more.first().click();
      await page.waitForTimeout(300);
      await page.getByRole("menuitem", { name: /^(Tasks|Zadania)$/i }).click({ timeout: 8_000 });
    }
  }
  await page.waitForTimeout(900);
  // Headings include the count span ("Failed 0"), so match the start only.
  const failed = await page.getByRole("heading", { name: /^(Failed|Nie udało)/i }).count();
  const stopped = await page.getByRole("heading", { name: /^(Stopped|Zatrzymane)/i }).count();
  const needs = await page.getByRole("heading", { name: /^(Needs you|Potrzebuje Cię)/i }).count();
  const working = await page.getByRole("heading", { name: /^(Working|W toku)/i }).count();
  const paused = await page.getByRole("heading", { name: /^(Paused|Wstrzymane)/i }).count();
  const cols = await page.locator("section.tasks-board-column").count();
  const ok = failed > 0 && stopped > 0 && needs > 0 && cols >= 5;
  return {
    name: "tasks-board",
    ok,
    detail: JSON.stringify({ failed, stopped, needs, working, paused, cols }),
  };
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
  const results: ProbeResult[] = [];
  const want = (name: string) => MODE === "all" || MODE === name;

  const app = await launchApp(root, fixture);
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  try {
    await reachMain(page);
    await page.evaluate(`(async () => {
      await window.openbot.appSettings?.update({ language: "en" });
    })()`);
    const run = async (name: string, fn: () => Promise<ProbeResult>) => {
      if (!want(name)) return;
      try {
        results.push(await fn());
      } catch (error) {
        results.push({ name, ok: false, detail: `throw: ${String(error)}` });
      }
    };
    await run("send-shortcut", () => probeSendShortcut(page));
    await run("unread-first", () => probeUnreadFirst(page));
    await run("tasks-board", () => probeTasksBoard(page));
  } finally {
    await app.close().catch(() => undefined);
  }

  await writeFile(join(root, "evidence", "ui-probes.json"), JSON.stringify({ mode: MODE, results }, null, 2));
  for (const row of results) {
    const tag = row.skip ? "SKIP" : row.ok ? "ok" : "FAIL";
    console.log(`${tag}  ${row.name}: ${row.detail}`);
  }
  const hardFail = results.some((row) => !row.ok && !row.skip);
  assert(!hardFail, `ui probes failed: ${JSON.stringify(results.filter((r) => !r.ok && !r.skip))}`);
}

await main();
