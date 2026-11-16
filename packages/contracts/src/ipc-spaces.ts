// COSGRAL W8-KK1: client spaces (spec-w8.md 1D, W8-20 ... W8-24; decisions Q5, Q9, Q10).
//
// A space is a separate container of everything one client's work needs: the agents and their conversations, the
// working folders, the Vault, the browser profile, the MCP servers, the memory. The isolation is a SEPARATE DATA
// FOLDER with its own database file, not a filter over shared rows: the program runs on ONE space at a time and a
// switch restarts it on the other folder, so nothing of space B is even open while space A runs, and a missing
// filter somewhere cannot leak it (W8-22). Q10 follows from this: every space has its own list of MCP servers; a
// server of another space does not exist here (a shared one would be an explicit, separate allowlist, not built).
//
// A space is NOT a server or a team (Q5): the "Local server" and team servers of the rail are another thing and are
// not touched. The main space ("main") is the data the program already has: it is never moved, copied, archived or
// deleted by this feature. Deleting a client space removes only that space's own folder, after a confirmation, and
// never the main space or anything of the regular OpenBot.
//
// Agents imported from a template into a space start at the access level `working-folder` (Q9); raising it is a
// consent card as everywhere (W8 access levels).
//
// Everything here is about THIS computer only (a phone or a remote server may not call it).

import { type DynamicRecord, isBoolean, isDynamicRecord, isNumber, isString } from "./runtime-values";

export const MAIN_SPACE_ID = "main";
export const MAIN_SPACE_NAME = "Main";

export const SPACE_LIMITS = {
  /** Client spaces (archived ones count); the main space is not counted. */
  maxSpaces: 20,
  /** Characters of a name. */
  name: 60,
} as const;

/** What a space keeps for itself (each is a separate copy per space, never shared with another space). */
export const SPACE_ISOLATED_PARTS = ["agents", "files", "vault", "browser", "mcp", "memory"] as const;
export type SpaceIsolatedPart = (typeof SPACE_ISOLATED_PARTS)[number];

export interface SpaceSummary {
  /** "main" for the data the program already has, else a short random id. */
  id: string;
  name: string;
  main: boolean;
  createdAt: string;
  /** Archived: hidden from the choices, nothing is deleted, can be restored. */
  archivedAt: string | null;
  /** The program runs on this space now. */
  running: boolean;
  /** The program starts on this space the next time (after a switch, until it restarts). */
  selected: boolean;
}

export interface SpaceList {
  /** The id of the space the program runs on now (and so the name the rail shows). */
  runningId: string;
  /** The id the program starts on next; differs from `runningId` only between a switch and the restart. */
  selectedId: string;
  /** Main first, then client spaces by name. Archived ones are included, marked. */
  spaces: SpaceSummary[];
  /** A sentence when the list of spaces could not be read in full (the program then runs on the main space). */
  problem: string | null;
}

export interface SpaceDescription {
  id: string;
  name: string;
  main: boolean;
  archived: boolean;
  running: boolean;
  /** The data is in its own folder with its own database. */
  separateFolder: boolean;
  /** Parts that are separate per space (all of them; the list is the promise the isolation test checks). */
  isolated: SpaceIsolatedPart[];
  /** Whether the space has been started once (its database exists). */
  hasData: boolean;
  /** Bytes in the space's own folder; null when it is the main space or too large to count quickly. */
  sizeBytes: number | null;
}

export interface CreateSpaceInput {
  name: string;
}

export interface SpaceInput {
  id: string;
}

export interface RenameSpaceInput extends SpaceInput {
  name: string;
}

/** Deleting and switching change what is running or kept: the window asks first, the engine insists (`confirm: true`). */
export interface ConfirmedSpaceInput extends SpaceInput {
  confirm: boolean;
}

export interface SpacesDesktopApi {
  list: () => Promise<SpaceList>;
  /** A new empty client space. Does not switch to it. */
  create: (input: CreateSpaceInput) => Promise<SpaceList>;
  rename: (input: RenameSpaceInput) => Promise<SpaceList>;
  /** Hides a client space. Refused for the main space and for the one the program runs on. */
  archive: (input: SpaceInput) => Promise<SpaceList>;
  restore: (input: SpaceInput) => Promise<SpaceList>;
  /** Removes a client space and ONLY its own folder, for good. Needs `confirm: true`. Refused for main and the running one. */
  delete: (input: ConfirmedSpaceInput) => Promise<SpaceList>;
  /**
   * Chooses the space the program runs on and restarts it on that space (running turns of this space stop first).
   * Needs `confirm: true`. Switching to the running space does nothing.
   */
  switch: (input: ConfirmedSpaceInput) => Promise<SpaceList>;
  describe: (input: SpaceInput) => Promise<SpaceDescription>;
}

/** Event `spaces-changed`: the whole list. */
export interface SpacesChanged extends SpaceList {}

