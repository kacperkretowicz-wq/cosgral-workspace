// COSGRAL W12-KK (2, step 0): what the messenger bridge needs from ONE messenger service, so that the bridge (the allow list, the
// limits, the hand-over to the agent, the answers back) is written once and Telegram, Slack and Discord are small drivers.
//
// A driver knows the service's protocol and nothing about agents. It turns every failure into a `MessengerFailure` with a FIXED
// sentence (the text of a network error or of the service can contain a token or an address with one, so it is never used), and it
// never logs. The bridge only ever passes it: a token (write-only), a chat id taken from an incoming message, and text.

export type MessengerFailureKind =
  /** The service does not know this token (revoked, wrong). Trying again does not help. */
  | "token-refused"
  /** Another program already reads this bot's messages. */
  | "conflict"
  /** Too many requests; `retryAfterMs` says how long to wait. */
  | "rate-limited"
  /** The network or the service is not reachable right now. */
  | "network"
  /** The service refused this one request (the chat is closed, the bot was blocked). */
  | "rejected";

export class MessengerFailure extends Error {
  readonly kind: MessengerFailureKind;
  readonly retryAfterMs: number | null;

  constructor(kind: MessengerFailureKind, sentence: string, retryAfterMs: number | null = null) {
    super(sentence);
    this.name = "MessengerFailure";
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}

/** One text that came in. `chat` is null for anything that is not a message the bridge may read (it is only counted). */
export interface InboundMessage {
  /** A position to continue from after this message (Telegram's update id + 1 is stored); null when the service has none. */
  next: number | null;
  chat: {
    /** The service's own id of the chat, as text. */
    id: string;
    /** Only a `private` chat (one person and the bot) is ever answered. */
    kind: "private" | "other";
    /** A person's name or the chat's public name; only a label, never trusted. */
    title: string;
  } | null;
  /** The text, or null when the message has none (a photo, a file). */
  text: string | null;
}

export interface MessengerDriver {
  /** Checks the token with the service and prepares listening. Answers the bot's public name (`@name`). Throws `MessengerFailure`. */
  connect(signal?: AbortSignal): Promise<string>;
  /** The bot's public name again (a cheap check), for a saved connection that starts without `connect`. */
  identify(signal?: AbortSignal): Promise<string>;
  /** Waits up to `waitSeconds` for new messages after position `from` and answers them (an empty list when none came). */
  receive(from: number | null, waitSeconds: number, signal: AbortSignal): Promise<InboundMessage[]>;
  /** Sends plain text (no markup) to a chat. */
  send(chatId: string, text: string, signal?: AbortSignal): Promise<void>;
  /** Releases what the driver holds open (a socket). Idempotent. */
  close(): void;
}

/** Makes a driver from a saved or typed secret (a messenger with two secrets packs them into one text of its own). */
export type MessengerDriverFactory = (secret: string) => MessengerDriver;
