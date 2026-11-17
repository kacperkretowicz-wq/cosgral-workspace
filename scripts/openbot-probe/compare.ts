// COSGRAL BE-A: compares two results of the probe (the reference program and our own app), screen by screen, and writes one short
// report per screen OUTSIDE the repo: texts only on one side, sizes/radii/colours the reference uses that ours does not (with a
// tolerance), and the design tokens that differ. It reads only the folders it is given and writes only the folder it is given.
//
//   node scripts/openbot-probe/compare.ts --reference <results> --ours <results> --out <folder outside the repo> [--map <json>]
//
// Screens are paired by the name of what was clicked (or the heading); screens in two languages need a map file
// ({"ustawienia": "settings"}: reference name -> our name). Unpaired screens of both sides are listed.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { isInsideRepo, type StyleGroup } from "./policy.ts";
import { parseStyleGroups, parseTokens, SUMMARY_PROPERTIES, tallyStyles } from "./summarize.ts";

/** Channel difference allowed between two colours (0-255) before they count as different. */
export const COLOR_TOLERANCE = 5;
/** Difference in px allowed between two lengths. */
export const LENGTH_TOLERANCE = 2;

const NUMBER = /-?\d+(?:\.\d+)?/g;

/** The red, green, blue and alpha of `rgb(...)`, `rgba(...)` or `#rrggbb`; null for anything else. */
export function parseColor(value: string): [number, number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (hex?.[1]) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  if (!/^rgba?\(/.test(value.trim())) return null;
  const parts = (value.match(NUMBER) ?? []).map(Number);
  if (parts.length < 3) return null;
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
}

export function sameColor(a: string, b: string): boolean {
  if (a === b) return true;
  const x = parseColor(a);
  const y = parseColor(b);
  if (!x || !y) return false;
  return (
    x.slice(0, 3).every((channel, index) => Math.abs(channel - (y[index] ?? 0)) <= COLOR_TOLERANCE) &&
    Math.abs(x[3] - y[3]) <= 0.05
  );
}

/** A single length in px ("14px"); null for lists ("0px 0px 13px") and anything else. */
export function parsePx(value: string): number | null {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());
  return match?.[1] === undefined ? null : Number(match[1]);
}

export function sameLength(a: string, b: string): boolean {
  if (a === b) return true;
  const x = parsePx(a);
  const y = parsePx(b);
  return x !== null && y !== null && Math.abs(x - y) <= LENGTH_TOLERANCE;
}

const COLOR_PROPERTIES = new Set(["color", "backgroundColor", "borderTopColor"]);
const LENGTH_PROPERTIES = new Set(["fontSize", "lineHeight", "borderRadius", "paddingTop", "paddingLeft", "gap"]);

function sameValue(property: string, a: string, b: string): boolean {
  if (COLOR_PROPERTIES.has(property)) return sameColor(a, b);
  if (LENGTH_PROPERTIES.has(property)) return sameLength(a, b);
  return a === b;
}

export interface MissingValue {
  property: string;
  value: string;
  /** How many elements of the reference use it. */
  count: number;
}

export interface StyleDiff {
  /** Values the reference uses that ours does not (within the tolerance). */
  missingInOurs: MissingValue[];
  /** Values ours uses that the reference does not. */
  extraInOurs: MissingValue[];
}

/** The values of each property that one side uses and the other does not. Rare values (under `minShare` of the elements) are skipped. */
export function diffStyles(reference: readonly StyleGroup[], ours: readonly StyleGroup[], minShare = 0.01): StyleDiff {
  const a = tallyStyles(reference);
  const b = tallyStyles(ours);
  const out: StyleDiff = { missingInOurs: [], extraInOurs: [] };
  for (const [property] of SUMMARY_PROPERTIES) {
    for (const [from, to, target] of [
      [a, b, out.missingInOurs],
      [b, a, out.extraInOurs],
    ] as const) {
      const mine = from.get(property);
      if (!mine) continue;
      const total = [...mine.values()].reduce((sum, count) => sum + count, 0);
      const others = [...(to.get(property)?.keys() ?? [])];
      for (const [value, count] of [...mine.entries()].sort((x, y) => y[1] - x[1])) {
        if (count / total < minShare) continue;
        if (!others.some((other) => sameValue(property, value, other))) target.push({ property, value, count });
      }
    }
  }
  return out;
}

