// @vitest-environment node
// COSGRAL W12-KK (2): the Slack part of the messenger contract and its mock. Test values only.
import {
  type AgentEvent,
  isConversationIdFor,
  isMessengerList,
  isMessengerStatus,
  isSlackAppToken,
  isSlackBotToken,
  MESSENGER_FAILURE_SENTENCES,
  MESSENGER_KINDS,
  messengerDescriptor,
  messengerSecretFields,
  parseAllowChatInput,
  parseConnectMessengerInput,
  parseRemoveChatInput,
} from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockMessengers } from "./mock-messengers";

const BOT = `xoxb-${"1234567890-".repeat(3)}abcDEF`;
const APP = `xapp-1-A01-${"9876543210-".repeat(3)}abcDEF`;
// Built from pieces on purpose: a whole token-shaped text in the source is refused by secret scanning, fake or not.
const DISCORD = `${"MTIzNDU2Nzg5"}${"MDEyMzQ1Njc4"}.GabcDE.${"abcdefghijklmnopqrstuvwxyz"}0123456789ABC`;

const setup = () => {
  const events: AgentEvent[] = [];
  return { api: createMockMessengers((event) => events.push(event)), events };
};

describe("Slack in the messenger contract (W12-KK 2)", () => {
  it("knows the shape of its tokens and of a direct-message id, and nothing else", () => {
    expect(isSlackBotToken(BOT)).toBe(true);
    expect(isSlackBotToken(APP)).toBe(false);
    expect(isSlackAppToken(APP)).toBe(true);
    expect(isSlackAppToken(BOT)).toBe(false);
    expect(isConversationIdFor("slack", "D01ABC23DEF")).toBe(true);
    expect(isConversationIdFor("slack", "C01ABC23DEF")).toBe(false);
    expect(isConversationIdFor("slack", "42")).toBe(false);
    expect(isConversationIdFor("telegram", "42")).toBe(true);
    expect(isConversationIdFor("telegram", "D01ABC23DEF")).toBe(false);
  });

  it("Slack needs both tokens, Telegram only one, and an error never repeats what was typed", () => {
    expect(parseConnectMessengerInput({ kind: "slack", token: BOT, appToken: APP })).toEqual({
      kind: "slack",
      token: BOT,
      appToken: APP,
    });
    expect(() => parseConnectMessengerInput({ kind: "slack", token: BOT })).toThrow(/app-level token/);
    expect(() => parseConnectMessengerInput({ kind: "slack", token: "secret-value-123", appToken: APP })).toThrow(
      /bot token/,
    );
    try {
      parseConnectMessengerInput({ kind: "slack", token: "secret-value-123", appToken: "secret-app-456" });
    } catch (error) {
      expect(String(error)).not.toContain("secret-value-123");
      expect(String(error)).not.toContain("secret-app-456");
    }
    expect(() =>
      parseConnectMessengerInput({ kind: "telegram", token: `123456789:${"A".repeat(35)}`, appToken: APP }),
    ).toThrow(/one token/);
    expect(messengerSecretFields("slack").map((field) => field.id)).toEqual(["token", "appToken"]);
    expect(messengerSecretFields("telegram").map((field) => field.id)).toEqual(["token"]);
  });

  it("allow list entries follow the id rule of their messenger", () => {
    expect(parseAllowChatInput({ kind: "slack", chatId: "D01ABC23DEF", botId: "chief" })).toMatchObject({
      chatId: "D01ABC23DEF",
    });
    expect(() => parseAllowChatInput({ kind: "slack", chatId: "C01ABC23DEF", botId: "chief" })).toThrow(
      /direct message/,
    );
    expect(() => parseRemoveChatInput({ kind: "slack", chatId: "123" })).toThrow(/direct message/);
    expect(() => parseAllowChatInput({ kind: "telegram", chatId: "D01ABC23DEF", botId: "chief" })).toThrow(
      /digits only/,
    );
  });
});

