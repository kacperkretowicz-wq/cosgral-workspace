// @vitest-environment node
import {
  type AgentEvent,
  cliVersionAtLeast,
  isVaultCodes,
  isVaultConnectorList,
  isVaultConnectorLoginList,
  isVaultConnectorStatus,
  isVaultConnectorsChanged,
  normalizeServerUrl,
  parseConnectVaultConnectorInput,
  parseImportVaultCsvInput,
  parseLoginCsv,
  parseVaultItemFieldInput,
  VaultCsvError,
  vaultConnectorCliName,
  vaultConnectorDownloadPage,
} from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockVaultConnectors } from "./mock-vault-connectors";

const TOKEN = "ops_demo_service_account_token_value_0123456789";

const setup = () => {
  const events: AgentEvent[] = [];
  return { mock: createMockVaultConnectors((event) => events.push(event)), events };
};

describe("Vault connectors: contract rules (W11-KK d)", () => {
  it("each connector accepts only its own ways to connect, and never repeats a typed secret", () => {
    expect(parseConnectVaultConnectorInput({ connector: "onepassword", method: "app" })).toEqual({
      connector: "onepassword",
      method: "app",
    });
    expect(() => parseConnectVaultConnectorInput({ connector: "bitwarden", method: "app" })).toThrow(
      /Bitwarden connects with/,
    );
    expect(() => parseConnectVaultConnectorInput({ connector: "onepassword", method: "token" })).toThrow(
      /Paste the token/,
    );
    expect(() => parseConnectVaultConnectorInput({ connector: "onepassword", method: "app", secret: TOKEN })).toThrow(
      /takes no token/,
    );
    expect(() => parseConnectVaultConnectorInput({ connector: "lastpass", method: "app" })).toThrow(
      /connector is one of/,
    );
    try {
      parseConnectVaultConnectorInput({ connector: "onepassword", method: "app", secret: TOKEN });
    } catch (error) {
      expect(String(error)).not.toContain(TOKEN);
    }
  });

  it("an account only goes with 1Password's app connection, a server address only with Bitwarden and only over https", () => {
    expect(() =>
      parseConnectVaultConnectorInput({ connector: "onepassword", method: "token", secret: TOKEN, accountId: "a" }),
    ).toThrow(/app connection/);
    expect(
      parseConnectVaultConnectorInput({
        connector: "bitwarden",
        method: "session-key",
        secret: "session-key-demo",
        serverUrl: "https://vault.example.test/",
      }),
    ).toMatchObject({ serverUrl: "https://vault.example.test" });
    expect(() =>
      parseConnectVaultConnectorInput({
        connector: "bitwarden",
        method: "session-key",
        secret: "x",
        serverUrl: "http://vault.example.test",
      }),
    ).toThrow(/https/);
    expect(normalizeServerUrl("https://user:pw@vault.example.test")).toBeNull();
    expect(normalizeServerUrl("https://vault.example.test/path/")).toBe("https://vault.example.test/path");
  });

  it("the tool's version is compared by major and minor", () => {
    expect(cliVersionAtLeast("2.18.0", [2, 18])).toBe(true);
    expect(cliVersionAtLeast("2.17.9", [2, 18])).toBe(false);
    expect(cliVersionAtLeast("3.0.0", [2, 18])).toBe(true);
    expect(cliVersionAtLeast("junk", [2, 18])).toBe(false);
  });

  it("field and import requests are checked", () => {
    expect(parseVaultItemFieldInput({ itemId: "i", field: "password" })).toEqual({ itemId: "i", field: "password" });
    expect(() => parseVaultItemFieldInput({ itemId: "i", field: "notes" })).toThrow(/field is one of/);
    expect(() => parseImportVaultCsvInput({ csv: "  " })).toThrow(/empty/);
  });
});

