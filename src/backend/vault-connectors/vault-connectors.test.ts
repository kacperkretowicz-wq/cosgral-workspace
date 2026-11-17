// @vitest-environment node
// W11-KK (d): the Vault connectors on FAKE command-line tools and a fake safe. No real account, token, manager or network.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, VaultConnectorStatus } from "@openbot/contracts/ipc";
import { isVaultConnectorList, isVaultConnectorStatus } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { closeTestDatabases, testDatabase } from "../testing/databases";
import { totp } from "../totp";
import { type SecretBox, VaultStore } from "../vault-store";
import { BitwardenConnector } from "./bitwarden-connector";
import { ConnectorStore, type RunCli, websiteMatchesOrigin } from "./common";
import { VaultConnectorHub } from "./vault-connector-hub";
import { VaultSecretsService } from "./vault-secrets-service";

// Test values only.
const TOKEN = "ops_test_service_account_token_0123456789abcdef";
const OTHER_TOKEN = "ops_test_another_token_fedcba9876543210";
const SESSION_KEY = "test-session-key-AbCdEf0123456789";
const SHARED = "Shared with COSGRAL";

const fakeBox: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => `box:${Buffer.from(plain, "utf8").toString("base64").split("").reverse().join("")}`,
  decrypt: (cipher) => Buffer.from(cipher.slice(4).split("").reverse().join(""), "base64").toString("utf8"),
};

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function openDatabase() {
  const dir = await mkdtemp(join(tmpdir(), "vault-connectors-"));
  roots.push(dir);
  const database = testDatabase(join(dir, "data"));
  await database.initialize();
  return database;
}

interface Call {
  args: readonly string[];
  env: Readonly<Record<string, string>> | undefined;
}

interface OpWorld {
  accounts: Array<{ account_uuid: string; email: string; url: string }>;
  vaultExists: boolean;
  version: string;
  tokens: string[];
  logins: Array<{ id: string; title: string; urls: string[]; username: string; password: string; otp: boolean }>;
  calls: Call[];
}

function opWorld(): OpWorld {
  return {
    accounts: [{ account_uuid: "acc-1", email: "tester@example.test", url: "tester.example.test" }],
    vaultExists: true,
    version: "2.30.0",
    tokens: [TOKEN],
    logins: [
      {
        id: "i1",
        title: "Site A",
        urls: ["https://a.example.test"],
        username: "alice",
        password: "pw-alice",
        otp: true,
      },
      { id: "i2", title: "Site B", urls: ["https://b.example.test"], username: "bob", password: "pw-bob", otp: false },
    ],
    calls: [],
  };
}

function fakeOp(world: OpWorld): RunCli {
  return async (_executable, args, options) => {
    world.calls.push({ args, env: options.env });
    const [a, b] = args;
    const token = options.env?.OP_SERVICE_ACCOUNT_TOKEN;
    if (a === "--version") return `${world.version}\n`;
    if (a === "account" && b === "list") return JSON.stringify(world.accounts);
    if (a === "service-account" && b === "create") return "ops_created_by_fake\n";
    if (a === "vault" && b === "create") {
      world.vaultExists = true;
      return JSON.stringify({ id: "v1" });
    }
    // Everything below is a read with a service-account token (or the person's session for the vault list).
    if (token !== undefined && !world.tokens.includes(token)) throw new Error("401");
    if (a === "vault" && b === "list") return JSON.stringify(world.vaultExists ? [{ id: "v1", name: SHARED }] : []);
    if (a === "item" && b === "list") {
      return JSON.stringify(
        world.logins.map((l) => ({ id: l.id, title: l.title, urls: l.urls.map((href) => ({ href })) })),
      );
    }
    if (a === "item" && b === "get") {
      const login = world.logins.find((l) => l.id === args[2]);
      if (!login) throw new Error("not found");
      if (args.includes("--otp")) return "654321\n";
      if (args.includes("--reveal")) return `${login.password}\n`;
      return JSON.stringify({
        id: login.id,
        fields: [{ id: "username", value: login.username }, ...(login.otp ? [{ id: "one-time", type: "OTP" }] : [])],
      });
    }
    throw new Error(`unexpected ${args.join(" ")}`);
  };
}

