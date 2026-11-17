// COSGRAL W12-KK (2): Slack as a messenger driver, through SOCKET MODE: the program connects OUT to Slack with a WebSocket, so nothing
// listens, there is no web address and no webhook. Two secrets: the bot token (`xoxb-`, to read who the bot is and to post) and the
// app-level token (`xapp-`, only to open the socket). Both are write-only and never put in an error: every failure is a
// MessengerFailure with a FIXED sentence (the text of a network error or of Slack can hold a token or an address with one).
//
// What it reads: the `message` events of direct messages with the bot, plain text only. Everything else Slack sends (a bot's own
// message, an edit, a deletion, a file share, a slash command, a channel message) is either dropped or handed to the bridge as
// "not a private chat" so it is only counted. Every envelope Slack sends is acknowledged at once, ignored or not, and a redelivered
// event (same event id) is dropped. What it sends: plain text (`mrkdwn: false`, no link unfurling).

import { MESSENGER_FAILURE_SENTENCES } from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { WebSocket } from "ws";
import {
  type InboundMessage,
  type MessengerDriver,
  MessengerFailure,
  type MessengerFailureKind,
} from "./messenger-driver";

const DEFAULT_API = "https://slack.com/api";
const SENTENCES = MESSENGER_FAILURE_SENTENCES.slack;
const SEEN_LIMIT = 500;
const OPEN_TIMEOUT_MS = 15_000;

const FAILURE_SENTENCES: Readonly<Record<MessengerFailureKind, string>> = {
  "token-refused": SENTENCES.tokenRefused,
  conflict: "Another program already reads this Slack app's messages. Stop it, then connect again.",
  "rate-limited": "Slack asks the program to slow down. It tries again by itself.",
  network: SENTENCES.network,
  rejected: "Slack refused this message.",
};

function failure(kind: MessengerFailureKind, retryAfterMs: number | null = null): MessengerFailure {
  return new MessengerFailure(kind, FAILURE_SENTENCES[kind], retryAfterMs);
}

/** What Slack's `error` field means for the program (anything unknown is a refusal of this one request). */
function kindOfSlackError(error: string) {
  if (
    /^(invalid_auth|not_authed|token_revoked|token_expired|account_inactive|missing_scope|no_permission|invalid_token|org_login_required)$/.test(
      error,
    )
  ) {
    return "token-refused";
  }
  if (error === "ratelimited") return "rate-limited";
  if (/^(fatal_error|internal_error|service_unavailable|request_timeout)$/.test(error)) return "network";
  return "rejected";
}

export interface SlackDriverOptions {
  botToken: string;
  appToken: string;
  fetchImpl?: typeof fetch;
  /** Tests: a mock Slack on 127.0.0.1. The program uses Slack's own address. */
  apiBase?: string;
}

/** What this driver ever sends to the Web API. */
interface SlackRequestBody {
  channel?: string;
  text?: string;
  mrkdwn?: boolean;
  unfurl_links?: boolean;
  unfurl_media?: boolean;
}

interface Waiter {
  resolve: () => void;
}

