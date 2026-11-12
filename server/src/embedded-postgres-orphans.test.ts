import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  reapOrphanedEmbeddedPostgresChildren,
  selectOrphanedPostgresChildren,
  type PostgresProcessInfo,
} from "./embedded-postgres-orphans.js";

const BIN = "C:\\repo\\node_modules\\@embedded-postgres\\windows-x64\\native\\bin";
const OTHER_BIN = "C:\\other-checkout\\node_modules\\@embedded-postgres\\windows-x64\\native\\bin";
const LIVE = new Set([1, 2222, 3333]);
const isPidRunning = (pid: number) => LIVE.has(pid);

const processes: PostgresProcessInfo[] = [
  // children of the dead postmaster 17200 (rule A)
  { pid: 4380, parentPid: 17200, name: "postgres.exe", executablePath: `${BIN}\\postgres.exe`, commandLine: `"${BIN}/postgres.exe" --forkchild="backend" 123` },
  { pid: 5000, parentPid: 17200, name: "node.exe", executablePath: "C:\\node\\node.exe", commandLine: "node x" },
  // forkchild of another dead postmaster, same checkout binary (rule B)
  { pid: 4500, parentPid: 9999, name: "postgres.exe", executablePath: `${BIN.replace(/\\/g, "/")}/postgres.exe`, commandLine: `"${BIN}\\postgres.exe" --forkchild="autovac" 77` },
  // live postmaster of this checkout whose node parent died: must survive
  { pid: 2222, parentPid: 8888, name: "postgres.exe", executablePath: `${BIN}\\postgres.exe`, commandLine: `"${BIN}\\postgres.exe" -D C:/data -p 54340` },
  // child of that live postmaster: must survive
  { pid: 2300, parentPid: 2222, name: "postgres.exe", executablePath: `${BIN}\\postgres.exe`, commandLine: `"${BIN}\\postgres.exe" --forkchild="backend" 9` },
  // orphan of another checkout: not ours
  { pid: 6000, parentPid: 7777, name: "postgres.exe", executablePath: `${OTHER_BIN}\\postgres.exe`, commandLine: `"${OTHER_BIN}\\postgres.exe" --forkchild="backend" 5` },
];

function pidFile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "pg orphan "));
  const file = join(dir, "postmaster.pid");
  writeFileSync(file, contents);
  return file;
}

describe("selectOrphanedPostgresChildren", () => {
  it("selects children of the dead postmaster and dead-parent forkchildren of this checkout only", () => {
    expect(
      selectOrphanedPostgresChildren(processes, { deadPostmasterPid: 17200, binaryDir: BIN, isPidRunning }),
    ).toEqual([4380, 4500]);
  });

  it("without a binary dir only uses the dead postmaster pid", () => {
    expect(
      selectOrphanedPostgresChildren(processes, { deadPostmasterPid: 17200, binaryDir: null, isPidRunning }),
    ).toEqual([4380]);
  });

  it("falls back to the command line when Windows hides ExecutablePath", () => {
    // Real shape seen on Windows 10: the orphan reports ExecutablePath null.
    const hidden: PostgresProcessInfo[] = [
      {
        pid: 4380,
        parentPid: 17200,
        name: "postgres.exe",
        executablePath: null,
        commandLine: `"${BIN.replace(/\\/g, "/")}/postgres.exe" --forkchild="backend" 1234`,
      },
      { pid: 4390, parentPid: 17200, name: "postgres.exe", executablePath: null, commandLine: null },
    ];
    expect(
      selectOrphanedPostgresChildren(hidden, { deadPostmasterPid: null, binaryDir: BIN.toUpperCase(), isPidRunning }),
    ).toEqual([4380]);
  });

  it("without a pid file still finds dead-parent forkchildren of this checkout", () => {
    expect(
      selectOrphanedPostgresChildren(processes, { deadPostmasterPid: null, binaryDir: BIN, isPidRunning }),
    ).toEqual([4380, 4500]);
  });
});

describe("reapOrphanedEmbeddedPostgresChildren", () => {
  it("kills orphans on Windows when the recorded postmaster is dead", async () => {
    const killProcess = vi.fn(async (_pid: number) => {});
    const killed = await reapOrphanedEmbeddedPostgresChildren({
      postmasterPidFile: pidFile("17200\r\nC:/data/db\r\n1794486925\r\n54340\r\n"),
      platform: "win32",
      binaryDir: BIN,
      isPidRunning,
      listProcesses: async () => processes,
      killProcess,
      waitForExitMs: 0,
    });
    expect(killed).toEqual([4380, 4500]);
    expect(killProcess.mock.calls.map(([pid]) => pid)).toEqual([4380, 4500]);
  });

  it("works when a previous attempt already removed postmaster.pid", async () => {
    const killed = await reapOrphanedEmbeddedPostgresChildren({
      postmasterPidFile: join(tmpdir(), "missing-dir-for-test", "postmaster.pid"),
      platform: "win32",
      binaryDir: BIN,
      isPidRunning,
      listProcesses: async () => processes,
      killProcess: async () => {},
      waitForExitMs: 0,
    });
    expect(killed).toEqual([4380, 4500]);
  });

  it("does nothing outside Windows", async () => {
    const listProcesses = vi.fn(async () => processes);
    expect(
      await reapOrphanedEmbeddedPostgresChildren({
        postmasterPidFile: pidFile("17200\n"),
        platform: "linux",
        binaryDir: BIN,
        isPidRunning,
        listProcesses,
        killProcess: async () => {},
      }),
    ).toEqual([]);
    expect(listProcesses).not.toHaveBeenCalled();
  });

  it("does not list processes when there is nothing to scope by", async () => {
    const listProcesses = vi.fn(async () => processes);
    expect(
      await reapOrphanedEmbeddedPostgresChildren({
        postmasterPidFile: pidFile("2222\n"), // live postmaster
        platform: "win32",
        binaryDir: null,
        isPidRunning,
        listProcesses,
        killProcess: async () => {},
      }),
    ).toEqual([]);
    expect(listProcesses).not.toHaveBeenCalled();
  });
});
