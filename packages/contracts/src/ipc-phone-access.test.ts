import { describe, expect, it } from "vitest";
import { isAgentEvent } from "./ipc-conversation";
import { MOBILE_COMPUTER_ONLY, MOBILE_PHONE_PATHS } from "./ipc-mobile";
import {
  buildPhonePushPayload,
  isPhoneAccessChanged,
  isPhoneAccessState,
  isPhonePushPayload,
  isPhoneSessionState,
  isPhoneTailscaleGuide,
  isPushEndpoint,
  isTailscaleHost,
  isValidPin,
  MOBILE_ACCESS_PATHS,
  PHONE_ACCESS_LIMITS,
  PHONE_PUSH_REASONS,
  PHONE_TAILSCALE_GUIDE,
  parsePhonePushSubscription,
  parsePhonePushTestInput,
  parseSetPhonePushInput,
  phonePushText,
  phonePushUnavailableReason,
  phoneReachOf,
  tailscaleUrlsOf,
} from "./ipc-phone-access";

const state = {
  enabled: true,
  exposure: "lan" as const,
  reach: "tailscale" as const,
  tailscaleUrls: ["https://100.101.102.103:47930"],
  fingerprint: "AB:CD",
  certificate: "self-signed" as const,
  push: { enabled: true, keysReady: true, publicKey: "BKey", unavailableReason: null, subscriptions: 1 },
  devices: [
    {
      deviceId: "d1",
      name: "Pixel",
      pinSet: true,
      locked: true,
      pushSubscribed: true,
      pushError: null,
      lastPushAt: null,
    },
  ],
};

