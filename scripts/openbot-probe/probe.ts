// COSGRAL B1: walks the screens of a running program through its debug port and writes what each one looks like, OUTSIDE the repo.
//
//   node scripts/openbot-probe/probe.ts --out <folder outside the repo> [--cdp http://127.0.0.1:9333] [--page index.html]
//        [--prefer-language English] [--max-screens 60] [--max-clicks 200] [--max-minutes 30] [--dry-run]
//
// Run it with Node (not Bun: Playwright's connection over the debug port does not answer under Bun). It reads the program like a
// person who has no account would: it opens screens by clicking what is allowed (policy.ts: never sign-in, payment, send, install,
// update, delete, share or anything that leaves the program), writes one folder per new screen, and stops at the budgets.
// It never types anything. The program it looks at must be a COPY started on its own data folder, with its own home folder:
// the probe is not meant for anybody's real data and does not look for it.

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright";
import {
  type Candidate,
  captureScreen,
  clearMarks,
  clickable,
  listCandidates,
  type PageState,
  readState,
  type ScreenRecord,
} from "./capture.ts";
import { clickVerdict, isInsideRepo } from "./policy.ts";

/** What the probe looks at: the installed reference program, or our own app (no account needed, so no stand-in sign-in). */
export type Target = "openbot" | "cosgral";

interface Options {
  target: Target;
  cdp: string;
  out: string;
  page: string;
  preferLanguage: string | null;
  maxScreens: number;
  maxClicks: number;
  maxMinutes: number;
  dryRun: boolean;
  /** Create one agent in the sandbox copy (a made-up description, the default choices): without an agent the chat screens do not exist. */
  createAgent: boolean;
  /** Sign in to the loopback stand-in account service (stub-account-service.ts) with its made-up person: never anything real. */
  stubLogin: boolean;
}

function parseArgs(argv: string[]): Options {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    if (!argument.startsWith("--")) continue;
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) flags.add(argument.slice(2));
    else {
      values.set(argument.slice(2), next);
      index += 1;
    }
  }
  const out = values.get("out");
  if (!out) throw new Error("--out <folder outside the repository> is required.");
  const number = (name: string, fallback: number) => {
    const given = values.get(name);
    return given === undefined ? fallback : Number(given);
  };
  return {
    target: values.get("target") === "cosgral" ? "cosgral" : "openbot",
    cdp: values.get("cdp") ?? "http://127.0.0.1:9333",
    out: resolve(out),
    page: values.get("page") ?? (values.get("target") === "cosgral" ? "" : "index.html"),
    preferLanguage: values.get("prefer-language") ?? null,
    maxScreens: number("max-screens", 60),
    maxClicks: number("max-clicks", 200),
    maxMinutes: number("max-minutes", 30),
    dryRun: flags.has("dry-run"),
    // Our own app needs no account: the stand-in sign-in is only for the reference program.
    stubLogin: flags.has("stub-login") && values.get("target") !== "cosgral",
    createAgent: flags.has("create-agent"),
  };
}

interface Edge {
  from: string;
  to: string;
  click: string;
}

const REPO_ROOT = resolve(import.meta.dirname ?? ".", "..", "..");
const SETTLE_MS = 700;
const MAX_EMPTY_POLLS = 40;
/** What the stand-in account service knows: a made-up person and the development code its sign-in screen shows. */
const STUB_EMAIL = "probe@example.invalid";
const STUB_CODE = "23456789";
const AGENT_TEXT = "A sandbox agent made by the probe";

function keyOf(candidate: Candidate): string {
  // Numbers are ignored: "Face 1" ... "Face 12" is one choice to try, not twelve.
  return `${candidate.role ?? candidate.tag}|${candidate.name.replace(/[0-9]+/g, "#")}`;
}

