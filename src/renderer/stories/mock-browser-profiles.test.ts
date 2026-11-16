// @vitest-environment node
import { type AgentEvent, isBrowserProfileDescription, isBrowserProfileList } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockBrowserProfiles } from "./mock-browser-profiles";

const setup = () => {
  const events: AgentEvent[] = [];
  return { api: createMockBrowserProfiles((event) => events.push(event)), events };
};

describe("mock browser profiles (W8-KK3)", () => {
  it("starts empty; an agent that has none is described as 'not yet', separate and not shared", async () => {
    const { api } = setup();
    expect(await api.list()).toEqual({ spaceId: "main", profiles: [] });
    const description = await api.describe({ botId: "chief" });
    expect(isBrowserProfileDescription(description)).toBe(true);
    expect(description).toMatchObject({ exists: false, sharedWithOthers: false, createdAt: null, openTabs: 0 });
  });

  it("creates one profile per agent, once, and tells the window", async () => {
    const { api, events } = setup();
    await api.create({ botId: "chief" });
    const again = await api.create({ botId: "chief" });
    await api.create({ botId: "scout" });
    expect(isBrowserProfileList(again)).toBe(true);
    expect((await api.list()).profiles.map((profile) => profile.botId)).toEqual(["chief", "scout"]);
    expect(events.at(-1)).toMatchObject({ type: "browser-profiles-changed" });
  });

  it("domain lists belong to one agent and are tidied; a bad entry is refused", async () => {
    const { api } = setup();
    await api.setDomains({ botId: "chief", allow: ["HTTPS://Shop.com/x"], block: ["ads.net"] });
    await api.create({ botId: "scout" });
    const list = await api.list();
    expect(list.profiles.find((profile) => profile.botId === "chief")?.domains).toEqual({
      allow: ["shop.com"],
      block: ["ads.net"],
    });
    expect(list.profiles.find((profile) => profile.botId === "scout")?.domains).toEqual({ allow: [], block: [] });
    await expect(api.setDomains({ botId: "chief", allow: ["no way"], block: [] })).rejects.toThrow(/not a site name/);
    expect((await api.describe({ botId: "chief" })).domains.allow).toEqual(["shop.com"]);
  });

  it("clearing needs a confirmation and a profile; it keeps the domain policy and closes nothing else", async () => {
    const { api } = setup();
    await expect(api.clear({ botId: "chief", confirm: true })).rejects.toThrow(/no browser profile/);
    await api.setDomains({ botId: "chief", allow: [], block: ["ads.net"] });
    await api.create({ botId: "scout" });
    api.simulate.tabs("chief", 3);
    api.simulate.tabs("scout", 1);
    await expect(api.clear({ botId: "chief", confirm: false })).rejects.toThrow(/confirmation/);
    expect((await api.describe({ botId: "chief" })).clearedAt).toBeNull();
    await api.clear({ botId: "chief", confirm: true });
    expect(await api.describe({ botId: "chief" })).toMatchObject({
      openTabs: 0,
      domains: { allow: [], block: ["ads.net"] },
    });
    expect((await api.describe({ botId: "chief" })).clearedAt).not.toBeNull();
    expect(await api.describe({ botId: "scout" })).toMatchObject({ openTabs: 1, clearedAt: null });
  });
});
