// @vitest-environment node
// COSGRAL W5-G2 (P11, criterion C13): every call that handles accounts, CLIs, API keys, own endpoints and the provider
// lists is for this computer only. The REAL handlers are registered here with the window's trust check switched on, and
// each channel is called as another server (a remote server or a phone peer would be): none may do its work or leak.
import { beforeAll, describe, expect, it } from "vitest";
import { ipcRegistry } from "./trusted-ipc";

const handlers = new Map<
  string,
  (event: { senderFrame?: { url?: string | null } | null }, ...args: unknown[]) => unknown
>();

const channelsOf = (...prefixes: string[]) =>
  [...handlers.keys()].filter((name) => prefixes.some((p) => name.startsWith(p)));

async function call(
  channel: string,
  serverId: string,
  payload: unknown,
): Promise<{ threw: string | null; value: unknown }> {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  try {
    return {
      threw: null,
      value: await handler({ senderFrame: { url: "openbot-app://app/index.html" } }, { serverId, payload }),
    };
  } catch (error) {
    return { threw: error instanceof Error ? error.message : String(error), value: undefined };
  }
}

beforeAll(async () => {
  // The window's own address passes the trust check; every handler lands here instead of in Electron.
  ipcRegistry.register = (channel, listener) => {
    handlers.set(channel, listener);
  };
  const { registerApiKeysIpc } = await import("./api-keys-ipc");
  const { registerContextIpc } = await import("./context-ipc");
  const { registerEndpointsIpc } = await import("./endpoints-ipc");
  const { registerSubscriptionsIpc } = await import("./subscriptions-ipc");
  const { registerProviderIpc } = await import("./provider-ipc");
  const { registerThreadsIpc } = await import("./threads-ipc");
  const { registerWindowsIpc } = await import("./windows-ipc");
  const { registerSpacesIpc } = await import("./spaces-ipc");
  const { registerBudgetsIpc } = await import("./budgets-ipc");
  const { registerBrowserProfilesIpc } = await import("./browser-profiles-ipc");
  const { registerIntegrationsIpc } = await import("./integrations-ipc");
  const { registerPhoneIpc } = await import("./phone-ipc");
  const { registerComposerIpc } = await import("./composer-ipc");
  const { registerAgentCardsIpc } = await import("./agent-cards-ipc");
  const { registerServerSettingsIpc } = await import("./server-settings-ipc");
  const { registerMessengersIpc } = await import("./messengers-ipc");
  const { registerVaultConnectorsIpc } = await import("./vault-connectors-ipc");
  const { registerPluginCatalogIpc } = await import("./plugin-catalog-ipc");
  registerThreadsIpc(() => null);
  const { registerPlansIpc } = await import("./plans-ipc");
  registerPlansIpc(() => null);
  const { registerAcpLoginIpc } = await import("./acp-login-ipc");
  registerAcpLoginIpc(() => null);
  const { registerAcpPresetsIpc } = await import("./acp-presets-ipc");
  registerAcpPresetsIpc(() => null);
  const { registerAccessIpc } = await import("./access-ipc");
  registerAccessIpc(() => null);
  const { registerIsolationIpc } = await import("./isolation-ipc");
  registerIsolationIpc(() => null);
  const { registerSubagentsIpc } = await import("./subagents-ipc");
  registerSubagentsIpc(() => null);
  const { registerMessageActionsIpc } = await import("./message-actions-ipc");
  registerMessageActionsIpc(() => null);
  registerWindowsIpc(() => null);
  registerSpacesIpc({ store: () => null, emit: () => undefined, restart: async () => undefined });
  registerBudgetsIpc(() => null);
  registerIntegrationsIpc(() => null);
  registerPhoneIpc(() => null);
  registerComposerIpc({
    search: () => null,
    composer: () => null,
    tabs: () => null,
    threads: async () => {
      throw new Error("not ready");
    },
  });
  registerAgentCardsIpc(() => null);
  registerServerSettingsIpc(() => null);
  registerMessengersIpc(() => null);
  registerPluginCatalogIpc(() => null);
  registerVaultConnectorsIpc(
    () => null,
    () => null,
  );
  registerBrowserProfilesIpc({ store: () => null, clearPartition: async () => undefined, openTabs: () => 0 });
  registerApiKeysIpc(() => null);
  registerEndpointsIpc(() => null);
  registerContextIpc(() => null);
  registerSubscriptionsIpc(() => null);
  // A registry that must never be used by a call for another server: every method fails loudly when it is called.
  const { ProviderRegistry } = await import("../backend/provider-registry");
  const registry = Object.create(ProviderRegistry.prototype);
  for (const method of [
    "listAcpAgents",
    "saveAcpAgent",
    "removeAcpAgent",
    "listUsage",
    "getFallbackModels",
    "setFallbackModels",
    "getFallbackInfo",
    "resetFallbackModels",
  ])
    Object.defineProperty(registry, method, {
      value: () => {
        throw new Error(`The registry was used by a remote call (${method}).`);
      },
    });
  registerProviderIpc(registry);
});

