// COSGRAL W6-BE5: ready settings for ACP agents in Providers (Gemini CLI, Antigravity). The program looks for the command in PATH
// and adds the agent only when the command is found or the person gives it. It never installs anything, never runs the command
// to add it, and never opens the installation page (the window shows the link).

import { statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import {
  ACP_AGENT_PRESETS,
  type AcpAgentConfig,
  type AcpPresetInfo,
  type AddAcpPresetInput,
  acpPresetProblem,
} from "@openbot/contracts/ipc";
import type { ProviderRegistry } from "./provider-registry";

type Registry = Pick<ProviderRegistry, "listAcpAgents" | "saveAcpAgent">;

export interface FindCommandOptions {
  path?: string;
  /** Windows: the extensions a command may have (PATHEXT). */
  pathExt?: string;
  platform?: NodeJS.Platform;
  isFile?: (path: string) => boolean;
}

function isRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** The absolute path of a command found in PATH (with the extensions Windows tries), else null. */
export function findCommandInPath(command: string, options: FindCommandOptions = {}): string | null {
  const platform = options.platform ?? process.platform;
  const isFile = options.isFile ?? isRegularFile;
  const directories = (options.path ?? process.env.PATH ?? "")
    .split(platform === "win32" ? ";" : delimiter)
    .filter(Boolean);
  const extensions =
    platform === "win32"
      ? (options.pathExt ?? process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
      : [];
  const hasExtension = extensions.some((extension) => command.toLowerCase().endsWith(extension.toLowerCase()));
  const names =
    platform === "win32"
      ? hasExtension
        ? [command]
        : extensions.map((extension) => `${command}${extension}`)
      : [command];
  for (const directory of directories) {
    for (const name of names) {
      const candidate = join(directory.replace(/^"|"$/g, ""), name);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

export interface AcpPresetsOptions {
  registry: Registry;
  /** For tests: where commands are looked for. */
  find?: (command: string) => string | null;
  isFile?: (path: string) => boolean;
}

export class AcpPresets {
  readonly #registry: Registry;
  readonly #find: (command: string) => string | null;
  readonly #isFile: (path: string) => boolean;

  constructor(options: AcpPresetsOptions) {
    this.#registry = options.registry;
    this.#find = options.find ?? ((command) => findCommandInPath(command));
    this.#isFile = options.isFile ?? isRegularFile;
  }

  list(): AcpPresetInfo[] {
    const added = new Set(this.#registry.listAcpAgents().map((agent) => agent.id));
    return ACP_AGENT_PRESETS.map((preset) => ({
      ...preset,
      args: [...preset.args],
      detectedCommand: this.#find(preset.command),
      added: added.has(preset.id),
    }));
  }

  /** Adds the agent to Providers. The command is the one the person gave, else the one found in PATH. Nothing is started. */
  add(input: AddAcpPresetInput): AcpAgentConfig {
    const info = this.list().find((preset) => preset.id === input.presetId);
    if (!info) throw new Error("Choose one of the ready settings.");
    const given = input.command ? this.#resolveGiven(input.command) : null;
    const problem = acpPresetProblem(info, given);
    if (problem) throw new Error(problem);
    const command = given ?? info.detectedCommand;
    if (!command) throw new Error(`${info.name} was not found on this computer.`);
    return this.#registry.saveAcpAgent({ id: info.id, name: info.name, command, args: info.args });
  }

  /** A command the person gave: the full path of a file that exists, or a name found in PATH. Anything else is refused. */
  #resolveGiven(value: string): string {
    if (isAbsolute(value)) {
      if (!this.#isFile(value)) throw new Error("There is no program at this path.");
      return value;
    }
    if (/[\\/]/.test(value)) throw new Error("Give the full path of the command, or only its name.");
    const found = this.#find(value);
    if (!found) throw new Error(`"${value}" was not found on this computer. Give the full path of the command.`);
    return found;
  }
}
