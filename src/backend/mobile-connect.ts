// COSGRAL W3: Mobile Connect (parity row 42). A small HTTP server for phones: loopback by default, the local
// network only when the person turns it on. Pairing: a one-time ticket from the QR code (a few minutes, limited wrong
// attempts) and the person's approval on a confirm card; the phone then gets its own device token. With the token the
// phone reads the agents and the Needs you list. Tickets and tokens never go to logs or errors.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createHttpsServer, type Server as HttpsServer } from "node:https";
import { networkInterfaces } from "node:os";
import {
  type AgentEvent,
  type BotSummary,
  buildMobileWebPairingUrl,
  type DraftPreviewResolution,
  formatMobileFingerprint,
  MOBILE_API_PATHS,
  MOBILE_EXPOSURES,
  MOBILE_LIMITS,
  MOBILE_PLAIN_TRANSPORT_WARNING,
  MOBILE_PROTOCOL_VERSION,
  MOBILE_TRANSPORT_WARNING,
  type MobileAgentSummary,
  type MobileDevice,
  type MobileDeviceIdInput,
  type MobileExposure,
  type MobileNeedsYouItem,
  type MobilePairingTicket,
  type MobileState,
  type MobileTransport,
  type PendingAgentRequest,
  type StartMobilePairingInput,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isOneOf, isString } from "@openbot/contracts/runtime-values";
import { createMobileCertificate } from "./mobile-certificate";
import { HttpError, readJson, sendJson } from "./mobile-http";
import type { MobilePhoneApi } from "./mobile-phone-api";
import { phoneAnswerPolicy } from "./mobile-policy";
import { buildPairingQr } from "./mobile-qr";
import type { MobileStore, MobileStoredCertificate } from "./mobile-store";

type InterfaceMap = Record<
  string,
  ReadonlyArray<{ address: string; family: string | number; internal: boolean }> | undefined
>;

export interface MobileConnectOptions {
  store: MobileStore;
  agents: () => MobileAgentSummary[];
  needsYou: () => MobileNeedsYouItem[];
  /** The pairing consent: a confirm card in Needs you; rejects when no card can be shown. */
  confirm: (input: { title: string; preview: string }) => Promise<DraftPreviewResolution>;
  /** True when an agent exists to carry the consent card. */
  canAsk: () => boolean;
  emit: (event: AgentEvent) => void;
  now?: () => Date;
  interfaces?: () => InterfaceMap;
  /** COSGRAL W3 (rows 43–44): chat, answers, events and agents for paired phones. */
  phone?: MobilePhoneApi;
}

interface OpenPairing {
  ticketHash: Buffer;
  expiresAt: number;
  attemptsLeft: number;
  consumed: boolean;
  consentPending: boolean;
  cancelled: boolean;
  timer: NodeJS.Timeout;
}

const PHONE_PATHS = new Set<string>([MOBILE_API_PATHS.me, MOBILE_API_PATHS.agents, MOBILE_API_PATHS.needsYou]);

export class MobileConnect {
  readonly #options: MobileConnectOptions;
  #server: Server | HttpsServer | null = null;
  #exposure: MobileExposure;
  #port: number | null = null;
  #transport: MobileTransport = "plain";
  #pairing: OpenPairing | null = null;
  #unavailable: string | null = null;
  readonly #failures = new Map<string, number[]>();

  constructor(options: MobileConnectOptions) {
    this.#options = options;
    this.#exposure = options.store.settings().exposure;
  }

