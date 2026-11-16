// COSGRAL W8-BE2 (G5, W8-10/W8-12): the escape test of the isolation of processes. It tries to get OUT of what an isolated process
// was granted, and every attempt must fail; it also checks the positive cases, because a test where nothing ever works proves
// nothing. Run it on the machine of the owner (or in the sandbox of the team): bun scripts/isolation-escape-check.ts --root <folder>
//
// SAFE BY DESIGN: it works ONLY inside `--root`, a folder that does not exist yet or is empty. It makes its own two folders with a
// text file each (a "granted" and an "outside" one) and its own AppContainer, and removes all of it at the end (`--keep` keeps the
// folders). It never reads or writes anything else and refuses a root that is a drive, the home folder or not empty. It is not
// meant to be pointed at real data and it does not need to be.
//
// Output: one line per attempt, "PASS <name>" or "FAIL <name>: why", then a verdict line. Exit code 0 only when every line is PASS.
// A `FAIL` line means a way out was found (or a control did not work): the isolation is NOT good enough for G5.

import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import { deleteProfileCommand, ensureIsolationHost, hostCommand, revokeCommand } from "../src/backend/isolation-host";

interface Outcome {
  code: number | null;
  out: string;
  err: string;
}

const CMD = join(process.env.WINDIR ?? "C:\\Windows", "System32", "cmd.exe");
const results: Array<{ name: string; ok: boolean; why: string }> = [];

function run(command: string, args: string[], timeoutMs = 30_000): Promise<Outcome> {
  return new Promise((done) => {
    const child = spawn(command, args, { windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code, out, err });
    });
  });
}

function record(name: string, ok: boolean, why = ""): void {
  results.push({ name, ok, why });
  console.log(ok ? `PASS ${name}` : `FAIL ${name}: ${why}`);
}

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

