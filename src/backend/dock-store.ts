// COSGRAL W3: settings of the agent dock and the Dynamic Island, kept in one small JSON file of this computer.
// Pins keep their order; a hidden pin keeps its place. Broken or old values fall back to defaults field by field.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  DOCK_LIMITS,
  DOCK_SIZES,
  type DockAgentInput,
  type DockPin,
  type DockSize,
  type OpenDockChatInput,
  type PinDockAgentInput,
  type ReorderDockInput,
  type SetDockPinHiddenInput,
  type SetDockSizeInput,
  type SetDockVisibleInput,
  type SetIslandEnabledInput,
} from "@openbot/contracts/ipc";
import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "@openbot/contracts/runtime-values";

const FILE_VERSION = 1;

/** Where the dock window was; the width follows the size. */
export interface DockBounds {
  x: number;
  y: number;
  height: number;
}

export interface DockSettings {
  visible: boolean;
  size: DockSize;
  pins: DockPin[];
  openBotId: string | null;
  islandEnabled: boolean;
  bounds: DockBounds | null;
}

export interface DockStoreOptions {
  filePath: string;
  botExists: (botId: string) => boolean;
  now?: () => Date;
}

export class DockStore {
  readonly #filePath: string;
  readonly #botExists: (botId: string) => boolean;
  readonly #now: () => Date;
  #settings: DockSettings;

  constructor(options: DockStoreOptions) {
    this.#filePath = options.filePath;
    this.#botExists = options.botExists;
    this.#now = options.now ?? (() => new Date());
    this.#settings = readSettings(this.#filePath);
  }

