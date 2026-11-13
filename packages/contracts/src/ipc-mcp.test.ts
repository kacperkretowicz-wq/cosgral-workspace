import { describe, expect, it } from "vitest";
import {
  type AgentMcpServerSetting,
  IPC_CHANNELS,
  isAgentEvent,
  isAgentMcpServerSetting,
  isMcpServer,
  isMcpServerName,
  MCP_LIMITS,
  type McpServer,
  mcpNamespace,
} from "./ipc";

const server: McpServer = {
  id: "srv-1",
  name: "local_echo",
  transport: "stdio",
  command: "node",
  args: ["echo-server.mjs"],
  cwd: null,
  url: null,
  secretNames: ["API_KEY"],
  status: "available",
  errorMessage: null,
  tools: [{ name: "echo", description: "Echo text back." }],
  createdAt: "2026-11-13T03:00:00.000Z",
  updatedAt: "2026-11-13T03:00:00.000Z",
};

describe("MCP IPC contract", () => {
  it("accepts names that make a safe tool namespace", () => {
    expect(isMcpServerName("local_echo")).toBe(true);
    expect(isMcpServerName("a")).toBe(true);
    for (const bad of ["", "Echo", "1echo", "echo-server", "echo server", "e".repeat(MCP_LIMITS.name + 1), 5]) {
      expect(isMcpServerName(bad)).toBe(false);
    }
    expect(mcpNamespace("local_echo")).toBe("mcp_local_echo");
  });

  it("validates a server record; secrets appear only as names", () => {
    expect(isMcpServer(server)).toBe(true);
    expect(isMcpServer({ ...server, transport: "sse" })).toBe(false);
    expect(isMcpServer({ ...server, status: "online" })).toBe(false);
    expect(isMcpServer({ ...server, tools: [{ name: "echo" }] })).toBe(false);
    expect(
      isMcpServer({ ...server, transport: "http", command: null, args: [], url: "http://127.0.0.1:7777/mcp" }),
    ).toBe(true);
    expect(Object.keys(server)).not.toContain("secrets");
  });

  it("validates per-agent switches and both events", () => {
    const setting: AgentMcpServerSetting = { botId: "chief", serverId: "srv-1", enabled: false };
    expect(isAgentMcpServerSetting(setting)).toBe(true);
    expect(isAgentMcpServerSetting({ ...setting, enabled: "no" })).toBe(false);
    expect(isAgentEvent({ type: "mcp-servers-changed", servers: [server] })).toBe(true);
    expect(isAgentEvent({ type: "mcp-servers-changed", servers: [{ id: "x" }] })).toBe(false);
    expect(isAgentEvent({ type: "agent-mcp-changed", botId: "chief", settings: [setting] })).toBe(true);
    expect(isAgentEvent({ type: "agent-mcp-changed", settings: [setting] })).toBe(false);
  });

  it("has one IPC channel per operation", () => {
    expect([
      IPC_CHANNELS.mcpList,
      IPC_CHANNELS.mcpAdd,
      IPC_CHANNELS.mcpUpdate,
      IPC_CHANNELS.mcpRemove,
      IPC_CHANNELS.mcpReconnect,
      IPC_CHANNELS.mcpListAgentSettings,
      IPC_CHANNELS.mcpSetAgentEnabled,
    ]).toEqual([
      "mcp:list",
      "mcp:add",
      "mcp:update",
      "mcp:remove",
      "mcp:reconnect",
      "mcp:list-agent-settings",
      "mcp:set-agent-enabled",
    ]);
  });
});
