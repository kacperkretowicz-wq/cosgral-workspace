// COSGRAL W12 (BE-U): `bun run check:fast`, the check of a change in minutes instead of the 40 minutes of the full check. It reads which
// files the change touched (committed since the integration branch, plus everything not committed yet, plus new files), and runs only the
// checks that can see them: the rules of the screens (check:ui), Biome on the changed files, the type check of the projects that can see
// them, the changed tests, and the tests that import a changed file (`vitest related`). The first red step ends the run (--keep-going
// goes on). Nothing is loosened: the same assertions, the same limits (the time limits only grow, COSGRAL_TEST_TIMEOUT_SCALE defaults to 2).
//
//   node scripts/check-fast.ts [--base <ref>] [--dry-run] [--keep-going] [--skip-related] [--out <folder>]
//
// It is NOT the full check. A change to a config, the lock file or the build is refused (exit 2: run `node scripts/quiet-check.ts`),
// and the full check stays before every push. Exit 0 = every step ran and passed; 1 = a red step; 2 = the full check is needed.
// No push, no change of the repo.

import { execFileSync, spawn } from "node:child_process";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chunkPaths, type FastPlan, planFastCheck } from "./check-fast-plan.ts";
import { cpuBusyPercent, describeLoad } from "./sandbox-load.ts";

const root = resolve(import.meta.dirname, "..");

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function git(args: string[]): string {
  return execFileSync("git", ["-c", "core.quotepath=false", ...args], { cwd: root, encoding: "utf8" });
}

function tryGit(args: string[]): string | null {
  try {
    return git(args).trim();
  } catch {
    return null;
  }
}

/** The commit the change started from: --base, else where this branch left the integration branch, else HEAD (only what is not committed). */
function baseCommit(): { ref: string; sha: string } {
  const given = argValue("--base");
  const candidates = given ? [given] : ["codex/cosgral-desktop", "origin/codex/cosgral-desktop"];
  for (const candidate of candidates) {
    const mergeBase = tryGit(["merge-base", "HEAD", candidate]);
    if (mergeBase) return { ref: candidate, sha: mergeBase };
  }
  if (given) throw new Error(`--base ${given} is not a known commit.`);
  return { ref: "HEAD", sha: git(["rev-parse", "HEAD"]).trim() };
}

function changedFiles(sha: string): string[] {
  const lines = (output: string) => output.split("\n").filter(Boolean);
  const tracked = lines(git(["diff", "--name-only", "--no-renames", sha]));
  const added = lines(git(["ls-files", "--others", "--exclude-standard"]));
  return [...tracked, ...added];
}

/** True when package.json differs from the base only in its "scripts" (a new script is not a new dependency or a new build setting). */
function onlyScriptsChanged(sha: string): boolean {
  const before = tryGit(["show", `${sha}:package.json`]);
  if (before === null) return false;
  try {
    const { scripts: _before, ...restBefore } = JSON.parse(before);
    const { scripts: _after, ...restAfter } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    return JSON.stringify(restBefore) === JSON.stringify(restAfter);
  } catch {
    return false;
  }
}

interface Step {
  name: string;
  command: string;
}

const quote = (path: string) => `"${path}"`;

function stepsOf(plan: FastPlan): Step[] {
  const steps: Step[] = [];
  if (plan.runUiCheck) steps.push({ name: "check:ui", command: "bun run check:ui" });
  chunkPaths(plan.biomeFiles).forEach((chunk, index, all) => {
    const label = all.length > 1 ? `biome ${index + 1}/${all.length}` : "biome";
    steps.push({ name: label, command: `bun x biome check --no-errors-on-unmatched ${chunk.map(quote).join(" ")}` });
  });
  for (const project of plan.typecheck)
    steps.push({ name: `typecheck:${project}`, command: `bun run typecheck:${project}` });
  chunkPaths(plan.testFiles).forEach((chunk, index, all) => {
    const label = all.length > 1 ? `tests changed ${index + 1}/${all.length}` : "tests changed";
    steps.push({
      name: label,
      command: `bun x vitest run --maxWorkers=1 --passWithNoTests ${chunk.map(quote).join(" ")}`,
    });
  });
  const related = process.argv.includes("--skip-related") ? [] : plan.relatedSources;
  chunkPaths(related).forEach((chunk, index, all) => {
    const label = all.length > 1 ? `tests related ${index + 1}/${all.length}` : "tests related";
    steps.push({
      name: label,
      command: `bun x vitest related --run --maxWorkers=1 --passWithNoTests ${chunk.map(quote).join(" ")}`,
    });
  });
  return steps;
}

