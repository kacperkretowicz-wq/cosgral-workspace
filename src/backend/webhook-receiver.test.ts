// @vitest-environment node

import { request } from "node:http";
import { ROUTINE_LIMITS } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { WebhookReceiver } from "./webhook-receiver";

const receivers: WebhookReceiver[] = [];
afterEach(async () => {
  await Promise.all(receivers.splice(0).map((receiver) => receiver.stop()));
});

function send(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: Buffer },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: options.method ?? "POST", headers: options.headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on("error", reject);
    req.end(options.body);
  });
}

describe("WebhookReceiver", () => {
  it("listens on loopback only and passes the routine id, Standard Webhooks headers and body", async () => {
    const seen: Array<{ routineId: string; headers: unknown; body: string }> = [];
    const receiver = new WebhookReceiver({
      handle: async (routineId, headers, body) => {
        seen.push({ routineId, headers, body: body.toString() });
        return { status: 202, body: { status: "accepted" } };
      },
    });
    receivers.push(receiver);
    const base = await receiver.start(0);
    expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const answer = await send(`${base}/webhooks/r1`, {
      headers: { "webhook-id": "msg_1", "webhook-timestamp": "1700000000", "webhook-signature": "v1,abc" },
      body: Buffer.from('{"type":"x"}'),
    });
    expect(answer).toEqual({ status: 202, body: '{"status":"accepted"}' });
    expect(seen).toEqual([
      { routineId: "r1", headers: { id: "msg_1", timestamp: "1700000000", signature: "v1,abc" }, body: '{"type":"x"}' },
    ]);
  });

  it("answers 404 for other paths, 405 for other methods and 413 for a body over the limit without reading it all", async () => {
    let calls = 0;
    const receiver = new WebhookReceiver({
      handle: async () => {
        calls += 1;
        return { status: 202, body: {} };
      },
    });
    receivers.push(receiver);
    const base = await receiver.start(0);
    expect((await send(`${base}/other`, {})).status).toBe(404);
    expect((await send(`${base}/webhooks/r1`, { method: "GET" })).status).toBe(405);
    expect(
      (await send(`${base}/webhooks/r1`, { body: Buffer.alloc(ROUTINE_LIMITS.webhookBody + 10, 97) })).status,
    ).toBe(413);
    expect(calls).toBe(0);
  });

  it("uses the preferred port when it is free and another one when it is taken", async () => {
    const first = new WebhookReceiver({ handle: async () => ({ status: 202, body: {} }) });
    receivers.push(first);
    const firstBase = await first.start(0);
    const port = Number(new URL(firstBase).port);
    const second = new WebhookReceiver({ handle: async () => ({ status: 202, body: {} }) });
    receivers.push(second);
    const secondBase = await second.start(port);
    expect(Number(new URL(secondBase).port)).not.toBe(port);
    expect(second.url()).toBe(secondBase);
  });
});
