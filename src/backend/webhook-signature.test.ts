import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { newWebhookSecret, signWebhook, verifyWebhook } from "./webhook-signature";

const NOW = Date.parse("2026-11-13T04:00:00Z");

describe("Standard Webhooks signatures", () => {
  it("creates whsec_ secrets with 32 random bytes", () => {
    const secret = newWebhookSecret();
    expect(secret).toMatch(/^whsec_[A-Za-z0-9+/]+=*$/);
    expect(Buffer.from(secret.slice(6), "base64")).toHaveLength(32);
    expect(newWebhookSecret()).not.toBe(secret);
  });

  it("matches the spec's signing: base64 HMAC-SHA256 of id.timestamp.body with the decoded key", () => {
    const secret = `whsec_${Buffer.from("test-key-0123456789abcdef0123456").toString("base64")}`;
    const body = Buffer.from('{"type":"invoice.paid"}');
    const expected = createHmac("sha256", Buffer.from("test-key-0123456789abcdef0123456"))
      .update(`msg_1.${NOW / 1000}.${body.toString()}`)
      .digest("base64");
    expect(signWebhook(secret, "msg_1", NOW / 1000, body)).toBe(`v1,${expected}`);
  });

  it("accepts a correct signature among several and a timestamp within five minutes", () => {
    const secret = newWebhookSecret();
    const body = Buffer.from("{}");
    const good = signWebhook(secret, "msg_1", NOW / 1000 - 200, body);
    const headers = { id: "msg_1", timestamp: String(NOW / 1000 - 200), signature: `v1,AAAA ${good}` };
    expect(verifyWebhook(secret, headers, body, NOW)).toEqual({ ok: true });
  });

  it("refuses a wrong secret, a changed body, missing headers and an old or future timestamp", () => {
    const secret = newWebhookSecret();
    const body = Buffer.from('{"a":1}');
    const ts = NOW / 1000;
    const signature = signWebhook(secret, "msg_1", ts, body);
    const headers = { id: "msg_1", timestamp: String(ts), signature };
    expect(verifyWebhook(newWebhookSecret(), headers, body, NOW).ok).toBe(false);
    expect(verifyWebhook(secret, headers, Buffer.from('{"a":2}'), NOW).ok).toBe(false);
    expect(verifyWebhook(secret, { ...headers, id: "" }, body, NOW)).toEqual({ ok: false, reason: "missing headers" });
    expect(verifyWebhook(secret, headers, body, NOW + 301_000)).toEqual({
      ok: false,
      reason: "timestamp out of range",
    });
    expect(verifyWebhook(secret, headers, body, NOW - 301_000)).toEqual({
      ok: false,
      reason: "timestamp out of range",
    });
    expect(verifyWebhook(secret, { ...headers, signature: "v1,%%%" }, body, NOW)).toEqual({
      ok: false,
      reason: "bad signature",
    });
  });
});
