// T-G: screenshot states for COSGRAL (real Electron, sandbox only). Run ONLY after GO-tester-*.txt.
//   COSGRAL_SANDBOX_ROOT=<sandbox> COSGRAL_SHOTS_OUT=<Shared/cosgral-docs/zrzuty-cosgral-17-11-b> node scripts/sandbox-shots-w12.ts
// Writes 1440x900 PNGs outside the repo. No commit. `bun run build` first.
// States: dark+light; New agent (avatars+suggestions); chat+stub+N steps; menu +/@//; search; Tasks; agent cards; server settings; Marketplace; Vault.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { type DynamicRecord, isDynamicRecord } from "@openbot/contracts/runtime-values";
import { type ElectronApplication, _electron as electron, type Page } from "playwright";
import { cleanEnvironment } from "./sandbox-env.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const notes: string[] = [];
const findings: string[] = [];

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
  for (let round = 0; round < 60; round += 1) {
    if (page.isClosed()) throw new Error(`page closed during first-run (saw: ${seen.join(", ")})`);
    const pages = page.getByRole("navigation", { name: "Pages" }).or(page.getByRole("navigation", { name: "Strony" }));
    if (await pages.count()) return seen;
    const useLocal = page.getByRole("button", { name: /Use this computer|Użyj tego komputera/i });
    const continueCodex = page.getByRole("button", {
      name: /Continue with Codex|Finish setup|Kontynuuj z Codex|Zakończ konfigurację/i,
    });
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
    await page.waitForTimeout(400);
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

async function openNewAgentForm(
  page: Page,
): Promise<"formularz Nowy agent już na starcie" | "formularz Nowy agent widoczny"> {
  await dismissOverlays(page);
  // Empty program (UI-F) already starts on New agent — do not click broad "+/New" (opens Join / New channel).
  const form = page.locator(".new-agent-page").or(page.getByRole("main", { name: /New agent|Nowy agent/i }));
  const heading = page.getByRole("heading", { name: /New agent|Nowy agent/i });
  if ((await form.count()) || (await heading.count())) return "formularz Nowy agent już na starcie";
  const create = page.getByRole("button", { name: /^New agent$|^Nowy agent$|Create new agent|Utwórz nowego agenta/i });
  if (await create.count()) {
    await create.first().click({ timeout: 8_000 });
    await page.waitForTimeout(600);
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
    args: [repo],
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
      const box = p.getByRole("textbox", { name: /Message /i });
      await box.first().waitFor({ timeout: 15_000 });
      await box.first().click();
      await box.first().fill("");
      await box.first().pressSequentially("@", { delay: 50 });
      await p.waitForTimeout(700);
      const menu = p
        .getByRole("listbox")
        .or(p.getByRole("menu"))
        .or(p.locator(".composer-mention-menu, .mention-menu"));
      return (await menu.count()) ? "menu @ widoczne" : "po @ brak menu";
    });

    await tryShot(app, pageRef, out, "07-slash", async (p) => {
      await unlockComposer(p);
      const box = p.getByRole("textbox", { name: /Message /i });
      await box.first().click();
      await box.first().fill("");
      await box.first().pressSequentially("/", { delay: 50 });
      await p.waitForTimeout(700);
      const menu = p.getByRole("listbox").or(p.getByRole("menu")).or(p.locator(".composer-slash-menu, .slash-menu"));
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
      await clickRail(p, ["Tasks", "Zadania"]);
      return "strona Zadania";
    });

    await tryShot(app, pageRef, out, "09b-usage", async (p) => {
      await clickRail(p, ["Usage", "Użycie"]);
      const tabs = p.getByRole("button", { name: /7 days|7 dni|30 days|30 dni/i });
      return (await tabs.count()) ? "Użycie: zakładki okresu + raport" : "Użycie otwarte (brak zakładek okresu)";
    });

    await tryShot(app, pageRef, out, "09c-schedule", async (p) => {
      await clickRail(p, ["Schedule", "Harmonogram"]);
      const next = p.getByText(/Next 7 days|Najbliższe 7|Routines|Rutyny/i);
      return (await next.count()) ? "Harmonogram: okno + rutyny" : "Harmonogram otwarty";
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
      return "Marketplace";
    });

    await tryShot(app, pageRef, out, "13-vault", async (p) => {
      await clickRail(p, ["Library", "Biblioteka"]);
      const vault = p.getByText(/Vault|Sejf/i);
      return (await vault.count()) ? "Library + Vault" : "Library (Vault nagłówek niewidoczny)";
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
