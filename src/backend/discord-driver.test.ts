// @vitest-environment node
// COSGRAL W12-KK (3): the Discord driver and the bridge on a MOCK Discord on this computer (REST + Gateway WebSocket) and a fake
// agent. No real application, no real token, no call outside this computer. Every test also looks for the token where it must not be.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgentEvent,
  MESSENGER_FAILURE_SENTENCES,
  parseAllowChatInput,
  parseConnectMessengerInput,
} from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { createDiscordDriver, DISCORD_PART_LIMIT, splitForDiscord } from "./discord-driver";
import { type AgentReply, type MessengerAgentPort, MessengerBridge } from "./messenger-bridge";
import { MessengerFailure } from "./messenger-driver";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { MockDiscord } from "./testing/discord-mock";
import type { SecretBox } from "./vault-store";

// Built from pieces on purpose: a whole token-shaped text in the source is refused by secret scanning, fake or not.
const TOKEN = `${"MTIzNDU2Nzg5"}${"MDEyMzQ1Njc4"}.GabcDE.${"abcdefghijklmnopqrstuvwxyz"}0123456789ABC`;
const DM = "300000000000000001";
const STRANGER = "300000000000000002";
const SERVER_CHANNEL = "400000000000000001";

const box: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => `box:${Buffer.from(plain, "utf8").toString("base64").split("").reverse().join("")}`,
  decrypt: (cipher) => {
    if (!cipher.startsWith("box:")) throw new Error("not from this safe");
    return Buffer.from(cipher.slice(4).split("").reverse().join(""), "base64").toString("utf8");
  },
};

class FakeAgent implements MessengerAgentPort {
  readonly received: Array<{ botId: string; text: string }> = [];
  replies = new Map<string, AgentReply>();
  #counter = 0;
  hasAgent(botId: string) {
    return botId === "chief";
  }
  async send(botId: string, text: string) {
    this.#counter += 1;
    this.received.push({ botId, text });
    return `m${this.#counter}`;
  }
  async reply(_botId: string, messageId: string): Promise<AgentReply> {
    return this.replies.get(messageId) ?? { state: "pending" };
  }
}

