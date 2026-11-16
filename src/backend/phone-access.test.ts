// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgentEvent,
  type BotSummary,
  isAgentEvent,
  isPhoneAccessState,
  isPhonePushPayload,
  isPhoneSessionState,
  MOBILE_ACCESS_PATHS,
  MOBILE_API_PATHS,
  type PendingAgentRequest,
  PHONE_ACCESS_LIMITS,
  PHONE_PUSH_REASONS,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import { MobileConnect, mobileAgents, mobileNeedsYou } from "./mobile-connect";
import { MobileStore } from "./mobile-store";
import { PhoneAccess } from "./phone-access";
import { PhoneAccessStore } from "./phone-access-store";
import type { PushRequest } from "./web-push";
import { decryptAsPhone, newTestPhone } from "./web-push-test-util";

const roots: string[] = [];
const running: Array<{ close: () => Promise<void> | void }> = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((item) => item.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** A secret box that "encrypts" so that a key can never be found in clear in the file. */
const box = {
  canEncrypt: () => true,
  encrypt: (plain: string) => `enc:${Buffer.from(plain).toString("base64")}`,
  decrypt: (cipher: string) => Buffer.from(cipher.slice(4), "base64").toString(),
};
const noBox = { ...box, canEncrypt: () => false };

function bot(id: string, name: string): BotSummary {
  return {
    id,
    name,
    role: "Research",
    description: "Private instructions that stay on the computer.",
    notifications: true,
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    threadId: null,
    workspacePath: `C:\\work\\${id}`,
    preview: "Last message",
    updatedAt: null,
    avatarSeed: id,
    avatarHue: 150,
    avatarUrl: null,
  };
}

function card(requestId: number, botId = "scout"): PendingAgentRequest {
  return {
    kind: "prompt",
    requestId,
    botId,
    threadId: "t",
    turnId: "u",
    questions: [{ id: "q", header: "Budget", question: "What is the secret budget?", isSecret: false, options: null }],
    createdAt: "2026-11-16T18:00:00.000Z",
  };
}

async function setup(options: { secretBox?: typeof box; pending?: PendingAgentRequest[] } = {}) {
  const root = await mkdtemp(join(tmpdir(), "phone-access-"));
  roots.push(root);
  const events: AgentEvent[] = [];
  const clock = { now: Date.parse("2026-11-16T18:00:00.000Z") };
  const pending = { list: options.pending ?? [] };
  const listeners: Array<(event: AgentEvent) => void> = [];
  const disconnected: string[] = [];
  const posts: PushRequest[] = [];
  const postStatus = { value: 201 };
  const store = new MobileStore(join(root, "mobile.json"));
  const accessStore = new PhoneAccessStore(join(root, "phone-access.json"), options.secretBox ?? box);
  const live: { mobile: MobileConnect | null } = { mobile: null };
  const current = (): MobileConnect => {
    if (!live.mobile) throw new Error("Mobile Connect is not ready.");
    return live.mobile;
  };
  const access = new PhoneAccess({
    store: accessStore,
    mobile: () => current().getState(),
    needsYou: () => mobileNeedsYou(pending.list),
    agentName: (botId) => (botId === "scout" ? "Scout" : null),
    subscribe: (listener) => {
      listeners.push(listener);
      return () => undefined;
    },
    removeDevice: (deviceId) => current().revokeDevice({ deviceId }),
    disconnectDevice: (deviceId) => {
      disconnected.push(deviceId);
    },
    emit: (event) => events.push(event),
    now: () => new Date(clock.now),
    post: async (request) => {
      posts.push(request);
      return { status: postStatus.value };
    },
    scanDelayMs: 0,
  });
  const mobile = new MobileConnect({
    store,
    agents: () => mobileAgents([bot("scout", "Scout")]),
    needsYou: () => mobileNeedsYou(pending.list),
    confirm: async () => "send",
    canAsk: () => true,
    emit: (event) => events.push(event),
    now: () => new Date(clock.now),
    access,
  });
  live.mobile = mobile;
  running.push(mobile, { close: () => access.close() });
  access.start();
  const ticket = await mobile.startPairing({ port: 0 });
  const base = ticket.urls[0] ?? "";
  const paired = await call(base, MOBILE_API_PATHS.pair, {
    method: "POST",
    json: { ticket: ticket.ticket, deviceName: "Pixel 9", platform: "android" },
  });
  const token = isString(paired.body.token) ? paired.body.token : "";
  const deviceId = mobile.getState().devices[0]?.id ?? "";
  const emitCard = () => {
    for (const listener of listeners) listener(JSON.parse('{"type":"prompt"}'));
  };
  return {
    root,
    mobile,
    access,
    accessStore,
    events,
    clock,
    pending,
    base,
    token,
    deviceId,
    disconnected,
    posts,
    postStatus,
    emitCard,
    api: (path: string, init: { method?: string; json?: unknown } = {}) => call(base, path, { ...init, token }),
  };
}

async function call(base: string, path: string, init: { method?: string; json?: unknown; token?: string } = {}) {
  const body = init.json === undefined ? undefined : JSON.stringify(init.json);
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body,
  });
  const json = await response.json();
  return { status: response.status, body: isDynamicRecord(json) ? json : {} };
}

