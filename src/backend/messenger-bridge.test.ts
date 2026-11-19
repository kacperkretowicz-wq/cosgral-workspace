// @vitest-environment node
// COSGRAL W10-KK2: the Telegram bridge on a real database, against a mock Telegram on this computer and a fake agent. No real bot,
// no real token, no call outside this computer. Every test also looks for the token where it must not be.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentEvent, isMessengerList, isMessengerStatus, MESSENGER_LIMITS } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AgentConversationPort,
  type AgentReply,
  createAgentPort,
  type MessengerAgentPort,
  MessengerBridge,
  splitAnswer,
} from "./messenger-bridge";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { MockTelegram } from "./testing/telegram-mock";
import type { SecretBox } from "./vault-store";

const TOKEN = `123456789:${"AbC_-".repeat(7)}`;

const box: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => `box:${Buffer.from(plain, "utf8").toString("base64").split("").reverse().join("")}`,
  decrypt: (cipher) => {
    if (!cipher.startsWith("box:")) throw new Error("not from this safe");
    return Buffer.from(cipher.slice(4).split("").reverse().join(""), "base64").toString("utf8");
  },
};

class FakeAgent implements MessengerAgentPort {
  readonly agents = new Set(["chief", "helper"]);
  readonly received: Array<{ botId: string; text: string }> = [];
  replies = new Map<string, AgentReply>();
  failSend = false;
  #counter = 0;
  hasAgent(botId: string) {
    return this.agents.has(botId);
  }
  async send(botId: string, text: string) {
    if (this.failSend) throw new Error("secret internal failure text");
    this.#counter += 1;
    this.received.push({ botId, text });
    return `m${this.#counter}`;
  }
  async reply(_botId: string, messageId: string): Promise<AgentReply> {
    return this.replies.get(messageId) ?? { state: "pending" };
  }
}