  settings(): DockSettings {
    return structuredClone(this.#settings);
  }

  pin(input: PinDockAgentInput): DockSettings {
    if (!this.#botExists(input.botId)) throw new Error("This agent does not exist.");
    const existing = this.#settings.pins.find((pin) => pin.botId === input.botId);
    const rest = this.#settings.pins.filter((pin) => pin.botId !== input.botId);
    if (!existing && rest.length >= DOCK_LIMITS.pins) {
      throw new Error(`The dock holds at most ${DOCK_LIMITS.pins} agents.`);
    }
    const pin = existing ?? { botId: input.botId, hidden: false, pinnedAt: this.#now().toISOString() };
    const index = input.index === undefined ? rest.length : Math.max(0, Math.min(rest.length, input.index));
    rest.splice(index, 0, pin);
    return this.#save({ ...this.#settings, pins: rest });
  }

  unpin(input: DockAgentInput): DockSettings {
    const pins = this.#settings.pins.filter((pin) => pin.botId !== input.botId);
    if (pins.length === this.#settings.pins.length) return this.settings();
    return this.#save({ ...this.#settings, pins, openBotId: closedChat(this.#settings.openBotId, input.botId) });
  }

  reorder(input: ReorderDockInput): DockSettings {
    const byId = new Map(this.#settings.pins.map((pin) => [pin.botId, pin]));
    const unique = new Set(input.botIds);
    if (unique.size !== input.botIds.length || unique.size !== byId.size || input.botIds.some((id) => !byId.has(id))) {
      throw new Error("List every pinned agent once.");
    }
    const pins = input.botIds.flatMap((id) => {
      const pin = byId.get(id);
      return pin ? [pin] : [];
    });
    return this.#save({ ...this.#settings, pins });
  }

  setPinHidden(input: SetDockPinHiddenInput): DockSettings {
    this.#requirePin(input.botId);
    const pins = this.#settings.pins.map((pin) => (pin.botId === input.botId ? { ...pin, hidden: input.hidden } : pin));
    const openBotId = input.hidden ? closedChat(this.#settings.openBotId, input.botId) : this.#settings.openBotId;
    return this.#save({ ...this.#settings, pins, openBotId });
  }

  setSize(input: SetDockSizeInput): DockSettings {
    if (!isOneOf(DOCK_SIZES, input.size)) throw new Error("Unknown dock size.");
    return this.#save({ ...this.#settings, size: input.size });
  }

  setVisible(input: SetDockVisibleInput): DockSettings {
    return this.#save({ ...this.#settings, visible: input.visible });
  }

  openChat(input: OpenDockChatInput): DockSettings {
    if (input.botId !== null) {
      const pin = this.#requirePin(input.botId);
      if (pin.hidden) throw new Error("Show this agent in the dock first.");
    }
    return this.#save({ ...this.#settings, openBotId: input.botId });
  }

  setIslandEnabled(input: SetIslandEnabledInput): DockSettings {
    return this.#save({ ...this.#settings, islandEnabled: input.enabled });
  }

  setBounds(bounds: DockBounds): DockSettings {
    return this.#save({ ...this.#settings, bounds: { x: bounds.x, y: bounds.y, height: bounds.height } });
  }

  /** Removes pins of agents that no longer exist; true when something changed. */
  forgetMissingBots(existing: ReadonlySet<string>): boolean {
    const pins = this.#settings.pins.filter((pin) => existing.has(pin.botId));
    if (pins.length === this.#settings.pins.length) return false;
    const openBotId =
      this.#settings.openBotId !== null && existing.has(this.#settings.openBotId) ? this.#settings.openBotId : null;
    this.#save({ ...this.#settings, pins, openBotId });
    return true;
  }

  #requirePin(botId: string): DockPin {
    const pin = this.#settings.pins.find((candidate) => candidate.botId === botId);
    if (!pin) throw new Error("Pin this agent to the dock first.");
    return pin;
  }

  #save(next: DockSettings): DockSettings {
    this.#settings = next;
    mkdirSync(dirname(this.#filePath), { recursive: true });
    const temporary = `${this.#filePath}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ version: FILE_VERSION, ...next }, null, 2)}\n`, "utf8");
    renameSync(temporary, this.#filePath);
    return this.settings();
  }
}

function closedChat(openBotId: string | null, botId: string): string | null {
  return openBotId === botId ? null : openBotId;
}

export function defaultDockSettings(): DockSettings {
  return { visible: false, size: "medium", pins: [], openBotId: null, islandEnabled: true, bounds: null };
}

function readSettings(filePath: string): DockSettings {
  const defaults = defaultDockSettings();
  if (!existsSync(filePath)) return defaults;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return defaults;
  }
  if (!isDynamicRecord(raw)) return defaults;
  const pins = Array.isArray(raw.pins) ? uniquePins(raw.pins.filter(isPin)).slice(0, DOCK_LIMITS.pins) : [];
  const openBotId =
    isString(raw.openBotId) && pins.some((pin) => pin.botId === raw.openBotId && !pin.hidden) ? raw.openBotId : null;
  return {
    visible: isBoolean(raw.visible) ? raw.visible : defaults.visible,
    size: isOneOf(DOCK_SIZES, raw.size) ? raw.size : defaults.size,
    pins,
    openBotId,
    islandEnabled: isBoolean(raw.islandEnabled) ? raw.islandEnabled : defaults.islandEnabled,
    bounds: isBounds(raw.bounds) ? raw.bounds : null,
  };
}

function isPin(value: unknown): value is DockPin {
  return isDynamicRecord(value) && isString(value.botId) && isBoolean(value.hidden) && isString(value.pinnedAt);
}

function uniquePins(pins: DockPin[]): DockPin[] {
  const seen = new Set<string>();
  return pins
    .filter((pin) => !seen.has(pin.botId) && seen.add(pin.botId))
    .map((pin) => ({ botId: pin.botId, hidden: pin.hidden, pinnedAt: pin.pinnedAt }));
}

function isBounds(value: unknown): value is DockBounds {
  return (
    isDynamicRecord(value) &&
    isNumber(value.x) &&
    isNumber(value.y) &&
    isNumber(value.height) &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    value.height > 0
  );
}
