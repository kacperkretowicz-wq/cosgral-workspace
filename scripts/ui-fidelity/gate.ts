// COSGRAL T-A/T-B: thin acceptance gate on top of scripts/openbot-probe/compare.ts.
// Does not reimplement colour/length diffs — reuses compare.ts (±5 colour, ±2 px).
// Adds PASS | FAIL | niejasne per screen for docs/cosgral/odbior-071.md.
//
//   node scripts/ui-fidelity/run.ts --reference <probe> --ours <probe> --out <folder outside repo> [--map <json>]
//
// Reports stay OUTSIDE the public repo (Shared/cosgral-docs/porownanie-ui/).

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  COLOR_TOLERANCE,
  LENGTH_TOLERANCE,
  type MissingValue,
  type StyleDiff,
  type TextDiff,
  type TokenDiff,
} from "../openbot-probe/compare.ts";
import { isInsideRepo } from "../openbot-probe/policy.ts";

export type GateVerdict = "PASS" | "FAIL" | "niejasne";

export interface ScreenGateInput {
  key: string;
  texts: TextDiff;
  styles: StyleDiff;
  tokens?: TokenDiff;
  /** Screen present only on one side of the pair. */
  unpaired?: "reference" | "ours";
}

export interface ScreenGateResult {
  key: string;
  verdict: GateVerdict;
  reasons: string[];
  fixOwner: "UI Designer" | "Backend" | "KK" | "Tester" | "—";
}

/** Properties that odbior-071 treats as layout-critical (rail, panel, header, primary control). */
const CRITICAL_LOOK = new Set([
  "fontSize",
  "lineHeight",
  "borderRadius",
  "paddingTop",
  "paddingLeft",
  "gap",
  "backgroundColor",
  "color",
  "borderTopColor",
]);

/**
 * Gate one screen against odbior-071.md tolerances.
 * Style/colour/length already filtered by compare.ts; any remaining critical miss → FAIL.
 * Text-only deltas → niejasne (sense needs a human / i18n map).
 * Unpaired screen → niejasne until mapped or extracted.
 */
export function gateScreen(input: ScreenGateInput): ScreenGateResult {
  const reasons: string[] = [];
  if (input.unpaired === "reference") {
    return {
      key: input.key,
      verdict: "niejasne",
      reasons: ["Screen only in the reference extract — no COSGRAL probe pair yet."],
      fixOwner: "Tester",
    };
  }
  if (input.unpaired === "ours") {
    return {
      key: input.key,
      verdict: "niejasne",
      reasons: ["Screen only on our side — no reference pair (map or extract missing)."],
      fixOwner: "Tester",
    };
  }

  const criticalMissing = input.styles.missingInOurs.filter((m) => CRITICAL_LOOK.has(m.property));
  const criticalExtra = input.styles.extraInOurs.filter((m) => CRITICAL_LOOK.has(m.property));
  if (criticalMissing.length > 0) {
    reasons.push(
      `Critical looks missing in ours (±${LENGTH_TOLERANCE}px / ±${COLOR_TOLERANCE} colour already applied): ${summarizeMissing(criticalMissing)}`,
    );
  }
  if (criticalExtra.length > 0) {
    reasons.push(`Critical looks only in ours: ${summarizeMissing(criticalExtra)}`);
  }

  const tokenGaps = input.tokens?.valuesMissingInOurs ?? [];
  if (tokenGaps.length > 0) {
    reasons.push(`Token colour/length values from reference missing in ours: ${tokenGaps.slice(0, 8).join(", ")}`);
  }

  if (criticalMissing.length > 0 || criticalExtra.length > 0 || tokenGaps.length > 0) {
    return { key: input.key, verdict: "FAIL", reasons, fixOwner: "UI Designer" };
  }

  const textOnly = input.texts.onlyInReference.length > 0 || input.texts.onlyInOurs.length > 0;
  if (textOnly) {
    reasons.push(
      `Text set differs (sense check needed; PL/EN ok if meaning matches). Ref-only ${input.texts.onlyInReference.length}, ours-only ${input.texts.onlyInOurs.length}.`,
    );
    return { key: input.key, verdict: "niejasne", reasons, fixOwner: "UI Designer" };
  }

  return {
    key: input.key,
    verdict: "PASS",
    reasons: ["No critical style/token gaps within odbior-071 tolerances."],
    fixOwner: "—",
  };
}

function summarizeMissing(items: MissingValue[]): string {
  return items
    .slice(0, 6)
    .map((m) => `${m.property}=${m.value}×${m.count}`)
    .join("; ");
}

export function gateSummary(results: readonly ScreenGateResult[]): string {
  const counts = { PASS: 0, FAIL: 0, niejasne: 0 };
  for (const r of results) counts[r.verdict] += 1;
  const lines = [
    "# UI fidelity gate (odbior-071)",
    "",
    `Tolerances: ±${LENGTH_TOLERANCE} px, ±${COLOR_TOLERANCE} colour (from openbot-probe/compare.ts).`,
    "",
    `| Verdict | Count |`,
    `|---|---|`,
    `| PASS | ${counts.PASS} |`,
    `| FAIL | ${counts.FAIL} |`,
    `| niejasne | ${counts.niejasne} |`,
    "",
    `| Screen | Verdict | Owner | Reasons |`,
    `|---|---|---|---|`,
  ];
  for (const r of results) {
    const why = r.reasons.join(" ").replace(/\|/g, "/");
    lines.push(`| ${r.key} | ${r.verdict} | ${r.fixOwner} | ${why} |`);
  }
  lines.push("");
  return lines.join("\n");
}

/** Write GATE.md under an outside-repo folder (same rule as compare.ts). */
export async function writeGateReport(
  outDir: string,
  results: readonly ScreenGateResult[],
  repoRoot = resolve(import.meta.dirname ?? ".", "..", ".."),
): Promise<string> {
  const absolute = resolve(outDir);
  if (isInsideRepo(absolute, repoRoot)) {
    throw new Error(`Refuse to write gate report inside the repo: ${absolute}`);
  }
  await mkdir(absolute, { recursive: true });
  const path = join(absolute, "GATE.md");
  await writeFile(path, gateSummary(results), "utf8");
  return path;
}