export function createSlackDriver(options: SlackDriverOptions): MessengerDriver {
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

  const wake = () => {
    for (const waiter of [...waiters]) waiter.resolve();
  };

  /** One Web API call. Only the fields this file knows are read; the answer's text is never reused. */
  async function call(method: string, token: string, body: SlackRequestBody, signal?: AbortSignal) {
    let response: Response;
    try {
      response = await doFetch(`${base}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: signal ?? AbortSignal.timeout(30_000),
      });
    } catch {
      throw failure("network");
    }
    if (response.status === 429) {
      const seconds = Number(response.headers.get("retry-after"));
      throw failure("rate-limited", (Number.isFinite(seconds) ? Math.min(Math.max(seconds, 1), 300) : 5) * 1000);
    }
    if (response.status === 401 || response.status === 403) throw failure("token-refused");
    if (response.status >= 500) throw failure("network");
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      throw failure("network");
    }
    if (!isDynamicRecord(payload)) throw failure("network");
    if (payload.ok !== true) throw failure(kindOfSlackError(isString(payload.error) ? payload.error : ""));
    return payload;
  }

  async function authTest(signal?: AbortSignal): Promise<string> {
    const answer = await call("auth.test", options.botToken, {}, signal);
    if (isString(answer.user_id) && /^[A-Z0-9]{3,20}$/.test(answer.user_id)) botUserId = answer.user_id;
    return isString(answer.user) && /^[A-Za-z0-9._-]{1,80}$/.test(answer.user) ? `@${answer.user}` : "@bot";
  }

  /** Asks Slack for a one-time socket address with the app-level token. */
  async function socketAddress(signal?: AbortSignal): Promise<string> {
    const answer = await call("apps.connections.open", options.appToken, {}, signal);
    if (!isString(answer.url)) throw failure("network");
    let url: URL;
    try {
      url = new URL(answer.url);
    } catch {
      throw failure("network");
    }
    // Slack's address is a secure WebSocket; a plain one is only accepted for this computer (tests).
    const local = url.protocol === "ws:" && url.hostname === "127.0.0.1";
    if (url.protocol !== "wss:" && !local) throw failure("network");
    return url.toString();
  }

  function remember(eventId: string): boolean {
    if (seen.has(eventId)) return false;
    seen.add(eventId);
    if (seen.size > SEEN_LIMIT) {
      const oldest = seen.values().next();
      if (!oldest.done) seen.delete(oldest.value);
    }
    return true;
  }

  function read(current: WebSocket, raw: string): void {
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isDynamicRecord(message)) return;
    // Acknowledge every envelope at once (ignored or not), or Slack sends it again.
    if (isString(message.envelope_id)) current.send(JSON.stringify({ envelope_id: message.envelope_id }));
    if (message.type === "disconnect") {
      // Slack asks the program to reconnect (it does so now and then): the next receive opens a new socket.
      lost = true;
      current.close();
      return;
    }
    if (message.type !== "events_api" || !isDynamicRecord(message.payload)) return;
    const payload = message.payload;
    const event = payload.event;
    if (!isDynamicRecord(event) || event.type !== "message") return;
    // The bot's own messages, edits, deletions, file shares and other kinds of message are dropped, not counted.
    if (isString(event.subtype) || isString(event.bot_id) || (botUserId !== null && event.user === botUserId)) return;
    if (isString(payload.event_id) && !remember(payload.event_id)) return;
    if (!isString(event.channel)) {
      queue.push({ next: null, chat: null, text: null });
      wake();
      return;
    }
    const direct = event.channel_type === "im";
    queue.push({
      next: null,
      chat: {
        id: event.channel,
        kind: direct ? "private" : "other",
        title: direct && isString(event.user) ? event.user : "",
      },
      text: isString(event.text) ? event.text : null,
    });
    wake();
  }

  function open(signal?: AbortSignal): Promise<void> {
    opening ??= (async () => {
      const url = await socketAddress(signal);
      await new Promise<void>((resolve, reject) => {
        const created = new WebSocket(url, { handshakeTimeout: OPEN_TIMEOUT_MS, maxPayload: 2 * 1024 * 1024 });
        const timer = setTimeout(() => {
          created.terminate();
          reject(failure("network"));
        }, OPEN_TIMEOUT_MS);
        let ready = false;
        created.on("message", (data) => {
          const raw = data.toString("utf8");
          if (!ready) {
            // The first thing Slack says is "hello".
            let first: unknown;
            try {
              first = JSON.parse(raw);
            } catch {
              first = null;
            }
            if (isDynamicRecord(first) && first.type === "hello") {
              ready = true;
              clearTimeout(timer);
              socket = created;
              lost = false;
              resolve();
              return;
            }
          }
          read(created, raw);
        });
        created.on("error", () => {
          clearTimeout(timer);
          if (!ready) reject(failure("network"));
        });
        created.on("close", () => {
          clearTimeout(timer);
          if (!ready) reject(failure("network"));
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
      const name = await authTest(signal);
      // Checks the app-level token and its scope now, so a wrong one is refused at connect time. The address is not used.
      await socketAddress(signal);
      return name;
    },
    identify: (signal) => authTest(signal),
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
      await call(
        "chat.postMessage",
        options.botToken,
        { channel: chatId, text, mrkdwn: false, unfurl_links: false, unfurl_media: false },
        signal,
      );
    },
    close: () => {
      closed = true;
      socket?.close();
      socket = null;
      wake();
    },
  };
}
