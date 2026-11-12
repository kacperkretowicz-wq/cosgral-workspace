import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { installWindowsCleanStop } from "./embedded-postgres-windows-stop.js";

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  exit(code = 0) {
    this.exitCode = code;
    this.emit("exit", code, null);
  }
}

function makeInstance(child: FakeChild | undefined) {
  const forcedStop = vi.fn(async function (this: { process?: FakeChild }) {
    this.process = undefined;
  });
  const instance: { process?: FakeChild; stop: () => Promise<void> } = { process: child, stop: forcedStop };
  return { instance, forcedStop };
}

describe("installWindowsCleanStop", () => {
  it("stops through pg_ctl and skips the forced taskkill stop", async () => {
    const child = new FakeChild();
    const { instance, forcedStop } = makeInstance(child);
    const runPgCtl = vi.fn(async () => {
      child.exit(0);
      return 0;
    });
    installWindowsCleanStop(instance, { dataDir: "C:\\data\\db", pgCtlPath: "C:\\bin\\pg_ctl.exe", platform: "win32", runPgCtl });
    await instance.stop();
    expect(runPgCtl).toHaveBeenCalledWith("C:\\bin\\pg_ctl.exe", ["stop", "-D", "C:\\data\\db", "-m", "fast", "-w", "-t", "30"]);
    expect(forcedStop).not.toHaveBeenCalled();
    expect(instance.process).toBeUndefined();
  });

  it("falls back to the forced stop when pg_ctl fails", async () => {
    const child = new FakeChild();
    const { instance, forcedStop } = makeInstance(child);
    const log = vi.fn();
    installWindowsCleanStop(instance, {
      dataDir: "C:\\data\\db",
      pgCtlPath: "C:\\bin\\pg_ctl.exe",
      platform: "win32",
      runPgCtl: async () => 1,
      log,
    });
    await instance.stop();
    expect(forcedStop).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalled();
  });

  it("does not wait on a process that already exited", async () => {
    const child = new FakeChild();
    child.exit(1);
    const { instance, forcedStop } = makeInstance(child);
    const runPgCtl = vi.fn(async () => 0);
    installWindowsCleanStop(instance, { dataDir: "C:\\data\\db", pgCtlPath: "C:\\bin\\pg_ctl.exe", platform: "win32", runPgCtl });
    await instance.stop();
    expect(runPgCtl).not.toHaveBeenCalled();
    expect(forcedStop).not.toHaveBeenCalled();
    expect(instance.process).toBeUndefined();
  });

  it("leaves other platforms and missing pg_ctl untouched", () => {
    const { instance, forcedStop } = makeInstance(new FakeChild());
    installWindowsCleanStop(instance, { dataDir: "/data", pgCtlPath: "/bin/pg_ctl", platform: "linux" });
    expect(instance.stop).toBe(forcedStop);
    installWindowsCleanStop(instance, { dataDir: "C:\\data", pgCtlPath: null, platform: "win32" });
    expect(instance.stop).toBe(forcedStop);
  });
});
