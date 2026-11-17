// T-G: screenshot states for COSGRAL (real Electron, sandbox only). Run ONLY after GO-tester-*.txt.
//   COSGRAL_SANDBOX_ROOT=<sandbox> COSGRAL_SHOTS_OUT=<Shared/cosgral-docs/zrzuty-cosgral-17-11-b> node scripts/sandbox-shots-w12.ts
// Writes 1440x900 PNGs outside the repo. No commit. `bun run build` first.
// States: dark+light; New agent (avatars+suggestions); chat+stub+N steps; menu +/@//; search; Tasks; agent cards; server settings; Marketplace; Vault.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
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
  const names = await readdir(gate).catch(() => [] as string[]);
  const go = names.find((name) => /^GO-tester-.*\.txt$/i.test(name));
  assert(go, `Missing GO-tester-*.txt in ${gate} — do not launch Electron without the lead's GO`);
  console.log(`GO ok: ${join(gate, go)}`);
}

function currentPage(app: ElectronApplication, page: Page): Page {
  if (!page.isClosed()) return page;
  const windows = app.windows();
  if (!windows.length) throw new Error("all windows closed");
  return windows[windows.length - 1]!;
}

async function shot(page: Page, out: string, name: string, note: string): Promise<void> {
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, `${name}.png`) });
  notes.push(`${name}|${note}`);
  console.log(`shot ${name}: ${note}`);
}

async function tryShot(
  app: ElectronApplication,
  pageRef: { page: Page },
  out: string,
  name: string,
  work: (page: Page) => Promise<string>,
): Promise<void> {
  try {
    pageRef.page = currentPage(app, pageRef.page);
    const note = await work(pageRef.page);
    pageRef.page = currentPage(app, pageRef.page);
    await shot(pageRef.page, out, name, note);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    notes.push(`${name}|FAIL: ${detail.split("\n")[0]}`);
    console.log(`FAIL ${name}: ${detail.split("\n")[0]}`);
    try {
      pageRef.page = currentPage(app, pageRef.page);
      await pageRef.page.screenshot({ path: join(out, `${name}-fail.png`) });
    } catch {
      /* ignore */
    }
  }
}