  /** Program start: the server runs again when it ran before, so paired phones can connect. */
  async resume(): Promise<void> {
    const saved = this.#options.store.settings();
    if (!saved.enabled || this.#server) return;
    try {
      await this.#start(saved.exposure, saved.port);
      this.#unavailable = null;
    } catch (error) {
      this.#unavailable = `The phone server could not start: ${errorText(error)}`;
    }
    this.#changed();
  }

  getState(): MobileState {
    const pairing = this.#openPairing();
    const transport = this.#transportNow();
    const fingerprint = transport === "tls" ? this.#options.store.certificateFingerprint() : null;
    return {
      enabled: this.#server !== null,
      exposure: this.#exposure,
      port: this.#port,
      urls: this.#server && this.#port !== null ? this.#urls() : [],
      transport,
      fingerprint: fingerprint ? formatMobileFingerprint(fingerprint) : null,
      unencrypted: transport === "plain",
      pairing: pairing
        ? {
            expiresAt: new Date(pairing.expiresAt).toISOString(),
            attemptsLeft: pairing.attemptsLeft,
            consentPending: pairing.consentPending,
          }
        : null,
      devices: this.#options.store.listDevices(),
      unavailableReason: this.#unavailable,
    };
  }

  listDevices(): MobileDevice[] {
    return this.#options.store.listDevices();
  }

  /** Starts the server when needed and makes a new one-time ticket; an older ticket stops working. */
  async startPairing(input: StartMobilePairingInput = {}): Promise<MobilePairingTicket> {
    if (!this.#options.canAsk()) {
      throw new Error("Create an agent first: the pairing card appears in an agent's row.");
    }
    const saved = this.#options.store.settings();
    const exposure = input.exposure ?? saved.exposure;
    if (!isOneOf(MOBILE_EXPOSURES, exposure)) throw new Error('exposure is "loopback" or "lan".');
    const port = input.port ?? saved.port;
    if (!Number.isInteger(port) || (port !== 0 && (port < 1_024 || port > 65_535))) {
      throw new Error("The port is 0 (any free port) or from 1024 to 65535.");
    }
    if (exposure === "lan" && !this.#options.store.canEncrypt()) {
      throw new Error(
        "The local network needs an encrypted connection, but this computer cannot keep the certificate key safe right now.",
      );
    }
    const restart =
      !this.#server ||
      this.#exposure !== exposure ||
      (input.port !== undefined && input.port !== 0 && input.port !== this.#port);
    if (restart) {
      await this.#closeServer();
      await this.#start(exposure, port);
    }
    this.#unavailable = null;
    this.#clearPairing();
    const ticket = randomBytes(16).toString("base64url");
    const expiresAt = this.#now() + MOBILE_LIMITS.ticketTtlMs;
    const pairing: OpenPairing = {
      ticketHash: digest(ticket),
      expiresAt,
      attemptsLeft: MOBILE_LIMITS.ticketAttempts,
      consumed: false,
      consentPending: false,
      cancelled: false,
      timer: setTimeout(() => {
        if (this.#pairing === pairing && !pairing.consentPending) {
          this.#pairing = null;
          this.#changed();
        }
      }, MOBILE_LIMITS.ticketTtlMs),
    };
    pairing.timer.unref();
    this.#pairing = pairing;
    const urls = this.#urls();
    const fingerprint = this.#transport === "tls" ? this.#options.store.certificateFingerprint() : null;
    // The QR code opens the phone web app on the address a phone can reach (the local network one when there is one).
    const appUrl = `${urls.find((url) => !url.includes("//127.0.0.1:")) ?? urls[0] ?? ""}/app/`;
    const qrPayload = buildMobileWebPairingUrl({ appUrl, ticket, urls, fingerprint });
    const qr = buildPairingQr(qrPayload);
    this.#changed();
    return {
      ticket,
      qrPayload,
      qrSvg: qr.svg,
      qrDataUrl: qr.dataUrl,
      urls,
      appUrl,
      fingerprint,
      expiresAt: new Date(expiresAt).toISOString(),
      state: this.getState(),
    };
  }

  /**
   * A new certificate and fingerprint. Every paired phone pinned the old one, so all are removed (their tokens stop
   * working) and pair again with a new QR code. The server restarts with the new certificate when it runs.
   */
  async rotateCertificate(): Promise<MobileState> {
    if (!this.#options.store.canEncrypt()) {
      throw new Error("This computer cannot keep a certificate key safe, so Mobile Connect stays on plain loopback.");
    }
    this.#clearPairing();
    this.#newCertificate();
    if (this.#server) {
      const exposure = this.#exposure;
      const port = this.#port ?? this.#options.store.settings().port;
      await this.#closeServer();
      await this.#start(exposure, port);
    }
    this.#changed();
    return this.getState();
  }

  cancelPairing(): MobileState {
    this.#clearPairing();
    this.#changed();
    return this.getState();
  }

  /** Stops the server; paired phones stay and connect again when it runs. */
  async disable(): Promise<MobileState> {
    this.#clearPairing();
    await this.#closeServer();
    this.#options.store.setNetwork({ enabled: false });
    this.#changed();
    return this.getState();
  }

  /** The device's token stops working at once. */
  async revokeDevice(input: MobileDeviceIdInput): Promise<MobileState> {
    if (!this.#options.store.removeDevice(input.deviceId)) throw new Error("This device is no longer paired.");
    // COSGRAL W3: its open event streams end at once too.
    this.#options.phone?.disconnect(input.deviceId);
    this.#changed();
    return this.getState();
  }

  /** Program shutdown (the saved choice to run stays). */
  async close(): Promise<void> {
    this.#clearPairing();
    await this.#closeServer();
  }

  // -- server ---------------------------------------------------------------------------------------------------

  async #start(exposure: MobileExposure, port: number): Promise<void> {
    try {
      await this.#listen(exposure, port);
    } catch (error) {
      if (port === 0) throw error;
      // The saved port is taken: let the system choose.
      await this.#listen(exposure, 0);
    }
    this.#options.store.setNetwork({ enabled: true, exposure, port: this.#port ?? port });
  }

  async #listen(exposure: MobileExposure, port: number): Promise<void> {
    const host = exposure === "lan" ? "0.0.0.0" : "127.0.0.1";
    const handler = (request: IncomingMessage, response: ServerResponse) => {
      void this.#handle(request, response);
    };
    // COSGRAL W3-BE7: HTTPS whenever the key can be kept safe; plain HTTP only on loopback (checked by the caller).
    const certificate = this.#options.store.canEncrypt() ? this.#certificate() : null;
    const server = certificate
      ? createHttpsServer({ key: certificate.keyPem, cert: certificate.certPem, minVersion: "TLSv1.2" }, handler)
      : createServer(handler);
    this.#transport = certificate ? "tls" : "plain";
    server.requestTimeout = MOBILE_LIMITS.ticketTtlMs + 60_000;
    server.headersTimeout = 15_000;
    server.keepAliveTimeout = 5_000;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.off("error", reject);
        resolve();
      });
    });
    server.on("error", (error) => {
      this.#unavailable = `The phone server stopped: ${error.message}`;
    });
    const address = server.address();
    this.#server = server;
    this.#exposure = exposure;
    this.#port = isDynamicRecord(address) && isNumber(address.port) ? address.port : port;
  }

  /** The saved certificate, or a new one when there is none, it cannot be read, or it ends within a day. */
  #certificate(): MobileStoredCertificate {
    const saved = this.#options.store.certificate();
    if (saved && Date.parse(saved.notAfter) - this.#now() > 86_400_000) return saved;
    return this.#newCertificate();
  }

  /** A new certificate; phones that pinned an older one are removed. */
  #newCertificate(): MobileStoredCertificate {
    const ips = mobileUrls("lan", 1, this.#options.interfaces?.())
      .map((url) => new URL(url).hostname)
      .filter((host) => host !== "127.0.0.1");
    const certificate = createMobileCertificate({ now: new Date(this.#now()), ips });
    const replaced = this.#options.store.certificateFingerprint() !== null;
    this.#options.store.saveCertificate(certificate);
    if (replaced || this.#options.store.listDevices().length > 0) {
      this.#options.store.removeAllDevices();
      this.#options.phone?.closeAll();
    }
    return {
      certPem: certificate.certPem,
      keyPem: certificate.keyPem,
      fingerprint: certificate.fingerprint,
      notAfter: certificate.notAfter,
    };
  }

  #transportNow(): MobileTransport {
    if (this.#server) return this.#transport;
    return this.#options.store.canEncrypt() ? "tls" : "plain";
  }

  async #closeServer(): Promise<void> {
    const server = this.#server;
    this.#server = null;
    this.#port = null;
    if (!server) return;
    this.#options.phone?.closeAll();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const address = cleanAddress(request.socket.remoteAddress);
    try {
      if (this.#limited(address)) throw new HttpError(429, "Too many failed attempts. Wait a minute and try again.");
      const path = (request.url ?? "/").split("?")[0] ?? "/";
      if (path === MOBILE_API_PATHS.pair) {
        if (request.method !== "POST") throw new HttpError(405, "Use POST.");
        await this.#pair(request, response, address);
        return;
      }
      if (PHONE_PATHS.has(path) && request.method === "GET") {
        const device = this.#authenticate(request, address);
        if (path === MOBILE_API_PATHS.me) sendJson(response, 200, { protocol: MOBILE_PROTOCOL_VERSION, device });
        else if (path === MOBILE_API_PATHS.agents) sendJson(response, 200, { agents: this.#options.agents() });
        else sendJson(response, 200, { items: this.#options.needsYou() });
        return;
      }
      const phone = this.#options.phone;
      if (phone && path.startsWith("/v1/")) {
        const device = this.#authenticate(request, address);
        const query = new URLSearchParams((request.url ?? "").split("?")[1] ?? "");
        if (await phone.handle({ request, response, path, query, device })) return;
      } else if (PHONE_PATHS.has(path)) {
        throw new HttpError(405, "Use GET.");
      }
      throw new HttpError(404, "Not found.");
    } catch (error) {
      if (error instanceof HttpError) sendJson(response, error.status, { error: error.message });
      else sendJson(response, 500, { error: "Something went wrong on the computer." });
    }
  }

  async #pair(request: IncomingMessage, response: ServerResponse, address: string): Promise<void> {
    const body = await readJson(request);
    const ticket = body.ticket;
    if (!isString(ticket) || ticket.length > 64) throw new HttpError(400, "ticket is required.");
    const name = isString(body.deviceName) ? body.deviceName.replace(/\p{Cc}/gu, " ").trim() : "";
    if (!name || name.length > MOBILE_LIMITS.deviceName) {
      throw new HttpError(400, `deviceName is required (at most ${MOBILE_LIMITS.deviceName} characters).`);
    }
    const platform = body.platform;
    if (
      platform !== undefined &&
      platform !== null &&
      (!isString(platform) || platform.length > MOBILE_LIMITS.platform || !/^[A-Za-z0-9 ._-]*$/.test(platform))
    ) {
      throw new HttpError(
        400,
        `platform has at most ${MOBILE_LIMITS.platform} letters, digits, spaces, dots or dashes.`,
      );
    }
    const pairing = this.#pairing;
    if (!pairing) throw new HttpError(410, "No pairing is open. Show a new QR code on the computer.");
    if (pairing.expiresAt <= this.#now()) {
      this.#clearPairing();
      this.#changed();
      throw new HttpError(410, "The pairing code expired. Show a new QR code on the computer.");
    }
    if (pairing.consumed)
      throw new HttpError(410, "This pairing code was already used. Show a new QR code on the computer.");
    const given = digest(ticket);
    if (given.length !== pairing.ticketHash.length || !timingSafeEqual(given, pairing.ticketHash)) {
      this.#fail(address);
      pairing.attemptsLeft -= 1;
      if (pairing.attemptsLeft <= 0) this.#clearPairing();
      this.#changed();
      throw new HttpError(401, "The pairing code is wrong.");
    }
    if (this.#options.store.listDevices().length >= MOBILE_LIMITS.devices) {
      throw new HttpError(409, `At most ${MOBILE_LIMITS.devices} phones can be paired; remove one on the computer.`);
    }
    pairing.consumed = true;
    pairing.consentPending = true;
    this.#changed();
    let gone = false;
    response.once("close", () => {
      if (!response.writableEnded) gone = true;
    });
    let decision: DraftPreviewResolution;
    try {
      decision = await withTimeout(
        this.#options.confirm({
          title: "Pair a phone with this computer?",
          preview: [
            "A phone wants to connect to COSGRAL Workspace on this computer.",
            `Phone: ${name}${isString(platform) && platform ? ` (${platform})` : ""}`,
            `Address: ${address}`,
            "After pairing it can see your agents and what needs you. You can remove it at any time in Settings → Mobile Connect.",
            this.#transport === "tls" ? MOBILE_TRANSPORT_WARNING : MOBILE_PLAIN_TRANSPORT_WARNING,
          ].join("\n"),
        }),
        Math.max(1_000, pairing.expiresAt - this.#now()),
      );
    } catch {
      decision = "expired";
    } finally {
      // The ticket is used up either way; this ends the pairing without cancelling it.
      pairing.consentPending = false;
      if (this.#pairing === pairing) {
        clearTimeout(pairing.timer);
        this.#pairing = null;
      }
      this.#changed();
    }
    if (gone) return;
    if (pairing.cancelled) throw new HttpError(410, "The pairing was cancelled on the computer.");
    if (decision === "expired") throw new HttpError(410, "Nobody approved the pairing in time. Show a new QR code.");
    if (decision !== "send") throw new HttpError(403, "The pairing was declined on the computer.");
    const { device, token } = this.#options.store.addDevice({
      name,
      platform: isString(platform) && platform ? platform : null,
      address,
      now: new Date(this.#now()),
    });
    sendJson(response, 200, { protocol: MOBILE_PROTOCOL_VERSION, deviceId: device.id, token });
    this.#options.emit({ type: "mobile-pairing-completed", device });
    this.#changed();
  }

  #authenticate(request: IncomingMessage, address: string): MobileDevice {
    const match = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(request.headers.authorization ?? "");
    const found = match?.[1] ? this.#options.store.findByToken(match[1]) : null;
    if (!found) {
      this.#fail(address);
      throw new HttpError(401, "This phone is not paired, or it was removed on the computer.");
    }
    this.#options.store.touch(found.id, address, new Date(this.#now()));
    return this.#options.store.listDevices().find((device) => device.id === found.id) ?? found;
  }

  #openPairing(): OpenPairing | null {
    const pairing = this.#pairing;
    if (pairing && !pairing.consentPending && pairing.expiresAt <= this.#now()) return null;
    return pairing;
  }

  /** Cancels the open pairing (new ticket, Cancel, Disable, expiry, too many wrong tickets). */
  #clearPairing(): void {
    const pairing = this.#pairing;
    if (!pairing) return;
    clearTimeout(pairing.timer);
    pairing.cancelled = true;
    this.#pairing = null;
  }

  #fail(address: string): void {
    const now = this.#now();
    const recent = (this.#failures.get(address) ?? []).filter((at) => now - at < 60_000);
    recent.push(now);
    this.#failures.set(address, recent);
  }

  #limited(address: string): boolean {
    const now = this.#now();
    const recent = (this.#failures.get(address) ?? []).filter((at) => now - at < 60_000);
    this.#failures.set(address, recent);
    return recent.length >= MOBILE_LIMITS.failuresPerMinute;
  }

  #urls(): string[] {
    if (this.#port === null) return [];
    const scheme = this.#transport === "tls" ? "https" : "http";
    return mobileUrls(this.#exposure, this.#port, this.#options.interfaces?.(), scheme);
  }

  #changed(): void {
    this.#options.emit({ type: "mobile-changed", state: this.getState() });
  }

  #now(): number {
    return (this.#options.now?.() ?? new Date()).getTime();
  }
}

/** Loopback always; with "lan" also the computer's own IPv4 addresses. */
export function mobileUrls(
  exposure: MobileExposure,
  port: number,
  interfaces: InterfaceMap = networkInterfaces(),
  scheme: "http" | "https" = "http",
): string[] {
  const urls = [`${scheme}://127.0.0.1:${port}`];
  if (exposure !== "lan") return urls;
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if ((entry.family === "IPv4" || entry.family === 4) && !entry.internal)
        urls.push(`${scheme}://${entry.address}:${port}`);
    }
  }
  return urls;
}

