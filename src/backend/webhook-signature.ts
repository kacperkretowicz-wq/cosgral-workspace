// COSGRAL W2: Standard Webhooks signatures (webhook-id, webhook-timestamp, webhook-signature headers).
// The signed content is "<id>.<timestamp>.<body>", HMAC-SHA256 with the base64 key after "whsec_";
// the header holds one or more space-separated "v1,<base64>" signatures.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ROUTINE_LIMITS } from "@openbot/contracts/ipc";

const PREFIX = "whsec_";

export function newWebhookSecret(): string {
  return `${PREFIX}${randomBytes(32).toString("base64")}`;
}

export function signWebhook(secret: string, id: string, timestampSeconds: number, body: Buffer): string {
  return `v1,${digest(secret, id, String(timestampSeconds), body).toString("base64")}`;
}

export type WebhookVerification = { ok: true } | { ok: false; reason: string };

export function verifyWebhook(
  secret: string,
  headers: { id: string; timestamp: string; signature: string },
  body: Buffer,
  nowMs: number,
): WebhookVerification {
  if (!headers.id || !headers.timestamp || !headers.signature) return { ok: false, reason: "missing headers" };
  const seconds = Number(headers.timestamp);
  if (!Number.isFinite(seconds) || Math.abs(nowMs / 1000 - seconds) > ROUTINE_LIMITS.webhookToleranceSeconds) {
    return { ok: false, reason: "timestamp out of range" };
  }
  const expected = digest(secret, headers.id, headers.timestamp, body);
  for (const candidate of headers.signature.split(" ")) {
    const [version, value] = candidate.split(",", 2);
    if (version !== "v1" || !value) continue;
    const given = Buffer.from(value, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true };
  }
  return { ok: false, reason: "bad signature" };
}

function digest(secret: string, id: string, timestamp: string, body: Buffer): Buffer {
  const key = Buffer.from(secret.startsWith(PREFIX) ? secret.slice(PREFIX.length) : secret, "base64");
  return createHmac("sha256", key).update(`${id}.${timestamp}.`).update(body).digest();
}