async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(SETTLE_MS);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (isInsideRepo(options.out, REPO_ROOT)) {
    throw new Error(
      `Refusing to write inside the repository (${REPO_ROOT}): what the probe reads is not ours to publish.`,
    );
  }
  const browser = await chromium.connectOverCDP(options.cdp);
  const context = browser.contexts()[0];
  if (!context) throw new Error("The program has no window to look at.");
  const pages = () => context.pages();
  console.log(
    `Connected to ${options.cdp}: ${pages()
      .map((page) => page.url())
      .join("  |  ")}`,
  );
  // Our own app has one main window and separate dock/island windows (addresses with #dock or #island): the main one is looked at.
  const page = pages().find(
    (candidate) => candidate.url().includes(options.page) && !/#(dock|island)/.test(candidate.url()),
  );
  if (!page) throw new Error(`No window whose address contains "${options.page}".`);
  if (options.dryRun) {
    const state = await readState(page);
    console.log(
      `Dry run: "${state.heading}" at ${state.url}; ${clickable(await listCandidates(page)).length} things may be clicked.`,
    );
    await clearMarks(page);
    await browser.close();
    return;
  }
  page.on("dialog", (dialog) => void dialog.dismiss().catch(() => undefined));
  await mkdir(options.out, { recursive: true });

  const started = Date.now();
  const screens = new Map<string, ScreenRecord>();
  const clicked = new Map<string, Set<string>>();
  const edges: Edge[] = [];
  const skipped = new Map<string, string>();
  const seenWindows = new Set<string>();
  const stopped: string[] = [];

  const remember = async (state: PageState, via: string | null): Promise<ScreenRecord> => {
    const existing = screens.get(state.signature);
    if (existing) return existing;
    const record = await captureScreen(page, options.out, screens.size + 1, state, via);
    screens.set(state.signature, record);
    console.log(
      `  + screen ${record.folder} (${record.counts.clickable} clickable, ${record.counts.styleGroups} style groups)`,
    );
    return record;
  };

  // The first screen, and the language the person asked for (a radio in a language picker is the one kind of choice the probe makes).
  let state = await readState(page);
  if (options.preferLanguage) {
    const wanted = options.preferLanguage;
    // The radios of a language wheel are not "visible" to the click rules; this one choice is made by name.
    await page
      .getByRole("radio", { name: wanted, exact: true })
      .click({ force: true, timeout: 3_000 })
      .catch(() => undefined);
    await settle(page);
    state = await readState(page);
  }
  let current = await remember(state, null);
  let clicks = 0;
  let stubLogins = 0;
  let emptyPolls = 0;
  let agentCreated = false;
  /** Navigation labels already tried anywhere: the same sidebar entry is not opened again from every screen. */
  const navTried = new Set<string>();

  while (
    clicks < options.maxClicks &&
    screens.size < options.maxScreens &&
    Date.now() - started < options.maxMinutes * 60_000
  ) {
    // The one thing the probe types: the stand-in's made-up e-mail and code (only with --stub-login, at most twice).
    if (options.stubLogin && stubLogins < 2) {
      const email = page.getByRole("textbox", { name: /e-?mail/i });
      if ((await email.count()) > 0) {
        stubLogins += 1;
        console.log("sign-in with the stand-in account service");
        await email.first().fill(STUB_EMAIL);
        await page
          .getByRole("button", { name: /code|kod/i })
          .first()
          .click({ timeout: 3_000 })
          .catch(() => undefined);
        await settle(page);
        await settle(page);
        await remember(await readState(page), "stub sign-in: the e-mail was sent");
        const codeBox = page.getByRole("textbox", { name: /code|kod/i });
        if ((await codeBox.count()) > 0) {
          await codeBox.first().focus();
          for (const character of STUB_CODE) {
            await page.keyboard.press(character);
            await page.waitForTimeout(150);
          }
          await page.waitForTimeout(4_000);
        }
        continue;
      }
    }
    // The other thing the probe types: one made-up description, once, to create a sandbox agent (only with --create-agent).
    if (options.createAgent && !agentCreated) {
      const create = page.getByRole("button", { name: /create agent|utwórz agenta/i });
      if ((await create.count()) > 0) {
        agentCreated = true;
        console.log("creating a sandbox agent");
        const description = page.locator("textarea").first();
        if ((await description.count()) > 0) await description.fill(AGENT_TEXT).catch(() => undefined);
        await create
          .first()
          .click({ timeout: 3_000 })
          .catch(() => undefined);
        await settle(page);
        await settle(page);
        await settle(page);
        await remember(await readState(page), "stub: a sandbox agent was created");
        continue;
      }
    }
    const here = await readState(page);
    const known = screens.get(here.signature);
    if (known) current = known;
    const done = clicked.get(here.signature) ?? new Set<string>();
    clicked.set(here.signature, done);
    const all = await listCandidates(page);
    for (const candidate of all) {
      const verdict = clickVerdict(candidate);
      if (!verdict.allowed && candidate.name)
        skipped.set(`${candidate.role ?? candidate.tag}: ${candidate.name.slice(0, 60)}`, verdict.reason);
    }
    const next = clickable(all).find(
      (candidate) => !done.has(keyOf(candidate)) && !(candidate.inNav && navTried.has(keyOf(candidate))),
    );
    if (!next) {
      await clearMarks(page);
      // A screen with nothing to click is usually a program that is still loading: wait for it (up to a minute) before giving up.
      if (emptyPolls < MAX_EMPTY_POLLS) {
        emptyPolls += 1;
        console.log(`  (nothing to click yet; waiting ${emptyPolls}/${MAX_EMPTY_POLLS})`);
        await page.waitForTimeout(3_000);
        continue;
      }
      emptyPolls = 0;
      // Nothing new to open here: try to step out (a dialog, a panel) and go on from wherever that leads.
      await page.keyboard.press("Escape");
      await settle(page);
      const after = await readState(page);
      if (after.signature === here.signature) {
        stopped.push(`Nothing more to open at "${here.heading || here.url}".`);
        break;
      }
      await remember(after, "Escape");
      continue;
    }
    done.add(keyOf(next));
    emptyPolls = 0;
    if (next.inNav) navTried.add(keyOf(next));
    clicks += 1;
    console.log(`click ${clicks}: ${next.role ?? next.tag} "${next.name.slice(0, 50)}"`);
    await page
      .locator(`[data-probe-id="${next.id}"]`)
      .click({ timeout: 1_500 })
      .catch((error: unknown) => {
        console.log(`  (could not click: ${String(error).split("\n")[0]})`);
      });
    await clearMarks(page).catch(() => undefined);
    await settle(page);
    const after = await readState(page);
    if (after.signature !== here.signature) {
      const isNew = !screens.has(after.signature);
      const record = await remember(after, `${next.role ?? next.tag} "${next.name}" on ${current.folder}`);
      if (isNew || record.folder !== current.folder)
        edges.push({ from: current.folder, to: record.folder, click: `${next.role ?? next.tag} "${next.name}"` });
    }
    // Windows the click opened are screens too (looked at once, never driven).
    for (const other of pages()) {
      if (other === page || seenWindows.has(other.url()) || other.url().includes("helper.html")) continue;
      seenWindows.add(other.url());
      console.log(`  (another window: ${other.url()})`);
    }
  }
  if (clicks >= options.maxClicks) stopped.push(`Click budget (${options.maxClicks}) reached.`);
  if (screens.size >= options.maxScreens) stopped.push(`Screen budget (${options.maxScreens}) reached.`);
  if (Date.now() - started >= options.maxMinutes * 60_000)
    stopped.push(`Time budget (${options.maxMinutes} min) reached.`);

  const index = {
    version: 1,
    createdAt: new Date().toISOString(),
    source: {
      target: options.target,
      cdp: options.cdp,
      browser: browser.version(),
      windows: pages().map((candidate) => candidate.url()),
    },
    budgets: { maxScreens: options.maxScreens, maxClicks: options.maxClicks, maxMinutes: options.maxMinutes },
    clicks,
    seconds: Math.round((Date.now() - started) / 1000),
    stopped,
    screens: [...screens.values()],
    edges,
    skipped: Object.fromEntries(skipped),
    otherWindows: [...seenWindows],
  };
  await writeFile(join(options.out, "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
  await writeFile(join(options.out, "index.md"), indexMarkdown(index), "utf8");
  console.log(`Done: ${screens.size} screens, ${clicks} clicks, ${index.seconds}s. ${stopped.join(" ")}`);
  await browser.close();
}

function indexMarkdown(index: {
  screens: ScreenRecord[];
  edges: Edge[];
  skipped: Record<string, string>;
  stopped: string[];
  createdAt: string;
}): string {
  const lines = [
    `# Screens (probe of ${index.createdAt})`,
    "",
    "| # | Folder | Heading | Reached by | Clickable | Style groups |",
    "|---|---|---|---|---|---|",
  ];
  for (const screen of index.screens) {
    lines.push(
      `| ${screen.index} | ${screen.folder} | ${screen.heading.replace(/\|/g, "/")} | ${(screen.via ?? "start").replace(/\|/g, "/")} | ${screen.counts.clickable} | ${screen.counts.styleGroups} |`,
    );
  }
  lines.push("", "## Not clicked (the probe's rules)", "");
  for (const [name, reason] of Object.entries(index.skipped)) lines.push(`- ${name}: ${reason}`);
  lines.push(
    "",
    "## Stopped",
    "",
    ...(index.stopped.length ? index.stopped.map((text) => `- ${text}`) : ["- (ran to the end)"]),
    "",
  );
  return lines.join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
