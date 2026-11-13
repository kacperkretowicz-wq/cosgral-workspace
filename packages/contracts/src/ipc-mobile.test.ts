import { describe, expect, it } from "vitest";
import {
  buildMobilePairingPayload,
  IPC_CHANNELS,
  isAgentEvent,
  isMobileDevice,
  isMobilePairingTicket,
  isMobileState,
  MOBILE_LIMITS,
  MOBILE_PROTOCOL_VERSION,
  parseMobilePairingPayload,
} from "./ipc";

const AT = "2026-11-13T18:00:00.000Z";
const device = {
  id: "dev-1",
  name: "Pixel",
  platform: "android",
  pairedAt: AT,
  lastSeenAt: null,
  lastAddress: "192.168.1.20",
};
const state = {
  enabled: true,
  exposure: "lan",
  port: 47_930,
  urls: ["http://127.0.0.1:47930", "http://192.168.1.10:47930"],
  transport: "plain",
  fingerprint: null,
  unencrypted: true,
  pairing: { expiresAt: AT, attemptsLeft: 5, consentPending: false },
  devices: [device],
  unavailableReason: null,
};
const TICKET = "Abcdefghijklmnopqrstuv";

describe("W3 mobile contract", () => {
  it("accepts the state, devices and a pairing ticket", () => {
    expect(isMobileState(state)).toBe(true);
    expect(isMobileState({ ...state, exposure: "internet" })).toBe(false);
    expect(isMobileState({ ...state, unencrypted: "no" })).toBe(false);
    expect(isMobileState({ ...state, pairing: null, port: null, enabled: false })).toBe(true);
    expect(isMobileDevice(device)).toBe(true);
    expect(isMobileDevice({ ...device, tokenHash: "x", id: 1 })).toBe(false);
    const payload = buildMobilePairingPayload({ ticket: TICKET, urls: state.urls });
    expect(
      isMobilePairingTicket({
        ticket: TICKET,
        qrPayload: payload,
        qrSvg: "<svg/>",
        qrDataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
        urls: state.urls,
        appUrl: "http://127.0.0.1:47930/app/",
        fingerprint: null,
        expiresAt: AT,
        state,
      }),
    ).toBe(true);
  });

  it("puts the addresses and the ticket into one QR text and reads them back", () => {
    const payload = buildMobilePairingPayload({ ticket: TICKET, urls: state.urls });
    expect(payload.startsWith(`cosgral://pair?v=${MOBILE_PROTOCOL_VERSION}&t=${TICKET}`)).toBe(true);
    expect(parseMobilePairingPayload(payload)).toEqual({
      protocol: MOBILE_PROTOCOL_VERSION,
      ticket: TICKET,
      urls: state.urls,
      fingerprint: null,
    });
    expect(() => parseMobilePairingPayload("https://example.com")).toThrow("not a COSGRAL pairing code");
    expect(() =>
      parseMobilePairingPayload(`cosgral://pair?v=1&t=short&u=${encodeURIComponent(state.urls[0] ?? "")}`),
    ).toThrow("ticket");
    expect(() =>
      parseMobilePairingPayload(`cosgral://pair?v=1&t=${TICKET}&u=${encodeURIComponent("ftp://x")}`),
    ).toThrow("address");
    expect(() => parseMobilePairingPayload(`cosgral://pair?v=1&t=${TICKET}`)).toThrow("address");
  });

  it("keeps the ticket short-lived and the attempts limited", () => {
    expect(MOBILE_LIMITS.ticketTtlMs).toBeLessThanOrEqual(5 * 60_000);
    expect(MOBILE_LIMITS.ticketAttempts).toBeGreaterThan(0);
    expect(MOBILE_LIMITS.ticketAttempts).toBeLessThanOrEqual(10);
  });

  it("adds IPC channels and the mobile events", () => {
    expect(IPC_CHANNELS.mobileGetState).toBe("mobile:get-state");
    expect(IPC_CHANNELS.mobileStartPairing).toBe("mobile:start-pairing");
    expect(IPC_CHANNELS.mobileRevokeDevice).toBe("mobile:revoke-device");
    expect(isAgentEvent({ type: "mobile-changed", state })).toBe(true);
    expect(isAgentEvent({ type: "mobile-pairing-completed", device })).toBe(true);
    expect(isAgentEvent({ type: "mobile-pairing-completed", device: { id: "x" } })).toBe(false);
  });
});
