// @vitest-environment node
import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, parseTotpSetupKey, totp } from "./totp";

// RFC 6238, Appendix B: the shared secrets are the ASCII strings below, 8-digit codes, 30-second steps.
const SECRETS = {
  SHA1: "12345678901234567890",
  SHA256: "12345678901234567890123456789012",
  SHA512: "1234567890123456789012345678901234567890123456789012345678901234",
} as const;
const VECTORS: Array<[number, string, keyof typeof SECRETS]> = [
  [59, "94287082", "SHA1"],
  [59, "46119246", "SHA256"],
  [59, "90693936", "SHA512"],
  [1111111109, "07081804", "SHA1"],
  [1111111109, "68084774", "SHA256"],
  [1111111109, "25091201", "SHA512"],
  [1111111111, "14050471", "SHA1"],
  [1111111111, "67062674", "SHA256"],
  [1111111111, "99943326", "SHA512"],
  [1234567890, "89005924", "SHA1"],
  [1234567890, "91819424", "SHA256"],
  [1234567890, "93441116", "SHA512"],
  [2000000000, "69279037", "SHA1"],
  [2000000000, "90698825", "SHA256"],
  [2000000000, "38618901", "SHA512"],
  [20000000000, "65353130", "SHA1"],
  [20000000000, "77737706", "SHA256"],
  [20000000000, "47863826", "SHA512"],
];

describe("TOTP (RFC 6238)", () => {
  it.each(VECTORS)("at %i s gives %s with %s", (seconds, code, algorithm) => {
    const secret = base32Encode(Buffer.from(SECRETS[algorithm], "ascii"));
    expect(totp({ secret, algorithm, digits: 8, period: 30 }, seconds * 1000)).toBe(code);
  });

  it("uses 6 digits and 30 seconds by default and round-trips base32", () => {
    const secret = base32Encode(Buffer.from(SECRETS.SHA1, "ascii"));
    expect(base32Decode(secret).toString("ascii")).toBe(SECRETS.SHA1);
    expect(totp({ secret }, 59_000)).toBe("287082");
    expect(base32Decode("gezd gnbv-gy3t qojq")).toEqual(base32Decode("GEZDGNBVGY3TQOJQ"));
    expect(() => base32Decode("not base32!")).toThrow(/base32/);
  });

  it("reads a raw setup key or an otpauth:// link", () => {
    expect(parseTotpSetupKey("JBSW Y3DP EHPK 3PXP")).toEqual({
      secret: "JBSWY3DPEHPK3PXP",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
    expect(
      parseTotpSetupKey(
        "otpauth://totp/Test%20Bank:tester?secret=JBSWY3DPEHPK3PXP&issuer=Test%20Bank&algorithm=SHA256&digits=8&period=60",
      ),
    ).toEqual({ secret: "JBSWY3DPEHPK3PXP", algorithm: "SHA256", digits: 8, period: 60, issuer: "Test Bank" });
    expect(() => parseTotpSetupKey("otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP")).toThrow(/totp/);
    expect(() => parseTotpSetupKey("")).toThrow();
  });
});
