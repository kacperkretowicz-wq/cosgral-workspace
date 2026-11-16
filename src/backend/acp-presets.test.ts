// @vitest-environment node
// COSGRAL W6-BE5: ready ACP agent settings in Providers: found in PATH or given by the person, never installed or started.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { AgentEvent } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { AcpPresets, findCommandInPath } from "./acp-presets";
import { ProviderRegistry } from "./provider-registry";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function folder(...names: string[]) {
  const root = await mkdtemp(join(tmpdir(), "cosgral-presets-"));
  roots.push(root);
  const bin = join(root, "bin dir");
  await mkdir(bin, { recursive: true });
  for (const name of names) await writeFile(join(bin, name), "");
  return { root, bin };
}

async function setup(commands: Record<string, string | null> = {}, existing: string[] = []) {
  const { root } = await folder();
  const database = testDatabase(root);
  await database.initialize();
  const registry = new ProviderRegistry({ database, emit: (_event: AgentEvent) => undefined, timers: false });
  const presets = new AcpPresets({
    registry,
    find: (command) => commands[command] ?? null,
    isFile: (path) => existing.includes(path),
  });
  return { registry, presets };
}

describe("findCommandInPath", () => {
  it("finds a command in PATH with the extensions Windows tries, in PATH order", async () => {
    const first = await folder("gemini.cmd");
    const second = await folder("gemini.exe", "agy.exe");
    const path = [first.bin, second.bin].join(";");
    // Windows file names do not care about case; the extension comes as PATHEXT writes it (".CMD").
    const find = (command: string) => findCommandInPath(command, { path, platform: "win32", pathExt: ".EXE;.CMD" });
    expect(find("gemini")?.toLowerCase()).toBe(join(first.bin, "gemini.cmd").toLowerCase());
    expect(find("agy")?.toLowerCase()).toBe(join(second.bin, "agy.exe").toLowerCase());
    expect(find("agy.exe")?.toLowerCase()).toBe(join(second.bin, "agy.exe").toLowerCase());
    expect(findCommandInPath("nope", { path, platform: "win32", pathExt: ".EXE" })).toBeNull();
  });

  it("looks for the plain name elsewhere, and ignores an empty or missing PATH", async () => {
    const found = await folder("gemini");
    expect(findCommandInPath("gemini", { path: `${found.bin}${delimiter}`, platform: "linux" })).toBe(
      join(found.bin, "gemini"),
    );
    expect(findCommandInPath("gemini", { path: "", platform: "linux" })).toBeNull();
    expect(findCommandInPath("gemini", { path: `"${found.bin}"`, platform: "win32", pathExt: "" })).toBeNull();
  });
});

describe("AcpPresets", () => {
  it("lists both presets with what is found on this computer and what is already added", async () => {
    const { presets, registry } = await setup({ agy: "C:\\Tools\\agy.exe" });
    expect(presets.list().map((item) => [item.id, item.command, item.args, item.detectedCommand, item.added])).toEqual([
      ["gemini", "gemini", ["--acp"], null, false],
      ["antigravity", "agy", ["acp"], "C:\\Tools\\agy.exe", false],
    ]);
    presets.add({ presetId: "antigravity" });
    expect(presets.list().find((item) => item.id === "antigravity")?.added).toBe(true);
    expect(registry.listAcpAgents()).toHaveLength(1);
  });

  it("adds the found command with the preset's arguments", async () => {
    const { presets, registry } = await setup({ agy: "C:\\Tools\\agy.exe" });
    const added = presets.add({ presetId: "antigravity" });
    expect(added).toMatchObject({
      id: "antigravity",
      name: "Antigravity",
      command: "C:\\Tools\\agy.exe",
      args: ["acp"],
    });
    expect(registry.listAcpAgents().map((agent) => agent.id)).toEqual(["antigravity"]);
  });

  it("refuses when nothing is found and nothing is given, and says where to install from", async () => {
    const { presets, registry } = await setup();
    expect(() => presets.add({ presetId: "gemini" })).toThrow(/not found on this computer.*official page/);
    expect(registry.listAcpAgents()).toEqual([]);
  });

  it("takes the command the person gives: a full path that exists, or a name found in PATH; refuses the rest", async () => {
    const path = join("C:\\", "Tools", "gemini.cmd");
    const { presets, registry } = await setup({ gemini: "C:\\npm\\gemini.cmd" }, [path]);
    expect(presets.add({ presetId: "gemini", command: path }).command).toBe(path);
    expect(presets.add({ presetId: "gemini", command: "gemini" }).command).toBe("C:\\npm\\gemini.cmd");
    expect(() => presets.add({ presetId: "gemini", command: "C:\\nowhere\\gemini.exe" })).toThrow(
      /no program at this path/i,
    );
    expect(() => presets.add({ presetId: "gemini", command: "tools\\gemini.exe" })).toThrow(/full path/);
    expect(() => presets.add({ presetId: "gemini", command: "unknown-cli" })).toThrow(/was not found/);
    expect(() => presets.add({ presetId: "grok" })).toThrow(/ready settings/);
    expect(registry.listAcpAgents()).toHaveLength(1);
  });

  it("adding again updates the agent instead of adding a second one", async () => {
    const { presets, registry } = await setup({ agy: "C:\\Tools\\agy.exe" });
    presets.add({ presetId: "antigravity" });
    presets.add({ presetId: "antigravity" });
    expect(registry.listAcpAgents()).toHaveLength(1);
  });
});