describe("this-computer-only IPC (P11 / C13)", () => {
  it("registers the channels of keys, endpoints, accounts, CLIs and provider lists", () => {
    expect(channelsOf("api-keys:").length).toBe(4);
    expect(channelsOf("endpoints:").length).toBe(5);
    expect(channelsOf("context:").length).toBe(4);
    expect(channelsOf("subscriptions:").length).toBeGreaterThanOrEqual(19);
    expect(channelsOf("providers:").length).toBeGreaterThanOrEqual(8);
    // COSGRAL W6-BE1: the threads of an agent.
    expect(channelsOf("threads:").length).toBe(8);
    // COSGRAL W6-BE3: the plan card.
    expect(channelsOf("plans:").length).toBe(2);
    // COSGRAL W6-BE3: the actions on a message.
    expect(channelsOf("message-actions:").length).toBe(5);
    // COSGRAL W6-BE4: the subagents (list and Stop; the window cannot start one, Q11).
    expect(channelsOf("subagents:").length).toBe(2);
    // COSGRAL W6-BE5: signing in to ACP agents.
    expect(channelsOf("acp-login:").length).toBe(4);
    expect(channelsOf("acp-presets:").length).toBe(2);
    // COSGRAL W6-KK3: the separate conversation windows.
    expect(channelsOf("windows:").length).toBe(4);
    // COSGRAL W8-KK1: the client spaces.
    expect(channelsOf("spaces:").length).toBe(8);
    // COSGRAL W8-BE1: the access levels of the agents.
    expect(channelsOf("access:").length).toBe(4);
    // COSGRAL W8-BE2: the isolation of processes.
    expect(channelsOf("isolation:").length).toBe(5);
    // COSGRAL W8-KK2: the budgets.
    expect(channelsOf("budgets:").length).toBe(4);
    // COSGRAL W8-KK3: the browser profiles.
    expect(channelsOf("browser-profiles:").length).toBe(5);
    // COSGRAL W10-KK1: the account integrations.
    expect(channelsOf("integrations:").length).toBe(7);
    // COSGRAL W9-BE1: the phone away from home.
    expect(channelsOf("phone:").length).toBe(4);
    // COSGRAL W11 (U3-U6): search, the message box, the tabs of threads.
    expect(channelsOf("search:").length).toBe(1);
    expect(channelsOf("composer:").length).toBe(4);
    expect(channelsOf("thread-tabs:").length).toBe(4);
    // COSGRAL W12 (BE-D): the agent cards.
    expect(channelsOf("agent-cards:").length).toBe(4);
    expect(channelsOf("server-settings:").length).toBe(5);
    // COSGRAL W10-KK2: the Telegram bridge.
    expect(channelsOf("messengers:").length).toBe(6);
    // COSGRAL W11-KK (d): the Vault connectors and the person's Vault tools.
    expect(channelsOf("vault-connectors:").length).toBe(8);
    // COSGRAL W11-KK (e): the Marketplace Apps tab.
    expect(channelsOf("plugin-catalog:").length).toBe(8);
    expect(
      ["vault:reveal", "vault:copy", "vault:import-csv", "vault:codes", "vault:reset"].every((name) =>
        handlers.has(name),
      ),
    ).toBe(true);
  });

  it.each(["remote-server-1", "phone-peer", "local2", ""])(
    "refuses every such call for the server '%s'",
    async (serverId) => {
      const names = channelsOf(
        "api-keys:",
        "endpoints:",
        "subscriptions:",
        "providers:",
        "context:",
        "threads:",
        "plans:",
        "message-actions:",
        "subagents:",
        "acp-login:",
        "acp-presets:",
        "windows:",
        "spaces:",
        "access:",
        "isolation:",
        "budgets:",
        "browser-profiles:",
        "integrations:",
        "phone:",
        "search:",
        "composer:",
        "thread-tabs:",
        "agent-cards:",
        "server-settings:",
        "messengers:",
        "vault-connectors:",
        "plugin-catalog:",
        "vault:reveal",
        "vault:copy",
        "vault:import-csv",
        "vault:codes",
        "vault:reset",
      );
      const outcomes: string[] = [];
      for (const name of names) {
        const { threw, value } = await call(name, serverId, { provider: "codex", key: "test-key-0000-abcd", id: "x" });
        // A refusal is an error that names this computer, or (for plain lists) an empty answer: never data.
        const refused = threw !== null || (Array.isArray(value) && value.length === 0);
        if (!refused) outcomes.push(`${name} answered ${JSON.stringify(value).slice(0, 60)}`);
        if (threw !== null && !/this computer|server|request|serverId/i.test(threw))
          outcomes.push(`${name}: odd error '${threw}'`);
        if (threw !== null && /remote call/.test(threw)) outcomes.push(`${name} touched the registry`);
        if (threw !== null && /test-key-0000/.test(threw)) outcomes.push(`${name} echoed the key`);
      }
      expect(outcomes).toEqual([]);
    },
  );

  it("the same channels do answer for this computer (the guard is the server, not a broken handler)", async () => {
    const { threw } = await call("api-keys:list", "local", null);
    expect(threw).toMatch(/still starting/);
    const sub = await call("subscriptions:list-accounts", "local", null);
    expect(sub.threw).toMatch(/still starting/);
    const endpoints = await call("endpoints:list", "local", null);
    expect(endpoints.threw).toMatch(/still starting/);
    const context = await call("context:get-settings", "local", null);
    expect(context.threw).toMatch(/still starting/);
    // W6-KK3: a wrong request is refused by the parser before the program is even asked; a page that is not a
    // conversation window is simply "no conversation" (null), not an error.
    expect((await call("windows:open-conversation", "local", { botId: "" })).threw).toMatch(/needs an agent/);
    expect((await call("windows:list-open", "local", null)).threw).toMatch(/still starting/);
    expect((await call("windows:current", "local", null)).value).toBeNull();
    // W8-KK1: spaces are parsed first (a bad id or a missing confirmation is refused before the program is asked).
    expect((await call("spaces:delete", "local", { id: "client-0001" })).threw).toMatch(/confirmation/);
    expect((await call("spaces:switch", "local", { id: "../main", confirm: true })).threw).toMatch(/space id/);
    expect((await call("spaces:list", "local", null)).threw).toMatch(/still starting/);
    // W8-BE1: a wrong level or a relative folder is refused by the contract parser, before the program is asked.
    expect((await call("access:set-level", "local", { botId: "chief", level: "root" })).threw).toMatch(/level/);
    expect((await call("access:set-folders", "local", { botId: "chief", excludedFolders: ["docs"] })).threw).toMatch(
      /full path/,
    );
    expect((await call("access:get", "local", { botId: "chief" })).threw).toMatch(/still starting/);
    // W8-KK2: a bad budget request is refused by the parser before the program is asked.
    expect(
      (
        await call("budgets:set", "local", {
          scope: { kind: "space" },
          period: "day",
          tokenLimit: -1,
          costLimitUsd: null,
          hardStop: true,
        })
      ).threw,
    ).toMatch(/token limit/);
    expect((await call("budgets:export-csv", "local", { from: "2026-11-30", to: "2026-11-01" })).threw).toMatch(
      /not be after/,
    );
    expect((await call("budgets:list", "local", null)).threw).toMatch(/still starting/);
    // W8-BE2: a switch that is not on/off, or no agent, is refused by the contract parser, before the program is asked.
    expect((await call("isolation:set-enabled", "local", { botId: "chief", enabled: "no" })).threw).toMatch(
      /on or off/,
    );
    expect((await call("isolation:get", "local", { botId: "" })).threw).toMatch(/Choose an agent/);
    expect((await call("isolation:list", "local", null)).threw).toMatch(/still starting/);
    // W8-KK3: a bad browser profile request is refused by the parser before the program is asked.
    expect((await call("browser-profiles:clear", "local", { botId: "chief" })).threw).toMatch(/confirmation/);
    expect(
      (await call("browser-profiles:set-domains", "local", { botId: "chief", allow: ["no way"], block: [] })).threw,
    ).toMatch(/not a site name/);
    expect((await call("browser-profiles:list", "local", null)).threw).toMatch(/still starting/);
    // W10-KK1: a bad integration request is refused by the parser before the program is asked.
    expect((await call("integrations:connect", "local", { service: "slack" })).threw).toMatch(/one of/);
    expect((await call("integrations:disconnect", "local", { service: "github" })).threw).toMatch(/true or false/);
    expect((await call("integrations:configure", "local", { service: "github", clientId: "two words" })).threw).toMatch(
      /single word/,
    );
    expect((await call("integrations:list", "local", null)).threw).toMatch(/still starting/);
    // W9-BE1: a bad phone request is refused by the parser before the program is asked.
    expect((await call("phone:set-push-enabled", "local", { enabled: "yes" })).threw).toMatch(/true or false/);
    expect((await call("phone:send-test-push", "local", {})).threw).toMatch(/not named/);
    expect((await call("phone:get-state", "local", null)).threw).toMatch(/not ready/);
    // W11: a bad search or tab request is refused by the parser before the program is asked.
    expect((await call("search:query", "local", { q: "  " })).threw).toMatch(/text/);
    expect((await call("thread-tabs:close", "local", { botId: "chief", threadId: "t", mode: "all" })).threw).toMatch(
      /Close/,
    );
    expect((await call("composer:search-mentions", "local", { botId: "chief" })).threw).toMatch(/text/);
    expect((await call("search:query", "local", { q: "x" })).threw).toMatch(/starting/);
    // W11-KK (d): a bad connector or Vault request is refused by the parser first, and never repeats the token.
    const badConnector = await call("vault-connectors:connect", "local", {
      connector: "onepassword",
      method: "app",
      secret: "secret-value-123",
    });
    expect(badConnector.threw).toMatch(/takes no token/);
    expect(badConnector.threw).not.toContain("secret-value-123");
    expect((await call("vault-connectors:connect", "local", { connector: "lastpass", method: "app" })).threw).toMatch(
      /connector is one of/,
    );
    expect((await call("vault-connectors:list", "local", null)).threw).toMatch(/still starting/);
    // W11-KK (e): a bad plugin request is refused by the parser first, and never repeats a typed value.
    const badPlugin = await call("plugin-catalog:install", "local", {
      slug: "../escape",
      secrets: { token: "secret-value-123" },
    });
    expect(badPlugin.threw).toMatch(/Choose a plugin/);
    expect(badPlugin.threw).not.toContain("secret-value-123");
    expect((await call("plugin-catalog:list", "local", { category: "games" })).threw).toMatch(/category is one of/);
    expect((await call("plugin-catalog:set-folder", "local", { directory: "relative" })).threw).toMatch(/full path/);
    expect((await call("plugin-catalog:add-custom", "local", { name: "Bad", transport: "http" })).threw).toMatch(
      /lowercase/,
    );
    expect((await call("plugin-catalog:info", "local", null)).threw).toMatch(/still starting/);
    expect((await call("vault:reveal", "local", { itemId: "x", field: "notes" })).threw).toMatch(/field is one of/);
    expect((await call("vault:import-csv", "local", { csv: "  " })).threw).toMatch(/empty/);
    expect((await call("vault:reset", "local", null)).threw).toMatch(/still starting/);
    // W10-KK2: a bad messenger request is refused by the parser before the program is asked, and never repeats the token.
    const badToken = await call("messengers:connect", "local", { kind: "telegram", token: "secret-value-123" });
    expect(badToken.threw).toMatch(/bot token/);
    expect(badToken.threw).not.toContain("secret-value-123");
    // W12-KK (2): Slack needs two tokens of its own shape, and never repeats what was typed.
    const badSlack = await call("messengers:connect", "local", {
      kind: "slack",
      token: "secret-value-123",
      appToken: "secret-app-456",
    });
    expect(badSlack.threw).toMatch(/Slack bot token/);
    expect(badSlack.threw).not.toContain("secret-value-123");
    expect(badSlack.threw).not.toContain("secret-app-456");
    expect(
      (await call("messengers:allow-chat", "local", { kind: "slack", chatId: "C0CHANNEL01", botId: "chief" })).threw,
    ).toMatch(/direct message/);
    expect((await call("messengers:connect", "local", { kind: "signal", token: "x" })).threw).toMatch(
      /messenger is one of/,
    );
    expect(
      (await call("messengers:allow-chat", "local", { kind: "telegram", chatId: "-5", botId: "chief" })).threw,
    ).toMatch(/digits only/);
    expect((await call("messengers:list", "local", null)).threw).toMatch(/still starting/);
    const threads = await call("threads:list", "local", { botId: "chief" });
    expect(threads.threw).toMatch(/still starting/);
    // A call that is for this computer but wrong is refused by the contract parser, before any work.
    expect((await call("threads:delete", "local", { botId: "chief", threadId: "t1" })).threw).toMatch(/confirmation/);
    expect((await call("threads:select", "local", { botId: "chief" })).threw).toMatch(/thread/i);
    // W6-BE3: a plan answer is only "approve" or "reject" (Q9: no editing), checked before any work.
    expect((await call("plans:respond", "local", { requestId: "p1", decision: "edit" })).threw).toMatch(/approve/);
    expect((await call("plans:list", "local", { botId: "chief" })).threw).toMatch(/still starting/);
    // W6-BE4: Stop needs an id (checked before any work); the list answers once the program is up.
    // W6-BE5: a sign-in code that is empty is refused by the contract parser, before any work (and never echoed).
    expect((await call("acp-login:submit-code", "local", { agentId: "gemini", code: " " })).threw).toMatch(
      /Paste the code/,
    );
    expect((await call("acp-login:start", "local", { agentId: "" })).threw).toMatch(/Choose an agent/);
    expect((await call("acp-login:list", "local", null)).threw).toMatch(/still starting/);
    // W6-BE5: a preset the program does not know is refused by the parser, before any work.
    expect((await call("acp-presets:add", "local", { presetId: "grok" })).threw).toMatch(/ready settings/);
    expect((await call("acp-presets:list", "local", null)).threw).toMatch(/still starting/);
    expect((await call("subagents:stop", "local", {})).threw).toMatch(/subagent/i);
    expect((await call("subagents:list", "local", { botId: "chief" })).threw).toMatch(/still starting/);
    // W6-BE3: a delete without confirmation and an empty edit are refused by the contract parser, before any work.
    expect((await call("message-actions:delete", "local", { botId: "chief", messageId: "m1" })).threw).toMatch(
      /confirmation/,
    );
    expect((await call("message-actions:edit", "local", { botId: "chief", messageId: "m1", text: " " })).threw).toMatch(
      /empty/,
    );
    expect(
      (await call("message-actions:pin", "local", { botId: "chief", messageId: "m1", pinned: true })).threw,
    ).toMatch(/still starting/);
  });
});
