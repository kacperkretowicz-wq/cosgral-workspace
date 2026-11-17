// COSGRAL W12 (BE-H): the three screens that LOOK at what the program holds, built on data that already exists (no new store):
//   * Library: a page of files with filters, sorting, counts and the agent that made each file; delete many; clean up old files.
//     (the files, their space and the single-file actions stay in `window.openbot.library`).
//   * Usage: tokens, turns and the price the providers REPORTED, per day and per agent for 7, 30, 90 or 365 days, the provider
//     limits (rings) and the load of this computer. A figure that is not collected (model, skill, cache split) is listed as
//     unavailable with a reason instead of being made up.
//   * Schedule: what the routines will start in a window of time, what they started, and a feed of the latest runs.
//
// This computer only. Nothing here changes a routine or a budget: it only reads (the library clean-up and "delete many" delete
// files, as the library already does one by one).

import { LIBRARY_ORIGINS, type LibraryItem, type LibraryOrigin } from "./ipc-library";
import { PROVIDER_USAGE_STATES, type ProviderUsage } from "./ipc-providers";
import { ROUTINE_RUN_STATUSES, type RoutineRun } from "./ipc-routines";
import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

// -- library ------------------------------------------------------------------------------------------------------------------

export const LIBRARY_SORTS = ["newest", "oldest", "name", "size"] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

/** image: pictures; document: pdf and text; other: anything else. */
export const LIBRARY_KINDS = ["image", "document", "other"] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

export const LIBRARY_VIEW_LIMITS = {
  defaultPage: 60,
  maxPage: 200,
  /** Files one "delete many" may name. */
  deleteMany: 200,
  maxCleanupDays: 3_650,
} as const;

export interface LibraryQuery {
  /** Part of the file name, case-insensitive. */
  query?: string;
  origin?: LibraryOrigin;
  kind?: LibraryKind;
  /** Files made by this agent only. */
  botId?: string;
  sort?: LibrarySort;
  offset?: number;
  limit?: number;
}

export interface LibraryEntry extends LibraryItem {
  /** The name of the agent that made the file; null for a file of the person (or an agent that is gone). */
  agentName: string | null;
}

export interface LibraryCounts {
  all: number;
  upload: number;
  agent: number;
  chat: number;
}

export interface LibraryPage {
  items: LibraryEntry[];
  /** Files that match the query (all pages). */
  total: number;
  offset: number;
  limit: number;
  /** The whole library by origin, whatever the query. */
  counts: LibraryCounts;
  /** Bytes of the files that match the query. */
  bytes: number;
}

export interface DeleteLibraryFilesInput {
  fileIds: string[];
}

export const LIBRARY_SKIP_REASONS = ["not-found", "chat-attachment"] as const;
export type LibrarySkipReason = (typeof LIBRARY_SKIP_REASONS)[number];

export interface DeleteLibraryFilesResult {
  deleted: string[];
  /** A chat attachment stays with its message; a file that is already gone is not an error. */
  skipped: Array<{ fileId: string; reason: LibrarySkipReason }>;
  freedBytes: number;
}

export interface LibraryCleanupInput {
  /** Which files: the person's uploads or the files agents made (chat attachments are never cleaned here). */
  origin: Exclude<LibraryOrigin, "chat">;
  /** Files older than this many days. */
  olderThanDays: number;
  /** true = only count what would go. */
  dryRun?: boolean;
}

export interface LibraryCleanupResult {
  files: number;
  bytes: number;
  /** true when the files were deleted (dryRun was off). */
  deleted: boolean;
}

/** `window.openbot.libraryView` (this computer only). */
export interface LibraryViewDesktopApi {
  page: (input?: LibraryQuery) => Promise<LibraryPage>;
  deleteMany: (input: DeleteLibraryFilesInput) => Promise<DeleteLibraryFilesResult>;
  cleanup: (input: LibraryCleanupInput) => Promise<LibraryCleanupResult>;
}

// -- usage --------------------------------------------------------------------------------------------------------------------

export const USAGE_PERIODS = [7, 30, 90, 365] as const;
export type UsagePeriod = (typeof USAGE_PERIODS)[number];

export interface UsageReportInput {
  period: UsagePeriod;
  /** One agent only; left out or null = all agents. */
  botId?: string | null;
}