async function main() {
  if (process.platform !== "win32") {
    console.log("FAIL platform: the isolation of processes is only for Windows, so there is nothing to test here.");
    return 2;
  }
  const rootArgument = argument("--root");
  if (!rootArgument) {
    console.log("Usage: bun scripts/isolation-escape-check.ts --root <a new or empty folder> [--keep]");
    return 2;
  }
  const root = resolve(rootArgument);
  const forbidden = [parse(root).root, resolve(homedir()), resolve(dirname(homedir()))];
  if (forbidden.some((path) => path.toLowerCase() === root.toLowerCase())) {
    console.log("FAIL root: that folder is a drive or a home folder. Use a new folder made for this test.");
    return 2;
  }
  if (existsSync(root) && (await readdir(root)).length > 0) {
    console.log(
      "FAIL root: the folder is not empty. Use a new or empty folder, so that nothing of yours is ever touched.",
    );
    return 2;
  }
  const keep = process.argv.includes("--keep");
  const container = `cosgral.escape.${process.pid}`;
  const granted = join(root, "granted");
  const outside = join(root, "outside");
  const bin = join(root, "bin");
  await mkdir(granted, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(granted, "inside.txt"), "INSIDE-CANARY", "utf8");
  await writeFile(join(outside, "secret.txt"), "OUTSIDE-CANARY", "utf8");
  console.log(`Working only inside ${root}`);

  let host: string;
  try {
    host = await ensureIsolationHost(bin);
  } catch (error) {
    console.log(`FAIL helper: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const inContainer = (
    grants: Array<{ path: string; write: boolean }>,
    program: string,
    args: string[],
    cwd?: string,
  ) => hostCommand(host, { cwd, appContainer: { name: container, grants } }, program, args);
  const readGrant = [{ path: granted, write: false }];
  const writeGrant = [{ path: granted, write: true }];

  // Controls first: without them a "denied" could just mean "nothing works".
  const control = inContainer(readGrant, CMD, ["/c", "type", join(granted, "inside.txt")]);
  const controlRun = await run(control.command, control.args);
  record(
    "control: a granted folder can be read",
    controlRun.out.includes("INSIDE-CANARY") && controlRun.code === 0,
    `exit ${controlRun.code}`,
  );
  const writeControl = inContainer(writeGrant, CMD, ["/c", "echo allowed> fresh.txt"], granted);
  await run(writeControl.command, writeControl.args);
  const written = await readFile(join(granted, "fresh.txt"), "utf8").catch(() => "");
  record(
    "control: a folder granted for writing can be written",
    written.includes("allowed"),
    "the file was not written",
  );

  // The test must be able to SEE an escape: the same read, with the outside folder granted on purpose, must show the canary.
  const seen = inContainer([...readGrant, { path: outside, write: false }], CMD, [
    "/c",
    "type",
    join(outside, "secret.txt"),
  ]);
  const seenRun = await run(seen.command, seen.args);
  record(
    "control: a leak is seen when a folder is granted on purpose",
    seenRun.out.includes("OUTSIDE-CANARY"),
    "the test cannot see a leak, so its denials mean nothing",
  );

  // Escapes: each of these must be refused.
  const escapes: Array<{
    name: string;
    program: string;
    args: string[];
    cwd?: string;
    grants?: Array<{ path: string; write: boolean }>;
    leaks: string;
  }> = [
    {
      name: "reading a folder that was not granted",
      program: CMD,
      args: ["/c", "type", join(outside, "secret.txt")],
      leaks: "OUTSIDE-CANARY",
    },
    {
      name: "reading it by climbing out of the granted folder with ..",
      program: CMD,
      args: ["/c", "type", join(granted, "..", "outside", "secret.txt")],
      leaks: "OUTSIDE-CANARY",
    },
    {
      name: "reading it with other capitals in the path",
      program: CMD,
      args: ["/c", "type", join(outside, "secret.txt").toUpperCase()],
      leaks: "OUTSIDE-CANARY",
    },
    {
      name: "listing a folder that was not granted",
      program: CMD,
      args: ["/c", "dir", "/b", outside],
      leaks: "secret.txt",
    },
    {
      name: "writing outside the granted folder",
      program: CMD,
      args: ["/c", "echo escaped> ..\\outside\\escaped.txt"],
      cwd: granted,
      grants: writeGrant,
      leaks: "NEVER-IN-OUTPUT",
    },
    {
      name: "writing into a folder that was granted only for reading",
      program: CMD,
      args: ["/c", "echo escaped> blocked.txt"],
      cwd: granted,
      leaks: "escaped",
    },
  ];
  for (const attempt of escapes) {
    const command = inContainer(attempt.grants ?? readGrant, attempt.program, attempt.args, attempt.cwd);
    const outcome = await run(command.command, command.args);
    const leaked = outcome.out.includes(attempt.leaks);
    const wroteOutside = attempt.name.startsWith("writing outside") ? existsSync(join(outside, "escaped.txt")) : false;
    const wroteReadOnly = attempt.name.startsWith("writing into") ? existsSync(join(granted, "blocked.txt")) : false;
    record(
      `escape refused: ${attempt.name}`,
      !leaked && !wroteOutside && !wroteReadOnly,
      `exit ${outcome.code}, output: ${outcome.out.slice(0, 80)}`,
    );
  }

  // A junction inside the granted folder that points to the outside one (a junction needs no administrator).
  const junction = join(granted, "door");
  const made = await run(CMD, ["/c", "mklink", "/J", junction, outside]);
  if (made.code === 0) {
    const through = inContainer(readGrant, CMD, ["/c", "type", join(junction, "secret.txt")]);
    const outcome = await run(through.command, through.args);
    record(
      "escape refused: reading through a junction that points outside",
      !outcome.out.includes("OUTSIDE-CANARY"),
      `exit ${outcome.code}`,
    );
    await run(CMD, ["/c", "rmdir", junction]);
  } else {
    record(
      "escape refused: reading through a junction that points outside",
      false,
      "the junction could not be made, so this was NOT tested",
    );
  }

  // The Job Object: a cap on processes, and everything ends with the helper.
  const wide = hostCommand(host, { maxProcesses: 40 }, CMD, [
    "/c",
    "start /b ping -n 2 127.0.0.1 >nul & start /b ping -n 2 127.0.0.1 >nul & start /b ping -n 2 127.0.0.1 >nul & echo ok",
  ]);
  const narrow = hostCommand(host, { maxProcesses: 2 }, CMD, [
    "/c",
    "start /b ping -n 2 127.0.0.1 >nul & start /b ping -n 2 127.0.0.1 >nul & start /b ping -n 2 127.0.0.1 >nul & echo ok",
  ]);
  const wideRun = await run(wide.command, wide.args);
  const narrowRun = await run(narrow.command, narrow.args);
  record("control: a roomy process cap lets a small tree run", wideRun.err.trim() === "", wideRun.err.slice(0, 80));
  record(
    "limit holds: a process tree over its cap is stopped",
    narrowRun.err.trim() !== "",
    "no error: the cap did not hold",
  );

  const marker = "-n 53";
  const lingering = hostCommand(host, {}, CMD, ["/c", `ping ${marker} 127.0.0.1 >nul`]);
  const child = spawn(lingering.command, lingering.args, { windowsHide: true, stdio: "ignore" });
  const count = () =>
    new Promise<string>((done) => {
      execFile(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `(Get-CimInstance Win32_Process -Filter "Name='PING.EXE'" | Where-Object { $_.CommandLine -like '*${marker}*' } | Measure-Object).Count`,
        ],
        { windowsHide: true },
        (_error, stdout) => done(stdout.trim()),
      );
    });
  await new Promise((wait) => setTimeout(wait, 1500));
  const before = await count();
  child.kill();
  await new Promise((wait) => setTimeout(wait, 1500));
  const after = await count();
  record(
    "kill on close: everything the helper started ends with it",
    before === "1" && after === "0",
    `before ${before}, after ${after}`,
  );

  // Isolation that cannot be done must not start the program at all.
  const marked = join(root, "must-not-run.txt");
  const refused = inContainer(
    [{ path: join(root, "no-such-folder"), write: false }],
    CMD,
    ["/c", "echo ran> must-not-run.txt"],
    granted,
  );
  const refusedRun = await run(refused.command, refused.args);
  record(
    "fail closed: when isolation cannot be set up the program does not start",
    refusedRun.code === 125 && !existsSync(join(granted, "must-not-run.txt")) && !existsSync(marked),
    `exit ${refusedRun.code}`,
  );

  // Clean up everything this test made.
  const revoke = revokeCommand(host, container, [granted, outside]);
  await run(revoke.command, revoke.args);
  const drop = deleteProfileCommand(host, container);
  const dropped = await run(drop.command, drop.args);
  record("clean-up: the test container is removed again", dropped.code === 0, `exit ${dropped.code}`);
  if (!keep) await rm(root, { recursive: true, force: true });

  const failed = results.filter((item) => !item.ok);
  console.log(
    failed.length === 0
      ? `G5 ESCAPE TEST: PASS (${results.length} checks)`
      : `G5 ESCAPE TEST: FAIL (${failed.length} of ${results.length} checks)`,
  );
  return failed.length === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.log(`FAIL script: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