export function mobileAgents(bots: BotSummary[]): MobileAgentSummary[] {
  return bots.map((bot) => ({
    id: bot.id,
    name: bot.name,
    role: bot.role,
    avatarHue: bot.avatarHue,
    model: bot.model,
  }));
}

/** A short title per open card; never answers, secrets or full drafts. */
export function mobileNeedsYou(requests: PendingAgentRequest[]): MobileNeedsYouItem[] {
  return requests.map(needsYouItem);
}

function needsYouItem(request: PendingAgentRequest): MobileNeedsYouItem {
  const reason = phoneAnswerPolicy(request);
  return { ...summaryItem(request), answerOn: reason ? "computer" : "phone", computerReason: reason };
}

function summaryItem(request: PendingAgentRequest): MobileNeedsYouItem {
  switch (request.kind) {
    case "prompt": {
      const question = request.questions[0];
      const title = question
        ? question.header
          ? `${question.header}: ${question.question}`
          : question.question
        : "A question";
      return item(String(request.requestId), request.botId, request.kind, title, request.createdAt);
    }
    case "approval": {
      const approval = request.approval;
      const label =
        approval.kind === "command"
          ? "Approve a command"
          : approval.kind === "file-change"
            ? "Approve file changes"
            : "Approve access";
      return item(
        String(approval.requestId),
        approval.botId,
        request.kind,
        approval.reason ? `${label}: ${approval.reason}` : label,
        request.createdAt,
      );
    }
    case "draft-preview":
      return item(request.card.requestId, request.card.botId, request.kind, request.card.title, request.card.createdAt);
    case "browser-takeover":
      return item(
        request.request.requestId,
        request.request.botId,
        request.kind,
        request.request.reason,
        request.request.createdAt,
      );
    case "vault-request":
      return item(
        request.request.requestId,
        request.request.botId,
        request.kind,
        request.request.reason,
        request.request.createdAt,
      );
  }
}

function item(
  id: string,
  botId: string,
  kind: MobileNeedsYouItem["kind"],
  title: string,
  createdAt: string | null,
): MobileNeedsYouItem {
  const clean = title.replace(/\s+/g, " ").trim() || "Needs you";
  const limit = MOBILE_LIMITS.needsYouTitle;
  return { id, botId, kind, title: clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean, createdAt };
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    timer.unref();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function cleanAddress(address: string | undefined): string {
  return (address ?? "unknown").replace(/^::ffff:/, "");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