interface Result {
  step: Step;
  code: number | null;
  seconds: number;
  hint: string;
}

/** Tells the machine from the program in a red log (the same words as quiet-check). */
function hintOf(code: number | null, text: string): string {
  if (code === 0) return "";
  const timeouts = (
    text.match(
      /timed out in \d+ms|Timeout terminating|Hook timed out|Test timed out|did not answer within|ETIMEDOUT/gi,
    ) ?? []
  ).length;
  const assertions = (
    text.match(/AssertionError|expected .* to |TypeError|ReferenceError|error TS\d+|✘|Formatter would have|lint\//gi) ??
    []
  ).length;
  if (timeouts > 0 && assertions === 0) return "timeout (the machine: run the failed file alone)";
  if (timeouts > 0) return `timeout x${timeouts} and assertion x${assertions} (look at the assertions first)`;
  if (assertions > 0) return "assertion, type or style error (the program)";
  return "unknown (read the log)";
}

function runStep(step: Step, logFile: string): Promise<Result> {
  return new Promise((done) => {
    const started = Date.now();
    const log = createWriteStream(logFile);
    const child = spawn(step.command, { shell: true, cwd: root, env: process.env });
    let text = "";
    const keep = (chunk: Buffer) => {
      log.write(chunk);
      text = (text + chunk.toString("utf8")).slice(-2_000_000);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("close", (code) => {
      log.end();
      done({ step, code, seconds: Math.round((Date.now() - started) / 1000), hint: hintOf(code, text) });
    });
  });
}

async function main(): Promise<void> {
  process.env.COSGRAL_TEST_TIMEOUT_SCALE ??= "2";
  const { ref, sha } = baseCommit();
  const files = changedFiles(sha);
  const ordinary = files.includes("package.json") && onlyScriptsChanged(sha) ? ["package.json"] : [];
  const plan = planFastCheck(files, (path) => existsSync(join(root, path)), { ordinary });
  const steps = stepsOf(plan);
  console.log(
    `check:fast: ${plan.changed.length} changed file(s) since ${ref} (${sha.slice(0, 9)}), ${steps.length} step(s)`,
  );
  for (const note of plan.notes) console.log(`check:fast: ${note}`);
  if (plan.needsFullCheck.length > 0) {
    console.log(`check:fast: a change that can reach everything: ${plan.needsFullCheck.join(", ")}`);
  }
  if (process.argv.includes("--dry-run")) {
    for (const step of steps) console.log(`  ${step.name}: ${step.command.slice(0, 160)}`);
    process.exitCode = plan.needsFullCheck.length > 0 ? 2 : 0;
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = resolve(argValue("--out") ?? join(tmpdir(), "cosgral-fast", stamp));
  await mkdir(out, { recursive: true });
  console.log(`check:fast: logs in ${out}; COSGRAL_TEST_TIMEOUT_SCALE=${process.env.COSGRAL_TEST_TIMEOUT_SCALE}`);
  const started = Date.now();
  const results: Result[] = [];
  for (const step of steps) {
    console.log(`\n== ${step.name} | ${describeLoad(await cpuBusyPercent(500))}`);
    const result = await runStep(step, join(out, `${step.name.replace(/[^a-z0-9-]/gi, "_")}.log`));
    results.push(result);
    console.log(
      `   ${result.code === 0 ? "OK" : `RED (exit ${result.code})`} in ${result.seconds} s${result.hint ? `: ${result.hint}` : ""}`,
    );
    if (result.code !== 0 && !process.argv.includes("--keep-going")) break;
  }
  console.log("\nstep                      result  seconds  cause");
  for (const { step, code, seconds, hint } of results) {
    console.log(
      `${step.name.padEnd(25)} ${(code === 0 ? "OK" : "RED").padEnd(7)} ${String(seconds).padStart(7)}  ${hint}`,
    );
  }
  const red = results.filter((result) => result.code !== 0).length;
  const notRun = steps.length - results.length;
  const total = Math.round((Date.now() - started) / 1000);
  if (red > 0) {
    console.log(`\ncheck:fast: ${red} red${notRun > 0 ? `, ${notRun} not run` : ""} after ${total} s. Logs: ${out}`);
    process.exitCode = 1;
  } else if (plan.needsFullCheck.length > 0) {
    console.log(
      `\ncheck:fast: green in ${total} s, BUT the full check is needed (a config or a lock file changed): node scripts/quiet-check.ts`,
    );
    process.exitCode = 2;
  } else {
    console.log(`\ncheck:fast: ALL GREEN in ${total} s (the full check stays before a push)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
