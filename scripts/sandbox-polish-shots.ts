// COSGRAL W3-BE9: screenshots of every screen of the running program (real Electron, sandbox profile, Codex fixture),
// in the dark app theme and in the light preview theme, to check the look by eye. It is not a test: it only clicks
// through first run, one chat turn, every page of the page rail and the Settings dialog.
//
//   COSGRAL_SANDBOX_ROOT=<folder> node scripts/sandbox-polish-shots.ts [--keep] [--out=<subfolder>]
//
// Same sandbox rules as sandbox-e2e.ts: own USERPROFILE, APPDATA, LOCALAPPDATA and TEMP; run `bun run build` first.
// Screenshots show the sandbox account name, so keep the sandbox outside the repository.

import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { type ElectronApplication, _electron as electron, type Page } from "playwright";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const findings: string[] = [];

/** The light preview tokens of `src/renderer/stories/theme-frame.tsx` (the app itself ships the dark theme only). */
const LIGHT_TOKENS: Record<string, string> = {
  "color-scheme": "light",
  "--openbot-bg-canvas": "#f6f6f8",
  "--openbot-bg-sidebar": "#ececf0",
  "--openbot-bg-surface": "#ffffff",
  "--openbot-bg-surface-raised": "#ffffff",
  "--openbot-bg-control": "#f1f1f5",
  "--openbot-bg-control-hover": "#e4e4ea",
  "--openbot-bg-control-active": "#d9d9e2",
  "--openbot-main": "#f6f6f8",
  "--openbot-main-deep": "#f6f6f8",
  "--openbot-border": "rgba(20, 20, 30, 0.1)",
  "--openbot-border-strong": "rgba(20, 20, 30, 0.18)",
  "--openbot-hover": "rgba(20, 20, 30, 0.06)",
  "--openbot-text-primary": "#14141c",
  "--openbot-white": "#14141c",
  "--openbot-text-secondary": "rgba(20, 20, 28, 0.78)",
  "--openbot-text-muted": "rgba(20, 20, 28, 0.66)",
  "--openbot-text-readable": "rgba(20, 20, 28, 0.66)",
  "--openbot-text-dim": "rgba(20, 20, 28, 0.5)",
  "--openbot-accent": "#4d44d6",
  "--openbot-accent-text": "#4038c4",
  "--openbot-accent-soft": "rgba(77, 68, 214, 0.12)",
  "--openbot-warning": "#9a6b12",
  "--openbot-warning-soft": "rgba(154, 107, 18, 0.14)",
  "--openbot-danger": "#b3261e",
  "--openbot-danger-soft": "rgba(179, 38, 30, 0.1)",
  "--openbot-danger-strong": "#8f1c16",
  "--openbot-success": "#1d7a3f",
  "--openbot-shadow-popover-ambient": "rgba(20, 20, 30, 0.12)",
};
const LIGHT_CSS = `:root { ${Object.entries(LIGHT_TOKENS)
  .map(([name, value]) => `${name}: ${value} !important`)
  .join("; ")} }`;

const PAGES = [
  "Agents",
  "Schedule",
  "Tasks",
  "Workflows",
  "Usage",
  "Library",
  "Marketplace",
  "Remote desktop",
  "Providers",
  "Phone",
];

function sandboxRoot(): string {
  const root = process.env.COSGRAL_SANDBOX_ROOT ? resolve(process.env.COSGRAL_SANDBOX_ROOT) : "";
  assert(root, "COSGRAL_SANDBOX_ROOT must point to a folder for the sandbox profile");
  assert(
    !resolve(repo).startsWith(root + sep) && root !== resolve(repo),
    "The sandbox must not contain the repository",
  );
  return root;
}

