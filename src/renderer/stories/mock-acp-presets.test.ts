import { describe, expect, it } from "vitest";
import { createMockAcpPresets } from "./mock-acp-presets";

describe("mock ACP presets", () => {
  it("lists both agents with what 'is found' and what is added", async () => {
    const presets = createMockAcpPresets();
    expect((await presets.list()).map((item) => [item.id, item.detectedCommand, item.added])).toEqual([
      ["gemini", "C:\\Tools\\gemini.cmd", false],
      ["antigravity", null, false],
    ]);
  });

  it("adds a found command, refuses when none is found or given, and takes the one the person gives", async () => {
    const presets = createMockAcpPresets();
    expect(await presets.add({ presetId: "gemini" })).toMatchObject({
      id: "gemini",
      command: "C:\\Tools\\gemini.cmd",
      args: ["--acp"],
    });
    await expect(presets.add({ presetId: "antigravity" })).rejects.toThrow(/not found on this computer/);
    expect(await presets.add({ presetId: "antigravity", command: "D:\\agy.exe" })).toMatchObject({
      command: "D:\\agy.exe",
      args: ["acp"],
    });
    expect((await presets.list()).every((item) => item.added)).toBe(true);
    await expect(presets.add({ presetId: "grok" })).rejects.toThrow(/ready settings/);
  });

  it("a story can change what is found", async () => {
    const presets = createMockAcpPresets({});
    presets.detect({ antigravity: "C:\\Users\\demo\\AppData\\Local\\agy\\bin\\agy.exe" });
    expect((await presets.list()).find((item) => item.id === "antigravity")?.detectedCommand).toMatch(/agy\.exe$/);
  });
});
