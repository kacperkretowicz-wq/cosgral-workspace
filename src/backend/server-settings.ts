// COSGRAL W12 (BE-D): the settings of the server (contract: ipc-server-settings.ts). The values of General, Personality and Agents
// live in one small JSON file next to the program's data (atomic write, a damaged file or a bad field falls back to the default of
// that field). The Storage numbers come from the `measure` and `clearLogs` ports. The other sections are served by their own APIs.
// Effects: `busyMessageDefault()` is what the message queue uses for an agent set to "app default". The other values are stored
// and shown; the parts of the program that should obey them (turn limits, memory limit, memory review, skill learning) read them later.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  type AgentEvent,
  applyServerSettingsChanges,
  defaultServerSettings,
  isServerSettings,
  parseUpdateServerSettingsInput,
  type ServerBusyMessageMode,
  type ServerSettings,
  type ServerSettingsSection,
  type StorageReport,
  serverSettingsSections,
} from "@openbot/contracts/ipc";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";

export interface ServerSettingsOptions {
  file: string;
  emit: (event: AgentEvent) => void;
  measure: () => Promise<StorageReport>;
  clearLogs: () => Promise<void>;
}

export class ServerSettingsService {
  readonly #options: ServerSettingsOptions;
  #settings: ServerSettings;

  constructor(options: ServerSettingsOptions) {
    this.#options = options;
    this.#settings = read(options.file);
  }

  sections(): ServerSettingsSection[] {
    return serverSettingsSections();
  }

  get(): ServerSettings {
    return structuredClone(this.#settings);
  }

  update(raw: unknown): ServerSettings {
    const next = applyServerSettingsChanges(this.#settings, parseUpdateServerSettingsInput(raw));
    if (JSON.stringify(next) === JSON.stringify(this.#settings)) return this.get();
    this.#settings = next;
    this.#save();
    this.#options.emit({ type: "server-settings-changed", settings: this.get() });
    return this.get();
  }

  measureStorage(): Promise<StorageReport> {
    return this.#options.measure();
  }

  async clearLogs(): Promise<StorageReport> {
    await this.#options.clearLogs();
    return this.#options.measure();
  }

  /** What a message sent while an agent works does when the agent follows the server default. */
  busyMessageDefault(): ServerBusyMessageMode {
    return this.#settings.agents.busyMessage;
  }

  #save(): void {
    mkdirSync(dirname(this.#options.file), { recursive: true });
    const temporary = `${this.#options.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.#settings, null, 2));
    renameSync(temporary, this.#options.file);
  }
}

/** Reads the file: each field that is not valid keeps its default, a file that is not readable gives all defaults. */
function read(file: string): ServerSettings {
  const defaults = defaultServerSettings();
  if (!existsSync(file)) return defaults;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return defaults;
  }
  if (!isDynamicRecord(parsed)) return defaults;
  let settings = defaults;
  for (const section of ["general", "personality", "agents"] as const) {
    const stored = parsed[section];
    if (!isDynamicRecord(stored)) continue;
    for (const [key, value] of Object.entries(stored)) {
      try {
        settings = applyServerSettingsChanges(
          settings,
          parseUpdateServerSettingsInput({ [section]: { [key]: value } }),
        );
      } catch {
        // a field that is not valid keeps its default
      }
    }
  }
  return isServerSettings(settings) ? settings : defaults;
}
