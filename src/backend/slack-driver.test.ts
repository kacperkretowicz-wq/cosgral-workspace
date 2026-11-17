// @vitest-environment node
// COSGRAL W12-KK (2): the Slack driver and the bridge on a MOCK Slack on this computer (Web API + Socket Mode WebSocket) and a fake
// agent. No real workspace, no real token, no call outside this computer. Every test also looks for the tokens where they must not be.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentEvent, MESSENGER_FAILURE_SENTENCES } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { type AgentReply, type MessengerAgentPort, MessengerBridge } from "./messenger-bridge";
import { MessengerFailure } from "./messenger-driver";
import { createSlackDriver } from "./slack-driver";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { MockSlack } from "./testing/slack-mock";
import type { SecretBox } from "./vault-store";

const BOT = `xoxb-${"1234567890-".repeat(3)}abcDEF`;
const APP = `xapp-1-A01-${"9876543210-".repeat(3)}abcDEF`;
const DM = "D0DIRECT001";

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
const slacks: MockSlack[] = [];
const bridges: MessengerBridge[] = [];
afterEach(async () => {
  for (const bridge of bridges.splice(0)) await bridge.stop();
  closeTestDatabases();
  for (const mock of slacks.splice(0)) await mock.stop();
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function startSlack() {
  const slack = new MockSlack(BOT, APP);
  await slack.start();
  slacks.push(slack);
  return slack;
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

describe("Slack driver (mock Slack)", () => {
  it("connect checks both tokens and gives the bot's name; a wrong token is a fixed sentence without the token", async () => {
    const slack = await startSlack();
    const driver = createSlackDriver({ botToken: BOT, appToken: APP, apiBase: slack.base });
    expect(await driver.connect()).toBe("@cosgral_bot");
    const wrongBot = createSlackDriver({ botToken: `${BOT}x`, appToken: APP, apiBase: slack.base });
    const refusedBot = await failureOf(wrongBot.connect());
    expect(refusedBot).toMatchObject({
      kind: "token-refused",
      message: MESSENGER_FAILURE_SENTENCES.slack.tokenRefused,
    });
    const wrongApp = createSlackDriver({ botToken: BOT, appToken: `${APP}x`, apiBase: slack.base });
    expect((await failureOf(wrongApp.connect())).kind).toBe("token-refused");
    expect(refusedBot.message).not.toContain(BOT);
  });

  it("a network failure and a server error are the fixed network sentence", async () => {
    const slack = await startSlack();
    const refuse: typeof fetch = async () => {
      throw new Error(`connect ECONNREFUSED with ${BOT}`);
    };
    const down = createSlackDriver({ botToken: BOT, appToken: APP, apiBase: slack.base, fetchImpl: refuse });
    const failure = await failureOf(down.connect());
    expect(failure).toMatchObject({ kind: "network", message: MESSENGER_FAILURE_SENTENCES.slack.network });
    expect(failure.message).not.toContain(BOT);
    slack.openStatus = 503;
    const driver = createSlackDriver({ botToken: BOT, appToken: APP, apiBase: slack.base });
    expect((await failureOf(driver.connect())).kind).toBe("network");
  });

  it("reads direct messages only, acknowledges everything, drops the bot's own, edits and repeats", async () => {
    const slack = await startSlack();
    const driver = createSlackDriver({ botToken: BOT, appToken: APP, apiBase: slack.base });
    await driver.connect();
    const controller = new AbortController();
    const first = driver.receive(null, 5, controller.signal);
    await slack.connected();
    slack.push({ channel: DM, user: "U0PERSON001", text: "hello bot", eventId: "EvA" });
    slack.push({ channel: DM, user: slack.botUserId, text: "my own echo", eventId: "EvB" });
    slack.push({ channel: DM, text: "edited", subtype: "message_changed", eventId: "EvC" });
    slack.push({ channel: DM, text: "a bot", botId: "B0OTHERBOT", eventId: "EvD" });
    slack.push({ channel: "C0CHANNEL01", channelType: "channel", text: "in a channel", eventId: "EvE" });
    slack.push({ channel: DM, user: "U0PERSON001", text: "hello bot", eventId: "EvA" });
    const envelopes = [0, 1, 2, 3, 4, 5].map((index) => `env-${index + 1}`);
    await until(() => envelopes.every((id) => slack.acknowledged.includes(id)), "every envelope acknowledged");
    const got = [...(await first)];
    await new Promise((resolve) => setTimeout(resolve, 30));
    got.push(...(await driver.receive(null, 0.05, controller.signal)));
    expect(got.map((message) => [message.chat?.id, message.chat?.kind, message.text])).toEqual([
      [DM, "private", "hello bot"],
      ["C0CHANNEL01", "other", "in a channel"],
    ]);
    expect(got[0]?.chat?.title).toBe("U0PERSON001");
    driver.close();
  });

  it("reconnects by itself when Slack asks to or the socket drops, and keeps reading", async () => {
    const slack = await startSlack();
    const driver = createSlackDriver({ botToken: BOT, appToken: APP, apiBase: slack.base });
    await driver.connect();
    const controller = new AbortController();
    const waiting = driver.receive(null, 2, controller.signal);
    await slack.connected();
    slack.askToReconnect();
    await waiting;
    const next = driver.receive(null, 5, controller.signal);
    await until(() => slack.socketsOpened === 2, "a second socket");
    await slack.connected();
    slack.push({ channel: DM, text: "after the refresh" });
    expect((await next).map((message) => message.text)).toEqual(["after the refresh"]);
    slack.drop();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const third = driver.receive(null, 5, controller.signal);
    await until(() => slack.socketsOpened === 3, "a third socket");
    await slack.connected();
    slack.push({ channel: DM, text: "after the drop" });
    expect((await third).map((message) => message.text)).toEqual(["after the drop"]);
    driver.close();
  });

  it("sends plain text, and Slack's refusals become the right kind of failure", async () => {
    const slack = await startSlack();
    const driver = createSlackDriver({ botToken: BOT, appToken: APP, apiBase: slack.base });
    await driver.send(DM, "an *answer* with <!channel>");
    expect(slack.posts).toEqual([{ channel: DM, text: "an *answer* with <!channel>", mrkdwn: false }]);
    slack.postError = { error: "channel_not_found" };
    expect((await failureOf(driver.send(DM, "x"))).kind).toBe("rejected");
    slack.postError = { error: "token_revoked" };
    expect((await failureOf(driver.send(DM, "x"))).kind).toBe("token-refused");
    slack.postError = { status: 429, retryAfter: 7 };
    const limited = await failureOf(driver.send(DM, "x"));
    expect(limited).toMatchObject({ kind: "rate-limited", retryAfterMs: 7000 });
  });

  it("closing stops a waiting receive", async () => {
    const slack = await startSlack();
    const driver = createSlackDriver({ botToken: BOT, appToken: APP, apiBase: slack.base });
    await driver.connect();
    const waiting = driver.receive(null, 30, new AbortController().signal);
    await slack.connected();
    driver.close();
    expect(await waiting).toEqual([]);
    expect(await driver.receive(null, 30, new AbortController().signal)).toEqual([]);
  });
});

describe("Slack through the bridge", () => {
  async function setup() {
    const slack = await startSlack();
    const folder = await mkdtemp(join(tmpdir(), "cosgral-slack-"));
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
        slackApiBase: slack.base,
        pollSeconds: 1,
        retryMs: 20,
        maxRetryMs: 40,
        replyPollMs: 10,
        replyTimeoutMs: 300,
      });
      bridges.push(bridge);
      return bridge;
    };
    return { bridge: make(), make, slack, agent, events, database };
  }

  it("connects with both tokens, keeps them encrypted, and never shows them", async () => {
    const { bridge, slack, events, database } = await setup();
    const status = await bridge.connect("slack", BOT, APP);
    expect(status).toMatchObject({ kind: "slack", phase: "connected", tokenSaved: true, botUsername: "@cosgral_bot" });
    const row = database.connection.prepare("SELECT token_enc FROM projection_messengers WHERE kind = 'slack'").get();
    expect(JSON.stringify(row)).not.toContain(BOT);
    expect(JSON.stringify(row)).not.toContain(APP);
    expect(JSON.stringify([bridge.list(), events, slack.calls])).not.toContain(BOT);
    expect(JSON.stringify([bridge.list(), events])).not.toContain(APP);
    // Telegram has nothing to do with it.
    expect(bridge.status("telegram")).toMatchObject({ phase: "disconnected", tokenSaved: false });
  });

  it("a wrong token is refused with Slack's fixed sentence and nothing is saved", async () => {
    const { bridge, database } = await setup();
    const error = await bridge.connect("slack", `${BOT}x`, APP).catch((reason: unknown) => reason);
    expect(String(error)).toContain(MESSENGER_FAILURE_SENTENCES.slack.tokenRefused);
    expect(String(error)).not.toContain(BOT);
    expect(bridge.status("slack")).toMatchObject({ phase: "disconnected", tokenSaved: false });
    expect(
      database.connection.prepare("SELECT COUNT(*) AS n FROM projection_messengers WHERE kind = 'slack'").get(),
    ).toEqual({ n: 0 });
  });

  it("nobody is allowed by default; an allowed direct message reaches the agent and the answer goes back to it", async () => {
    const { bridge, slack, agent } = await setup();
    await bridge.connect("slack", BOT, APP);
    await slack.connected();
    slack.push({ channel: "D0STRANGER1", user: "U0STRANGER1", text: "let me in" });
    await until(() => bridge.status("slack").unknownChats.length === 1, "an unknown chat is remembered");
    expect(bridge.status("slack").unknownChats[0]).toMatchObject({ chatId: "D0STRANGER1", label: "U0STRANGER1" });
    expect(JSON.stringify(bridge.status("slack"))).not.toContain("let me in");
    expect(agent.received).toEqual([]);
    expect(slack.posts).toEqual([]);

    bridge.allowChat({ kind: "slack", chatId: DM, botId: "chief", label: "Anna" });
    slack.push({ channel: DM, user: "U0PERSON001", text: "what is the plan?" });
    await until(() => agent.received.length === 1, "the message reaches the agent");
    expect(agent.received).toEqual([{ botId: "chief", text: "[Slack] what is the plan?" }]);
    agent.replies.set("m1", { state: "done", text: "Here is the plan." });
    await bridge.whenAnswered();
    expect(slack.posts).toEqual([{ channel: DM, text: "Here is the plan.", mrkdwn: false }]);
    expect(bridge.status("slack").counts).toEqual({ forwarded: 1, replied: 1, ignored: 1 });
  });

  it("a channel message is ignored and its channel is not even remembered", async () => {
    const { bridge, slack, agent } = await setup();
    await bridge.connect("slack", BOT, APP);
    await slack.connected();
    slack.push({ channel: "C0CHANNEL01", channelType: "channel", text: "everyone can see this" });
    await until(() => bridge.status("slack").counts.ignored === 1, "the channel message is ignored");
    expect(agent.received).toEqual([]);
    expect(bridge.status("slack").unknownChats).toEqual([]);
  });

  it("a saved connection starts again after a restart", async () => {
    const { bridge, make, slack, agent } = await setup();
    await bridge.connect("slack", BOT, APP);
    bridge.allowChat({ kind: "slack", chatId: DM, botId: "chief" });
    await bridge.stop();
    const before = slack.socketsOpened;
    const second = make();
    second.resume();
    await slack.connected();
    await until(() => slack.socketsOpened > before, "a socket after the restart");
    slack.push({ channel: DM, text: "after the restart" });
    await until(() => agent.received.length === 1, "the message after the restart");
  });

  it("disconnecting removes the tokens and closes the socket; the allow list stays", async () => {
    const { bridge, slack, database } = await setup();
    await bridge.connect("slack", BOT, APP);
    bridge.allowChat({ kind: "slack", chatId: DM, botId: "chief" });
    await slack.connected();
    const list = await bridge.disconnect("slack");
    expect(list.messengers.find((entry) => entry.kind === "slack")).toMatchObject({
      phase: "disconnected",
      tokenSaved: false,
    });
    expect(list.messengers.find((entry) => entry.kind === "slack")?.allowedChats).toHaveLength(1);
    expect(
      database.connection.prepare("SELECT token_enc FROM projection_messengers WHERE kind = 'slack'").get(),
    ).toEqual({ token_enc: null });
  });
});
