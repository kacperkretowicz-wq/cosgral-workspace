// COSGRAL W12-KK (test support): a mock Discord on 127.0.0.1: the REST calls the driver makes (users/@me, gateway/bot, channel
// messages) and a Gateway WebSocket that says "hello", checks the identify (token, the one intent), answers heartbeats, pushes
// MESSAGE_CREATE events, replays what a resume missed and can ask the program to reconnect or forget the session. No real
// application, no call outside this computer.

import { createServer, type IncomingMessage, type Server } from "node:http";
import { type DynamicRecord, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { type WebSocket, WebSocketServer } from "ws";
import { portOf } from "./oauth-mock";

export interface MockDiscordPost {
  channel: string;
  content: string;
  mentionsParse: unknown;
  flags: number | null;
  userAgent: string;
}

export interface MockDiscordPerson {
  id?: string;
  username?: string;
  globalName?: string;
  bot?: boolean;
}

export class MockDiscord {
  readonly botToken: string;
  readonly posts: MockDiscordPost[] = [];
  /** REST calls seen, as "METHOD path". */
  readonly calls: string[] = [];
  /** Sockets opened so far (a reconnect makes a new one). */
  socketsOpened = 0;
  /** How the program introduced itself on each socket: identifies and resumes, and the intents of the identifies. */
  identifies = 0;
  resumes = 0;
  readonly intents: number[] = [];
  heartbeats = 0;
  /** When false the mock does not answer heartbeats (a dead connection). */
  answerHeartbeats = true;
  /** The next message post answers with this (once). */
  postError: { status: number; body?: object; headers?: Record<string, string> } | null = null;
  /** When set, the gateway closes an identify with this code (4004: the token is refused) although the REST calls accept it. */
  identifyCloseCode: number | null = null;
  /** The next `gateway/bot` call answers with this HTTP status. */
  gatewayStatus: number | null = null;
  readonly botUserId = "900000000000000001";
  readonly sessionId = "session-1";
  base = "";
  readonly #http: Server;
  readonly #sockets: WebSocketServer;
  readonly #listening: Promise<void>;
  #live: WebSocket | null = null;
  #sequence = 0;
  #counter = 0;
  /** Events already sent, by sequence number, so a resume gets what it missed. */
  readonly #sent: Array<{ s: number; payload: string }> = [];
  #sessionKnown = false;
  #ready = false;

  constructor(botToken: string) {
    this.botToken = botToken;
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
      this.#ready = false;
      socket.on("message", (data) => this.#fromProgram(socket, data.toString("utf8")));
      socket.send(JSON.stringify({ op: 10, d: { heartbeat_interval: 30 } }));
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.#http.listen(0, "127.0.0.1", resolve));
    this.base = `http://127.0.0.1:${portOf(this.#http)}/api/v10`;
    await this.#listening;
  }

  async stop(): Promise<void> {
    for (const client of this.#sockets.clients) client.terminate();
    await new Promise<void>((resolve) => this.#sockets.close(() => resolve()));
    await new Promise<void>((resolve) => this.#http.close(() => resolve()));
  }

  get socketUrl(): string {
    const address = this.#sockets.address();
    return `ws://127.0.0.1:${isDynamicRecord(address) && isNumber(address.port) ? address.port : 0}`;
  }

  /** Waits until a session is ready on a socket (an identify or a resume was accepted). */
  async ready(): Promise<void> {
    for (let index = 0; index < 300 && !(this.#live?.readyState === 1 && this.#ready); index += 1)
      await new Promise((r) => setTimeout(r, 10));
  }

  /** Pushes a MESSAGE_CREATE (a direct message by default; `guildId` makes it a message from a server). */
  push(message: {
    channel: string;
    text?: string;
    person?: MockDiscordPerson;
    guildId?: string;
    type?: number;
    webhookId?: string;
    messageId?: string;
  }): string {
    this.#counter += 1;
    const id = message.messageId ?? `8000000000000000${String(this.#counter).padStart(2, "0")}`;
    const person = message.person ?? {};
    this.#dispatch("MESSAGE_CREATE", {
      id,
      channel_id: message.channel,
      type: message.type ?? 0,
      content: message.text ?? "",
      author: {
        id: person.id ?? "700000000000000001",
        username: person.username ?? "anna",
        ...(person.globalName ? { global_name: person.globalName } : {}),
        ...(person.bot ? { bot: true } : {}),
      },
      ...(message.guildId ? { guild_id: message.guildId } : {}),
      ...(message.webhookId ? { webhook_id: message.webhookId } : {}),
    });
    return id;
  }

  /** Discord asks the program to connect again (op 7); the session can be resumed. */
  askToReconnect(): void {
    this.#live?.send(JSON.stringify({ op: 7, d: null }));
  }

  /** Discord says the session is no longer valid (op 9); `resumable` false means start fresh. */
  invalidateSession(resumable: boolean): void {
    if (!resumable) this.#sessionKnown = false;
    this.#live?.send(JSON.stringify({ op: 9, d: resumable }));
  }

  /** The socket drops without a word. */
  drop(): void {
    this.#live?.terminate();
  }

  /** Events that Discord sends while no socket is open are kept and replayed to a resume. */
  pushWhileAway(message: { channel: string; text: string }): void {
    this.#live = null;
    this.push(message);
  }

  #dispatch(type: string, data: DynamicRecord): void {
    this.#sequence += 1;
    const payload = JSON.stringify({ op: 0, s: this.#sequence, t: type, d: data });
    this.#sent.push({ s: this.#sequence, payload });
    if (this.#live?.readyState === 1 && this.#ready) this.#live.send(payload);
  }

  #fromProgram(socket: WebSocket, raw: string): void {
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isDynamicRecord(message) || !isNumber(message.op)) return;
    const data = isDynamicRecord(message.d) ? message.d : null;
    if (message.op === 1) {
      this.heartbeats += 1;
      if (this.answerHeartbeats) socket.send(JSON.stringify({ op: 11 }));
      return;
    }
    if (message.op === 2 && data) {
      this.identifies += 1;
      if (isNumber(data.intents)) this.intents.push(data.intents);
      if (data.token !== this.botToken || this.identifyCloseCode !== null) {
        socket.close(this.identifyCloseCode ?? 4004, "Authentication failed.");
        return;
      }
      this.#sessionKnown = true;
      this.#ready = true;
      this.#sequence += 1;
      const ready = JSON.stringify({
        op: 0,
        s: this.#sequence,
        t: "READY",
        d: {
          session_id: this.sessionId,
          resume_gateway_url: this.socketUrl,
          user: { id: this.botUserId, username: "cosgral_bot" },
        },
      });
      socket.send(ready);
      return;
    }
    if (message.op === 6 && data) {
      this.resumes += 1;
      if (data.token !== this.botToken) {
        socket.close(4004, "Authentication failed.");
        return;
      }
      if (!this.#sessionKnown || data.session_id !== this.sessionId || !isNumber(data.seq)) {
        socket.send(JSON.stringify({ op: 9, d: false }));
        return;
      }
      this.#ready = true;
      for (const event of this.#sent) if (event.s > data.seq) socket.send(event.payload);
      socket.send(JSON.stringify({ op: 0, s: this.#sequence, t: "RESUMED", d: {} }));
    }
  }

  async #handle(request: IncomingMessage): Promise<{ status: number; body: object; headers?: Record<string, string> }> {
    const path = (request.url ?? "").replace(/^\/api\/v10/, "");
    this.calls.push(`${request.method} ${path}`);
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    let body: unknown = null;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      body = null;
    }
    if (request.headers.authorization !== `Bot ${this.botToken}`) {
      return { status: 401, body: { message: "401: Unauthorized", code: 0 } };
    }
    if (path === "/users/@me" && request.method === "GET") {
      return { status: 200, body: { id: this.botUserId, username: "cosgral_bot", bot: true } };
    }
    if (path === "/gateway/bot" && request.method === "GET") {
      if (this.gatewayStatus !== null) {
        const status = this.gatewayStatus;
        this.gatewayStatus = null;
        return { status, body: { message: "unavailable" } };
      }
      return { status: 200, body: { url: this.socketUrl, shards: 1, session_start_limit: { remaining: 1000 } } };
    }
    const channel = /^\/channels\/(\d+)\/messages$/.exec(path)?.[1];
    if (channel && request.method === "POST") {
      if (this.postError) {
        const failure = this.postError;
        this.postError = null;
        return { status: failure.status, body: failure.body ?? { message: "refused" }, headers: failure.headers };
      }
      if (isDynamicRecord(body) && isString(body.content)) {
        this.posts.push({
          channel,
          content: body.content,
          mentionsParse: isDynamicRecord(body.allowed_mentions) ? body.allowed_mentions.parse : null,
          flags: isNumber(body.flags) ? body.flags : null,
          userAgent: String(request.headers["user-agent"] ?? ""),
        });
      }
      return { status: 200, body: { id: "800000000000000999" } };
    }
    return { status: 404, body: { message: "Unknown" } };
  }
}
