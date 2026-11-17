// COSGRAL W11 (U3): the search of the window (the "Search" box of the sidebar): one question, answers from agents, channels,
// messages, files and routines, in one list the window sorts into its tabs (All / Agents / Channels / Messages / Files /
// Routines). Until now the window would have asked four APIs and filtered by itself.
//
// This computer only. Reading only: a search never changes anything, and a hit carries a short snippet, never a whole message.
// A message that the person deleted, or a thread they archived and deleted, is not found.

import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const SEARCH_KINDS = ["agents", "channels", "messages", "files", "routines"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export const SEARCH_LIMITS = {
  query: 200,
  defaultLimit: 20,
  maxLimit: 50,
  title: 160,
  snippet: 240,
} as const;

export interface SearchInput {
  /** What the person typed; spaces at the ends do not count. */
  q: string;
  /** Only these kinds; left out = all of them. */
  kinds?: SearchKind[];
  /** At most this many hits per kind (the window shows "All" as a mix of the first of each). */
  limit?: number;
}

export interface SearchHit {
  kind: SearchKind;
  /** The id of the thing found (agent id, channel id, message id, file id, routine id). */
  id: string;
  title: string;
  /** A line around the match; "" when there is nothing to show (an agent found by name). */
  snippet: string;
  /** Where to open it: the agent, the channel, the thread and the message, when they are known. */
  botId?: string;
  channelId?: string;
  threadId?: string;
  messageId?: string;
}

export interface SearchResult {
  q: string;
  hits: SearchHit[];
  /** True when some kind had more matches than `limit`. */
  truncated: boolean;
}

/** `window.openbot.search` (this computer only). */
export interface SearchDesktopApi {
  query: (input: SearchInput) => Promise<SearchResult>;
}

export interface ParsedSearch {
  q: string;
  kinds: SearchKind[];
  limit: number;
}

/** The question the engine answers: checked, trimmed, with every default filled in. An empty question is refused (nothing to show). */
export function parseSearchInput(input: unknown): ParsedSearch {
  if (!isDynamicRecord(input) || !isString(input.q)) throw new Error("The search needs some text.");
  const q = input.q.replace(/\s+/g, " ").trim();
  if (q.length === 0) throw new Error("The search needs some text.");
  if (q.length > SEARCH_LIMITS.query) throw new Error(`A search has at most ${SEARCH_LIMITS.query} characters.`);
  let kinds: SearchKind[] = [...SEARCH_KINDS];
  if (input.kinds !== undefined) {
    if (
      !Array.isArray(input.kinds) ||
      input.kinds.length === 0 ||
      !input.kinds.every((kind) => isOneOf(SEARCH_KINDS, kind))
    ) {
      throw new Error(`Search kinds are some of: ${SEARCH_KINDS.join(", ")}.`);
    }
    const asked: unknown[] = input.kinds;
    kinds = SEARCH_KINDS.filter((kind) => asked.includes(kind));
  }
  let limit: number = SEARCH_LIMITS.defaultLimit;
  if (input.limit !== undefined) {
    if (
      !isNumber(input.limit) ||
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > SEARCH_LIMITS.maxLimit
    ) {
      throw new Error(`The limit is a whole number from 1 to ${SEARCH_LIMITS.maxLimit}.`);
    }
    limit = input.limit;
  }
  return { q, kinds, limit };
}

/** A hit as the window shows it: the text is cut to the limits (the engine may give more). */
export function clipSearchHit(hit: SearchHit): SearchHit {
  return {
    ...hit,
    title: hit.title.slice(0, SEARCH_LIMITS.title),
    snippet: hit.snippet.slice(0, SEARCH_LIMITS.snippet),
  };
}

export function isSearchHit(value: unknown): value is SearchHit {
  return (
    isDynamicRecord(value) &&
    isOneOf(SEARCH_KINDS, value.kind) &&
    isString(value.id) &&
    isString(value.title) &&
    isString(value.snippet) &&
    (value.botId === undefined || isString(value.botId)) &&
    (value.channelId === undefined || isString(value.channelId)) &&
    (value.threadId === undefined || isString(value.threadId)) &&
    (value.messageId === undefined || isString(value.messageId))
  );
}

export function isSearchResult(value: unknown): value is SearchResult {
  return (
    isDynamicRecord(value) &&
    isString(value.q) &&
    Array.isArray(value.hits) &&
    value.hits.every(isSearchHit) &&
    isBoolean(value.truncated)
  );
}
