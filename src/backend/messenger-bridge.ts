// COSGRAL W10-KK2: the Telegram bridge (contract: ipc-messengers.ts; the Bot API client: telegram-client.ts).
//
// WHAT IT KEEPS, in the database of the space the program runs on (a client space is its own database, so one client's bot is never
// reachable from another client's space):
//   projection_messengers        one row per messenger: the bot token ENCRYPTED with the program's safe (the same SecretBox the
//                                Vault uses), the id of the last message taken (so a restart does not read the same message twice).
//   projection_messenger_chats   the allow list: a private chat, the agent that answers it, a label. EMPTY by default.
// WHAT IT DOES. The program asks Telegram for new messages (long polling: nothing listens, no web address). A plain text from an
// allowed private chat is passed to the agent of that chat as a normal message (with a `[Telegram]` mark so the conversation shows
// where it came from); when the agent has answered, the answer is sent back to that same chat. Anything else is ignored WITHOUT a
// word to the sender: a chat that is not allowed (the settings only learn its number and name, so the owner can allow it), a group,
// a photo. Limits: a text longer than the limit is refused, a chat may send a few messages per minute, a few answers may wait at
// a time, an answer is cut at the part limit.
// WHAT IT NEVER DOES. It never puts the token in a status, an event, an error or an answer: every message that leaves is a fixed
// sentence (the client turns every network error into one). It never gives an agent a tool to write to Telegram: the only way
// out is the answer to a message that came in, to the chat it came from.