function hubFor(
  database: Awaited<ReturnType<typeof openDatabase>>,
  world: OpWorld,
  extra: { bw?: RunCli; bwFound?: boolean } = {},
) {
  const events: AgentEvent[] = [];
  const hub = new VaultConnectorHub({
    store: new ConnectorStore(database, fakeBox),
    emit: (event) => events.push(event),
    onePassword: {
      runCli: fakeOp(world),
      findCli: async () => ["/fake/op"],
      installCli: null,
      openExternal: async () => undefined,
      hostName: "TEST-PC",
    },
    bitwarden: {
      runCli: extra.bw ?? (async () => "{}"),
      findCli: async () => {
        if (extra.bwFound === false) throw new Error("none");
        return "/fake/bw";
      },
    },
  });
  return { hub, events };
}

function everything(value: unknown): string {
  return JSON.stringify(value);
}

describe("website matching", () => {
  it("fills https pages of the saved host and its subdomains only", () => {
    const site = { url: "https://example.test", autofill: "anywhere" as const };
    expect(websiteMatchesOrigin(site, "https://example.test")).toBe(true);
    expect(websiteMatchesOrigin(site, "https://login.example.test")).toBe(true);
    expect(websiteMatchesOrigin(site, "https://example.test.evil.test")).toBe(false);
    expect(websiteMatchesOrigin(site, "https://notexample.test")).toBe(false);
    expect(websiteMatchesOrigin(site, "http://example.test")).toBe(false);
    expect(websiteMatchesOrigin(site, "https://example.test:8443")).toBe(false);
    expect(websiteMatchesOrigin({ ...site, autofill: "exact" }, "https://login.example.test")).toBe(false);
    expect(websiteMatchesOrigin({ ...site, autofill: "never" }, "https://example.test")).toBe(false);
    expect(websiteMatchesOrigin({ url: "example.test", autofill: "anywhere" }, "https://example.test")).toBe(true);
  });
});

