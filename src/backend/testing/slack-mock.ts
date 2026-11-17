// COSGRAL W12-KK (test support): a mock Slack on 127.0.0.1: the Web API calls the driver makes (auth.test, apps.connections.open,
// chat.postMessage) and a Socket Mode WebSocket that says "hello", pushes events, expects an acknowledgement of each envelope and
// can ask the program to reconnect. No real workspace, no call outside this computer.

import { createServer, type IncomingMessage, type Server } from "node:http";
import { isBoolean, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { type WebSocket, WebSocketServer } from "ws";
import { portOf } from "./oauth-mock";

export interface MockSlackPost {
  channel: string;
  text: string;
  mrkdwn: boolean | null;
}

export class MockSlack {
  readonly botToken: string;
  readonly appToken: string;
  readonly posts: MockSlackPost[] = [];
  readonly acknowledged: string[] = [];
  /** Sockets opened so far (a reconnect makes a new one). */
  socketsOpened = 0;
  /** Web API calls seen, by method. */
  readonly calls: string[] = [];
  /** The next `chat.postMessage` answers with this Slack error (once). */
  postError: { error: string } | { status: 429; retryAfter: number } | null = null;
  /** The next `apps.connections.open` answers with this HTTP status (a 5xx makes the network look down). */
  openStatus: number | null = null;
  /** The id of the bot's own user, as `auth.test` says. */
  readonly botUserId = "U0BOTUSER1";
  base = "";
  readonly #http: Server;
  readonly #sockets: WebSocketServer;
  readonly #listening: Promise<void>;
  #live: WebSocket | null = null;
  #counter = 0;

  constructor(botToken: string, appToken: string) {
    this.botToken = botToken;
    this.appToken = appToken;
    const sockets = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    this.#sockets = sockets;
    this.#listening = new Promise<void>((resolve) => {
      sockets.once("listening", () => resolve());
    });
    this.#http = createServer((request, response) => {
      void this.#handle(request).then((out) => {
        response.writeHead(out.status, { "Content-Type": "application/json", ...(out.headers ?? {}) });
        response.end(JSON.stringify(out.body));
      });
    });
    this.#sockets.on("connection", (socket) => {
      this.socketsOpened += 1;
      this.#live = socket;
      socket.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString("utf8"));
          if (isDynamicRecord(message) && isString(message.envelope_id)) this.acknowledged.push(message.envelope_id);
        } catch {
          // ignored
        }
      });
      socket.send(JSON.stringify({ type: "hello" }));
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.#http.listen(0, "127.0.0.1", resolve));
    this.base = `http://127.0.0.1:${portOf(this.#http)}/api`;
    await this.#listening;
  }

  async stop(): Promise<void> {
    for (const client of this.#sockets.clients) client.terminate();
    await new Promise<void>((resolve) => this.#sockets.close(() => resolve()));
    await new Promise<void>((resolve) => this.#http.close(() => resolve()));
  }

  get socketUrl(): string {
    const address = this.#sockets.address();
    return `ws://127.0.0.1:${isDynamicRecord(address) && isNumber(address.port) ? address.port : 0}/link`;
  }

  /** Waits until a socket is open. */
  async connected(): Promise<void> {
    for (let index = 0; index < 300 && this.#live?.readyState !== 1; index += 1)
      await new Promise((r) => setTimeout(r, 10));
  }

  /** Pushes a `message` event envelope (a direct message by default). */
  push(event: {
    channel: string;
    user?: string;
    text?: string;
    channelType?: string;
    subtype?: string;
    botId?: string;
    eventId?: string;
  }): string {
    this.#counter += 1;
    const envelope = `env-${this.#counter}`;
    this.#live?.send(
      JSON.stringify({
        envelope_id: envelope,
        type: "events_api",
        accepts_response_payload: false,
        payload: {
          event_id: event.eventId ?? `Ev${this.#counter}`,
          event: {
            type: "message",
            channel: event.channel,
            channel_type: event.channelType ?? "im",
            user: event.user ?? "U0PERSON001",
            text: event.text ?? "",
            ...(event.subtype ? { subtype: event.subtype } : {}),
            ...(event.botId ? { bot_id: event.botId } : {}),
          },
        },
      }),
    );
    return envelope;
  }

  /** Slack asks the program to connect again (it does so now and then). */
  askToReconnect(): void {
    this.#live?.send(JSON.stringify({ type: "disconnect", reason: "refresh_requested" }));
  }

  /** The socket drops without a word. */
  drop(): void {
    this.#live?.terminate();
  }

  async #handle(request: IncomingMessage): Promise<{ status: number; body: object; headers?: Record<string, string> }> {
    const method = (request.url ?? "").replace(/^\/api\//, "");
    this.calls.push(method);
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    let body: unknown = null;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      body = null;
    }
    const bearer = (request.headers.authorization ?? "").replace(/^Bearer /, "");
    if (method === "auth.test") {
      if (bearer !== this.botToken) return { status: 200, body: { ok: false, error: "invalid_auth" } };
      return { status: 200, body: { ok: true, user: "cosgral_bot", user_id: this.botUserId } };
    }
    if (method === "apps.connections.open") {
      if (this.openStatus !== null) {
        const status = this.openStatus;
        this.openStatus = null;
        return { status, body: { ok: false, error: "internal_error" } };
      }
      if (bearer !== this.appToken) return { status: 200, body: { ok: false, error: "invalid_auth" } };
      return { status: 200, body: { ok: true, url: this.socketUrl } };
    }
    if (method === "chat.postMessage") {
      if (bearer !== this.botToken) return { status: 200, body: { ok: false, error: "invalid_auth" } };
      if (this.postError) {
        const failure = this.postError;
        this.postError = null;
        if ("status" in failure) {
          return {
            status: 429,
            body: { ok: false, error: "ratelimited" },
            headers: { "Retry-After": String(failure.retryAfter) },
          };
        }
        return { status: 200, body: { ok: false, error: failure.error } };
      }
      if (isDynamicRecord(body) && isString(body.channel) && isString(body.text)) {
        this.posts.push({
          channel: body.channel,
          text: body.text,
          mrkdwn: isBoolean(body.mrkdwn) ? body.mrkdwn : null,
        });
      }
      return { status: 200, body: { ok: true, ts: "1.0" } };
    }
    return { status: 404, body: { ok: false, error: "unknown_method" } };
  }
}
