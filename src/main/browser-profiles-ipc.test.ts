// @vitest-environment node
// COSGRAL W8-KK3: the `browser-profiles:*` handlers with a real store on a temporary folder and the window's trust check
// on. Clearing is ordered for ONE partition only, after a confirmation, and remembered only when it worked.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isBrowserProfileDescription, isBrowserProfileList } from "@openbot/contracts/ipc";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BrowserProfileStore, profilePartition } from "../backend/browser-profiles";
import { registerBrowserProfilesIpc } from "./browser-profiles-ipc";
import { ipcRegistry } from "./trusted-ipc";

type Listener = (event: { senderFrame?: { url?: string | null } | null }, ...args: unknown[]) => unknown;
const handlers = new Map<string, Listener>();
const MAIN = "openbot-app://app/index.html";
const call = async (channel: string, payload: unknown, serverId = "local", url = MAIN) => {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  return handler({ senderFrame: { url } }, { serverId, payload });
};

const clearedAt = async (botId: string): Promise<string | null> => {
  const description = await call("browser-profiles:describe", { botId });
  if (!isBrowserProfileDescription(description)) throw new Error("not a description");
  return description.clearedAt;
};

let folder = "";
let store: BrowserProfileStore | null = null;
const cleared: string[] = [];
let failClear = false;

beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "cosgral-bp-ipc-"));
  store = new BrowserProfileStore({
    filePath: join(folder, "browser-profiles.json"),
    spaceId: "main",
    emit: () => undefined,
  });
  ipcRegistry.register = (channel, listener) => {
    handlers.set(channel, listener);
  };
  registerBrowserProfilesIpc({
    store: () => store,
    clearPartition: async (partition) => {
      if (failClear) throw new Error("The browser is busy.");
      cleared.push(partition);
    },
    openTabs: (botId) => (botId === "chief" ? 2 : 0),
  });
});
afterAll(() => rmSync(folder, { recursive: true, force: true }));

describe("browser profiles IPC (W8-KK3)", () => {
  it("creates profiles, sets tidy domain lists and describes them with the open pages", async () => {
    expect(isBrowserProfileList(await call("browser-profiles:list", null))).toBe(true);
    await call("browser-profiles:create", { botId: "chief" });
    await call("browser-profiles:create", { botId: "scout" });
    const list = await call("browser-profiles:set-domains", {
      botId: "chief",
      allow: ["HTTPS://Shop.com/x"],
      block: ["ads.net"],
    });
    expect(isBrowserProfileList(list)).toBe(true);
    const description = await call("browser-profiles:describe", { botId: "chief" });
    expect(isBrowserProfileDescription(description)).toBe(true);
    expect(description).toMatchObject({
      exists: true,
      openTabs: 2,
      domains: { allow: ["shop.com"], block: ["ads.net"] },
    });
    expect(await call("browser-profiles:describe", { botId: "nobody" })).toMatchObject({ exists: false });
  });

  it("clearing needs a confirmation and a profile; it clears ONE partition and keeps the domain lists", async () => {
    await expect(call("browser-profiles:clear", { botId: "chief" })).rejects.toThrow(/confirmation/);
    await expect(call("browser-profiles:clear", { botId: "chief", confirm: "yes" })).rejects.toThrow(/confirmation/);
    await expect(call("browser-profiles:clear", { botId: "nobody", confirm: true })).rejects.toThrow(
      /no browser profile/,
    );
    expect(cleared).toEqual([]);
    await call("browser-profiles:clear", { botId: "chief", confirm: true });
    expect(cleared).toEqual([profilePartition("main", "chief")]);
    expect(await call("browser-profiles:describe", { botId: "chief" })).toMatchObject({
      domains: { block: ["ads.net"] },
    });
    expect(await clearedAt("chief")).not.toBeNull();
    expect(await clearedAt("scout")).toBeNull();
  });

  it("when the sessions cannot be cleared the failure comes back and nothing is remembered as cleared", async () => {
    failClear = true;
    await expect(call("browser-profiles:clear", { botId: "scout", confirm: true })).rejects.toThrow(/busy/);
    failClear = false;
    expect(await clearedAt("scout")).toBeNull();
  });

  it("refuses a bad request, another server and an untrusted page before doing anything", async () => {
    await expect(call("browser-profiles:create", { botId: "" })).rejects.toThrow(/agent id/);
    await expect(
      call("browser-profiles:set-domains", { botId: "chief", allow: ["no way"], block: [] }),
    ).rejects.toThrow(/not a site name/);
    await expect(call("browser-profiles:list", null, "remote-1")).rejects.toThrow(/this computer/);
    await expect(call("browser-profiles:list", null, "local", "https://example.com/")).rejects.toThrow(/untrusted/);
  });
});