export interface TextDiff {
  onlyInReference: string[];
  onlyInOurs: string[];
}

export function diffTexts(reference: readonly string[], ours: readonly string[]): TextDiff {
  const norm = (text: string) => text.normalize("NFC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  const mine = new Set(ours.map(norm));
  const theirs = new Set(reference.map(norm));
  return {
    onlyInReference: reference.filter((text) => !mine.has(norm(text))),
    onlyInOurs: ours.filter((text) => !theirs.has(norm(text))),
  };
}

export interface TokenDiff {
  /** Same role name on both sides is not assumed: tokens are compared by value. Values the reference has and we do not. */
  valuesMissingInOurs: string[];
}

/** The colour and length values defined by the reference's tokens that none of our tokens has (within the tolerance). */
export function diffTokenValues(reference: Record<string, string>, ours: Record<string, string>): TokenDiff {
  const ourValues = Object.values(ours).map((value) => value.trim());
  const missing = new Set<string>();
  for (const value of Object.values(reference).map((text) => text.trim())) {
    if (!value) continue;
    const isColor = parseColor(value) !== null;
    const isLength = parsePx(value) !== null;
    if (!isColor && !isLength) continue;
    const found = ourValues.some((other) => (isColor ? sameColor(value, other) : sameLength(value, other)));
    if (!found) missing.add(value);
  }
  return { valuesMissingInOurs: [...missing].sort() };
}

/** The key a screen is paired by: the lowercased slug without its number ("12-new-agent-rutyny" -> "new-agent-rutyny"). */
export function pairKey(folderName: string): string {
  return folderName.replace(/^\d+-/, "");
}

export interface Pairing<T> {
  pairs: Array<{ key: string; reference: T; ours: T }>;
  onlyReference: string[];
  onlyOurs: string[];
}

/** Pairs two sets of screens by name; `map` renames reference names to ours first. */
export function pairScreens<T>(
  reference: Map<string, T>,
  ours: Map<string, T>,
  map: Record<string, string> = {},
): Pairing<T> {
  const result: Pairing<T> = { pairs: [], onlyReference: [], onlyOurs: [] };
  const used = new Set<string>();
  for (const [key, value] of reference) {
    const target = map[key] ?? key;
    const other = ours.get(target);
    if (other === undefined) result.onlyReference.push(key);
    else {
      used.add(target);
      result.pairs.push({ key, reference: value, ours: other });
    }
  }
  for (const key of ours.keys()) if (!used.has(key)) result.onlyOurs.push(key);
  return result;
}

export function screenReport(key: string, texts: TextDiff, styles: StyleDiff): string {
  const lines = [`# ${key}`, ""];
  const list = (title: string, items: string[], limit = 25) => {
    lines.push(`## ${title} (${items.length})`, "");
    if (items.length === 0) lines.push("- none");
    for (const item of items.slice(0, limit)) lines.push(`- ${item}`);
    if (items.length > limit) lines.push(`- … and ${items.length - limit} more`);
    lines.push("");
  };
  list("Texts only in the reference", texts.onlyInReference);
  list("Texts only in ours", texts.onlyInOurs);
  list(
    "Looks the reference uses that ours does not",
    styles.missingInOurs.map((m) => `${m.property}: \`${m.value}\` (${m.count} elements)`),
  );
  list(
    "Looks ours uses that the reference does not",
    styles.extraInOurs.map((m) => `${m.property}: \`${m.value}\` (${m.count} elements)`),
  );
  return lines.join("\n");
}

async function text(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "null";
  }
}