async function reachMain(page: Page): Promise<string[]> {
  const seen: string[] = [];
  for (let round = 0; round < 60; round += 1) {
    if (page.isClosed()) throw new Error(`page closed during first-run (saw: ${seen.join(", ")})`);
    const pages = page
      .getByRole("navigation", { name: "Pages" })
      .or(page.getByRole("navigation", { name: "Strony" }));
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

async function openNewAgentForm(page: Page): Promise<string> {
  // Prefer the real New agent screen (form + avatars), not "create then open chat".
  const viaRail = page
    .getByRole("button", { name: /New agent|Nowy agent/i })
    .or(page.getByRole("menuitem", { name: /New agent|Nowy agent/i }));
  const plus = page.getByRole("button", { name: /^\+|Add|Dodaj|New/i });
  if (await plus.count()) {
    await plus.first().click().catch(() => undefined);
    await page.waitForTimeout(400);
  }
  if (await viaRail.count()) {
    await viaRail.first().click();
  } else {
    await page.evaluate(`(async () => {
      // Empty program / UI-F: navigate if the app exposes a create flow.
      if (window.openbot.agent?.createBot) {
        /* leave form navigation to UI; ensure at least one bot exists for later shots */
      }
    })()`);
    const create = page.getByRole("button", { name: /Create new agent|Utwórz nowego agenta|New agent|Nowy agent/i });
    if (await create.count()) await create.first().click();
  }
  await page.waitForTimeout(800);
  const form = page.locator(".new-agent-page").or(page.getByRole("main", { name: /New agent|Nowy agent/i }));
  if (await form.count()) return "formularz Nowy agent widoczny";
  // Fallback: heading / avatar swatches
  if (await page.getByRole("heading", { name: /New agent|Nowy agent/i }).count()) return "nagłówek Nowy agent";
  throw new Error("New agent form not visible (got chat instead?)");
}

async function ensureChatAgent(page: Page): Promise<string> {
  const viaApi = await page.evaluate(`(async () => {
    const bots = await window.openbot.agent.listBots();
    const named = bots.find((b) => b.name === "Shot agent" || b.name === "New agent" || b.name === "Nowy agent");
    if (named) {
      return named.name;
    }
    const created = await window.openbot.agent.createBot();
    await window.openbot.agent.updateBot({ botId: created.id, name: "Shot agent" });
    return "Shot agent";
  })()`);
  await page.waitForTimeout(600);
  const row = page.getByRole("button", { name: /Shot agent|New agent|Nowy agent/i }).first();
  if (await row.count()) await row.click();
  await page.waitForTimeout(500);
  return String(viaApi);
}

async function sendStubChat(page: Page): Promise<void> {
  await page.evaluate(`(async () => {
    const bots = await window.openbot.agent.listBots();
    const bot = bots.find((b) => b.name === "Shot agent") ?? bots.find((b) => b.name === "New agent") ?? bots[0];
    if (!bot) return;
    const models = (await window.openbot.agent.listModels?.()) ?? [];
    const model = models[0]?.id ?? bot.model;
    if (model) await window.openbot.agent.updateBot({ botId: bot.id, model });
  })()`);
  await page.waitForTimeout(500);
  const chip = page.getByRole("button", { name: /Luna|Codex|gpt|Claude/i });
  if (await chip.count()) await chip.first().click().catch(() => undefined);
  const box = page
    .getByRole("textbox", { name: /Message|Wiadomość/i })
    .or(page.getByPlaceholder(/Message|Wiadomość|Choose a model/i));
  await box.first().waitFor({ timeout: 20_000 });
  await box.first().click();
  await box.first().fill("Hello from T-G shots — please reason");
  const send = page.getByRole("button", { name: /Send message|Wyślij/i });
  if (await send.count()) await send.click();
  else await box.first().press("Enter");
  await page.getByText(/Stub: received|Hello from T-G shots/i).first().waitFor({ timeout: 45_000 });
  await page.waitForTimeout(800);
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
      USERNAME: "sandbox",
      USER: "sandbox",
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
    page = window;
    findings.push("new window");
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
    if (windows.length) page = windows[windows.length - 1]!;
  }
  if (page.isClosed()) throw new Error(`no lasting window; mainOut=${mainOut.join("").slice(0, 500)}`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1500);

  const pageRef = { page };
  const rail = (p: Page) =>
    p.getByRole("navigation", { name: "Pages" }).or(p.getByRole("navigation", { name: "Strony" }));

  try {
    if (!keep) {
      console.log(`first-run: ${(await reachMain(pageRef.page)).join(" -> ") || "(none)"}`);
      pageRef.page = currentPage(app, pageRef.page);
      await pageRef.page.setViewportSize({ width: 1440, height: 900 });
      await pageRef.page.waitForTimeout(1000);
    }

    await tryShot(app, pageRef, out, "01-dark-sidebar", async (p) => {
      await setTheme(p, "dark");
      const agents = rail(p).getByRole("button", { name: /^(Agents|Agenci)$/i });
      if (await agents.count()) await agents.click();
      await p.waitForTimeout(500);
      return "ciemny motyw + pasek / agenci";
    });

    await tryShot(app, pageRef, out, "02-light-sidebar", async (p) => {
      await setTheme(p, "light");
      await p.waitForTimeout(400);
      return "jasny motyw + pasek";
    });

    await tryShot(app, pageRef, out, "03-new-agent", async (p) => {
      await setTheme(p, "dark");
      const note = await openNewAgentForm(p);
      const swatches = p.locator(".new-agent-swatch-fill, [aria-label*='color' i], [aria-label*='kolor' i]");
      const suggestions = p.getByText(/Research|Writer|Coordinator|Sugest|template/i);
      return [
        note,
        (await swatches.count()) ? `awatary/swatche=${await swatches.count()}` : "brak swatchy",
        (await suggestions.count()) ? "sugestie widoczne" : "brak sugestii",
      ].join("; ");
    });

    await tryShot(app, pageRef, out, "04-chat-nsteps", async (p) => {
      await ensureChatAgent(p);
      await sendStubChat(p);
      const steps = p.getByText(/\d+\s+steps?|\d+\s+krok/i);
      return (await steps.count()) ? "czat + Stub: received + N steps" : "czat + stub; N steps NIEWIDOCZNE";
    });

    await tryShot(app, pageRef, out, "05-menu-plus", async (p) => {
      await ensureChatAgent(p);
      const plus = p.getByRole("button", { name: /Attach|Dodaj|Załącz|Add attachment|\+/i });
      if (!(await plus.count())) throw new Error("menu + button missing");
      await plus.first().click();
      await p.waitForTimeout(400);
      const items = p.getByRole("menuitem").or(p.getByText(/skill|Side question|Attach|Załącz|Umiejęt/i));
      return (await items.count()) ? `menu + otwarte (${await items.count()})` : "klik +, brak pozycji";
    });

    await tryShot(app, pageRef, out, "06-menu-at", async (p) => {
      await p.keyboard.press("Escape").catch(() => undefined);
      const box = p
        .getByRole("textbox", { name: /Message|Wiadomość/i })
        .or(p.getByPlaceholder(/Message|Wiadomość/i));
      await box.first().click();
      await box.first().fill("");
      await box.first().pressSequentially("@", { delay: 50 });
      await p.waitForTimeout(700);
      const menu = p.getByRole("listbox").or(p.getByText(/channel|kanał|agent|mention/i));
      return (await menu.count()) ? "menu @ widoczne" : "po @ brak menu";
    });

    await tryShot(app, pageRef, out, "07-slash", async (p) => {
      await p.keyboard.press("Escape").catch(() => undefined);
      const box = p
        .getByRole("textbox", { name: /Message|Wiadomość/i })
        .or(p.getByPlaceholder(/Message|Wiadomość/i));
      await box.first().click();
      await box.first().fill("");
      await box.first().pressSequentially("/", { delay: 50 });
      await p.waitForTimeout(700);
      const menu = p.getByRole("listbox").or(p.getByText(/command|polecen|slash/i));
      return (await menu.count()) ? "menu / widoczne" : "po / brak menu";
    });

    await tryShot(app, pageRef, out, "08-search", async (p) => {
      await p.keyboard.press("Escape").catch(() => undefined);
      await p.keyboard.press("Control+k");
      const box = p
        .getByRole("combobox", { name: /Search COSGRAL|Szukaj|Search/i })
        .or(p.getByRole("searchbox"));
      await box.first().waitFor({ timeout: 10_000 });
      await box.first().fill("agent");
      await p.waitForTimeout(600);
      return "wyszukiwarka Ctrl+K";
    });

    await tryShot(app, pageRef, out, "09-tasks", async (p) => {
      await p.keyboard.press("Escape").catch(() => undefined);
      const btn = rail(p)
        .getByRole("button", { name: /Tasks|Zadania/i })
        .or(p.getByRole("button", { name: /Tasks|Zadania/i }));
      if (!(await btn.count())) throw new Error("Tasks rail button missing");
      await btn.first().click();
      await p.waitForTimeout(700);
      return "strona Zadania";
    });

    await tryShot(app, pageRef, out, "10-agent-cards", async (p) => {
      await ensureChatAgent(p);
      const settings = p.getByRole("button", {
        name: /View agent settings|Agent settings|Ustawienia agenta|Open Settings|Otwórz ustawienia/i,
      });
      if (await settings.count()) await settings.first().click();
      await p.waitForTimeout(900);
      const marker = p.getByText(/Chat color|Kolor czatu|Instructions|Instrukcje|Memories|Pamięci|Skills|Umiejętności/i);
      if (!(await marker.count())) throw new Error("agent cards UI not rendered");
      return "karty ustawień agenta";
    });

    await tryShot(app, pageRef, out, "11-server-settings", async (p) => {
      const btn = rail(p).getByRole("button", { name: /Server settings|Ustawienia serwera/i });
      if (!(await btn.count())) throw new Error("Server settings missing");
      await btn.click();
      await p.waitForTimeout(800);
      return "Ustawienia serwera";
    });

    await tryShot(app, pageRef, out, "12-marketplace", async (p) => {
      await rail(p).getByRole("button", { name: /Marketplace|Katalog dodatków/i }).click();
      await p.waitForTimeout(900);
      return "Marketplace";
    });

    await tryShot(app, pageRef, out, "13-vault", async (p) => {
      const btn = rail(p)
        .getByRole("button", { name: /Vault|Sejf/i })
        .or(p.getByRole("button", { name: /Vault|Sejf/i }));
      if (!(await btn.count())) throw new Error("Vault rail button missing");
      await btn.first().click();
      await p.waitForTimeout(800);
      return "Vault";
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