describe("1Password connector (fake op)", () => {
  it("checks the setup: a tool that is found, missing, or too old", async () => {
    const database = await openDatabase();
    const world = opWorld();
    const { hub } = hubFor(database, world);
    const ready = await hub.checkSetup("onepassword");
    expect(ready.setup).toMatchObject({ cli: "ready", cliVersion: "2.30.0", appIntegration: true, canInstall: false });
    world.version = "2.17.0";
    const old = await hub.checkSetup("onepassword");
    expect(old.setup).toMatchObject({ cli: "missing", cliVersion: null, appIntegration: null });
    expect(isVaultConnectorStatus(old)).toBe(true);
  });

  it("connects through the app with one account: creates a read-only service account and keeps the token encrypted", async () => {
    const database = await openDatabase();
    const world = opWorld();
    world.tokens.push("ops_created_by_fake");
    const { hub, events } = hubFor(database, world);
    const status = await hub.connect({ connector: "onepassword", method: "app" });
    expect(isVaultConnectorStatus(status)).toBe(true);
    expect(status).toMatchObject({ state: "connected", loginCount: 2, vaultNames: [SHARED], error: null });
    const create = world.calls.find((call) => call.args[0] === "service-account");
    expect(create?.args).toContain("v1:read_items");
    expect(everything(world.calls.map((call) => call.args))).not.toContain("ops_created_by_fake");
    const row = database.connection.prepare("SELECT secret_enc FROM projection_vault_connectors").get();
    expect(everything(row)).not.toContain("ops_created_by_fake");
    expect(everything(events)).not.toContain("ops_created_by_fake");
    expect(events.every((event) => event.type === "vault-connectors-changed")).toBe(true);
  });

  it("creates the shared vault when it is missing", async () => {
    const database = await openDatabase();
    const world = opWorld();
    world.vaultExists = false;
    world.tokens.push("ops_created_by_fake");
    const { hub } = hubFor(database, world);
    expect((await hub.connect({ connector: "onepassword", method: "app" })).state).toBe("connected");
    expect(world.calls.some((call) => call.args[0] === "vault" && call.args[1] === "create")).toBe(true);
  });

  it("with several accounts it asks first and creates nothing; naming one then connects", async () => {
    const database = await openDatabase();
    const world = opWorld();
    world.tokens.push("ops_created_by_fake");
    world.accounts.push({ account_uuid: "acc-2", email: "second@example.test", url: "second.example.test" });
    const { hub } = hubFor(database, world);
    const asked = await hub.connect({ connector: "onepassword", method: "app" });
    expect(asked.state).toBe("choose-account");
    expect(asked.accounts.map((account) => account.id)).toEqual(["acc-1", "acc-2"]);
    expect(isVaultConnectorStatus(asked)).toBe(true);
    expect(world.calls.some((call) => call.args[0] === "service-account" || call.args[1] === "create")).toBe(false);
    const done = await hub.connect({ connector: "onepassword", method: "app", accountId: "acc-2" });
    expect(done.state).toBe("connected");
    expect(world.calls.find((call) => call.args[0] === "service-account")?.args).toContain("acc-2");
  });

  it("a signed-out app and a refused token end as a fixed sentence with a code, and nothing is saved", async () => {
    const database = await openDatabase();
    const world = opWorld();
    world.accounts = [];
    const { hub } = hubFor(database, world);
    const signedOut = await hub.connect({ connector: "onepassword", method: "app" });
    expect(signedOut).toMatchObject({ state: "failed", errorCode: "cli-signed-out" });
    expect(signedOut.error).toBe(
      "The manager's app has no signed-in account. Sign in there and turn on the command-line integration.",
    );
    const refused = await hub.connect({ connector: "onepassword", method: "token", secret: OTHER_TOKEN });
    expect(refused).toMatchObject({ state: "failed", errorCode: "token-rejected" });
    expect(everything(refused)).not.toContain(OTHER_TOKEN);
    expect(database.connection.prepare("SELECT COUNT(*) AS n FROM projection_vault_connectors").get()).toEqual({
      n: 0,
    });
  });

  it("connects with a token the person made; the token travels in the environment, never in the arguments", async () => {
    const database = await openDatabase();
    const world = opWorld();
    const { hub, events } = hubFor(database, world);
    const status = await hub.connect({ connector: "onepassword", method: "token", secret: TOKEN });
    expect(status).toMatchObject({ state: "connected", loginCount: 2 });
    expect(everything(world.calls.map((call) => call.args))).not.toContain(TOKEN);
    expect(world.calls.some((call) => call.env?.OP_SERVICE_ACCOUNT_TOKEN === TOKEN)).toBe(true);
    expect(everything(hub.list())).not.toContain(TOKEN);
    expect(everything(events)).not.toContain(TOKEN);
  });

  it("agents see logins of the page only, and secrets come through the secret call", async () => {
    const database = await openDatabase();
    const world = opWorld();
    const { hub } = hubFor(database, world);
    await hub.connect({ connector: "onepassword", method: "token", secret: TOKEN });
    const [source] = hub.sources();
    expect(source?.connector).toBe("onepassword");
    expect(await source?.loginsFor("https://login.a.example.test")).toEqual([
      { id: "i1", title: "Site A", username: "alice", hasOneTimePassword: true },
    ]);
    expect(await source?.loginsFor("https://a.example.test.evil.test")).toEqual([]);
    expect(await source?.loginsFor("http://a.example.test")).toEqual([]);
    expect(await source?.secretFor("i1", "https://a.example.test", "password")).toBe("pw-alice");
    expect(await source?.secretFor("i1", "https://a.example.test", "otp")).toBe("654321");
    // A login of another site never fills this page.
    expect(await source?.secretFor("i2", "https://a.example.test", "password")).toBeNull();
    expect(await source?.secretFor("missing", "https://a.example.test", "password")).toBeNull();
  });

  it("disconnecting forgets the token and the logins; the saved connection is read again after a restart", async () => {
    const database = await openDatabase();
    const world = opWorld();
    const first = hubFor(database, world);
    await first.hub.connect({ connector: "onepassword", method: "token", secret: TOKEN });
    const second = hubFor(database, world);
    second.hub.load();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(second.hub.status("onepassword")).toMatchObject({ state: "connected", loginCount: 2 });
    const [source] = second.hub.sources();
    const after = second.hub.disconnect("onepassword");
    expect(after).toMatchObject({ state: "disconnected", loginCount: null, vaultNames: [] });
    expect(await source?.loginsFor("https://a.example.test")).toBeNull();
    expect(second.hub.sources()).toEqual([]);
    expect(database.connection.prepare("SELECT COUNT(*) AS n FROM projection_vault_connectors").get()).toEqual({
      n: 0,
    });
  });

  it("a token that stopped working shows as a failure with a fixed sentence, and a later good read clears it", async () => {
    const database = await openDatabase();
    const world = opWorld();
    const { hub } = hubFor(database, world);
    await hub.connect({ connector: "onepassword", method: "token", secret: TOKEN });
    world.tokens = [];
    await expect(hub.sources()[0]?.loginsFor("https://a.example.test")).rejects.toMatchObject({
      code: "token-rejected",
    });
    const failed = hub.status("onepassword");
    expect(failed).toMatchObject({ state: "failed", errorCode: "token-rejected" });
    expect(isVaultConnectorStatus(failed)).toBe(true);
    world.tokens = [TOKEN];
    await hub.sources()[0]?.loginsFor("https://a.example.test");
    expect(hub.status("onepassword").state).toBe("connected");
  });
});

