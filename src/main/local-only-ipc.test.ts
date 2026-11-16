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
  registerThreadsIpc(() => null);
  const { registerPlansIpc } = await import("./plans-ipc");
  registerPlansIpc(() => null);
  const { registerMessageActionsIpc } = await import("./message-actions-ipc");
  registerMessageActionsIpc(() => null);
  registerWindowsIpc(() => null);
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
    // COSGRAL W6-KK3: the separate conversation windows.
    expect(channelsOf("windows:").length).toBe(4);
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
        "windows:",
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
    const threads = await call("threads:list", "local", { botId: "chief" });
    expect(threads.threw).toMatch(/still starting/);
    // A call that is for this computer but wrong is refused by the contract parser, before any work.
    expect((await call("threads:delete", "local", { botId: "chief", threadId: "t1" })).threw).toMatch(/confirmation/);
    expect((await call("threads:select", "local", { botId: "chief" })).threw).toMatch(/thread/i);
    // W6-BE3: a plan answer is only "approve" or "reject" (Q9: no editing), checked before any work.
    expect((await call("plans:respond", "local", { requestId: "p1", decision: "edit" })).threw).toMatch(/approve/);
    expect((await call("plans:list", "local", { botId: "chief" })).threw).toMatch(/still starting/);
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
