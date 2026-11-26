// COSGRAL: builds `katalog-pluginow/catalog.json` (the index with checksums) from the detail files `<slug>/<version>.json`.
// Run after you add or change a plugin: `bun scripts/build-plugin-catalog.ts [folder]`. The program checks every detail
// file against the checksum in the index, so a file changed by hand without this step is skipped when the catalog loads.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const directory = process.argv[2] ?? "katalog-pluginow";

function versionKey(version: string): number[] {
  return version.split(".").map((part) => Number(part));
}

function newer(left: string, right: string): number {
  const a = versionKey(left);
  const b = versionKey(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

const plugins: Array<{ slug: string; version: string; featured: boolean; detailSha256: string }> = [];
for (const slug of readdirSync(directory).sort()) {
  if (!statSync(join(directory, slug)).isDirectory()) continue;
  const versions = readdirSync(join(directory, slug))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .sort(newer);
  const version = versions.at(-1);
  if (!version) continue;
  const content = readFileSync(join(directory, slug, `${version}.json`), "utf8");
  const parsed: { featured?: boolean } = JSON.parse(content);
  plugins.push({
    slug,
    version,
    featured: parsed.featured === true,
    detailSha256: createHash("sha256").update(content, "utf8").digest("hex"),
  });
}

const index = { schemaVersion: 1, catalogVersion: new Date().toISOString().slice(0, 10), plugins };
writeFileSync(join(directory, "catalog.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(`Catalog written: ${plugins.length} plugins.`);
