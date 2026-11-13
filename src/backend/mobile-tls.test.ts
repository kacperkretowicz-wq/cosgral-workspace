// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type DraftPreviewResolution,
  formatMobileFingerprint,
  MOBILE_API_PATHS,
  MOBILE_PLAIN_TRANSPORT_WARNING,
  MOBILE_TRANSPORT_WARNING,
  parseMobilePairingPayload,
} from "@openbot/contracts/ipc";
import { isString } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import { MobileConnect } from "./mobile-connect";
import { MobileStore } from "./mobile-store";
import { pinnedJson } from "./testing/pinned-https";
import type { SecretBox } from "./vault-store";

const box: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => `box:${Buffer.from(plain, "utf8").toString("base64")}`,
  decrypt: (cipher) => Buffer.from(cipher.slice(4), "base64").toString("utf8"),
};

const roots: string[] = [];
const running: MobileConnect[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((mobile) => mobile.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup(options: { root?: string; secretBox?: SecretBox | null; now?: () => Date } = {}) {
  const root = options.root ?? (await mkdtemp(join(tmpdir(), "mobile-tls-")));
  if (!options.root) roots.push(root);
  const cards: string[] = [];
  const decision: { value: DraftPreviewResolution } = { value: "send" };
  const mobile = new MobileConnect({
    store: new MobileStore(
      join(root, "mobile.json"),
      options.secretBox === null ? undefined : (options.secretBox ?? box),
    ),
    agents: () => [{ id: "scout", name: "Scout", role: "", avatarHue: null, model: "m" }],
    needsYou: () => [],
    confirm: async (input) => {
      cards.push(input.preview);
      return decision.value;
    },
    canAsk: () => true,
    emit: () => undefined,
    now: options.now,
  });
  running.push(mobile);
  return { root, mobile, cards, decision };
}

async function pair(mobile: MobileConnect) {
  const ticket = await mobile.startPairing({ port: 0 });
  const fingerprint = ticket.fingerprint ?? "";
  const base = ticket.urls[0] ?? "";
  const paired = await pinnedJson(`${base}${MOBILE_API_PATHS.pair}`, fingerprint, {
    method: "POST",
    body: { ticket: ticket.ticket, deviceName: "Phone" },
  });
  return {
    ticket,
    fingerprint,
    base,
    token: isString(paired.body.token) ? paired.body.token : "",
    status: paired.status,
  };
}

describe("Mobile Connect over TLS", () => {
  it("serves HTTPS with its own certificate and puts the fingerprint into the QR code and the state", async () => {
    const { mobile, cards } = await setup();
    const { ticket, fingerprint, base, token, status } = await pair(mobile);
    expect(status).toBe(200);
    expect(base).toMatch(/^https:\/\/127\.0\.0\.1:\d+$/);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(ticket.appUrl).toBe(`${base}/app/`);
    expect(parseMobilePairingPayload(ticket.qrPayload)).toMatchObject({ ticket: ticket.ticket, fingerprint });
    const state = await mobile.getState();
    expect(state).toMatchObject({
      transport: "tls",
      unencrypted: false,
      fingerprint: formatMobileFingerprint(fingerprint),
    });
    expect(cards[0]).toContain(MOBILE_TRANSPORT_WARNING);
    expect((await pinnedJson(`${base}${MOBILE_API_PATHS.agents}`, fingerprint, { token })).status).toBe(200);
    // A client that pinned another certificate refuses before it sends anything.
    await expect(pinnedJson(`${base}${MOBILE_API_PATHS.agents}`, "0".repeat(64), { token })).rejects.toThrow("pinned");
  });

  it("keeps the private key encrypted and the same certificate after a restart", async () => {
    const first = await setup();
    const { fingerprint, token } = await pair(first.mobile);
    await first.mobile.close();
    const saved = await readFile(join(first.root, "mobile.json"), "utf8");
    expect(saved).toContain("BEGIN CERTIFICATE");
    expect(saved).not.toContain("PRIVATE KEY");
    expect(saved).toContain("keyCipher");

    const second = await setup({ root: first.root });
    await second.mobile.resume();
    const state = await second.mobile.getState();
    expect(state.fingerprint).toBe(formatMobileFingerprint(fingerprint));
    const base = state.urls[0] ?? "";
    expect((await pinnedJson(`${base}${MOBILE_API_PATHS.agents}`, fingerprint, { token })).status).toBe(200);
  });

  it("rotates the certificate and removes every paired phone, because they pinned the old one", async () => {
    const { mobile } = await setup();
    const { fingerprint, token } = await pair(mobile);
    const rotated = await mobile.rotateCertificate();
    expect(rotated.fingerprint).not.toBe(formatMobileFingerprint(fingerprint));
    expect(rotated.devices).toEqual([]);
    const base = rotated.urls[0] ?? "";
    await expect(pinnedJson(`${base}${MOBILE_API_PATHS.agents}`, fingerprint, { token })).rejects.toThrow("pinned");
    const newPin = (rotated.fingerprint ?? "").replace(/:/g, "").toLowerCase();
    expect((await pinnedJson(`${base}${MOBILE_API_PATHS.agents}`, newPin, { token })).status).toBe(401);
  });

  it("makes a new certificate when the old one expired, and removes the phones that pinned it", async () => {
    const clock = { now: Date.parse("2026-11-13T20:00:00.000Z") };
    const first = await setup({ now: () => new Date(clock.now) });
    const { fingerprint } = await pair(first.mobile);
    await first.mobile.close();
    clock.now += 731 * 86_400_000;
    const second = await setup({ root: first.root, now: () => new Date(clock.now) });
    await second.mobile.resume();
    const state = await second.mobile.getState();
    expect(state.transport).toBe("tls");
    expect(state.fingerprint).not.toBe(formatMobileFingerprint(fingerprint));
    expect(state.devices).toEqual([]);
  });

  it("without a way to keep the key safe, stays plain on loopback and refuses the local network", async () => {
    const { mobile, cards } = await setup({ secretBox: null });
    await expect(mobile.startPairing({ port: 0, exposure: "lan" })).rejects.toThrow("needs an encrypted connection");
    const ticket = await mobile.startPairing({ port: 0 });
    expect(ticket.urls[0]).toMatch(/^http:\/\/127\.0\.0\.1:/);
    expect(ticket.fingerprint).toBeNull();
    expect(await mobile.getState()).toMatchObject({ transport: "plain", unencrypted: true, fingerprint: null });
    await expect(mobile.rotateCertificate()).rejects.toThrow();
    await fetch(`${ticket.urls[0]}${MOBILE_API_PATHS.pair}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket: ticket.ticket, deviceName: "Phone" }),
    });
    expect(cards[0]).toContain(MOBILE_PLAIN_TRANSPORT_WARNING);
  });
});