describe("CSV import parser (W11-KK d)", () => {
  it("reads a Bitwarden export, keeps only logins, and handles quotes and line breaks", () => {
    const csv = [
      "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp",
      'Work,,login,Site A,"line one\nline two",,0,https://a.example.test,alice,"p,ass""word",JBSWY3DPEHPK3PXP',
      ",,note,Secret note,hidden,,0,,,,",
      ",,card,Card,,,0,,,,",
    ].join("\r\n");
    const parsed = parseLoginCsv(csv);
    expect(parsed.otherRows).toBe(2);
    expect(parsed.logins).toEqual([
      {
        website: "https://a.example.test",
        username: "alice",
        password: 'p,ass"word',
        notes: "line one\nline two",
        twoStepKey: "JBSWY3DPEHPK3PXP",
      },
    ]);
  });

  it("reads a 1Password-style and a browser-style export, with a leading byte-order mark", () => {
    expect(parseLoginCsv("﻿Title,URL,Username,Password,OTPAuth\nA,https://a.example.test,bob,pw,\n").logins).toEqual([
      { website: "https://a.example.test", username: "bob", password: "pw", notes: "", twoStepKey: "" },
    ]);
    expect(parseLoginCsv("name,url,username,password\nB,https://b.example.test,carol,pw2").logins).toHaveLength(1);
  });

  it("refuses a file without a website and a password column, and an unclosed quote", () => {
    expect(() => parseLoginCsv("a,b\n1,2")).toThrow(VaultCsvError);
    expect(() => parseLoginCsv('url,password\n"https://a.example.test,pw')).toThrow(VaultCsvError);
    expect(() => parseLoginCsv("")).toThrow(VaultCsvError);
  });
});

describe("mock Vault connectors (W11-KK d)", () => {
  it("starts with three disconnected connectors, all valid", async () => {
    const { mock } = setup();
    const list = await mock.connectors.list();
    expect(isVaultConnectorList(list)).toBe(true);
    expect(list.connectors.map((entry) => entry.connector)).toEqual(["onepassword", "bitwarden", "protonpass"]);
    expect(list.connectors.every((entry) => entry.state === "disconnected")).toBe(true);
  });

  it("1Password through the app: check, connect, and a token never comes back", async () => {
    const { mock, events } = setup();
    const checked = await mock.connectors.checkSetup({ connector: "onepassword" });
    expect(checked.setup).toMatchObject({ cli: "ready", appIntegration: true });
    const status = await mock.connectors.connect({ connector: "onepassword", method: "app" });
    expect(isVaultConnectorStatus(status)).toBe(true);
    expect(status).toMatchObject({ state: "connected", loginCount: 3 });
    expect(status.vaultNames).toEqual(["Shared with COSGRAL"]);
    const viaToken = await mock.connectors.connect({ connector: "onepassword", method: "token", secret: TOKEN });
    expect(viaToken.state).toBe("connected");
    expect(JSON.stringify(await mock.connectors.list())).not.toContain(TOKEN);
    expect(JSON.stringify(events)).not.toContain(TOKEN);
    expect(isVaultConnectorsChanged(events.at(-1))).toBe(true);
  });

  it("several 1Password accounts need a choice first and nothing is connected until then", async () => {
    const { mock } = setup();
    mock.simulate.accounts([
      { id: "a1", label: "one@example.test (one.example.test)" },
      { id: "a2", label: "two@example.test (two.example.test)" },
    ]);
    const asked = await mock.connectors.connect({ connector: "onepassword", method: "app" });
    expect(isVaultConnectorStatus(asked)).toBe(true);
    expect(asked.state).toBe("choose-account");
    expect(asked.accounts).toHaveLength(2);
    expect((await mock.connectors.cancel({ connector: "onepassword" })).state).toBe("disconnected");
    const done = await mock.connectors.connect({ connector: "onepassword", method: "app", accountId: "a2" });
    expect(done.state).toBe("connected");
    expect(done.accounts).toEqual([]);
  });

  it("failures carry a fixed sentence and a code, never the manager's text", async () => {
    const { mock } = setup();
    mock.simulate.accounts([]);
    const signedOut = await mock.connectors.connect({ connector: "onepassword", method: "app" });
    expect(signedOut).toMatchObject({ state: "failed", errorCode: "cli-signed-out" });
    expect(isVaultConnectorStatus(signedOut)).toBe(true);
    mock.simulate.refuseNext("bitwarden", "token-rejected");
    const refused = await mock.connectors.connect({
      connector: "bitwarden",
      method: "session-key",
      secret: "session-key-demo",
    });
    expect(refused).toMatchObject({ state: "failed", errorCode: "token-rejected" });
    expect(JSON.stringify(refused)).not.toContain("session-key-demo");
    const retry = await mock.connectors.connect({
      connector: "bitwarden",
      method: "session-key",
      secret: "session-key-demo",
    });
    expect(retry.state).toBe("connected");
    mock.simulate.lock("bitwarden");
    expect((await mock.connectors.status({ connector: "bitwarden" })).errorCode).toBe("locked");
  });

  it("a missing tool can be installed only when the program has a build for this computer", async () => {
    const { mock } = setup();
    mock.simulate.cli("onepassword", false, true);
    expect((await mock.connectors.status({ connector: "onepassword" })).setup).toMatchObject({
      cli: "missing",
      canInstall: true,
    });
    expect((await mock.connectors.connect({ connector: "onepassword", method: "app" })).errorCode).toBe("cli-missing");
    expect((await mock.connectors.installCli({ connector: "onepassword" })).setup.cli).toBe("ready");
    mock.simulate.cli("protonpass", false, false);
    expect((await mock.connectors.installCli({ connector: "protonpass" })).setup.cli).toBe("missing");
  });

  it("disconnecting forgets the connection; the login count follows the person's changes", async () => {
    const { mock } = setup();
    await mock.connectors.connect({ connector: "onepassword", method: "app" });
    mock.simulate.loginsChanged("onepassword", 7);
    expect((await mock.connectors.status({ connector: "onepassword" })).loginCount).toBe(7);
    const after = await mock.connectors.disconnect({ connector: "onepassword" });
    expect(after).toMatchObject({ state: "disconnected", loginCount: null, vaultNames: [] });
  });
});

