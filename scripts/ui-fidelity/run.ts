// CLI: score PASS/FAIL/niejasne using openbot-probe/compare.ts helpers (no duplicated tolerances).
// Writes GATE.md outside the repo. For the full compare INDEX.md, also run:
//   bun scripts/openbot-probe/compare.ts --reference … --ours … --out …
//
//   bun scripts/ui-fidelity/run.ts --reference <dir> --ours <dir> --out <Shared/.../porownanie-ui> [--map <json>]

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  diffStyles,
  diffTexts,
  diffTokenValues,
  pairKey,
  pairScreens,
  screenReport,
} from "../openbot-probe/compare.ts";
import { isInsideRepo, type StyleGroup } from "../openbot-probe/policy.ts";
import { parseStyleGroups, parseTokens } from "../openbot-probe/summarize.ts";
import { gateScreen, type ScreenGateResult, writeGateReport } from "./gate.ts";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
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
      const textsRaw = JSON.parse(await text(join(path, "texts.json")));
      const stylesRaw = JSON.parse(await text(join(path, "styles.json")));
      const tokensRaw = JSON.parse(await text(join(path, "tokens.json")));
      screens.set(pairKey(entry.name), {
        texts: Array.isArray(textsRaw) ? textsRaw.filter((t): t is string => typeof t === "string") : [],
        styles: parseStyleGroups(stylesRaw),
        tokens: parseTokens(tokensRaw),
      });
    }
  };
  await walk(root);
  return screens;
}

async function main(): Promise<void> {
  const reference = resolve(argument("--reference"));
  const ours = resolve(argument("--ours"));
  const out = resolve(argument("--out"));
  const mapPath = process.argv.includes("--map") ? resolve(argument("--map")) : undefined;
  const repoRoot = resolve(import.meta.dirname ?? ".", "..", "..");
  if (isInsideRepo(out, repoRoot)) throw new Error(`--out must be outside the repo: ${out}`);

  let map: Record<string, string> = {};
  if (mapPath) {
    const raw = JSON.parse(await readFile(mapPath, "utf8")) as unknown;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) map = raw as Record<string, string>;
  }

  const refScreens = await loadScreens(reference);
  const ourScreens = await loadScreens(ours);
  const pairing = pairScreens(refScreens, ourScreens, map);
  const results: ScreenGateResult[] = [];

  await mkdir(out, { recursive: true });
  const indexRows: string[] = [
    "# UI compare + gate",
    "",
    `Paired: ${pairing.pairs.length}; only reference: ${pairing.onlyReference.length}; only ours: ${pairing.onlyOurs.length}.`,
    "",
    "| Screen | Gate |",
    "|---|---|",
  ];

  for (const pair of pairing.pairs) {
    const texts = diffTexts(pair.reference.texts, pair.ours.texts);
    const styles = diffStyles(pair.reference.styles, pair.ours.styles);
    const tokens = diffTokenValues(pair.reference.tokens, pair.ours.tokens);
    const gated = gateScreen({ key: pair.key, texts, styles, tokens });
    results.push(gated);
    await writeFile(join(out, `${pair.key}.md`), screenReport(pair.key, texts, styles), "utf8");
    indexRows.push(`| ${pair.key} | ${gated.verdict} |`);
  }
  for (const key of pairing.onlyReference) {
    results.push(
      gateScreen({
        key,
        texts: { onlyInReference: [], onlyInOurs: [] },
        styles: { missingInOurs: [], extraInOurs: [] },
        unpaired: "reference",
      }),
    );
    indexRows.push(`| ${key} | niejasne (only reference) |`);
  }
  for (const key of pairing.onlyOurs) {
    results.push(
      gateScreen({
        key,
        texts: { onlyInReference: [], onlyInOurs: [] },
        styles: { missingInOurs: [], extraInOurs: [] },
        unpaired: "ours",
      }),
    );
    indexRows.push(`| ${key} | niejasne (only ours) |`);
  }

  await writeFile(join(out, "INDEX.md"), `${indexRows.join("\n")}\n`, "utf8");
  const gatePath = await writeGateReport(out, results);
  const pass = results.filter((r) => r.verdict === "PASS").length;
  const fail = results.filter((r) => r.verdict === "FAIL").length;
  const unclear = results.filter((r) => r.verdict === "niejasne").length;
  process.stdout.write(
    `Compared ${pairing.pairs.length} screens; gate ${pass} PASS, ${fail} FAIL, ${unclear} niejasne → ${gatePath}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
