// COSGRAL W3: the remote desktop CLIENT (the viewer). It connects to a host, proves it knows the token without
// sending it, checks that the host knows it too, waits for the host owner's answer, then receives pictures and sends
// mouse and keyboard input when control was granted. No Electron here.

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  type ConnectRemoteDesktopInput,
  emptyRemoteDesktopClientState,
  REMOTE_DESKTOP_LIMITS,
  type RemoteDesktopClientState,
  type RemoteDesktopFrame,
  type RemoteDesktopInput,
} from "@openbot/contracts/ipc";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";
import { WebSocket } from "ws";
import {
  type AuthMessage,
  cleanLabel,
  clientProof,
  type DeniedReason,
  decodeFrame,
  type EndedReason,
  hostProof,
  isClientId,
  normalizeHostAddress,
  parseHostMessage,
  sameProof,
} from "./remote-desktop-protocol";

/** The id and the name this computer shows to hosts; the id stays the same between runs so a host can remember it. */
export interface ClientIdentity {
  clientId: string;
  label: string;
}

export function loadClientIdentity(filePath: string, defaultLabel: string): ClientIdentity {
  if (existsSync(filePath)) {
    try {
      const saved = readIdentity(JSON.parse(readFileSync(filePath, "utf8")), defaultLabel);
      if (saved) return saved;
    } catch {
      // A broken file gets a new identity below.
    }
  }
  const identity = {
    clientId: randomBytes(16).toString("base64url"),
    label: cleanLabel(defaultLabel, "This computer"),
  };
  mkdirSync(dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(identity, null, 2)}\n`, "utf8");
  renameSync(temporary, filePath);
  return identity;
}

function readIdentity(value: unknown, defaultLabel: string): ClientIdentity | null {
  if (!isDynamicRecord(value) || !isClientId(value.clientId)) return null;
  return { clientId: value.clientId, label: cleanLabel(value.label, defaultLabel) };
}

export interface RemoteDesktopClientTimings {
  /** The whole attempt, including the wait for the host owner. */
  connectTimeoutMs: number;
  /** Silence from the host (no picture, no ping) after which the connection counts as lost. */
  silenceTimeoutMs: number;
  checkIntervalMs: number;
}

export interface RemoteDesktopClientOptions {
  identity: ClientIdentity;
  emit: (state: RemoteDesktopClientState) => void;
  onFrame: (frame: RemoteDesktopFrame) => void;
  timings?: Partial<RemoteDesktopClientTimings>;
}

const DENIED_TEXT: Record<DeniedReason, string> = {
  "bad-token": "The token is wrong.",
  blocked: "The owner of that computer blocked this computer.",
  busy: "Someone else is connected to that computer or is waiting for its owner. Try again later.",
  declined: "The owner of that computer said no.",
  "no-answer": "The owner of that computer did not answer in time.",
  "locked-out": "Too many wrong tokens from this computer. Wait a minute and try again.",
  "bad-version": "That computer runs another version of the protocol.",
  "bad-message": "The other side did not understand this program.",
  unavailable: "Remote desktop is not available on that computer right now.",
};

const ENDED_TEXT: Record<EndedReason, string> = {
  stopped: "The owner of that computer stopped the session.",
  "host-disabled": "The owner of that computer turned sharing off.",
  unresponsive: "The connection was lost.",
  error: "The other computer had a problem.",
};

export class RemoteDesktopClient {
  readonly #options: RemoteDesktopClientOptions;
  readonly #timings: RemoteDesktopClientTimings;
  #state: RemoteDesktopClientState;
  #socket: WebSocket | null = null;
  #timers: NodeJS.Timeout[] = [];
  #settle: ((state: RemoteDesktopClientState) => void) | null = null;
  #lastSignalAt = 0;
  #frames = 0;

  constructor(options: RemoteDesktopClientOptions) {
    this.#options = options;
    this.#timings = {
      connectTimeoutMs: REMOTE_DESKTOP_LIMITS.consentTimeoutMs + REMOTE_DESKTOP_LIMITS.authTimeoutMs,
      silenceTimeoutMs: REMOTE_DESKTOP_LIMITS.pongTimeoutMs,
      checkIntervalMs: 1000,
      ...options.timings,
    };
    this.#state = emptyRemoteDesktopClientState(options.identity.clientId);
  }

  getState(): RemoteDesktopClientState {
    return { ...this.#state, framesReceived: this.#frames };
  }

  /** Resolves when the host owner answered ("connected") or the attempt failed ("failed", see `error`). */
  connect(input: ConnectRemoteDesktopInput): Promise<RemoteDesktopClientState> {
    this.disconnect();
    let url: string;
    try {
      url = normalizeHostAddress(input.address);
    } catch (error) {
      return Promise.resolve(this.#fail(error instanceof Error ? error.message : String(error), input.address));
    }
    const token = input.token.trim();
    if (!token) return Promise.resolve(this.#fail("Enter the token the other computer shows.", url));
    this.#frames = 0;
    this.#set({ phase: "connecting", address: url, mode: null, screen: null, error: null });
    return new Promise((resolve) => {
      this.#settle = resolve;
      const socket = new WebSocket(url, {
        handshakeTimeout: REMOTE_DESKTOP_LIMITS.authTimeoutMs,
        maxPayload: REMOTE_DESKTOP_LIMITS.maxFrameBytes + 16,
        // No Origin header: a host refuses anything that looks like a web page.
      });
      this.#socket = socket;
      let nonce = "";
      const label = cleanLabel(input.label, this.#options.identity.label);
      socket.on("error", (error) => {
        if (this.#socket === socket) this.#end(socket, `Cannot reach that computer (${error.message}).`);
      });
      socket.on("close", () => {
        if (this.#socket === socket) this.#end(socket, "The connection was closed.");
      });
      socket.on("ping", () => {
        this.#lastSignalAt = Date.now();
      });
      socket.on("message", (data, isBinary) => {
        this.#lastSignalAt = Date.now();
        if (this.#socket !== socket) return;
        if (isBinary) return this.#onFrame(socket, toBuffer(data));
        const message = parseHostMessage(Array.isArray(data) ? Buffer.concat(data).toString("utf8") : data.toString());
        if (!message) return this.#end(socket, "The other computer sent something this program does not understand.");
        switch (message.type) {
          case "hello": {
            if (message.version !== REMOTE_DESKTOP_LIMITS.protocolVersion) {
              return this.#end(socket, DENIED_TEXT["bad-version"]);
            }
            nonce = message.nonce;
            const auth: AuthMessage = {
              type: "auth",
              clientId: this.#options.identity.clientId,
              label,
              mode: input.mode,
              proof: clientProof(token, nonce, this.#options.identity.clientId, input.mode),
            };
            socket.send(JSON.stringify(auth));
            return;
          }
          case "waiting":
            this.#set({ phase: "waiting-for-owner" });
            return;
          case "accepted": {
            const expected = hostProof(token, nonce, this.#options.identity.clientId, input.mode);
            if (message.mode !== input.mode || !sameProof(expected, message.hostProof)) {
              return this.#end(socket, "That computer does not know the token. It may not be the one you meant.");
            }
            this.#set({ phase: "connected", mode: message.mode, error: null });
            this.#resolve();
            return;
          }
          case "mode":
            this.#set({ mode: message.mode });
            return;
          case "paused":
            return;
          case "denied":
            return this.#end(socket, DENIED_TEXT[message.reason]);
          case "ended":
            return this.#end(socket, ENDED_TEXT[message.reason]);
        }
      });
      this.#lastSignalAt = Date.now();
      const startedAt = Date.now();
      this.#timers.push(
        setInterval(() => {
          if (this.#socket !== socket) return;
          const now = Date.now();
          if (this.#state.phase !== "connected" && now - startedAt > this.#timings.connectTimeoutMs) {
            return this.#end(socket, "That computer did not answer in time.");
          }
          if (this.#state.phase === "connected" && now - this.#lastSignalAt > this.#timings.silenceTimeoutMs) {
            this.#end(socket, ENDED_TEXT.unresponsive);
          }
        }, this.#timings.checkIntervalMs),
      );
    });
  }

  /** Leaves the host and goes back to idle. Safe at any time. */
  disconnect(): RemoteDesktopClientState {
    const socket = this.#socket;
    this.#socket = null;
    this.#clearTimers();
    if (socket) {
      try {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "bye" }));
        socket.close(1000);
      } catch {
        // Already gone.
      }
      const cut = setTimeout(() => socket.terminate(), 1000);
      cut.unref();
    }
    if (this.#state.phase !== "idle") this.#set({ phase: "idle", mode: null, screen: null, error: null });
    this.#resolve();
    return this.getState();
  }

  /** Fire and forget; refused in view mode and when not connected. */
  sendInput(input: RemoteDesktopInput): void {
    const socket = this.#socket;
    if (!socket || this.#state.phase !== "connected" || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to another computer.");
    }
    if (this.#state.mode !== "control") throw new Error("This connection is view only.");
    socket.send(JSON.stringify({ type: "input", input }));
  }

  #onFrame(socket: WebSocket, data: Buffer): void {
    if (this.#state.phase !== "connected") {
      this.#end(socket, "The other computer sent a picture too early.");
      return;
    }
    const frame = decodeFrame(data);
    if (!frame) return;
    this.#frames += 1;
    const size = this.#state.screen;
    if (!size || size.width !== frame.width || size.height !== frame.height) {
      this.#set({ screen: { width: frame.width, height: frame.height } });
    }
    this.#options.onFrame({
      seq: frame.seq,
      width: frame.width,
      height: frame.height,
      jpegBase64: frame.jpeg.toString("base64"),
    });
  }

  #end(socket: WebSocket, reason: string): void {
    if (this.#socket !== socket) return;
    this.#socket = null;
    this.#clearTimers();
    try {
      socket.close(1000);
    } catch {
      // Already closed.
    }
    const cut = setTimeout(() => socket.terminate(), 1000);
    cut.unref();
    // A session that was connected ends as "idle with a reason", an attempt that never worked as "failed".
    const wasConnected = this.#state.phase === "connected";
    this.#set({ phase: wasConnected ? "idle" : "failed", mode: null, screen: null, error: reason });
    this.#resolve();
  }

  #fail(reason: string, address: string | null): RemoteDesktopClientState {
    this.#set({ phase: "failed", address, mode: null, screen: null, error: reason });
    return this.getState();
  }

  #resolve(): void {
    const settle = this.#settle;
    this.#settle = null;
    settle?.(this.getState());
  }

  #clearTimers(): void {
    for (const timer of this.#timers) clearInterval(timer);
    this.#timers = [];
  }

  #set(patch: Partial<RemoteDesktopClientState>): void {
    this.#state = { ...this.#state, ...patch };
    this.#options.emit(this.getState());
  }
}

function toBuffer(data: Buffer | ArrayBuffer | Buffer[]): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}
