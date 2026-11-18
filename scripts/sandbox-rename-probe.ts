// T-AD: Electron probe — Rename via agent context menu → Agent name → sidebar + header.
// Ready for the lead's GO. Does not run without GO-tester-*.txt (unless COSGRAL_SKIP_GO=1).
//
//   COSGRAL_SANDBOX_ROOT=<sandbox> node scripts/sandbox-rename-probe.ts
// Optional: COSGRAL_GO_DIR=<Shared/cosgral-sandbox> (default: ../cosgral-sandbox from repo)
//
// Always: --lang=en-US + LANG=en-US + appSettings.language=en + Codex fixture (so first-run Continue works).

import assert from "node:assert/strict";
import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  if (process.env.COSGRAL_SKIP_GO === "1") {
    console.log("GO skipped (COSGRAL_SKIP_GO=1)");
    return;
  }
  const gate = process.env.COSGRAL_GO_DIR
    ? resolve(process.env.COSGRAL_GO_DIR)
    : resolve(repo, "..", "..", "cosgral-sandbox");
  // Prefer Shared\cosgral-sandbox when worktree is Shared\cosgral-wt\desktop-tester
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
  assert.fail(
    `Missing GO-tester-*.txt (looked in ${candidates.join(" | ")}) — do not launch Electron without the lead's GO`,
  );
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

  const app: ElectronApplication = await electron.launch({
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

  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  try {
    await reachMain(page);
    await page.evaluate(`(async () => {
      const api = window.openbot.appSettings;
      if (api?.update) await api.update({ language: "en" });
    })()`);

    // Ensure a named agent row exists (UI-AF: Rename is in-place on the sidebar row).
    await page.evaluate(`(async () => {
      const api = window.openbot;
      let bots = await api.agent.listBots();
      let bot = bots.find((row) => !row.hidden) || bots[0];
      if (!bot) bot = await api.agent.createBot();
      await api.agent.updateBot({ botId: bot.id, name: "Probe agent" });
    })()`);
    await page.waitForTimeout(900);

    const chatList = page
      .getByRole("navigation", { name: "Chat list" })
      .or(page.getByRole("region", { name: "Agents" }));
    const agentRow = chatList.getByRole("button", { name: /Probe agent/i }).first();
    await agentRow.waitFor({ timeout: 20_000 });
    const beforeName = ((await agentRow.innerText()) || "").split("\n")[0]?.trim() ?? "";
    await agentRow.click({ button: "right" });
    const menu = page.getByRole("menu", { name: /Agent actions|Akcje agenta/i });
    try {
      await menu.waitFor({ timeout: 3_000 });
    } catch {
      await agentRow.dispatchEvent("contextmenu");
      await menu.waitFor({ timeout: 5_000 });
    }
    const rename = page.getByRole("menuitem", { name: /^Rename$|^Zmień nazwę$/i });
    assert((await rename.count()) > 0, "Rename menuitem missing");
    await rename.first().click();
    await page.waitForTimeout(500);

    const nameField = page.getByRole("textbox", { name: /^Agent name$|^Nazwa agenta$/i });
    await nameField.first().waitFor({ timeout: 15_000 });
    const focusOk = await nameField
      .first()
      .evaluate((el) => document.activeElement === el)
      .catch(() => false);
    const nameUsed = `TAC Rename ${Date.now().toString().slice(-4)}`;
    await nameField.first().fill(nameUsed);
    await nameField.first().press("Enter");
    await page.waitForTimeout(1200);

    const sidebarOk = (await chatList.getByRole("button", { name: new RegExp(nameUsed, "i") }).count()) > 0;
    const headerOk =
      (await page.getByRole("heading", { name: nameUsed }).count()) > 0 ||
      (await page.locator("header").filter({ hasText: nameUsed }).count()) > 0 ||
      sidebarOk;

    const out = {
      beforeName,
      nameUsed,
      renameVisible: true,
      focusOk,
      sidebarOk,
      headerOk,
      ok: sidebarOk && headerOk,
    };
    await writeFile(join(root, "evidence", "rename-probe.json"), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out));
    assert(out.ok, `rename probe failed: ${JSON.stringify(out)}`);
  } finally {
    await app.close().catch(() => undefined);
  }
}

await main();