async function launch(root: string): Promise<{ app: ElectronApplication; page: Page }> {
  const home = join(root, "home");
  const folder = join(root, "fixture");
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "codex.cjs"), await readFile(join(repo, "src/backend/testing/channel-codex.cjs")));
  const electronExe = join(repo, "node_modules", "electron", "dist", "electron.exe");
  const codex = join(folder, "codex.cmd");
  await writeFile(codex, `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${electronExe}" "%~dp0codex.cjs" %*\r\n`);
  const app = await electron.launch({
    executablePath: electronExe,
    args: [repo],
    cwd: repo,
    env: {
      ...process.env,
      USERPROFILE: home,
      HOME: home,
      APPDATA: join(home, "AppData", "Roaming"),
      LOCALAPPDATA: join(home, "AppData", "Local"),
      TEMP: join(root, "tmp"),
      TMP: join(root, "tmp"),
      OPENBOT_CODEX_PATH: codex,
      OPENBOT_CLAUDE_PATH: join(folder, "missing-claude.exe"),
    },
    timeout: 60_000,
  });
  const page = await app.firstWindow();
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      findings.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => findings.push(`pageerror: ${error.message}`));
  await page.waitForLoadState("domcontentloaded");
  await page.setViewportSize({ width: 1280, height: 800 });
  return { app, page };
}

/** Dark screenshot, then the same screen with the light preview tokens. */
async function both(page: Page, out: string, name: string): Promise<void> {
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, `${name}-dark.png`) });
  const style = await page.addStyleTag({ content: LIGHT_CSS });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(out, `${name}-light.png`) });
  await style.evaluate((node) => node.parentNode?.removeChild(node));
}

/** Screenshots of a scrolling element from top to bottom (at most 4 views). */
async function scrolled(page: Page, out: string, name: string, selector: string): Promise<void> {
  const box = page.locator(selector).first();
  const heights = await box.evaluate((node) => ({ scroll: node.scrollHeight, view: node.clientHeight }));
  const views = Math.min(4, Math.max(1, Math.ceil(heights.scroll / Math.max(1, heights.view))));
  for (let index = 0; index < views; index += 1) {
    await box.evaluate((node, top) => node.scrollTo({ top }), index * heights.view);
    await both(page, out, `${name}-${index + 1}`);
  }
  await box.evaluate((node) => node.scrollTo({ top: 0 }));
}