describe("phone access contract (W9-BE1)", () => {
  it("knows a Tailscale address: 100.64.0.0/10 and *.ts.net, nothing else", () => {
    for (const host of ["100.64.0.1", "100.101.102.103", "100.127.255.254", "host.tail1234.ts.net", "HOST.TS.NET"]) {
      expect(isTailscaleHost(host)).toBe(true);
    }
    for (const host of [
      "100.63.0.1",
      "100.128.0.1",
      "10.0.0.1",
      "192.168.1.20",
      "example.com",
      "ts.net.example.com",
      "127.0.0.1",
    ]) {
      expect(isTailscaleHost(host)).toBe(false);
    }
    expect(tailscaleUrlsOf(["https://192.168.1.20:47930", "https://100.90.1.2:47930", "not a url"])).toEqual([
      "https://100.90.1.2:47930",
    ]);
  });

  it("the reach follows Mobile Connect: off, this computer, local network, tailscale", () => {
    expect(phoneReachOf(false, "lan", ["https://100.90.1.2:1"])).toBe("off");
    expect(phoneReachOf(true, "loopback", ["https://127.0.0.1:1"])).toBe("this-computer");
    expect(phoneReachOf(true, "lan", ["https://192.168.1.20:1"])).toBe("local-network");
    expect(phoneReachOf(true, "lan", ["https://192.168.1.20:1", "https://100.90.1.2:1"])).toBe("tailscale");
  });

  it("a PIN is 4 to 8 digits and nothing else", () => {
    for (const pin of ["1234", "12345678", "000000"]) expect(isValidPin(pin)).toBe(true);
    for (const pin of ["123", "123456789", "12a4", " 1234", "", 1234, null]) expect(isValidPin(pin)).toBe(false);
    expect(PHONE_ACCESS_LIMITS.pinAttempts).toBe(5);
    expect(PHONE_ACCESS_LIMITS.idleLockMs).toBe(300_000);
  });

  it("the notification says only that an agent waits, and carries no card text", () => {
    const payload = buildPhonePushPayload({ agentName: "  Chief\n of   staff ", itemId: "card-1" });
    expect(isPhonePushPayload(payload)).toBe(true);
    expect(payload.agentName).toBe("Chief of staff");
    expect(phonePushText(payload)).toBe("Chief of staff is waiting for you");
    expect(Object.keys(payload).sort()).toEqual(["agentName", "itemId", "kind", "v"]);
    expect(buildPhonePushPayload({ agentName: "   ", itemId: "x" }).agentName).toBe("An agent");
    expect(buildPhonePushPayload({ agentName: "a".repeat(500), itemId: "x" }).agentName).toHaveLength(64);
    expect(isPhonePushPayload({ ...payload, question: "What is the password?" })).toBe(true); // extra keys are never sent
    expect(isPhonePushPayload({ ...payload, v: 2 })).toBe(false);
    const test = buildPhonePushPayload({ agentName: "Test", itemId: "test", test: true });
    expect(test).toMatchObject({ test: true });
    expect(isPhonePushPayload(test)).toBe(true);
    expect(isPhonePushPayload({ ...payload, test: false })).toBe(false);
    expect(phonePushText(test)).toBe("This is a test notification from your computer");
  });

  it("a push subscription needs an https endpoint and base64url keys", () => {
    const good = { endpoint: "https://push.example.test/abc", keys: { p256dh: "BKey_-1", auth: "abc_-9" } };
    expect(parsePhonePushSubscription(good)).toEqual(good);
    expect(parsePhonePushSubscription({ subscription: good })).toEqual(good);
    expect(isPushEndpoint("http://push.example.test/abc")).toBe(false);
    expect(() => parsePhonePushSubscription({ ...good, endpoint: "http://push.example.test/abc" })).toThrow(
      /malformed/,
    );
    expect(() => parsePhonePushSubscription({ ...good, keys: { p256dh: "bad key!", auth: "a" } })).toThrow(/keys/);
    expect(() => parsePhonePushSubscription(null)).toThrow(/malformed/);
  });

  it("explains why push does not work, in plain words", () => {
    expect(phonePushUnavailableReason({ enabled: false, keysReady: false, subscriptions: 0 })).toBeNull();
    expect(phonePushUnavailableReason({ enabled: true, keysReady: false, subscriptions: 2 })).toBe(
      PHONE_PUSH_REASONS.noKeys,
    );
    expect(phonePushUnavailableReason({ enabled: true, keysReady: true, subscriptions: 0 })).toBe(
      PHONE_PUSH_REASONS.noPhone,
    );
    expect(phonePushUnavailableReason({ enabled: true, keysReady: true, subscriptions: 1 })).toBeNull();
  });

  it("validates the state, the session, the guide and the event", () => {
    expect(isPhoneAccessState(state)).toBe(true);
    expect(isPhoneAccessState({ ...state, certificate: "network" })).toBe(false);
    expect(isPhoneAccessState({ ...state, reach: "cloud" })).toBe(false);
    expect(isPhoneAccessChanged({ type: "phone-access-changed", state })).toBe(true);
    expect(isAgentEvent({ type: "phone-access-changed", state })).toBe(true);
    expect(isAgentEvent({ type: "phone-access-changed", state: { enabled: true } })).toBe(false);
    expect(
      isPhoneSessionState({
        pinSet: true,
        locked: true,
        attemptsLeft: 5,
        idleLockSeconds: 300,
        push: { available: true, subscribed: false },
      }),
    ).toBe(true);
    expect(isPhoneTailscaleGuide(PHONE_TAILSCALE_GUIDE)).toBe(true);
    expect(PHONE_TAILSCALE_GUIDE.steps.join(" ")).toMatch(/Tailscale/);
  });

  it("parses the window requests strictly", () => {
    expect(parseSetPhonePushInput({ enabled: true })).toEqual({ enabled: true });
    expect(() => parseSetPhonePushInput({ enabled: "yes" })).toThrow(/true or false/);
    expect(parsePhonePushTestInput({ deviceId: "d1" })).toEqual({ deviceId: "d1" });
    expect(() => parsePhonePushTestInput({})).toThrow(/not named/);
  });

  it("the new phone paths stay clear of what a phone may never reach", () => {
    for (const path of Object.values(MOBILE_ACCESS_PATHS)) {
      expect(path.startsWith("/v1/")).toBe(true);
      const first = path.split("/")[2] ?? "";
      expect(MOBILE_COMPUTER_ONLY).not.toContain(first);
      expect(Object.values(MOBILE_PHONE_PATHS)).not.toContain(path);
    }
  });
});
