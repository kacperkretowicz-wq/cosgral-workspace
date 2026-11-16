// COSGRAL W10-KK2 (test support): a mock Telegram Bot API on 127.0.0.1 (`/bot<token>/<method>`): getMe, deleteWebhook, getUpdates
// (long polling that waits a short while and honours the offset) and sendMessage. No real bot, no call outside this computer.

import { createServer, type IncomingMessage, type Server } from "node:http";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { portOf } from "./oauth-mock";

export interface MockSent {
  chatId: number;
  text: string;
}

interface QueuedUpdate {
  update_id: number;
  message?: object;
}

export class MockTelegram {
  /** The only token this mock accepts. */
  readonly token: string;
  readonly sent: MockSent[] = [];
  /** Every request seen: the method and the offset asked for. */
  readonly calls: Array<{ method: string; offset: number | null }> = [];
  /** The next requests answer with this HTTP status (and a Telegram-style body) instead of working. */
  failWith: { status: number; times: number; retryAfter?: number } | null = null;
  /** Sending to this chat is refused with 403 (the person blocked the bot). */
  blockedChat: number | null = null;
  base = "";
  readonly #server: Server;
  #updates: QueuedUpdate[] = [];
  #nextId = 100;

  constructor(token: string) {
    this.token = token;
    this.#server = createServer((request, response) => {
      void this.#handle(request).then((out) => {
        response.writeHead(out.status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(out.body));
      });
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((done) => this.#server.listen(0, "127.0.0.1", done));
    this.base = `http://127.0.0.1:${portOf(this.#server)}`;
  }

  stop(): Promise<void> {
    this.#server.closeAllConnections();
    return new Promise((done) => this.#server.close(() => done()));
  }

  /** A person writes: `private` chats by default. */
  say(input: { chatId: number; text?: string; name?: string; type?: string; photo?: boolean }): void {
    this.#nextId += 1;
    const message: Record<string, number | string | object | undefined> = {
      message_id: this.#nextId,
      chat: { id: input.chatId, type: input.type ?? "private", first_name: input.name ?? "Person" },
      date: 1,
    };
    if (input.text !== undefined) message.text = input.text;
    if (input.photo) message.photo = [{ file_id: "x" }];
    this.#updates.push({ update_id: this.#nextId, message });
  }

  get pending(): number {
    return this.#updates.length;
  }

  async #handle(request: IncomingMessage): Promise<{ status: number; body: object }> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const match = /^\/bot([^/]+)\/(\w+)$/.exec(request.url ?? "");
    if (!match) return { status: 404, body: { ok: false } };
    const [, token, method] = match;
    let body: unknown = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      body = {};
    }
    const input = isDynamicRecord(body) ? body : {};
    const offset = isNumber(input.offset) ? input.offset : null;
    this.calls.push({ method, offset });
    if (token !== this.token) return { status: 401, body: { ok: false, error_code: 401, description: "Unauthorized" } };
    if (this.failWith && this.failWith.times > 0 && method === "getUpdates") {
      this.failWith.times -= 1;
      const parameters = this.failWith.retryAfter ? { retry_after: this.failWith.retryAfter } : undefined;
      return { status: this.failWith.status, body: { ok: false, description: "mock failure", parameters } };
    }
    if (method === "getMe")
      return { status: 200, body: { ok: true, result: { id: 1, is_bot: true, username: "demo_helper_bot" } } };
    if (method === "deleteWebhook") return { status: 200, body: { ok: true, result: true } };
    if (method === "sendMessage") {
      const chatId = isNumber(input.chat_id) ? input.chat_id : 0;
      if (chatId === this.blockedChat)
        return { status: 403, body: { ok: false, description: "Forbidden: bot was blocked" } };
      this.sent.push({ chatId, text: isString(input.text) ? input.text : "" });
      return { status: 200, body: { ok: true, result: { message_id: 1 } } };
    }
    if (method === "getUpdates") {
      if (offset !== null) this.#updates = this.#updates.filter((update) => update.update_id >= offset);
      if (this.#updates.length === 0) await new Promise((resolve) => setTimeout(resolve, 150));
      return { status: 200, body: { ok: true, result: this.#updates } };
    }
    return { status: 404, body: { ok: false } };
  }
}
