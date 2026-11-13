// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, BrowserTab, DraftPreviewResolution } from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import type { CardContext } from "./action-cards";
import type { DynamicToolCallParams, DynamicToolResult } from "./protocol";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { totp } from "./totp";
import { type SecretBox, VaultStore } from "./vault-store";
import { VaultRequests, VaultTools } from "./vault-tools";

// Test data only.
const PASSWORD = "Test-Pass-1234!";
const OTHER_PASSWORD = "Other-Pass-5678!";
const TWO_STEP = "JBSWY3DPEHPK3PXP";
const NOW = 1_700_000_000_000;
const box: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => `box:${Buffer.from(plain).toString("base64")}`,
  decrypt: (cipher) => Buffer.from(cipher.slice(4), "base64").toString(),
};
const context: CardContext = { botId: "chief", threadId: "public", providerThreadId: "raw", turnId: "turn" };

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function tab(url: string, id = "tab-1"): BrowserTab {
  return { id, title: "Page", url, loading: false, ownerThreadId: null, ownerBotId: null };
}

async function setup(options: { tabs?: BrowserTab[]; decision?: DraftPreviewResolution; encrypt?: boolean } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "vault-tools-"));
  roots.push(dir);
  const database = testDatabase(join(dir, "data"));
  await database.initialize();
  const store = new VaultStore(database, options.encrypt === false ? { ...box, canEncrypt: () => false } : box);
  const events: AgentEvent[] = [];
  const typed: Array<{ tabId: string; ref: string; value: string }> = [];
  const confirmations: Array<{ title: string; preview: string }> = [];
  let sequence = 0;
  const requests = new VaultRequests({
    emit: (event) => events.push(event),
    order: () => ({ createdAt: new Date(NOW).toISOString(), sequence: ++sequence }),
    store: () => store,
  });
  const tools = new VaultTools({
    store: () => store,
    requests,
    browser: {
      tabs: () => options.tabs ?? [tab("https://bank.example/login")],
      typeSecret: async (tabId, _revision, ref, value) => {
        typed.push({ tabId, ref, value });
      },
    },
    confirm: async (_context, input) => {
      confirmations.push({ title: input.title, preview: input.preview });
      return options.decision ?? "send";
    },
    now: () => NOW,
  });
  return { store, tools, requests, events, typed, confirmations };
}

function call(tool: string, args: unknown): DynamicToolCallParams {
  return { threadId: "raw", turnId: "turn", callId: `${tool}-call`, namespace: "cosgral_vault", tool, arguments: args };
}

function payload(result: DynamicToolResult): DynamicRecord {
  const item = result.contentItems[0];
  if (item?.type !== "inputText") throw new Error("Expected a text result.");
  const value = JSON.parse(item.text);
  if (!isDynamicRecord(value)) throw new Error("Expected a JSON object.");
  return value;
}

function savedId(result: DynamicRecord): string {
  const saved = result.saved;
  if (!isDynamicRecord(saved) || !isString(saved.id)) throw new Error("Expected a saved item.");
  return saved.id;
}

