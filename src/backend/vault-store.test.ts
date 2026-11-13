// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VaultItemSummary } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { totp } from "./totp";
import { type SecretBox, VaultStore } from "./vault-store";

// Test data only: no real account, card or key.
const PASSWORD = "Test-Pass-1234!";
const CARD = "4242 4242 4242 4242";
const CVC = "123";
const API_KEY = "test-key-5678-abcdef";
const TWO_STEP = "JBSWY3DPEHPK3PXP";
const TOTP_SECRET = "GEZDGNBVGY3TQOJQ";
const CONTACT_EMAIL = "test.person@example.invalid";
const SECRET_VALUES = [PASSWORD, "4242424242424242", API_KEY, TWO_STEP, TOTP_SECRET, CONTACT_EMAIL, "+48 600 000 000"];

/** A reversible stand-in for Electron safeStorage: the stored text never equals the secret. */
const fakeBox: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => `box:${Buffer.from(plain, "utf8").toString("base64").split("").reverse().join("")}`,
  decrypt: (cipher) => Buffer.from(cipher.slice(4).split("").reverse().join(""), "base64").toString("utf8"),
};
const noBox: SecretBox = {
  canEncrypt: () => false,
  encrypt: () => {
    throw new Error("unavailable");
  },
  decrypt: () => {
    throw new Error("unavailable");
  },
};

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function open(box: SecretBox = fakeBox, root?: string) {
  const dir = root ?? (await mkdtemp(join(tmpdir(), "vault-store-")));
  if (!root) roots.push(dir);
  const database = testDatabase(join(dir, "data"));
  await database.initialize();
  const events: VaultItemSummary[][] = [];
  const store = new VaultStore(database, box);
  store.on("changed", (items) => events.push(items));
  return { dir, store, events };
}

async function saveAll(store: VaultStore) {
  const login = store.save({
    kind: "login",
    url: "https://bank.example/login",
    username: "tester",
    password: PASSWORD,
    twoStepKey: TWO_STEP,
  });
  const card = store.save({
    kind: "card",
    holderName: "Test Holder",
    number: CARD,
    expiryMonth: 12,
    expiryYear: 2029,
    cvc: CVC,
  });
  const contact = store.save({
    kind: "contact",
    name: "Test Person",
    email: CONTACT_EMAIL,
    phone: "+48 600 000 000",
    address: "Test Street 1, 00-000 Test City",
  });
  const apiKey = store.save({ kind: "apiKey", name: "TEST_API_KEY", value: API_KEY });
  const code = store.save({ kind: "totp", issuer: "Test Service", account: "tester", secret: TOTP_SECRET });
  return { login, card, contact, apiKey, code };
}

