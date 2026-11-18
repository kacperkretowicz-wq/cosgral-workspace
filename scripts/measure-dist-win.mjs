/**
 * After `bun run dist:win`, measure installer size + SHA-256 and write a report
 * OUTSIDE the repo (cosgral-docs/dist-win-measurements or COSGRAL_DIST_REPORT_DIR).
 * No profile paths in the report body — only file names and hashes.
 *
 * Usage (from repo / worktree root):
 *   bun scripts/measure-dist-win.mjs
 *   COSGRAL_DIST_REPORT_DIR=... bun scripts/measure-dist-win.mjs
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");

function defaultReportDir() {
  const fromDesktop = resolve(root, "..", "cosgral-docs", "dist-win-measurements");
  const fromWorktree = resolve(root, "..", "..", "cosgral-docs", "dist-win-measurements");
  if (existsSync(dirname(fromDesktop))) return fromDesktop;
  if (existsSync(dirname(fromWorktree))) return fromWorktree;
  throw new Error("Set COSGRAL_DIST_REPORT_DIR to a folder outside the repo (Shared/cosgral-docs/...).");
}

function sha256File(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function pickInstallers() {
  if (!existsSync(distDir)) {
    throw new Error("No dist/ folder. Run bun run dist:win first (only with GO-kapi-dist).");
  }
  return readdirSync(distDir)
    .filter((name) => /\.exe$/i.test(name) && !/unpacked/i.test(name))
    .map((name) => join(distDir, name));
}

const reportDir = process.env.COSGRAL_DIST_REPORT_DIR
  ? resolve(process.env.COSGRAL_DIST_REPORT_DIR)
  : defaultReportDir();
mkdirSync(reportDir, { recursive: true });

const files = pickInstallers();
if (files.length === 0) {
  throw new Error("No .exe installer in dist/. Run bun run dist:win first.");
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const rows = [];
for (const path of files) {
  const name = path.split(/[/\\]/).pop();
  const size = statSync(path).size;
  const sha256 = await sha256File(path);
  rows.push({ name, sizeBytes: size, sizeMiB: Number((size / (1024 * 1024)).toFixed(2)), sha256 });
}

const payload = {
  measuredAt: new Date().toISOString(),
  gitDescribe: process.env.COSGRAL_GIT_SHA ?? null,
  files: rows,
};
const base = `dist-win-${stamp}`;
const jsonPath = join(reportDir, `${base}.json`);
const txtPath = join(reportDir, `${base}.txt`);
writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
const lines = [
  `measuredAt: ${payload.measuredAt}`,
  `git: ${payload.gitDescribe ?? "(set COSGRAL_GIT_SHA)"}`,
  ...rows.map((row) => `${row.name}\tsize=${row.sizeBytes} B (${row.sizeMiB} MiB)\tsha256=${row.sha256}`),
  "",
];
writeFileSync(txtPath, lines.join("\n"), "utf8");
console.log(lines.join("\n"));
console.log(`Wrote ${base}.json and ${base}.txt outside the repo.`);