import {
  type AgentEvent,
  type AllowChatInput,
  emptyMessengerStatus,
  MESSENGER_KINDS,
  MESSENGER_LIMITS,
  type MessengerKind,
  type MessengerList,
  type MessengerStatus,
  normalizeChatLabel,
  type RemoveChatInput,
  type UnknownChat,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import type { OpenBotDatabase } from "./openbot-database";
import { TelegramClient, TelegramFailure, type TelegramUpdate } from "./telegram-client";
import type { SecretBox } from "./vault-store";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projection_messengers (
    kind TEXT PRIMARY KEY,
    token_enc TEXT,
    next_offset INTEGER,
    bot_username TEXT,
    connected_at TEXT
  );
  CREATE TABLE IF NOT EXISTS projection_messenger_chats (
    kind TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    label TEXT NOT NULL,
    bot_id TEXT NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (kind, chat_id)
  );
`;

// What the person sees in Telegram. Fixed sentences only.
const SAYS = {
  hello: "Hello. Write a message and the agent will answer here.",
  textOnly: "I only read plain text for now.",
  tooLong: `That message is too long (at most ${MESSENGER_LIMITS.incomingText} characters). Please write it shorter.`,
  tooMany: "That is too many messages in a minute. Please wait a little.",
  busy: "Please wait for the answers to your earlier messages first.",
  noAgent: "The agent for this chat is no longer available.",
  notTaken: "The agent could not take that message.",
  failed: "The agent could not finish this answer.",
  late: "The agent did not answer in time. Look at the answer in the app.",
  noText: "The agent answered without text. Look at it in the app.",
  cut: "(The rest of the answer was cut. Look at it in the app.)",
} as const;

/** The agent side, seen from the bridge. `createAgentPort` makes it from the program's agent service. */
export type AgentReply = { state: "pending" } | { state: "done"; text: string } | { state: "failed" };

export interface MessengerAgentPort {
  hasAgent(botId: string): boolean;
  /** Passes a text to the agent as a message from the person; answers with the id of that message. */
  send(botId: string, text: string): Promise<string>;
  /** What the agent has answered to that message so far. */
  reply(botId: string, messageId: string): Promise<AgentReply>;
}

/** The part of the agent service the port needs (the real `AgentService` has all of it). */
export interface AgentConversationPort {
  listBots(): Array<{ id: string }>;
  sendMessage(input: { botId: string; text: string }): Promise<{ messageId: string }>;
  readConversation(botId: string): Promise<{
    activeTurnId: string | null;
    messages: Array<{
      id: string;
      turnId?: string;
      author: string;
      text: string;
      status: "streaming" | "completed" | "failed" | "interrupted";
      itemType?: string;
    }>;
  }>;
}

export function createAgentPort(service: AgentConversationPort): MessengerAgentPort {
  return {
    hasAgent: (botId) => service.listBots().some((bot) => bot.id === botId),
    send: async (botId, text) => (await service.sendMessage({ botId, text })).messageId,
    reply: async (botId, messageId) => {
      const snapshot = await service.readConversation(botId);
      const own = snapshot.messages.find((message) => message.id === messageId);
      // Not in the conversation yet, or not started yet (it waits behind another turn): no turn belongs to it.
      if (!own || own.turnId === undefined) return { state: "pending" };
      const turn = snapshot.messages.filter((message) => message.turnId === own.turnId && message.author !== "user");
      if (snapshot.activeTurnId === own.turnId || turn.some((message) => message.status === "streaming")) {
        return { state: "pending" };
      }
      const answers = turn.filter(
        (message) =>
          message.author === "assistant" &&
          message.status === "completed" &&
          message.itemType !== "commentary" &&
          message.text.trim().length > 0,
      );
      if (answers.length > 0)
        return { state: "done", text: answers.map((message) => message.text.trim()).join("\n\n") };
      if (turn.some((message) => message.status === "failed" || message.status === "interrupted"))
        return { state: "failed" };
      // The turn is over and said nothing in text (for instance only a tool ran).
      return turn.length > 0 ? { state: "done", text: "" } : { state: "pending" };
    },
  };
}

export interface MessengerBridgeOptions {
  database: OpenBotDatabase;
  box: SecretBox;
  agent: MessengerAgentPort;
  /** The space the program runs on. */
  spaceId: string;
  emit: (event: AgentEvent) => void;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  /** Tests: a mock Telegram on 127.0.0.1. */
  apiBase?: string;
  /** Long polling wait in seconds (Telegram holds the request that long). */
  pollSeconds?: number;
  /** The pause after a failed request; doubles up to `maxRetryMs`. */
  retryMs?: number;
  maxRetryMs?: number;
  /** How often the agent's answers are looked for while a message waits. */
  replyPollMs?: number;
  /** After this long a waiting message gets the "did not answer in time" sentence. */
  replyTimeoutMs?: number;
}

interface Pending {
  kind: MessengerKind;
  chatId: string;
  botId: string;
  messageId: string;
  startedAtMs: number;
  /** An answer that is ready but could not be sent yet. */
  ready: string | null;
  attempts: number;
}

interface Session {
  kind: MessengerKind;
  controller: AbortController;
  client: TelegramClient;
  done: Promise<void>;
}

interface Runtime {
  phase: MessengerStatus["phase"];
  reason: string | null;
  botUsername: string | null;
  connectedAt: string | null;
  counts: MessengerStatus["counts"];
  unknown: UnknownChat[];
}

const MAX_PENDING_PER_CHAT = 5;
const MAX_SEND_ATTEMPTS = 5;

export class MessengerBridge {
  readonly #options: MessengerBridgeOptions;
  readonly #now: () => Date;
  readonly #runtime = new Map<MessengerKind, Runtime>();
  readonly #sessions = new Map<MessengerKind, Session>();
  #pending: Pending[] = [];
  readonly #recent = new Map<string, { times: number[]; warnedAtMs: number }>();
  #replyTimer: ReturnType<typeof setTimeout> | null = null;
  #replying = false;
  #ready = false;
  #stopped = false;

  constructor(options: MessengerBridgeOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => new Date());
    for (const kind of MESSENGER_KINDS) {
      this.#runtime.set(kind, {
        phase: "disconnected",
        reason: null,
        botUsername: null,
        connectedAt: null,
        counts: { forwarded: 0, replied: 0, ignored: 0 },
        unknown: [],
      });
    }
  }

  list(): MessengerList {
    return { spaceId: this.#options.spaceId, messengers: MESSENGER_KINDS.map((kind) => this.status(kind)) };
  }

  status(kind: MessengerKind): MessengerStatus {
    const runtime = this.#state(kind);
    const base = emptyMessengerStatus(kind);
    const saved = this.#row(kind);
    return {
      ...base,
      phase: saved.tokenEnc === null ? "disconnected" : runtime.phase === "disconnected" ? "connecting" : runtime.phase,
      reason: saved.tokenEnc === null ? null : runtime.reason,
      botUsername: saved.tokenEnc === null ? null : runtime.botUsername,
      connectedAt: saved.tokenEnc === null ? null : runtime.connectedAt,
      tokenSaved: saved.tokenEnc !== null,
      allowedChats: this.#chats(kind),
      unknownChats: runtime.unknown.map((chat) => ({ ...chat })),
      counts: { ...runtime.counts },
    };
  }

  /** Checks the token with Telegram; only a token Telegram accepts is saved. Replaces a token saved before. */
  async connect(kind: MessengerKind, token: string): Promise<MessengerStatus> {
    const client = this.#client(token);
    let username: string;
    try {
      username = await client.getMe();
      await client.deleteWebhook().catch(() => undefined);
    } catch (error) {
      // Only the fixed sentence of the failure; nothing of what was typed or of the network error.
      throw new Error(error instanceof TelegramFailure ? error.message : new TelegramFailure("network").message);
    }
    await this.#end(kind);
    const runtime = this.#state(kind);
    runtime.phase = "connected";
    runtime.reason = null;
    runtime.botUsername = username;
    runtime.connectedAt = this.#now().toISOString();
    this.#db()
      .prepare(
        `INSERT INTO projection_messengers (kind, token_enc, next_offset, bot_username, connected_at) VALUES (?, ?, NULL, ?, ?)
         ON CONFLICT(kind) DO UPDATE SET token_enc = excluded.token_enc, next_offset = NULL,
           bot_username = excluded.bot_username, connected_at = excluded.connected_at`,
      )
      .run(kind, this.#options.box.encrypt(token), username, runtime.connectedAt);
    this.#begin(kind, client);
    this.#publish();
    return this.status(kind);
  }

  /** Stops listening and removes the saved token. The allow list stays; waiting messages are dropped. */
  async disconnect(kind: MessengerKind): Promise<MessengerList> {
    await this.#end(kind);
    this.#db()
      .prepare("UPDATE projection_messengers SET token_enc = NULL, next_offset = NULL WHERE kind = ?")
      .run(kind);
    const runtime = this.#state(kind);
    runtime.phase = "disconnected";
    runtime.reason = null;
    runtime.botUsername = null;
    runtime.connectedAt = null;
    return this.#publish();
  }

  allowChat(input: AllowChatInput): MessengerList {
    const chats = this.#chats(input.kind);
    const existing = chats.find((chat) => chat.chatId === input.chatId);
    if (!existing && chats.length >= MESSENGER_LIMITS.allowedChats) {
      throw new Error(`At most ${MESSENGER_LIMITS.allowedChats} chats can be allowed.`);
    }
    if (!this.#options.agent.hasAgent(input.botId)) throw new Error("That agent does not exist.");
    const runtime = this.#state(input.kind);
    const unknown = runtime.unknown.find((chat) => chat.chatId === input.chatId);
    const label = input.label ?? existing?.label ?? unknown?.label ?? input.chatId;
    this.#db()
      .prepare(
        `INSERT INTO projection_messenger_chats (kind, chat_id, label, bot_id, added_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(kind, chat_id) DO UPDATE SET label = excluded.label, bot_id = excluded.bot_id`,
      )
      .run(input.kind, input.chatId, label, input.botId, existing?.addedAt ?? this.#now().toISOString());
    runtime.unknown = runtime.unknown.filter((chat) => chat.chatId !== input.chatId);
    return this.#publish();
  }

  removeChat(input: RemoveChatInput): MessengerList {
    this.#db()
      .prepare("DELETE FROM projection_messenger_chats WHERE kind = ? AND chat_id = ?")
      .run(input.kind, input.chatId);
    this.#pending = this.#pending.filter((item) => !(item.kind === input.kind && item.chatId === input.chatId));
    return this.#publish();
  }

  /** At start: a saved token starts listening again. A token that cannot be read (another computer's safe) is removed. */
  resume(): void {
    for (const kind of MESSENGER_KINDS) {
      const row = this.#row(kind);
      if (row.tokenEnc === null || this.#sessions.has(kind)) continue;
      let token: string;
      try {
        token = this.#options.box.decrypt(row.tokenEnc);
      } catch {
        this.#db()
          .prepare("UPDATE projection_messengers SET token_enc = NULL, next_offset = NULL WHERE kind = ?")
          .run(kind);
        continue;
      }
      const runtime = this.#state(kind);
      runtime.phase = "connecting";
      runtime.botUsername = row.botUsername;
      runtime.connectedAt = row.connectedAt;
      this.#begin(kind, this.#client(token));
    }
    this.#publish();
  }

  /** Stops every listening loop (the program closes). Nothing is deleted. */
  async stop(): Promise<void> {
    this.#stopped = true;
    if (this.#replyTimer) clearTimeout(this.#replyTimer);
    this.#replyTimer = null;
    await Promise.all(MESSENGER_KINDS.map((kind) => this.#end(kind)));
  }

  /** Tests: resolves when no answer is waiting any more. */
  async whenAnswered(): Promise<void> {
    while (this.#pending.length > 0 || this.#replying) await new Promise((resolve) => setTimeout(resolve, 5));
  }

  // --- listening ---

  #begin(kind: MessengerKind, client: TelegramClient): void {
    const controller = new AbortController();
    const session: Session = { kind, controller, client, done: Promise.resolve() };
    session.done = this.#loop(kind, session).catch(() => undefined);
    this.#sessions.set(kind, session);
  }

  async #end(kind: MessengerKind): Promise<void> {
    const session = this.#sessions.get(kind);
    if (!session) return;
    this.#sessions.delete(kind);
    session.controller.abort();
    await session.done;
    this.#pending = this.#pending.filter((item) => item.kind !== kind);
  }

  async #loop(kind: MessengerKind, session: Session): Promise<void> {
    const { signal } = session.controller;
    const runtime = this.#state(kind);
    let wait = this.#options.retryMs ?? 2000;
    while (!signal.aborted) {
      try {
        const offset = this.#row(kind).nextOffset;
        const updates = await session.client.getUpdates(offset, this.#options.pollSeconds ?? 25, signal);
        if (signal.aborted) return;
        if (runtime.phase !== "connected") {
          runtime.phase = "connected";
          runtime.reason = null;
          runtime.botUsername ??= await session.client.getMe(signal).catch(() => "@bot");
          runtime.connectedAt ??= this.#now().toISOString();
          this.#publish();
        }
        wait = this.#options.retryMs ?? 2000;
        for (const update of updates) {
          if (signal.aborted) return;
          await this.#handle(kind, session, update);
          this.#db()
            .prepare("UPDATE projection_messengers SET next_offset = ? WHERE kind = ?")
            .run(update.updateId + 1, kind);
        }
      } catch (error) {
        if (signal.aborted) return;
        const failure = error instanceof TelegramFailure ? error : new TelegramFailure("network");
        runtime.phase = "failed";
        runtime.reason = failure.message;
        this.#publish();
        // A refused token does not get better by itself: the loop ends and the token stays for the person to replace.
        if (failure.kind === "token-refused") return;
        const pause = failure.retryAfterMs ?? wait;
        wait = Math.min(wait * 2, this.#options.maxRetryMs ?? 60_000);
        await sleep(pause, signal);
      }
    }
  }

  async #handle(kind: MessengerKind, session: Session, update: TelegramUpdate): Promise<void> {
    const runtime = this.#state(kind);
    const chat = update.chat;
    // Groups, channels and anything that is not a message: ignored, nobody is told.
    if (chat === null || chat.type !== "private") {
      runtime.counts.ignored += 1;
      return;
    }
    const chatId = String(chat.id);
    const allowed = this.#chats(kind).find((entry) => entry.chatId === chatId);
    if (!allowed) {
      runtime.counts.ignored += 1;
      this.#rememberUnknown(kind, chatId, chat.title);
      return;
    }
    const say = (text: string) => this.#say(session, chatId, text);
    if (update.text === null) {
      runtime.counts.ignored += 1;
      await say(SAYS.textOnly);
      return;
    }
    const text = update.text.trim();
    if (text === "/start") {
      await say(SAYS.hello);
      return;
    }
    if (text.length === 0) {
      runtime.counts.ignored += 1;
      return;
    }
    if (text.length > MESSENGER_LIMITS.incomingText) {
      runtime.counts.ignored += 1;
      await say(SAYS.tooLong);
      return;
    }
    if (this.#overLimit(kind, chatId)) {
      runtime.counts.ignored += 1;
      return this.#warnOnce(kind, chatId, say);
    }
    if (this.#pending.filter((item) => item.kind === kind && item.chatId === chatId).length >= MAX_PENDING_PER_CHAT) {
      runtime.counts.ignored += 1;
      await say(SAYS.busy);
      return;
    }
    if (!this.#options.agent.hasAgent(allowed.botId)) {
      runtime.counts.ignored += 1;
      await say(SAYS.noAgent);
      return;
    }
    try {
      const messageId = await this.#options.agent.send(allowed.botId, `[Telegram] ${text}`);
      runtime.counts.forwarded += 1;
      this.#pending.push({
        kind,
        chatId,
        botId: allowed.botId,
        messageId,
        startedAtMs: this.#now().getTime(),
        ready: null,
        attempts: 0,
      });
      this.#watchReplies();
    } catch {
      await say(SAYS.notTaken);
    }
  }

  /** A chat is on the list for its number only; its name is kept as a label for the settings, never what it wrote. */
  #rememberUnknown(kind: MessengerKind, chatId: string, title: string): void {
    const runtime = this.#state(kind);
    const seen = runtime.unknown.find((chat) => chat.chatId === chatId);
    const label = normalizeChatLabel(title) || chatId;
    runtime.unknown = [
      ...runtime.unknown.filter((chat) => chat.chatId !== chatId),
      { chatId, label, lastSeenAt: this.#now().toISOString(), count: (seen?.count ?? 0) + 1 },
    ].slice(-MESSENGER_LIMITS.unknownChats);
    // The settings hear about a new chat at once; repeats only change a counter and wait for the next change.
    if (!seen) this.#publish();
  }

  #overLimit(kind: MessengerKind, chatId: string): boolean {
    const key = `${kind}:${chatId}`;
    const nowMs = this.#now().getTime();
    const entry = this.#recent.get(key) ?? { times: [], warnedAtMs: 0 };
    entry.times = entry.times.filter((time) => nowMs - time < 60_000);
    this.#recent.set(key, entry);
    if (entry.times.length >= MESSENGER_LIMITS.incomingPerMinute) return true;
    entry.times.push(nowMs);
    return false;
  }

  async #warnOnce(kind: MessengerKind, chatId: string, say: (text: string) => Promise<void>): Promise<void> {
    const entry = this.#recent.get(`${kind}:${chatId}`);
    const nowMs = this.#now().getTime();
    if (!entry || nowMs - entry.warnedAtMs < 60_000) return;
    entry.warnedAtMs = nowMs;
    await say(SAYS.tooMany);
  }

  // --- answers back ---

  #watchReplies(): void {
    if (this.#replyTimer || this.#stopped) return;
    this.#replyTimer = setTimeout(() => {
      this.#replyTimer = null;
      void this.#sweep();
    }, this.#options.replyPollMs ?? 1500);
    this.#replyTimer.unref?.();
  }

  async #sweep(): Promise<void> {
    if (this.#replying) return;
    this.#replying = true;
    try {
      for (const item of [...this.#pending]) {
        if (!this.#pending.includes(item)) continue;
        const session = this.#sessions.get(item.kind);
        if (!session) {
          this.#pending = this.#pending.filter((candidate) => candidate !== item);
          continue;
        }
        await this.#deliver(item, session);
      }
    } finally {
      this.#replying = false;
      if (this.#pending.length > 0) this.#watchReplies();
    }
  }

  async #deliver(item: Pending, session: Session): Promise<void> {
    const drop = () => {
      this.#pending = this.#pending.filter((candidate) => candidate !== item);
    };
    if (item.ready === null) {
      let reply: AgentReply = { state: "pending" };
      try {
        reply = await this.#options.agent.reply(item.botId, item.messageId);
      } catch {
        reply = { state: "pending" };
      }
      if (reply.state === "pending") {
        if (this.#now().getTime() - item.startedAtMs > (this.#options.replyTimeoutMs ?? 15 * 60_000)) {
          drop();
          await this.#say(session, item.chatId, SAYS.late);
        }
        return;
      }
      item.ready = reply.state === "failed" ? SAYS.failed : reply.text.trim() || SAYS.noText;
    }
    try {
      for (const part of splitAnswer(item.ready))
        await session.client.sendMessage(item.chatId, part, session.controller.signal);
      this.#state(item.kind).counts.replied += 1;
      drop();
    } catch (error) {
      if (session.controller.signal.aborted) return;
      item.attempts += 1;
      // A closed or blocked chat will not get better; a network failure is tried again a few times.
      if (item.attempts >= MAX_SEND_ATTEMPTS || (error instanceof TelegramFailure && error.kind === "rejected")) drop();
    }
  }

  async #say(session: Session, chatId: string, text: string): Promise<void> {
    try {
      await session.client.sendMessage(chatId, text, session.controller.signal);
    } catch {
      // A sentence to the sender that does not arrive is not worth anything more.
    }
  }

  // --- internals ---

  #client(token: string): TelegramClient {
    return new TelegramClient({ token, fetchImpl: this.#options.fetchImpl, apiBase: this.#options.apiBase });
  }

  #state(kind: MessengerKind): Runtime {
    const runtime = this.#runtime.get(kind);
    if (!runtime) throw new Error("Unknown messenger.");
    return runtime;
  }

  #db() {
    const connection = this.#options.database.connection;
    if (!this.#ready) {
      connection.exec(SCHEMA);
      this.#ready = true;
    }
    return connection;
  }

  #row(kind: MessengerKind): {
    tokenEnc: string | null;
    nextOffset: number | null;
    botUsername: string | null;
    connectedAt: string | null;
  } {
    const raw = this.#db().prepare("SELECT * FROM projection_messengers WHERE kind = ?").get(kind);
    if (!isDynamicRecord(raw)) return { tokenEnc: null, nextOffset: null, botUsername: null, connectedAt: null };
    return {
      tokenEnc: isString(raw.token_enc) ? raw.token_enc : null,
      nextOffset: isNumber(raw.next_offset) ? raw.next_offset : null,
      botUsername: isString(raw.bot_username) ? raw.bot_username : null,
      connectedAt: isString(raw.connected_at) ? raw.connected_at : null,
    };
  }

  #chats(kind: MessengerKind): MessengerStatus["allowedChats"] {
    const rows = this.#db()
      .prepare("SELECT * FROM projection_messenger_chats WHERE kind = ? ORDER BY added_at, chat_id")
      .all(kind);
    const chats: MessengerStatus["allowedChats"] = [];
    for (const raw of rows) {
      if (
        isDynamicRecord(raw) &&
        isString(raw.chat_id) &&
        isString(raw.label) &&
        isString(raw.bot_id) &&
        isString(raw.added_at)
      ) {
        chats.push({ chatId: raw.chat_id, label: raw.label, botId: raw.bot_id, addedAt: raw.added_at });
      }
    }
    return chats;
  }

  #publish(): MessengerList {
    const list = this.list();
    this.#options.emit({ type: "messengers-changed", ...list });
    return list;
  }
}

/** One answer into parts Telegram accepts: cut at a line end where there is one; the rest of a very long answer is dropped. */
export function splitAnswer(text: string): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > 0 && parts.length < MESSENGER_LIMITS.outgoingParts) {
    if (rest.length <= MESSENGER_LIMITS.outgoingPart) {
      parts.push(rest);
      rest = "";
      break;
    }
    const window = rest.slice(0, MESSENGER_LIMITS.outgoingPart);
    const lineEnd = window.lastIndexOf("\n");
    const cut = lineEnd > MESSENGER_LIMITS.outgoingPart / 2 ? lineEnd : MESSENGER_LIMITS.outgoingPart;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) parts.push(SAYS.cut);
  return parts;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}
