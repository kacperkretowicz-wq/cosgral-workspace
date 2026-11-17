// COSGRAL B1: writes what one screen of the program under inspection looks like into its own folder: the accessibility tree, the
// texts, the design system as groups of look (colours, fonts, spacing), the custom properties, the boxes of the regions, what could
// be clicked and what the probe was allowed to click, and a picture. Everything goes OUTSIDE the repository (see policy.ts).

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";
import {
  CLEAR_MARKS,
  COLLECT_LAYOUT,
  COLLECT_STYLES,
  COLLECT_TEXTS,
  COLLECT_TOKENS,
  HEADING,
  LIST_CANDIDATES,
} from "./page-scripts.ts";
import {
  type ClickCandidate,
  clickPriority,
  clickVerdict,
  groupStyles,
  type StyleSample,
  screenFolder,
  screenSignature,
} from "./policy.ts";

/** One clickable thing on the screen, with the probe's verdict. */
export interface Candidate extends ClickCandidate {
  id: string;
  inNav: boolean;
  checked: string | null;
  rect: { x: number; y: number; w: number; h: number };
}

/** The custom properties of the root, as the page reports them. */
export interface PageTokens {
  theme: string | null;
  colorScheme: string;
  tokens: Record<string, string>;
}

export interface PageState {
  url: string;
  aria: string;
  signature: string;
  heading: string;
}

export interface ScreenRecord {
  index: number;
  folder: string;
  url: string;
  heading: string;
  signature: string;
  capturedAt: string;
  /** How the probe got here: the click that led to it, or null for the first screen. */
  via: string | null;
  counts: { texts: number; styleGroups: number; tokens: number; candidates: number; clickable: number };
}

export async function readState(page: Page): Promise<PageState> {
  const aria = await page.locator("body").ariaSnapshot();
  const url = page.url();
  return { url, aria, signature: screenSignature(url, aria), heading: String(await page.evaluate(HEADING)) };
}

export async function listCandidates(page: Page): Promise<Candidate[]> {
  const found = await page.evaluate<Candidate[]>(LIST_CANDIDATES);
  return Array.isArray(found) ? found : [];
}

export async function clearMarks(page: Page): Promise<void> {
  await page.evaluate(CLEAR_MARKS);
}

/** The candidates the probe may click, in the order it tries them. */
export function clickable(candidates: readonly Candidate[]): Candidate[] {
  return candidates
    .filter((candidate) => clickVerdict(candidate).allowed)
    .sort((a, b) => clickPriority(a) - clickPriority(b) || a.rect.y - b.rect.y || a.rect.x - b.rect.x);
}

async function json(folder: string, name: string, value: unknown): Promise<void> {
  await writeFile(join(folder, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function captureScreen(
  page: Page,
  outRoot: string,
  index: number,
  state: PageState,
  via: string | null,
): Promise<ScreenRecord> {
  const folder = screenFolder(index, state.heading, via);
  const directory = join(outRoot, folder);
  await mkdir(directory, { recursive: true });

  const candidates = await listCandidates(page);
  await clearMarks(page);
  const texts = await page.evaluate<string[]>(COLLECT_TEXTS);
  const samples = await page.evaluate<StyleSample[]>(COLLECT_STYLES);
  const tokens = await page.evaluate<PageTokens>(COLLECT_TOKENS);
  const layout = await page.evaluate(COLLECT_LAYOUT);
  const groups = groupStyles(samples);

  await writeFile(join(directory, "aria.yml"), `${state.aria}\n`, "utf8");
  await page.screenshot({ path: join(directory, "screenshot.png") });
  await json(directory, "texts.json", texts);
  await json(directory, "styles.json", groups);
  await json(directory, "tokens.json", tokens);
  await json(directory, "layout.json", layout);
  await json(
    directory,
    "controls.json",
    candidates.map((candidate) => ({ ...candidate, verdict: clickVerdict(candidate) })),
  );

  const record: ScreenRecord = {
    index,
    folder,
    url: state.url,
    heading: state.heading,
    signature: state.signature,
    capturedAt: new Date().toISOString(),
    via,
    counts: {
      texts: texts.length,
      styleGroups: groups.length,
      tokens: Object.keys(tokens.tokens).length,
      candidates: candidates.length,
      clickable: clickable(candidates).length,
    },
  };
  await json(directory, "screen.json", record);
  return record;
}
