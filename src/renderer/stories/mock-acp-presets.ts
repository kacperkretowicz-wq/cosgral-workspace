// COSGRAL W6-BE5: the ready ACP agent settings for Storybook and the preview. Demo data only. The same rules as the program: a
// preset is added only with a command that is found or given, nothing is installed or started, and adding again updates it.

import {
  ACP_AGENT_PRESETS,
  type AcpAgentConfig,
  type AcpPresetInfo,
  type AcpPresetsDesktopApi,
  acpPresetProblem,
} from "@openbot/contracts/ipc";

export interface MockAcpPresets extends Required<AcpPresetsDesktopApi> {
  /** A story decides which commands "are found on this computer" (preset id to a path). */
  detect: (found: Record<string, string>) => void;
}

export function createMockAcpPresets(
  found: Record<string, string> = { gemini: "C:\\Tools\\gemini.cmd" },
): MockAcpPresets {
  let detected = { ...found };
  const added = new Map<string, AcpAgentConfig>();
  const info = (): AcpPresetInfo[] =>
    ACP_AGENT_PRESETS.map((preset) => ({
      ...preset,
      args: [...preset.args],
      detectedCommand: detected[preset.id] ?? null,
      added: added.has(preset.id),
    }));

  return {
    detect: (next) => {
      detected = { ...next };
    },
    list: async () => info(),
    add: async ({ presetId, command }) => {
      const preset = info().find((item) => item.id === presetId);
      if (!preset) throw new Error("Choose one of the ready settings.");
      const problem = acpPresetProblem(preset, command ?? null);
      if (problem) throw new Error(problem);
      const at = "2026-11-16T12:00:00.000Z";
      const config: AcpAgentConfig = {
        id: preset.id,
        name: preset.name,
        command: command ?? preset.detectedCommand ?? preset.command,
        args: [...preset.args],
        createdAt: added.get(preset.id)?.createdAt ?? at,
        updatedAt: at,
      };
      added.set(preset.id, config);
      return structuredClone(config);
    },
  };
}