function bwWorld() {
  const folderItems = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Good",
      type: 1,
      folderId: "f1",
      reprompt: 0,
      login: {
        username: "carol",
        password: "pw-carol",
        totp: "JBSWY3DPEHPK3PXP",
        uris: [{ uri: "https://c.example.test", match: null }],
      },
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      name: "Re-prompt",
      type: 1,
      folderId: "f1",
      reprompt: 1,
      login: { username: "x", password: "pw-x", uris: [{ uri: "https://c.example.test" }] },
    },
    {
      id: "33333333-3333-3333-3333-333333333333",
      name: "Deleted",
      type: 1,
      folderId: "f1",
      deletedDate: "2026-01-01",
      login: { username: "y", password: "pw-y", uris: [{ uri: "https://c.example.test" }] },
    },
    {
      id: "44444444-4444-4444-4444-444444444444",
      name: "Exact only",
      type: 1,
      folderId: "f1",
      login: { username: "z", password: "pw-z", uris: [{ uri: "https://d.example.test", match: 1 }] },
    },
    {
      id: "55555555-5555-5555-5555-555555555555",
      name: "Http",
      type: 1,
      folderId: "f1",
      login: { username: "h", password: "pw-h", uris: [{ uri: "http://e.example.test" }] },
    },
  ];
  const world: {
    status: string;
    serverUrl: string | null;
    folders: Array<{ id: string; name: string }>;
    items: typeof folderItems;
    fail: boolean;
    calls: Call[];
  } = {
    status: "unlocked",
    serverUrl: null,
    folders: [{ id: "f1", name: SHARED }],
    items: folderItems,
    fail: false,
    calls: [],
  };
  const run: RunCli = async (_executable, args, options) => {
    world.calls.push({ args, env: options.env });
    if (world.fail) throw new Error("boom");
    const [a, b] = args;
    if (a === "status") return JSON.stringify({ status: world.status, serverUrl: world.serverUrl });
    if (a === "sync") return "Syncing complete.";
    if (a === "list" && b === "folders") return JSON.stringify(world.folders);
    if (a === "list" && b === "items") return JSON.stringify(world.items);
    if (a === "get" && b === "item") return JSON.stringify(world.items.find((item) => item.id === args[2]));
    if (a === "get" && b === "totp") return "123456\n";
    throw new Error(`unexpected ${args.join(" ")}`);
  };
  return { world, run };
}

