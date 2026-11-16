// COSGRAL W6-BE5: ready settings for ACP agents in Providers (Gemini CLI, Antigravity). A preset only FILLS IN the form of an ACP
// agent: the command, its arguments and a name. It is offered with the command found on this computer (in PATH), or the person
// gives the command themselves. The program never installs anything and never runs the command to add it; the link to the
// official installation is shown instead (installing from the internet is the owner's decision).
// This computer only.

import type { AcpAgentConfig } from "./ipc-providers";
import { isBoolean, isDynamicRecord, isString } from "./runtime-values";

export interface AcpAgentPreset {
  id: string;
  name: string;
  /** The command that starts the agent (a name looked up in PATH). */
  command: string;
  /** The arguments that make it speak ACP over stdio. */
  args: string[];
  /** The official page to install it from (shown, never opened or run by the program). */
  installUrl: string;
}

/**
 * Gemini CLI: `gemini --acp` (older versions: `--experimental-acp`; 0.68.0 answers both). Antigravity CLI: `agy acp`.
 * Sources: the documentation of each (google-gemini.github.io/gemini-cli, antigravity.google/docs).
 */
export const ACP_AGENT_PRESETS: readonly AcpAgentPreset[] = [
  {
    id: "gemini",
    name: "Gemini CLI",
    command: "gemini",
    args: ["--acp"],
    installUrl: "https://google-gemini.github.io/gemini-cli",
  },
  {
    id: "antigravity",
    name: "Antigravity",
    command: "agy",
    args: ["acp"],
    installUrl: "https://antigravity.google/docs/getting-started?tab=cli",
  },
];

export interface AcpPresetInfo extends AcpAgentPreset {
  /** The command as found on this computer (an absolute path), else null (the person installs it or gives its path). */
  detectedCommand: string | null;
  /** The agent with this id is already in Providers. */
  added: boolean;
}

export interface AddAcpPresetInput {
  presetId: string;
  /** The command the person gives (a path or a name); left out: the detected one. Without either, adding is refused. */
  command?: string | null;
}

/** `window.openbot.acpPresets` (this computer only). */
export interface AcpPresetsDesktopApi {
  list: () => Promise<AcpPresetInfo[]>;
  /** Adds the agent to Providers with the preset's arguments. Nothing is installed or started. */
  add: (input: AddAcpPresetInput) => Promise<AcpAgentConfig>;
}

export const ACP_PRESET_COMMAND_LIMIT = 520;

/** Why a preset cannot be added with this command (the person gave none and none was found), or null. */
export function acpPresetProblem(
  preset: Pick<AcpPresetInfo, "name" | "detectedCommand">,
  command: string | null,
): string | null {
  if (command || preset.detectedCommand) return null;
  return `${preset.name} was not found on this computer. Install it from its official page, or give the path of its command.`;
}

export function isAcpPresetInfo(value: unknown): value is AcpPresetInfo {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.command) &&
    Array.isArray(value.args) &&
    value.args.every(isString) &&
    isString(value.installUrl) &&
    (value.detectedCommand === null || isString(value.detectedCommand)) &&
    isBoolean(value.added)
  );
}

export function isAcpPresetInfoList(value: unknown): value is AcpPresetInfo[] {
  return Array.isArray(value) && value.every(isAcpPresetInfo);
}

export function parseAddAcpPresetInput(value: unknown): AddAcpPresetInput {
  if (!isDynamicRecord(value)) throw new Error("Expected an object.");
  const presetId = value.presetId;
  if (!isString(presetId) || !ACP_AGENT_PRESETS.some((preset) => preset.id === presetId)) {
    throw new Error("Choose one of the ready settings.");
  }
  const command = value.command;
  if (command !== undefined && command !== null) {
    if (!isString(command)) throw new Error("The command must be text.");
    if (command.length > ACP_PRESET_COMMAND_LIMIT) throw new Error("The command is too long.");
    if (/[\r\n\0]/.test(command)) throw new Error("The command is one line.");
  }
  return { presetId, command: isString(command) && command.trim() ? command.trim() : null };
}
