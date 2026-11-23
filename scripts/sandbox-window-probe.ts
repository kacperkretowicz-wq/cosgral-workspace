// COSGRAL (23.11, Windows): a probe of the real program window. It opens the built program on an EXISTING sandbox profile
// (one that went through first run, e.g. after sandbox-shots-w12.ts, so it has agents, channels and tasks), visits every
// page of the page rail, the conversation (+ popover, @ picker) and every Settings section, in Polish, dark and light.
// For each screen it reports:
//   - "[i18n] Missing UI translation" from the console (a t() key with no Polish text);
//   - an English dictionary key that has a different Polish text, visible on a Polish screen (a string that skipped
//     t()/tData(), e.g. a raw engine state);
//   - text cut without an ellipsis (overflow hidden, no text-overflow), and a page wider than the window;
//   - any other console error or warning.
//
//   COSGRAL_SANDBOX_ROOT=<sandbox> COSGRAL_PROBE_OUT=<folder for screenshots> [COSGRAL_PROBE_SIZE=960x640]
//     node scripts/sandbox-window-probe.ts
//
// Run `bun run build` first. It changes the sandbox's language and theme and sets them back to English / system.

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, type Page } from "playwright";
import { cleanEnvironment } from "./sandbox-env.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(process.env.COSGRAL_SANDBOX_ROOT ?? "");
assert(process.env.COSGRAL_SANDBOX_ROOT, "COSGRAL_SANDBOX_ROOT must point to an existing sandbox profile");
assert(!resolve(repo).startsWith(root + sep) && root !== resolve(repo), "The sandbox must not contain the repository");
const out = resolve(process.env.COSGRAL_PROBE_OUT ?? join(root, "window-probe"));
await mkdir(out, { recursive: true });

const PAGES: Array<[id: string, polishLabel: string]> = [
  ["agents", "Agenci"],
  ["schedule", "Harmonogram"],
  ["tasks", "Zadania"],
  ["workflows", "Przepływy"],
  ["usage", "Zużycie"],
  ["library", "Biblioteka"],
  ["marketplace", "Katalog dodatków"],
  ["remote-desktop", "Zdalny pulpit"],
  ["providers", "Dostawcy"],
  ["phone", "Telefon"],
  ["server-settings", "Ustawienia serwera"],
];

/** English keys whose Polish text differs: seeing one on a Polish screen means it skipped the dictionary. */
async function englishKeys(): Promise<string[]> {
  const source = await readFile(join(repo, "src/renderer/src/locales/pl.ts"), "utf8");
  const keys: string[] = [];
  for (const m of source.matchAll(/^ {2}(?:"((?:[^"\\]|\\.)*)"|([A-Za-z]\w*)):\s*"((?:[^"\\]|\\.)*)",$/gm)) {
    const key = m[1] ?? m[2];
    if (key && key !== m[3] && key.length >= 4 && /[a-z]/.test(key) && !key.includes("{")) keys.push(key);
  }
  return keys;
}

const home = join(root, "home");
const electronExe = join(repo, "node_modules", "electron", "dist", "electron.exe");
const app = await electron.launch({
  executablePath: electronExe,
  args: [repo],
  cwd: repo,
  env: {
    ...cleanEnvironment(),
    USERPROFILE: home,
    HOME: home,
    APPDATA: join(home, "AppData", "Roaming"),
    LOCALAPPDATA: join(home, "AppData", "Local"),
    TEMP: join(root, "tmp"),
    TMP: join(root, "tmp"),
    OPENBOT_CODEX_PATH: join(root, "fixture", "codex.cmd"),
    OPENBOT_CLAUDE_PATH: join(root, "fixture", "missing-claude.exe"),
  },
  timeout: 90_000,
});

let page: Page = await app.firstWindow();
for (let i = 0; i < 20 && page.url().includes("#island"); i += 1) {
  page = app.windows().find((w) => !w.url().includes("#island")) ?? page;
  await page.waitForTimeout(500);
}
const consoleLines: string[] = [];
let screen = "start";
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") consoleLines.push(`[${screen}] ${m.type()}: ${m.text()}`);
});
page.on("pageerror", (e) => consoleLines.push(`[${screen}] pageerror: ${e.message}`));
await page.waitForLoadState("domcontentloaded");
// COSGRAL_PROBE_SIZE=960x640 checks a small window (default 1440x900).
const [probeWidth, probeHeight] = (process.env.COSGRAL_PROBE_SIZE ?? "1440x900").split("x").map(Number);
await page.setViewportSize({ width: probeWidth || 1440, height: probeHeight || 900 });
await page.waitForTimeout(4000);