async function firstRun(page: Page, out: string): Promise<string[]> {
  const seen: string[] = [];
  const pages = page.getByRole("navigation", { name: "Pages" });
  for (let round = 0; round < 60; round += 1) {
    if (await pages.count()) return seen;
    const dialog = page.getByRole("dialog").first();
    if (await dialog.count()) {
      const name =
        (await dialog.getAttribute("aria-label")) ?? (await dialog.locator("h1").first().textContent()) ?? "";
      if (!seen.includes(name)) {
        seen.push(name);
        await both(page, out, `00-first-run-${seen.length}`);
      }
      const where = page.getByRole("button", { name: /Use this computer/ });
      const finish = page.getByRole("button", { name: /^(Continue with Codex|Finish setup)$/ });
      // The provider check takes a moment; click only enabled buttons and look again on the next round.
      if ((await where.count()) && (await where.isEnabled())) await where.click();
      else if ((await finish.count()) && (await finish.first().isEnabled())) await finish.first().click();
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`The main window did not appear (saw: ${seen.join(", ")})`);
}

async function main(): Promise<void> {
  const root = sandboxRoot();
  const outArg = process.argv.find((arg) => arg.startsWith("--out="))?.slice(6) ?? "shots";
  const out = join(root, outArg);
  if (!process.argv.includes("--keep")) await rm(join(root, "home"), { recursive: true, force: true });
  await rm(out, { recursive: true, force: true });
  for (const folder of [
    join(root, "home", "AppData", "Roaming"),
    join(root, "home", "AppData", "Local"),
    join(root, "tmp"),
    out,
  ])
    await mkdir(folder, { recursive: true });
  const { app, page } = await launch(root);
  try {
    console.log(`first run: ${(await firstRun(page, out)).join(" -> ") || "(none)"}`);
    const list = page.getByRole("region", { name: "Agents" });
    if (!(await list.getByRole("button", { name: /^New agent/ }).count())) {
      await page.getByRole("button", { name: "New agent" }).click();
      await page.getByRole("option", { name: "Create new agent" }).click();
      await list.getByRole("button", { name: /^New agent/ }).waitFor({ timeout: 15_000 });
    } else {
      await list
        .getByRole("button", { name: /^New agent/ })
        .first()
        .click();
    }
    const box = page.getByRole("textbox", { name: "Message New agent" });
    await box.waitFor({ timeout: 30_000 });
    await box.fill("Hello from the polish run", { timeout: 90_000 }); // the agent CLI may still be connecting
    await page.getByRole("button", { name: "Send message" }).click({ timeout: 90_000 });
    await page.getByText("Stub: received").first().waitFor({ timeout: 45_000 });
    await both(page, out, "01-chat");
    // Voice on (sandbox only), so "Read aloud" shows; message actions appear on hover like in normal use.
    await page.evaluate("window.openbot.voice?.updateSettings({ enabled: true })").catch(() => undefined);
    await page.waitForTimeout(800);
    await page.getByText("Stub: received").last().hover();
    await both(page, out, "01-chat-hover");
    // A channel with only its lead and one message: the task should go queued -> running -> done (W3-BE10).
    const states = await page.evaluate(`(async () => {
      const api = window.openbot.channels;
      if (!api) return { skipped: "no channels API" };
      const bot = (await window.openbot.agent.listBots()).find((item) => item.name === "New agent");
      if (!bot) return { skipped: "no agent" };
      const name = "solo-" + Date.now().toString(36);
      const channel = await api.create({ name, title: "Solo", instructions: "", memberBotIds: [bot.id], leadBotId: bot.id, isolated: false });
      const seen = [];
      const off = window.openbot.agent.onEvent((event) => {
        if (event.type === "task-changed" && event.task.channelId === channel.id) seen.push(event.task.state);
      });
      const sent = await api.sendMessage({ channelId: channel.id, text: "Check the polish run" });
      seen.unshift(sent.task.state);
      for (let i = 0; i < 60 && !["done", "failed", "cancelled"].includes(seen[seen.length - 1]); i += 1)
        await new Promise((resolve) => setTimeout(resolve, 250));
      off();
      const messages = await api.listMessages({ channelId: channel.id });
      return { states: seen, last: (await api.listTasks(channel.id))[0]?.state, result: messages.filter((m) => m.kind === "result").map((m) => m.text) };
    })()`);
    console.log(`solo channel: ${JSON.stringify(states)}`);
    await writeFile(join(out, "channel-states.json"), `${JSON.stringify(states, null, 2)}
`);
    const rail = page.getByRole("navigation", { name: "Pages" });
    for (const [index, name] of PAGES.entries()) {
      await rail.getByRole("button", { name, exact: true }).click();
      await page.waitForTimeout(1200);
      const slug = `${String(index + 2).padStart(2, "0")}-${name.toLowerCase().replace(/\s+/g, "-")}`;
      const main = page.locator("main.w2-library, section.coming-soon").first();
      if ((await main.count()) && name !== "Agents")
        await scrolled(page, out, slug, "main.w2-library, section.coming-soon");
      else await both(page, out, slug);
    }
    await rail.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("dialog").first().waitFor({ timeout: 10_000 });
    await page
      .getByRole("region", { name: "Voice settings" })
      .waitFor({ timeout: 15_000 })
      .catch(() => undefined);
    await scrolled(page, out, "20-settings", ".initial-setup-screen");
  } finally {
    await writeFile(join(out, "console.txt"), `${findings.join("\n")}\n`);
    console.log(`console findings: ${findings.length}`);
    await app.close().catch(() => undefined);
  }
}

await main();