export interface UsageDay {
  /** `YYYY-MM-DD` (UTC, like the budgets). */
  day: string;
  tokens: number;
  turns: number;
  /** Dollars the providers reported; 0 when none did. */
  costUsd: number;
  pricedTurns: number;
}

export interface UsageTotals {
  tokens: number;
  turns: number;
  costUsd: number;
  pricedTurns: number;
  /** false as soon as one turn had no reported price: the dollar figure is then a lower bound. */
  costComplete: boolean;
}

export interface UsageAgentRow extends UsageTotals {
  botId: string;
  /** null when the agent is gone. */
  name: string | null;
  /** Whole percent of all tokens of the period, 0 to 100. */
  tokenShare: number;
  /** Whole percent of all reported dollars of the period; null when no price was reported. */
  costShare: number | null;
}

export const USAGE_UNAVAILABLE_BREAKDOWNS = ["model", "skill", "cache"] as const;
export type UsageUnavailableBreakdown = (typeof USAGE_UNAVAILABLE_BREAKDOWNS)[number];

export interface UsageUnavailable {
  breakdown: UsageUnavailableBreakdown;
  reason: string;
}

export interface MachineLoad {
  /** The load of this computer now, 0 to 100; null when it cannot be read. */
  cpuPercent: number | null;
  memoryPercent: number | null;
}

/** One row of the detail counter: the use of one agent on one day with one model, by kind of token (only turns whose provider reported the parts). */
export interface UsageDetailRow {
  day: string;
  botId: string;
  model: string;
  turns: number;
  input: number;
  /** The part of the input that came from the provider's cache. */
  cached: number;
  output: number;
  reasoning: number;
}

export interface UsageModelRow {
  model: string;
  turns: number;
  /** Input + output. */
  tokens: number;
  input: number;
  cached: number;
  output: number;
  reasoning: number;
  /** Whole percent of the tokens of all models of the period. */
  tokenShare: number;
}

/** What the parts add up to in the period, for the "totals" block of the screen. */
export interface UsageTokenSplit {
  turns: number;
  input: number;
  cached: number;
  /** Input that did not come from the cache. */
  freshInput: number;
  output: number;
  reasoning: number;
  /** Whole percent of the tokens of the period that come with their parts (turns before the parts were kept have none). */
  coverage: number;
}

export interface UsageReport {
  period: UsagePeriod;
  botId: string | null;
  /** First and last day of the period (`YYYY-MM-DD`, UTC). */
  from: string;
  to: string;
  /** One entry for every day of the period, oldest first (days without use are zero). */
  days: UsageDay[];
  totals: UsageTotals;
  /** By agent, the biggest first. */
  byAgent: UsageAgentRow[];
  /** The limit "rings" of the providers (the same as `providers.listUsage`). */
  providers: ProviderUsage[];
  machine: MachineLoad;
  /** By model, the biggest first; empty when no turn of the period came with its parts. */
  byModel: UsageModelRow[];
  /** null when no turn of the period came with its parts. */
  split: UsageTokenSplit | null;
  /** The first day a turn was kept with its parts; null when none was. */
  detailSince: string | null;
  /** The first day anything was counted; null when nothing was counted yet. */
  collectingSince: string | null;
  generatedAt: string;
  unavailable: UsageUnavailable[];
}

/** `window.openbot.usageReport` (this computer only). */
export interface UsageReportDesktopApi {
  get: (input: UsageReportInput) => Promise<UsageReport>;
}

// -- schedule -----------------------------------------------------------------------------------------------------------------

export const SCHEDULE_LIMITS = {
  /** Longest window of `view`, in days. */
  maxWindowDays: 62,
  /** Entries of one `view` (the rest is cut and `truncated` says so). */
  maxEntries: 500,
  defaultFeed: 30,
  maxFeed: 100,
} as const;

export interface ScheduleViewInput {
  /** ISO times; `to` is after `from` and at most maxWindowDays later. */
  from: string;
  to: string;
  botId?: string;
}

interface ScheduleEntryBase {
  routineId: string;
  botId: string;
  routineName: string;
  /** When it will start (planned) or did start (ran), ISO. */
  at: string;
}

export type ScheduleEntry =
  | (ScheduleEntryBase & { kind: "planned" })
  | (ScheduleEntryBase & {
      kind: "ran";
      runId: string;
      status: RoutineRun["status"];
      cause: RoutineRun["cause"];
      reason: string | null;
      finishedAt: string | null;
    });

