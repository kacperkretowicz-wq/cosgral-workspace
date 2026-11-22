// COSGRAL W12-KK (3): Discord as a messenger driver, through the GATEWAY: the program connects OUT to Discord with a WebSocket, so
// nothing listens, there is no web address and no webhook. One secret: the bot token. It is write-only and never put in an error:
// every failure is a MessengerFailure with a FIXED sentence (the text of a network error or of Discord can hold a token or an address).
//
// What it reads: `MESSAGE_CREATE` events of DIRECT messages with the bot, plain text only (the one intent it asks for is
// DIRECT_MESSAGES, which Discord does not treat as privileged). The bot's own messages, other bots, webhooks, system messages and
// repeats (same message id) are dropped; a message from a server is handed to the bridge as "not a private chat" so it is only counted.
// A short drop or a "reconnect" request of Discord resumes the same session (nothing is lost); only when Discord forgets the session
// does a fresh one start (messages sent in that gap are not replayed by Discord).
// What it sends: plain text in parts of at most 2000 characters (Discord's limit), no mentions of anyone, no link previews.

import { MESSENGER_FAILURE_SENTENCES } from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { WebSocket } from "ws";
import {
  type InboundMessage,
  type MessengerDriver,
  MessengerFailure,
  type MessengerFailureKind,
} from "./messenger-driver";

const DEFAULT_API = "https://discord.com/api/v10";
const SENTENCES = MESSENGER_FAILURE_SENTENCES.discord;
const SEEN_LIMIT = 500;
const OPEN_TIMEOUT_MS = 15_000;
/** Discord refuses a message of more than 2000 characters. */
export const DISCORD_PART_LIMIT = 2000;
/** DIRECT_MESSAGES (1 << 12): the only intent used. */
const INTENT_DIRECT_MESSAGES = 4096;
/** SUPPRESS_EMBEDS: no link previews. */
const FLAG_SUPPRESS_EMBEDS = 4;
/** Message types that are a person's text: a normal message (0) and a reply (19). Joins, pins, calls and the rest are dropped. */
const TEXT_TYPES = new Set([0, 19]);

const FAILURE_SENTENCES: Readonly<Record<MessengerFailureKind, string>> = {
  "token-refused": SENTENCES.tokenRefused,
  conflict: "Another program already uses this Discord bot. Stop it, then connect again.",
  "rate-limited": "Discord asks the program to slow down. It tries again by itself.",
  network: SENTENCES.network,
  rejected: "Discord refused this message (the person may have closed direct messages with the bot).",
};

function failure(kind: MessengerFailureKind, retryAfterMs: number | null = null): MessengerFailure {
  return new MessengerFailure(kind, FAILURE_SENTENCES[kind], retryAfterMs);
}

export interface DiscordDriverOptions {
  botToken: string;
  fetchImpl?: typeof fetch;
  /** Tests: a mock Discord on 127.0.0.1. The program uses Discord's own address. */
  apiBase?: string;
}

/** What this driver ever sends to the REST API. */
interface DiscordMessageBody {
  content: string;
  allowed_mentions: { parse: [] };
  flags: number;
}

interface Waiter {
  resolve: () => void;
}

/** One answer into parts Discord accepts: cut at a line end where there is one, else at the limit. Nothing is dropped here. */
export function splitForDiscord(text: string): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > DISCORD_PART_LIMIT) {
    const window = rest.slice(0, DISCORD_PART_LIMIT);
    const lineEnd = window.lastIndexOf("\n");
    const cut = lineEnd > DISCORD_PART_LIMIT / 2 ? lineEnd : DISCORD_PART_LIMIT;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) parts.push(rest);
  return parts;
}

/** A name Discord shows for a person, as a plain one-line label (the bridge shortens it again). */
function personName(author: DynamicRecord): string {
  const name = isString(author.global_name) && author.global_name.length > 0 ? author.global_name : author.username;
  return isString(name) ? name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
}