const folders: string[] = [];
const discords: MockDiscord[] = [];
const bridges: MessengerBridge[] = [];
afterEach(async () => {
  for (const bridge of bridges.splice(0)) await bridge.stop();
  closeTestDatabases();
  for (const mock of discords.splice(0)) await mock.stop();
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function startDiscord() {
  const discord = new MockDiscord(TOKEN);
  await discord.start();
  discords.push(discord);
  return discord;
}

async function until(check: () => boolean, what: string, ms = 4000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`Timed out waiting for: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function failureOf(promise: Promise<unknown>): Promise<MessengerFailure> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof MessengerFailure) return error;
    throw error;
  }
  throw new Error("It should have failed.");
}

describe("splitForDiscord", () => {
  it("keeps a short text whole and cuts a long one at a line end within the limit, losing nothing", () => {
    expect(splitForDiscord("  hello  ")).toEqual(["hello"]);
    expect(splitForDiscord("   ")).toEqual([]);
    const line = "x".repeat(1500);
    const parts = splitForDiscord(`${line}\n${line}\n${line}`);
    expect(parts).toEqual([line, line, line]);
    const blob = "y".repeat(DISCORD_PART_LIMIT * 2 + 50);
    const cut = splitForDiscord(blob);
    expect(cut.every((part) => part.length <= DISCORD_PART_LIMIT)).toBe(true);
    expect(cut.join("")).toBe(blob);
  });
});

describe("Discord driver (mock Discord)", () => {
  it("connect checks the token and gives the bot's name; a wrong token is a fixed sentence without the token", async () => {
    const discord = await startDiscord();
    const driver = createDiscordDriver({ botToken: TOKEN, apiBase: discord.base });
    expect(await driver.connect()).toBe("@cosgral_bot");
    expect(await driver.identify()).toBe("@cosgral_bot");
    const wrong = createDiscordDriver({ botToken: `${TOKEN}x`, apiBase: discord.base });
    const refused = await failureOf(wrong.connect());
    expect(refused).toMatchObject({ kind: "token-refused", message: MESSENGER_FAILURE_SENTENCES.discord.tokenRefused });
    expect(refused.message).not.toContain(TOKEN);
  });

  it("a network failure and a server error are the fixed network sentence", async () => {
    const discord = await startDiscord();
    const refuse: typeof fetch = async () => {
      throw new Error(`connect ECONNREFUSED with ${TOKEN}`);
    };
    const down = createDiscordDriver({ botToken: TOKEN, apiBase: discord.base, fetchImpl: refuse });
    const failure = await failureOf(down.connect());
    expect(failure).toMatchObject({ kind: "network", message: MESSENGER_FAILURE_SENTENCES.discord.network });
    expect(failure.message).not.toContain(TOKEN);
    discord.gatewayStatus = 503;
    const driver = createDiscordDriver({ botToken: TOKEN, apiBase: discord.base });
    expect((await failureOf(driver.connect())).kind).toBe("network");
  });

  it("asks for direct messages only, reads direct messages only and drops the bot's own, other bots, webhooks, system messages and repeats", async () => {
    const discord = await startDiscord();
    const driver = createDiscordDriver({ botToken: TOKEN, apiBase: discord.base });
    await driver.connect();
    const controller = new AbortController();
    const first = driver.receive(null, 5, controller.signal);
    await discord.ready();
    expect(discord.intents).toEqual([4096]);
    discord.push({
      channel: DM,
      text: "hello bot",
      person: { globalName: "Anna K." },
      messageId: "810000000000000001",
    });
    discord.push({ channel: DM, text: "my own echo", person: { id: discord.botUserId } });
    discord.push({ channel: DM, text: "a bot", person: { bot: true, id: "700000000000000009" } });
    discord.push({ channel: DM, text: "a webhook", webhookId: "600000000000000001" });
    discord.push({ channel: DM, text: "joined", type: 7 });
    discord.push({ channel: SERVER_CHANNEL, guildId: "500000000000000001", text: "in a server" });
    discord.push({ channel: DM, text: "hello bot", messageId: "810000000000000001" });
    discord.push({ channel: DM, text: "", messageId: "810000000000000002" });
    await until(() => discord.heartbeats > 0, "the connection is alive");
    const got = [...(await first)];
    await new Promise((resolve) => setTimeout(resolve, 30));
    got.push(...(await driver.receive(null, 0.05, controller.signal)));
    expect(got.map((message) => [message.chat?.id, message.chat?.kind, message.text])).toEqual([
      [DM, "private", "hello bot"],
      [SERVER_CHANNEL, "other", null],
      [DM, "private", null],
    ]);
    expect(got[0]?.chat?.title).toBe("Anna K.");
    driver.close();
  });

  it("resumes the same session after a reconnect request or a drop, and gets what came in between", async () => {
    const discord = await startDiscord();
    const driver = createDiscordDriver({ botToken: TOKEN, apiBase: discord.base });
    await driver.connect();
    const controller = new AbortController();
    const waiting = driver.receive(null, 2, controller.signal);
    await discord.ready();
    discord.push({ channel: DM, text: "before" });
    expect((await waiting).map((message) => message.text)).toEqual(["before"]);

    discord.askToReconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const next = driver.receive(null, 5, controller.signal);
    await until(() => discord.socketsOpened === 2, "a second socket");
    await discord.ready();
    discord.push({ channel: DM, text: "after the refresh" });
    expect((await next).map((message) => message.text)).toEqual(["after the refresh"]);

    discord.drop();
    await new Promise((resolve) => setTimeout(resolve, 50));
    discord.pushWhileAway({ channel: DM, text: "while the program was away" });
    const third = driver.receive(null, 5, controller.signal);
    await until(() => discord.socketsOpened === 3, "a third socket");
    expect((await third).map((message) => message.text)).toEqual(["while the program was away"]);
    // One identify at the start; the two later sockets resumed it.
    expect([discord.identifies, discord.resumes]).toEqual([1, 2]);
    driver.close();
  });

  it("starts a fresh session when Discord forgets the old one", async () => {
    const discord = await startDiscord();
    const driver = createDiscordDriver({ botToken: TOKEN, apiBase: discord.base });
    await driver.connect();
    const controller = new AbortController();
    const waiting = driver.receive(null, 2, controller.signal);
    await discord.ready();
    discord.invalidateSession(false);
    await waiting;
    const next = driver.receive(null, 5, controller.signal);
    await until(() => discord.identifies === 2, "a fresh identify");
    await discord.ready();
    discord.push({ channel: DM, text: "after a fresh start" });
    expect((await next).map((message) => message.text)).toEqual(["after a fresh start"]);
    driver.close();
  });

  it("a token the gateway refuses is a token-refused failure, and the program does not keep trying", async () => {
    const discord = await startDiscord();
    discord.identifyCloseCode = 4004;
    const driver = createDiscordDriver({ botToken: TOKEN, apiBase: discord.base });
    await driver.connect();
    const refused = await failureOf(driver.receive(null, 1, new AbortController().signal));
    expect(refused).toMatchObject({ kind: "token-refused", message: MESSENGER_FAILURE_SENTENCES.discord.tokenRefused });
    const opened = discord.socketsOpened;
    expect((await failureOf(driver.receive(null, 1, new AbortController().signal))).kind).toBe("token-refused");
    expect(discord.socketsOpened).toBe(opened);
    driver.close();
  });

  it("drops a connection that stops answering heartbeats and comes back by itself", async () => {
    const discord = await startDiscord();
    const driver = createDiscordDriver({ botToken: TOKEN, apiBase: discord.base });
    await driver.connect();
    const controller = new AbortController();
    const waiting = driver.receive(null, 10, controller.signal);
    await discord.ready();
    discord.answerHeartbeats = false;
    // The silent connection is cut by the program, which ends the wait.
    expect(await waiting).toEqual([]);
    discord.answerHeartbeats = true;
    const next = driver.receive(null, 5, controller.signal);
    await until(() => discord.socketsOpened === 2, "a new socket after the silence");
    await discord.ready();
    discord.push({ channel: DM, text: "back again" });
    expect((await next).map((message) => message.text)).toEqual(["back again"]);
    driver.close();
  });

  it("sends plain text without mentions or previews, in parts of at most 2000 characters", async () => {
    const discord = await startDiscord();
    const driver = createDiscordDriver({ botToken: TOKEN, apiBase: discord.base });
    await driver.send(DM, "an answer with @everyone and <@123>");
    expect(discord.posts).toEqual([
      {
        channel: DM,
        content: "an answer with @everyone and <@123>",
        mentionsParse: [],
        flags: 4,
        userAgent: "DiscordBot (Cosgral Workspace, 1.0)",
      },
    ]);
    discord.posts.length = 0;
    await driver.send(DM, `${"a".repeat(1900)}\n${"b".repeat(1900)}`);
    expect(discord.posts.map((post) => post.content.length)).toEqual([1900, 1900]);
  });

  it("Discord's refusals become the right kind of failure, and a chat id of a wrong shape is never put in an address", async () => {
    const discord = await startDiscord();
    const driver = createDiscordDriver({ botToken: TOKEN, apiBase: discord.base });
    discord.postError = { status: 403, body: { code: 50007 } };
    expect((await failureOf(driver.send(DM, "x"))).kind).toBe("rejected");
    discord.postError = { status: 401 };
    expect((await failureOf(driver.send(DM, "x"))).kind).toBe("token-refused");
    discord.postError = { status: 404 };
    expect((await failureOf(driver.send(DM, "x"))).kind).toBe("rejected");
    discord.postError = { status: 502 };
    expect((await failureOf(driver.send(DM, "x"))).kind).toBe("network");
    discord.postError = { status: 429, body: { retry_after: 2.5 } };
    expect(await failureOf(driver.send(DM, "x"))).toMatchObject({ kind: "rate-limited", retryAfterMs: 2500 });
    discord.postError = { status: 429, headers: { "Retry-After": "7" } };
    expect(await failureOf(driver.send(DM, "x"))).toMatchObject({ kind: "rate-limited", retryAfterMs: 7000 });
    const before = discord.calls.length;
    expect((await failureOf(driver.send("../../users/@me", "x"))).kind).toBe("rejected");
    expect(discord.calls.length).toBe(before);
  });

  it("closing stops a waiting receive", async () => {
    const discord = await startDiscord();
    const driver = createDiscordDriver({ botToken: TOKEN, apiBase: discord.base });
    await driver.connect();
    const waiting = driver.receive(null, 30, new AbortController().signal);
    await discord.ready();
    driver.close();
    expect(await waiting).toEqual([]);
    expect(await driver.receive(null, 30, new AbortController().signal)).toEqual([]);
  });
});

describe("Discord through the bridge", () => {
  async function setup() {
    const discord = await startDiscord();
    const folder = await mkdtemp(join(tmpdir(), "cosgral-discord-"));
    folders.push(folder);
    const database = testDatabase(join(folder, "data"));
    await database.initialize();
    const events: AgentEvent[] = [];
    const agent = new FakeAgent();
    const make = () => {
      const bridge = new MessengerBridge({
        database,
        box,
        agent,
        spaceId: "main",
        emit: (event) => events.push(event),
        discordApiBase: discord.base,
        pollSeconds: 1,
        retryMs: 20,
        maxRetryMs: 40,
        replyPollMs: 10,
        replyTimeoutMs: 300,
      });
      bridges.push(bridge);
      return bridge;
    };
    return { bridge: make(), make, discord, agent, events, database };
  }

  it("connects with one token, keeps it encrypted, and never shows it", async () => {
    const { bridge, discord, events, database } = await setup();
    const status = await bridge.connect("discord", TOKEN);
    expect(status).toMatchObject({
      kind: "discord",
      phase: "connected",
      tokenSaved: true,
      botUsername: "@cosgral_bot",
    });
    const row = database.connection.prepare("SELECT token_enc FROM projection_messengers WHERE kind = 'discord'").get();
    expect(JSON.stringify(row)).not.toContain(TOKEN);
    expect(JSON.stringify([bridge.list(), events, discord.calls])).not.toContain(TOKEN);
    expect(bridge.status("telegram")).toMatchObject({ phase: "disconnected", tokenSaved: false });
    expect(bridge.status("slack")).toMatchObject({ phase: "disconnected", tokenSaved: false });
  });

  it("a wrong token is refused with Discord's fixed sentence and nothing is saved", async () => {
    const { bridge, database } = await setup();
    const error = await bridge.connect("discord", `${TOKEN}x`).catch((reason: unknown) => reason);
    expect(String(error)).toContain(MESSENGER_FAILURE_SENTENCES.discord.tokenRefused);
    expect(String(error)).not.toContain(TOKEN);
    expect(bridge.status("discord")).toMatchObject({ phase: "disconnected", tokenSaved: false });
    expect(
      database.connection.prepare("SELECT COUNT(*) AS n FROM projection_messengers WHERE kind = 'discord'").get(),
    ).toEqual({ n: 0 });
  });

  it("nobody is allowed by default; an allowed direct message reaches the agent and the answer goes back to it", async () => {
    const { bridge, discord, agent } = await setup();
    await bridge.connect("discord", TOKEN);
    await discord.ready();
    discord.push({ channel: STRANGER, person: { username: "stranger" }, text: "let me in" });
    await until(() => bridge.status("discord").unknownChats.length === 1, "an unknown chat is remembered");
    expect(bridge.status("discord").unknownChats[0]).toMatchObject({ chatId: STRANGER, label: "stranger" });
    expect(JSON.stringify(bridge.status("discord"))).not.toContain("let me in");
    expect(agent.received).toEqual([]);
    expect(discord.posts).toEqual([]);

    bridge.allowChat({ kind: "discord", chatId: DM, botId: "chief", label: "Anna" });
    discord.push({ channel: DM, text: "what is the plan?" });
    await until(() => agent.received.length === 1, "the message reaches the agent");
    expect(agent.received).toEqual([{ botId: "chief", text: "[Discord] what is the plan?" }]);
    agent.replies.set("m1", { state: "done", text: "Here is the plan." });
    await bridge.whenAnswered();
    expect(discord.posts.map((post) => [post.channel, post.content])).toEqual([[DM, "Here is the plan."]]);
    expect(bridge.status("discord").counts).toEqual({ forwarded: 1, replied: 1, ignored: 1 });
  });

  it("a message from a server is ignored and its channel is not even remembered", async () => {
    const { bridge, discord, agent } = await setup();
    await bridge.connect("discord", TOKEN);
    await discord.ready();
    discord.push({ channel: SERVER_CHANNEL, guildId: "500000000000000001", text: "everyone can see this" });
    await until(() => bridge.status("discord").counts.ignored === 1, "the server message is ignored");
    expect(agent.received).toEqual([]);
    expect(bridge.status("discord").unknownChats).toEqual([]);
  });

  it("the settings accept only a Discord token and a direct-message channel id of the right shape", () => {
    expect(parseConnectMessengerInput({ kind: "discord", token: ` ${TOKEN} ` })).toEqual({
      kind: "discord",
      token: TOKEN,
    });
    expect(() =>
      parseConnectMessengerInput({ kind: "discord", token: "123456789:AAFakeTelegramLookingToken_0123456789" }),
    ).toThrow(/Discord bot token/);
    expect(() => parseConnectMessengerInput({ kind: "discord", token: TOKEN, appToken: "xapp-1" })).toThrow(
      /one token/,
    );
    expect(parseAllowChatInput({ kind: "discord", chatId: DM, botId: "chief" })).toEqual({
      kind: "discord",
      chatId: DM,
      botId: "chief",
    });
    for (const chatId of ["D01ABC23DEF", "123", "30000000000000000a", `${DM}0000`]) {
      expect(() => parseAllowChatInput({ kind: "discord", chatId, botId: "chief" })).toThrow(/Discord conversation id/);
    }
    // The error never repeats what was typed.
    expect(() => parseConnectMessengerInput({ kind: "discord", token: "secret-looking-text" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("secret-looking-text") }),
    );
  });

  it("a saved connection starts again after a restart", async () => {
    const { bridge, make, discord, agent } = await setup();
    await bridge.connect("discord", TOKEN);
    bridge.allowChat({ kind: "discord", chatId: DM, botId: "chief" });
    await bridge.stop();
    const before = discord.socketsOpened;
    const second = make();
    second.resume();
    await until(() => discord.socketsOpened > before, "a socket after the restart");
    await discord.ready();
    discord.push({ channel: DM, text: "after the restart" });
    await until(() => agent.received.length === 1, "the message after the restart");
  });

  it("disconnecting removes the token and closes the socket; the allow list stays", async () => {
    const { bridge, discord, database } = await setup();
    await bridge.connect("discord", TOKEN);
    bridge.allowChat({ kind: "discord", chatId: DM, botId: "chief" });
    await discord.ready();
    const list = await bridge.disconnect("discord");
    expect(list.messengers.find((entry) => entry.kind === "discord")).toMatchObject({
      phase: "disconnected",
      tokenSaved: false,
    });
    expect(list.messengers.find((entry) => entry.kind === "discord")?.allowedChats).toHaveLength(1);
    expect(
      database.connection.prepare("SELECT token_enc FROM projection_messengers WHERE kind = 'discord'").get(),
    ).toEqual({ token_enc: null });
  });
});