export interface ScheduleView {
  from: string;
  to: string;
  /** Oldest first: runs that happened and starts that are planned. */
  entries: ScheduleEntry[];
  truncated: boolean;
  /** Routines that start by a message from outside (no time) and routines that are paused (no planned starts). */
  webhooks: Array<{ routineId: string; botId: string; routineName: string }>;
  paused: Array<{ routineId: string; botId: string; routineName: string }>;
}

export interface ScheduleFeedInput {
  limit?: number;
  botId?: string;
  /** Only runs that started before this time (ISO), for the next page. */
  before?: string;
}

export interface ScheduleFeedItem {
  run: RoutineRun;
  routineName: string;
  /** null when the agent is gone. */
  agentName: string | null;
}

/** `window.openbot.schedule` (this computer only). */
export interface ScheduleDesktopApi {
  view: (input: ScheduleViewInput) => Promise<ScheduleView>;
  /** The latest runs of all routines, newest first. */
  feed: (input?: ScheduleFeedInput) => Promise<ScheduleFeedItem[]>;
}

// -- rules shared by the engines and the mocks --------------------------------------------------------------------------------

function wholeNumber(value: unknown, min: number, max: number, what: string): number {
  if (!isNumber(value) || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${what} is a whole number from ${min} to ${max}.`);
  }
  return value;
}

function optionalId(value: unknown, what: string): string | undefined {
  if (value === undefined) return undefined;
  if (!isString(value) || value.length === 0) throw new Error(`${what} is not named.`);
  return value;
}

/** The file kind of a library item, from its preview and name: the same rule for the engine, the mock and the screen. */
export function libraryKindOf(item: Pick<LibraryItem, "kind" | "previewKind" | "mimeType">): LibraryKind {
  if (item.kind === "image" || item.previewKind === "image") return "image";
  if (
    item.previewKind === "pdf" ||
    item.previewKind === "text" ||
    /^(text\/|application\/(pdf|json))/.test(item.mimeType)
  ) {
    return "document";
  }
  return "other";
}

export function parseLibraryQuery(
  input: unknown,
): Required<Pick<LibraryQuery, "sort" | "offset" | "limit">> & LibraryQuery {
  const raw = input === undefined ? {} : input;
  if (!isDynamicRecord(raw)) throw new Error("The library query is a set of fields.");
  const out: LibraryQuery = {};
  if (raw.query !== undefined) {
    if (!isString(raw.query) || raw.query.length > 200) throw new Error("Search with at most 200 characters.");
    out.query = raw.query.trim();
  }
  if (raw.origin !== undefined) {
    if (!isOneOf(LIBRARY_ORIGINS, raw.origin)) throw new Error(`origin is one of ${LIBRARY_ORIGINS.join(", ")}.`);
    out.origin = raw.origin;
  }
  if (raw.kind !== undefined) {
    if (!isOneOf(LIBRARY_KINDS, raw.kind)) throw new Error(`kind is one of ${LIBRARY_KINDS.join(", ")}.`);
    out.kind = raw.kind;
  }
  const botId = optionalId(raw.botId, "The agent");
  if (botId) out.botId = botId;
  if (raw.sort !== undefined && !isOneOf(LIBRARY_SORTS, raw.sort))
    throw new Error(`sort is one of ${LIBRARY_SORTS.join(", ")}.`);
  const sort: LibrarySort = raw.sort === undefined ? "newest" : isOneOf(LIBRARY_SORTS, raw.sort) ? raw.sort : "newest";
  const offset = raw.offset === undefined ? 0 : wholeNumber(raw.offset, 0, 1_000_000, "The offset");
  const limit =
    raw.limit === undefined
      ? LIBRARY_VIEW_LIMITS.defaultPage
      : wholeNumber(raw.limit, 1, LIBRARY_VIEW_LIMITS.maxPage, "The page size");
  return { ...out, sort, offset, limit };
}

export function parseDeleteLibraryFilesInput(input: unknown): DeleteLibraryFilesInput {
  if (!isDynamicRecord(input) || !Array.isArray(input.fileIds) || input.fileIds.length === 0) {
    throw new Error("Choose at least one file.");
  }
  if (input.fileIds.length > LIBRARY_VIEW_LIMITS.deleteMany) {
    throw new Error(`Delete at most ${LIBRARY_VIEW_LIMITS.deleteMany} files at once.`);
  }
  const ids = input.fileIds.filter(isString);
  if (ids.length !== input.fileIds.length || ids.some((id) => id.length === 0)) throw new Error("A file is not named.");
  return { fileIds: [...new Set(ids)] };
}

export function parseLibraryCleanupInput(input: unknown): LibraryCleanupInput {
  if (!isDynamicRecord(input) || !isOneOf(["upload", "agent"] as const, input.origin)) {
    throw new Error("Clean up the uploads or the files of agents (chat attachments stay with their messages).");
  }
  const olderThanDays = wholeNumber(input.olderThanDays, 1, LIBRARY_VIEW_LIMITS.maxCleanupDays, "The age in days");
  if (input.dryRun !== undefined && !isBoolean(input.dryRun)) throw new Error("dryRun is on or off.");
  return { origin: input.origin, olderThanDays, ...(input.dryRun === undefined ? {} : { dryRun: input.dryRun }) };
}

export function parseUsageReportInput(
  input: unknown,
): Required<Pick<UsageReportInput, "period">> & { botId: string | null } {
  if (!isDynamicRecord(input) || !isOneOf(USAGE_PERIODS, input.period)) {
    throw new Error(`The period is ${USAGE_PERIODS.join(", ")} days.`);
  }
  if (input.botId !== undefined && input.botId !== null && !(isString(input.botId) && input.botId.length > 0)) {
    throw new Error("The agent is not named.");
  }
  return { period: input.period, botId: input.botId === undefined ? null : input.botId };
}

function parseIso(value: unknown, what: string): number {
  const time = isString(value) ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(time)) throw new Error(`${what} is a date and time.`);
  return time;
}

export function parseScheduleViewInput(input: unknown): { from: string; to: string; botId?: string } {
  if (!isDynamicRecord(input)) throw new Error("Give the window of time.");
  const from = parseIso(input.from, "The start");
  const to = parseIso(input.to, "The end");
  if (to <= from) throw new Error("The end is after the start.");
  if (to - from > SCHEDULE_LIMITS.maxWindowDays * 86_400_000) {
    throw new Error(`The window is at most ${SCHEDULE_LIMITS.maxWindowDays} days.`);
  }
  const botId = optionalId(input.botId, "The agent");
  return {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    ...(botId ? { botId } : {}),
  };
}

export function parseScheduleFeedInput(input: unknown): { limit: number; botId?: string; before?: string } {
  const raw = input === undefined ? {} : input;
  if (!isDynamicRecord(raw)) throw new Error("The feed query is a set of fields.");
  const limit =
    raw.limit === undefined
      ? SCHEDULE_LIMITS.defaultFeed
      : wholeNumber(raw.limit, 1, SCHEDULE_LIMITS.maxFeed, "The feed size");
  const botId = optionalId(raw.botId, "The agent");
  const before = raw.before === undefined ? undefined : new Date(parseIso(raw.before, "The time")).toISOString();
  return { limit, ...(botId ? { botId } : {}), ...(before ? { before } : {}) };
}

// -- guards ------------------------------------------------------------------------------------------------------------------

function isCount(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0;
}

function isMoney(value: unknown): value is number {
  return isNumber(value) && Number.isFinite(value) && value >= 0;
}

function isPercent(value: unknown): value is number {
  return isNumber(value) && value >= 0 && value <= 100;
}

export function isLibraryPage(value: unknown): value is LibraryPage {
  return (
    isDynamicRecord(value) &&
    Array.isArray(value.items) &&
    value.items.length <= LIBRARY_VIEW_LIMITS.maxPage &&
    value.items.every(
      (item) =>
        isDynamicRecord(item) &&
        isString(item.id) &&
        isString(item.name) &&
        isCount(item.size) &&
        isOneOf(LIBRARY_ORIGINS, item.origin) &&
        isString(item.createdAt) &&
        (item.agentName === null || isString(item.agentName)),
    ) &&
    isCount(value.total) &&
    isCount(value.offset) &&
    isCount(value.limit) &&
    isDynamicRecord(value.counts) &&
    isCount(value.counts.all) &&
    isCount(value.counts.upload) &&
    isCount(value.counts.agent) &&
    isCount(value.counts.chat) &&
    isCount(value.bytes)
  );
}

export function isDeleteLibraryFilesResult(value: unknown): value is DeleteLibraryFilesResult {
  return (
    isDynamicRecord(value) &&
    Array.isArray(value.deleted) &&
    value.deleted.every(isString) &&
    Array.isArray(value.skipped) &&
    value.skipped.every(
      (item) => isDynamicRecord(item) && isString(item.fileId) && isOneOf(LIBRARY_SKIP_REASONS, item.reason),
    ) &&
    isCount(value.freedBytes)
  );
}

export function isLibraryCleanupResult(value: unknown): value is LibraryCleanupResult {
  return isDynamicRecord(value) && isCount(value.files) && isCount(value.bytes) && isBoolean(value.deleted);
}

function isTotals(value: unknown): value is UsageTotals {
  return (
    isDynamicRecord(value) &&
    isCount(value.tokens) &&
    isCount(value.turns) &&
    isMoney(value.costUsd) &&
    isCount(value.pricedTurns) &&
    isBoolean(value.costComplete)
  );
}

export function isUsageReport(value: unknown): value is UsageReport {
  if (!isDynamicRecord(value) || !isOneOf(USAGE_PERIODS, value.period)) return false;
  if (!(value.botId === null || isString(value.botId)) || !isString(value.from) || !isString(value.to)) return false;
  if (!Array.isArray(value.days) || value.days.length !== value.period) return false;
  if (
    !value.days.every(
      (day) =>
        isDynamicRecord(day) &&
        isString(day.day) &&
        isCount(day.tokens) &&
        isCount(day.turns) &&
        isMoney(day.costUsd) &&
        isCount(day.pricedTurns),
    )
  ) {
    return false;
  }
  if (!isTotals(value.totals) || !Array.isArray(value.byAgent)) return false;
  const agents = value.byAgent.every(
    (row) =>
      isTotals(row) &&
      isDynamicRecord(row) &&
      isString(row.botId) &&
      (row.name === null || isString(row.name)) &&
      isPercent(row.tokenShare) &&
      (row.costShare === null || isPercent(row.costShare)),
  );
  if (!agents || !Array.isArray(value.providers)) return false;
  const providers = value.providers.every(
    (usage) => isDynamicRecord(usage) && isString(usage.provider) && isOneOf(PROVIDER_USAGE_STATES, usage.state),
  );
  return (
    providers &&
    isModelRows(value.byModel) &&
    (value.split === null || isSplit(value.split)) &&
    (value.detailSince === null || isString(value.detailSince)) &&
    isDynamicRecord(value.machine) &&
    (value.machine.cpuPercent === null || isPercent(value.machine.cpuPercent)) &&
    (value.machine.memoryPercent === null || isPercent(value.machine.memoryPercent)) &&
    (value.collectingSince === null || isString(value.collectingSince)) &&
    isString(value.generatedAt) &&
    Array.isArray(value.unavailable) &&
    value.unavailable.every(
      (item) => isDynamicRecord(item) && isOneOf(USAGE_UNAVAILABLE_BREAKDOWNS, item.breakdown) && isString(item.reason),
    )
  );
}

function isModelRows(value: unknown): value is UsageModelRow[] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) =>
        isDynamicRecord(row) &&
        isString(row.model) &&
        isCount(row.turns) &&
        isCount(row.tokens) &&
        isCount(row.input) &&
        isCount(row.cached) &&
        isCount(row.output) &&
        isCount(row.reasoning) &&
        isPercent(row.tokenShare),
    )
  );
}

function isSplit(value: unknown): value is UsageTokenSplit {
  return (
    isDynamicRecord(value) &&
    isCount(value.turns) &&
    isCount(value.input) &&
    isCount(value.cached) &&
    isCount(value.freshInput) &&
    isCount(value.output) &&
    isCount(value.reasoning) &&
    isPercent(value.coverage)
  );
}

function isRun(value: unknown): value is RoutineRun {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.routineId) &&
    isString(value.botId) &&
    isOneOf(["schedule", "webhook", "manual"] as const, value.cause) &&
    isOneOf(ROUTINE_RUN_STATUSES, value.status) &&
    (value.reason === null || isString(value.reason)) &&
    isString(value.startedAt) &&
    (value.finishedAt === null || isString(value.finishedAt)) &&
    (value.deliveryId === null || isString(value.deliveryId))
  );
}

function isNamed(value: unknown): boolean {
  return isDynamicRecord(value) && isString(value.routineId) && isString(value.botId) && isString(value.routineName);
}

export function isScheduleView(value: unknown): value is ScheduleView {
  return (
    isDynamicRecord(value) &&
    isString(value.from) &&
    isString(value.to) &&
    Array.isArray(value.entries) &&
    value.entries.length <= SCHEDULE_LIMITS.maxEntries &&
    value.entries.every(
      (entry) =>
        isNamed(entry) &&
        isDynamicRecord(entry) &&
        isString(entry.at) &&
        (entry.kind === "planned" ||
          (entry.kind === "ran" &&
            isString(entry.runId) &&
            isOneOf(ROUTINE_RUN_STATUSES, entry.status) &&
            isOneOf(["schedule", "webhook", "manual"] as const, entry.cause) &&
            (entry.reason === null || isString(entry.reason)) &&
            (entry.finishedAt === null || isString(entry.finishedAt)))),
    ) &&
    isBoolean(value.truncated) &&
    Array.isArray(value.webhooks) &&
    value.webhooks.every(isNamed) &&
    Array.isArray(value.paused) &&
    value.paused.every(isNamed)
  );
}

export function isScheduleFeed(value: unknown): value is ScheduleFeedItem[] {
  return (
    Array.isArray(value) &&
    value.length <= SCHEDULE_LIMITS.maxFeed &&
    value.every(
      (item) =>
        isDynamicRecord(item) &&
        isRun(item.run) &&
        isString(item.routineName) &&
        (item.agentName === null || isString(item.agentName)),
    )
  );
}

// -- pure rules the engine and the mock share --------------------------------------------------------------------------------

function compareEntries(sort: LibrarySort): (a: LibraryEntry, b: LibraryEntry) => number {
  switch (sort) {
    case "oldest":
      return (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    case "name":
      return (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);
    case "size":
      return (a, b) => b.size - a.size || a.id.localeCompare(b.id);
    default:
      return (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
  }
}

/** Filters, sorts and cuts the whole library into one page. `counts` are of the whole library, whatever the query. */
export function selectLibraryPage(
  entries: readonly LibraryEntry[],
  query: ReturnType<typeof parseLibraryQuery>,
): LibraryPage {
  const needle = (query.query ?? "").toLocaleLowerCase();
  const counts: LibraryCounts = { all: entries.length, upload: 0, agent: 0, chat: 0 };
  for (const entry of entries) counts[entry.origin] += 1;
  const matching = entries
    .filter(
      (entry) =>
        (needle === "" || entry.name.toLocaleLowerCase().includes(needle)) &&
        (query.origin === undefined || entry.origin === query.origin) &&
        (query.kind === undefined || libraryKindOf(entry) === query.kind) &&
        (query.botId === undefined || entry.createdByBotId === query.botId),
    )
    .sort(compareEntries(query.sort));
  return {
    items: matching.slice(query.offset, query.offset + query.limit),
    total: matching.length,
    offset: query.offset,
    limit: query.limit,
    counts,
    bytes: matching.reduce((sum, entry) => sum + entry.size, 0),
  };
}

export interface UsageRow {
  day: string;
  botId: string;
  tokens: number;
  turns: number;
  costUsd: number;
  pricedTurns: number;
}

const DAY_MS = 86_400_000;

export function usageDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function totalsOf(rows: readonly Pick<UsageRow, "tokens" | "turns" | "costUsd" | "pricedTurns">[]): UsageTotals {
  const totals = rows.reduce(
    (sum, row) => ({
      tokens: sum.tokens + row.tokens,
      turns: sum.turns + row.turns,
      costUsd: sum.costUsd + row.costUsd,
      pricedTurns: sum.pricedTurns + row.pricedTurns,
    }),
    { tokens: 0, turns: 0, costUsd: 0, pricedTurns: 0 },
  );
  return {
    ...totals,
    costUsd: Math.round(totals.costUsd * 1_000_000) / 1_000_000,
    costComplete: totals.pricedTurns === totals.turns,
  };
}

const NO_DETAIL: UsageUnavailable[] = [
  {
    breakdown: "model",
    reason:
      "No turn of this period was kept with its model yet (the counter keeps it from the day the parts were first reported).",
  },
  { breakdown: "cache", reason: "No turn of this period was kept with its cache and input/output split yet." },
];
const NO_SKILL: UsageUnavailable = { breakdown: "skill", reason: "The counter does not tell which skill a turn used." };

/**
 * The report of a period from the rows of the counter (one row per day and agent). Every day of the period is listed, also the
 * ones without use; the rows outside the period or of another agent (when one is chosen) are ignored.
 */
export function aggregateUsage(input: {
  rows: readonly UsageRow[];
  period: UsagePeriod;
  botId: string | null;
  today: Date;
  names: (botId: string) => string | null;
  providers: ProviderUsage[];
  machine: MachineLoad;
  /** The first day anything was ever counted, whatever the period. */
  firstDay: string | null;
  /** The detail rows (per day, agent and model) from the first day of the period on, and the first day of any detail. */
  detail?: readonly UsageDetailRow[];
  firstDetailDay?: string | null;
  now: Date;
}): UsageReport {
  const last = usageDay(input.today);
  const first = usageDay(new Date(Date.parse(`${last}T00:00:00.000Z`) - (input.period - 1) * DAY_MS));
  const used = input.rows.filter(
    (row) => row.day >= first && row.day <= last && (input.botId === null || row.botId === input.botId),
  );
  const days: UsageDay[] = [];
  for (let index = 0; index < input.period; index += 1) {
    const day = usageDay(new Date(Date.parse(`${first}T00:00:00.000Z`) + index * DAY_MS));
    const rows = used.filter((row) => row.day === day);
    const { tokens, turns, costUsd, pricedTurns } = totalsOf(rows);
    days.push({ day, tokens, turns, costUsd, pricedTurns });
  }
  const totals = totalsOf(used);
  const agents = [...new Set(used.map((row) => row.botId))];
  const costTotal = totals.costUsd;
  const byAgent: UsageAgentRow[] = agents
    .map((botId) => {
      const mine = totalsOf(used.filter((row) => row.botId === botId));
      return {
        ...mine,
        botId,
        name: input.names(botId),
        tokenShare: totals.tokens === 0 ? 0 : Math.round((mine.tokens / totals.tokens) * 100),
        costShare: costTotal === 0 ? null : Math.round((mine.costUsd / costTotal) * 100),
      };
    })
    .sort((a, b) => b.tokens - a.tokens || a.botId.localeCompare(b.botId));
  const detailRows = (input.detail ?? []).filter(
    (row) => row.day >= first && row.day <= last && (input.botId === null || row.botId === input.botId),
  );
  const byModel = modelRows(detailRows);
  const split = splitOf(detailRows, totals.tokens);
  return {
    period: input.period,
    botId: input.botId,
    from: first,
    to: last,
    days,
    totals,
    byAgent,
    providers: input.providers,
    machine: input.machine,
    byModel,
    split,
    detailSince: input.firstDetailDay ?? null,
    collectingSince: input.firstDay,
    generatedAt: input.now.toISOString(),
    unavailable: [...(byModel.length === 0 ? NO_DETAIL : []), NO_SKILL].map((item) => ({ ...item })),
  };
}

function modelRows(rows: readonly UsageDetailRow[]): UsageModelRow[] {
  const models = [...new Set(rows.map((row) => row.model))];
  const sums = models.map((model) => {
    const mine = rows.filter((row) => row.model === model);
    const sum = (pick: (row: UsageDetailRow) => number) => mine.reduce((total, row) => total + pick(row), 0);
    const input = sum((row) => row.input);
    const output = sum((row) => row.output);
    return {
      model,
      turns: sum((row) => row.turns),
      tokens: input + output,
      input,
      cached: sum((row) => row.cached),
      output,
      reasoning: sum((row) => row.reasoning),
    };
  });
  const all = sums.reduce((total, row) => total + row.tokens, 0);
  return sums
    .map((row) => ({ ...row, tokenShare: all === 0 ? 0 : Math.round((row.tokens / all) * 100) }))
    .sort((a, b) => b.tokens - a.tokens || a.model.localeCompare(b.model));
}

function splitOf(rows: readonly UsageDetailRow[], periodTokens: number): UsageTokenSplit | null {
  if (rows.length === 0) return null;
  const sum = (pick: (row: UsageDetailRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const input = sum((row) => row.input);
  const cached = sum((row) => row.cached);
  const output = sum((row) => row.output);
  const covered = input + output;
  return {
    turns: sum((row) => row.turns),
    input,
    cached,
    freshInput: Math.max(0, input - cached),
    output,
    reasoning: sum((row) => row.reasoning),
    coverage: periodTokens === 0 ? 100 : Math.min(100, Math.round((covered / periodTokens) * 100)),
  };
}
