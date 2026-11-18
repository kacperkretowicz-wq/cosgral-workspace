// COSGRAL W12 (BE-P): the full `bun run check` for a quiet window, step by step. `bun run check` is one chain with `&&`: the first red
// step hides every step after it and the log of the first hour is lost. This runs the same eleven steps in the same order, each with its
// own log file and time, goes on after a red step (unless --stop), and prints one table at the end, so a run says in one look what is red
// and whether it is the machine (a timeout) or the program (an assertion). Before it starts it waits for a quiet machine and writes the load.
//
//   COSGRAL_TEST_TIMEOUT_SCALE=3 node scripts/quiet-check.ts [--out <folder>] [--only a,b] [--skip a,b] [--stop]
//
// Steps: check:ui, lint, typecheck, test, test:storybook, test:visual, test:api, test:browser, api:build, build-storybook, build.
// Exit code 0 only when every step ran and passed. No push, no change of the repo.

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cpuBusyPercent, describeLoad, waitForQuietMachine } from "./sandbox-load.ts";

interface Step {
  name: string;
  command: string;
  /** Rough minutes on a quiet machine (from the green runs of 16-18.11), for the table and for a person who waits. */
  minutes: number;
}

const STEPS: Step[] = [
  { name: "check:ui", command: "bun run check:ui", minutes: 0.5 },
  { name: "lint", command: "bun run lint", minutes: 1 },
  { name: "typecheck", command: "bun run typecheck", minutes: 3.5 },
  // One worker: the files already run one after another (fileParallelism: false); one process means less memory and no pool timeouts.
  { name: "test", command: "bun x vitest run --maxWorkers=1", minutes: 16 },
  { name: "test:storybook", command: "bun run test:storybook", minutes: 3 },
  { name: "test:visual", command: "bun run test:visual", minutes: 0.5 },
  { name: "test:api", command: "bun run test:api", minutes: 0.5 },
  { name: "test:browser", command: "bun run test:browser", minutes: 1 },
  { name: "api:build", command: "bun run api:build", minutes: 0.5 },
  { name: "build-storybook", command: "bun run build-storybook", minutes: 2 },
  { name: "build", command: "bun run build", minutes: 1 },
];

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function list(name: string): string[] {
  return (argValue(name) ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

interface Result {
  step: Step;
  code: number | null;
  seconds: number;
  log: string;
  /** What the log says about the cause: "timeout" (the machine), "assertion" (the program) or "" (unknown or green). */
  hint: string;
}

function runStep(step: Step, logFile: string): Promise<Result> {
  return new Promise((done) => {
    const started = Date.now();
    const log = createWriteStream(logFile);
    const child = spawn(step.command, { shell: true, cwd: resolve(import.meta.dirname, ".."), env: process.env });
    let text = "";
    const keep = (chunk: Buffer) => {
      log.write(chunk);
      // Only the tail is needed for the hint.
      text = (text + chunk.toString("utf8")).slice(-2_000_000);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("close", (code) => {
      log.end();
      done({ step, code, seconds: Math.round((Date.now() - started) / 1000), log: logFile, hint: hintOf(code, text) });
    });
  });
}

/** Tells the machine from the program in a red log. */
function hintOf(code: number | null, text: string): string {
  if (code === 0) return "";
  const timeouts = (
    text.match(
      /timed out in \d+ms|Timeout terminating|Hook timed out|Test timed out|did not answer within|ETIMEDOUT/gi,
    ) ?? []
  ).length;
  const assertions = (
    text.match(/AssertionError|expected .* to |TypeError|ReferenceError|error TS\d+|✘|Formatter would have/gi) ?? []
  ).length;
  if (timeouts > 0 && assertions === 0) return "timeout (the machine: run the failed file alone)";
  if (timeouts > 0) return `timeout x${timeouts} and assertion x${assertions} (look at the assertions first)`;
  if (assertions > 0) return "assertion or type error (the program)";
  return "unknown (read the log)";
}

async function main(): Promise<void> {
  const only = list("--only");
  const skip = list("--skip");
  const steps = STEPS.filter((step) => (only.length === 0 || only.includes(step.name)) && !skip.includes(step.name));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = resolve(argValue("--out") ?? join(tmpdir(), "cosgral-check", stamp));
  await mkdir(out, { recursive: true });
  const scale = process.env.COSGRAL_TEST_TIMEOUT_SCALE ?? "1";
  console.log(
    `quiet-check: ${steps.length} steps, about ${Math.round(steps.reduce((sum, s) => sum + s.minutes, 0))} min on a quiet machine`,
  );
  console.log(`quiet-check: logs in ${out}; COSGRAL_TEST_TIMEOUT_SCALE=${scale}`);
  if (scale === "1")
    console.log("quiet-check: WARNING the scale is 1; for a busy computer use COSGRAL_TEST_TIMEOUT_SCALE=3");
  await waitForQuietMachine("quiet-check", { maxCpu: 60, minFreeMb: 1200, maxWaitMs: 10 * 60_000 });
  const results: Result[] = [];
  for (const step of steps) {
    const load = describeLoad(await cpuBusyPercent(1000));
    console.log(`\n== ${step.name} (about ${step.minutes} min) | ${load}`);
    const result = await runStep(step, join(out, `${step.name.replace(/[^a-z0-9-]/gi, "_")}.log`));
    results.push(result);
    console.log(
      `   ${result.code === 0 ? "OK" : `RED (exit ${result.code})`} in ${result.seconds} s${result.hint ? `: ${result.hint}` : ""}`,
    );
    if (result.code !== 0 && process.argv.includes("--stop")) break;
  }
  console.log("\nstep               result  seconds  cause");
  for (const { step, code, seconds, hint } of results) {
    console.log(
      `${step.name.padEnd(18)} ${(code === 0 ? "OK" : "RED").padEnd(7)} ${String(seconds).padStart(7)}  ${hint}`,
    );
  }
  const red = results.filter((result) => result.code !== 0);
  const missing = steps.length - results.length;
  console.log(
    red.length === 0 && missing === 0
      ? "\nquiet-check: ALL GREEN"
      : `\nquiet-check: ${red.length} red${missing > 0 ? `, ${missing} not run` : ""}. Logs: ${out}`,
  );
  process.exitCode = red.length === 0 && missing === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
