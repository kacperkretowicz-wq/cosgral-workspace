// COSGRAL W2: MCP servers a person adds to the program (spec-w2 §2, lead decision 2).
//
// The server list is shared by the whole program. Each agent has its own on/off switch per server;
// a new agent has every server on. A connected server's tools reach the agents that have it on
// (Codex and Claude, channel turns included) from their next conversation turn.
//
// Secrets (environment values of a stdio server, HTTP headers such as Authorization) are write-only:
// a person sets them, the program keeps them encrypted, and no read API returns their values —
// only their names.

import { isBoolean, isDynamicRecord, isOneOf, isString } from "./runtime-values";

export const MCP_TRANSPORTS = ["stdio", "http"] as const;
export type McpTransport = (typeof MCP_TRANSPORTS)[number];

/**
 * "checking": connecting and reading the tool list.
 * "available": connected, tools listed.
 * "needs-login": the server refused for missing or wrong credentials (HTTP 401/403).
 * "error": anything else (wrong command, unreachable, protocol error); see `errorMessage`.
 */
export const MCP_SERVER_STATUSES = ["checking", "available", "needs-login", "error"] as const;
export type McpServerStatus = (typeof MCP_SERVER_STATUSES)[number];

export const MCP_LIMITS = {
  /** Lowercase letter first, then lowercase letters, digits and underscores. Becomes the tool namespace `mcp_<name>`. */
  name: 40,
  command: 1_000,
  arg: 2_000,
  args: 64,
  url: 2_000,
  secretName: 128,
  secretValue: 8_000,
  secrets: 32,
  servers: 64,
  toolsPerServer: 128,
  /** Seconds to connect and list tools before the server counts as an error. */
  connectTimeoutSeconds: 20,
  /** Seconds one tool call may take. */
  callTimeoutSeconds: 120,
} as const;

/** Namespace prefix of MCP server tools for agents. */
export const MCP_NAMESPACE_PREFIX = "mcp_";

export interface McpToolSummary {
  name: string;
  description: string;
}

export interface McpServer {
  id: string;
  /** Unique short name, see `MCP_LIMITS.name`. */
  name: string;
  transport: McpTransport;
  /** stdio: the program to start and its arguments, and an optional working folder. */
  command: string | null;
  args: string[];
  cwd: string | null;
  /** http: the streamable HTTP endpoint. */
  url: string | null;
  /** Names of the secret environment values (stdio) or headers (http); never their values. */
  secretNames: string[];
  status: McpServerStatus;
  /** A short readable reason for "error" and "needs-login"; never contains secret values. */
  errorMessage: string | null;
  tools: McpToolSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface AddMcpServerInput {
  name: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  cwd?: string | null;
  url?: string;
  /** stdio: environment values; http: request headers. Stored encrypted. */
  secrets?: Record<string, string>;
}

export interface UpdateMcpServerInput {
  serverId: string;
  name?: string;
  command?: string;
  args?: string[];
  cwd?: string | null;
  url?: string;
  /** Replaces every secret when given; omitted keeps the current ones. */
  secrets?: Record<string, string>;
}

export interface McpServerIdInput {
  serverId: string;
}

/** The switch of one agent for one server. */
export interface AgentMcpServerSetting {
  botId: string;
  serverId: string;
  enabled: boolean;
}

export interface SetAgentMcpServerInput {
  botId: string;
  serverId: string;
  enabled: boolean;
}

export function mcpNamespace(serverName: string): string {
  return `${MCP_NAMESPACE_PREFIX}${serverName}`;
}

export function isMcpServerName(value: unknown): value is string {
  return isString(value) && value.length <= MCP_LIMITS.name && /^[a-z][a-z0-9_]*$/.test(value);
}

export function isMcpTransport(value: unknown): value is McpTransport {
  return isOneOf(MCP_TRANSPORTS, value);
}

export function isMcpServerStatus(value: unknown): value is McpServerStatus {
  return isOneOf(MCP_SERVER_STATUSES, value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

export function isMcpToolSummary(value: unknown): value is McpToolSummary {
  return isDynamicRecord(value) && isString(value.name) && isString(value.description);
}

export function isMcpServer(value: unknown): value is McpServer {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isMcpServerName(value.name) &&
    isMcpTransport(value.transport) &&
    isNullableString(value.command) &&
    isStringList(value.args) &&
    isNullableString(value.cwd) &&
    isNullableString(value.url) &&
    isStringList(value.secretNames) &&
    isMcpServerStatus(value.status) &&
    isNullableString(value.errorMessage) &&
    Array.isArray(value.tools) &&
    value.tools.every(isMcpToolSummary) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

export function isAgentMcpServerSetting(value: unknown): value is AgentMcpServerSetting {
  return isDynamicRecord(value) && isString(value.botId) && isString(value.serverId) && isBoolean(value.enabled);
}
