// COSGRAL W2: input validation for the MCP IPC calls. Content rules (names, URLs, limits) are in McpStore.

import {
  type AddMcpServerInput,
  isMcpTransport,
  MCP_LIMITS,
  type McpServerIdInput,
  type SetAgentMcpServerInput,
  type UpdateMcpServerInput,
} from "@openbot/contracts/ipc";
import { isBoolean, isString } from "@openbot/contracts/runtime-values";
import { isObject, requireString } from "./validation";

export function parseAddMcpServer(value: unknown): AddMcpServerInput {
  if (!isObject(value)) throw new Error("MCP server details are required.");
  if (!isMcpTransport(value.transport)) throw new Error("The transport is stdio or http.");
  return {
    name: requireString(value.name, "name"),
    transport: value.transport,
    command: optionalString(value.command, "command", MCP_LIMITS.command),
    args: optionalStrings(value.args),
    cwd: optionalNullableString(value.cwd),
    url: optionalString(value.url, "url", MCP_LIMITS.url),
    secrets: optionalSecrets(value.secrets),
  };
}

export function parseUpdateMcpServer(value: unknown): UpdateMcpServerInput {
  if (!isObject(value)) throw new Error("MCP server details are required.");
  return {
    serverId: requireString(value.serverId, "serverId"),
    name: optionalString(value.name, "name"),
    command: optionalString(value.command, "command", MCP_LIMITS.command),
    args: optionalStrings(value.args),
    cwd: optionalNullableString(value.cwd),
    url: optionalString(value.url, "url", MCP_LIMITS.url),
    secrets: optionalSecrets(value.secrets),
  };
}

export function parseMcpServerId(value: unknown): McpServerIdInput {
  if (!isObject(value)) throw new Error("The MCP server is required.");
  return { serverId: requireString(value.serverId, "serverId") };
}

export function parseMcpBotId(value: unknown): string {
  return requireString(value, "botId");
}

export function parseSetAgentMcpServer(value: unknown): SetAgentMcpServerInput {
  if (!isObject(value)) throw new Error("The MCP switch details are required.");
  if (!isBoolean(value.enabled)) throw new Error("enabled must be true or false.");
  return {
    botId: requireString(value.botId, "botId"),
    serverId: requireString(value.serverId, "serverId"),
    enabled: value.enabled,
  };
}

function optionalString(value: unknown, name: string, maxLength?: number): string | undefined {
  return value === undefined || value === null ? undefined : requireString(value, name, maxLength);
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return requireString(value, "cwd", MCP_LIMITS.command);
}

function optionalStrings(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || !value.every(isString)) throw new Error("args must be a list of texts.");
  return [...value];
}

/** Secret values pass through untouched; they are never echoed back in an error. */
function optionalSecrets(value: unknown): Record<string, string> | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isObject(value) || Array.isArray(value)) throw new Error("secrets must be a map of names to texts.");
  const secrets: Record<string, string> = {};
  for (const [key, secret] of Object.entries(value)) {
    if (!isString(secret)) throw new Error("secrets must be a map of names to texts.");
    secrets[key] = secret;
  }
  return secrets;
}