// A string, like the other sandbox scripts: the Node typecheck does not know the window's `openbot`.
const setSettings = (input: Record<string, string>) =>
  page.evaluate(`window.openbot.appSettings.update(${JSON.stringify(input)})`);

const keys = await englishKeys();
const findings: string[] = [];

async function inspect(name: string): Promise<void> {
  const english = await page.evaluate((list) => {
    const set = new Set(list);
    const hits = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? "";
      if (!set.has(text)) continue;
      const el = node.parentElement;
      if (!el || el.closest(".sr-only, [aria-hidden='true'], .conversation-scroll, .message-shell")) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height && r.bottom > 0 && r.top < innerHeight) hits.add(`${text} <${el.className}>`);
    }
    return [...hits];
  }, keys);
  if (english.length) findings.push(`${name}: English on a Polish screen: ${english.join(" | ")}`);
  const layout = await page.evaluate(() => {
    const cut: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.closest(".sr-only, [aria-hidden='true'], svg, canvas, .conversation-scroll")) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8 || rect.bottom < 0 || rect.top > innerHeight) continue;
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent?.trim().length ?? 0) > 1);
      if (!ownText) continue;
      const clipsX = (cs.overflowX === "hidden" || cs.overflowX === "clip") && el.scrollWidth > el.clientWidth + 1;
      if (clipsX && cs.textOverflow !== "ellipsis")
        cut.push(
          `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}: "${el.textContent?.trim().slice(0, 60)}"`,
        );
    }
    // Spills: an element reaching past the right edge of the nearest ancestor that clips it (overflow hidden/clip, or
    // auto/scroll vertically only), unless that ancestor scrolls sideways on purpose. Only the outermost one per clipper.
    const spills: string[] = [];
    const reported = new Set<Element>();
    for (const el of document.querySelectorAll("body *")) {
      if (!(el instanceof HTMLElement) || el.closest(".sr-only, [aria-hidden='true'], svg")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 4 || rect.bottom < 0 || rect.top > innerHeight) continue;
      let clipper = el.parentElement;
      while (clipper && clipper !== document.body) {
        const cs = getComputedStyle(clipper);
        if (cs.overflowX !== "visible") break;
        clipper = clipper.parentElement;
      }
      if (!clipper || clipper === document.body) continue;
      const ccs = getComputedStyle(clipper);
      if ((ccs.overflowX === "auto" || ccs.overflowX === "scroll") && clipper.scrollWidth > clipper.clientWidth + 1)
        continue;
      const edge = clipper.getBoundingClientRect().right - (Number.parseFloat(ccs.borderRightWidth) || 0);
      if (rect.right > edge + 2 && !reported.has(clipper) && !el.closest("[data-spill-ok]")) {
        reported.add(clipper);
        spills.push(
          `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} by ${Math.round(rect.right - edge)}px in .${[...clipper.classList].join(".")}`,
        );
      }
    }
    return {
      cut: [...new Set(cut)].slice(0, 15),
      spills: spills.slice(0, 10),
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
  if (layout.cut.length) findings.push(`${name}: cut without an ellipsis:\n    ${layout.cut.join("\n    ")}`);
  if (layout.spills.length) findings.push(`${name}: reaches past its container:\n    ${layout.spills.join("\n    ")}`);
  if (layout.overflow) findings.push(`${name}: the page is wider than the window`);
}

async function shoot(name: string): Promise<void> {
  screen = name;
  await page.waitForTimeout(900);
  await inspect(`${name} (pl, dark)`);
  await page.screenshot({ path: join(out, `${name}-pl-dark.png`) });
  await setSettings({ theme: "light" });
  await page.waitForTimeout(700);
  await inspect(`${name} (pl, light)`);
  await page.screenshot({ path: join(out, `${name}-pl-light.png`) });
  await setSettings({ theme: "dark" });
  await page.waitForTimeout(400);
}

