// COSGRAL W3: the remote desktop HOST. A WebSocket server that shows this computer's screen to one viewer and, when
// the owner allows control, carries out the viewer's mouse and keyboard through the Windows driver.
//
// The rules (see docs/cosgral-raporty/kk-w3-remote-desktop.md):
// - listens on loopback unless the owner chose the local network; refuses browsers (an Origin header);
// - the viewer proves the token with an HMAC over our nonce (the token never travels, no clock is involved);
// - a new viewer, or one with policy "ask", needs the owner's answer on a consent card; one viewer at a time;
// - Stop is local and immediate; remote input never touches COSGRAL Workspace itself, a locked screen, a UAC prompt,
//   or windows that run as administrator, and uses the same keys as Computer Use.
// No Electron here: the screen comes from a FrameSource and input goes to a ComputerDriver.

import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { networkInterfaces } from "node:os";
import {
  type DraftPreviewResolution,
  type EnableRemoteDesktopInput,
  emptyRemoteDesktopHostState,
  REMOTE_DESKTOP_LIMITS,
  type RemoteDesktopExposure,
  type RemoteDesktopHostSession,
  type RemoteDesktopHostState,
  type RemoteDesktopInput,
  type RemoteDesktopMode,
  type RemoteDesktopPeerPolicy,
  type RemoteDesktopTokenResult,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber } from "@openbot/contracts/runtime-values";
import { type RawData, type WebSocket, WebSocketServer } from "ws";
import { type ComputerDriver, type DesktopRect, parseKeyCombination } from "./computer-driver";
import {
  type AuthMessage,
  clientProof,
  type DeniedReason,
  type EndedReason,
  encodeFrame,
  type HostMessage,
  hostProof,
  newNonce,
  parseClientMessage,
  REMOTE_DESKTOP_PATH,
  sameProof,
} from "./remote-desktop-protocol";
import type { RemoteDesktopStore } from "./remote-desktop-store";

/** One picture of the screen and where it sits on the virtual screen (physical pixels, like the driver). */
export interface HostFrame {
  jpeg: Buffer;
  width: number;
  height: number;
  area: DesktopRect;
}

export interface FrameSource {
  capture(maxDimension: number): Promise<HostFrame>;
}

/** What the owner is asked on the consent card. */
export interface ConsentRequest {
  title: string;
  preview: string;
  recipient: string;
  channel: string;
}

export interface RemoteDesktopTimings {
  pingIntervalMs: number;
  pongTimeoutMs: number;
  authTimeoutMs: number;
  consentTimeoutMs: number;
  lockMs: number;
  frameIntervalMs: number;
}

export interface RemoteDesktopHostOptions {
  store: RemoteDesktopStore;
  /** The Windows driver of this host; null when this computer cannot be controlled (the picture still works). */
  driver: () => ComputerDriver | null;
  frames: FrameSource;
  /** Asks the owner on a confirm card of `botId` (the first agent when null). Rejects when no card can be shown. */
  confirm: (botId: string | null, request: ConsentRequest) => Promise<DraftPreviewResolution>;
  /** True when a consent card can be shown (an agent exists). */
  canAsk: () => boolean;
  /** Why this computer cannot host, or null. */
  unavailableReason: () => string | null;
  emit: (state: RemoteDesktopHostState) => void;
  /** Processes of COSGRAL Workspace itself; their windows never get remote input. */
  protectedProcessIds?: () => number[];
  now?: () => Date;
  timings?: Partial<RemoteDesktopTimings>;
}

interface Connection {
  socket: WebSocket;
  remoteAddress: string;
  nonce: string;
  phase: "hello" | "consent" | "active" | "closed";
  /** When the viewer last answered a ping, on this computer's own clock only. */
  lastPongAt: number;
  timers: Set<NodeJS.Timeout>;
  session: ActiveSession | null;
}

interface ActiveSession {
  info: RemoteDesktopHostSession;
  connection: Connection;
  area: DesktopRect | null;
  /** Bumped by Stop and by a change of mode, so that an input in progress notices and stops. */
  generation: number;
  frameSeq: number;
  inputTimes: number[];
  inputQueue: RemoteDesktopInput[];
  inputRunning: boolean;
  frameTimer: NodeJS.Timeout | null;
  frameFailures: number;
}

