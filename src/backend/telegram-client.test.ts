// @vitest-environment node
import { type DynamicRecord, isDynamicRecord } from "@openbot/contracts/runtime-values";
import { describe, expect, it } from "vitest";
import { TelegramClient, TelegramFailure, type TelegramFetch } from "./telegram-client";

const TOKEN = `123456789:${"A".repeat(35)}`;

interface Seen {
  url: string;
  body: DynamicRecord;
}

function client(respond: (seen: Seen) => Response | Promise<Response> | Error) {
  const seen: Seen[] = [];
  const fetchImpl: TelegramFetch = async (url, init) => {
    const parsed = JSON.parse(init.body);
    const entry: Seen = { url, body: isDynamicRecord(parsed) ? parsed : {} };
    seen.push(entry);
    const answer = await respond(entry);
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { telegram: new TelegramClient({ token: TOKEN, fetchImpl, apiBase: "http://127.0.0.1:9" }), seen };
}

const ok = (result: unknown) => Response.json({ ok: true, result });
const fails = async (promise: Promise<unknown>): Promise<TelegramFailure> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TelegramFailure) return error;
    throw error;
  }
  throw new Error("It should have failed.");
};

describe("TelegramClient", () => {
  it("getMe returns the public name of a real bot", async () => {
    const { telegram, seen } = client(() => ok({ is_bot: true, username: "cosgral_bot" }));
    await expect(telegram.getMe()).resolves.toBe("@cosgral_bot");
    expect(seen[0]?.url).toBe(`http://127.0.0.1:9/bot${TOKEN}/getMe`);
  });

  it("getMe refuses an answer that is not a bot and ignores an odd username", async () => {
    expect((await fails(client(() => ok({ is_bot: false, username: "x" })).telegram.getMe())).kind).toBe("rejected");
    await expect(client(() => ok({ is_bot: true, username: "a b<>" })).telegram.getMe()).resolves.toBe("@bot");
  });

  it("getUpdates asks only for messages and reads only the known fields", async () => {
    const { telegram, seen } = client(() =>
      ok([
        {
          update_id: 10,
          message: { chat: { id: 42, type: "private", first_name: "Ala", last_name: "Kot" }, text: "hej" },
        },
        { update_id: 11, message: { chat: { id: -7, type: "group", title: "Ekipa" } } },
        { update_id: 12, edited_message: {} },
        { nope: true },
      ]),
    );
    const updates = await telegram.getUpdates(10, 25);
    expect(seen[0]?.body).toEqual({ timeout: 25, allowed_updates: ["message"], offset: 10 });
    expect(updates).toEqual([
      { updateId: 10, chat: { id: 42, type: "private", title: "Ala Kot" }, text: "hej" },
      { updateId: 11, chat: { id: -7, type: "group", title: "Ekipa" }, text: null },
      { updateId: 12, chat: null, text: null },
    ]);
  });

  it("getUpdates without an offset sends none", async () => {
    const { telegram, seen } = client(() => ok([]));
    await telegram.getUpdates(null, 0);
    expect(seen[0]?.body).toEqual({ timeout: 0, allowed_updates: ["message"] });
  });

  it("sendMessage sends plain text with a numeric chat and no parse mode", async () => {
    const { telegram, seen } = client(() => ok({}));
    await telegram.sendMessage("42", "<b>hej</b> *tak*");
    expect(seen[0]?.body).toEqual({ chat_id: 42, text: "<b>hej</b> *tak*" });
  });

  it("maps statuses to fixed failures", async () => {
    const answer =
      (status: number, body: unknown = { ok: false }) =>
      () =>
        Response.json(body, { status });
    expect((await fails(client(answer(401)).telegram.getMe())).kind).toBe("token-refused");
    expect((await fails(client(answer(404)).telegram.getMe())).kind).toBe("token-refused");
    expect((await fails(client(answer(409)).telegram.getUpdates(null, 0))).kind).toBe("conflict");
    expect((await fails(client(answer(502)).telegram.getMe())).kind).toBe("network");
    expect((await fails(client(answer(403)).telegram.sendMessage("1", "x"))).kind).toBe("rejected");
    const limited = await fails(client(answer(429, { ok: false, parameters: { retry_after: 7 } })).telegram.getMe());
    expect(limited.kind).toBe("rate-limited");
    expect(limited.retryAfterMs).toBe(7000);
    const huge = await fails(client(answer(429, { ok: false, parameters: { retry_after: 99999 } })).telegram.getMe());
    expect(huge.retryAfterMs).toBe(300_000);
    const none = await fails(client(answer(429)).telegram.getMe());
    expect(none.retryAfterMs).toBe(5000);
  });

  it("a 200 without ok:true or with a broken body is a network failure", async () => {
    expect((await fails(client(() => Response.json({ ok: false })).telegram.getMe())).kind).toBe("network");
    expect((await fails(client(() => new Response("not json")).telegram.getMe())).kind).toBe("network");
  });

  it("never lets the token out through an error, whatever the network layer said", async () => {
    const leaky = new Error(`connect ECONNREFUSED http://127.0.0.1:9/bot${TOKEN}/getMe`);
    const { telegram } = client(() => leaky);
    const failure = await fails(telegram.getMe());
    expect(failure.kind).toBe("network");
    expect(failure.message).not.toContain(TOKEN);
    expect(failure.message).not.toContain("127.0.0.1");
    expect(JSON.stringify(failure)).not.toContain(TOKEN);
    expect(String(failure.stack)).not.toContain(TOKEN);
  });

  it("an outer abort stops the request as a network failure", async () => {
    const controller = new AbortController();
    const fetchImpl: TelegramFetch = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error(`aborted ${TOKEN}`)));
      });
    const telegram = new TelegramClient({ token: TOKEN, fetchImpl, apiBase: "http://127.0.0.1:9" });
    const pending = fails(telegram.getUpdates(null, 30, controller.signal));
    controller.abort();
    const failure = await pending;
    expect(failure.kind).toBe("network");
    expect(failure.message).not.toContain(TOKEN);
  });

  it("deleteWebhook keeps pending messages", async () => {
    const { telegram, seen } = client(() => ok(true));
    await telegram.deleteWebhook();
    expect(seen[0]?.url).toContain("/deleteWebhook");
    expect(seen[0]?.body).toEqual({ drop_pending_updates: false });
  });
});
