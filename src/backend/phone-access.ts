// COSGRAL W9-BE1: the phone away from home on the Mobile Connect server (spec-w9.md 1B, 1C; Q4-Q7, Q11).
//   * PIN (optional, per paired phone): the phone sets it, this computer keeps a salted hash. With a PIN, every phone call
//     except the unlock ones answers 423 until the PIN is given; the phone locks again after 5 minutes without a request,
//     when the web app says the page went to the background, and when the program starts. 5 wrong PINs in a row remove the
//     phone (it pairs again): a stolen token with a guessed PIN is not worth more than 5 tries.
//   * Web Push (off by default), only about a card in Needs you, and the text is only that an agent waits. The VAPID private
//     key never leaves this computer (phone-access-store.ts). The phone's own permission is asked before it subscribes.
//   * The state the window shows (reach, push, per-phone summary): never a PIN, a hash or a key.

import {
  type AgentEvent,
  buildPhonePushPayload,
  isValidPin,
  MOBILE_ACCESS_PATHS,
  type MobileDevice,
  type MobileNeedsYouItem,
  type MobileState,
  PHONE_ACCESS_LIMITS,
  PHONE_LOCKED_MESSAGE,
  PHONE_LOCKED_STATUS,
  PHONE_PUSH_REASONS,
  type PhoneAccessState,
  type PhoneDeviceAccess,
  type PhonePushTestResult,
  type PhoneSessionState,
  parsePhonePushSubscription,
  phonePushUnavailableReason,
  phoneReachOf,
  tailscaleUrlsOf,
} from "@openbot/contracts/ipc";
import { HttpError, readJson, sendJson } from "./mobile-http";
import type { PhoneRequest } from "./mobile-phone-api";
import type { PhoneAccessStore } from "./phone-access-store";
import { fetchPushPost, type PushPost, sendWebPush } from "./web-push";

/** What reaches Needs you: a change of one of these events can mean a new card. */
const CARD_EVENTS = new Set<AgentEvent["type"]>([
  "prompt",
  "approval",
  "draft-preview",
  "browser-takeover",
  "vault-request",
]);

/** Paths that answer while the phone is locked (the unlock itself and what the web app needs to draw the lock screen). */
const OPEN_WHILE_LOCKED = new Set<string>([
  MOBILE_ACCESS_PATHS.session,
  MOBILE_ACCESS_PATHS.pinUnlock,
  MOBILE_ACCESS_PATHS.lock,
  MOBILE_ACCESS_PATHS.pushKey,
]);

/** Pushes to one phone per minute (a flood of cards must not become a flood of notifications). */
const PUSHES_PER_MINUTE = 10;
/** How often the idle lock is looked at. */
const SWEEP_MS = 30_000;

export interface PhoneAccessOptions {
  store: PhoneAccessStore;
  /** Mobile Connect's own state: whether it runs, the addresses, the certificate fingerprint, the paired phones. */
  mobile: () => MobileState;
  needsYou: () => MobileNeedsYouItem[];
  agentName: (botId: string) => string | null;
  /** The program's events (the unsubscribe is returned). */
  subscribe: (listener: (event: AgentEvent) => void) => () => void;
  /** Takes a phone's token away (after the last wrong PIN). */
  removeDevice: (deviceId: string) => Promise<unknown>;
  /** Ends the open event streams of a phone (it locked, so it must not keep receiving). */
  disconnectDevice: (deviceId: string) => void;
  emit: (event: AgentEvent) => void;
  now?: () => Date;
  post?: PushPost;
  /** Coalescing of card events before a scan. */
  scanDelayMs?: number;
}

interface Session {
  unlocked: boolean;
  lastActivity: number;
}

export class PhoneAccess {
  readonly #options: PhoneAccessOptions;
  readonly #sessions = new Map<string, Session>();
  /** Cards already announced (or already waiting when the program started). */
  readonly #known = new Set<string>();
  readonly #sent = new Map<string, number[]>();
  #unsubscribe: (() => void) | null = null;
  #scanTimer: NodeJS.Timeout | null = null;
  #sweepTimer: NodeJS.Timeout | null = null;
  #started = false;

  constructor(options: PhoneAccessOptions) {
    this.#options = options;
  }

