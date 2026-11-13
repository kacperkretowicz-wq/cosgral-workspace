// @vitest-environment node
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseKeyCombination } from "./computer-driver";
import { WINDOWS_HELPER_SCRIPT, WindowsComputerDriver } from "./computer-driver-windows";

// A stand-in for the PowerShell helper: the same JSON lines, no Windows API and no input.
const FAKE_HELPER = `
const readline = require("node:readline");
console.log(JSON.stringify({ ready: true }));
const window = { handle: "42", title: "Test", processId: 7, processName: "notepad",
  bounds: { x: 0, y: 0, width: 100, height: 50 }, minimized: false, foreground: true, elevated: false };
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  const reply = (result) => console.log(JSON.stringify({ id: request.id, ok: true, result }));
  switch (request.op) {
    case "state":
      return reply({ inputDesktop: "Default", locked: false, uacPrompt: false,
        screen: { x: -1920, y: 0, width: 3840, height: 1080 }, foreground: window });
    case "windows":
      return reply([window]);
    case "click":
      return reply(request.dryRun ? { dryRun: true, inputs: [{ type: "mouse", flags: 32769 }] } : { sent: 3 });
    case "type":
      if (request.text === "slow") return;
      return reply({ sent: request.text.length * 2 });
    default:
      return console.log(JSON.stringify({ id: request.id, ok: false, error: "Unknown step: " + request.op }));
  }
});
`;

const roots: string[] = [];
const drivers: WindowsComputerDriver[] = [];
afterEach(async () => {
  await Promise.all(drivers.splice(0).map((driver) => driver.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function driver(options: { dryRun?: boolean; stepTimeoutMs?: number } = {}) {
  const workDir = await mkdtemp(join(tmpdir(), "computer-driver-"));
  roots.push(workDir);
  let spawned = 0;
  const instance = new WindowsComputerDriver({
    ...options,
    workDir,
    platform: "win32",
    spawnHelper: () => {
      spawned += 1;
      return spawn(process.execPath, ["-e", FAKE_HELPER], { stdio: ["pipe", "pipe", "pipe"] });
    },
  });
  drivers.push(instance);
  return { instance, workDir, spawned: () => spawned };
}

describe("WindowsComputerDriver", () => {
  it("talks JSON lines with one helper process and parses its answers", async () => {
    const { instance, workDir, spawned } = await driver();
    const state = await instance.state();
    expect(state).toMatchObject({ locked: false, uacPrompt: false, screen: { x: -1920, width: 3840 } });
    expect(state.foreground).toMatchObject({ handle: "42", processName: "notepad", elevated: false });
    expect(await instance.listWindows()).toHaveLength(1);
    await instance.click(10, 10, "left", 2);
    await instance.typeText("hello");
    expect(spawned()).toBe(1);
    await expect(instance.scroll(0, 0, 0, 1)).rejects.toThrow("Unknown step: scroll");

    const script = await readFile(join(workDir, (await import("node:fs")).readdirSync(workDir)[0] ?? ""), "utf8");
    expect(script.charCodeAt(0)).toBe(0xfeff);
    expect(script).toContain("SendInput");
  });

  it("stops a step in progress at once and starts a new helper for the next step", async () => {
    const { instance, spawned } = await driver();
    await instance.state();
    const slow = instance.typeText("slow");
    await new Promise((resolve) => setTimeout(resolve, 50));
    instance.cancel();
    await expect(slow).rejects.toThrow("Stopped.");
    await instance.typeText("again");
    expect(spawned()).toBe(2);
  });

  it("gives up on a step that hangs", async () => {
    const { instance } = await driver({ stepTimeoutMs: 300 });
    await expect(instance.typeText("slow")).rejects.toThrow(/took longer than/);
  });

  it("sends nothing in dry-run mode and keeps what it would send", async () => {
    const { instance } = await driver({ dryRun: true });
    await instance.click(5, 5, "left", 1);
    expect(instance.lastDryRun).toEqual([{ type: "mouse", flags: 32769 }]);
  });

  it("is unavailable outside Windows", async () => {
    const outside = new WindowsComputerDriver({ platform: "linux" });
    expect(outside.unavailableReason()).toMatch(/Windows/);
    await expect(outside.state()).rejects.toThrow(/Windows/);
  });

  it("ships a helper that Windows PowerShell 5.1 can compile (C# 5, no newer syntax)", () => {
    const csharp = WINDOWS_HELPER_SCRIPT.slice(WINDOWS_HELPER_SCRIPT.indexOf("using System;"));
    expect(csharp).not.toMatch(/\$"|\?\.|=>\s*[^;]*;\s*$|nameof\(/m);
    expect(WINDOWS_HELPER_SCRIPT).toContain("Add-Type -TypeDefinition $source");
  });
});

describe("parseKeyCombination", () => {
  it("normalizes names and refuses unknown or dangerous combinations", () => {
    expect(parseKeyCombination("Ctrl+Shift+S", 4)).toEqual(["ctrl", "shift", "s"]);
    expect(parseKeyCombination("cmd + esc", 4)).toEqual(["win", "escape"]);
    expect(parseKeyCombination("enter", 4)).toEqual(["enter"]);
    expect(() => parseKeyCombination("ctrl+banana", 4)).toThrow(/Unknown key/);
    expect(() => parseKeyCombination("win+l", 4)).toThrow(/not allowed/);
    expect(() => parseKeyCombination("alt+ctrl+del", 4)).toThrow(/not allowed/);
    expect(() => parseKeyCombination("a+b+c+d+e", 4)).toThrow(/at most 4/);
    expect(() => parseKeyCombination("", 4)).toThrow();
  });
});
