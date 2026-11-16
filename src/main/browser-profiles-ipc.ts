// COSGRAL W8-KK3: the `browser-profiles:*` IPC (this computer only): list, create, set the domain lists, clear and describe
// the browser profile of an agent. Every request is parsed by the contract first; clearing needs `confirm: true`. Removing
// the stored sessions of a profile is the caller's (it needs Electron): this file only orders it and remembers the time.

import {
  IPC_CHANNELS,
  parseBrowserProfileInput,
  parseClearBrowserProfileInput,
  parseSetBrowserDomainsInput,
} from "@openbot/contracts/ipc";
import type { BrowserProfileStore } from "../backend/browser-profiles";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export interface BrowserProfilesIpcOptions {
  store: () => BrowserProfileStore | null;
  /** Removes cookies, storage, cache and sign-ins of ONE partition (and only that one). Resolves when it is done. */
  clearPartition: (partition: string) => Promise<void>;
  /** Pages of the agent's profile that are open now. */
  openTabs: (botId: string) => number;
}

export function registerBrowserProfilesIpc(options: BrowserProfilesIpcOptions): void {
  const local = (input: unknown) => {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error("Browser profiles are managed on this computer only.");
    return request.payload;
  };
  const keeper = (): BrowserProfileStore => {
    const value = options.store();
    if (!value) throw new Error("COSGRAL Workspace is still starting.");
    return value;
  };
  handleTrusted(IPC_CHANNELS.browserProfilesList, (input: unknown) => {
    local(input);
    return keeper().list();
  });
  handleTrusted(IPC_CHANNELS.browserProfilesCreate, (input: unknown) => {
    const request = parseBrowserProfileInput(local(input));
    return keeper().create(request.botId);
  });
  handleTrusted(IPC_CHANNELS.browserProfilesSetDomains, (input: unknown) => {
    const request = parseSetBrowserDomainsInput(local(input));
    return keeper().setDomains(request.botId, { allow: request.allow, block: request.block });
  });
  handleTrusted(IPC_CHANNELS.browserProfilesClear, async (input: unknown) => {
    const request = parseClearBrowserProfileInput(local(input));
    const store = keeper();
    if (!store.has(request.botId))
      throw new Error("This agent has no browser profile yet, so there is nothing to clear.");
    await options.clearPartition(store.partitionOf(request.botId));
    return store.markCleared(request.botId);
  });
  handleTrusted(IPC_CHANNELS.browserProfilesDescribe, (input: unknown) => {
    const request = parseBrowserProfileInput(local(input));
    return keeper().describe(request.botId, options.openTabs(request.botId));
  });
}