const waitUntil = async (check: () => boolean) => {
  const deadline = Date.now() + 3_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe("the PIN lock (W9-BE1)", () => {
  it("a phone without a PIN is never locked", async () => {
    const t = await setup();
    const session = await t.api(MOBILE_ACCESS_PATHS.session);
    expect(isPhoneSessionState(session.body)).toBe(true);
    expect(session.body).toMatchObject({ pinSet: false, locked: false, attemptsLeft: null, idleLockSeconds: 300 });
    expect((await t.api(MOBILE_API_PATHS.agents)).status).toBe(200);
  });

  it("sets a PIN: kept only as a salted hash, never the PIN, and the phone stays unlocked", async () => {
    const t = await setup();
    const set = await t.api(MOBILE_ACCESS_PATHS.pin, { method: "PUT", json: { pin: "482913" } });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ pinSet: true, locked: false, attemptsLeft: 5 });
    const file = await readFile(join(t.root, "phone-access.json"), "utf8");
    expect(file).not.toContain("482913");
    expect(file).toContain("pinHash");
    expect(file).toContain("pinSalt");
    // Two phones with the same PIN do not share a hash (a new salt each time).
    const other = new PhoneAccessStore(join(t.root, "other.json"));
    other.setPin("a", "482913");
    other.setPin("b", "482913");
    const saved = JSON.parse(await readFile(join(t.root, "other.json"), "utf8"));
    expect(saved.devices.a.pinHash).not.toBe(saved.devices.b.pinHash);
    expect((await t.api(MOBILE_API_PATHS.agents)).status).toBe(200);
  });

  it("refuses a PIN that is not 4 to 8 digits", async () => {
    const t = await setup();
    for (const pin of ["123", "123456789", "12ab", "", 1234]) {
      expect((await t.api(MOBILE_ACCESS_PATHS.pin, { method: "PUT", json: { pin } })).status).toBe(400);
    }
    expect((await t.api(MOBILE_ACCESS_PATHS.session)).body).toMatchObject({ pinSet: false });
  });

  it("locks on request: every other call answers 423, the lock screen's own calls still work, streams end", async () => {
    const t = await setup();
    await t.api(MOBILE_ACCESS_PATHS.pin, { method: "PUT", json: { pin: "1234" } });
    const locked = await t.api(MOBILE_ACCESS_PATHS.lock, { method: "POST" });
    expect(locked.body).toMatchObject({ pinSet: true, locked: true });
    expect(t.disconnected).toContain(t.deviceId);
    for (const path of [MOBILE_API_PATHS.agents, MOBILE_API_PATHS.needsYou, MOBILE_API_PATHS.me, "/v1/threads"]) {
      const refused = await t.api(path);
      expect(refused.status).toBe(423);
      expect(JSON.stringify(refused.body)).not.toMatch(/Scout|Budget/);
    }
    expect((await t.api(MOBILE_ACCESS_PATHS.session)).status).toBe(200);
    expect((await t.api(MOBILE_ACCESS_PATHS.pin, { method: "PUT", json: { pin: "9999" } })).status).toBe(423);
  });

  it("unlocks with the right PIN and counts the wrong ones", async () => {
    const t = await setup();
    await t.api(MOBILE_ACCESS_PATHS.pin, { method: "PUT", json: { pin: "1234" } });
    await t.api(MOBILE_ACCESS_PATHS.lock, { method: "POST" });
    const wrong = await t.api(MOBILE_ACCESS_PATHS.pinUnlock, { method: "POST", json: { pin: "0000" } });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toMatchObject({ code: "wrong-pin", attemptsLeft: 4 });
    expect((await t.api(MOBILE_ACCESS_PATHS.session)).body).toMatchObject({ locked: true, attemptsLeft: 4 });
    const right = await t.api(MOBILE_ACCESS_PATHS.pinUnlock, { method: "POST", json: { pin: "1234" } });
    expect(right).toMatchObject({ status: 200, body: { ok: true } });
    expect((await t.api(MOBILE_API_PATHS.agents)).status).toBe(200);
    // A right PIN starts the count again.
    expect((await t.api(MOBILE_ACCESS_PATHS.session)).body).toMatchObject({ locked: false, attemptsLeft: 5 });
  });

  it("the 5th wrong PIN removes the phone: its token stops working and what is kept about it is dropped", async () => {
    const t = await setup();
    await t.api(MOBILE_ACCESS_PATHS.pin, { method: "PUT", json: { pin: "1234" } });
    await t.api(MOBILE_ACCESS_PATHS.lock, { method: "POST" });
    let last: Awaited<ReturnType<typeof call>> = { status: 0, body: {} };
    for (let attempt = 1; attempt <= PHONE_ACCESS_LIMITS.pinAttempts; attempt += 1) {
      last = await t.api(MOBILE_ACCESS_PATHS.pinUnlock, { method: "POST", json: { pin: "0000" } });
      if (attempt < PHONE_ACCESS_LIMITS.pinAttempts) expect(last.body).toMatchObject({ code: "wrong-pin" });
    }
    expect(last.status).toBe(401);
    expect(last.body).toMatchObject({ code: "removed", attemptsLeft: 0 });
    expect(t.mobile.getState().devices).toEqual([]);
    expect((await t.api(MOBILE_API_PATHS.me)).status).toBe(401);
    expect(t.accessStore.device(t.deviceId).pinSet).toBe(false);
    expect(JSON.parse(await readFile(join(t.root, "phone-access.json"), "utf8")).devices).toEqual({});
  });

  it("the wrong-PIN count survives a restart of the program (no fresh tries)", async () => {
    const t = await setup();
    await t.api(MOBILE_ACCESS_PATHS.pin, { method: "PUT", json: { pin: "1234" } });
    await t.api(MOBILE_ACCESS_PATHS.lock, { method: "POST" });
    await t.api(MOBILE_ACCESS_PATHS.pinUnlock, { method: "POST", json: { pin: "0000" } });
    await t.api(MOBILE_ACCESS_PATHS.pinUnlock, { method: "POST", json: { pin: "1111" } });
    const reopened = new PhoneAccessStore(join(t.root, "phone-access.json"), box);
    expect(reopened.attemptsLeft(t.deviceId)).toBe(3);
  });

  it("locks after 5 minutes without a request; a request before that keeps it open", async () => {
    const t = await setup();
    await t.api(MOBILE_ACCESS_PATHS.pin, { method: "PUT", json: { pin: "1234" } });
    t.clock.now += 4 * 60_000;
    expect((await t.api(MOBILE_API_PATHS.agents)).status).toBe(200);
    t.clock.now += 4 * 60_000;
    expect((await t.api(MOBILE_API_PATHS.agents)).status).toBe(200);
    t.clock.now += PHONE_ACCESS_LIMITS.idleLockMs + 1_000;
    expect((await t.api(MOBILE_API_PATHS.agents)).status).toBe(423);
    expect((await t.api(MOBILE_ACCESS_PATHS.session)).body).toMatchObject({ locked: true });
  });

  it("the idle sweep locks a quiet phone and ends its streams without any request", async () => {
    const t = await setup();
    await t.api(MOBILE_ACCESS_PATHS.pin, { method: "PUT", json: { pin: "1234" } });
    t.disconnected.length = 0;
    t.access.sweep();
    expect(t.disconnected).toEqual([]);
    t.clock.now += PHONE_ACCESS_LIMITS.idleLockMs + 1_000;
    t.access.sweep();
    expect(t.disconnected).toEqual([t.deviceId]);
    expect(t.access.getState().devices[0]).toMatchObject({ pinSet: true, locked: true });
  });

  it("a phone with a PIN starts locked after the program restarts", async () => {
    const t = await setup();
    await t.api(MOBILE_ACCESS_PATHS.pin, { method: "PUT", json: { pin: "1234" } });
    const restarted = new PhoneAccess({
      store: new PhoneAccessStore(join(t.root, "phone-access.json"), box),
      mobile: () => t.mobile.getState(),
      needsYou: () => [],
      agentName: () => null,
      subscribe: () => () => undefined,
      removeDevice: async () => undefined,
      disconnectDevice: () => undefined,
      emit: () => undefined,
    });
    expect(restarted.getState().devices[0]).toMatchObject({ pinSet: true, locked: true });
  });

  it("changing or removing a PIN needs the current one, even on an unlocked phone", async () => {
    const t = await setup();
    await t.api(MOBILE_ACCESS_PATHS.pin, { method: "PUT", json: { pin: "1234" } });
    const noCurrent = await t.api(MOBILE_ACCESS_PATHS.pin, { method: "PUT", json: { pin: "5678" } });
    expect(noCurrent.status).toBe(400);
    const wrong = await t.api(MOBILE_ACCESS_PATHS.pin, { method: "PUT", json: { pin: "5678", currentPin: "0000" } });
    expect(wrong).toMatchObject({ status: 401, body: { code: "wrong-pin", attemptsLeft: 4 } });
    const changed = await t.api(MOBILE_ACCESS_PATHS.pin, { method: "PUT", json: { pin: "5678", currentPin: "1234" } });
    expect(changed.status).toBe(200);
    await t.api(MOBILE_ACCESS_PATHS.lock, { method: "POST" });
    expect((await t.api(MOBILE_ACCESS_PATHS.pinUnlock, { method: "POST", json: { pin: "1234" } })).status).toBe(401);
    expect((await t.api(MOBILE_ACCESS_PATHS.pinUnlock, { method: "POST", json: { pin: "5678" } })).status).toBe(200);
    expect((await t.api(MOBILE_ACCESS_PATHS.pin, { method: "DELETE", json: { pin: "0000" } })).status).toBe(401);
    const removed = await t.api(MOBILE_ACCESS_PATHS.pin, { method: "DELETE", json: { pin: "5678" } });
    expect(removed.body).toMatchObject({ pinSet: false, locked: false });
    expect((await t.api(MOBILE_API_PATHS.agents)).status).toBe(200);
  });

  it("revoking a phone on the computer drops its PIN record", async () => {
    const t = await setup();
    await t.api(MOBILE_ACCESS_PATHS.pin, { method: "PUT", json: { pin: "1234" } });
    await t.mobile.revokeDevice({ deviceId: t.deviceId });
    expect(JSON.parse(await readFile(join(t.root, "phone-access.json"), "utf8")).devices).toEqual({});
  });

  it("the other phone paths refuse the wrong method and need the token", async () => {
    const t = await setup();
    expect((await t.api(MOBILE_ACCESS_PATHS.session, { method: "POST" })).status).toBe(405);
    expect((await t.api(MOBILE_ACCESS_PATHS.pinUnlock)).status).toBe(405);
    for (const path of Object.values(MOBILE_ACCESS_PATHS)) {
      expect((await call(t.base, path)).status).toBe(401);
    }
  });
});

