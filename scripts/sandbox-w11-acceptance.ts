// COSGRAL W12 / Tester T-D: window acceptance for W11 features (thread tabs, sidebar search, "/", @, side question,
// agentCards, Vault connectors, Marketplace Apps). Prepared for the leader's GO — do not run without GO-*.txt.
//
// Invoked only through scripts/sandbox-acceptance.ts when COSGRAL_MODE=w11.
// Launch always uses --lang=en-US and cleanEnvironment() (scripts/sandbox-env.ts): Polish Windows must not flip labels,
// and CLAUDE_*/OPENBOT_*/token variables must not leak into the sandbox profile.
//
//   COSGRAL_MODE=w11 COSGRAL_SANDBOX_ROOT=<sandbox> node scripts/sandbox-acceptance.ts
//
// Evidence stays under the sandbox folder (never the repository).

import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type DynamicRecord, isBoolean, isDynamicRecord, isOneOf, isString } from "@openbot/contracts/runtime-values";
import type { ElectronApplication, Page } from "playwright";

export interface W11Driver {
  page: Page;
  app?: ElectronApplication;
  ev(expression: string): Promise<unknown>;
  botId(name: string): Promise<string>;
  openAgent(name: string): Promise<void>;
  dump(name: string): Promise<void>;
}

export type W11Row = (id: string, name: string, work: () => Promise<string | undefined>) => Promise<void>;

export type W11Launch = (
  root: string,
  fixture: { codex: string; claude: string },
) => Promise<{ app: ElectronApplication; page: Page }>;

export type W11InstallFixture = (root: string) => Promise<{ codex: string; claude: string }>;

export interface W11Context {
  root: string;
  evidence: string;
  installFixture: W11InstallFixture;
  launch: W11Launch;
  createDriver: (page: Page, evidence: string, app: ElectronApplication) => W11Driver;
  row: W11Row;
  results: Array<{ row: string; name: string; ok: boolean; detail: string; ms: number }>;
  consoleFindings: string[];
  setResultsFile: (path: string) => void;
}

function asRecord(value: unknown): DynamicRecord {
  return isDynamicRecord(value) ? value : {};
}

function list(value: unknown): DynamicRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

const AGENT_CARD_IDS = [
  "chat-color",
  "instructions",
  "memory",
  "skills",
  "files",
  "tables",
  "routines",
  "usage",
  "publish",
  "permissions",
  "advanced",
  "folders",
  "notifications",
  "backup-models",
] as const;

const SEARCH_KINDS = ["agents", "channels", "messages", "files", "routines"] as const;
const SEARCH_TAB_LABELS = ["All", "Agents", "Projects", "Messages", "Files", "Routines"] as const;
const VAULT_CONNECTORS = ["onepassword", "bitwarden", "protonpass"] as const;
const MENTION_KINDS = ["agent", "channel", "file"] as const;
const PLUGIN_SOURCES = ["none", "folder", "demo"] as const;

/** First-run + English labels (PC language may be Polish). */
async function completeFirstRun(d: W11Driver, page: Page): Promise<string> {
  const where = page.getByRole("dialog", { name: "Where will COSGRAL Workspace run?" });
  await where.waitFor({ timeout: 90_000 });
  await where.getByRole("button", { name: /Use this computer/ }).click();
  const setup = page.getByRole("dialog", { name: "Set up this computer" });
  await setup.waitFor({ timeout: 30_000 });
  await setup.getByRole("combobox", { name: "First agent" }).selectOption({ index: 1 });
  await setup.getByRole("button", { name: "Continue with Codex" }).click();
  await page
    .getByRole("button", { name: /^Assistant, / })
    .first()
    .waitFor({ timeout: 60_000 });
  await d.openAgent("Assistant");
  await page
    .getByRole("button", { name: "Onboarding model: Luna" })
    .click({ timeout: 10_000 })
    .catch(() => undefined);
  await page
    .getByRole("option", { name: /^Luna/ })
    .click({ timeout: 5_000 })
    .catch(() => undefined);
  return "first run done; Assistant open; --lang=en-US";
}