describe("Bitwarden connector (fake bw)", () => {
  function make(world: ReturnType<typeof bwWorld>, found = true) {
    const events: VaultConnectorStatus[] = [];
    const timers: Array<() => void> = [];
    const connector = new BitwardenConnector({
      runCli: world.run,
      findCli: async () => {
        if (!found) throw new Error("none");
        return "/fake/bw";
      },
      emit: (status) => events.push(status),
      setTimer: (callback) => {
        timers.push(callback);
        return setTimeout(() => undefined, 0);
      },
      clearTimer: () => undefined,
    });
    return { connector, events, timers };
  }

  it("connects with the pasted session key, counts only usable logins, and never shows the key", async () => {
    const world = bwWorld();
    const { connector, events } = make(world);
    const status = await connector.connect(SESSION_KEY);
    expect(isVaultConnectorStatus(status)).toBe(true);
    expect(status).toMatchObject({ state: "connected", loginCount: 3, vaultNames: [SHARED] });
    expect(everything(events)).not.toContain(SESSION_KEY);
    expect(everything(world.world.calls.map((call) => call.args))).not.toContain(SESSION_KEY);
    expect(world.world.calls.every((call) => call.env?.BW_SESSION === SESSION_KEY)).toBe(true);
  });

  it("agents get only eligible logins of the page; passwords and codes come through the secret call", async () => {
    const world = bwWorld();
    const { connector } = make(world);
    await connector.connect(SESSION_KEY);
    expect(await connector.loginsFor("https://login.c.example.test")).toEqual([
      { id: "11111111-1111-1111-1111-111111111111", title: "Good", username: "carol", hasOneTimePassword: true },
    ]);
    expect(await connector.loginsFor("https://d.example.test")).toHaveLength(1);
    expect(await connector.loginsFor("https://sub.d.example.test")).toEqual([]);
    expect(await connector.loginsFor("https://e.example.test")).toEqual([]);
    const good = "11111111-1111-1111-1111-111111111111";
    expect(await connector.secretFor(good, "https://c.example.test", "password")).toBe("pw-carol");
    expect(await connector.secretFor(good, "https://c.example.test", "otp")).toBe("123456");
    expect(await connector.secretFor(good, "https://other.example.test", "password")).toBeNull();
    // A re-prompt login and a name that is not an id are never read.
    expect(
      await connector.secretFor("22222222-2222-2222-2222-222222222222", "https://c.example.test", "password"),
    ).toBeNull();
    expect(await connector.secretFor("not-an-id", "https://c.example.test", "password")).toBeNull();
  });

  it("fails with a fixed sentence: no tool, locked vault, no shared folder, two shared folders, another server", async () => {
    const missing = await make(bwWorld(), false).connector.connect(SESSION_KEY);
    expect(missing).toMatchObject({ state: "failed", errorCode: "cli-missing" });

    const locked = bwWorld();
    locked.world.status = "locked";
    expect(await make(locked).connector.connect(SESSION_KEY)).toMatchObject({ state: "failed", errorCode: "locked" });

    const noFolder = bwWorld();
    noFolder.world.folders = [];
    const none = await make(noFolder).connector.connect(SESSION_KEY);
    expect(none).toMatchObject({ state: "failed", errorCode: "folder-missing" });
    expect(isVaultConnectorStatus(none)).toBe(true);

    const two = bwWorld();
    two.world.folders = [
      { id: "f1", name: SHARED },
      { id: "f2", name: SHARED },
    ];
    expect(await make(two).connector.connect(SESSION_KEY)).toMatchObject({ errorCode: "folder-missing" });

    const server = bwWorld();
    server.world.serverUrl = "https://vault.example.test";
    expect(await make(server).connector.connect(SESSION_KEY, "https://other.example.test")).toMatchObject({
      errorCode: "unknown",
    });
    const same = await make(server).connector.connect(SESSION_KEY, "https://vault.example.test");
    expect(same).toMatchObject({ state: "connected", serverUrl: "https://vault.example.test" });
  });

  it("a failing read ends the session; the idle timer ends it too; disconnect forgets the key", async () => {
    const world = bwWorld();
    const { connector, timers } = make(world);
    await connector.connect(SESSION_KEY);
    world.world.fail = true;
    await expect(connector.loginsFor("https://c.example.test")).rejects.toThrow(/locked/i);
    expect(connector.status()).toMatchObject({ state: "failed", errorCode: "locked" });
    expect(connector.connected()).toBe(false);
    expect(await connector.loginsFor("https://c.example.test")).toBeNull();

    world.world.fail = false;
    await connector.connect(SESSION_KEY);
    expect(connector.connected()).toBe(true);
    timers.at(-1)?.();
    expect(connector.status()).toMatchObject({ state: "failed", errorCode: "locked" });

    await connector.connect(SESSION_KEY);
    expect(connector.disconnect()).toMatchObject({ state: "disconnected", loginCount: null });
    expect(
      await connector.secretFor("11111111-1111-1111-1111-111111111111", "https://c.example.test", "password"),
    ).toBeNull();
  });
});

describe("Vault connector hub", () => {
  it("lists the three connectors, publishes the whole list on every change, and Proton Pass answers a fixed failure", async () => {
    const database = await openDatabase();
    const { hub, events } = hubFor(database, opWorld());
    const list = hub.list();
    expect(isVaultConnectorList(list)).toBe(true);
    expect(list.connectors.map((entry) => entry.connector)).toEqual(["onepassword", "bitwarden", "protonpass"]);
    const proton = await hub.connect({ connector: "protonpass", method: "browser" });
    expect(proton).toMatchObject({ state: "failed", errorCode: "unknown" });
    expect(isVaultConnectorStatus(proton)).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "vault-connectors-changed" });
    expect(hub.disconnect("protonpass").state).toBe("disconnected");
  });

  it("cancel stops an attempt that waits for a choice", async () => {
    const database = await openDatabase();
    const world = opWorld();
    world.accounts.push({ account_uuid: "acc-2", email: "second@example.test", url: "second.example.test" });
    const { hub } = hubFor(database, world);
    expect((await hub.connect({ connector: "onepassword", method: "app" })).state).toBe("choose-account");
    expect(hub.cancel("onepassword")).toMatchObject({ state: "disconnected", accounts: [] });
  });
});

