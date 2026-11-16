// @vitest-environment node
// COSGRAL W8-KK3: the browser profiles on disk: one per agent, own partitions, domain lists, clearing, restart, and the
// choice of the agent behind a page (also from a real database of CLI sessions). The Electron session itself is not here.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentEvent, isBrowserProfileDescription, isBrowserProfileList } from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BotStore } from "./bot-store";
import { BrowserProfileStore, createBrowserProfilePort, profilePartition } from "./browser-profiles";
import { closeTestDatabases, testDatabase } from "./testing/databases";

let folder: string;
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "cosgral-browser-profiles-"));
});
afterEach(() => {
  closeTestDatabases();
  rmSync(folder, { recursive: true, force: true });
});

const open = (spaceId = "main", dir = folder) => {
  const events: AgentEvent[] = [];
  let tick = 0;
  const store = new BrowserProfileStore({
    filePath: join(dir, "browser-profiles.json"),
    spaceId,
    emit: (event) => events.push(event),
    now: () => new Date(Date.parse("2026-11-16T12:00:00.000Z") + ++tick * 1000),
  });
  return { store, events };
};

describe("partitions (W8-KK3)", () => {
  it("every agent has its own persistent partition, in every space; the name is safe and tells nothing", () => {
    const names = [
      profilePartition("main", "chief"),
      profilePartition("main", "scout"),
      profilePartition("client-a", "chief"),
      profilePartition("client-b", "chief"),
    ];
    expect(new Set(names).size).toBe(4);
    for (const name of names) expect(name).toMatch(/^persist:cosgral-[a-z0-9-]+-[0-9a-f]{24}$/);
    expect(profilePartition("main", "chief")).toBe(profilePartition("main", "chief"));
    expect(names.join(" ")).not.toContain("chief");
    expect(profilePartition("main", "chief")).not.toBe("persist:openbot-browser");
    // ids that differ only by what a separator would join do not collide
    expect(profilePartition("a", "b-c")).not.toBe(profilePartition("a-b", "c"));
    expect(profilePartition("Client A!", "x")).toMatch(/^persist:cosgral-[a-z0-9-]+-[0-9a-f]{24}$/);
    // a space id that is cleaned into the same text still gives another partition (the hash has the raw id)
    expect(profilePartition("Client A", "x")).not.toBe(profilePartition("client-a", "x"));
  });
});

describe("browser profile store (W8-KK3)", () => {
  it("starts empty and writes nothing until a profile is made", () => {
    const { store } = open();
    expect(store.list()).toEqual({ spaceId: "main", profiles: [] });
    expect(existsSync(join(folder, "browser-profiles.json"))).toBe(false);
    expect(store.describe("chief", 0)).toMatchObject({ exists: false, sharedWithOthers: false, createdAt: null });
  });

  it("makes one profile per agent once, tells the window, and keeps it after a restart", () => {
    const first = open();
    first.store.ensure("chief");
    first.store.create("chief");
    first.store.create("scout");
    expect(first.store.list().profiles.map((profile) => profile.botId)).toEqual(["chief", "scout"]);
    expect(first.events.filter((event) => event.type === "browser-profiles-changed")).toHaveLength(2);
    expect(isBrowserProfileList(first.store.list())).toBe(true);
    const second = open();
    expect(second.store.list().profiles.map((profile) => profile.botId)).toEqual(["chief", "scout"]);
    expect(second.store.has("chief")).toBe(true);
  });

  it("domain lists belong to one agent, are kept after a restart, and clearing the sessions keeps them", () => {
    const first = open();
    first.store.setDomains("chief", { allow: ["shop.com"], block: ["ads.net"] });
    first.store.create("scout");
    first.store.markCleared("chief");
    const second = open();
    const chief = second.store.list().profiles.find((profile) => profile.botId === "chief");
    expect(chief?.domains).toEqual({ allow: ["shop.com"], block: ["ads.net"] });
    expect(chief?.clearedAt).not.toBeNull();
    expect(second.store.list().profiles.find((profile) => profile.botId === "scout")?.domains).toEqual({
      allow: [],
      block: [],
    });
    expect(() => second.store.markCleared("nobody")).toThrow(/no browser profile/);
  });

  it("decides per agent: block everywhere, the allow list for pages, and an agent without a profile has no lists", () => {
    const { store } = open();
    store.setDomains("chief", { allow: ["shop.com"], block: ["ads.shop.com"] });
    expect(store.decide("chief", "https://shop.com/cart", "navigation").allowed).toBe(true);
    expect(store.decide("chief", "https://other.com/", "navigation").allowed).toBe(false);
    expect(store.decide("chief", "https://cdn.other.com/a.js", "resource").allowed).toBe(true);
    expect(store.decide("chief", "https://ads.shop.com/x.js", "resource").allowed).toBe(false);
    expect(store.decide("scout", "https://other.com/", "navigation")).toEqual({ allowed: true, reason: null });
  });

  it("describe tells what is separate and how many pages are open", () => {
    const { store } = open();
    store.create("chief");
    const description = store.describe("chief", 2);
    expect(isBrowserProfileDescription(description)).toBe(true);
    expect(description).toMatchObject({
      exists: true,
      openTabs: 2,
      isolated: ["cookies", "storage", "cache", "history"],
    });
  });

  it("a damaged list is kept aside, every agent starts fresh, and the problem is said; a new list is then written", () => {
    const first = open();
    first.store.create("chief");
    writeFileSync(join(folder, "browser-profiles.json"), "{ not json");
    const second = open();
    expect(second.store.list().profiles).toEqual([]);
    expect(second.store.problem).toMatch(/could not be read/);
    expect(readdirSync(folder).some((name) => name.startsWith("browser-profiles.json.damaged-"))).toBe(true);
    second.store.create("scout");
    expect(second.store.problem).toBeNull();
    expect(
      open()
        .store.list()
        .profiles.map((profile) => profile.botId),
    ).toEqual(["scout"]);
  });

  it("a list with a profile that is malformed or listed twice is treated as damaged, not half-read", () => {
    const profile = { botId: "chief", createdAt: "x", clearedAt: null, domains: { allow: [], block: [] } };
    writeFileSync(join(folder, "browser-profiles.json"), JSON.stringify({ version: 1, profiles: [profile, profile] }));
    expect(open().store.problem).toMatch(/could not be read/);
    writeFileSync(join(folder, "browser-profiles.json"), JSON.stringify({ version: 1, profiles: [{ botId: 5 }] }));
    expect(open().store.problem).toMatch(/could not be read/);
  });

  it("two spaces have two lists in two folders and never see each other's profiles or domain lists", () => {
    const a = mkdtempSync(join(folder, "a-"));
    const b = mkdtempSync(join(folder, "b-"));
    const spaceA = open("client-a", a);
    const spaceB = open("client-b", b);
    spaceA.store.setDomains("chief", { allow: [], block: ["secret-a.com"] });
    expect(spaceB.store.list().profiles).toEqual([]);
    expect(open("client-b", b).store.decide("chief", "https://secret-a.com/", "navigation").allowed).toBe(true);
    expect(spaceA.store.partitionOf("chief")).not.toBe(spaceB.store.partitionOf("chief"));
    expect(existsSync(join(b, "browser-profiles.json"))).toBe(false);
  });
});