describe("mock Slack (W12-KK 2)", () => {
  it("connects with both tokens and never gives either back", async () => {
    const { api, events } = setup();
    const status = await api.connect({ kind: "slack", token: BOT, appToken: APP });
    expect(isMessengerStatus(status)).toBe(true);
    expect(status).toMatchObject({ kind: "slack", phase: "connected", tokenSaved: true, botUsername: "@cosgral_demo" });
    const everything = JSON.stringify([await api.list(), events]);
    expect(everything).not.toContain(BOT);
    expect(everything).not.toContain(APP);
    expect(isMessengerList(await api.list())).toBe(true);
    // Telegram is untouched by Slack's connection.
    expect((await api.status({ kind: "telegram" })).phase).toBe("disconnected");
  });

  it("nobody is allowed by default; an allowed direct message is forwarded, an unknown one is only remembered by id and name", async () => {
    const { api } = setup();
    await api.connect({ kind: "slack", token: BOT, appToken: APP });
    expect(api.simulate.incoming({ kind: "slack", chatId: "D0STRANGER1", label: "Stranger", text: "hello" })).toBe(
      "ignored",
    );
    const seen = await api.status({ kind: "slack" });
    expect(seen.unknownChats).toEqual([
      expect.objectContaining({ chatId: "D0STRANGER1", label: "Stranger", count: 1 }),
    ]);
    expect(JSON.stringify(seen)).not.toContain("hello");
    await api.allowChat({ kind: "slack", chatId: "D0STRANGER1", botId: "bot-1" });
    expect((await api.status({ kind: "slack" })).unknownChats).toEqual([]);
    expect(api.simulate.incoming({ kind: "slack", chatId: "D0STRANGER1", text: "hello again" })).toBe("forwarded");
    expect((await api.status({ kind: "slack" })).counts).toEqual({ forwarded: 1, replied: 0, ignored: 1 });
  });

  it("a refused token and a network failure show Slack's own fixed sentences", async () => {
    const { api } = setup();
    await api.connect({ kind: "slack", token: BOT, appToken: APP });
    api.simulate.networkDown("slack");
    expect(await api.status({ kind: "slack" })).toMatchObject({
      phase: "failed",
      reason: MESSENGER_FAILURE_SENTENCES.slack.network,
    });
    api.simulate.networkUp("slack");
    api.simulate.tokenRefused("slack");
    const refused = await api.status({ kind: "slack" });
    expect(refused).toMatchObject({ phase: "failed", reason: MESSENGER_FAILURE_SENTENCES.slack.tokenRefused });
    expect(isMessengerStatus(refused)).toBe(true);
    expect(refused.reason).toContain("Slack");
  });
});

describe("the descriptor the settings window draws from (W12-KK)", () => {
  it("every messenger has its secret fields, the private-only rule, an id hint and ordered steps, as fixed text", () => {
    for (const kind of MESSENGER_KINDS) {
      const descriptor = messengerDescriptor(kind);
      expect(descriptor).toMatchObject({ kind, privateOnly: true });
      expect(descriptor.label.length).toBeGreaterThan(0);
      expect(descriptor.secrets.length).toBeGreaterThan(0);
      expect(descriptor.conversationIdHint.length).toBeGreaterThan(20);
      expect(descriptor.setupSteps.length).toBeGreaterThanOrEqual(3);
      // Fixed text: nothing of a token's shape is in it.
      expect(JSON.stringify(descriptor)).not.toMatch(
        /xoxb-[A-Za-z0-9]{10}|xapp-[A-Za-z0-9]{10}|\d{8,}:[A-Za-z0-9_-]{20}/,
      );
    }
    expect(messengerDescriptor("slack").secrets.map((field) => field.id)).toEqual(["token", "appToken"]);
    expect(messengerDescriptor("slack").conversationIdHint).toMatch(/Channels are not allowed/);
    expect(messengerDescriptor("telegram").secrets).toHaveLength(1);
  });

  it("the list, the status and every event hold no secret after connecting; the list has one entry per messenger in a fixed order", async () => {
    const { api, events } = setup();
    await api.connect({ kind: "telegram", token: `123456789:${"A".repeat(35)}` });
    await api.connect({ kind: "slack", token: BOT, appToken: APP });
    await api.connect({ kind: "discord", token: DISCORD });
    const list = await api.list();
    expect(list.messengers.map((entry) => entry.kind)).toEqual([...MESSENGER_KINDS]);
    expect(list.messengers.every((entry) => entry.tokenSaved && entry.phase === "connected")).toBe(true);
    const everything = JSON.stringify([list, events]);
    expect(everything).not.toContain(BOT);
    expect(everything).not.toContain(APP);
    expect(everything).not.toContain("A".repeat(35));
    expect(everything).not.toContain(DISCORD);
    expect(list.messengers.find((entry) => entry.kind === "discord")?.botUsername).toBe("@cosgral_discord");
  });
});