  /** Follows the program's events for push and forgets phones that are no longer paired. */
  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#options.store.prune(this.#options.mobile().devices.map((device) => device.id));
    for (const item of this.#options.needsYou()) this.#known.add(item.id);
    this.#unsubscribe = this.#options.subscribe((event) => {
      if (CARD_EVENTS.has(event.type)) this.#scheduleScan();
    });
    this.#sweepTimer = setInterval(() => this.sweep(), SWEEP_MS);
    this.#sweepTimer.unref();
  }

  /** A phone that did nothing for 5 minutes locks, and its event streams end (they would keep sending card titles). */
  sweep(): void {
    for (const [deviceId, session] of this.#sessions) {
      if (!session.unlocked || !this.#locked(deviceId)) continue;
      session.unlocked = false;
      this.#options.disconnectDevice(deviceId);
      this.#changed();
    }
  }

  close(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    if (this.#scanTimer) clearTimeout(this.#scanTimer);
    this.#scanTimer = null;
    if (this.#sweepTimer) clearInterval(this.#sweepTimer);
    this.#sweepTimer = null;
    this.#started = false;
  }

  // -- the gate every phone call passes ---------------------------------------------------------------------------

  /** Called after the token was checked. Throws 423 for a locked phone; otherwise counts the call as activity. */
  gate(device: MobileDevice, path: string): void {
    if (!this.#options.store.device(device.id).pinSet) return;
    if (OPEN_WHILE_LOCKED.has(path)) return;
    if (this.#locked(device.id)) {
      // A locked phone must not keep receiving events either.
      this.#options.disconnectDevice(device.id);
      throw new HttpError(PHONE_LOCKED_STATUS, PHONE_LOCKED_MESSAGE);
    }
    this.#session(device.id).lastActivity = this.#now();
  }

  /** The phone paths of this feature; false for any other path. */
  async handle(input: PhoneRequest): Promise<boolean> {
    const method = input.request.method ?? "GET";
    const id = input.device.id;
    switch (input.path) {
      case MOBILE_ACCESS_PATHS.session:
        return this.#only(method, "GET", () => sendJson(input.response, 200, this.#sessionState(id)));
      case MOBILE_ACCESS_PATHS.lock:
        return this.#only(method, "POST", () => {
          this.#lock(id);
          sendJson(input.response, 200, this.#sessionState(id));
        });
      case MOBILE_ACCESS_PATHS.pinUnlock:
        if (method !== "POST") throw new HttpError(405, "Use POST.");
        await this.#unlock(input);
        return true;
      case MOBILE_ACCESS_PATHS.pin:
        if (method === "PUT") await this.#setPin(input);
        else if (method === "DELETE") await this.#removePin(input);
        else throw new HttpError(405, "Use PUT or DELETE.");
        return true;
      case MOBILE_ACCESS_PATHS.pushKey:
        return this.#only(method, "GET", () => this.#pushKey(input));
      case MOBILE_ACCESS_PATHS.pushSubscription:
        if (method === "PUT") await this.#subscribe(input);
        else if (method === "DELETE") this.#unsubscribeDevice(input);
        else throw new HttpError(405, "Use PUT or DELETE.");
        return true;
      default:
        return false;
    }
  }

  /** A phone was removed (revoked, too many wrong PINs, a new certificate): what is kept about it is dropped. */
  forget(): void {
    this.#options.store.prune(this.#options.mobile().devices.map((device) => device.id));
    for (const id of [...this.#sessions.keys()]) {
      if (!this.#options.mobile().devices.some((device) => device.id === id)) this.#sessions.delete(id);
    }
    this.#changed();
  }

  // -- the window -------------------------------------------------------------------------------------------------

  getState(): PhoneAccessState {
    const mobile = this.#options.mobile();
    const store = this.#options.store;
    const keysReady = store.canEncrypt();
    const subscriptions = mobile.devices.filter((device) => store.device(device.id).push !== null).length;
    const enabled = store.pushEnabled();
    return {
      enabled: mobile.enabled,
      exposure: mobile.exposure,
      reach: phoneReachOf(mobile.enabled, mobile.exposure, mobile.urls),
      tailscaleUrls: tailscaleUrlsOf(mobile.urls),
      fingerprint: mobile.fingerprint,
      certificate: "self-signed",
      push: {
        enabled,
        keysReady,
        publicKey: store.publicKey(),
        unavailableReason: phonePushUnavailableReason({ enabled, keysReady, subscriptions }),
        subscriptions,
      },
      devices: mobile.devices.map((device): PhoneDeviceAccess => {
        const saved = store.device(device.id);
        return {
          deviceId: device.id,
          name: device.name,
          pinSet: saved.pinSet,
          locked: saved.pinSet && this.#locked(device.id),
          pushSubscribed: saved.push !== null,
          pushError: saved.pushError,
          lastPushAt: saved.lastPushAt,
        };
      }),
    };
  }

  /** Mobile Connect changed (on or off, the exposure, the addresses): the window's state follows. */
  refresh(): void {
    this.#changed();
  }

  setPushEnabled(enabled: boolean): PhoneAccessState {
    // The keys are made the first time push is turned on (never before: a computer that does not want push has none).
    if (enabled) this.#options.store.vapid();
    this.#options.store.setPushEnabled(enabled);
    this.#changed();
    return this.getState();
  }

  async sendTestPush(deviceId: string): Promise<PhonePushTestResult> {
    const store = this.#options.store;
    if (!this.#options.mobile().devices.some((device) => device.id === deviceId)) {
      return { sent: false, reason: "This phone is not paired." };
    }
    if (!store.pushEnabled()) return { sent: false, reason: PHONE_PUSH_REASONS.off };
    if (!store.canEncrypt()) return { sent: false, reason: PHONE_PUSH_REASONS.noKeys };
    if (!store.device(deviceId).push) return { sent: false, reason: "This phone has not allowed notifications yet." };
    const outcome = await this.#push(
      deviceId,
      buildPhonePushPayload({ agentName: "Test", itemId: "test", test: true }),
    );
    this.#changed();
    return outcome.ok ? { sent: true, reason: null } : { sent: false, reason: outcome.reason };
  }

  // -- PIN ------------------------------------------------------------------------------------------------------

  async #setPin(input: PhoneRequest): Promise<void> {
    const body = await readJson(input.request, PHONE_ACCESS_LIMITS.bodyBytes);
    const id = input.device.id;
    if (!isValidPin(body.pin)) {
      throw new HttpError(400, `The PIN is ${PHONE_ACCESS_LIMITS.pinMin} to ${PHONE_ACCESS_LIMITS.pinMax} digits.`);
    }
    if (this.#options.store.device(id).pinSet) {
      // Changing a PIN needs the current one, even on an unlocked phone (someone picked it up).
      if (!(await this.#checkPin(input, body.currentPin))) return;
    }
    this.#options.store.setPin(id, body.pin);
    this.#session(id).unlocked = true;
    this.#session(id).lastActivity = this.#now();
    this.#changed();
    sendJson(input.response, 200, this.#sessionState(id));
  }

  async #removePin(input: PhoneRequest): Promise<void> {
    const body = await readJson(input.request, PHONE_ACCESS_LIMITS.bodyBytes);
    const id = input.device.id;
    if (!this.#options.store.device(id).pinSet) throw new HttpError(409, "This phone has no PIN.");
    if (!(await this.#checkPin(input, body.pin))) return;
    this.#options.store.clearPin(id);
    this.#sessions.delete(id);
    this.#changed();
    sendJson(input.response, 200, this.#sessionState(id));
  }

  async #unlock(input: PhoneRequest): Promise<void> {
    const body = await readJson(input.request, PHONE_ACCESS_LIMITS.bodyBytes);
    const id = input.device.id;
    if (!this.#options.store.device(id).pinSet) {
      sendJson(input.response, 200, { ok: true });
      return;
    }
    if (!(await this.#checkPin(input, body.pin))) return;
    const session = this.#session(id);
    session.unlocked = true;
    session.lastActivity = this.#now();
    this.#changed();
    sendJson(input.response, 200, { ok: true });
  }

  /**
   * True when the PIN is right. When it is wrong the answer is already sent here: the tries left, or "removed" after the
   * last one (the phone's token stops working and what is kept about it is dropped).
   */
  async #checkPin(input: PhoneRequest, pin: unknown): Promise<boolean> {
    const id = input.device.id;
    if (!isValidPin(pin)) {
      throw new HttpError(400, `The PIN is ${PHONE_ACCESS_LIMITS.pinMin} to ${PHONE_ACCESS_LIMITS.pinMax} digits.`);
    }
    const result = this.#options.store.verifyPin(id, pin);
    if (result.ok) return true;
    if (result.attemptsLeft <= 0) {
      this.#options.disconnectDevice(id);
      await this.#options.removeDevice(id);
      this.forget();
      sendJson(input.response, 401, {
        error: "Too many wrong PINs. This phone was removed; pair it again from the computer.",
        code: "removed",
        attemptsLeft: 0,
      });
      return false;
    }
    sendJson(input.response, 401, { error: "Wrong PIN.", code: "wrong-pin", attemptsLeft: result.attemptsLeft });
    return false;
  }

  #lock(deviceId: string): void {
    if (!this.#options.store.device(deviceId).pinSet) return;
    this.#session(deviceId).unlocked = false;
    this.#options.disconnectDevice(deviceId);
    this.#changed();
  }

  #locked(deviceId: string): boolean {
    const session = this.#sessions.get(deviceId);
    if (!session?.unlocked) return true;
    return this.#now() - session.lastActivity > PHONE_ACCESS_LIMITS.idleLockMs;
  }

  #session(deviceId: string): Session {
    let session = this.#sessions.get(deviceId);
    if (!session) {
      session = { unlocked: false, lastActivity: 0 };
      this.#sessions.set(deviceId, session);
    }
    return session;
  }

  #sessionState(deviceId: string): PhoneSessionState {
    const store = this.#options.store;
    const saved = store.device(deviceId);
    return {
      pinSet: saved.pinSet,
      locked: saved.pinSet && this.#locked(deviceId),
      attemptsLeft: saved.pinSet ? store.attemptsLeft(deviceId) : null,
      idleLockSeconds: PHONE_ACCESS_LIMITS.idleLockMs / 1000,
      push: { available: this.#pushReady(), subscribed: saved.push !== null },
    };
  }

  // -- push -----------------------------------------------------------------------------------------------------

  #pushReady(): boolean {
    return this.#options.store.pushEnabled() && this.#options.store.canEncrypt();
  }

  #pushKey(input: PhoneRequest): void {
    if (!this.#options.store.pushEnabled()) {
      throw new HttpError(409, "Notifications are off on the computer. Turn them on there first.");
    }
    const keys = this.#options.store.vapid();
    if (!keys) throw new HttpError(503, PHONE_PUSH_REASONS.noKeys);
    sendJson(input.response, 200, { publicKey: keys.publicKey });
  }

  async #subscribe(input: PhoneRequest): Promise<void> {
    if (!this.#pushReady()) {
      throw new HttpError(409, "Notifications are off on the computer. Turn them on there first.");
    }
    const body = await readJson(input.request, PHONE_ACCESS_LIMITS.bodyBytes);
    let subscription: ReturnType<typeof parsePhonePushSubscription>;
    try {
      subscription = parsePhonePushSubscription(body);
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : "The push subscription is malformed.");
    }
    this.#options.store.setSubscription(input.device.id, subscription);
    this.#changed();
    sendJson(input.response, 200, this.#sessionState(input.device.id));
  }

  #unsubscribeDevice(input: PhoneRequest): void {
    this.#options.store.setSubscription(input.device.id, null);
    this.#changed();
    sendJson(input.response, 200, this.#sessionState(input.device.id));
  }

  #scheduleScan(): void {
    if (this.#scanTimer) return;
    this.#scanTimer = setTimeout(() => {
      this.#scanTimer = null;
      void this.#scan();
    }, this.#options.scanDelayMs ?? 250);
    this.#scanTimer.unref();
  }

  /** New cards in Needs you become one notification each (cards that were already known are not announced again). */
  async #scan(): Promise<void> {
    const items = this.#options.needsYou();
    const present = new Set(items.map((item) => item.id));
    for (const id of [...this.#known]) if (!present.has(id)) this.#known.delete(id);
    const fresh = items.filter((item) => !this.#known.has(item.id));
    for (const item of fresh) this.#known.add(item.id);
    if (fresh.length === 0 || !this.#pushReady()) return;
    const mobile = this.#options.mobile();
    let changed = false;
    for (const item of fresh) {
      const payload = buildPhonePushPayload({
        agentName: this.#options.agentName(item.botId) ?? "An agent",
        itemId: item.id,
      });
      for (const device of mobile.devices) {
        if (!this.#options.store.device(device.id).push) continue;
        if (!this.#withinRate(device.id)) continue;
        await this.#push(device.id, payload);
        changed = true;
      }
    }
    if (changed) this.#changed();
  }

  async #push(deviceId: string, payload: ReturnType<typeof buildPhonePushPayload>) {
    const store = this.#options.store;
    const subscription = store.device(deviceId).push;
    const keys = store.vapid();
    if (!subscription || !keys) return { ok: false as const, gone: false, reason: PHONE_PUSH_REASONS.noKeys };
    const outcome = await sendWebPush({
      subscription,
      payload: Buffer.from(JSON.stringify(payload), "utf8"),
      privateKeyPem: keys.privateKeyPem,
      publicKey: keys.publicKey,
      post: this.#options.post ?? fetchPushPost,
    });
    if (outcome.ok) store.recordPush(deviceId, { at: new Date(this.#now()).toISOString() });
    else if (outcome.gone) {
      // The phone system says the subscription no longer exists: drop it, keep the reason to show.
      store.setSubscription(deviceId, null);
      store.recordPush(deviceId, { error: outcome.reason });
    } else store.recordPush(deviceId, { error: outcome.reason });
    return outcome;
  }

  #withinRate(deviceId: string): boolean {
    const now = this.#now();
    const recent = (this.#sent.get(deviceId) ?? []).filter((at) => now - at < 60_000);
    if (recent.length >= PUSHES_PER_MINUTE) {
      this.#sent.set(deviceId, recent);
      return false;
    }
    recent.push(now);
    this.#sent.set(deviceId, recent);
    return true;
  }

  // -- small helpers ----------------------------------------------------------------------------------------------

  #only(method: string, expected: string, run: () => void): boolean {
    if (method !== expected) throw new HttpError(405, `Use ${expected}.`);
    run();
    return true;
  }

  #changed(): void {
    this.#options.emit({ type: "phone-access-changed", state: this.getState() });
  }

  #now(): number {
    return (this.#options.now?.() ?? new Date()).getTime();
  }
}
