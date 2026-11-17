// COSGRAL W11 (U3): the search of the window (contract: ipc-search.ts). One question over agents, channels, messages, files and
// routines. Reading only. Messages come from the database by a plain text match (never a pattern); the other kinds are looked up in
// the lists the program already keeps, by the same plain, case-insensitive match. A hit carries a short snippet, never a whole message.

import {
  clipSearchHit,
  parseSearchInput,
  SEARCH_LIMITS,
  type SearchHit,
  type SearchKind,
  type SearchResult,
} from "@openbot/contracts/ipc";

export interface SearchSources {
  agents: () => Array<{ id: string; name: string; role: string }>;
  /** Channels that exist (archived ones may be listed; they are not found). */
  channels: () => Array<{ id: string; name: string; title: string; archived: boolean }>;
  messages: (
    needle: string,
    limit: number,
  ) => Array<{ threadId: string; botId: string; messageId: string; text: string }>;
  /** Library files whose name holds `needle`. */
  files: (needle: string, limit: number) => Array<{ id: string; name: string }>;
  routines: () => Array<{ id: string; botId: string; name: string; prompt: string }>;
  /** Agent names, to say whose message it is. */
  agentName?: (botId: string) => string | null;
}

/** A line around the first match: some words before, the match, the rest up to the limit; cut ends are marked with an ellipsis. */
export function snippetAround(text: string, needle: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return flat.slice(0, SEARCH_LIMITS.snippet);
  const start = Math.max(0, at - 40);
  const end = Math.min(flat.length, start + SEARCH_LIMITS.snippet - 2);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

export class SearchService {
  readonly #sources: SearchSources;

  constructor(sources: SearchSources) {
    this.#sources = sources;
  }

  query(input: unknown): SearchResult {
    const { q, kinds, limit } = parseSearchInput(input);
    const needle = q.toLowerCase();
    const has = (...parts: string[]) => parts.some((part) => part.toLowerCase().includes(needle));
    const hits: SearchHit[] = [];
    let truncated = false;
    const take = (found: SearchHit[]) => {
      if (found.length > limit) truncated = true;
      hits.push(...found.slice(0, limit).map(clipSearchHit));
    };
    for (const kind of kinds) take(this.#found(kind, q, limit, has));
    return { q, hits, truncated };
  }

  #found(kind: SearchKind, q: string, limit: number, has: (...parts: string[]) => boolean): SearchHit[] {
    const sources = this.#sources;
    switch (kind) {
      case "agents":
        return sources
          .agents()
          .filter((agent) => has(agent.name, agent.role))
          .map((agent) => ({ kind, id: agent.id, title: agent.name, snippet: agent.role, botId: agent.id }));
      case "channels":
        return sources
          .channels()
          .filter((channel) => !channel.archived && has(channel.name, channel.title))
          .map((channel) => ({
            kind,
            id: channel.id,
            title: channel.title || channel.name,
            snippet: "",
            channelId: channel.id,
          }));
      case "messages":
        return sources.messages(q, limit + 1).map((message) => ({
          kind,
          id: message.messageId,
          title: sources.agentName?.(message.botId) ?? message.botId,
          snippet: snippetAround(message.text, q),
          botId: message.botId,
          threadId: message.threadId,
          messageId: message.messageId,
        }));
      case "files":
        return sources.files(q, limit + 1).map((file) => ({ kind, id: file.id, title: file.name, snippet: "" }));
      case "routines":
        return sources
          .routines()
          .filter((routine) => has(routine.name, routine.prompt))
          .map((routine) => ({
            kind,
            id: routine.id,
            title: routine.name,
            snippet: snippetAround(routine.prompt, q),
            botId: routine.botId,
          }));
    }
  }
}
