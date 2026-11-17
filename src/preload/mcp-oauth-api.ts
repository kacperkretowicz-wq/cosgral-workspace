// COSGRAL W12-KK (1): the window API of the MCP sign-in (OAuth). Answers are checked with the contract guards.

import {
  IPC_CHANNELS,
  isMcpOAuthList,
  isMcpOAuthStatus,
  type McpOAuthDesktopApi,
  type McpOAuthList,
  type McpOAuthStatus,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createMcpOAuthApi(invoke: Invoke): McpOAuthDesktopApi {
  return {
    list: () => invoke(IPC_CHANNELS.mcpOauthList, null, decodeList),
    status: (input) => invoke(IPC_CHANNELS.mcpOauthStatus, input, decodeStatus),
    signIn: (input) => invoke(IPC_CHANNELS.mcpOauthSignIn, input, decodeStatus),
    cancel: (input) => invoke(IPC_CHANNELS.mcpOauthCancel, input, decodeStatus),
    signOut: (input) => invoke(IPC_CHANNELS.mcpOauthSignOut, input, decodeStatus),
  };
}

function decodeList(value: unknown): McpOAuthList {
  if (!isMcpOAuthList(value)) throw new Error("Invalid sign-in list.");
  return value;
}

function decodeStatus(value: unknown): McpOAuthStatus {
  if (!isMcpOAuthStatus(value)) throw new Error("Invalid sign-in status.");
  return value;
}
