// @vitest-environment node
import { createPrivateKey, X509Certificate } from "node:crypto";
import { connect, createServer } from "node:tls";
import { formatMobileFingerprint, mobileFingerprintMatches } from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber } from "@openbot/contracts/runtime-values";
import { describe, expect, it } from "vitest";
import { createMobileCertificate } from "./mobile-certificate";

const NOW = new Date("2026-11-13T20:00:00.000Z");

describe("Mobile Connect certificate", () => {
  it("is a valid self-signed X.509 certificate that Node parses and verifies", () => {
    const certificate = createMobileCertificate({ now: NOW, ips: ["192.168.1.10"] });
    const x509 = new X509Certificate(certificate.certPem);
    expect(x509.subject).toContain("CN=COSGRAL Workspace");
    expect(x509.issuer).toBe(x509.subject);
    expect(x509.verify(x509.publicKey)).toBe(true);
    expect(x509.checkPrivateKey(createPrivateKey(certificate.keyPem))).toBe(true);
    expect(x509.publicKey.asymmetricKeyType).toBe("ec");
    expect(x509.subjectAltName).toContain("DNS:localhost");
    expect(x509.subjectAltName).toContain("IP Address:127.0.0.1");
    expect(x509.subjectAltName).toContain("IP Address:192.168.1.10");
    expect(x509.ca).toBe(false);
    expect(Date.parse(x509.validFrom)).toBeLessThanOrEqual(NOW.getTime());
    expect(Date.parse(x509.validTo)).toBe(Date.parse(certificate.notAfter));
    expect(Date.parse(certificate.notAfter) - NOW.getTime()).toBeGreaterThan(365 * 86_400_000);
    expect(certificate.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(formatMobileFingerprint(certificate.fingerprint)).toBe(x509.fingerprint256);
    expect(certificate.keyPem).toContain("PRIVATE KEY");
  });

  it("makes a new key, serial and fingerprint every time", () => {
    const first = createMobileCertificate({ now: NOW, ips: [] });
    const second = createMobileCertificate({ now: NOW, ips: [] });
    expect(first.fingerprint).not.toBe(second.fingerprint);
    expect(new X509Certificate(first.certPem).serialNumber).not.toBe(new X509Certificate(second.certPem).serialNumber);
  });

  it("serves TLS, and a client that pins the fingerprint recognises this computer", async () => {
    const certificate = createMobileCertificate({ now: new Date(), ips: [] });
    const other = createMobileCertificate({ now: new Date(), ips: [] });
    const server = createServer({ key: certificate.keyPem, cert: certificate.certPem }, (socket) => socket.end("ok"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = isDynamicRecord(address) && isNumber(address.port) ? address.port : 0;
    try {
      const presented = await new Promise<string>((resolve, reject) => {
        const socket = connect({ host: "127.0.0.1", port, rejectUnauthorized: false }, () => {
          resolve(socket.getPeerCertificate().fingerprint256);
          socket.end();
        });
        socket.once("error", reject);
      });
      expect(mobileFingerprintMatches(certificate.fingerprint, presented)).toBe(true);
      expect(mobileFingerprintMatches(other.fingerprint, presented)).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
