import { describe, expect, it } from "vitest";
import {
  ACP_AGENT_PRESETS,
  type AcpPresetInfo,
  acpPresetProblem,
  IPC_CHANNELS,
  isAcpPresetInfo,
  isAcpPresetInfoList,
  parseAddAcpPresetInput,
} from "./ipc";

const info: AcpPresetInfo = {
  id: "gemini",
  name: "Gemini CLI",
  command: "gemini",
  args: ["--acp"],
  installUrl: "https://example.test/install",
  detectedCommand: null,
  added: false,
};

describe("ACP presets contract", () => {
  it("has the two agents with the arguments that make them speak ACP", () => {
    expect(ACP_AGENT_PRESETS.map((preset) => [preset.id, preset.command, preset.args])).toEqual([
      ["gemini", "gemini", ["--acp"]],
      ["antigravity", "agy", ["acp"]],
    ]);
    for (const preset of ACP_AGENT_PRESETS) expect(preset.installUrl).toMatch(/^https:\/\//);
  });

  it("refuses to add when the command is neither found nor given, and says where to install from", () => {
    expect(acpPresetProblem({ name: "Gemini CLI", detectedCommand: null }, null)).toMatch(
      /not found on this computer.*official page/,
    );
    expect(acpPresetProblem({ name: "Gemini CLI", detectedCommand: "C:\\tools\\gemini.cmd" }, null)).toBeNull();
    expect(acpPresetProblem({ name: "Gemini CLI", detectedCommand: null }, "C:\\tools\\gemini.cmd")).toBeNull();
  });

  it("parses the window's call: only a known preset and one line of command", () => {
    expect(parseAddAcpPresetInput({ presetId: "gemini" })).toEqual({ presetId: "gemini", command: null });
    expect(parseAddAcpPresetInput({ presetId: "antigravity", command: "  C:\\x\\agy.exe  " }).command).toBe(
      "C:\\x\\agy.exe",
    );
    expect(parseAddAcpPresetInput({ presetId: "gemini", command: "   " }).command).toBeNull();
    expect(() => parseAddAcpPresetInput({ presetId: "grok" })).toThrow(/ready settings/);
    expect(() => parseAddAcpPresetInput({ presetId: "gemini", command: 4 })).toThrow(/text/);
    expect(() => parseAddAcpPresetInput({ presetId: "gemini", command: "a\nb" })).toThrow(/one line/);
    expect(() => parseAddAcpPresetInput({ presetId: "gemini", command: "x".repeat(600) })).toThrow(/too long/);
    expect(() => parseAddAcpPresetInput(null)).toThrow();
  });

  it("recognises the answers", () => {
    expect(isAcpPresetInfo(info)).toBe(true);
    expect(isAcpPresetInfo({ ...info, added: "no" })).toBe(false);
    expect(isAcpPresetInfo({ ...info, args: [1] })).toBe(false);
    expect(isAcpPresetInfoList([info, info])).toBe(true);
    expect(isAcpPresetInfoList([info, {}])).toBe(false);
  });

  it("has channels", () => {
    expect(IPC_CHANNELS.acpPresetsList).toBe("acp-presets:list");
    expect(IPC_CHANNELS.acpPresetsAdd).toBe("acp-presets:add");
  });
});