describe("the person's Vault tools", () => {
  async function tools(now = Date.parse("2026-11-17T10:00:00.000Z")) {
    const database = await openDatabase();
    const store = new VaultStore(database, fakeBox);
    const held = { text: "" };
    const timers: Array<() => void> = [];
    const service = new VaultSecretsService({
      store: () => store,
      clipboard: {
        write: (text) => {
          held.text = text;
        },
        read: () => held.text,
      },
      setTimer: (callback) => {
        timers.push(callback);
      },
      now: () => now,
    });
    return {
      store,
      service,
      timers,
      clipboard: () => held.text,
      setClipboard: (text: string) => {
        held.text = text;
      },
      now,
    };
  }

  it("reveal returns only what the item has; copy clears the clipboard later, unless the person copied something else", async () => {
    const { store, service, timers, clipboard, setClipboard } = await tools();
    const login = store.save({ kind: "login", url: "https://a.example.test", username: "alice", password: "pw-alice" });
    const card = store.save({
      kind: "card",
      holderName: "T Tester",
      number: "4242 4242 4242 4242",
      expiryMonth: 1,
      expiryYear: 2030,
      cvc: "123",
    });
    expect(service.reveal({ itemId: login.id, field: "password" })).toEqual({ value: "pw-alice" });
    expect(service.reveal({ itemId: card.id, field: "securityCode" })).toEqual({ value: "123" });
    expect(() => service.reveal({ itemId: login.id, field: "number" })).toThrow(/no such secret/);
    expect(() => service.reveal({ itemId: "missing", field: "password" })).toThrow();
    expect(service.copy({ itemId: login.id, field: "password" })).toEqual({ clearsInSeconds: 30 });
    expect(clipboard()).toBe("pw-alice");
    timers.at(-1)?.();
    expect(clipboard()).toBe("");
    service.copy({ itemId: login.id, field: "password" });
    setClipboard("something else");
    timers.at(-1)?.();
    expect(clipboard()).toBe("something else");
  });

  it("imports a CSV: https logins only, keeps a different password as a separate item, adds only a missing two-step key", async () => {
    const { store, service } = await tools();
    const saved = store.save({ kind: "login", url: "https://a.example.test", username: "alice", password: "pw-alice" });
    const csv = [
      "type,login_uri,login_username,login_password,login_totp",
      "login,https://a.example.test/login,alice,pw-alice,JBSWY3DPEHPK3PXP",
      "login,https://a.example.test,alice,pw-new,",
      "login,https://b.example.test,bob,pw-bob,",
      "login,http://insecure.example.test,eve,pw-eve,",
      "login,https://c.example.test,carl,,",
      "note,,,,",
      "login,https://d.example.test,dan,pw-dan,not a key",
    ].join("\n");
    const result = service.importCsv(csv);
    expect(result).toEqual({ imported: 4, skipped: 3 });
    expect(store.get(saved.id).hasTwoStepKey).toBe(true);
    expect(store.list({ kind: "login" })).toHaveLength(4);
    // The same file again adds nothing.
    expect(service.importCsv(csv)).toEqual({ imported: 0, skipped: 7 });
    expect(() => service.importCsv("a,b\n1,2")).toThrow(/CSV export of logins/);
  });

  it("two-step codes match the algorithm, for logins and authenticator items, and their window runs down", async () => {
    const { store, service, now } = await tools(Date.parse("2026-11-17T10:00:10.000Z"));
    const login = store.save({
      kind: "login",
      url: "https://a.example.test",
      username: "alice",
      password: "pw",
      twoStepKey: "JBSWY3DPEHPK3PXP",
    });
    store.save({ kind: "login", url: "https://b.example.test", username: "bob", password: "pw" });
    const auth = store.save({ kind: "totp", issuer: "Demo", secret: "GEZDGNBVGY3TQOJQ" });
    const { codes } = service.codes();
    expect(codes).toHaveLength(2);
    const forLogin = codes.find((entry) => entry.itemId === login.id);
    expect(forLogin?.code).toBe(totp({ secret: "JBSWY3DPEHPK3PXP" }, now));
    expect(forLogin?.remainingMs).toBe(20_000);
    expect(codes.find((entry) => entry.itemId === auth.id)?.code).toBe(totp({ secret: "GEZDGNBVGY3TQOJQ" }, now));
  });

  it("reset removes every item", async () => {
    const { store, service } = await tools();
    store.save({ kind: "login", url: "https://a.example.test", username: "alice", password: "pw" });
    service.reset();
    expect(store.list()).toEqual([]);
  });
});