describe("vault store", () => {
  it("keeps every kind encrypted, lists summaries without secrets and keeps them after a restart", async () => {
    const { dir, store, events } = await open();
    const { login, card, contact, apiKey, code } = await saveAll(store);
    expect(login).toMatchObject({
      kind: "login",
      label: "bank.example",
      origin: "https://bank.example",
      username: "tester",
      hasTwoStepKey: true,
    });
    expect(card).toMatchObject({ kind: "card", label: "Card •••• 4242", cardLast4: "4242", cardExpiry: "12/29" });
    expect(contact).toMatchObject({ kind: "contact", label: "Test Person", name: "Test Person" });
    expect(apiKey).toMatchObject({ kind: "apiKey", label: "TEST_API_KEY", name: "TEST_API_KEY" });
    expect(code).toMatchObject({ kind: "totp", label: "Test Service", name: "Test Service" });
    const listed = JSON.stringify(store.list());
    for (const secret of SECRET_VALUES) expect(listed).not.toContain(secret);
    expect(JSON.stringify(events)).not.toContain(PASSWORD);
    expect(store.list({ kind: "login" })).toHaveLength(1);
    expect(store.list({ query: "bank" }).map((item) => item.id)).toEqual([login.id]);
    expect(store.status()).toEqual({ encryptionAvailable: true, items: 5 });
    closeTestDatabases();

    for (const file of ["openbot.db", "openbot.db-wal"].map((name) => join(dir, "data", name))) {
      if (!existsSync(file)) continue;
      const raw = (await readFile(file)).toString("latin1");
      for (const secret of SECRET_VALUES) expect(raw).not.toContain(secret);
    }

    const { store: reopened } = await open(fakeBox, dir);
    expect(reopened.list()).toHaveLength(5);
    expect(reopened.secrets(login.id)).toMatchObject({ kind: "login", username: "tester", password: PASSWORD });
    expect(reopened.secrets(card.id)).toMatchObject({ kind: "card", number: "4242424242424242", cvc: CVC });
  });

  it("refuses to save when the computer cannot encrypt, and stores nothing", async () => {
    const { store } = await open(noBox);
    expect(store.status()).toEqual({ encryptionAvailable: false, items: 0 });
    expect(() => store.save({ kind: "apiKey", name: "TEST_API_KEY", value: API_KEY })).toThrow(/encrypt/);
    expect(store.list()).toEqual([]);
  });

  it("changes an item and keeps the secrets that are left out", async () => {
    const { store } = await open();
    const login = store.save({
      kind: "login",
      url: "https://bank.example",
      username: "tester",
      password: PASSWORD,
      twoStepKey: TWO_STEP,
    });
    const changed = store.save({
      kind: "login",
      id: login.id,
      label: "My bank",
      url: "https://bank.example",
      username: "tester2",
    });
    expect(changed).toMatchObject({ id: login.id, label: "My bank", username: "tester2", hasTwoStepKey: true });
    expect(store.secrets(login.id)).toMatchObject({ password: PASSWORD, username: "tester2" });
    expect(
      store.save({ kind: "login", id: login.id, url: "https://bank.example", username: "tester2", twoStepKey: null }),
    ).toMatchObject({
      hasTwoStepKey: false,
    });
    expect(() => store.save({ kind: "apiKey", id: login.id, name: "OTHER" })).toThrow(/kind/);
    store.delete(login.id);
    expect(store.list()).toEqual([]);
    expect(() => store.delete(login.id)).toThrow(/no longer exists/);
  });

  it("validates input without repeating a secret in the error", async () => {
    const { store } = await open();
    const failures = [
      () => store.save({ kind: "login", url: "not a url", username: "tester", password: PASSWORD }),
      () => store.save({ kind: "login", url: "https://bank.example", username: "tester" }),
      () =>
        store.save({
          kind: "card",
          holderName: "Test Holder",
          number: "1234 5678 9012 3456",
          expiryMonth: 12,
          expiryYear: 2029,
        }),
      () => store.save({ kind: "card", holderName: "Test Holder", number: CARD, expiryMonth: 13, expiryYear: 2029 }),
      () => store.save({ kind: "apiKey", name: "not a name", value: API_KEY }),
      () => store.save({ kind: "totp", issuer: "Test Service", secret: "not base32!" }),
      () => store.save({ kind: "contact", name: "" }),
    ];
    for (const failure of failures) {
      let message = "";
      try {
        failure();
      } catch (error) {
        message = String(error);
      }
      expect(message).not.toBe("");
      for (const secret of [PASSWORD, "1234 5678 9012 3456", API_KEY, "not base32!"])
        expect(message).not.toContain(secret);
    }
    expect(store.list()).toEqual([]);
  });

  it("matches logins to a page by site, subdomain and scheme only", async () => {
    const { store } = await open();
    const bank = store.save({ kind: "login", url: "https://bank.example", username: "tester", password: PASSWORD });
    store.save({ kind: "login", url: "https://other.example", username: "tester", password: PASSWORD });
    const local = store.save({
      kind: "login",
      url: "http://127.0.0.1:4100/login",
      username: "tester",
      password: PASSWORD,
    });
    expect(store.matchLogins("https://login.bank.example/path").map((item) => item.id)).toEqual([bank.id]);
    expect(store.matchLogins("https://bank.example/").map((item) => item.id)).toEqual([bank.id]);
    expect(store.matchLogins("http://bank.example/")).toEqual([]);
    expect(store.matchLogins("https://evilbank.example/")).toEqual([]);
    expect(store.matchLogins("https://bank.example.evil.test/")).toEqual([]);
    expect(store.matchLogins("http://127.0.0.1:4100/form").map((item) => item.id)).toEqual([local.id]);
    expect(store.matchLogins("http://127.0.0.1:4200/form")).toEqual([]);
    expect(store.matchLogins("about:blank")).toEqual([]);
  });

  it("makes the current code from a login's two-step key or a totp item, and resolves API keys for tools", async () => {
    const { store } = await open();
    const { login, code, apiKey } = await saveAll(store);
    const at = 1_700_000_000_000;
    expect(store.totpCode(login.id, at)).toBe(totp({ secret: TWO_STEP }, at));
    expect(store.totpCode(code.id, at)).toBe(totp({ secret: TOTP_SECRET }, at));
    expect(() => store.totpCode(apiKey.id, at)).toThrow(/two-step/);
    expect(store.resolveApiKey("TEST_API_KEY")).toBe(API_KEY);
    expect(store.resolveApiKey("MISSING_KEY")).toBeNull();
  });
});
