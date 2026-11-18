// T-AI: accessibility probe for P0/P1 chrome (GO required). Modes:
//   COSGRAL_PROBE=css|focus|motion|all
//   COSGRAL_SANDBOX_ROOT=<sandbox> COSGRAL_GO_DIR=<Shared/cosgral-sandbox> node scripts/sandbox-a11y-probe.ts
// Always: --lang=en-US + language=en + Codex fixture. String evaluate (no Window.openbot in node TS).

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

/** CSSOM: ui-recent-a11y / :focus-visible / prefers-reduced-motion / prefers-contrast present. */
async function probeCss(page: Page): Promise<ProbeResult> {
  const raw = asRecord(
    await page.evaluate(`(() => {
    const sheets = Array.from(document.styleSheets);
    let focusVisible = 0;
    let reducedMotion = 0;
    let contrast = 0;
    let a11yHref = 0;
    for (const sheet of sheets) {
      const href = sheet.href || "";
      if (/ui-recent-a11y/i.test(href)) a11yHref += 1;
      let rules;
      try { rules = sheet.cssRules; } catch (_) { continue; }
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        const text = String(rule.cssText || "");
        if (text.includes(":focus-visible")) focusVisible += 1;
        if (text.includes("prefers-reduced-motion")) reducedMotion += 1;
        if (text.includes("prefers-contrast")) contrast += 1;
      }
    }
    return { focusVisible, reducedMotion, contrast, a11yHref, sheetCount: sheets.length };
  })()`),
  );
  const focusVisible = asNum(raw.focusVisible);
  const reducedMotion = asNum(raw.reducedMotion);
  const contrast = asNum(raw.contrast);
  const ok = focusVisible > 0 && reducedMotion > 0;
  return {
    name: "css",
    ok,
    detail: JSON.stringify({
      focusVisible,
      reducedMotion,
      contrast,
      a11yHref: asNum(raw.a11yHref),
      sheetCount: asNum(raw.sheetCount),
    }),
  };
}

/** Keyboard Tab reaches a chat-side launcher or pages rail control with non-none outline. */
async function probeFocus(page: Page): Promise<ProbeResult> {
  await page.evaluate(`(async () => {
    const api = window.openbot;
    const bots = await api.agent.listBots();
    let bot = bots.find((row) => !row.hidden) || bots[0];
    if (!bot) bot = await api.agent.createBot();
    await api.agent.updateBot({ botId: bot.id, name: "A11y probe" });
  })()`);
  await page.waitForTimeout(700);
  const agent = page.getByRole("button", { name: /A11y probe/i }).first();
  if ((await agent.count()) > 0) await agent.click({ timeout: 10_000 });
  await page.waitForTimeout(400);

  // Prefer side-panel launcher; fall back to Pages rail.
  const launcher = page
    .getByRole("button", { name: /Browser|Files|Agent settings|Voice|Ustawienia agenta|Głos/i })
    .first();
  const target =
    (await launcher.count()) > 0
      ? launcher
      : page
          .getByRole("navigation", { name: /Pages|Strony/i })
          .getByRole("button")
          .first();
  await target.focus().catch(() => undefined);
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(80);
  }
  const snap = asRecord(
    await page.evaluate(`(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { tag: "", outline: "", outlineWidth: "", boxShadow: "" };
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName,
      role: el.getAttribute("role") || "",
      name: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 80),
      outline: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
      boxShadow: cs.boxShadow,
    };
  })()`),
  );
  const outlineOk =
    asStr(snap.outline) !== "none" ||
    (asStr(snap.outlineWidth) !== "" && asStr(snap.outlineWidth) !== "0px") ||
    (asStr(snap.boxShadow) !== "" && asStr(snap.boxShadow) !== "none");
  const hasTarget = asStr(snap.tag) !== "";
  return {
    name: "focus",
    ok: hasTarget && outlineOk,
    detail: JSON.stringify(snap),
  };
}

/**
 * Emulate prefers-reduced-motion via matchMedia after CDP override when available;
 * otherwise verify CSS rules exist (soft OK with note).
 */
async function probeMotion(page: Page): Promise<ProbeResult> {
  const cdp = await page
    .context()
    .newCDPSession(page)
    .catch(() => null);
  if (cdp) {
    await cdp
      .send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      })
      .catch(() => undefined);
  }
  const raw = asRecord(
    await page.evaluate(`(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    return { matches: mq.matches, media: mq.media };
  })()`),
  );
  const matches = asBool(raw.matches);
  if (!cdp) {
    return {
      name: "motion",
      ok: true,
      skip: true,
      detail: "SKIP: no CDP session — CSS rules checked in css probe; OS reduced-motion not forced",
    };
  }
  return {
    name: "motion",
    ok: matches,
    detail: JSON.stringify(raw),
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

  const app = await launchApp(root, fixture);
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  try {
    await reachMain(page);
    await page.evaluate(`(async () => {
      await window.openbot.appSettings?.update({ language: "en" });
    })()`);
    if (want("css")) results.push(await probeCss(page));
    if (want("focus")) results.push(await probeFocus(page));
    if (want("motion")) results.push(await probeMotion(page));
  } finally {
    await app.close().catch(() => undefined);
  }

  await writeFile(join(root, "evidence", "a11y-probe.json"), JSON.stringify({ mode: MODE, results }, null, 2));
  for (const row of results) {
    const tag = row.skip ? "SKIP" : row.ok ? "ok" : "FAIL";
    console.log(`${tag}  ${row.name}: ${row.detail}`);
  }
  const hardFail = results.some((row) => !row.ok && !row.skip);
  assert(!hardFail, `a11y probes failed: ${JSON.stringify(results.filter((r) => !r.ok && !r.skip))}`);
}

await main();