describe("browser profile port (W8-KK3)", () => {
  const owners = {
    agentIds: () => ["chief", "scout"],
    cliThreadsOf: (botId: string) => (botId === "chief" ? ["cli-1", "cli-2"] : ["cli-9"]),
  };

  it("finds the agent behind a CLI thread over all its threads; an unknown thread belongs to no agent", () => {
    const port = createBrowserProfilePort(open().store, owners);
    expect(port.botForThread("cli-2")).toBe("chief");
    expect(port.botForThread("cli-9")).toBe("scout");
    expect(port.botForThread("cli-404")).toBeNull();
  });

  it("an agent's page gets its own partition (and makes the profile); a person's page has none and is not judged", () => {
    const { store } = open();
    store.setDomains("chief", { allow: ["shop.com"], block: [] });
    const port = createBrowserProfilePort(store, owners);
    expect(port.partitionFor(null)).toBeNull();
    expect(port.partitionFor("scout")).toBe(profilePartition("main", "scout"));
    expect(store.has("scout")).toBe(true);
    expect(port.partitionFor("chief")).not.toBe(port.partitionFor("scout"));
    expect(port.checkNavigation(null, "https://anything.com/")).toBeNull();
    expect(port.checkRequest(null, "https://anything.com/", "mainFrame")).toBeNull();
  });

  it("opening is refused with a reason outside the allow list; requests follow the main-frame rule and the block list", () => {
    const { store } = open();
    store.setDomains("chief", { allow: ["shop.com"], block: ["ads.net"] });
    const port = createBrowserProfilePort(store, owners);
    expect(port.checkNavigation("chief", "https://shop.com/")).toBeNull();
    expect(port.checkNavigation("chief", "https://news.com/")).toMatch(/allow list/);
    expect(port.checkRequest("chief", "https://news.com/", "mainFrame")).toMatch(/allow list/);
    expect(port.checkRequest("chief", "https://news.com/a.js", "script")).toBeNull();
    expect(port.checkRequest("chief", "https://ads.net/a.js", "script")).toMatch(/blocks ads\.net/);
    expect(port.checkNavigation("scout", "https://news.com/")).toBeNull();
  });

  it("with a real database: the agent behind a page is found from the CLI sessions bound to its threads", async () => {
    const userData = join(folder, "data");
    mkdirSync(userData, { recursive: true });
    const database = testDatabase(userData);
    await database.initialize();
    const bots = new BotStore(userData, join(folder, "home"), database);
    await bots.initialize();
    await bots.getOrCreate("chief", "Chief");
    await bots.getOrCreate("scout", "Scout");
    await bots.ensureThreadId("chief");
    await bots.ensureThreadId("scout");
    bots.bindProviderSession("chief", "cli-chief");
    bots.bindProviderSession("scout", "cli-scout");
    const port = createBrowserProfilePort(open().store, {
      agentIds: () => bots.list().map((bot) => bot.id),
      cliThreadsOf: (botId) => database.listAgentProviderSessions(botId).map((entry) => entry.externalSessionId),
    });
    expect(port.botForThread("cli-chief")).toBe("chief");
    expect(port.botForThread("cli-scout")).toBe("scout");
    expect(port.botForThread("cli-chief")).not.toBe(port.botForThread("cli-scout"));
    expect(readFileSync(join(userData, "openbot.db")).length).toBeGreaterThan(0);
  });
});
