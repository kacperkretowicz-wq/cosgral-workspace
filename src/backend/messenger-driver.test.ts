// @vitest-environment node
// COSGRAL W12-KK (2, step 0): the bridge works on ANY driver (here a fake one), and a driver's failure becomes a fixed sentence.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { type MessengerAgentPort, MessengerBridge } from "./messenger-bridge";
import { type InboundMessage, type MessengerDriver, MessengerFailure } from "./messenger-driver";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import type { SecretBox } from "./vault-store";

const box: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => `box:${Buffer.from(plain, "utf8").toString("base64")}`,
  decrypt: (cipher) => Buffer.from(cipher.slice(4), "base64").toString("utf8"),
};

class FakeDriver implements MessengerDriver {
  readonly sent: Array<{ chatId: string; text: string }> = [];
  closed = 0;
  queue: InboundMessage[][] = [];
  connectFailure: MessengerFailure | null = null;
  cursors: Array<number | null> = [];
  async connect() {
    if (this.connectFailure) throw this.connectFailure;
    return "@fake";
  }
  async identify() {
    return "@fake";
  }
  async receive(from: number | null, _wait: number, signal: AbortSignal) {
    this.cursors.push(from);
    const batch = this.queue.shift();
    if (batch) return batch;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 15);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve(undefined);
      });
    });
    return [];
  }
  async send(chatId: string, text: string) {
    this.sent.push({ chatId, text });
  }
  close() {
    this.closed += 1;
  }
}

class FakeAgent implements MessengerAgentPort {
  readonly received: string[] = [];
  hasAgent() {
    return true;
  }
  async send(_botId: string, text: string) {
    this.received.push(text);
    return "m1";
  }
  async reply() {
    return { state: "done" as const, text: "answer" };
  }
}

const folders: string[] = [];
const bridges: MessengerBridge[] = [];
afterEach(async () => {
  for (const bridge of bridges.splice(0)) await bridge.stop();
  closeTestDatabases();
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function setup(driver: FakeDriver) {
  const folder = await mkdtemp(join(tmpdir(), "cosgral-driver-"));
  folders.push(folder);
  const database = testDatabase(join(folder, "data"));
  await database.initialize();
  const events: AgentEvent[] = [];
  const agent = new FakeAgent();
  const bridge = new MessengerBridge({
    database,
    box,
    agent,
    spaceId: "main",
    emit: (event) => events.push(event),
    drivers: { telegram: () => driver },
    pollSeconds: 1,
    retryMs: 10,
    maxRetryMs: 20,
    replyPollMs: 10,
  });
  bridges.push(bridge);
  return { bridge, agent, events };
}

async function until(check: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("Timed out in the test");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("messenger driver (W12-KK step 0)", () => {
  it("the bridge passes an allowed private chat to the agent and the answer back, through any driver", async () => {
    const driver = new FakeDriver();
    const { bridge, agent } = await setup(driver);
    const status = await bridge.connect("telegram", "123456789:secret-token-value");
    expect(status).toMatchObject({ phase: "connected", botUsername: "@fake" });
    bridge.allowChat({ kind: "telegram", chatId: "42", botId: "chief" });
    driver.queue.push([
      { next: 11, chat: { id: "42", kind: "private", title: "Anna" }, text: "hello" },
      { next: 12, chat: { id: "99", kind: "private", title: "Stranger" }, text: "let me in" },
      { next: 13, chat: { id: "-5", kind: "other", title: "A group" }, text: "group text" },
      { next: null, chat: null, text: null },
    ]);
    await until(() => driver.sent.length > 0);
    expect(agent.received).toEqual(["[Telegram] hello"]);
    expect(driver.sent).toEqual([{ chatId: "42", text: "answer" }]);
    const unknown = bridge.status("telegram").unknownChats;
    expect(unknown.map((chat) => chat.chatId)).toEqual(["99"]);
    // The `next` of the last message that had one is stored: the next receive continues from it.
    await until(() => driver.cursors.some((cursor) => cursor === 13));
  });

  it("a driver's refusal at connect is only its fixed sentence, the driver is closed, and nothing is saved", async () => {
    const driver = new FakeDriver();
    driver.connectFailure = new MessengerFailure("token-refused", "The service does not accept the token.");
    const { bridge } = await setup(driver);
    await expect(bridge.connect("telegram", "123456789:secret-token-value")).rejects.toThrow(
      "The service does not accept the token.",
    );
    expect(driver.closed).toBe(1);
    expect(bridge.status("telegram")).toMatchObject({ phase: "disconnected", tokenSaved: false });
  });

  it("disconnecting closes the driver", async () => {
    const driver = new FakeDriver();
    const { bridge } = await setup(driver);
    await bridge.connect("telegram", "123456789:secret-token-value");
    await bridge.disconnect("telegram");
    expect(driver.closed).toBeGreaterThan(0);
  });
});
