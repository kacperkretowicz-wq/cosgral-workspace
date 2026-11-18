// T-U / T-O: screenshot states for COSGRAL (real Electron, sandbox only).
//   COSGRAL_SANDBOX_ROOT=<sandbox> COSGRAL_SHOTS_OUT=<Shared/cosgral-docs/zrzuty-cosgral-17-11-e> node scripts/sandbox-shots-w12.ts
// Writes 1440x900 PNGs outside the repo. No commit. `bun run build` first.
// States: dark+light; New agent; chat+stub; menu +/@//; search; Tasks (steps/Open as chat); Usage (By model);
// Schedule; message menu; agent cards; server settings; Marketplace (Agents/Skills); Library files + Vault connectors.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { type DynamicRecord, isDynamicRecord } from "@openbot/contracts/runtime-values";
import { type ElectronApplication, _electron as electron, type Locator, type Page } from "playwright";
import { cleanEnvironment } from "./sandbox-env.ts";
import { seedShotsData, seedUsageHistory } from "./sandbox-seed.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const notes: string[] = [];
const findings: string[] = [];

/** Soft text checklist for a shot note (does not throw — MISS goes into the note for the vs-071 report). */
async function visibleChecklist(checks: Array<{ id: string; find: () => Locator }>): Promise<string> {
  const parts: string[] = [];
  for (const check of checks) {
    try {
      const n = await check.find().count();
      parts.push(n > 0 ? `OK:${check.id}` : `MISS:${check.id}`);
    } catch {
      parts.push(`MISS:${check.id}`);
    }
  }
  return parts.join(" ");
}

function sandboxRoot(): string {
  const root = process.env.COSGRAL_SANDBOX_ROOT ? resolve(process.env.COSGRAL_SANDBOX_ROOT) : "";
  assert(root, "COSGRAL_SANDBOX_ROOT must point to a sandbox folder");
  assert(!resolve(repo).startsWith(root + sep) && root !== resolve(repo), "sandbox must not contain the repo");
  return root;
}

function shotsOut(): string {
  const out = process.env.COSGRAL_SHOTS_OUT ? resolve(process.env.COSGRAL_SHOTS_OUT) : "";
  assert(out, "COSGRAL_SHOTS_OUT must point to the output folder (outside the repo)");
  assert(!out.startsWith(resolve(repo) + sep), "shots must stay outside the repository");
  return out;
}

async function requireGo(): Promise<void> {
  // T-U: after e2e+W5 the GO file is deleted (end of quiet window for others).
  // Tester keeps taking shots; set COSGRAL_SKIP_GO=1 for that continuous queue.
  if (process.env.COSGRAL_SKIP_GO === "1") {
    console.log("GO skipped (COSGRAL_SKIP_GO=1 — post quiet-window shots)");
    return;
  }
  const gate = process.env.COSGRAL_GO_DIR
    ? resolve(process.env.COSGRAL_GO_DIR)
    : resolve(repo, "..", "cosgral-sandbox");
  const empty: string[] = [];
  const names = await readdir(gate).catch(() => empty);
  const go = names.find((name) => /^GO-tester-.*\.txt$/i.test(name));
  assert(go, `Missing GO-tester-*.txt in ${gate} — do not launch Electron without the lead's GO`);
  console.log(`GO ok: ${join(gate, go)}`);
}

async function mainShellPage(app: ElectronApplication, fallback: Page): Promise<Page> {
  const windows = app.windows().filter((w) => !w.isClosed());
  if (!windows.length) throw new Error("all windows closed");
  // Prefer the main shell (Pages rail). Stub turns / dock can open a second window without the rail.
  for (const w of [...windows].reverse()) {
    try {
      const hasRail = await w.evaluate(
        `Boolean(document.querySelector('[role="navigation"][aria-label="Pages"], [role="navigation"][aria-label="Strony"]'))`,
      );
      if (hasRail) {
        if (w !== fallback) {
          try {
            await w.bringToFront();
          } catch {
            /* ignore */
          }
        }
        return w;
      }
    } catch {
      /* next */
    }
  }
  for (const w of windows) {
    try {
      await w.waitForSelector('[role="navigation"][aria-label="Pages"], [role="navigation"][aria-label="Strony"]', {
        timeout: 3_000,
      });
      return w;
    } catch {
      /* next */
    }
  }
  if (!fallback.isClosed()) return fallback;
  const first = windows[0];
  if (!first) throw new Error("all windows closed");
  return first;
}

type OverlayState = { hit: boolean; searchOpen: boolean };

async function dismissOverlays(page: Page): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    const state: OverlayState = await page.evaluate(() => {
      const searchOpen = Boolean(
        document.querySelector('[role="dialog"]') &&
          /Search COSGRAL|Szukaj|All.*Agents.*Channels/i.test(document.body?.innerText || ""),
      );
      let hit = searchOpen;
      const dialogs = [...document.querySelectorAll('[role="dialog"], .join-server-dialog, dialog')];
      for (const dialog of dialogs) {
        const text = `${dialog.textContent || ""} ${dialog.getAttribute("aria-label") || ""}`;
        if (/Join a COSGRAL team|Invitation link|Dołącz/i.test(text)) {
          hit = true;
          const cancel = [...dialog.querySelectorAll("button")].find((b) =>
            /Cancel|Anuluj|Close|Zamknij|^×$|^x$/i.test(b.textContent || b.getAttribute("aria-label") || ""),
          );
          if (cancel) cancel.click();
        }
      }
      return { hit, searchOpen };
    });
    // GlobalSearch toggles on Ctrl+K — Escape alone often leaves it open.
    if (state.searchOpen) {
      await page.keyboard.press("Control+k").catch(() => undefined);
      await page.waitForTimeout(250);
    }
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.waitForTimeout(200);
    if (!state.hit && i >= 2) break;
  }
}