async function openPage(label: string): Promise<boolean> {
  await page.keyboard.press("Escape").catch(() => undefined);
  const nav = page.locator('nav[aria-label="Strony"]');
  const direct = nav.getByRole("button", { name: label, exact: true });
  if (await direct.count()) {
    await direct.first().click();
    return true;
  }
  const more = nav.getByRole("button", { name: /^Więcej/ });
  if (!(await more.count())) return false;
  await more.first().click();
  await page.waitForTimeout(300);
  const item = page.getByRole("menuitem", { name: label, exact: true });
  if (!(await item.count())) {
    await page.keyboard.press("Escape");
    return false;
  }
  await item.first().click();
  return true;
}

try {
  await setSettings({ language: "pl", theme: "dark" });
  await page.waitForTimeout(1500);

  for (const [id, label] of PAGES) {
    if (await openPage(label).catch(() => false)) await shoot(id);
    else findings.push(`${id}: no page rail entry named "${label}"`);
  }

  // The conversation of the first agent in the sidebar, its + popover and the @ picker.
  await openPage("Agenci");
  await page.waitForTimeout(600);
  // Agents are listed after the channels, so the last row is an agent.
  const agentRow = page.locator(".bot-row-copy");
  if (await agentRow.count())
    await agentRow
      .last()
      .click()
      .catch(() => undefined);
  await shoot("chat");
  const plus = page.getByRole("button", { name: "Dołącz plik" }).first();
  if (await plus.count()) {
    await plus.click().catch((e: Error) => findings.push(`plus: ${e.message}`));
    await page.waitForTimeout(700);
    screen = "plus-menu";
    if (
      !(await page
        .locator(".attachment-menu")
        .isVisible()
        .catch(() => false))
    )
      findings.push("plus-menu: the + popover is not visible after a click");
    await inspect("plus-menu (pl, dark)");
    await page.screenshot({ path: join(out, "plus-menu-pl-dark.png") });
    await page.keyboard.press("Escape");
  } else findings.push("plus-menu: no attach button (is an agent conversation open?)");
  const editor = page.locator("[contenteditable='true']").first();
  if (await editor.count()) {
    await editor.click();
    await page.keyboard.type("@");
    await page.waitForTimeout(800);
    screen = "mention";
    if (
      !(await page
        .locator(".mention-picker")
        .isVisible()
        .catch(() => false))
    )
      findings.push("mention: the @ picker is not visible after typing @");
    await inspect("mention (pl, dark)");
    await page.screenshot({ path: join(out, "mention-pl-dark.png") });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Backspace");
  }

  // Settings: every section of the Settings window.
  const gear = page.locator('nav[aria-label="Strony"]').getByRole("button", { name: "Ustawienia", exact: true });
  if (await gear.count()) {
    await gear.first().click();
    await page.waitForTimeout(1500);
    const sections = await page.evaluate(() =>
      [...document.querySelectorAll(".settings-dialog-section[data-anchor]")].map(
        (el) => el.getAttribute("data-anchor") ?? "",
      ),
    );
    for (const id of sections.filter(Boolean)) {
      await page.evaluate(
        (target) =>
          document
            .querySelector(`.settings-dialog-section[data-anchor="${target}"]`)
            ?.scrollIntoView({ block: "start" }),
        id,
      );
      await shoot(`settings-${id}`);
    }
    await page.keyboard.press("Escape");
  } else findings.push("settings: no Settings button on the page rail");
} finally {
  const missing = [...new Set(consoleLines.filter((l) => l.includes("Missing UI translation")))];
  const other = [...new Set(consoleLines.filter((l) => !l.includes("Missing UI translation")))];
  const report = [
    `findings (${findings.length}):`,
    ...findings,
    "",
    `missing translations (${missing.length}):`,
    ...missing,
    "",
    `other console (${other.length}):`,
    ...other.slice(0, 60),
  ].join("\n");
  await writeFile(join(out, "report.txt"), `${report}\n`);
  console.log(report);
  await setSettings({ language: "en", theme: "system" }).catch(() => undefined);
  await app.close();
}
process.exitCode = 0;