describe("mock Vault tools of the person (W11-KK d)", () => {
  it("reveals only what exists, and copy clears the clipboard after the limit", async () => {
    const { mock } = setup();
    expect(await mock.secrets.reveal({ itemId: "demo-login", field: "password" })).toEqual({
      value: "demo-password-1",
    });
    await expect(mock.secrets.reveal({ itemId: "demo-login", field: "number" })).rejects.toThrow(/no such secret/);
    await expect(mock.secrets.reveal({ itemId: "missing", field: "password" })).rejects.toThrow();
    expect(await mock.secrets.copy({ itemId: "demo-key", field: "key" })).toEqual({ clearsInSeconds: 30 });
    expect(mock.simulate.clipboard()).toBe("demo-api-key-value");
    mock.simulate.advance(29_000);
    expect(mock.simulate.clipboard()).toBe("demo-api-key-value");
    mock.simulate.advance(2_000);
    expect(mock.simulate.clipboard()).toBe("");
  });

  it("two-step codes: only items with a key, six digits, a window that runs down", async () => {
    const { mock } = setup();
    const first = await mock.secrets.codes();
    expect(isVaultCodes(first)).toBe(true);
    expect(first.codes).toHaveLength(1);
    expect(first.codes[0]).toMatchObject({ itemId: "demo-login", period: 30 });
    mock.simulate.advance(10_000);
    const later = await mock.secrets.codes();
    expect(later.codes[0]?.remainingMs).toBeLessThan(first.codes[0]?.remainingMs ?? 0);
  });

  it("CSV import counts what it took and what it skipped; reset empties the Vault", async () => {
    const { mock } = setup();
    const result = await mock.secrets.importCsv({
      csv: "url,username,password\nhttps://a.example.test,a,pw\nhttp://insecure.example.test,b,pw\nhttps://c.example.test,c,\n",
    });
    expect(result).toEqual({ imported: 1, skipped: 2 });
    await mock.secrets.reset();
    expect((await mock.secrets.codes()).codes).toEqual([]);
    await expect(mock.secrets.reveal({ itemId: "demo-login", field: "password" })).rejects.toThrow();
  });

  it("lists the logins agents may use: none until connected, then demo logins without secrets; helpers name the tool and its page", async () => {
    const { mock } = setup();
    expect((await mock.connectors.listLogins({ connector: "onepassword" })).logins).toEqual([]);
    await mock.connectors.connect({ connector: "bitwarden", method: "session-key", secret: "session-key-demo" });
    const list = await mock.connectors.listLogins({ connector: "bitwarden" });
    expect(isVaultConnectorLoginList(list)).toBe(true);
    expect(list.logins).toHaveLength(3);
    expect(list.logins[0]).toMatchObject({ username: "user1", hasOneTimePassword: true });
    mock.simulate.loginsChanged("bitwarden", 500);
    const long = await mock.connectors.listLogins({ connector: "bitwarden" });
    expect(long).toMatchObject({ truncated: true });
    expect(long.logins).toHaveLength(200);
    expect(vaultConnectorCliName("onepassword")).toBe("op");
    expect(vaultConnectorDownloadPage("bitwarden")).toMatch(/^https:\/\//);
  });
});
