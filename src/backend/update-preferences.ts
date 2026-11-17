// COSGRAL W12-KK (g2): the preferences of program updates, kept in a small file of this computer (nothing secret in it). A file that is
// missing or damaged gives the defaults; a change is written first and then applied (`apply`), and told to the window as ONE event with
// the whole preferences. "Download by itself" is off whenever the automatic checks are off.

import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  type AgentEvent,
  DEFAULT_UPDATE_PREFERENCES,
  isUpdatePreferences,
  mergeUpdatePreferences,
  parseSetUpdatePreferencesInput,
  type UpdatePreferences,
} from "@openbot/contracts/ipc";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";

export interface UpdatePreferencesOptions {
  file: string;
  emit: (event: AgentEvent) => void;
  /** Applies the preferences to the updater (the program passes `UpdateService.applyPreferences`). */
  apply: (preferences: UpdatePreferences) => void;
}

export class UpdatePreferencesService {
  readonly #options: UpdatePreferencesOptions;
  #current: UpdatePreferences;
  #writing: Promise<void> = Promise.resolve();

  constructor(options: UpdatePreferencesOptions) {
    this.#options = options;
    this.#current = readPreferences(options.file);
  }

  get(): UpdatePreferences {
    return { ...this.#current };
  }

  /** Applies what was saved before (at start). */
  applyCurrent(): void {
    this.#options.apply(this.get());
  }

  async set(raw: unknown): Promise<UpdatePreferences> {
    const change = parseSetUpdatePreferencesInput(raw);
    const next = mergeUpdatePreferences(this.#current, change);
    this.#writing = this.#writing.then(() => write(this.#options.file, next));
    await this.#writing;
    this.#current = next;
    this.#options.apply(this.get());
    this.#options.emit({ type: "update-preferences-changed", preferences: this.get() });
    return this.get();
  }
}

function readPreferences(file: string): UpdatePreferences {
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    const merged = { ...DEFAULT_UPDATE_PREFERENCES, ...(isDynamicRecord(value) ? value : {}) };
    return isUpdatePreferences(merged)
      ? mergeUpdatePreferences(DEFAULT_UPDATE_PREFERENCES, merged)
      : { ...DEFAULT_UPDATE_PREFERENCES };
  } catch {
    return { ...DEFAULT_UPDATE_PREFERENCES };
  }
}

async function write(file: string, preferences: UpdatePreferences): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, JSON.stringify(preferences, null, 2), "utf8");
  await rename(temporary, file);
}