const MAX_QUEUED_INPUTS = 20;
const TYPE_CHUNK = 16;
const MAX_UNSENT_BYTES = 3 * REMOTE_DESKTOP_LIMITS.maxFrameBytes;

export class RemoteDesktopHost {
  readonly #options: RemoteDesktopHostOptions;
  readonly #timings: RemoteDesktopTimings;
  readonly #now: () => Date;
  #server: WebSocketServer | null = null;
  #listening: RemoteDesktopHostState["listening"] = null;
  readonly #connections = new Set<Connection>();
  #session: ActiveSession | null = null;
  #consentPending = 0;
  readonly #failures = new Map<string, { count: number; lockedUntil: number }>();
  #lastError: string | null = null;

  constructor(options: RemoteDesktopHostOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => new Date());
    this.#timings = {
      pingIntervalMs: REMOTE_DESKTOP_LIMITS.pingIntervalMs,
      pongTimeoutMs: REMOTE_DESKTOP_LIMITS.pongTimeoutMs,
      authTimeoutMs: REMOTE_DESKTOP_LIMITS.authTimeoutMs,
      consentTimeoutMs: REMOTE_DESKTOP_LIMITS.consentTimeoutMs,
      lockMs: REMOTE_DESKTOP_LIMITS.lockMs,
      frameIntervalMs: Math.round(1000 / REMOTE_DESKTOP_LIMITS.framesPerSecond),
      ...options.timings,
    };
  }

  getState(): RemoteDesktopHostState {
    const unavailableReason = this.#options.unavailableReason();
    const settings = this.#options.store.settings();
    const lockedUntil = Math.max(0, ...[...this.#failures.values()].map((entry) => entry.lockedUntil));
    return {
      ...emptyRemoteDesktopHostState(),
      available: unavailableReason === null,
      unavailableReason,
      enabled: this.#server !== null,
      listening: this.#listening ? structuredClone(this.#listening) : null,
      tokenCreatedAt: settings.tokenCreatedAt,
      approvalBotId: settings.approvalBotId,
      peers: settings.peers,
      sessions: this.#session ? [{ ...this.#session.info }] : [],
      consentPending: this.#consentPending,
      lockedUntil: lockedUntil > this.#now().getTime() ? new Date(lockedUntil).toISOString() : null,
    };
  }

  /** The last reason a viewer was turned away or a session ended badly; for logs and the sandbox. */
  get lastError(): string | null {
    return this.#lastError;
  }

  async enable(input: EnableRemoteDesktopInput = {}): Promise<RemoteDesktopTokenResult> {
    const reason = this.#options.unavailableReason();
    if (reason) throw new Error(reason);
    if (!this.#options.canAsk()) {
      throw new Error("Create an agent first: the consent card for a viewer appears in an agent's row.");
    }
    const store = this.#options.store;
    const saved = store.settings();
    const exposure: RemoteDesktopExposure = input.exposure ?? saved.exposure;
    const port = input.port ?? saved.port;
    if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error("The port must be from 0 to 65535.");
    if (input.approvalBotId !== undefined) store.setApprovalBotId(input.approvalBotId);
    await this.#closeServer("host-disabled");
    const token = store.createToken();
    try {
      await this.#listen(exposure, port);
    } catch (error) {
      if (port === 0) throw error;
      // The saved port is taken: let the system choose.
      await this.#listen(exposure, 0);
    }
    store.setNetwork(exposure, this.#listening?.port ?? 0);
    this.#changed();
    return { state: this.getState(), token };
  }

  async disable(): Promise<RemoteDesktopHostState> {
    await this.#closeServer("host-disabled");
    this.#changed();
    return this.getState();
  }

  regenerateToken(): RemoteDesktopTokenResult {
    if (!this.#server) throw new Error("Turn sharing on first.");
    const token = this.#options.store.createToken();
    this.#changed();
    return { state: this.getState(), token };
  }

  setPeerPolicy(peerId: string, policy: RemoteDesktopPeerPolicy): RemoteDesktopHostState {
    this.#options.store.setPeerPolicy(peerId, policy);
    if (policy === "block") this.#stopSessionOf(peerId);
    this.#changed();
    return this.getState();
  }

  removePeer(peerId: string): RemoteDesktopHostState {
    this.#options.store.removePeer(peerId);
    this.#stopSessionOf(peerId);
    this.#changed();
    return this.getState();
  }

  /** "control" to "view" at once; the other way needs a new connection (the owner agrees to control on a card). */
  setSessionMode(sessionId: string, mode: RemoteDesktopMode): RemoteDesktopHostState {
    const session = this.#session;
    if (!session || session.info.id !== sessionId) throw new Error("This session is no longer connected.");
    if (mode === session.info.mode) return this.getState();
    if (mode === "control") {
      throw new Error("A viewer asks for control when it connects. Let it disconnect and connect with control.");
    }
    session.info.mode = "view";
    session.generation += 1;
    session.inputQueue.length = 0;
    this.#options.driver()?.cancel();
    this.#send(session.connection, { type: "mode", mode: "view" });
    this.#changed();
    return this.getState();
  }

  /** Stop. Ends one session or all of them at once, without waiting for the viewer. */
  stop(sessionId?: string): RemoteDesktopHostState {
    const session = this.#session;
    if (session && (sessionId === undefined || session.info.id === sessionId)) this.#endSession(session, "stopped");
    return this.getState();
  }

  /** Program shutdown. */
  async close(): Promise<void> {
    await this.#closeServer("host-disabled");
  }

  // -- server ---------------------------------------------------------------------------------------------------

  async #listen(exposure: RemoteDesktopExposure, port: number): Promise<void> {
    const host = exposure === "lan" ? "0.0.0.0" : "127.0.0.1";
    const server = new WebSocketServer({
      host,
      port,
      path: REMOTE_DESKTOP_PATH,
      maxPayload: REMOTE_DESKTOP_LIMITS.maxMessageBytes,
      // A web page in a browser always sends an Origin header; this protocol is for our own program only.
      verifyClient: (info: { req: IncomingMessage }) => info.req.headers.origin === undefined,
    });
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    server.on("error", (error) => {
      this.#lastError = error.message;
    });
    server.on("connection", (socket, request) => this.#accept(socket, request));
    const address = server.address();
    const boundPort = isDynamicRecord(address) && isNumber(address.port) ? address.port : port;
    this.#server = server;
    this.#listening = { port: boundPort, exposure, urls: urlsFor(exposure, boundPort) };
  }

  async #closeServer(reason: EndedReason): Promise<void> {
    const server = this.#server;
    for (const connection of [...this.#connections]) {
      if (connection.session) this.#endSession(connection.session, reason);
      else this.#drop(connection, null);
    }
    this.#server = null;
    this.#listening = null;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  #accept(socket: WebSocket, request: IncomingMessage): void {
    const connection: Connection = {
      socket,
      remoteAddress: cleanAddress(request.socket.remoteAddress),
      nonce: newNonce(),
      phase: "hello",
      lastPongAt: Date.now(),
      timers: new Set(),
      session: null,
    };
    this.#connections.add(connection);
    socket.on("error", () => this.#drop(connection, null));
    socket.on("close", () => this.#closed(connection));
    socket.on("pong", () => {
      connection.lastPongAt = Date.now();
    });
    socket.on("message", (data, isBinary) => {
      if (isBinary) return this.#drop(connection, "bad-message");
      void this.#message(connection, rawToText(data)).catch((error) => {
        this.#lastError = error instanceof Error ? error.message : String(error);
        this.#drop(connection, "unavailable");
      });
    });
    const locked = this.#lockedUntil(connection.remoteAddress);
    if (locked > this.#now().getTime()) {
      this.#drop(connection, "locked-out");
      return;
    }
    this.#send(connection, { type: "hello", version: REMOTE_DESKTOP_LIMITS.protocolVersion, nonce: connection.nonce });
    this.#timer(
      connection,
      setTimeout(
        () => connection.phase === "hello" && this.#drop(connection, "bad-message"),
        this.#timings.authTimeoutMs,
      ),
    );
  }

  async #message(connection: Connection, text: string): Promise<void> {
    const message = parseClientMessage(text);
    if (!message) return this.#drop(connection, "bad-message");
    if (message.type === "bye") return this.#drop(connection, null);
    if (message.type === "input") {
      const session = connection.session;
      if (session && connection.phase === "active") this.#queueInput(session, message.input);
      return;
    }
    if (connection.phase !== "hello") return this.#drop(connection, "bad-message");
    connection.phase = "consent";
    await this.#authenticate(connection, message);
  }

  async #authenticate(connection: Connection, auth: AuthMessage): Promise<void> {
    const token = this.#options.store.token();
    if (!token || !this.#server) return this.#drop(connection, "unavailable");
    if (!sameProof(clientProof(token, connection.nonce, auth.clientId, auth.mode), auth.proof)) {
      this.#recordFailure(connection.remoteAddress);
      return this.#drop(connection, "bad-token");
    }
    this.#failures.delete(connection.remoteAddress);
    const store = this.#options.store;
    const known = store.peer(auth.clientId);
    if (known?.policy === "block") return this.#drop(connection, "blocked");
    if (this.#session || this.#consentPending > 0) return this.#drop(connection, "busy");
    const peer = store.touchPeer(auth.clientId, auth.label);
    if (peer.policy !== "allow") {
      this.#consentPending += 1;
      this.#send(connection, { type: "waiting" });
      this.#changed();
      let decision: DraftPreviewResolution;
      try {
        decision = await this.#ask(connection, auth);
      } finally {
        this.#consentPending -= 1;
      }
      if (connection.phase === "closed") return this.#changed();
      if (decision !== "send") return this.#drop(connection, decision === "expired" ? "no-answer" : "declined");
      // The owner may have blocked this computer while the card was open.
      if (store.peer(auth.clientId)?.policy === "block") return this.#drop(connection, "blocked");
    }
    this.#start(connection, auth, token);
  }

  /** The consent card; a late answer after the viewer gave up is ignored (the connection is closed by then). */
  async #ask(connection: Connection, auth: AuthMessage): Promise<DraftPreviewResolution> {
    const control = auth.mode === "control";
    const answer = this.#options.confirm(this.#options.store.settings().approvalBotId, {
      title: `Allow ${auth.label} to ${control ? "control" : "see"} this computer?`,
      preview: `${auth.label} (${connection.remoteAddress}) knows the remote desktop token and asks to ${
        control ? "see this screen and use the mouse and keyboard" : "see this screen (no mouse or keyboard)"
      }. You can press Stop at any time. It never reaches COSGRAL Workspace itself, a locked screen or windows that run as administrator.`,
      recipient: auth.label,
      channel: "remote desktop",
    });
    const timeout = new Promise<DraftPreviewResolution>((resolve) => {
      this.#timer(
        connection,
        setTimeout(() => resolve("expired"), this.#timings.consentTimeoutMs),
      );
    });
    return Promise.race([answer, timeout]).catch(() => "expired" as const);
  }

  #start(connection: Connection, auth: AuthMessage, token: string): void {
    if (connection.phase === "closed") return;
    const info: RemoteDesktopHostSession = {
      id: randomUUID(),
      peerId: auth.clientId,
      label: auth.label,
      remoteAddress: connection.remoteAddress,
      mode: auth.mode,
      startedAt: this.#now().toISOString(),
      framesSent: 0,
      lastInputAt: null,
      paused: null,
    };
    const session: ActiveSession = {
      info,
      connection,
      area: null,
      generation: 0,
      frameSeq: 0,
      inputTimes: [],
      inputQueue: [],
      inputRunning: false,
      frameTimer: null,
      frameFailures: 0,
    };
    connection.phase = "active";
    connection.session = session;
    this.#session = session;
    this.#send(connection, {
      type: "accepted",
      sessionId: info.id,
      mode: info.mode,
      hostProof: hostProof(token, connection.nonce, auth.clientId, info.mode),
    });
    connection.lastPongAt = Date.now();
    const ping = setInterval(() => {
      if (Date.now() - connection.lastPongAt > this.#timings.pongTimeoutMs) {
        return this.#endSession(session, "unresponsive");
      }
      connection.socket.ping();
    }, this.#timings.pingIntervalMs);
    this.#timer(connection, ping);
    this.#scheduleFrame(session, 0);
    this.#changed();
  }

  // -- pictures -------------------------------------------------------------------------------------------------

  #scheduleFrame(session: ActiveSession, delayMs: number): void {
    session.frameTimer = setTimeout(() => void this.#frame(session), delayMs);
  }

  async #frame(session: ActiveSession): Promise<void> {
    if (this.#session !== session) return;
    const started = Date.now();
    try {
      const driver = this.#options.driver();
      const state = driver ? await driver.state() : null;
      if (this.#session !== session) return;
      const blocked = state ? (state.uacPrompt ? "uac" : state.locked ? "locked" : null) : null;
      if (blocked !== session.info.paused) {
        session.info.paused = blocked;
        this.#send(session.connection, { type: "paused", reason: blocked });
        this.#changed();
      }
      const socket = session.connection.socket;
      if (!blocked && socket.bufferedAmount < MAX_UNSENT_BYTES) {
        const frame = await this.#options.frames.capture(REMOTE_DESKTOP_LIMITS.frameMaxDimension);
        if (this.#session !== session) return;
        if (frame.jpeg.length > REMOTE_DESKTOP_LIMITS.maxFrameBytes) throw new Error("The picture is too big.");
        session.area = frame.area;
        session.frameSeq += 1;
        socket.send(encodeFrame(session.frameSeq, frame.width, frame.height, frame.jpeg), { binary: true });
        session.info.framesSent += 1;
      }
      session.frameFailures = 0;
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      session.frameFailures += 1;
      if (session.frameFailures === 3 && session.info.paused === null) {
        session.info.paused = "capture-failed";
        this.#send(session.connection, { type: "paused", reason: "capture-failed" });
        this.#changed();
      }
    }
    if (this.#session === session) {
      this.#scheduleFrame(session, Math.max(0, this.#timings.frameIntervalMs - (Date.now() - started)));
    }
  }

  // -- input ----------------------------------------------------------------------------------------------------

  #queueInput(session: ActiveSession, input: RemoteDesktopInput): void {
    if (session.info.mode !== "control") return;
    const nowMs = Date.now();
    session.inputTimes = session.inputTimes.filter((time) => nowMs - time < 1000);
    if (session.inputTimes.length >= REMOTE_DESKTOP_LIMITS.inputsPerSecond) return;
    session.inputTimes.push(nowMs);
    if (session.inputQueue.length >= MAX_QUEUED_INPUTS) return;
    session.inputQueue.push(input);
    if (!session.inputRunning) void this.#drain(session);
  }

  async #drain(session: ActiveSession): Promise<void> {
    session.inputRunning = true;
    try {
      while (session.inputQueue.length > 0 && this.#session === session && session.info.mode === "control") {
        const input = session.inputQueue.shift();
        if (!input) break;
        const generation = session.generation;
        try {
          if (await this.#apply(session, input, generation)) {
            session.info.lastInputAt = this.#now().toISOString();
          }
        } catch (error) {
          // A refused or failed input never ends the session; the viewer just sees nothing happen.
          this.#lastError = error instanceof Error ? error.message : String(error);
        }
      }
    } finally {
      session.inputRunning = false;
    }
  }

  /** Carries out one input; false when it was refused for safety. */
  async #apply(session: ActiveSession, input: RemoteDesktopInput, generation: number): Promise<boolean> {
    const driver = this.#options.driver();
    if (!driver) return false;
    const alive = () => this.#session === session && session.generation === generation;
    const state = await driver.state();
    if (!alive() || state.locked || state.uacPrompt) return false;
    const protectedIds = this.#options.protectedProcessIds?.() ?? [process.pid];
    const refused = (window: { processId: number; elevated: boolean } | null) =>
      window !== null && (window.elevated || protectedIds.includes(window.processId));
    if (input.type === "click" || input.type === "scroll") {
      const area = session.area ?? state.screen;
      const x = area.x + Math.round(input.x * Math.max(0, area.width - 1));
      const y = area.y + Math.round(input.y * Math.max(0, area.height - 1));
      if (refused(await driver.windowAt(x, y)) || !alive()) return false;
      if (input.type === "click") await driver.click(x, y, input.button, input.count);
      else await driver.scroll(x, y, input.deltaX, input.deltaY);
      return true;
    }
    if (refused(state.foreground)) return false;
    if (input.type === "keys") {
      const keys = parseKeyCombination(input.keys, REMOTE_DESKTOP_LIMITS.keysPerCombination);
      await driver.pressKeys(keys);
      return true;
    }
    for (let index = 0; index < input.text.length; index += TYPE_CHUNK) {
      if (!alive()) return false;
      await driver.typeText(input.text.slice(index, index + TYPE_CHUNK));
    }
    return true;
  }

  // -- sessions and connections ---------------------------------------------------------------------------------

  #stopSessionOf(peerId: string): void {
    const session = this.#session;
    if (session?.info.peerId === peerId) this.#endSession(session, "stopped");
  }

  /** Ends the session at once: input stops, the viewer is told, the connection closes, the host is normal again. */
  #endSession(session: ActiveSession, reason: EndedReason): void {
    if (this.#session === session) this.#session = null;
    session.generation += 1;
    session.inputQueue.length = 0;
    if (session.frameTimer) clearTimeout(session.frameTimer);
    session.frameTimer = null;
    this.#options.driver()?.cancel();
    const connection = session.connection;
    this.#send(connection, { type: "ended", reason });
    this.#drop(connection, null);
    this.#changed();
  }

  #closed(connection: Connection): void {
    // Called by hand and again by the socket's own "close" event; the second call does nothing.
    if (!this.#connections.delete(connection)) return;
    const wasActive = connection.session;
    connection.phase = "closed";
    for (const timer of connection.timers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    connection.timers.clear();
    if (wasActive && this.#session === wasActive) {
      this.#session = null;
      wasActive.generation += 1;
      wasActive.inputQueue.length = 0;
      if (wasActive.frameTimer) clearTimeout(wasActive.frameTimer);
      this.#options.driver()?.cancel();
    }
    this.#changed();
  }

  /** Closes a connection, telling the viewer why when a reason is given. */
  #drop(connection: Connection, reason: DeniedReason | null): void {
    if (connection.phase === "closed") return;
    if (reason) {
      this.#lastError = `Turned away: ${reason}`;
      this.#send(connection, { type: "denied", reason });
    }
    connection.phase = "closed";
    const socket = connection.socket;
    if (socket.readyState === socket.OPEN || socket.readyState === socket.CONNECTING) {
      socket.close(1000);
      // A viewer that does not answer the close handshake is cut after a moment.
      const cut = setTimeout(() => socket.terminate(), 1000);
      cut.unref();
    }
    this.#closed(connection);
  }

  #send(connection: Connection, message: HostMessage): void {
    const socket = connection.socket;
    if (socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify(message));
  }

  #timer(connection: Connection, timer: NodeJS.Timeout): void {
    connection.timers.add(timer);
  }

  #recordFailure(address: string): void {
    const entry = this.#failures.get(address) ?? { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= REMOTE_DESKTOP_LIMITS.authFailuresBeforeLock) {
      entry.lockedUntil = this.#now().getTime() + this.#timings.lockMs;
      entry.count = 0;
    }
    this.#failures.set(address, entry);
    this.#changed();
  }

  #lockedUntil(address: string): number {
    return this.#failures.get(address)?.lockedUntil ?? 0;
  }

  #changed(): void {
    this.#options.emit(this.getState());
  }
}

function rawToText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return Buffer.isBuffer(data) ? data.toString("utf8") : Buffer.from(data).toString("utf8");
}

function cleanAddress(address: string | undefined): string {
  return (address ?? "unknown").replace(/^::ffff:/, "");
}

/** The addresses a viewer can try: loopback always, and on the local network the computer's own IPv4 addresses. */
function urlsFor(exposure: RemoteDesktopExposure, port: number): string[] {
  const urls = [`ws://127.0.0.1:${port}`];
  if (exposure !== "lan") return urls;
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) urls.push(`ws://${entry.address}:${port}`);
    }
  }
  return urls;
}
