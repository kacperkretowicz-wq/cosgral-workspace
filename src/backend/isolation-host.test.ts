// @vitest-environment node
// COSGRAL W8-BE2: the Job Object / AppContainer host on a real Windows (spec-w8.md 1B, W8-09, W8-10, W8-11). It builds the
// helper with the compiler of the .NET Framework, then starts harmless Windows programs (`cmd.exe`, `ping`) in it. Everything
// it touches is a folder it makes itself in the temp folder: two small folders with a text file each. Skipped on other systems.

import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canStartThroughHost,
  ensureIsolationHost,
  findCsc,
  hostCommand,
  deleteProfileCommand as hostCommandForDelete,
  revokeCommand,
  spawnThroughHost,
} from "./isolation-host";

const windows = process.platform === "win32";
const CMD = join(process.env.WINDIR ?? "C:\\Windows", "System32", "cmd.exe");

let root = "";
let host = "";
let secret = "";
let shared = "";

interface Outcome {
  code: number | null;
  out: string;
  err: string;
}

function run(command: string, args: string[], timeoutMs = 30_000): Promise<Outcome> {
  return new Promise((resolve) => {
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
      resolve({ code, out, err });
    });
  });
}

describe.runIf(windows)("isolation host (Job Object and AppContainer)", () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "cosgral-isolation-"));
    secret = join(root, "secret");
    shared = join(root, "shared");
    await mkdir(secret, { recursive: true });
    await mkdir(shared, { recursive: true });
    await writeFile(join(secret, "a.txt"), "SECRET-CANARY", "utf8");
    await writeFile(join(shared, "b.txt"), "SHARED-CANARY", "utf8");
    host = await ensureIsolationHost(join(root, "bin"));
  }, 120_000);

  afterAll(async () => {
    // The test container is removed again: nothing of the test stays on this computer.
    const remove = hostCommandForDelete(host, `cosgral.test.${process.pid}`);
    await run(remove.command, remove.args);
    await rm(root, { recursive: true, force: true });
  });

  it("finds the compiler of the .NET Framework and builds the helper once (it is reused after)", async () => {
    expect(findCsc()).not.toBeNull();
    expect(await ensureIsolationHost(join(root, "bin"))).toBe(host);
  });

  it("passes the exit code and the output of the program through unchanged", async () => {
    const seven = hostCommand(host, {}, CMD, ["/c", "exit 7"]);
    expect((await run(seven.command, seven.args)).code).toBe(7);
    const hello = hostCommand(host, {}, CMD, ["/c", "echo hello from the host"]);
    const outcome = await run(hello.command, hello.args);
    expect(outcome.code).toBe(0);
    expect(outcome.out).toContain("hello from the host");
  });

  it("keeps spaces and quotes in the arguments of the program", async () => {
    const file = join(root, "with space.txt");
    await writeFile(file, "SPACE-OK", "utf8");
    const command = hostCommand(host, {}, CMD, ["/c", "type", file]);
    const outcome = await run(command.command, command.args);
    expect(outcome.out).toContain("SPACE-OK");
  });

  it("starts the process of a Claude conversation through the helper, with its pipes and exit code intact", async () => {
    const child = spawnThroughHost(
      { host, maxProcesses: 50 },
      {
        command: CMD,
        args: ["/c", "echo through the helper& exit 3"],
        env: process.env,
        signal: new AbortController().signal,
      },
    );
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
    expect(out).toContain("through the helper");
    expect(code).toBe(3);
  });

  it("starts a shim or a script plainly (the helper starts programs, not scripts)", () => {
    expect(canStartThroughHost("C:\\tools\\claude.exe")).toBe(true);
    expect(canStartThroughHost("node")).toBe(true);
    expect(canStartThroughHost("C:\\tools\\claude.cmd")).toBe(false);
    expect(canStartThroughHost("cli.js")).toBe(false);
  });

  it("limits how many processes the program may have (W8-09)", async () => {
    const script =
      "start /b ping -n 3 127.0.0.1 >nul & start /b ping -n 3 127.0.0.1 >nul & start /b ping -n 3 127.0.0.1 >nul & echo finished";
    const wide = hostCommand(host, { maxProcesses: 20 }, CMD, ["/c", script]);
    const narrow = hostCommand(host, { maxProcesses: 2 }, CMD, ["/c", script]);
    const free = await run(wide.command, wide.args);
    const limited = await run(narrow.command, narrow.args);
    expect(free.err).toBe("");
    expect(`${limited.out}${limited.err}`).toMatch(/quota|not enough|przydzia/i);
  }, 60_000);

  it("ends everything the program started when the host itself is stopped (kill on close)", async () => {
    const marker = "-n 47";
    const command = hostCommand(host, {}, CMD, ["/c", `ping ${marker} 127.0.0.1 >nul`]);
    const child = spawn(command.command, command.args, { windowsHide: true, stdio: "ignore" });
    const find = () =>
      new Promise<string>((resolve) => {
        execFile(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `(Get-CimInstance Win32_Process -Filter "Name='PING.EXE'" | Where-Object { $_.CommandLine -like '*${marker}*' } | Measure-Object).Count`,
          ],
          { windowsHide: true },
          (_error, stdout) => resolve(stdout.trim()),
        );
      });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await find()).toBe("1");
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await find()).toBe("0");
  }, 60_000);

  it("an AppContainer process cannot read a folder it was not granted, and can read one it was (W8-10, G5)", async () => {
    const name = `cosgral.test.${process.pid}`;
    const denied = hostCommand(host, { appContainer: { name, grants: [{ path: shared, write: false }] } }, CMD, [
      "/c",
      "type",
      join(secret, "a.txt"),
    ]);
    const refused = await run(denied.command, denied.args);
    expect(refused.out).not.toContain("SECRET-CANARY");
    expect(refused.code).not.toBe(0);

    const allowed = hostCommand(host, { appContainer: { name, grants: [{ path: shared, write: false }] } }, CMD, [
      "/c",
      "type",
      join(shared, "b.txt"),
    ]);
    const granted = await run(allowed.command, allowed.args);
    expect(granted.out).toContain("SHARED-CANARY");
    expect(granted.code).toBe(0);
  }, 60_000);

  it("a write needs a write grant; a read grant is not enough", async () => {
    const name = `cosgral.test.${process.pid}`;
    const target = join(shared, "written.txt");
    // The folder is the working folder, so the command needs no path (cmd.exe does not read quotes like other programs).
    const readOnly = hostCommand(
      host,
      { cwd: shared, appContainer: { name, grants: [{ path: shared, write: false }] } },
      CMD,
      ["/c", "echo changed> written.txt"],
    );
    await run(readOnly.command, readOnly.args);
    expect(await readFile(target, "utf8").catch(() => "none")).toBe("none");
    const writable = hostCommand(
      host,
      { cwd: shared, appContainer: { name, grants: [{ path: shared, write: true }] } },
      CMD,
      ["/c", "echo changed> written.txt"],
    );
    const outcome = await run(writable.command, writable.args);
    expect(outcome.code).toBe(0);
    expect(await readFile(target, "utf8")).toContain("changed");
  }, 60_000);

  it("takes the grants back after the program ends, so the folder is closed again", async () => {
    const name = `cosgral.test.${process.pid}`;
    const open = hostCommand(host, { appContainer: { name, grants: [{ path: shared, write: false }] } }, CMD, [
      "/c",
      "exit 0",
    ]);
    await run(open.command, open.args);
    // Same container, no grant now: the folder from the run before is closed again.
    const closed = hostCommand(host, { appContainer: { name, grants: [] } }, CMD, [
      "/c",
      "type",
      join(shared, "b.txt"),
    ]);
    const outcome = await run(closed.command, closed.args);
    expect(outcome.out).not.toContain("SHARED-CANARY");
    const revoke = revokeCommand(host, name, [shared]);
    expect((await run(revoke.command, revoke.args)).code).toBe(0);
  }, 60_000);

  it("does NOT start the program when isolation was asked for and cannot be done (exit 125, nothing runs unprotected)", async () => {
    const name = `cosgral.test.${process.pid}`;
    const marker = join(root, "should-not-exist.txt");
    const command = hostCommand(
      host,
      { appContainer: { name, grants: [{ path: join(root, "no-such-folder"), write: false }] } },
      CMD,
      ["/c", `echo ran> "${marker}"`],
    );
    const outcome = await run(command.command, command.args);
    expect(outcome.code).toBe(125);
    expect(outcome.err).toContain("COSGRAL-HOST");
    expect(await readFile(marker, "utf8").catch(() => "none")).toBe("none");
  }, 60_000);
});
