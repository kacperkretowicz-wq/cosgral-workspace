// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acpSpawnTarget, spawnAcpAgent } from "./acp-spawn";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("acpSpawnTarget", () => {
  it("starts a program directly, and a .cmd or .bat through cmd.exe on Windows only", () => {
    expect(acpSpawnTarget("agy.exe", ["acp"], "win32")).toEqual({
      file: "agy.exe",
      args: ["acp"],
      windowsVerbatimArguments: false,
    });
    expect(acpSpawnTarget("gemini", ["--acp"], "linux")).toEqual({
      file: "gemini",
      args: ["--acp"],
      windowsVerbatimArguments: false,
    });
    expect(acpSpawnTarget("/usr/bin/gemini.cmd", [], "linux").windowsVerbatimArguments).toBe(false);
    const shim = acpSpawnTarget(
      "C:\\Users\\a b\\npm\\gemini.cmd",
      ["--acp"],
      "win32",
      "C:\\Windows\\System32\\cmd.exe",
    );
    expect(shim).toEqual({
      file: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", '""C:\\Users\\a b\\npm\\gemini.cmd" "--acp""'],
      windowsVerbatimArguments: true,
    });
    expect(acpSpawnTarget("x.BAT", [], "win32").args.at(-1)).toBe('""x.BAT""');
  });

  it("refuses a .cmd whose path or arguments could be read by cmd.exe as more than text", () => {
    for (const bad of ['a"b', "100%", "a\nb"]) {
      expect(() => acpSpawnTarget("x.cmd", [bad], "win32")).toThrow(/cannot be started through cmd.exe/);
    }
    expect(() => acpSpawnTarget('C:\\a"b\\x.cmd', [], "win32")).toThrow(/cannot be started/);
  });
});

describe.runIf(process.platform === "win32")("spawnAcpAgent on Windows", () => {
  it("starts a .cmd shim in a folder with a space in its name and passes its arguments", async () => {
    const root = await mkdtemp(join(tmpdir(), "cosgral-spawn-"));
    roots.push(root);
    const folder = join(root, "shim test");
    await mkdir(folder, { recursive: true });
    const shim = join(folder, "fake agent.cmd");
    await writeFile(shim, "@echo off\r\necho args=%* \r\n");
    const child = spawnAcpAgent(shim, ["--acp", "two words"]);
    const output = await new Promise<string>((resolve, reject) => {
      let text = "";
      child.stdout.on("data", (chunk) => {
        text += String(chunk);
      });
      child.on("error", reject);
      child.on("exit", () => resolve(text));
    });
    // cmd.exe's `%*` gives the arguments as they were passed, each kept whole (the second one with its space).
    expect(output).toContain('"--acp" "two words"');
  });
});
