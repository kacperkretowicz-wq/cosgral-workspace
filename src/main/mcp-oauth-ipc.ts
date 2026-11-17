// COSGRAL W12-KK (1): the `mcp-oauth:*` IPC (this computer only): sign in to MCP servers over http. Every request is parsed by the
// contract first. The answers hold no token, code or address with a code.

import { IPC_CHANNELS, parseMcpOAuthServerInput } from "@openbot/contracts/ipc";
import type { McpOAuthService } from "../backend/mcp-oauth/mcp-oauth-service";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerMcpOAuthIpc(service: () => McpOAuthService | null): void {
  const local = (input: unknown) => {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error("Sign-in to servers is managed on this computer only.");
    return request.payload;
  };
  const current = (): McpOAuthService => {
    const value = service();
    if (!value) throw new Error("COSGRAL Workspace is still starting.");
    return value;
  };
  handleTrusted(IPC_CHANNELS.mcpOauthList, (input: unknown) => {
    local(input);
    return current().list();
  });
  handleTrusted(IPC_CHANNELS.mcpOauthStatus, (input: unknown) => {
    const request = parseMcpOAuthServerInput(local(input));
    return current().status(request.serverId);
  });
  handleTrusted(IPC_CHANNELS.mcpOauthSignIn, (input: unknown) => {
    const request = parseMcpOAuthServerInput(local(input));
    return current().signIn(request.serverId);
  });
  handleTrusted(IPC_CHANNELS.mcpOauthCancel, (input: unknown) => {
    const request = parseMcpOAuthServerInput(local(input));
    return current().cancel(request.serverId);
  });
  handleTrusted(IPC_CHANNELS.mcpOauthSignOut, (input: unknown) => {
    const request = parseMcpOAuthServerInput(local(input));
    return current().signOut(request.serverId);
  });
}
