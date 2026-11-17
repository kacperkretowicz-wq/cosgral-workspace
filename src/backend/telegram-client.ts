// COSGRAL W10-KK2: a small client of the Telegram Bot API (https://core.telegram.org/bots/api): getMe, getUpdates (long polling,
// no webhook, no server) and sendMessage (plain text, no formatting mode, so nothing a person writes is read as markup).
//
// THE TOKEN IS A SECRET THAT TELEGRAM PUTS IN THE ADDRESS of every request (`/bot<token>/method`). So the error text of the
// network layer (which can contain the address) is never used: every failure is turned into a TelegramFailure with a FIXED
// sentence. Nothing here logs. A response body is only read for the fields this file knows.

import { type DynamicRecord, isBoolean, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { MessengerFailure, type MessengerFailureKind } from "./messenger-driver";

export type TelegramFailureKind = MessengerFailureKind;

const SENTENCES: ReadonlyArray<readonly [TelegramFailureKind, string]> = [
  [
    "token-refused",
    "Telegram does not accept the token (it may have been revoked). Make a new one with BotFather and connect again.",
  ],
  ["conflict", "Another program or a webhook already reads this bot's messages. Stop it, then connect again."],
  ["rate-limited", "Telegram asks the program to slow down. It tries again by itself."],
  ["network", "Telegram cannot be reached right now. The program tries again by itself."],
  ["rejected", "Telegram refused this message."],
];

export class TelegramFailure extends MessengerFailure {
  constructor(kind: TelegramFailureKind, retryAfterMs: number | null = null) {
    super(kind, SENTENCES.find(([known]) => known === kind)?.[1] ?? "Telegram failed.", retryAfterMs);
    this.name = "TelegramFailure";
  }
}

export interface TelegramChat {
  id: number;
  type: string;
  /** A person's name or the public name of the chat; used only as a label, never trusted. */
  title: string;
}

export interface TelegramUpdate {
  updateId: number;
  /** Only a `message` update is read; others come as `chat: null`. */
  chat: TelegramChat | null;
  text: string | null;
}

/** What this file needs from fetch (the global fetch fits; a test passes its own). */
export type TelegramFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<Response>;

/** What Telegram puts in `result`: a record (getMe, sendMessage), a list (getUpdates) or true (deleteWebhook). */
type TelegramResult = DynamicRecord | readonly unknown[] | boolean | null;

type TelegramRequestBody = Record<string, number | boolean | string | string[]>;

export interface TelegramClientOptions {
  token: string;
  fetchImpl?: TelegramFetch;
  /** Tests: a mock service on 127.0.0.1. The program uses Telegram's own address. */
  apiBase?: string;
}

const DEFAULT_BASE = "https://api.telegram.org";
const REQUEST_SLACK_MS = 15_000;

export class TelegramClient {
  readonly #token: string;
  readonly #fetch: TelegramFetch;
  readonly #base: string;

  constructor(options: TelegramClientOptions) {
    this.#token = options.token;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#base = options.apiBase ?? DEFAULT_BASE;
  }

  /** The bot's public name (`@name`) as Telegram gives it. Also the check that the token is real. */
  async getMe(signal?: AbortSignal): Promise<string> {
    const result = await this.#call("getMe", {}, 15_000, signal);
    if (!isDynamicRecord(result) || result.is_bot !== true) throw new TelegramFailure("rejected");
    return isString(result.username) && /^[A-Za-z0-9_]{1,64}$/.test(result.username) ? `@${result.username}` : "@bot";
  }

  /** A bot with a webhook gets no long polling; the owner connects it here, so the webhook is removed (pending messages stay). */
  async deleteWebhook(signal?: AbortSignal): Promise<void> {
    await this.#call("deleteWebhook", { drop_pending_updates: false }, 15_000, signal);
  }

  /** Waits up to `timeoutSeconds` for new messages (Telegram answers at once when there are some). */
  async getUpdates(offset: number | null, timeoutSeconds: number, signal?: AbortSignal): Promise<TelegramUpdate[]> {
    const body: TelegramRequestBody = { timeout: timeoutSeconds, allowed_updates: ["message"] };
    if (offset !== null) body.offset = offset;
    const result = await this.#call("getUpdates", body, timeoutSeconds * 1000 + REQUEST_SLACK_MS, signal);
    if (!Array.isArray(result)) throw new TelegramFailure("network");
    const updates: TelegramUpdate[] = [];
    for (const entry of result) {
      const update = readUpdate(entry);
      if (update) updates.push(update);
    }
    return updates;
  }

  async sendMessage(chatId: string, text: string, signal?: AbortSignal): Promise<void> {
    await this.#call("sendMessage", { chat_id: Number(chatId), text }, 30_000, signal);
  }

  async #call(
    method: string,
    body: TelegramRequestBody,
    timeoutMs: number,
    outer?: AbortSignal,
  ): Promise<TelegramResult> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    outer?.addEventListener("abort", abort, { once: true });
    if (outer?.aborted) controller.abort();
    const timer = setTimeout(abort, timeoutMs);
    try {
      const response = await this.#fetch(`${this.#base}/bot${this.#token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      return interpret(response.status, payload);
    } catch (error) {
      if (error instanceof TelegramFailure) throw error;
      // Whatever the network layer said may contain the address, and so the token. It is dropped.
      throw new TelegramFailure("network");
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener("abort", abort);
    }
  }
}

function interpret(status: number, payload: unknown): TelegramResult {
  const body = isDynamicRecord(payload) ? payload : null;
  if (status >= 200 && status < 300 && body !== null && body.ok === true) return toResult(body.result);
  if (status === 401 || status === 404) throw new TelegramFailure("token-refused");
  if (status === 409) throw new TelegramFailure("conflict");
  if (status === 429) {
    const parameters = body !== null && isDynamicRecord(body.parameters) ? body.parameters : null;
    const seconds = parameters !== null && isNumber(parameters.retry_after) ? parameters.retry_after : 5;
    throw new TelegramFailure("rate-limited", Math.min(Math.max(seconds, 1), 300) * 1000);
  }
  if (status >= 500) throw new TelegramFailure("network");
  if (status >= 400 && status < 500) throw new TelegramFailure("rejected");
  throw new TelegramFailure("network");
}

function toResult(value: unknown): TelegramResult {
  if (Array.isArray(value)) return value;
  if (isDynamicRecord(value) || isBoolean(value)) return value;
  return null;
}

function readUpdate(entry: unknown): TelegramUpdate | null {
  if (!isDynamicRecord(entry) || !isNumber(entry.update_id)) return null;
  const updateId = entry.update_id;
  const message = entry.message;
  const chat = isDynamicRecord(message) ? message.chat : null;
  if (!isDynamicRecord(message) || !isDynamicRecord(chat) || !isNumber(chat.id) || !isString(chat.type)) {
    return { updateId, chat: null, text: null };
  }
  const names = [chat.first_name, chat.last_name].filter(isString).join(" ").trim();
  const title =
    names || (isString(chat.title) ? chat.title : "") || (isString(chat.username) ? `@${chat.username}` : "");
  return {
    updateId,
    chat: { id: chat.id, type: chat.type, title },
    text: isString(message.text) ? message.text : null,
  };
}