describe("Web Push for Needs you (W9-BE1)", () => {
  const subscribePhone = async (t: Awaited<ReturnType<typeof setup>>) => {
    const phone = newTestPhone();
    t.access.setPushEnabled(true);
    const response = await t.api(MOBILE_ACCESS_PATHS.pushSubscription, {
      method: "PUT",
      json: { subscription: phone.subscription },
    });
    expect(response.status).toBe(200);
    return phone;
  };

  it("is off by default: no key, no subscription, no push", async () => {
    const t = await setup();
    expect(t.access.getState().push).toMatchObject({ enabled: false, publicKey: null, unavailableReason: null });
    expect((await t.api(MOBILE_ACCESS_PATHS.pushKey)).status).toBe(409);
    const refused = await t.api(MOBILE_ACCESS_PATHS.pushSubscription, {
      method: "PUT",
      json: { subscription: newTestPhone().subscription },
    });
    expect(refused.status).toBe(409);
    t.pending.list = [card(1)];
    t.emitCard();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(t.posts).toEqual([]);
  });

  it("turning it on makes the keys once; the phone gets only the public key, the private one is encrypted at rest", async () => {
    const t = await setup();
    const state = t.access.setPushEnabled(true);
    expect(state.push).toMatchObject({ enabled: true, keysReady: true, unavailableReason: PHONE_PUSH_REASONS.noPhone });
    const key = await t.api(MOBILE_ACCESS_PATHS.pushKey);
    expect(key.status).toBe(200);
    expect(key.body.publicKey).toBe(state.push.publicKey);
    expect(String(key.body.publicKey)).toHaveLength(87); // 65 bytes as base64url
    const file = await readFile(join(t.root, "phone-access.json"), "utf8");
    expect(file).not.toContain("PRIVATE KEY");
    expect(file).toContain("privateCipher");
    expect(JSON.stringify(key.body)).not.toMatch(/PRIVATE|privateCipher/);
    // The same key after the keys exist (not a new pair each call).
    t.access.setPushEnabled(false);
    t.access.setPushEnabled(true);
    expect((await t.api(MOBILE_ACCESS_PATHS.pushKey)).body.publicKey).toBe(key.body.publicKey);
  });

  it("a computer that cannot keep a secret key safe has no push, and says so", async () => {
    const t = await setup({ secretBox: noBox });
    const state = t.access.setPushEnabled(true);
    expect(state.push).toMatchObject({ enabled: true, keysReady: false, publicKey: null });
    expect(state.push.unavailableReason).toBe(PHONE_PUSH_REASONS.noKeys);
    expect((await t.api(MOBILE_ACCESS_PATHS.pushKey)).status).toBe(503);
    expect(await readFile(join(t.root, "phone-access.json"), "utf8")).not.toContain("PRIVATE KEY");
  });

  it("refuses a subscription that is not https or has bad keys", async () => {
    const t = await setup();
    t.access.setPushEnabled(true);
    const phone = newTestPhone();
    const http = { ...phone.subscription, endpoint: "http://push.example.test/x" };
    expect(
      (await t.api(MOBILE_ACCESS_PATHS.pushSubscription, { method: "PUT", json: { subscription: http } })).status,
    ).toBe(400);
    const badKeys = { ...phone.subscription, keys: { p256dh: "x y", auth: "a" } };
    expect(
      (await t.api(MOBILE_ACCESS_PATHS.pushSubscription, { method: "PUT", json: { subscription: badKeys } })).status,
    ).toBe(400);
  });

  it("a NEW card sends one encrypted notification with only the agent's name and the card id", async () => {
    const t = await setup();
    const phone = await subscribePhone(t);
    t.pending.list = [card(7)];
    t.emitCard();
    await waitUntil(() => t.posts.length === 1);
    const sent = t.posts[0];
    expect(sent?.url).toBe(phone.subscription.endpoint);
    expect(sent?.headers.authorization).toMatch(/^vapid t=.+, k=.+$/);
    expect(sent?.headers["content-encoding"]).toBe("aes128gcm");
    const text = decryptAsPhone(sent?.body ?? Buffer.alloc(0), phone).toString();
    const payload = JSON.parse(text);
    expect(isPhonePushPayload(payload)).toBe(true);
    expect(payload).toEqual({ v: 1, kind: "needs-you", agentName: "Scout", itemId: "7" });
    // No question text, no model, no path: nothing that could be a secret.
    expect(text).not.toMatch(/budget|secret|gpt|work/i);
    expect(sent?.body.toString("utf8")).not.toContain("Scout");
    expect(t.accessStore.device(t.deviceId).lastPushAt).not.toBeNull();
  });

  it("announces a card once; cards already waiting at start are not announced; a card that went away and came back is", async () => {
    const t = await setup({ pending: [card(1)] });
    await subscribePhone(t);
    t.emitCard();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(t.posts).toHaveLength(0); // card 1 was waiting when the program started
    t.pending.list = [card(1), card(2)];
    t.emitCard();
    await waitUntil(() => t.posts.length === 1);
    t.emitCard();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(t.posts).toHaveLength(1);
    t.pending.list = [];
    t.emitCard();
    await new Promise((resolve) => setTimeout(resolve, 30));
    t.pending.list = [card(2)];
    t.emitCard();
    await waitUntil(() => t.posts.length === 2);
  });

  it("a locked phone still gets the notification (it only says that an agent waits)", async () => {
    const t = await setup();
    const phone = await subscribePhone(t);
    await t.api(MOBILE_ACCESS_PATHS.pin, { method: "PUT", json: { pin: "1234" } });
    await t.api(MOBILE_ACCESS_PATHS.lock, { method: "POST" });
    t.pending.list = [card(3, "unknown-bot")];
    t.emitCard();
    await waitUntil(() => t.posts.length === 1);
    const payload = JSON.parse(decryptAsPhone(t.posts[0]?.body ?? Buffer.alloc(0), phone).toString());
    expect(payload.agentName).toBe("An agent");
  });

  it("drops a subscription the phone system says is gone, and keeps the reason", async () => {
    const t = await setup();
    await subscribePhone(t);
    t.postStatus.value = 410;
    t.pending.list = [card(9)];
    t.emitCard();
    await waitUntil(() => t.posts.length === 1);
    await waitUntil(() => t.accessStore.device(t.deviceId).push === null);
    expect(t.accessStore.device(t.deviceId).pushError).toBe("The phone removed its subscription.");
    expect(t.access.getState().devices[0]).toMatchObject({
      pushSubscribed: false,
      pushError: "The phone removed its subscription.",
    });
  });

  it("a failing push service keeps the subscription and says why", async () => {
    const t = await setup();
    await subscribePhone(t);
    t.postStatus.value = 500;
    t.pending.list = [card(9)];
    t.emitCard();
    await waitUntil(() => t.posts.length === 1);
    await waitUntil(() => t.accessStore.device(t.deviceId).pushError !== null);
    expect(t.accessStore.device(t.deviceId).push).not.toBeNull();
    expect(t.accessStore.device(t.deviceId).pushError).toMatch(/answered 500/);
  });

  it("sends at most 10 notifications a minute to one phone", async () => {
    const t = await setup();
    await subscribePhone(t);
    t.pending.list = Array.from({ length: 14 }, (_, index) => card(100 + index));
    t.emitCard();
    await waitUntil(() => t.posts.length === 10);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(t.posts).toHaveLength(10);
  });

  it("turning push off stops it; removing the subscription too", async () => {
    const t = await setup();
    await subscribePhone(t);
    t.access.setPushEnabled(false);
    t.pending.list = [card(5)];
    t.emitCard();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(t.posts).toHaveLength(0);
    t.access.setPushEnabled(true);
    const removed = await t.api(MOBILE_ACCESS_PATHS.pushSubscription, { method: "DELETE" });
    expect(removed.body).toMatchObject({ push: { subscribed: false } });
    t.pending.list = [card(5), card(6)];
    t.emitCard();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(t.posts).toHaveLength(0);
  });

  it("a test notification says why it was not sent, and when sent says it is a test", async () => {
    const t = await setup();
    expect(await t.access.sendTestPush("nope")).toEqual({ sent: false, reason: "This phone is not paired." });
    expect(await t.access.sendTestPush(t.deviceId)).toEqual({ sent: false, reason: PHONE_PUSH_REASONS.off });
    t.access.setPushEnabled(true);
    expect((await t.access.sendTestPush(t.deviceId)).reason).toMatch(/not allowed notifications/);
    const phone = await subscribePhone(t);
    expect(await t.access.sendTestPush(t.deviceId)).toEqual({ sent: true, reason: null });
    const payload = JSON.parse(decryptAsPhone(t.posts[0]?.body ?? Buffer.alloc(0), phone).toString());
    expect(payload).toMatchObject({ test: true, itemId: "test" });
    t.postStatus.value = 500;
    expect(await t.access.sendTestPush(t.deviceId)).toEqual({ sent: false, reason: "The push service answered 500." });
  });
});

describe("what the window sees (W9-BE1)", () => {
  it("is a valid state with no PIN, hash or key in it, and each change comes as an event", async () => {
    const t = await setup();
    t.access.setPushEnabled(true);
    await t.api(MOBILE_ACCESS_PATHS.pin, { method: "PUT", json: { pin: "246810" } });
    const state = t.access.getState();
    expect(isPhoneAccessState(state)).toBe(true);
    expect(state.reach).toBe("this-computer");
    expect(state.certificate).toBe("self-signed");
    expect(state.devices).toEqual([
      expect.objectContaining({ name: "Pixel 9", pinSet: true, locked: false, pushSubscribed: false }),
    ]);
    const text = JSON.stringify(state);
    expect(text).not.toMatch(/246810|pinHash|pinSalt|PRIVATE|privateCipher|scrypt/);
    const changes = t.events.filter((event) => event.type === "phone-access-changed");
    expect(changes.length).toBeGreaterThanOrEqual(2);
    expect(changes.every(isAgentEvent)).toBe(true);
  });
});