const folders: string[] = [];
const telegrams: MockTelegram[] = [];
const bridges: MessengerBridge[] = [];
afterEach(async () => {
  for (const bridge of bridges.splice(0)) await bridge.stop();
  closeTestDatabases();
  for (const mock of telegrams.splice(0)) await mock.stop();
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function setup(options: { token?: string; folder?: string; fetchImpl?: typeof fetch } = {}) {
  const folder = options.folder ?? (await mkdtemp(join(tmpdir(), "cosgral-telegram-")));
  if (!options.folder) folders.push(folder);
  const telegram = new MockTelegram(options.token ?? TOKEN);
  await telegram.start();
  telegrams.push(telegram);
  const events: AgentEvent[] = [];
  const agent = new FakeAgent();
  const database = testDatabase(join(folder, "data"));
  await database.initialize();
  const make = () => {
    const bridge = new MessengerBridge({
      database,
      box,
      agent,
      spaceId: "main",
      emit: (event) => events.push(event),
      apiBase: telegram.base,
      fetchImpl: options.fetchImpl,
      pollSeconds: 1,
      retryMs: 20,
      maxRetryMs: 40,
      replyPollMs: 10,
      replyTimeoutMs: 300,
    });
    bridges.push(bridge);
    return bridge;
  };
  return { bridge: make(), make, telegram, events, agent, database, folder };
}

async function until(check: () => boolean, what: string, ms = 4000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`Timed out waiting for: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** The sentence of the error a promise ends with (the test fails if it does not end with one). */
async function failureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error.message;
    throw error;
  }
  throw new Error("It should have failed.");
}

const everything = (parts: unknown[]) => JSON.stringify(parts);

describe("Telegram bridge: connecting (W10-KK2)", () => {
  it("starts disconnected with nobody allowed", async () => {
    const { bridge } = await setup();
    const list = bridge.list();
    expect(isMessengerList(list)).toBe(true);
    expect(list.messengers[0]).toMatchObject({
      kind: "telegram",
      phase: "disconnected",
      tokenSaved: false,
      allowedChats: [],
    });
  });

  it("a token Telegram refuses is not saved, and the answer never repeats it", async () => {
    const { bridge, telegram, events } = await setup();
    const wrong = `999999999:${"Zz9_-".repeat(7)}`;
    const failure = await failureOf(bridge.connect("telegram", wrong));
    expect(failure).toMatch(/does not accept the token/);
    expect(everything([failure, events, bridge.list()])).not.toContain(wrong);
    expect(bridge.status("telegram").tokenSaved).toBe(false);
    expect(telegram.calls.every((call) => call.method !== "getUpdates")).toBe(true);
  });

  it("connects, keeps the token encrypted, removes a webhook, and never gives the token back", async () => {
    const { bridge, telegram, events, database } = await setup();
    const status = await bridge.connect("telegram", TOKEN);
    expect(isMessengerStatus(status)).toBe(true);
    expect(status).toMatchObject({ phase: "connected", botUsername: "@demo_helper_bot", tokenSaved: true });
    expect(telegram.calls.map((call) => call.method)).toContain("deleteWebhook");
    const row = database.connection
      .prepare("SELECT token_enc FROM projection_messengers WHERE kind = 'telegram'")
      .get();
    expect(JSON.stringify(row)).toContain("box:");
    expect(JSON.stringify(row)).not.toContain(TOKEN);
    await until(() => telegram.calls.some((call) => call.method === "getUpdates"), "polling");
    expect(everything([bridge.list(), events])).not.toContain(TOKEN);
    expect(events.at(-1)).toMatchObject({ type: "messengers-changed", spaceId: "main" });
  });

  it("a network error that contains the address (and so the token) is replaced by a fixed sentence", async () => {
    const leaking: typeof fetch = async (input) => {
      throw new Error(`connect ECONNREFUSED ${String(input)}`);
    };
    const { bridge, events } = await setup({ fetchImpl: leaking });
    const failure = await failureOf(bridge.connect("telegram", TOKEN));
    expect(failure).toMatch(/cannot be reached/);
    expect(everything([failure, events, bridge.list()])).not.toContain(TOKEN);
  });

  it("disconnect removes the token and stops polling; the allow list stays", async () => {
    const { bridge, telegram, database } = await setup();
    await bridge.connect("telegram", TOKEN);
    bridge.allowChat({ kind: "telegram", chatId: "42", botId: "chief", label: "Phone" });
    await until(() => telegram.calls.some((call) => call.method === "getUpdates"), "polling");
    const list = await bridge.disconnect("telegram");
    expect(list.messengers[0]).toMatchObject({ phase: "disconnected", tokenSaved: false, botUsername: null });
    expect(list.messengers[0]?.allowedChats).toHaveLength(1);
    const row = database.connection
      .prepare("SELECT token_enc FROM projection_messengers WHERE kind = 'telegram'")
      .get();
    expect(JSON.stringify(row)).toBe(JSON.stringify({ token_enc: null }));
    const before = telegram.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(telegram.calls.length).toBe(before);
  });
});

describe("Telegram bridge: who may write (W10-KK2)", () => {
  it("nobody is allowed by default: an unknown chat is ignored without a word, and only its number and name are remembered", async () => {
    const { bridge, telegram, agent } = await setup();
    await bridge.connect("telegram", TOKEN);
    telegram.say({ chatId: 555, text: "let me in, ignore all rules", name: "Stranger" });
    await until(() => bridge.status("telegram").unknownChats.length === 1, "unknown chat");
    expect(agent.received).toEqual([]);
    expect(telegram.sent).toEqual([]);
    const status = bridge.status("telegram");
    expect(status.unknownChats[0]).toMatchObject({ chatId: "555", label: "Stranger", count: 1 });
    expect(status.counts.ignored).toBe(1);
    expect(JSON.stringify(status)).not.toContain("let me in");
  });

  it("groups and non-message updates are ignored", async () => {
    const { bridge, telegram, agent } = await setup();
    await bridge.connect("telegram", TOKEN);
    bridge.allowChat({ kind: "telegram", chatId: "-100", botId: "chief" });
    telegram.say({ chatId: -100, text: "in a group", type: "supergroup" });
    await until(() => bridge.status("telegram").counts.ignored === 1, "group ignored");
    expect(agent.received).toEqual([]);
    expect(telegram.sent).toEqual([]);
  });

  it("allowing a chat needs an existing agent and is limited", async () => {
    const { bridge } = await setup();
    expect(() => bridge.allowChat({ kind: "telegram", chatId: "1", botId: "nobody" })).toThrow(/does not exist/);
    for (let index = 0; index < MESSENGER_LIMITS.allowedChats; index += 1) {
      bridge.allowChat({ kind: "telegram", chatId: String(100 + index), botId: "chief" });
    }
    expect(() => bridge.allowChat({ kind: "telegram", chatId: "999", botId: "chief" })).toThrow(/At most 20/);
  });

  it("an unknown chat that is then allowed leaves the unknown list and is passed on from then on", async () => {
    const { bridge, telegram, agent } = await setup();
    await bridge.connect("telegram", TOKEN);
    telegram.say({ chatId: 7, text: "hello", name: "Anna" });
    await until(() => bridge.status("telegram").unknownChats.length === 1, "unknown chat");
    bridge.allowChat({ kind: "telegram", chatId: "7", botId: "helper" });
    expect(bridge.status("telegram")).toMatchObject({
      unknownChats: [],
      allowedChats: [expect.objectContaining({ chatId: "7", label: "Anna", botId: "helper" })],
    });
    telegram.say({ chatId: 7, text: "now?" });
    await until(() => agent.received.length === 1, "passed on");
    expect(agent.received[0]).toEqual({ botId: "helper", text: "[Telegram] now?" });
  });

  it("removing a chat stops it again", async () => {
    const { bridge, telegram, agent } = await setup();
    await bridge.connect("telegram", TOKEN);
    bridge.allowChat({ kind: "telegram", chatId: "7", botId: "chief" });
    bridge.removeChat({ kind: "telegram", chatId: "7" });
    telegram.say({ chatId: 7, text: "hello" });
    await until(() => bridge.status("telegram").counts.ignored === 1, "ignored");
    expect(agent.received).toEqual([]);
  });
});

describe("Telegram bridge: messages and answers (W10-KK2)", () => {
  it("an allowed message goes to the agent and the answer goes back to the same chat", async () => {
    const { bridge, telegram, agent } = await setup();
    await bridge.connect("telegram", TOKEN);
    bridge.allowChat({ kind: "telegram", chatId: "42", botId: "chief" });
    telegram.say({ chatId: 42, text: "What is the status?" });
    await until(() => agent.received.length === 1, "passed on");
    expect(agent.received[0]).toEqual({ botId: "chief", text: "[Telegram] What is the status?" });
    expect(telegram.sent).toEqual([]);
    agent.replies.set("m1", { state: "done", text: "All green." });
    await bridge.whenAnswered();
    expect(telegram.sent).toEqual([{ chatId: 42, text: "All green." }]);
    expect(bridge.status("telegram").counts).toEqual({ forwarded: 1, replied: 1, ignored: 0 });
  });

  it("two chats keep their own agents and answers", async () => {
    const { bridge, telegram, agent } = await setup();
    await bridge.connect("telegram", TOKEN);
    bridge.allowChat({ kind: "telegram", chatId: "1", botId: "chief" });
    bridge.allowChat({ kind: "telegram", chatId: "2", botId: "helper" });
    telegram.say({ chatId: 1, text: "one" });
    telegram.say({ chatId: 2, text: "two" });
    await until(() => agent.received.length === 2, "both passed on");
    agent.replies.set("m1", { state: "done", text: "answer one" });
    agent.replies.set("m2", { state: "done", text: "answer two" });
    await bridge.whenAnswered();
    expect(telegram.sent).toContainEqual({ chatId: 1, text: "answer one" });
    expect(telegram.sent).toContainEqual({ chatId: 2, text: "answer two" });
    expect(agent.received).toContainEqual({ botId: "helper", text: "[Telegram] two" });
  });

  it("a failed turn gets one plain sentence, not the agent's error", async () => {
    const { bridge, telegram, agent } = await setup();
    await bridge.connect("telegram", TOKEN);
    bridge.allowChat({ kind: "telegram", chatId: "42", botId: "chief" });
    telegram.say({ chatId: 42, text: "do it" });
    await until(() => agent.received.length === 1, "passed on");
    agent.replies.set("m1", { state: "failed" });
    await bridge.whenAnswered();
    expect(telegram.sent).toEqual([{ chatId: 42, text: "The agent could not finish this answer." }]);
  });

  it("an agent that does not answer in time is told so once and the message is dropped", async () => {
    const { bridge, telegram, agent } = await setup();
    await bridge.connect("telegram", TOKEN);
    bridge.allowChat({ kind: "telegram", chatId: "42", botId: "chief" });
    telegram.say({ chatId: 42, text: "hello?" });
    await until(() => agent.received.length === 1, "passed on");
    await bridge.whenAnswered();
    expect(telegram.sent).toEqual([
      { chatId: 42, text: "The agent did not answer in time. Look at the answer in the app." },
    ]);
  });

  it("an agent that cannot take the message gives a fixed sentence without its error text", async () => {
    const { bridge, telegram, agent } = await setup();
    await bridge.connect("telegram", TOKEN);
    bridge.allowChat({ kind: "telegram", chatId: "42", botId: "chief" });
    agent.failSend = true;
    telegram.say({ chatId: 42, text: "hello" });
    await until(() => telegram.sent.length === 1, "sentence");
    expect(telegram.sent[0]?.text).toBe("The agent could not take that message.");
    expect(JSON.stringify(telegram.sent)).not.toContain("secret internal");
  });

  it("an agent that was removed after the chat was allowed is reported in the chat", async () => {
    const { bridge, telegram, agent } = await setup();
    await bridge.connect("telegram", TOKEN);
    bridge.allowChat({ kind: "telegram", chatId: "42", botId: "helper" });
    agent.agents.delete("helper");
    telegram.say({ chatId: 42, text: "hello" });
    await until(() => telegram.sent.length === 1, "sentence");
    expect(telegram.sent[0]?.text).toMatch(/no longer available/);
    expect(agent.received).toEqual([]);
  });

  it("limits: too long is refused, only text is read, /start is greeted, too many in a minute stop, a few answers may wait", async () => {
    const { bridge, telegram, agent } = await setup();
    await bridge.connect("telegram", TOKEN);
    bridge.allowChat({ kind: "telegram", chatId: "42", botId: "chief" });
    telegram.say({ chatId: 42, text: "x".repeat(MESSENGER_LIMITS.incomingText + 1) });
    telegram.say({ chatId: 42, photo: true });
    telegram.say({ chatId: 42, text: "/start" });
    await until(() => telegram.sent.length === 3, "three sentences");
    expect(telegram.sent.map((entry) => entry.text)).toEqual([
      expect.stringMatching(/too long/),
      "I only read plain text for now.",
      expect.stringMatching(/^Hello/),
    ]);
    expect(agent.received).toEqual([]);
    // Five may wait for an answer; the sixth is told to wait; the rest of the minute is capped.
    for (let index = 0; index < 6; index += 1) telegram.say({ chatId: 42, text: `m${index}` });
    await until(() => telegram.sent.length === 4, "busy sentence");
    expect(agent.received).toHaveLength(5);
    expect(telegram.sent[3]?.text).toMatch(/wait for the answers/);
    for (let index = 0; index < 8; index += 1) telegram.say({ chatId: 42, text: `later${index}` });
    await until(() => telegram.sent.some((entry) => /too many messages/i.test(entry.text)), "rate sentence");
    expect(telegram.sent.filter((entry) => /too many messages/i.test(entry.text))).toHaveLength(1);
  });

  it("a long answer is split in parts and the rest is cut with a note", () => {
    const parts = splitAnswer(`${"a".repeat(3900)}\n${"b".repeat(3900)}\n${"c".repeat(3900)}`);
    expect(parts.length).toBe(3);
    expect(parts.every((part) => part.length <= MESSENGER_LIMITS.outgoingPart)).toBe(true);
    const huge = splitAnswer("z".repeat(MESSENGER_LIMITS.outgoingPart * (MESSENGER_LIMITS.outgoingParts + 3)));
    expect(huge).toHaveLength(MESSENGER_LIMITS.outgoingParts + 1);
    expect(huge.at(-1)).toMatch(/cut/);
  });

  it("a chat that blocked the bot does not stop the others", async () => {
    const { bridge, telegram, agent } = await setup();
    await bridge.connect("telegram", TOKEN);
    bridge.allowChat({ kind: "telegram", chatId: "1", botId: "chief" });
    bridge.allowChat({ kind: "telegram", chatId: "2", botId: "chief" });
    telegram.blockedChat = 1;
    telegram.say({ chatId: 1, text: "a" });
    telegram.say({ chatId: 2, text: "b" });
    await until(() => agent.received.length === 2, "both passed on");
    agent.replies.set("m1", { state: "done", text: "for blocked" });
    agent.replies.set("m2", { state: "done", text: "for open" });
    await bridge.whenAnswered();
    expect(telegram.sent).toEqual([{ chatId: 2, text: "for open" }]);
  });
});

describe("Telegram bridge: failures and restart (W10-KK2)", () => {
  it("a network failure shows why and recovers by itself; the token stays", async () => {
    const { bridge, telegram, agent } = await setup();
    await bridge.connect("telegram", TOKEN);
    bridge.allowChat({ kind: "telegram", chatId: "42", botId: "chief" });
    await until(() => telegram.calls.some((call) => call.method === "getUpdates"), "polling");
    telegram.failWith = { status: 502, times: 2 };
    telegram.say({ chatId: 42, text: "after the outage" });
    await until(() => bridge.status("telegram").phase === "failed", "failed phase");
    expect(bridge.status("telegram")).toMatchObject({ tokenSaved: true });
    expect(bridge.status("telegram").reason).toMatch(/cannot be reached/);
    await until(() => agent.received.length === 1, "passed on");
    await until(() => bridge.status("telegram").phase === "connected", "connected again");
  });

  it("Telegram asking to slow down is waited for, not hammered", async () => {
    const { bridge, telegram } = await setup();
    await bridge.connect("telegram", TOKEN);
    await until(() => telegram.calls.some((call) => call.method === "getUpdates"), "polling");
    telegram.failWith = { status: 429, times: 1, retryAfter: 1 };
    await until(() => bridge.status("telegram").phase === "failed", "failed phase");
    expect(bridge.status("telegram").reason).toMatch(/slow down/);
    await until(() => bridge.status("telegram").phase === "connected", "connected again", 6000);
  });

  it("a token that is revoked later stops the loop and says so; the token stays for the person to replace", async () => {
    const { bridge, telegram } = await setup();
    await bridge.connect("telegram", TOKEN);
    await until(() => telegram.calls.some((call) => call.method === "getUpdates"), "polling");
    telegram.failWith = { status: 401, times: 100 };
    await until(() => bridge.status("telegram").phase === "failed", "failed phase");
    const status = bridge.status("telegram");
    expect(status.reason).toMatch(/does not accept the token/);
    expect(status.tokenSaved).toBe(true);
    const calls = telegram.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(telegram.calls.length).toBe(calls);
    expect(everything([status])).not.toContain(TOKEN);
  });

  it("after a restart the saved token listens again, and a message already taken is not taken twice", async () => {
    const first = await setup();
    await first.bridge.connect("telegram", TOKEN);
    first.bridge.allowChat({ kind: "telegram", chatId: "42", botId: "chief" });
    first.telegram.say({ chatId: 42, text: "once" });
    await until(() => first.agent.received.length === 1, "passed on");
    await until(
      () => first.telegram.calls.filter((call) => call.method === "getUpdates" && call.offset !== null).length >= 1,
      "confirmed",
    );
    await first.bridge.stop();
    // A new program run on the same database: same token, same list.
    const again = first.make();
    again.resume();
    expect(again.status("telegram")).toMatchObject({ phase: "connecting", tokenSaved: true });
    first.telegram.say({ chatId: 42, text: "twice" });
    await until(() => first.agent.received.length === 2, "second passed on");
    expect(first.agent.received.map((entry) => entry.text)).toEqual(["[Telegram] once", "[Telegram] twice"]);
    expect(again.status("telegram").phase).toBe("connected");
    expect(again.status("telegram").allowedChats).toHaveLength(1);
  });

  it("a token that cannot be read any more (another computer's safe) is dropped quietly", async () => {
    const { make, database } = await setup();
    database.connection.exec(
      "CREATE TABLE IF NOT EXISTS projection_messengers (kind TEXT PRIMARY KEY, token_enc TEXT, next_offset INTEGER, bot_username TEXT, connected_at TEXT)",
    );
    database.connection
      .prepare("INSERT INTO projection_messengers (kind, token_enc) VALUES ('telegram', 'garbage')")
      .run();
    const bridge = make();
    expect(() => bridge.resume()).not.toThrow();
    expect(bridge.status("telegram")).toMatchObject({ phase: "disconnected", tokenSaved: false });
  });

  it("another space has its own database: its bridge does not see this token or list", async () => {
    const one = await setup();
    await one.bridge.connect("telegram", TOKEN);
    one.bridge.allowChat({ kind: "telegram", chatId: "42", botId: "chief" });
    const two = await setup();
    expect(two.bridge.status("telegram")).toMatchObject({ phase: "disconnected", tokenSaved: false, allowedChats: [] });
  });
});

describe("the agent port (W10-KK2)", () => {
  const conversation = (
    messages: Array<{
      id: string;
      turnId?: string;
      author: string;
      text: string;
      status: "streaming" | "completed" | "failed" | "interrupted";
      itemType?: string;
    }>,
    activeTurnId: string | null = null,
  ): AgentConversationPort => ({
    listBots: () => [{ id: "chief" }],
    sendMessage: async () => ({ messageId: "mine" }),
    readConversation: async () => ({ activeTurnId, messages }),
  });
  const mine = { id: "mine", turnId: "t1", author: "user", text: "[Telegram] hi", status: "completed" } as const;

  it("knows its agents and passes the message on", async () => {
    const port = createAgentPort(conversation([]));
    expect(port.hasAgent("chief")).toBe(true);
    expect(port.hasAgent("other")).toBe(false);
    expect(await port.send("chief", "hi")).toBe("mine");
  });

  it("waits while the message is not in the conversation, has no turn yet, or the turn is running or streaming", async () => {
    expect(await createAgentPort(conversation([])).reply("chief", "mine")).toEqual({ state: "pending" });
    expect(await createAgentPort(conversation([{ ...mine, turnId: undefined }])).reply("chief", "mine")).toEqual({
      state: "pending",
    });
    expect(await createAgentPort(conversation([mine], "t1")).reply("chief", "mine")).toEqual({ state: "pending" });
    const streaming = { id: "a1", turnId: "t1", author: "assistant", text: "par", status: "streaming" } as const;
    expect(await createAgentPort(conversation([mine, streaming])).reply("chief", "mine")).toEqual({ state: "pending" });
  });

  it("answers with the final texts of its own turn only, without commentary and without other turns", async () => {
    const reply = await createAgentPort(
      conversation([
        { id: "old", turnId: "t0", author: "assistant", text: "an older answer", status: "completed" },
        mine,
        {
          id: "c",
          turnId: "t1",
          author: "assistant",
          text: "thinking aloud",
          status: "completed",
          itemType: "commentary",
        },
        { id: "a1", turnId: "t1", author: "assistant", text: " The answer. ", status: "completed" },
        { id: "next", turnId: "t2", author: "assistant", text: "another turn", status: "completed" },
      ]),
    ).reply("chief", "mine");
    expect(reply).toEqual({ state: "done", text: "The answer." });
  });

  it("a failed or interrupted turn is a failure; a turn that said nothing in text is done with no text", async () => {
    const failed = { id: "a1", turnId: "t1", author: "assistant", text: "boom", status: "failed" } as const;
    expect(await createAgentPort(conversation([mine, failed])).reply("chief", "mine")).toEqual({ state: "failed" });
    const tool = { id: "x", turnId: "t1", author: "system", text: "ran a tool", status: "completed" } as const;
    expect(await createAgentPort(conversation([mine, tool])).reply("chief", "mine")).toEqual({
      state: "done",
      text: "",
    });
  });
});
