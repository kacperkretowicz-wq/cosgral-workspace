import { describe, expect, it } from "vitest";
import {
  buildMobilePairingPayload,
  buildMobileWebPairingUrl,
  formatMobileFingerprint,
  IPC_CHANNELS,
  isMobileState,
  MOBILE_PLAIN_TRANSPORT_WARNING,
  MOBILE_TRANSPORT_WARNING,
  mobileFingerprintMatches,
  parseMobilePairingPayload,
} from "./ipc";

const TICKET = "Abcdefghijklmnopqrstuv";
const FINGERPRINT = "a1".repeat(32);
const URLS = ["https://127.0.0.1:47930", "https://192.168.1.10:47930"];

describe("W3 mobile TLS contract", () => {
  it("puts the certificate fingerprint into both pairing codes and reads it back", () => {
    const native = buildMobilePairingPayload({ ticket: TICKET, urls: URLS, fingerprint: FINGERPRINT });
    expect(native).toContain(`f=${FINGERPRINT}`);
    expect(parseMobilePairingPayload(native)).toEqual({
      protocol: 1,
      ticket: TICKET,
      urls: URLS,
      fingerprint: FINGERPRINT,
    });
    const web = buildMobileWebPairingUrl({
      appUrl: "https://192.168.1.10:47930/app/",
      ticket: TICKET,
      urls: URLS,
      fingerprint: FINGERPRINT,
    });
    expect(web.startsWith("https://192.168.1.10:47930/app/#v=1&t=")).toBe(true);
    // The ticket rides in the fragment, which a browser never sends to a server.
    expect(new URL(web).search).toBe("");
    expect(parseMobilePairingPayload(web)).toEqual({
      protocol: 1,
      ticket: TICKET,
      urls: URLS,
      fingerprint: FINGERPRINT,
    });
    expect(parseMobilePairingPayload(buildMobilePairingPayload({ ticket: TICKET, urls: URLS }))).toMatchObject({
      fingerprint: null,
    });
    expect(() => parseMobilePairingPayload(`cosgral://pair?v=1&t=${TICKET}&u=x&f=zz`)).toThrow();
  });

  it("formats and pins fingerprints regardless of case and separators", () => {
    expect(formatMobileFingerprint("ab".repeat(32))).toBe(Array(32).fill("AB").join(":"));
    expect(mobileFingerprintMatches(FINGERPRINT, formatMobileFingerprint(FINGERPRINT))).toBe(true);
    expect(mobileFingerprintMatches(FINGERPRINT, formatMobileFingerprint("b2".repeat(32)))).toBe(false);
    expect(mobileFingerprintMatches(FINGERPRINT, "")).toBe(false);
  });

  it("says what TLS with a pinned fingerprint protects, and what plain loopback does not", () => {
    expect(MOBILE_TRANSPORT_WARNING).toContain("encrypted");
    expect(MOBILE_TRANSPORT_WARNING).toContain("fingerprint");
    expect(MOBILE_PLAIN_TRANSPORT_WARNING).toContain("not encrypted");
  });

  it("marks the transport in the state and adds certificate rotation", () => {
    const base = {
      enabled: true,
      exposure: "lan",
      port: 47_930,
      urls: URLS,
      pairing: null,
      devices: [],
      unavailableReason: null,
    };
    expect(
      isMobileState({
        ...base,
        transport: "tls",
        fingerprint: formatMobileFingerprint(FINGERPRINT),
        unencrypted: false,
      }),
    ).toBe(true);
    expect(isMobileState({ ...base, transport: "plain", fingerprint: null, unencrypted: true })).toBe(true);
    expect(isMobileState({ ...base, transport: "ssh", fingerprint: null, unencrypted: true })).toBe(false);
    expect(IPC_CHANNELS.mobileRotateCertificate).toBe("mobile:rotate-certificate");
  });
});
