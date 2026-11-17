// COSGRAL W11-KK (e): the `plugin-catalog:*` IPC (this computer only): the Marketplace Apps tab. Every request is parsed by the
// contract first; typed values are only handed to the MCP engine and are never echoed: an error is the parser's sentence or the
// engine's own.

import {
  IPC_CHANNELS,
  parseAddCustomPluginInput,
  parseInstallPluginInput,
  parseListPluginsInput,
  parsePluginSlugInput,
  parseSetPluginCatalogFolderInput,
} from "@openbot/contracts/ipc";
import type { PluginCatalogService } from "../backend/plugin-catalog/plugin-catalog-service";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerPluginCatalogIpc(service: () => PluginCatalogService | null): void {
  const local = (input: unknown) => {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error("Plugins are managed on this computer only.");
    return request.payload;
  };
  const current = (): PluginCatalogService => {
    const value = service();
    if (!value) throw new Error("COSGRAL Workspace is still starting.");
    return value;
  };
  handleTrusted(IPC_CHANNELS.pluginCatalogInfo, (input: unknown) => {
    local(input);
    return current().info();
  });
  handleTrusted(IPC_CHANNELS.pluginCatalogList, (input: unknown) => {
    const request = parseListPluginsInput(local(input));
    return current().list(request);
  });
  handleTrusted(IPC_CHANNELS.pluginCatalogGet, (input: unknown) => {
    const request = parsePluginSlugInput(local(input));
    return current().get(request.slug);
  });
  handleTrusted(IPC_CHANNELS.pluginCatalogInstall, (input: unknown) => {
    const request = parseInstallPluginInput(local(input));
    return current().install(request);
  });
  handleTrusted(IPC_CHANNELS.pluginCatalogUninstall, (input: unknown) => {
    const request = parsePluginSlugInput(local(input));
    return current().uninstall(request.slug);
  });
  handleTrusted(IPC_CHANNELS.pluginCatalogUpdate, (input: unknown) => {
    const request = parsePluginSlugInput(local(input));
    return current().update(request.slug);
  });
  handleTrusted(IPC_CHANNELS.pluginCatalogAddCustom, (input: unknown) => {
    const request = parseAddCustomPluginInput(local(input));
    return current().addCustom(request);
  });
  handleTrusted(IPC_CHANNELS.pluginCatalogSetFolder, (input: unknown) => {
    const request = parseSetPluginCatalogFolderInput(local(input));
    return current().setCatalogFolder(request.directory);
  });
}
