// COSGRAL W8-KK3: the browser profiles for Storybook and the preview. Demo data only. The same rules as the program: one
// profile per agent, never shared; the domain lists are checked by the shared rules; clearing needs `confirm: true`, removes
// the sessions and keeps the domain policy. `simulate.tabs` sets how many pages an agent has open.

import {
  type AgentEvent,
  BROWSER_PROFILE_PARTS,
  type BrowserProfile,
  type BrowserProfileDescription,
  type BrowserProfileList,
  type BrowserProfilesDesktopApi,
  emptyDomainPolicy,
  parseBrowserProfileInput,
  parseClearBrowserProfileInput,
  parseSetBrowserDomainsInput,
} from "@openbot/contracts/ipc";

export interface MockBrowserProfiles extends Required<BrowserProfilesDesktopApi> {
  simulate: { tabs: (botId: string, count: number) => void };
}

export function createMockBrowserProfiles(emit: (event: AgentEvent) => void, spaceId = "main"): MockBrowserProfiles {
  const profiles = new Map<string, BrowserProfile>();
  const tabs = new Map<string, number>();
  let clock = Date.parse("2026-11-16T12:00:00.000Z");
  const now = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };
  const list = (): BrowserProfileList => ({
    spaceId,
    profiles: [...profiles.values()]
      .sort((a, b) => a.botId.localeCompare(b.botId))
      .map((profile) => structuredClone(profile)),
  });
  const publish = (): BrowserProfileList => {
    const snapshot = list();
    emit({ type: "browser-profiles-changed", ...snapshot });
    return snapshot;
  };
  const ensure = (botId: string): BrowserProfile => {
    const existing = profiles.get(botId);
    if (existing) return existing;
    const made: BrowserProfile = { botId, createdAt: now(), clearedAt: null, domains: emptyDomainPolicy() };
    profiles.set(botId, made);
    return made;
  };

  return {
    list: async () => list(),
    create: async (raw) => {
      ensure(parseBrowserProfileInput(raw).botId);
      return publish();
    },
    setDomains: async (raw) => {
      const input = parseSetBrowserDomainsInput(raw);
      ensure(input.botId).domains = { allow: input.allow, block: input.block };
      return publish();
    },
    clear: async (raw) => {
      const input = parseClearBrowserProfileInput(raw);
      const profile = profiles.get(input.botId);
      if (!profile) throw new Error("This agent has no browser profile yet, so there is nothing to clear.");
      profile.clearedAt = now();
      tabs.set(input.botId, 0);
      return publish();
    },
    describe: async (raw): Promise<BrowserProfileDescription> => {
      const { botId } = parseBrowserProfileInput(raw);
      const profile = profiles.get(botId);
      return {
        botId,
        exists: profile !== undefined,
        isolated: [...BROWSER_PROFILE_PARTS],
        sharedWithOthers: false,
        domains: profile ? structuredClone(profile.domains) : emptyDomainPolicy(),
        createdAt: profile?.createdAt ?? null,
        clearedAt: profile?.clearedAt ?? null,
        openTabs: tabs.get(botId) ?? 0,
      };
    },
    simulate: {
      tabs: (botId, count) => {
        tabs.set(botId, count);
      },
    },
  };
}