function text(result: DynamicToolResult): string {
  const item = result.contentItems[0];
  return item?.type === "inputText" ? item.text : "";
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("vault tools", () => {
  it("lists items for the agent without any secret value", async () => {
    const { store, tools } = await setup();
    store.save({
      kind: "login",
      url: "https://bank.example",
      username: "tester",
      password: PASSWORD,
      twoStepKey: TWO_STEP,
    });
    store.save({ kind: "apiKey", name: "TEST_API_KEY", value: "test-key-1234" });
    const result = await tools.handleDynamicTool(call("list_vault_items", {}), context);
    expect(payload(result)).toMatchObject({ items: [{ kind: "apiKey" }, { kind: "login", username: "tester" }] });
    for (const secret of [PASSWORD, TWO_STEP, "test-key-1234"]) expect(text(result)).not.toContain(secret);
  });

  it("types the login of the page's site into the page and never returns the password", async () => {
    const { store, tools, typed } = await setup();
    const login = store.save({ kind: "login", url: "https://bank.example", username: "tester", password: PASSWORD });
    const result = await tools.handleDynamicTool(
      call("fill_login", { tabId: "tab-1", revision: 3, usernameRef: "3:1", passwordRef: "3:2" }),
      context,
    );
    expect(result.success).toBe(true);
    expect(payload(result)).toMatchObject({
      filled: ["username", "password"],
      item: { id: login.id, username: "tester" },
    });
    expect(text(result)).not.toContain(PASSWORD);
    expect(typed).toEqual([
      { tabId: "tab-1", ref: "3:1", value: "tester" },
      { tabId: "tab-1", ref: "3:2", value: PASSWORD },
    ]);
  });

  it("never types a login into another site and says when the Vault has no login for the site", async () => {
    const { store, tools, typed } = await setup({ tabs: [tab("https://evil.example/login")] });
    const login = store.save({ kind: "login", url: "https://bank.example", username: "tester", password: PASSWORD });
    const refused = await tools.handleDynamicTool(
      call("fill_login", { tabId: "tab-1", revision: 1, passwordRef: "1:2", itemId: login.id }),
      context,
    );
    expect(refused.success).toBe(false);
    expect(text(refused)).toMatch(/another site/);
    const missing = await tools.handleDynamicTool(
      call("fill_login", { tabId: "tab-1", revision: 1, passwordRef: "1:2" }),
      context,
    );
    expect(missing.success).toBe(false);
    expect(text(missing)).toMatch(/request_vault_item/);
    expect(typed).toEqual([]);
  });

  it("asks the person to choose when several logins match, and types only the chosen one", async () => {
    const { store, tools, requests, events, typed } = await setup();
    store.save({ kind: "login", url: "https://bank.example", username: "first", password: PASSWORD });
    const second = store.save({
      kind: "login",
      url: "https://bank.example",
      username: "second",
      password: OTHER_PASSWORD,
    });
    const pending = tools.handleDynamicTool(
      call("fill_login", { tabId: "tab-1", revision: 2, passwordRef: "2:2" }),
      context,
    );
    await tick();
    const request = events.find((event) => event.type === "vault-request");
    if (request?.type !== "vault-request") throw new Error("Expected a vault request.");
    expect(request.request).toMatchObject({
      mode: "choose",
      kind: "login",
      candidateIds: expect.arrayContaining([second.id]),
    });
    expect(requests.listPending()).toHaveLength(1);
    expect(requests.pendingCount("chief")).toBe(1);
    expect(() => requests.respond({ requestId: request.request.requestId, itemId: "not-a-candidate" })).toThrow();
    requests.respond({ requestId: request.request.requestId, itemId: second.id });
    expect((await pending).success).toBe(true);
    expect(typed).toEqual([{ tabId: "tab-1", ref: "2:2", value: OTHER_PASSWORD }]);
    expect(events.at(-1)).toEqual({
      type: "vault-request-resolved",
      requestId: request.request.requestId,
      botId: "chief",
      resolution: "provided",
    });
  });

  it("types the current two-step code without showing it, and needs the person's confirmation for a card", async () => {
    const { store, tools, typed, confirmations } = await setup({ tabs: [tab("https://bank.example/2fa")] });
    store.save({
      kind: "login",
      url: "https://bank.example",
      username: "tester",
      password: PASSWORD,
      twoStepKey: TWO_STEP,
    });
    const code = totp({ secret: TWO_STEP }, NOW);
    const filled = await tools.handleDynamicTool(
      call("fill_totp", { tabId: "tab-1", revision: 1, ref: "1:5" }),
      context,
    );
    expect(filled.success).toBe(true);
    expect(text(filled)).not.toContain(code);
    expect(typed).toEqual([{ tabId: "tab-1", ref: "1:5", value: code }]);

    const card = store.save({
      kind: "card",
      holderName: "Test Holder",
      number: "4242 4242 4242 4242",
      expiryMonth: 12,
      expiryYear: 2029,
      cvc: "123",
    });
    const paid = await tools.handleDynamicTool(
      call("fill_card", {
        tabId: "tab-1",
        revision: 1,
        itemId: card.id,
        numberRef: "1:7",
        expiryRef: "1:8",
        cvcRef: "1:9",
      }),
      context,
    );
    expect(confirmations[0]?.preview).toContain("•••• 4242");
    expect(confirmations[0]?.preview).not.toContain("4242424242424242");
    expect(payload(paid)).toMatchObject({ outcome: "filled", filled: ["number", "expiry", "cvc"] });
    expect(text(paid)).not.toContain("4242424242424242");
    expect(typed.slice(1).map((entry) => entry.value)).toEqual(["4242424242424242", "12/29", "123"]);
  });

  it("does not type a card the person did not confirm", async () => {
    const { store, tools, typed } = await setup({ decision: "keep-draft" });
    const card = store.save({
      kind: "card",
      holderName: "Test Holder",
      number: "4242 4242 4242 4242",
      expiryMonth: 12,
      expiryYear: 2029,
    });
    const result = await tools.handleDynamicTool(
      call("fill_card", { tabId: "tab-1", revision: 1, itemId: card.id, numberRef: "1:7" }),
      context,
    );
    expect(payload(result)).toMatchObject({ outcome: "not-confirmed" });
    expect(typed).toEqual([]);
  });

  it("asks the person to add a missing item and continues with what they saved, or stops when declined", async () => {
    const { store, tools, requests, events } = await setup();
    const pending = tools.handleDynamicTool(
      call("request_vault_item", { kind: "apiKey", reason: "The weather tool needs a key", name: "WEATHER_API_KEY" }),
      context,
    );
    await tick();
    const request = events.find((event) => event.type === "vault-request");
    if (request?.type !== "vault-request") throw new Error("Expected a vault request.");
    expect(request.request).toMatchObject({ mode: "add", kind: "apiKey", label: "WEATHER_API_KEY" });
    const saved = store.save({ kind: "apiKey", name: "WEATHER_API_KEY", value: "weather-key-0000" });
    requests.respond({ requestId: request.request.requestId, itemId: saved.id });
    const result = await pending;
    expect(payload(result)).toMatchObject({ outcome: "provided", item: { id: saved.id, name: "WEATHER_API_KEY" } });
    expect(text(result)).not.toContain("weather-key-0000");

    const declined = tools.handleDynamicTool(
      call("request_vault_item", { kind: "card", reason: "Pay the test order" }),
      context,
    );
    await tick();
    const second = events.findLast((event) => event.type === "vault-request");
    if (second?.type !== "vault-request") throw new Error("Expected a vault request.");
    requests.respond({ requestId: second.request.requestId, decline: true });
    expect(payload(await declined)).toMatchObject({ outcome: "declined" });

    const expired = tools.handleDynamicTool(
      call("request_vault_item", { kind: "contact", reason: "Shipping" }),
      context,
    );
    await tick();
    requests.expireTurn("raw", "turn");
    expect(payload(await expired)).toMatchObject({ outcome: "expired" });
    expect(requests.listPending()).toEqual([]);
  });

  it("saves an API key, a login and a two-step key the user gave, and returns no value", async () => {
    const { store, tools } = await setup();
    const key = await tools.handleDynamicTool(
      call("save_api_key", { name: "TEST_API_KEY", value: "test-key-9999" }),
      context,
    );
    expect(payload(key)).toMatchObject({ saved: { kind: "apiKey", name: "TEST_API_KEY" } });
    expect(text(key)).not.toContain("test-key-9999");
    expect(store.resolveApiKey("TEST_API_KEY")).toBe("test-key-9999");
    const login = await tools.handleDynamicTool(
      call("save_login", { url: "https://bank.example", username: "tester", password: PASSWORD }),
      context,
    );
    const loginId = savedId(payload(login));
    expect(text(login)).not.toContain(PASSWORD);
    const again = await tools.handleDynamicTool(
      call("save_login", { url: "https://bank.example/other", username: "tester", password: OTHER_PASSWORD }),
      context,
    );
    expect(savedId(payload(again))).toBe(loginId);
    expect(store.list({ kind: "login" })).toHaveLength(1);
    const twoStep = await tools.handleDynamicTool(
      call("save_two_step_key", { itemId: loginId, setupKey: TWO_STEP }),
      context,
    );
    expect(payload(twoStep)).toMatchObject({ saved: { hasTwoStepKey: true } });
    expect(text(twoStep)).not.toContain(TWO_STEP);
  });

  it("refuses to save when the computer cannot encrypt", async () => {
    const { tools } = await setup({ encrypt: false });
    const result = await tools.handleDynamicTool(
      call("save_api_key", { name: "TEST_API_KEY", value: "test-key-9999" }),
      context,
    );
    expect(result.success).toBe(false);
    expect(text(result)).toMatch(/encrypt/);
    expect(text(result)).not.toContain("test-key-9999");
  });
});