/** os.userInfo() ignores USERNAME env — scrub footer before every PNG. */
async function scrubPrivacy(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    for (const el of document.querySelectorAll(".sidebar-footer .profile-copy strong, .account-profile-copy strong")) {
      el.textContent = "Demo";
    }
    for (const el of document.querySelectorAll(".sidebar-footer .profile-dot, .account-profile-avatar, .profile-dot")) {
      if (el && el.childElementCount === 0) el.textContent = "D";
      for (const child of el.querySelectorAll("*")) {
        if ((child.textContent || "").trim().length <= 3 && /[A-Z]{1,3}/.test(child.textContent || "")) child.textContent = "D";
      }
    }
  })()`);
}

async function shot(page: Page, out: string, name: string, note: string): Promise<void> {
  await dismissOverlays(page);
  await scrubPrivacy(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, `${name}.png`) });
  notes.push(`${name}|${note}`);
  console.log(`shot ${name}: ${note}`);
}

async function tryShot(
  app: ElectronApplication,
  pageRef: { page: Page; main?: Page | null },
  out: string,
  name: string,
  work: (page: Page) => Promise<string>,
): Promise<void> {
  try {
    if (pageRef.main && !pageRef.main.isClosed()) pageRef.page = pageRef.main;
    else pageRef.page = await mainShellPage(app, pageRef.page);
    await dismissOverlays(pageRef.page);
    const note = await work(pageRef.page);
    if (pageRef.main && !pageRef.main.isClosed()) pageRef.page = pageRef.main;
    await shot(pageRef.page, out, name, note);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    notes.push(`${name}|FAIL: ${detail.split("\n")[0]}`);
    console.log(`FAIL ${name}: ${detail.split("\n")[0]}`);
    try {
      if (pageRef.main && !pageRef.main.isClosed()) pageRef.page = pageRef.main;
      else pageRef.page = await mainShellPage(app, pageRef.page);
      await dismissOverlays(pageRef.page);
      await pageRef.page.screenshot({ path: join(out, `${name}-fail.png`) });
    } catch {
      /* ignore */
    }
  }
}

/** Confirm onboarding model so composer (+ / @ / /) is enabled. */
async function unlockComposer(page: Page): Promise<void> {
  await dismissOverlays(page);
  const attach = page.getByRole("button", { name: "Attach a file" });
  if ((await attach.count()) && (await attach.first().isEnabled())) return;
  // aria-label like "Onboarding model: Luna" — open and re-select to confirm.
  const picker = page.getByRole("button", { name: /Onboarding model/i });
  if (await picker.count()) {
    await picker.first().click({ timeout: 8_000 });
    await page.waitForTimeout(400);
    const option = page
      .getByRole("option", { name: /Luna|Codex|gpt|Claude/i })
      .or(page.getByRole("menuitem", { name: /Luna|Codex|gpt|Claude/i }));
    if (await option.count()) await option.first().click();
    else await page.keyboard.press("Enter");
    await page.waitForTimeout(600);
  }
  if ((await attach.count()) && (await attach.first().isEnabled())) return;
  // Force-enable path: click any visible model option row labeled Luna inside onboarding.
  const luna = page.getByText(/^Luna$/).first();
  if (await luna.count()) await luna.click().catch(() => undefined);
  await page.waitForTimeout(400);
}

async function clickRail(page: Page, labels: string[]): Promise<void> {
  await dismissOverlays(page);
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(200);
  const nav = page.getByRole("navigation", { name: "Pages" }).or(page.getByRole("navigation", { name: "Strony" }));
  await nav
    .first()
    .waitFor({ state: "attached", timeout: 10_000 })
    .catch(() => undefined);
  const byRole = nav.getByRole("button", { name: new RegExp(`^(${labels.join("|")})$`, "i") });
  if (await byRole.count()) {
    await byRole.first().click({ timeout: 10_000 });
    await page.waitForTimeout(600);
    return;
  }
  const more = nav.getByRole("button", { name: /More pages|Więcej stron/i });
  if (await more.count()) {
    await more.first().click();
    await page.waitForTimeout(300);
    const item = page.getByRole("menuitem", { name: new RegExp(`^(${labels.join("|")})$`, "i") });
    if (await item.count()) {
      await item.first().click();
      await page.waitForTimeout(600);
      return;
    }
  }
  const hit = await page.evaluate(`((labels) => {
    const navEl = document.querySelector('[role="navigation"][aria-label="Pages"], [role="navigation"][aria-label="Strony"]');
    if (!navEl) return "no-nav title=" + document.title + " body=" + (document.body?.innerText || "").slice(0, 80);
    const buttons = [...navEl.querySelectorAll("button")];
    const match = buttons.find((b) => labels.some((l) => (b.getAttribute("aria-label") || "").trim() === l));
    if (match) { match.click(); return "ok"; }
    return "missing:" + buttons.map((b) => b.getAttribute("aria-label")).filter(Boolean).join(",");
  })(${JSON.stringify(labels)})`);
  if (hit !== "ok") throw new Error(`rail button missing (${String(hit)}): ${labels.join("|")}`);
  await page.waitForTimeout(600);
}

async function reachMain(page: Page): Promise<string[]> {
  const seen: string[] = [];
  // Fixture CLI is Electron-as-Node: first `codex --version` can take 40–90s while status stays Checking/Brak.
  for (let round = 0; round < 180; round += 1) {
    if (page.isClosed()) throw new Error(`page closed during first-run (saw: ${seen.join(", ")})`);
    const pages = page.getByRole("navigation", { name: "Pages" }).or(page.getByRole("navigation", { name: "Strony" }));
    if (await pages.count()) return seen;
    const useLocal = page.getByRole("button", { name: /Use this computer|Użyj tego komputera/i });
    const continueCodex = page.getByRole("button", {
      name: /Continue with Codex|Finish setup|Kontynuuj z Codex|Zakończ konfigurację/i,
    });
    const checkBtn = page.getByRole("button", { name: /^(Check|Sprawdź)$/i });
    if ((await useLocal.count()) && (await useLocal.first().isEnabled())) {
      seen.push("where");
      await useLocal.first().click({ timeout: 10_000 });
      await page.waitForTimeout(1200);
      continue;
    }
    if ((await continueCodex.count()) && (await continueCodex.first().isEnabled())) {
      seen.push("local");
      await continueCodex.first().click({ timeout: 30_000 });
      await page.waitForTimeout(1200);
      continue;
    }
    // Nudge a stuck "Checking" probe every ~8s (same as clicking Sprawdź on the setup card).
    if (round > 0 && round % 16 === 0 && (await checkBtn.count()) && (await checkBtn.first().isEnabled())) {
      seen.push("check");
      await checkBtn
        .first()
        .click({ timeout: 5_000 })
        .catch(() => undefined);
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`main window missing (saw: ${seen.join(", ")})`);
}

async function setTheme(page: Page, theme: "dark" | "light"): Promise<void> {
  await page.evaluate(`(async () => {
    const api = window.openbot.appSettings;
    if (!api?.update) throw new Error("no appSettings.update");
    await api.update({ theme: ${JSON.stringify(theme)} });
  })()`);
  await page.waitForTimeout(700);
}

async function setLanguage(page: Page, language: "en" | "pl"): Promise<void> {
  await page.evaluate(`(async () => {
    const api = window.openbot.appSettings;
    if (!api?.update) throw new Error("no appSettings.update");
    await api.update({ language: ${JSON.stringify(language)} });
  })()`);
  await page.waitForTimeout(900);
}

/** App Settings gear on the Pages rail — exact name so "Server settings" is never hit (KK). */
async function openAppSettings(page: Page): Promise<void> {
  await dismissOverlays(page);
  const gear = page
    .getByRole("navigation", { name: /Pages|Strony/i })
    .getByRole("button", { name: "Settings", exact: true })
    .or(
      page.getByRole("navigation", { name: /Pages|Strony/i }).getByRole("button", { name: "Ustawienia", exact: true }),
    );
  if (await gear.count()) {
    await gear.first().click({ timeout: 8_000 });
  } else {
    const fallback = page
      .getByRole("button", { name: "Settings", exact: true })
      .or(page.getByRole("button", { name: "Ustawienia", exact: true }));
    if (await fallback.count()) await fallback.first().click({ timeout: 8_000 });
  }
  await page
    .getByRole("dialog")
    .waitFor({ timeout: 8_000 })
    .catch(() => undefined);
  await page.waitForTimeout(400);
}

async function openNewAgentForm(
  page: Page,
): Promise<"formularz Nowy agent już na starcie" | "formularz Nowy agent widoczny"> {
  await dismissOverlays(page);
  // Empty program (UI-F) already starts on New agent — after seed, open Create new → New agent (menuitem).
  const form = page.locator(".new-agent-page").or(page.getByRole("main", { name: /New agent|Nowy agent/i }));
  const heading = page.getByRole("heading", { name: /New agent|Nowy agent/i });
  if ((await form.count()) || (await heading.count())) return "formularz Nowy agent już na starcie";
  const createNew = page.getByRole("button", { name: /^Create new$|^Utwórz now/i });
  if (await createNew.count()) {
    await createNew.first().click({ timeout: 8_000 });
    await page.waitForTimeout(300);
    const item = page.getByRole("menuitem", { name: /^New agent$|^Nowy agent$/i });
    if (await item.count()) await item.first().click({ timeout: 8_000 });
    await page.waitForTimeout(600);
  } else {
    const create = page.getByRole("button", {
      name: /^New agent$|^Nowy agent$|Create new agent|Utwórz nowego agenta/i,
    });
    if (await create.count()) {
      await create.first().click({ timeout: 8_000 });
      await page.waitForTimeout(600);
    }
  }
  await dismissOverlays(page);
  if ((await form.count()) || (await heading.count())) return "formularz Nowy agent widoczny";
  throw new Error("New agent form not visible");
}

async function ensureChatAgent(page: Page): Promise<string> {
  await dismissOverlays(page);
  // Leave the create form if Cancel is available (empty name = form still open).
  const cancel = page.getByRole("button", { name: /^Cancel$|^Anuluj$/i });
  if (await cancel.count())
    await cancel
      .first()
      .click()
      .catch(() => undefined);
  await page.waitForTimeout(300);
  const viaApi = await page.evaluate(`(async () => {
    const bots = await window.openbot.agent.listBots();
    let bot = bots.find((b) => b.name === "Shot agent") ?? bots[0];
    if (!bot) {
      bot = await window.openbot.agent.createBot();
      await window.openbot.agent.updateBot({ botId: bot.id, name: "Shot agent" });
    } else if (bot.name !== "Shot agent") {
      await window.openbot.agent.updateBot({ botId: bot.id, name: "Shot agent" });
    }
    const models = (await window.openbot.agent.listModels?.()) ?? [];
    const model = models[0]?.id ?? bot.model;
    if (model) await window.openbot.agent.updateBot({ botId: bot.id, model });
    return "Shot agent";
  })()`);
  await page.waitForTimeout(800);
  const agents = page
    .getByRole("navigation", { name: "Pages" })
    .or(page.getByRole("navigation", { name: "Strony" }))
    .getByRole("button", { name: /^(Agents|Agenci)$/i });
  if (await agents.count()) await agents.click();
  await page.waitForTimeout(400);
  await dismissOverlays(page);
  const row = page.getByRole("button", { name: /Shot agent/i }).first();
  if (await row.count()) await row.click({ timeout: 8_000 }).catch(() => undefined);
  else {
    const any = page.getByText(/Shot agent/i).first();
    if (await any.count()) await any.click({ timeout: 8_000 }).catch(() => undefined);
  }
  await page.waitForTimeout(700);
  await dismissOverlays(page);
  return String(viaApi);
}

async function sendStubChat(page: Page): Promise<void> {
  await dismissOverlays(page);
  // Prefer IPC send so Join dialog / form focus cannot block the turn.
  // String evaluate + Reflect.get: Window has no typed `openbot` in Node typecheck.
  const raw = await page.evaluate(`(async () => {
    const api = Reflect.get(window, "openbot");
    if (!api?.agent) return { ok: false, reason: "no openbot.agent" };
    const bots = await api.agent.listBots();
    const bot = bots.find((b) => b.name === "Shot agent") ?? bots[0];
    if (!bot) return { ok: false, reason: "no bot" };
    const models = (await api.agent.listModels?.()) ?? [];
    const model = models[0]?.id ?? bot.model;
    if (model) await api.agent.updateBot({ botId: bot.id, model });
    await api.agent.sendMessage({ botId: bot.id, text: "Hello from T-G shots — please reason" });
    return { ok: true };
  })()`);
  const sent: DynamicRecord = isDynamicRecord(raw) ? raw : {};
  if (sent.ok !== true) throw new Error(`sendMessage failed: ${JSON.stringify(sent)}`);
  await page
    .getByText(/Stub: received|Hello from T-G shots/i)
    .first()
    .waitFor({ timeout: 45_000 });
  await page.waitForTimeout(1000);
  await dismissOverlays(page);
}

async function hashPngs(out: string): Promise<{ path: string; sha: string }[]> {
  const files = (await readdir(out)).filter((name) => name.endsWith(".png") && !name.includes("-fail"));
  const rows: { path: string; sha: string }[] = [];
  for (const name of files) {
    const bytes = await readFile(join(out, name));
    rows.push({ path: name, sha: createHash("sha256").update(bytes).digest("hex") });
  }
  return rows;
}

function duplicateReport(rows: { path: string; sha: string }[]): string[] {
  const bySha = new Map<string, string[]>();
  for (const row of rows) {
    const list = bySha.get(row.sha) ?? [];
    list.push(row.path);
    bySha.set(row.sha, list);
  }
  const dups: string[] = [];
  for (const [sha, paths] of bySha) {
    if (paths.length > 1) dups.push(`${sha.slice(0, 12)} → ${paths.join(", ")}`);
  }
  return dups;
}

async function main(): Promise<void> {
  await requireGo();
  const root = sandboxRoot();
  const out = shotsOut();
  const keep = process.argv.includes("--keep");
  if (!keep) await rm(root, { recursive: true, force: true });
  for (const folder of [
    join(root, "home", "AppData", "Roaming"),
    join(root, "home", "AppData", "Local"),
    join(root, "tmp"),
    out,
  ])
    await mkdir(folder, { recursive: true });

  const folder = join(root, "fixture");
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "codex.cjs"), await readFile(join(repo, "src/backend/testing/channel-codex.cjs")));
  const electronExe = join(repo, "node_modules", "electron", "dist", "electron.exe");
  const codex = join(folder, "codex.cmd");
  await writeFile(codex, `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${electronExe}" "%~dp0codex.cjs" %*\r\n`);

  const mainOut: string[] = [];
  const app: ElectronApplication = await electron.launch({
    executablePath: electronExe,
    // Match e2e/acceptance: force EN so first-run labels stay stable on Polish Windows.
    args: ["--lang=en-US", repo],
    cwd: repo,
    env: {
      ...cleanEnvironment(),
      USERPROFILE: join(root, "home"),
      HOME: join(root, "home"),
      APPDATA: join(root, "home", "AppData", "Roaming"),
      LOCALAPPDATA: join(root, "home", "AppData", "Local"),
      TEMP: join(root, "tmp"),
      TMP: join(root, "tmp"),
      OPENBOT_CODEX_PATH: codex,
      OPENBOT_CLAUDE_PATH: join(folder, "missing-claude.exe"),
      LANG: "en-US",
      // Leader T-H: footer must not show the Windows account name on saved shots.
      USERNAME: "Demo",
      USER: "Demo",
      COMPUTERNAME: "COSGRAL-SANDBOX",
      COSGRAL_SPACE_NO_RELAUNCH: "1",
      COSGRAL_WIPE_NO_RELAUNCH: "1",
    },
    timeout: 120_000,
  });
  app.process().stdout?.on("data", (chunk) => mainOut.push(String(chunk)));
  app.process().stderr?.on("data", (chunk) => mainOut.push(String(chunk)));

  let page = await app.firstWindow({ timeout: 90_000 });
  const attach = (p: Page) => {
    p.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning")
        findings.push(`${message.type()}: ${message.text()}`);
    });
    p.on("pageerror", (error) => findings.push(`pageerror: ${error.message}`));
  };
  attach(page);
  app.on("window", (window) => {
    attach(window);
    // Do NOT switch the working page to dock/island — keep the pinned main shell.
    findings.push("new window (ignored for shots)");
  });
  for (let i = 0; i < 20; i += 1) {
    try {
      if (!page.isClosed()) {
        await page.waitForLoadState("domcontentloaded");
        break;
      }
    } catch {
      /* next */
    }
    await new Promise((r) => setTimeout(r, 500));
    const windows = app.windows();
    const first = windows[0];
    if (first) page = first;
  }
  if (page.isClosed()) throw new Error(`no lasting window; mainOut=${mainOut.join("").slice(0, 500)}`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1500);

  const pageRef: { page: Page; main?: Page | null } = { page, main: null };

  try {
    if (!keep) {
      console.log(`first-run: ${(await reachMain(pageRef.page)).join(" -> ") || "(none)"}`);
      pageRef.page = await mainShellPage(app, pageRef.page);
      pageRef.main = pageRef.page;
      await pageRef.page.setViewportSize({ width: 1440, height: 900 });
      await pageRef.page.waitForTimeout(1000);
      const seeded = await seedShotsData(pageRef.page);
      console.log(`seed ipc: ${seeded.notes.join("; ")}`);
      notes.push(`seed|${seeded.notes.join(",")}`);
      const history = seedUsageHistory(root, seeded.botIds);
      console.log(`seed usage: ${history.join("; ")}`);
      notes.push(`seed-usage|${history.join(",")}`);
      // Reload Usage/Schedule projections that may already be cached in the window.
      await pageRef.page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
      await pageRef.page.waitForTimeout(1200);
      pageRef.page = await mainShellPage(app, pageRef.page);
      pageRef.main = pageRef.page;
    } else {
      pageRef.main = pageRef.page;
    }

    await tryShot(app, pageRef, out, "01-dark-sidebar", async (p) => {
      await setTheme(p, "dark");
      await clickRail(p, ["Agents", "Agenci"]).catch(() => undefined);
      await p.waitForTimeout(400);
      return "ciemny motyw + pasek / agenci (pusty → Nowy agent)";
    });

    await tryShot(app, pageRef, out, "02-light-sidebar", async (p) => {
      await setTheme(p, "light");
      await p.waitForTimeout(400);
      return "jasny motyw + pasek";
    });

    await tryShot(app, pageRef, out, "03-new-agent", async (p) => {
      await setTheme(p, "dark");
      const note = await openNewAgentForm(p);
      const heading = p.getByRole("heading", { name: /New agent|Nowy agent/i });
      if (!(await heading.count())) throw new Error("New agent heading missing after open");
      const swatches = p.locator(".new-agent-page img, .new-agent-page button, .new-agent-swatch-fill");
      const suggestions = p.getByText(/Assistant|Researcher|Writer|Sugest/i);
      return [
        note,
        (await swatches.count()) ? `elementy formularza=${await swatches.count()}` : "brak elementów",
        (await suggestions.count()) ? "sugestie widoczne" : "brak sugestii",
      ].join("; ");
    });

    await tryShot(app, pageRef, out, "04-chat-nsteps", async (p) => {
      await ensureChatAgent(p);
      await sendStubChat(p);
      await unlockComposer(p);
      const steps = p.getByText(/\d+\s+steps?|\d+\s+krok/i);
      return (await steps.count()) ? "czat + Stub: received + N steps" : "czat + stub; N steps NIEWIDOCZNE";
    });

    await tryShot(app, pageRef, out, "05-menu-plus", async (p) => {
      await ensureChatAgent(p);
      await unlockComposer(p);
      const plus = p.getByRole("button", { name: "Attach a file" });
      if (!(await plus.count())) throw new Error("menu + (Attach a file) missing");
      if (!(await plus.first().isEnabled())) throw new Error("Attach a file disabled (onboarding model?)");
      await plus.first().click({ timeout: 10_000 });
      await p.waitForTimeout(400);
      const items = p.getByRole("button", { name: /Attach files|Use a skill|Side question|Dołącz|Umiejęt|Pytanie/i });
      return (await items.count()) ? `menu + otwarte (${await items.count()})` : "klik +, brak pozycji";
    });

    await tryShot(app, pageRef, out, "06-menu-at", async (p) => {
      await unlockComposer(p);
      await p.keyboard.press("Escape").catch(() => undefined);
      // contenteditable composer (ComposerEditor): fill + pressSequentially; picker class is .mention-picker
      const box = p
        .locator('.composer-editor-surface[role="textbox"]')
        .or(p.getByRole("textbox", { name: /Message /i }));
      await box.first().waitFor({ timeout: 15_000 });
      await box.first().click();
      await p.keyboard.press("Control+a").catch(() => undefined);
      await p.keyboard.press("Backspace").catch(() => undefined);
      await box.first().pressSequentially("@", { delay: 80 });
      await p.waitForTimeout(900);
      const menu = p
        .getByRole("listbox", { name: /Insert mention/i })
        .or(p.locator('.mention-picker[aria-label="Insert mention"]'))
        .or(p.getByRole("listbox"));
      return (await menu.count()) ? "menu @ widoczne" : "po @ brak menu";
    });

    await tryShot(app, pageRef, out, "07-slash", async (p) => {
      await unlockComposer(p);
      await p.keyboard.press("Escape").catch(() => undefined);
      // Slash picker is a <section aria-label="Commands">.mention-picker.slash-picker (not role=menu).
      const box = p
        .locator('.composer-editor-surface[role="textbox"]')
        .or(p.getByRole("textbox", { name: /Message /i }));
      await box.first().click();
      await p.keyboard.press("Control+a").catch(() => undefined);
      await p.keyboard.press("Backspace").catch(() => undefined);
      await box.first().pressSequentially("/", { delay: 80 });
      await p.waitForTimeout(900);
      const menu = p
        .getByRole("region", { name: /^Commands$/i })
        .or(p.locator(".mention-picker.slash-picker, .slash-picker"))
        .or(p.getByLabel(/^Commands$/i));
      return (await menu.count()) ? "menu / widoczne" : "po / brak menu";
    });

    await tryShot(app, pageRef, out, "08-search", async (p) => {
      await p.keyboard.press("Escape").catch(() => undefined);
      await p.keyboard.press("Control+k");
      const box = p.getByRole("combobox", { name: /Search COSGRAL|Szukaj|Search/i }).or(p.getByRole("searchbox"));
      await box.first().waitFor({ timeout: 10_000 });
      await box.first().fill("agent");
      await p.waitForTimeout(600);
      return "wyszukiwarka Ctrl+K";
    });

    // Close search (Ctrl+K toggle) so the next rail clicks are not blocked.
    if (pageRef.main && !pageRef.main.isClosed()) pageRef.page = pageRef.main;
    await dismissOverlays(pageRef.page);
    await pageRef.page.waitForTimeout(300);

    await tryShot(app, pageRef, out, "09-tasks", async (p) => {
      await dismissOverlays(p);
      await clickRail(p, ["Tasks", "Zadania"]);
      await p.waitForTimeout(900);
      // Detail pane (Open as chat + Steps) opens only after a row click (TasksViewScreen).
      const screen = p.locator("main.tasks-screen").or(p.getByRole("main", { name: /^Tasks$|^Zadania$/i }));
      const row = screen
        .locator("button.tasks-screen-row")
        .filter({ hasText: /Seed task/i })
        .first();
      if (await row.count()) {
        await row.scrollIntoViewIfNeeded().catch(() => undefined);
        await row.click({ timeout: 8_000 }).catch(() => undefined);
      } else {
        // Fallback: any tasks row (seed titles may be shortened).
        const any = screen.locator("button.tasks-screen-row").first();
        if (await any.count()) await any.click({ timeout: 8_000 }).catch(() => undefined);
      }
      await p
        .getByRole("region", { name: /Task details|Szczegóły zadania/i })
        .waitFor({ timeout: 8_000 })
        .catch(() => undefined);
      await p.waitForTimeout(400);
      const checklist = await visibleChecklist([
        {
          id: "heading-or-search",
          find: () =>
            screen
              .getByRole("searchbox", { name: /Search tasks|Szukaj zadań/i })
              .or(screen.getByLabel(/Search tasks|Szukaj zadań/i)),
        },
        { id: "open-as-chat", find: () => p.getByRole("button", { name: /Open as chat|Otwórz jako czat/i }) },
        {
          id: "steps",
          find: () =>
            p.getByRole("heading", { name: /^Steps$|^Kroki$/i }).or(p.getByText(/\d+\/\d+\s+steps|\d+\/\d+\s+krok/i)),
        },
        {
          id: "state-badge",
          find: () =>
            screen.getByText(/^(Running|Done|Paused|Archived|Queued|W toku|Gotowe|Wstrzymane|Archiwum|W kolejce)$/i),
        },
        { id: "seed-task", find: () => screen.locator(".tasks-screen-title").filter({ hasText: /Seed/i }) },
      ]);
      return `Zadania + checklist [${checklist}]`;
    });

    await tryShot(app, pageRef, out, "09b-usage", async (p) => {
      await clickRail(p, ["Usage", "Użycie", "Zużycie"]);
      await p.waitForTimeout(700);
      const tab7 = p.getByRole("button", { name: /7 days|7 dni/i });
      if (await tab7.count())
        await tab7
          .first()
          .click()
          .catch(() => undefined);
      await p.waitForTimeout(400);
      const checklist = await visibleChecklist([
        {
          id: "usage-report",
          find: () => p.getByRole("region", { name: /Usage report|Raport użycia/i }).or(p.locator(".usage-report")),
        },
        { id: "period-tabs", find: () => p.getByRole("button", { name: /7 days|7 dni|30 days|30 dni/i }) },
        { id: "by-model", find: () => p.getByText(/By model|Według modelu/i) },
        { id: "model-row", find: () => p.getByText(/luna|codex|gpt|claude/i) },
      ]);
      return `Użycie + checklist [${checklist}]`;
    });

    await tryShot(app, pageRef, out, "09c-schedule", async (p) => {
      await clickRail(p, ["Schedule", "Harmonogram"]);
      await p.waitForTimeout(700);
      const checklist = await visibleChecklist([
        {
          id: "overview",
          find: () =>
            p
              .getByRole("region", { name: /Schedule overview|Przegląd harmonogramu/i })
              .or(p.locator(".schedule-overview")),
        },
        {
          id: "window",
          find: () => p.getByRole("button", { name: /^(7|14|30)$/ }).or(p.getByText(/Next|Najbliższe|days|dni/i)),
        },
        {
          id: "run-status",
          find: () => p.getByText(/Running|Done|Failed|Skipped|Planned|W toku|Gotowe|Nieudane|Zaplanowane/i),
        },
        { id: "seed-routine", find: () => p.getByText(/seed|routine|rutyn/i) },
      ]);
      return `Harmonogram + checklist [${checklist}]`;
    });

    await tryShot(app, pageRef, out, "09d-message-menu", async (p) => {
      await ensureChatAgent(p);
      await sendStubChat(p).catch(() => undefined);
      await unlockComposer(p);
      // Actions stay opacity:0 until the message row is hovered (conversation.css).
      const entry = p
        .locator(".message-entry")
        .filter({ hasText: /Stub: received|Hello from T-G shots/i })
        .last();
      if (await entry.count()) {
        await entry.scrollIntoViewIfNeeded().catch(() => undefined);
        await entry.hover({ timeout: 8_000 }).catch(() => undefined);
        await p.waitForTimeout(300);
      }
      const more = (await entry.count())
        ? entry.getByRole("button", { name: /More message actions/i })
        : p.getByRole("button", { name: /More message actions/i });
      if (!(await more.count())) {
        return `menu wiadomości MISS:more-btn [${await visibleChecklist([{ id: "stub-text", find: () => p.getByText(/Stub: received|Hello from T-G/i) }])}]`;
      }
      // Kobalte: pointerdown opens (MessageHistoryActions.test); labels are "Edit message" / "Delete message".
      await more.first().dispatchEvent("pointerdown", { button: 0 });
      await more.first().dispatchEvent("pointerup", { button: 0 });
      await p
        .getByRole("menuitem", { name: /^Copy$|^Kopiuj$/i })
        .first()
        .waitFor({ timeout: 8_000 })
        .catch(() => undefined);
      await p.waitForTimeout(300);
      const checklist = await visibleChecklist([
        { id: "copy", find: () => p.getByRole("menuitem", { name: /^Copy$|^Kopiuj$/i }) },
        { id: "react", find: () => p.getByRole("button", { name: /Add reaction|Dodaj reakcję/i }) },
        { id: "pin", find: () => p.getByRole("menuitem", { name: /Pin message|Unpin message|Przypnij|Odepnij/i }) },
        { id: "branch", find: () => p.getByRole("menuitem", { name: /Branch from here|Rozgałęź/i }) },
        { id: "retry", find: () => p.getByRole("menuitem", { name: /^Retry$|^Ponów$/i }) },
        { id: "edit", find: () => p.getByRole("menuitem", { name: /^Edit message$|^Edytuj wiadomość$/i }) },
        { id: "delete", find: () => p.getByRole("menuitem", { name: /^Delete message$|^Usuń wiadomość$/i }) },
      ]);
      return `menu wiadomości + checklist [${checklist}]`;
    });

    await tryShot(app, pageRef, out, "10-agent-cards", async (p) => {
      await ensureChatAgent(p);
      await unlockComposer(p);
      const settings = p.getByRole("button", {
        name: /View agent settings|Agent settings|Ustawienia agenta|Open Settings|Otwórz ustawienia|Preferences|Edit agent/i,
      });
      if (await settings.count()) await settings.first().click();
      else {
        // Gear / preferences in chat header
        const gear = p.locator('button[aria-label*="settings" i], button[aria-label*="ustawień" i]').first();
        if (await gear.count()) await gear.click();
      }
      await p.waitForTimeout(900);
      const marker = p.getByText(
        /Chat color|Kolor czatu|Instructions|Instrukcje|Memories|Pamięci|Skills|Umiejętności|Cards|Karty|Avatar|Specialty/i,
      );
      if (!(await marker.count())) throw new Error("agent cards UI not rendered");
      return "karty ustawień agenta";
    });

    await tryShot(app, pageRef, out, "11-server-settings", async (p) => {
      await clickRail(p, ["Server settings", "Ustawienia serwera"]);
      return "Ustawienia serwera";
    });

    await tryShot(app, pageRef, out, "12-marketplace", async (p) => {
      await clickRail(p, ["Marketplace", "Katalog dodatków"]);
      await p.waitForTimeout(700);
      const agentsTab = p
        .getByRole("button", { name: /^Agents$|^Agenci$/i })
        .or(p.getByRole("tab", { name: /^Agents$/i }));
      const skillsTab = p
        .getByRole("button", { name: /^Skills$|^Umiejętności$/i })
        .or(p.getByRole("tab", { name: /^Skills$/i }));
      if (await skillsTab.count())
        await skillsTab
          .first()
          .click()
          .catch(() => undefined);
      await p.waitForTimeout(400);
      const checklist = await visibleChecklist([
        { id: "sections", find: () => p.getByText(/Marketplace sections|Sekcje Marketplace|Agents|Skills/i) },
        {
          id: "catalog-skill",
          find: () => p.getByText(/Meeting notes|Daily brief|Research brief|Weekly status|Decision log/i),
        },
        { id: "agents-tab", find: () => agentsTab },
        { id: "skills-tab", find: () => skillsTab },
      ]);
      return `Marketplace + checklist [${checklist}]`;
    });

    await tryShot(app, pageRef, out, "13-library-vault", async (p) => {
      await clickRail(p, ["Library", "Biblioteka"]);
      await p.waitForTimeout(800);
      const checklist = await visibleChecklist([
        { id: "file-library", find: () => p.getByText(/File library|Biblioteka plików|All files|Wszystkie pliki/i) },
        { id: "seed-file", find: () => p.getByText(/seed-brief\.md|seed-leads\.csv|seed-agent-notes/i) },
        { id: "origin-tabs", find: () => p.getByText(/Uploaded|Made by agents|From chats|Wgrane|Od agentów/i) },
        { id: "vault", find: () => p.getByText(/^Vault$|^Sejf$/i) },
        {
          id: "password-managers",
          find: () =>
            p
              .getByRole("region", { name: /Password managers|Menedżery haseł/i })
              .or(p.getByText(/Password managers|Menedżery haseł/i)),
        },
        { id: "1password", find: () => p.getByText(/1Password/) },
        { id: "bitwarden", find: () => p.getByText(/Bitwarden/) },
        { id: "proton", find: () => p.getByText(/Proton Pass/) },
      ]);
      return `Library+Vault konektory + checklist [${checklist}]`;
    });

    await tryShot(app, pageRef, out, "14-providers", async (p) => {
      await clickRail(p, ["Providers", "Dostawcy"]);
      await p.waitForTimeout(900);
      const checklist = await visibleChecklist([
        {
          id: "catalog",
          find: () => p.getByText(/Provider catalog|Katalog dostawców|Built-in|Wbudowany|Startuje z wzorca/i),
        },
        { id: "key-pool", find: () => p.getByText(/Add key|Dodaj klucz|API key|Klucz API|••••/i) },
        { id: "codex-or-claude", find: () => p.getByText(/Codex|Claude/i) },
      ]);
      return `Dostawcy + checklist [${checklist}]`;
    });

    // PL comparison (KAPI-D): same screens with language=pl — full Polish copy should show.
    await tryShot(app, pageRef, out, "14b-providers-pl", async (p) => {
      await setLanguage(p, "pl");
      await dismissOverlays(p);
      await clickRail(p, ["Providers", "Dostawcy"]);
      await p.waitForTimeout(900);
      const checklist = await visibleChecklist([
        { id: "pl-heading", find: () => p.getByText(/Dostawcy|Katalog dostawców|Wbudowany/i) },
        { id: "pl-pool", find: () => p.getByText(/Dodaj klucz|Klucz API|W puli|Usuń/i) },
        { id: "codex-or-claude", find: () => p.getByText(/Codex|Claude/i) },
      ]);
      return `Dostawcy PL + checklist [${checklist}]`;
    });

    await tryShot(app, pageRef, out, "14c-usage-pl", async (p) => {
      await setLanguage(p, "pl");
      await dismissOverlays(p);
      await clickRail(p, ["Usage", "Użycie", "Zużycie"]);
      await p.waitForTimeout(900);
      const checklist = await visibleChecklist([
        { id: "pl-usage", find: () => p.getByText(/Użycie|Raport użycia|Według modelu/i) },
        { id: "pl-period", find: () => p.getByRole("button", { name: /7 dni|30 dni/i }) },
        { id: "model-row", find: () => p.getByText(/luna|codex|gpt|claude/i) },
      ]);
      await setLanguage(p, "en");
      return `Użycie PL + checklist [${checklist}]`;
    });

    await tryShot(app, pageRef, out, "15-workflows-versions", async (p) => {
      await dismissOverlays(p);
      await clickRail(p, ["Workflows", "Przepływy"]);
      await p.waitForTimeout(900);
      // Do NOT match "New workflow" (clears selected). Seed name is exact.
      const listItem = p.getByRole("button", { name: /^Seed shot flow$/i });
      if (await listItem.count()) {
        await listItem
          .first()
          .click({ timeout: 8_000 })
          .catch(() => undefined);
      } else {
        const fallback = p.getByRole("button", { name: /^Seed /i });
        if (await fallback.count())
          await fallback
            .first()
            .click({ timeout: 8_000 })
            .catch(() => undefined);
      }
      await p.waitForTimeout(800);
      const versions = p.getByRole("region", { name: /^Versions$|^Wersje$/i }).or(p.locator(".workflow-versions"));
      if (await versions.count())
        await versions
          .first()
          .scrollIntoViewIfNeeded()
          .catch(() => undefined);
      await p.waitForTimeout(400);
      const checklist = await visibleChecklist([
        {
          id: "canvas-or-list",
          find: () => p.getByText(/Workflow|Przepływ|Trigger|Agent|Run history|Historia|Seed shot flow/i),
        },
        {
          id: "versions",
          find: () =>
            p
              .getByRole("region", { name: /^Versions$|^Wersje$/i })
              .or(p.getByRole("heading", { name: /^Versions$|^Wersje$/i }))
              .or(p.getByText(/Version \d+|Wersja \d+|Restore|Przywróć|No versions yet|Brak wersji/i)),
        },
      ]);
      return `Workflows wersje + checklist [${checklist}]`;
    });

    await tryShot(app, pageRef, out, "16-updates", async (p) => {
      // KK: gear is exact "Settings"/"Ustawienia" (not "Server settings"); Updates is its own nav section.
      await dismissOverlays(p);
      await openAppSettings(p);
      const dialog = p.getByRole("dialog");
      const updatesNav = dialog
        .locator(".settings-modal-nav")
        .getByRole("button", { name: "Updates", exact: true })
        .or(dialog.locator(".settings-modal-nav").getByRole("button", { name: "Aktualizacje", exact: true }));
      if (await updatesNav.count())
        await updatesNav
          .first()
          .click({ timeout: 8_000 })
          .catch(() => undefined);
      await p.waitForTimeout(500);
      const checklist = await visibleChecklist([
        {
          id: "heading",
          find: () =>
            dialog
              .getByRole("heading", { name: /^Updates$|^Aktualizacje$/i })
              .or(dialog.getByText(/Check for updates|Sprawdź aktualizacje|Update settings are not available/i)),
        },
        {
          id: "track",
          find: () =>
            dialog.getByText(
              /Stable|Preview|Stabilny|Installed version|Zainstalowana wersja|COSGRAL Workspace version/i,
            ),
        },
      ]);
      return `Aktualizacje KK (Settings→Updates) + checklist [${checklist}]`;
    });

    await tryShot(app, pageRef, out, "17-messengers", async (p) => {
      await clickRail(p, ["Library", "Biblioteka"]);
      await p.waitForTimeout(600);
      const head = p.getByText(/^Messengers$|^Komunikatory$/i);
      if (await head.count())
        await head
          .first()
          .scrollIntoViewIfNeeded()
          .catch(() => undefined);
      await p.waitForTimeout(400);
      const checklist = await visibleChecklist([
        { id: "messengers", find: () => p.getByText(/Messengers|Komunikatory/i) },
        { id: "telegram", find: () => p.getByText(/Telegram/i) },
        { id: "slack", find: () => p.getByText(/Slack/i) },
      ]);
      return `Komunikatory KK + checklist [${checklist}]`;
    });

    await tryShot(app, pageRef, out, "18-mcp-oauth", async (p) => {
      await clickRail(p, ["Server settings", "Ustawienia serwera"]);
      await p.waitForTimeout(400);
      const mcp = p.getByRole("button", { name: /^MCP$/i }).or(p.getByText(/^MCP$/i));
      if (await mcp.count())
        await mcp
          .first()
          .click()
          .catch(() => undefined);
      await p.waitForTimeout(600);
      const checklist = await visibleChecklist([
        { id: "mcp", find: () => p.getByText(/MCP|Sign in|Zaloguj|OAuth/i) },
        { id: "servers", find: () => p.getByText(/server|serwer|Add|Dodaj/i) },
      ]);
      return `MCP OAuth KK + checklist [${checklist}]`;
    });

    await tryShot(app, pageRef, out, "19-voice", async (p) => {
      // KK: Voice lives in app Settings modal (VoiceOverviewPanel), not Server settings → MCP.
      await dismissOverlays(p);
      await openAppSettings(p);
      const dialog = p.getByRole("dialog");
      const voiceNav = dialog
        .locator(".settings-modal-nav")
        .getByRole("button", { name: "Voice", exact: true })
        .or(dialog.locator(".settings-modal-nav").getByRole("button", { name: "Głos", exact: true }));
      if (await voiceNav.count())
        await voiceNav
          .first()
          .click({ timeout: 8_000 })
          .catch(() => undefined);
      await p.waitForTimeout(600);
      const checklist = await visibleChecklist([
        {
          id: "voice",
          find: () =>
            dialog
              .getByRole("heading", { name: /^Microphone$|^Mikrofon$/i })
              .or(dialog.getByText(/Microphone|Mikrofon|Voice|Głos/i)),
        },
        {
          id: "mic",
          find: () =>
            dialog.getByText(
              /Not available in this version|Niedostępne w tej wersji|permission|uprawnien|unavailable|niedostępne/i,
            ),
        },
      ]);
      return `Głos KK (Settings→Voice) + checklist [${checklist}]`;
    });

    await tryShot(app, pageRef, out, "20-mobile-connect", async (p) => {
      await dismissOverlays(p);
      // PageRail label is Phone / Telefon (often in More pages overflow) — not "Mobile Connect".
      await clickRail(p, ["Phone", "Telefon", "Mobile Connect", "Mobile"]);
      await p.waitForTimeout(800);
      const checklist = await visibleChecklist([
        {
          id: "mobile",
          find: () =>
            p
              .locator(".mobile-connect-page")
              .or(p.getByText(/Mobile Connect|Telefon|PIN|Tailscale|Phones cannot connect/i)),
        },
        { id: "push", find: () => p.getByText(/push|powiadom|notification|Enable|Włącz|Tailscale/i) },
      ]);
      return `Mobile Connect KK + checklist [${checklist}]`;
    });

    await tryShot(app, pageRef, out, "21-remote-desktop", async (p) => {
      await clickRail(p, ["Remote desktop", "Zdalny pulpit"]);
      await p.waitForTimeout(800);
      const checklist = await visibleChecklist([
        { id: "remote", find: () => p.getByText(/Remote desktop|Zdalny pulpit|Share this computer|Udostępnij/i) },
        { id: "ask", find: () => p.getByText(/Ask on this computer|Pytaj|every time|za każdym/i) },
      ]);
      return `Zdalny pulpit KK + checklist [${checklist}]`;
    });

    await tryShot(app, pageRef, out, "22-thread-undo", async (p) => {
      await ensureChatAgent(p);
      await unlockComposer(p);
      // Delete via IPC so the 10-min undo bar appears. threads.list returns ThreadList { threads: [...] }, not an array.
      const deleted = await p.evaluate(`(async () => {
        const api = window.openbot;
        const bots = await api.agent.listBots();
        const bot = bots.find((b) => b.name === "Shot agent") || bots.find((b) => !b.hidden) || bots[0];
        if (!bot) return "no-bot";
        let list = api.threads?.list ? await api.threads.list({ botId: bot.id }) : null;
        let rows = Array.isArray(list?.threads) ? list.threads : Array.isArray(list) ? list : [];
        let t = rows.find((row) => row.title === "Seed undo thread") || rows.find((row) => row.state !== "archived") || rows[0];
        if (!t && api.threads?.create) {
          list = await api.threads.create({ botId: bot.id, title: "Seed undo thread" });
          rows = Array.isArray(list?.threads) ? list.threads : [];
          t = rows.find((row) => row.title === "Seed undo thread") || rows[0];
        }
        if (!t) return "no-thread";
        if (api.threadUndo?.delete) {
          await api.threadUndo.delete({ botId: bot.id, threadId: t.id, confirm: true });
        } else if (api.threads?.delete) {
          await api.threads.delete({ botId: bot.id, threadId: t.id, confirm: true });
        } else {
          return "no-delete-api";
        }
        return "ok:" + (t.title || t.id);
      })()`);
      await p.waitForTimeout(800);
      const bar = p.getByText(/Usunięto|Deleted|Undo|Cofnij/i);
      const checklist = await visibleChecklist([
        { id: "undo-bar", find: () => bar },
        { id: "countdown", find: () => p.getByText(/\d+:\d{2}|Cofnij|Undo/i) },
      ]);
      return `pasek Cofnij (${String(deleted)}) + checklist [${checklist}]`;
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    findings.push(`fatal: ${detail}`);
    await pageRef.page.screenshot({ path: join(out, "fatal.png") }).catch(() => undefined);
    throw error;
  } finally {
    const hashes1 = await hashPngs(out).catch(() => []);
    const hashes2 = await hashPngs(out).catch(() => []);
    const dups1 = duplicateReport(hashes1);
    const dups2 = duplicateReport(hashes2);
    await writeFile(join(out, "notes.tsv"), `${notes.join("\n")}\n`);
    await writeFile(join(out, "console.txt"), `${findings.join("\n")}\n`);
    await writeFile(join(out, "main-out.txt"), `${mainOut.join("")}\n`);
    await writeFile(
      join(out, "hashes.tsv"),
      `${hashes1.map((row) => `${row.path}\t${row.sha}`).join("\n")}\n# pass2-dups: ${dups2.join(" | ") || "none"}\n# pass1-dups: ${dups1.join(" | ") || "none"}\n`,
    );
    if (dups1.length || dups2.length) {
      console.log(`DUPLICATE PNG WARNING: ${[...new Set([...dups1, ...dups2])].join("; ")}`);
    } else {
      console.log("duplicate check ×2: OK (no identical PNG pairs)");
    }
    console.log(`done shots=${notes.length} console=${findings.length} out=${out}`);
    await app.close().catch(() => undefined);
  }
}

await main();
