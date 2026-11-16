// @vitest-environment node
// COSGRAL W8-KK1 (W8-22, gate G5, data side): two spaces run on two real databases and two home folders. What one
// space saves (an agent, a Vault login, an MCP server, a file of its agents' folder) is not in the other space and not
// in the main space: not in a list, and not as a single byte of their folders. The program opens ONE space at a time, so
// this test opens each space on its own, as the program does after a switch.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertSafeWipeRoot } from "../main/data-wipe";
import { BotStore } from "./bot-store";
import { McpStore } from "./mcp-store";
import { type SpacePaths, SpaceStore } from "./space-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { type SecretBox, VaultStore } from "./vault-store";

const box: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => `box:${Buffer.from(plain, "utf8").toString("base64")}`,
  decrypt: (cipher) => Buffer.from(cipher.slice(4), "base64").toString("utf8"),
};

let appData: string;
beforeEach(() => {
  appData = mkdtempSync(join(tmpdir(), "cosgral-isolation-"));
});
afterEach(() => {
  closeTestDatabases();
  rmSync(appData, { recursive: true, force: true });
});

async function openSpace(paths: SpacePaths) {
  mkdirSync(paths.userData, { recursive: true });
  mkdirSync(paths.home, { recursive: true });
  const database = testDatabase(paths.userData);
  await database.initialize();
  const bots = new BotStore(paths.userData, paths.home, database);
  await bots.initialize();
  return { bots, vault: new VaultStore(database, box), mcp: new McpStore(database, box), database, paths };
}

function allText(folder: string): string {
  let text = "";
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) text += allText(path);
    else if (statSync(path).size < 50_000_000) text += readFileSync(path).toString("latin1");
  }
  return text;
}

describe("two spaces are two separate data sets (W8-KK1, G5 data side)", () => {
  it("an agent, a Vault login, an MCP server and a file of space A are nowhere in space B or in main", async () => {
    const spaces = new SpaceStore({
      baseUserData: join(appData, "COSGRAL Workspace"),
      baseHome: join(appData, "home"),
    });
    const a = spaces.create("Client A").spaces[1]?.id ?? "";
    const b = spaces.create("Client B").spaces[2]?.id ?? "";
    const pathsOf = (id: string): SpacePaths => ({
      id,
      userData: join(spaces.root, id, "data"),
      home: join(spaces.root, id, "home"),
    });
    const main: SpacePaths = { id: "main", userData: join(appData, "COSGRAL Workspace"), home: join(appData, "home") };

    // Space A works: an agent, a login, an MCP server with a secret, a file.
    const spaceA = await openSpace(pathsOf(a));
    await spaceA.bots.getOrCreate("alpha-agent", "Alpha Agent");
    spaceA.vault.save({
      kind: "login",
      label: "ClientA-bank-login",
      url: "https://bank.example",
      username: "alpha-user",
      password: "alpha-password-123",
    });
    spaceA.mcp.add({
      name: "alpha_mcp",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      secrets: { TOKEN: "alphamcpsecret456" },
    });
    writeFileSync(join(spaceA.bots.sharedRoot, "alpha-notes.txt"), "client A private notes");
    expect(spaceA.bots.list().map((bot) => bot.id)).toContain("alpha-agent");
    expect(spaceA.vault.list()).toHaveLength(1);
    expect(spaceA.mcp.list()).toHaveLength(1);
    spaceA.database.close();

    // Space B and main, opened on their own: nothing of A.
    for (const paths of [pathsOf(b), main]) {
      const other = await openSpace(paths);
      expect(other.bots.list().map((bot) => bot.id)).not.toContain("alpha-agent");
      expect(other.vault.list()).toEqual([]);
      expect(other.mcp.list()).toEqual([]);
      expect(existsSync(join(other.bots.sharedRoot, "alpha-notes.txt"))).toBe(false);
      other.database.close();
      for (const secret of [
        "ClientA-bank-login",
        "alpha-user",
        "alpha-password-123",
        "alphamcpsecret456",
        "alpha_mcp",
        "client A private notes",
      ]) {
        expect(allText(paths.userData).includes(secret)).toBe(false);
        expect(allText(paths.home).includes(secret)).toBe(false);
      }
    }

    // And A is still whole when it is opened again after a restart.
    const again = await openSpace(pathsOf(a));
    expect(again.bots.list().map((bot) => bot.id)).toContain("alpha-agent");
    expect(again.vault.list()[0]?.label).toBe("ClientA-bank-login");
    expect(again.mcp.list()[0]?.name).toBe("alpha_mcp");
  });

  it("the folders of two spaces are different places, so the browser profile and the accounts are separate too", () => {
    const spaces = new SpaceStore({
      baseUserData: join(appData, "COSGRAL Workspace"),
      baseHome: join(appData, "home"),
    });
    const a = spaces.create("Client A").spaces[1]?.id ?? "";
    const b = spaces.create("Client B").spaces[2]?.id ?? "";
    const dataA = join(spaces.root, a, "data");
    const dataB = join(spaces.root, b, "data");
    expect(dataA).not.toBe(dataB);
    // Everything the program keeps in its data folder (Chromium profile with cookies, accounts, browser state, MCP, Vault) is under it.
    for (const part of ["accounts", "cli", "browser-state.json", "Cookies", "openbot.db"]) {
      expect(join(dataA, part).startsWith(dataB)).toBe(false);
    }
  });

  it('"Delete my data" of the main space leaves the client spaces alone, and inside a client space the wipe guard refuses its folders', () => {
    const appDataFolder = join(appData, "AppData");
    const homeFolder = join(appData, "home");
    const spaces = new SpaceStore({ baseUserData: join(appDataFolder, "COSGRAL Workspace"), baseHome: homeFolder });
    const id = spaces.create("Client A").spaces[1]?.id ?? "";
    const options = { home: homeFolder, appData: appDataFolder };
    // The main data folder is one the wipe may remove; the clients' folder is a sibling and is not part of it.
    expect(() => assertSafeWipeRoot(join(appDataFolder, "COSGRAL Workspace"), options)).not.toThrow();
    expect(join(spaces.root, id).startsWith(join(appDataFolder, "COSGRAL Workspace") + sep)).toBe(false);
    // A wipe asked from inside a client space would name that space's folders: the guard refuses them (nothing is removed).
    expect(() => assertSafeWipeRoot(join(spaces.root, id, "data"), options)).toThrow();
    expect(() => assertSafeWipeRoot(join(spaces.root, id, "home", "COSGRAL Workspace"), options)).toThrow();
  });
});