interface Screen {
  texts: string[];
  styles: StyleGroup[];
  tokens: Record<string, string>;
}

async function loadScreens(root: string): Promise<Map<string, Screen>> {
  const screens = new Map<string, Screen>();
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
      const path = join(folder, entry.name);
      const inner: string[] = await readdir(path).catch(() => []);
      if (!inner.includes("styles.json")) {
        await walk(path);
        continue;
      }
      const texts = JSON.parse(await text(join(path, "texts.json")));
      screens.set(pairKey(entry.name), {
        texts: Array.isArray(texts) ? texts.filter(isString) : [],
        styles: parseStyleGroups(JSON.parse(await text(join(path, "styles.json")))),
        tokens: parseTokens(JSON.parse(await text(join(path, "tokens.json")))),
      });
    }
  };
  await walk(root);
  return screens;
}

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? "") : "";
}

async function main(): Promise<void> {
  const reference = argument("reference");
  const ours = argument("ours");
  const out = argument("out");
  if (!reference || !ours || !out) throw new Error("--reference, --ours and --out are required.");
  const repoRoot = resolve(import.meta.dirname ?? ".", "..", "..");
  if (isInsideRepo(resolve(out), repoRoot)) throw new Error("Refusing to write inside the repository.");
  const mapFile = argument("map");
  const map: Record<string, string> = {};
  if (mapFile) {
    const parsed = JSON.parse(await text(mapFile));
    if (isDynamicRecord(parsed)) for (const [from, to] of Object.entries(parsed)) if (isString(to)) map[from] = to;
  }
  const a = await loadScreens(resolve(reference));
  const b = await loadScreens(resolve(ours));
  const pairing = pairScreens(a, b, map);
  await mkdir(resolve(out), { recursive: true });
  const summary = [
    "# UI comparison",
    "",
    `Reference screens: ${a.size}; ours: ${b.size}; paired: ${pairing.pairs.length}.`,
    "",
    "| Screen | Texts only in reference | Looks missing in ours | Looks only in ours |",
    "|---|---:|---:|---:|",
  ];
  const refTokens: Record<string, string> = {};
  const ourTokens: Record<string, string> = {};
  for (const pair of pairing.pairs) {
    const texts = diffTexts(pair.reference.texts, pair.ours.texts);
    const styles = diffStyles(pair.reference.styles, pair.ours.styles);
    Object.assign(refTokens, pair.reference.tokens);
    Object.assign(ourTokens, pair.ours.tokens);
    await writeFile(join(resolve(out), `${pair.key}.md`), `${screenReport(pair.key, texts, styles)}\n`, "utf8");
    summary.push(
      `| [${pair.key}](${pair.key}.md) | ${texts.onlyInReference.length} | ${styles.missingInOurs.length} | ${styles.extraInOurs.length} |`,
    );
  }
  const tokens = diffTokenValues(refTokens, ourTokens);
  summary.push(
    "",
    `## Token values of the reference that none of our tokens has (${tokens.valuesMissingInOurs.length})`,
    "",
    ...tokens.valuesMissingInOurs.slice(0, 80).map((value) => `- \`${value}\``),
  );
  summary.push(
    "",
    `## Screens only in the reference (${pairing.onlyReference.length})`,
    "",
    ...pairing.onlyReference.map((key) => `- ${key}`),
  );
  summary.push(
    "",
    `## Screens only in ours (${pairing.onlyOurs.length})`,
    "",
    ...pairing.onlyOurs.map((key) => `- ${key}`),
    "",
  );
  await writeFile(join(resolve(out), "INDEX.md"), summary.join("\n"), "utf8");
  console.log(
    `Compared ${pairing.pairs.length} screens; ${pairing.onlyReference.length} only in the reference, ${pairing.onlyOurs.length} only in ours.`,
  );
}

if (process.argv[1]?.endsWith("compare.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
