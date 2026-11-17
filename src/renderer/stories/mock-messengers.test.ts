// @vitest-environment node
import {
  type AgentEvent,
  isMessengerList,
  isMessengerStatus,
  isMessengersChanged,
  isTelegramToken,
  normalizeChatLabel,
  parseAllowChatInput,
  parseConnectMessengerInput,
} from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockMessengers } from "./mock-messengers";

const TOKEN = `123456789:${"A".repeat(35)}`;

const setup = () => {
  const events: AgentEvent[] = [];
  return { api: createMockMessengers((event) => events.push(event)), events };
};

describe("mock messengers (W10-KK2)", () => {
  it("starts disconnected with nobody allowed, and valid", async () => {
    const { api } = setup();
    const list = await api.list();
    expect(isMessengerList(list)).toBe(true);
    expect(list.messengers.map((entry) => entry.kind)).toEqual(["telegram", "slack"]);
    expect(list.messengers[0]).toMatchObject({
      kind: "telegram",
      phase: "disconnected",
      tokenSaved: false,
      allowedChats: [],
    });
  });

  it("connecting saves the token without ever giving it back", async () => {
    const { api, events } = setup();
    const status = await api.connect({ kind: "telegram", token: TOKEN });
    expect(isMessengerStatus(status)).toBe(true);
    expect(status).toMatchObject({ phase: "connected", tokenSaved: true, botUsername: "@demo_helper_bot" });
    expect(JSON.stringify(await api.list())).not.toContain(TOKEN);
    expect(JSON.stringify(events)).not.toContain(TOKEN);
    expect(isMessengersChanged(events.at(-1))).toBe(true);
  });

  it("a token with a wrong shape is refused and never repeated", () => {
    expect(isTelegramToken(TOKEN)).toBe(true);
    expect(isTelegramToken("not a token")).toBe(false);
    expect(() => parseConnectMessengerInput({ kind: "telegram", token: "secret-value-123" })).toThrow(/bot token/);
    try {
      parseConnectMessengerInput({ kind: "telegram", token: "secret-value-123" });
    } catch (error) {
      expect(String(error)).not.toContain("secret-value-123");
    }
    expect(() => parseConnectMessengerInput({ kind: "signal", token: TOKEN })).toThrow(/messenger is one of/);
  });

  it("nobody is allowed by default: an unknown chat is ignored and only its number and name are remembered", async () => {
    const { api } = setup();
    await api.connect({ kind: "telegram", token: TOKEN });
    expect(api.simulate.incoming({ chatId: "555", label: "Stranger", text: "hello" })).toBe("ignored");
    const status = await api.status({ kind: "telegram" });
    expect(status.counts).toEqual({ forwarded: 0, replied: 0, ignored: 1 });
    expect(status.unknownChats).toEqual([expect.objectContaining({ chatId: "555", label: "Stranger", count: 1 })]);
    expect(JSON.stringify(status)).not.toContain("hello");
  });

  it("an allowed chat is forwarded, the answer is counted, and allowing removes it from the unknown ones", async () => {
    const { api } = setup();
    await api.connect({ kind: "telegram", token: TOKEN });
    api.simulate.incoming({ chatId: "555", label: "Me", text: "hi" });
    await api.allowChat({ kind: "telegram", chatId: "555", botId: "bot-1" });
    expect((await api.status({ kind: "telegram" })).unknownChats).toEqual([]);
    expect(api.simulate.incoming({ chatId: "555", text: "hi" })).toBe("forwarded");
    api.simulate.replied();
    expect((await api.status({ kind: "telegram" })).counts).toEqual({ forwarded: 1, replied: 1, ignored: 1 });
    expect((await api.removeChat({ kind: "telegram", chatId: "555" })).messengers[0]?.allowedChats).toEqual([]);
    expect(api.simulate.incoming({ chatId: "555", text: "hi" })).toBe("ignored");
  });

  it("disconnect removes the token and keeps the allow list; nothing is forwarded while disconnected", async () => {
    const { api } = setup();
    await api.connect({ kind: "telegram", token: TOKEN });
    await api.allowChat({ kind: "telegram", chatId: "7", botId: "bot-1", label: "Phone" });
    const list = await api.disconnect({ kind: "telegram" });
    expect(list.messengers[0]).toMatchObject({ phase: "disconnected", tokenSaved: false, botUsername: null });
    expect(list.messengers[0]?.allowedChats).toHaveLength(1);
    expect(api.simulate.incoming({ chatId: "7", text: "hi" })).toBe("ignored");
    expect(isMessengerList(list)).toBe(true);
  });

  it("a refused token and a network failure say why; the network one recovers", async () => {
    const { api } = setup();
    await api.connect({ kind: "telegram", token: TOKEN });
    api.simulate.networkDown();
    expect(await api.status({ kind: "telegram" })).toMatchObject({ phase: "failed", tokenSaved: true });
    api.simulate.networkUp();
    expect((await api.status({ kind: "telegram" })).phase).toBe("connected");
    api.simulate.tokenRefused();
    const refused = await api.status({ kind: "telegram" });
    expect(refused).toMatchObject({ phase: "failed", tokenSaved: true });
    expect(isMessengerStatus(refused)).toBe(true);
  });

  it("the allow list is limited and bad input is refused", async () => {
    const { api } = setup();
    for (let index = 0; index < 20; index += 1)
      await api.allowChat({ kind: "telegram", chatId: String(100 + index), botId: "bot-1" });
    await expect(api.allowChat({ kind: "telegram", chatId: "999", botId: "bot-1" })).rejects.toThrow(/At most 20/);
    expect(() => parseAllowChatInput({ kind: "telegram", chatId: "-100123", botId: "bot-1" })).toThrow(/digits only/);
    expect(() => parseAllowChatInput({ kind: "telegram", chatId: "1", botId: "" })).toThrow(/agent/);
    expect(normalizeChatLabel("  two\nlines\t here ")).toBe("two lines here");
  });
});
