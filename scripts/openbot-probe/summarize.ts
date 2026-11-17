// COSGRAL B1: turns the folders the probe wrote into two short documents for the people who design from them: which design tokens
// (custom properties) the program defines, and which sizes, weights, radii, colours and spacings its screens really use, counted over
// every element of every screen. Reads and writes only the folder it is given (outside the repo; see policy.ts).
//
//   node scripts/openbot-probe/summarize.ts --in <folder with the probe's results>

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import type { StyleGroup } from "./policy.ts";

/** The properties worth a table, with the heading each gets. */
export const SUMMARY_PROPERTIES: ReadonlyArray<readonly [string, string]> = [
  ["fontSize", "Font sizes"],
  ["fontWeight", "Font weights"],
  ["lineHeight", "Line heights"],
  ["letterSpacing", "Letter spacing"],
  ["borderRadius", "Corner radii"],
  ["color", "Text colours"],
  ["backgroundColor", "Background colours"],
  ["borderTopColor", "Border colours (where a border exists)"],
  ["paddingTop", "Padding top"],
  ["paddingLeft", "Padding left"],
  ["gap", "Gaps"],
  ["boxShadow", "Shadows"],
  ["transitionDuration", "Transition durations"],
  ["opacity", "Opacities"],
];

export type Tally = Map<string, number>;

/** Counts, for each property, how many elements have each value (a group counts as its `count` elements). */
export function tallyStyles(groups: readonly StyleGroup[], into: Map<string, Tally> = new Map()): Map<string, Tally> {
  for (const group of groups) {
    for (const [property] of SUMMARY_PROPERTIES) {
      const value = group.look[property];
      if (
        value === undefined ||
        value === "" ||
        value === "normal" ||
        value === "none" ||
        value === "0px" ||
        value === "rgba(0, 0, 0, 0)"
      )
        continue;
      const tally = into.get(property) ?? new Map<string, number>();
      tally.set(value, (tally.get(value) ?? 0) + group.count);
      into.set(property, tally);
    }
  }
  return into;
}

/** The first font in a `font-family` list, without quotes. */
export function firstFont(family: string): string {
  return (family.split(",")[0] ?? "").replace(/["']/g, "").trim();
}

export function markdownTables(tallies: Map<string, Tally>, top = 14): string {
  const lines: string[] = [];
  for (const [property, heading] of SUMMARY_PROPERTIES) {
    const tally = tallies.get(property);
    if (!tally) continue;
    const rows = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
    lines.push(`## ${heading}`, "", "| Value | Elements |", "|---|---:|");
    for (const [value, count] of rows) lines.push(`| \`${value.replace(/\|/g, "/")}\` | ${count} |`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Groups `--name: value` tokens by their prefix up to the second dash ("--openbot-bg-…" → "--openbot-bg"). */
export function groupTokens(tokens: Record<string, string>): Map<string, Array<[string, string]>> {
  const groups = new Map<string, Array<[string, string]>>();
  for (const [name, value] of Object.entries(tokens).sort(([a], [b]) => a.localeCompare(b))) {
    const parts = name.split("-").filter(Boolean);
    const key = `--${parts.slice(0, name.startsWith("--openbot-") ? 2 : 1).join("-")}`;
    const list = groups.get(key) ?? [];
    list.push([name, value.replace(/\s+/g, " ")]);
    groups.set(key, list);
  }
  return groups;
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "null";
  }
}

/** A styles.json of the probe: groups of look with a count. Anything that does not fit is left out. */
export function parseStyleGroups(value: unknown): StyleGroup[] {
  if (!Array.isArray(value)) return [];
  const groups: StyleGroup[] = [];
  for (const entry of value) {
    if (!isDynamicRecord(entry) || !isString(entry.kind) || !isNumber(entry.count) || !isDynamicRecord(entry.look))
      continue;
    const look: Record<string, string> = {};
    for (const [name, text] of Object.entries(entry.look)) if (isString(text)) look[name] = text;
    const examples = Array.isArray(entry.examples) ? entry.examples.filter(isString) : [];
    groups.push({ kind: entry.kind, count: entry.count, look, examples });
  }
  return groups;
}

/** A tokens.json of the probe: the custom properties and their values. */
export function parseTokens(value: unknown): Record<string, string> {
  const tokens: Record<string, string> = {};
  if (!isDynamicRecord(value) || !isDynamicRecord(value.tokens)) return tokens;
  for (const [name, text] of Object.entries(value.tokens)) if (isString(text)) tokens[name] = text;
  return tokens;
}

async function screenFolders(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const path = join(root, entry.name);
    const inner: string[] = await readdir(path).catch(() => []);
    if (inner.includes("styles.json")) found.push(path);
    else found.push(...(await screenFolders(path)));
  }
  return found;
}

async function main(): Promise<void> {
  const index = process.argv.indexOf("--in");
  const root = resolve(index >= 0 ? (process.argv[index + 1] ?? "") : "");
  if (!root || root === resolve("")) throw new Error("--in <folder with the probe's results> is required.");
  const folders = await screenFolders(root);
  const tallies = new Map<string, Tally>();
  const tokens: Record<string, string> = {};
  const fonts: Tally = new Map();
  let elements = 0;
  for (const folder of folders) {
    const groups = parseStyleGroups(JSON.parse(await readText(join(folder, "styles.json"))));
    tallyStyles(groups, tallies);
    for (const group of groups) {
      elements += group.count;
      const family = firstFont(group.look.fontFamily ?? "");
      if (family) fonts.set(family, (fonts.get(family) ?? 0) + group.count);
    }
    Object.assign(tokens, parseTokens(JSON.parse(await readText(join(folder, "tokens.json")))));
  }
  const fontRows = [...fonts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([family, count]) => `| ${family} | ${count} |`);
  const design = [
    "# What the screens really use",
    "",
    `Counted over ${folders.length} screens and ${elements} elements (a screen counts every visible element that has text, a border or a background of its own).`,
    "",
    "## Font families (first of the list)",
    "",
    "| Family | Elements |",
    "|---|---:|",
    ...fontRows,
    "",
    markdownTables(tallies),
  ].join("\n");
  await writeFile(join(root, "DESIGN-SUMMARY.md"), `${design}\n`, "utf8");

  const groups = groupTokens(tokens);
  const tokenLines = [
    "# Design tokens (custom properties of the root)",
    "",
    `${Object.keys(tokens).length} tokens, from the style sheets of the screens. Empty values are tokens set per element or per mode.`,
    "",
  ];
  for (const [group, list] of groups) {
    tokenLines.push(`## ${group}`, "", "| Token | Value |", "|---|---|");
    for (const [name, value] of list) tokenLines.push(`| \`${name}\` | \`${value.replace(/\|/g, "/") || " "}\` |`);
    tokenLines.push("");
  }
  await writeFile(join(root, "TOKENS.md"), `${tokenLines.join("\n")}\n`, "utf8");
  console.log(
    `Wrote DESIGN-SUMMARY.md and TOKENS.md in ${root} (${folders.length} screens, ${Object.keys(tokens).length} tokens).`,
  );
}

if (process.argv[1]?.endsWith("summarize.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