export async function w11Main(ctx: W11Context): Promise<void> {
  const outFile = join(ctx.evidence, "acceptance-w11.json");
  ctx.setResultsFile(outFile);

  const fixture = await ctx.installFixture(ctx.root);
  const { app, page } = await ctx.launch(ctx.root, fixture);
  const d = ctx.createDriver(page, ctx.evidence, app);

  try {
    await ctx.row("W11-0", "W11 setup: first run, Assistant open (en-US, clean env)", async () =>
      completeFirstRun(d, page),
    );

    await ctx.row("W11-1", "thread tabs: window.openbot.threadTabs.get + strip in the chat", async () => {
      const botId = await d.botId("Assistant");
      assert(botId, "Assistant has an id");
      const tabs = asRecord(await d.ev(`window.openbot.threadTabs.get({ botId: ${JSON.stringify(botId)} })`));
      assert(Array.isArray(tabs.open), "threadTabs.get returns open[]");
      assert(isString(tabs.activeThreadId) || tabs.activeThreadId === null, "activeThreadId");
      const strip = page.locator(".thread-tabs, nav[aria-label='Threads']").first();
      const stripVisible = await strip.isVisible().catch(() => false);
      return `open=${list(tabs.open).length}; active=${String(tabs.activeThreadId)}; stripVisible=${stripVisible}`;
    });

    await ctx.row(
      "W11-2",
      "sidebar search: window.openbot.search + tabs All/Agents/Channels/Messages/Files/Routines",
      async () => {
        const all = asRecord(await d.ev(`window.openbot.search.query({ q: "a", limit: 5 })`));
        assert(isString(all.q), "search returns q");
        assert(Array.isArray(all.hits), "search returns hits[]");
        assert(isBoolean(all.truncated), "search returns truncated");
        for (const kind of SEARCH_KINDS) {
          const one = asRecord(
            await d.ev(`window.openbot.search.query({ q: "a", kinds: ${JSON.stringify([kind])}, limit: 3 })`),
          );
          const hits = list(one.hits);
          assert(
            hits.every((hit) => hit.kind === kind),
            `kind filter ${kind}`,
          );
        }
        // UI tabs (labels are English because of --lang=en-US). Ctrl/Cmd+K opens GlobalSearch.
        await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
        const missing: string[] = [];
        for (const label of SEARCH_TAB_LABELS) {
          const tab = page.getByRole("tab", { name: label });
          if (!(await tab.isVisible({ timeout: 3_000 }).catch(() => false))) missing.push(label);
        }
        await page.keyboard.press("Escape").catch(() => undefined);
        return `hits=${list(all.hits).length}; truncated=${String(all.truncated)}; ui tabs missing=[${missing.join(",")}]`;
      },
    );

    await ctx.row("W11-3", "slash commands: composer.listSlashCommands + leading / in the box", async () => {
      const botId = await d.botId("Assistant");
      const commands = list(
        await d.ev(`window.openbot.composer.listSlashCommands({ botId: ${JSON.stringify(botId)} })`),
      );
      assert(commands.length >= 3, "at least the program commands");
      const names = commands.map((command) => String(command.name));
      for (const need of ["compact", "new-thread", "side"]) {
        assert(names.includes(need), `program command /${need}`);
      }
      const box = page.getByRole("textbox", { name: /Message/i }).first();
      await box.click({ timeout: 10_000 });
      await box.fill("/");
      const listbox = page.getByRole("listbox").first();
      const listVisible = await listbox.isVisible({ timeout: 3_000 }).catch(() => false);
      await box.fill("");
      return `commands=${names.join(",")}; slash listbox=${listVisible}`;
    });

    await ctx.row("W11-4", "mentions @: composer.searchMentions (UI when wired to the contract)", async () => {
      const botId = await d.botId("Assistant");
      const mentions = list(
        await d.ev(`window.openbot.composer.searchMentions({ botId: ${JSON.stringify(botId)}, q: "", limit: 10 })`),
      );
      assert(Array.isArray(mentions), "searchMentions returns an array");
      for (const mention of mentions) {
        assert(isOneOf(MENTION_KINDS, mention.kind), `kind ${String(mention.kind)}`);
        assert(isString(mention.id) && mention.id.length > 0, "mention id");
        assert(isString(mention.label), "mention label");
      }
      // Soft UI probe: typing @ may open a local-bots picker until UI calls searchMentions.
      const box = page.getByRole("textbox", { name: /Message/i }).first();
      await box.click({ timeout: 10_000 });
      await box.fill("@");
      const listVisible = await page
        .getByRole("listbox")
        .first()
        .isVisible({ timeout: 2_000 })
        .catch(() => false);
      await box.fill("");
      return `apiMentions=${mentions.length}; uiListbox=${listVisible} (UI may still use local bots until searchMentions)`;
    });

    await ctx.row(
      "W11-5",
      "side question: askSideQuestion returns failed + 'not connected' until the Backend executor",
      async () => {
        const botId = await d.botId("Assistant");
        const state = asRecord(
          await d.ev(
            `window.openbot.composer.askSideQuestion({ botId: ${JSON.stringify(botId)}, text: "What is the budget?" })`,
          ),
        );
        assert(state.status === "failed", `expected failed, got ${String(state.status)}`);
        const error = isString(state.error) ? state.error : "";
        assert(/not connected/i.test(error), `error should mention not connected, got: ${error.slice(0, 120)}`);
        return `status=failed; error=${error.slice(0, 80)}`;
      },
    );

    await ctx.row("W11-6", "agentCards: overview 14 cards in order + getPreferences", async () => {
      const botId = await d.botId("Assistant");
      const overview = asRecord(await d.ev(`window.openbot.agentCards.overview({ botId: ${JSON.stringify(botId)} })`));
      assert(overview.botId === botId, "overview.botId");
      const cards = list(overview.cards);
      assert(cards.length === 14, `expected 14 cards, got ${cards.length}`);
      for (let index = 0; index < AGENT_CARD_IDS.length; index += 1) {
        assert(cards[index]?.id === AGENT_CARD_IDS[index], `card ${index} is ${AGENT_CARD_IDS[index]}`);
        assert(isBoolean(cards[index]?.available), "available");
        assert(isString(cards[index]?.summary), "summary");
      }
      const prefs = asRecord(
        await d.ev(`window.openbot.agentCards.getPreferences({ botId: ${JSON.stringify(botId)} })`),
      );
      assert(prefs.botId === botId, "preferences.botId");
      assert(isString(prefs.chatColor), "chatColor");
      assert(isString(prefs.busyMessage), "busyMessage");
      assert(isBoolean(prefs.steerSupported), "steerSupported");
      const publish = cards.find((card) => card.id === "publish");
      return `cards=14; publish.available=${String(publish?.available)}; busyMessage=${String(prefs.busyMessage)}`;
    });

    await ctx.row("W11-7", "Vault connectors (mock/engine): vaultConnectors.list has 3 connectors", async () => {
      const listed = asRecord(await d.ev("window.openbot.vaultConnectors.list()"));
      const connectors = list(listed.connectors);
      assert(connectors.length === 3, `expected 3 connectors, got ${connectors.length}`);
      const ids = connectors.map((connector) => String(connector.connector));
      for (const need of VAULT_CONNECTORS) {
        assert(ids.includes(need), `missing connector ${need}`);
      }
      for (const connector of connectors) {
        assert(isString(connector.state), "state");
        assert(Array.isArray(connector.methods), "methods");
        // Secrets and tokens must never appear in the status object.
        const blob = JSON.stringify(connector);
        assert(!/op_[A-Za-z0-9]{20,}/.test(blob), "no op_ token in status");
        assert(!/"password"\s*:\s*"[^"]+"/.test(blob), "no password field value in status");
      }
      return `connectors=${ids.join(",")}; states=${connectors.map((connector) => connector.state).join(",")}`;
    });

    await ctx.row("W11-8", "Marketplace Apps (mock/engine): pluginCatalog.info + list", async () => {
      const info = asRecord(await d.ev("window.openbot.pluginCatalog.info()"));
      assert(isOneOf(PLUGIN_SOURCES, info.source), `source ${String(info.source)}`);
      const listed = asRecord(await d.ev("window.openbot.pluginCatalog.list({})"));
      assert(Array.isArray(listed.plugins), "list has plugins[]");
      const items = list(listed.plugins);
      const nested = asRecord(listed.info);
      return `source=${String(info.source)}; plugins=${items.length}; total=${String(listed.total)}; info.skipped=${String(nested.skipped ?? info.skipped ?? "n/a")}`;
    });
  } finally {
    await app.close().catch(() => undefined);
  }

  await writeFile(
    outFile,
    JSON.stringify({ results: ctx.results, console: ctx.consoleFindings.slice(0, 40) }, null, 2),
  );
  const failed = ctx.results.filter((result) => !result.ok);
  console.log(
    `\n${ctx.results.length - failed.length}/${ctx.results.length} W11 steps ok; console errors: ${ctx.consoleFindings.length}`,
  );
  for (const result of failed) console.log(`  FAIL [${result.row}] ${result.name}: ${result.detail.slice(0, 300)}`);
  process.exit(failed.length ? 1 : 0);
}
