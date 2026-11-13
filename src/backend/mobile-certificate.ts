// COSGRAL W3: the self-signed TLS certificate of Mobile Connect, made on this computer with node:crypto only.
// Key: EC P-256. The X.509 v3 certificate is encoded here (a small DER writer) and signed with ECDSA SHA-256; Node's
// own X509Certificate parser checks the result in the tests. Phones do not trust it through a CA: they pin its
// SHA-256 fingerprint from the QR code. The private key never leaves the program (kept encrypted by MobileStore).

import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";

export interface MobileCertificate {
  certPem: string;
  /** PKCS#8 PEM; encrypt it before it is stored. */
  keyPem: string;
  /** SHA-256 of the DER certificate, 64 lowercase hex digits. */
  fingerprint: string;
  notBefore: string;
  notAfter: string;
}

/** How long a certificate lives; after that a new one is made and phones pair again. */
export const MOBILE_CERTIFICATE_DAYS = 730;

const OID = {
  ecdsaWithSha256: "1.2.840.10045.4.3.2",
  commonName: "2.5.4.3",
  organization: "2.5.4.10",
  basicConstraints: "2.5.29.19",
  keyUsage: "2.5.29.15",
  extKeyUsage: "2.5.29.37",
  subjectAltName: "2.5.29.17",
  serverAuth: "1.3.6.1.5.5.7.3.1",
};

export function createMobileCertificate(input: { now: Date; ips: string[]; days?: number }): MobileCertificate {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const start = Math.floor(input.now.getTime() / 1_000) * 1_000;
  const notBefore = new Date(start - 3_600_000);
  const notAfter = new Date(start + (input.days ?? MOBILE_CERTIFICATE_DAYS) * 86_400_000);
  const name = sequence(rdn(OID.commonName, "COSGRAL Workspace"), rdn(OID.organization, "COSGRAL"));
  const algorithm = sequence(oid(OID.ecdsaWithSha256));
  const ips = [...new Set(["127.0.0.1", ...input.ips])].filter(isIpv4);
  const altNames = sequence(
    tlv(0x82, Buffer.from("localhost", "ascii")),
    ...ips.map((ip) => tlv(0x87, Buffer.from(ip.split(".").map(Number)))),
  );
  const extensions = sequence(
    extension(OID.basicConstraints, true, sequence()),
    extension(OID.keyUsage, true, tlv(0x03, Buffer.from([0x07, 0x80]))),
    extension(OID.extKeyUsage, false, sequence(oid(OID.serverAuth))),
    extension(OID.subjectAltName, false, altNames),
  );
  const tbs = sequence(
    tlv(0xa0, integer(Buffer.from([2]))),
    integer(serial()),
    algorithm,
    name,
    sequence(time(notBefore), time(notAfter)),
    name,
    publicKey.export({ type: "spki", format: "der" }),
    tlv(0xa3, extensions),
  );
  const signature = sign("sha256", tbs, privateKey);
  const der = sequence(tbs, algorithm, tlv(0x03, Buffer.concat([Buffer.from([0]), signature])));
  return {
    certPem: pem("CERTIFICATE", der),
    keyPem: String(privateKey.export({ type: "pkcs8", format: "pem" })),
    fingerprint: createHash("sha256").update(der).digest("hex"),
    notBefore: notBefore.toISOString(),
    notAfter: notAfter.toISOString(),
  };
}

function length(size: number): Buffer {
  if (size < 0x80) return Buffer.from([size]);
  const bytes: number[] = [];
  for (let rest = size; rest > 0; rest = Math.floor(rest / 256)) bytes.unshift(rest % 256);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), length(content.length), content]);
}

function sequence(...parts: Buffer[]): Buffer {
  return tlv(0x30, Buffer.concat(parts));
}

function integer(bytes: Buffer): Buffer {
  const first = bytes[0] ?? 0;
  return tlv(0x02, first & 0x80 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes);
}

function oid(dotted: string): Buffer {
  const [first = 0, second = 0, ...rest] = dotted.split(".").map(Number);
  const bytes = [40 * first + second];
  for (const part of rest) {
    const chunk: number[] = [part % 128];
    for (let value = Math.floor(part / 128); value > 0; value = Math.floor(value / 128))
      chunk.unshift(0x80 | (value % 128));
    bytes.push(...chunk);
  }
  return tlv(0x06, Buffer.from(bytes));
}

function rdn(type: string, value: string): Buffer {
  return tlv(0x31, sequence(oid(type), tlv(0x0c, Buffer.from(value, "utf8"))));
}

function extension(id: string, critical: boolean, value: Buffer): Buffer {
  return sequence(oid(id), ...(critical ? [tlv(0x01, Buffer.from([0xff]))] : []), tlv(0x04, value));
}

/** UTCTime until 2049, GeneralizedTime after (RFC 5280). */
function time(date: Date): Buffer {
  const iso = date.toISOString();
  const digits = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  return date.getUTCFullYear() < 2050
    ? tlv(0x17, Buffer.from(digits.slice(2), "ascii"))
    : tlv(0x18, Buffer.from(digits, "ascii"));
}

/** 16 random bytes, positive and without a leading zero byte. */
function serial(): Buffer {
  const bytes = randomBytes(16);
  bytes[0] = ((bytes[0] ?? 1) & 0x7f) | 0x01;
  return bytes;
}

function pem(label: string, der: Buffer): string {
  const lines = der.toString("base64").match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
