// @vitest-environment node
import { createVerify, generateKeyPairSync, type KeyObject } from "node:crypto";
import type { PhonePushSubscription } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import {
  encryptWebPush,
  type PushRequest,
  sendWebPush,
  vapidAuthorization,
  WEB_PUSH_MAX_PLAINTEXT,
  WEB_PUSH_TTL_SECONDS,
} from "./web-push";
import { decryptAsPhone, newTestPhone as newPhone } from "./web-push-test-util";

function vapid(): {
  privateKeyPem: string;
  publicKey: string;
  publicKeyObject: KeyObject;
} {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const raw = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(String(jwk.x), "base64url"),
    Buffer.from(String(jwk.y), "base64url"),
  ]);
  return {
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: raw.toString("base64url"),
    publicKeyObject: publicKey,
  };
}

describe("Web Push encryption (RFC 8291)", () => {
  it("matches the RFC 8291 example (section 5) byte for byte", () => {
    const b64 = (text: string) => Buffer.from(text, "base64url");
    const subscription: PhonePushSubscription = {
      endpoint: "https://push.example.net/push/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV",
      keys: {
        p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
        auth: "BTBZMqHH6r4Tts7J_aSIgg",
      },
    };
    const { body } = encryptWebPush(Buffer.from("When I grow up, I want to be a watermelon"), subscription, {
      senderPrivateKey: b64("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"),
      salt: b64("DGv6ra1nlYgDCS1FRnbzlw"),
    });
    expect(body.toString("base64url")).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    );
  });

  it("round-trips: the phone decrypts exactly what was sent, and the body is not readable", () => {
    const phone = newPhone();
    const message = Buffer.from(JSON.stringify({ v: 1, kind: "needs-you", agentName: "Chief", itemId: "card-1" }));
    const { body } = encryptWebPush(message, phone.subscription);
    expect(body.includes(Buffer.from("Chief"))).toBe(false);
    expect(decryptAsPhone(body, phone).equals(message)).toBe(true);
    // A new salt and a new one-time key every time.
    expect(encryptWebPush(message, phone.subscription).body.equals(body)).toBe(false);
  });

  it("refuses a message that does not fit one record, and invalid phone keys", () => {
    const phone = newPhone();
    expect(() => encryptWebPush(Buffer.alloc(WEB_PUSH_MAX_PLAINTEXT + 1), phone.subscription)).toThrow(/too long/);
    expect(() =>
      encryptWebPush(Buffer.from("x"), { ...phone.subscription, keys: { ...phone.subscription.keys, p256dh: "AAAA" } }),
    ).toThrow(/key is not valid/);
    expect(() =>
      encryptWebPush(Buffer.from("x"), { ...phone.subscription, keys: { ...phone.subscription.keys, auth: "AAAA" } }),
    ).toThrow(/secret is not valid/);
  });
});

describe("VAPID (RFC 8292)", () => {
  it("signs a token for the push service's origin that the public key verifies", () => {
    const keys = vapid();
    const header = vapidAuthorization({
      endpoint: "https://push.example.test/send/abc123?x=1",
      privateKeyPem: keys.privateKeyPem,
      publicKey: keys.publicKey,
      now: new Date("2026-11-16T12:00:00.000Z"),
    });
    const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, head, claims, signature, key] = match ?? [];
    expect(key).toBe(keys.publicKey);
    expect(JSON.parse(Buffer.from(String(head), "base64url").toString())).toEqual({ typ: "JWT", alg: "ES256" });
    const payload = JSON.parse(Buffer.from(String(claims), "base64url").toString());
    expect(payload.aud).toBe("https://push.example.test");
    expect(payload.exp).toBe(Math.floor(Date.parse("2026-11-16T12:00:00.000Z") / 1000) + 12 * 3600);
    expect(payload.sub).toMatch(/^mailto:/);
    const verified = createVerify("SHA256")
      .update(`${head}.${claims}`)
      .verify({ key: keys.publicKeyObject, dsaEncoding: "ieee-p1363" }, Buffer.from(String(signature), "base64url"));
    expect(verified).toBe(true);
  });
});

describe("sendWebPush", () => {
  const request = async (status: number) => {
    const phone = newPhone();
    const keys = vapid();
    const seen: PushRequest[] = [];
    const outcome = await sendWebPush({
      subscription: phone.subscription,
      payload: Buffer.from("hello"),
      privateKeyPem: keys.privateKeyPem,
      publicKey: keys.publicKey,
      post: async (call) => {
        seen.push(call);
        return { status };
      },
    });
    return { outcome, seen, phone };
  };

  it("posts the encrypted body with the headers a push service needs", async () => {
    const { outcome, seen, phone } = await request(201);
    expect(outcome).toEqual({ ok: true });
    expect(seen).toHaveLength(1);
    const call = seen[0];
    expect(call?.url).toBe("https://push.example.test/send/abc123");
    expect(call?.headers["content-encoding"]).toBe("aes128gcm");
    expect(call?.headers.ttl).toBe(String(WEB_PUSH_TTL_SECONDS));
    expect(call?.headers.authorization).toMatch(/^vapid t=.+, k=.+$/);
    expect(call?.headers["content-length"]).toBe(String(call?.body.length));
    expect(decryptAsPhone(call?.body ?? Buffer.alloc(0), phone).toString()).toBe("hello");
  });

  it("says in plain words why it failed, and when the subscription is gone", async () => {
    expect(await request(410).then((r) => r.outcome)).toMatchObject({ ok: false, gone: true });
    expect(await request(404).then((r) => r.outcome)).toMatchObject({ ok: false, gone: true });
    expect(await request(429).then((r) => r.outcome)).toMatchObject({ ok: false, gone: false, reason: /slow down/ });
    expect(await request(500).then((r) => r.outcome)).toMatchObject({ ok: false, gone: false, reason: /answered 500/ });
  });

  it("a network error never echoes the address or a key", async () => {
    const phone = newPhone();
    const keys = vapid();
    const outcome = await sendWebPush({
      subscription: phone.subscription,
      payload: Buffer.from("hello"),
      privateKeyPem: keys.privateKeyPem,
      publicKey: keys.publicKey,
      post: async () => {
        throw new Error(`connect ECONNREFUSED ${phone.subscription.endpoint} ${keys.privateKeyPem}`);
      },
    });
    expect(outcome).toEqual({ ok: false, gone: false, reason: "The push service could not be reached." });
  });
});
