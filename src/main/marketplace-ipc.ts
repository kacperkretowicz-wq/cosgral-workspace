// COSGRAL W3: IPC of the local Marketplace. The catalog and its installs are on this computer only; a remote server
// shows an empty catalog.

import { IPC_CHANNELS } from "@openbot/contracts/ipc";
import type { Marketplace } from "../backend/marketplace";
import { parseAgentRequest } from "./ipc/agent-inputs";
import {
  parseInstallMarketplaceAgent,
  parseInstallMarketplaceSkill,
  parseListMarketplace,
  parseMarketplaceItemId,
  parseMarketplaceSuggestions,
  parseUninstallMarketplaceItem,
} from "./ipc/marketplace-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerMarketplaceIpc(marketplace: () => Marketplace): void {
  handleTrusted(IPC_CHANNELS.marketplaceList, (input: unknown) => {
    const scoped = parseAgentRequest(input);
    return scoped.serverId === "local" ? marketplace().list(parseListMarketplace(scoped.payload)) : [];
  });
  handleTrusted(IPC_CHANNELS.marketplaceGet, (input: unknown) =>
    marketplace().get(local(input, parseMarketplaceItemId).itemId),
  );
  handleTrusted(IPC_CHANNELS.marketplaceInstallSkill, (input: unknown) =>
    marketplace().installSkill(local(input, parseInstallMarketplaceSkill)),
  );
  handleTrusted(IPC_CHANNELS.marketplaceInstallAgent, (input: unknown) =>
    marketplace().installAgent(local(input, parseInstallMarketplaceAgent)),
  );
  handleTrusted(IPC_CHANNELS.marketplaceUninstall, (input: unknown) =>
    marketplace().uninstall(local(input, parseUninstallMarketplaceItem)),
  );
  handleTrusted(IPC_CHANNELS.marketplaceSuggestions, (input: unknown) => {
    const scoped = parseAgentRequest(input);
    return scoped.serverId === "local" ? marketplace().suggestions(parseMarketplaceSuggestions(scoped.payload)) : [];
  });
}

function local<T>(input: unknown, parse: (payload: unknown) => T): T {
  const scoped = parseAgentRequest(input);
  if (scoped.serverId !== "local") throw new Error("The Marketplace is on this computer only for now.");
  return parse(scoped.payload);
}