export function createDiscordDriver(options: DiscordDriverOptions): MessengerDriver {
  const base = options.apiBase ?? DEFAULT_API;
  const doFetch = options.fetchImpl ?? fetch;
  const queue: InboundMessage[] = [];
  const seen = new Set<string>();
  const waiters = new Set<Waiter>();
  let socket: WebSocket | null = null;
  let opening: Promise<void> | null = null;
  let botUserId: string | null = null;
  let closed = false;
  let lost = false;
  /** Set when Discord closed the socket because the token is wrong: the next open fails with it and does not try again. */
  let refused = false;
  // What a resume needs.
  let sequence: number | null = null;
  let sessionId: string | null = null;
  let resumeAddress: string | null = null;

  const wake = () => {
    for (const waiter of [...waiters]) waiter.resolve();
  };

  /** One REST call. Only the fields this file knows are read; the answer's text is never reused. */
  async function call(
    method: "GET" | "POST",
    path: string,
    body: DiscordMessageBody | null,
    signal: AbortSignal | undefined,
    forbidden: MessengerFailureKind,
  ): Promise<DynamicRecord> {
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bot ${options.botToken}`,
          "User-Agent": "DiscordBot (Cosgral Workspace, 1.0)",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: signal ?? AbortSignal.timeout(30_000),
      });
    } catch {
      throw failure("network");
    }
    if (response.status === 429) {
      // The header first, then the body (Discord puts a fractional `retry_after` there). A missing header is not "0 seconds".
      const header = response.headers.get("retry-after");
      let seconds = header === null || header.trim() === "" ? Number.NaN : Number(header);
      if (!Number.isFinite(seconds)) {
        try {
          let limited: unknown = null;
          limited = await response.json();
          seconds = isDynamicRecord(limited) && isNumber(limited.retry_after) ? limited.retry_after : Number.NaN;
        } catch {
          seconds = Number.NaN;
        }
      }
      throw failure(
        "rate-limited",
        Math.round((Number.isFinite(seconds) ? Math.min(Math.max(seconds, 1), 300) : 5) * 1000),
      );
    }
    if (response.status === 401) throw failure("token-refused");
    if (response.status === 403) throw failure(forbidden);
    if (response.status >= 500) throw failure("network");
    if (response.status >= 400) throw failure("rejected");
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      throw failure("network");
    }
    if (!isDynamicRecord(payload)) throw failure("network");
    return payload;
  }

  async function identity(signal?: AbortSignal): Promise<string> {
    const me = await call("GET", "/users/@me", null, signal, "token-refused");
    if (isString(me.id) && /^\d{17,20}$/.test(me.id)) botUserId = me.id;
    return isString(me.username) && /^[A-Za-z0-9._-]{1,80}$/.test(me.username) ? `@${me.username}` : "@bot";
  }

  /** Asks Discord for the socket address (this also proves the token has the right to connect). */
  async function gatewayAddress(signal?: AbortSignal): Promise<string> {
    const answer = await call("GET", "/gateway/bot", null, signal, "token-refused");
    if (!isString(answer.url)) throw failure("network");
    return checkedSocketAddress(answer.url);
  }

  function checkedSocketAddress(address: string): string {
    let url: URL;
    try {
      url = new URL(address);
    } catch {
      throw failure("network");
    }
    // Discord's address is a secure WebSocket; a plain one is only accepted for this computer (tests).
    const local = url.protocol === "ws:" && url.hostname === "127.0.0.1";
    if (url.protocol !== "wss:" && !local) throw failure("network");
    url.searchParams.set("v", "10");
    url.searchParams.set("encoding", "json");
    return url.toString();
  }

  function remember(messageId: string): boolean {
    if (seen.has(messageId)) return false;
    seen.add(messageId);
    if (seen.size > SEEN_LIMIT) {
      const oldest = seen.values().next();
      if (!oldest.done) seen.delete(oldest.value);
    }
    return true;
  }

  function readMessage(data: DynamicRecord): void {
    const author = data.author;
    if (!isDynamicRecord(author) || !isString(data.id) || !isString(data.channel_id)) return;
    // The bot's own messages, other bots, webhooks and system messages are dropped, not counted.
    if (author.bot === true || (botUserId !== null && author.id === botUserId) || isString(data.webhook_id)) return;
    if (!isNumber(data.type) || !TEXT_TYPES.has(data.type)) return;
    if (!remember(data.id)) return;
    const direct = !isString(data.guild_id);
    queue.push({
      next: null,
      chat: {
        id: data.channel_id,
        kind: direct ? "private" : "other",
        title: direct ? personName(author) : "",
      },
      // What a message from a server says is never kept: it is only counted.
      text: direct && isString(data.content) && data.content.trim().length > 0 ? data.content : null,
    });
    wake();
  }

  function open(signal?: AbortSignal): Promise<void> {
    opening ??= (async () => {
      if (refused) throw failure("token-refused");
      const resuming = sessionId !== null && resumeAddress !== null && sequence !== null;
      const url =
        resuming && resumeAddress !== null ? checkedSocketAddress(resumeAddress) : await gatewayAddress(signal);
      await new Promise<void>((resolve, reject) => {
        const created = new WebSocket(url, { handshakeTimeout: OPEN_TIMEOUT_MS, maxPayload: 4 * 1024 * 1024 });
        let ready = false;
        let beat: ReturnType<typeof setInterval> | null = null;
        let firstBeat: ReturnType<typeof setTimeout> | null = null;
        let answered = true;
        const timer = setTimeout(() => {
          created.terminate();
          reject(failure("network"));
        }, OPEN_TIMEOUT_MS);

        const heartbeat = () => {
          // A heartbeat that Discord did not answer before the next one means the connection is dead: drop it, the next open resumes.
          if (!answered) {
            created.terminate();
            return;
          }
          answered = false;
          if (created.readyState === 1) created.send(JSON.stringify({ op: 1, d: sequence }));
        };
        const stopBeating = () => {
          if (beat) clearInterval(beat);
          if (firstBeat) clearTimeout(firstBeat);
          beat = null;
          firstBeat = null;
        };
        const becomeReady = () => {
          if (ready) return;
          ready = true;
          clearTimeout(timer);
          socket = created;
          lost = false;
          resolve();
        };

        created.on("message", (raw) => {
          let message: unknown;
          try {
            message = JSON.parse(raw.toString("utf8"));
          } catch {
            return;
          }
          if (!isDynamicRecord(message) || !isNumber(message.op)) return;
          if (isNumber(message.s)) sequence = message.s;
          const data = isDynamicRecord(message.d) ? message.d : null;
          if (message.op === 10 && data && isNumber(data.heartbeat_interval)) {
            const interval = Math.min(Math.max(data.heartbeat_interval, 10), 120_000);
            firstBeat = setTimeout(
              () => {
                heartbeat();
                beat = setInterval(heartbeat, interval);
              },
              Math.floor(Math.random() * interval),
            );
            created.send(
              JSON.stringify(
                resuming
                  ? { op: 6, d: { token: options.botToken, session_id: sessionId, seq: sequence } }
                  : {
                      op: 2,
                      d: {
                        token: options.botToken,
                        intents: INTENT_DIRECT_MESSAGES,
                        properties: { os: process.platform, browser: "cosgral", device: "cosgral" },
                      },
                    },
              ),
            );
            return;
          }
          if (message.op === 1) return heartbeat();
          if (message.op === 11) {
            answered = true;
            return;
          }
          if (message.op === 7) {
            // Discord asks the program to connect again: the next receive resumes the session.
            lost = true;
            created.close();
            return;
          }
          if (message.op === 9) {
            // The session cannot be resumed (data false) or Discord wants a fresh start: forget it and connect again.
            if (message.d !== true) {
              sessionId = null;
              resumeAddress = null;
              sequence = null;
            }
            lost = true;
            created.close();
            return;
          }
          if (message.op !== 0 || !data) return;
          if (message.t === "READY") {
            if (isString(data.session_id)) sessionId = data.session_id;
            if (isString(data.resume_gateway_url)) resumeAddress = data.resume_gateway_url;
            if (isDynamicRecord(data.user) && isString(data.user.id) && /^\d{17,20}$/.test(data.user.id))
              botUserId = data.user.id;
            becomeReady();
          } else if (message.t === "RESUMED") {
            becomeReady();
          } else if (message.t === "MESSAGE_CREATE") {
            readMessage(data);
          }
        });
        created.on("error", () => {
          clearTimeout(timer);
          if (!ready) reject(failure("network"));
        });
        created.on("close", (code) => {
          clearTimeout(timer);
          stopBeating();
          // 4004: the token is wrong. 4007 and 4009: Discord no longer knows the session, so the next open starts a fresh one.
          if (code === 4004) refused = true;
          if (code === 4007 || code === 4009) {
            sessionId = null;
            resumeAddress = null;
            sequence = null;
          }
          if (!ready) reject(failure(code === 4004 ? "token-refused" : "network"));
          if (socket === created) socket = null;
          lost = true;
          wake();
        });
      });
    })().finally(() => {
      opening = null;
    });
    return opening;
  }

  return {
    connect: async (signal) => {
      const name = await identity(signal);
      // Asks for the socket address now, so a token without the right to connect is refused at connect time. The address is not used.
      await gatewayAddress(signal);
      return name;
    },
    identify: (signal) => identity(signal),
    receive: async (_from, waitSeconds, signal) => {
      if (closed) return [];
      // Messages that already came are handed over first, even if the socket was lost since.
      if (queue.length > 0) return queue.splice(0, queue.length);
      if (socket === null || lost) await open(signal);
      if (closed) {
        socket?.close();
        socket = null;
        return [];
      }
      if (queue.length === 0 && !signal.aborted) {
        await new Promise<void>((resolve) => {
          const waiter: Waiter = { resolve: done };
          const timer = setTimeout(done, waitSeconds * 1000);
          function done() {
            clearTimeout(timer);
            signal.removeEventListener("abort", done);
            waiters.delete(waiter);
            resolve();
          }
          waiters.add(waiter);
          signal.addEventListener("abort", done, { once: true });
        });
      }
      return queue.splice(0, queue.length);
    },
    send: async (chatId, text, signal) => {
      // The id goes into the address of the request: only a number of the right shape is ever used.
      if (!/^\d{17,20}$/.test(chatId)) throw failure("rejected");
      for (const part of splitForDiscord(text)) {
        await call(
          "POST",
          `/channels/${chatId}/messages`,
          { content: part, allowed_mentions: { parse: [] }, flags: FLAG_SUPPRESS_EMBEDS },
          signal,
          "rejected",
        );
      }
    },
    close: () => {
      closed = true;
      socket?.close();
      socket = null;
      wake();
    },
  };
}
