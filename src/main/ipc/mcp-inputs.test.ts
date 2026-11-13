import { describe, expect, it } from "vitest";
import {
  parseAddMcpServer,
  parseMcpBotId,
  parseMcpServerId,
  parseSetAgentMcpServer,
  parseUpdateMcpServer,
} from "./mcp-inputs";

describe("MCP IPC input parsing", () => {
  it("parses a stdio and an http server with secrets", () => {
    expect(
      parseAddMcpServer({
        name: "local_echo",
        transport: "stdio",
        command: "node",
        args: ["a.mjs"],
        secrets: { KEY: "v" },
      }),
    ).toEqual({
      name: "local_echo",
      transport: "stdio",
      command: "node",
      args: ["a.mjs"],
      cwd: undefined,
      url: undefined,
      secrets: { KEY: "v" },
    });
    expect(parseAddMcpServer({ name: "docs", transport: "http", url: "https://x.test/rpc" })).toMatchObject({
      transport: "http",
      url: "https://x.test/rpc",
      secrets: undefined,
    });
  });

  it("rejects wrong shapes before they reach the store", () => {
    expect(() => parseAddMcpServer(null)).toThrow();
    expect(() => parseAddMcpServer({ name: "x", transport: "sse", url: "http://a" })).toThrow(/stdio or http/);
    expect(() => parseAddMcpServer({ name: "x", transport: "stdio", command: "node", args: "a.mjs" })).toThrow(/args/);
    expect(() => parseAddMcpServer({ name: "x", transport: "stdio", command: "node", secrets: { KEY: 5 } })).toThrow(
      /secrets/,
    );
    expect(() => parseAddMcpServer({ name: "x", transport: "stdio", command: "node", secrets: ["KEY"] })).toThrow(
      /secrets/,
    );
  });

  it("parses updates, ids and the per-agent switch", () => {
    expect(parseUpdateMcpServer({ serverId: "s1", name: "new_name" })).toEqual({
      serverId: "s1",
      name: "new_name",
      command: undefined,
      args: undefined,
      cwd: undefined,
      url: undefined,
      secrets: undefined,
    });
    expect(parseUpdateMcpServer({ serverId: "s1", cwd: null })).toMatchObject({ cwd: null });
    expect(parseMcpServerId({ serverId: "s1" })).toEqual({ serverId: "s1" });
    expect(parseMcpBotId("chief")).toBe("chief");
    expect(parseSetAgentMcpServer({ botId: "chief", serverId: "s1", enabled: false })).toEqual({
      botId: "chief",
      serverId: "s1",
      enabled: false,
    });
    expect(() => parseSetAgentMcpServer({ botId: "chief", serverId: "s1", enabled: "no" })).toThrow(/enabled/);
  });
});