// --- rules shared by the engine and the mock ---

/** A name made tidy: trimmed, inner whitespace folded, no control characters. */
export function normalizeSpaceName(name: string): string {
  const printable = Array.from(name, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("");
  return printable.replace(/\s+/g, " ").trim();
}

/** Why a name cannot be used; null when it is fine. `taken` = names of the other spaces. */
export function spaceNameProblem(name: string, taken: readonly string[]): string | null {
  const clean = normalizeSpaceName(name);
  if (clean.length === 0) return "A space needs a name.";
  if (clean.length > SPACE_LIMITS.name) return `A space name has at most ${SPACE_LIMITS.name} characters.`;
  const key = clean.toLocaleLowerCase();
  if (
    key === MAIN_SPACE_NAME.toLocaleLowerCase() ||
    taken.some((other) => normalizeSpaceName(other).toLocaleLowerCase() === key)
  ) {
    return "Another space already has this name.";
  }
  return null;
}

/** An id the engine makes is lower-case letters, digits and dashes only (it becomes a folder name). */
export function isSpaceId(value: unknown): value is string {
  return isString(value) && (value === MAIN_SPACE_ID || /^[a-z0-9][a-z0-9-]{5,39}$/.test(value));
}

// --- guards and parsers ---

export function isSpaceSummary(value: unknown): value is SpaceSummary {
  if (!isDynamicRecord(value)) return false;
  const record: DynamicRecord = value;
  return (
    isSpaceId(record.id) &&
    isString(record.name) &&
    record.name.length > 0 &&
    isBoolean(record.main) &&
    record.main === (record.id === MAIN_SPACE_ID) &&
    isString(record.createdAt) &&
    (record.archivedAt === null || isString(record.archivedAt)) &&
    isBoolean(record.running) &&
    isBoolean(record.selected)
  );
}

export function isSpaceList(value: unknown): value is SpaceList {
  if (!isDynamicRecord(value)) return false;
  if (!(isSpaceId(value.runningId) && isSpaceId(value.selectedId))) return false;
  if (!(value.problem === null || isString(value.problem))) return false;
  if (!Array.isArray(value.spaces) || !value.spaces.every(isSpaceSummary)) return false;
  const spaces: SpaceSummary[] = value.spaces;
  // Exactly one is running and exactly one is selected, and they are the ones the ids name.
  return (
    spaces.filter((space) => space.running).length === 1 &&
    spaces.filter((space) => space.selected).length === 1 &&
    spaces.some((space) => space.id === value.runningId && space.running) &&
    spaces.some((space) => space.id === value.selectedId && space.selected) &&
    new Set(spaces.map((space) => space.id)).size === spaces.length
  );
}

export function isSpacesChanged(value: unknown): value is SpacesChanged & { type: "spaces-changed" } {
  return isDynamicRecord(value) && value.type === "spaces-changed" && isSpaceList(value);
}

export function isSpaceDescription(value: unknown): value is SpaceDescription {
  if (!isDynamicRecord(value)) return false;
  return (
    isSpaceId(value.id) &&
    isString(value.name) &&
    isBoolean(value.main) &&
    isBoolean(value.archived) &&
    isBoolean(value.running) &&
    isBoolean(value.separateFolder) &&
    Array.isArray(value.isolated) &&
    value.isolated.every((part) => SPACE_ISOLATED_PARTS.some((known) => known === part)) &&
    isBoolean(value.hasData) &&
    (value.sizeBytes === null || (isNumber(value.sizeBytes) && value.sizeBytes >= 0))
  );
}

function parseId(value: unknown): string {
  if (!isSpaceId(value)) throw new Error("A space request needs a space id.");
  return value;
}

export function parseSpaceInput(input: unknown): SpaceInput {
  if (!isDynamicRecord(input)) throw new Error("The space request is malformed.");
  return { id: parseId(input.id) };
}

export function parseCreateSpaceInput(input: unknown): CreateSpaceInput {
  if (!isDynamicRecord(input) || !isString(input.name)) throw new Error("A space needs a name.");
  return { name: input.name };
}

export function parseRenameSpaceInput(input: unknown): RenameSpaceInput {
  if (!isDynamicRecord(input) || !isString(input.name)) throw new Error("A space needs a name.");
  return { id: parseId(input.id), name: input.name };
}

/** `confirm` must be the boolean `true`; anything else is a refusal with a message the window can show. */
export function parseConfirmedSpaceInput(input: unknown, what: "delete" | "switch"): ConfirmedSpaceInput {
  if (!isDynamicRecord(input)) throw new Error("The space request is malformed.");
  const id = parseId(input.id);
  if (input.confirm !== true) {
    throw new Error(
      what === "delete"
        ? "Deleting a space needs a confirmation: it removes the space's data for good."
        : "Switching the space needs a confirmation: the program restarts and the running turns stop.",
    );
  }
  return { id, confirm: true };
}
