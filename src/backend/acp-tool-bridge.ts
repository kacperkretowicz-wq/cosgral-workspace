// COSGRAL W3: program tools for ACP agents. ACP gives tools to an agent through the MCP servers named in
// session/new, so every ACP session gets one small stdio MCP server: this bridge. It lists the session's
// program tools (the same namespaces Codex and Claude get) and forwards each call to the program over
// loopback HTTP with a per-session token; AgentService answers it like any `item/tool/call`.
//
// The bridge has no dependencies, so it runs from a temporary file with Node, or with the Electron
// binary in Node mode (ELECTRON_RUN_AS_NODE=1) inside the packaged app.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DynamicRecord, isDynamicRecord, isString } from "@openbot/contracts/runtime-values";

export interface BridgeTool {
  /** Name the ACP agent sees: "<namespace>__<tool>", at most 64 characters. */
  exposed: string;
  namespace: string;
  tool: string;
  description: string;
  inputSchema: DynamicRecord;
}

export interface BridgeConfig {
  url: string;
  token: string;
  tools: BridgeTool[];
}

export const BRIDGE_ENV = "COSGRAL_ACP_BRIDGE";

/** The bridge program (CommonJS, Node built-ins only). */
export const BRIDGE_SOURCE = `"use strict";
const http = require("node:http");
const config = JSON.parse(Buffer.from(process.env.${BRIDGE_ENV} || "", "base64").toString("utf8"));
const byName = new Map(config.tools.map((tool) => [tool.exposed, tool]));
const write = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
function forward(tool, args) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ token: config.token, namespace: tool.namespace, tool: tool.tool, arguments: args });
    const request = http.request(config.url, { method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } }, (response) => {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => (data += chunk));
      response.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ success: false, contentItems: [{ type: "inputText", text: "The program sent no readable answer." }] }); }
      });
    });
    request.on("error", (error) => resolve({ success: false, contentItems: [{ type: "inputText", text: "The program is not reachable: " + error.message }] }));
    request.end(body);
  });
}
function content(result) {
  const items = Array.isArray(result && result.contentItems) ? result.contentItems : [];
  return items.map((item) => {
    if (item && item.type === "inputImage" && typeof item.imageUrl === "string") {
      const match = /^data:([^;]+);base64,(.*)$/.exec(item.imageUrl);
      if (match) return { type: "image", mimeType: match[1], data: match[2] };
    }
    return { type: "text", text: item && typeof item.text === "string" ? item.text : JSON.stringify(item) };
  });
}
async function handle(message) {
  if (message.id === undefined || message.id === null) return;
  if (message.method === "initialize") {
    write({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: (message.params && message.params.protocolVersion) || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "cosgral", version: "0.1.0" } } });
  } else if (message.method === "tools/list") {
    write({ jsonrpc: "2.0", id: message.id, result: { tools: config.tools.map((tool) => ({ name: tool.exposed, description: tool.description, inputSchema: tool.inputSchema })) } });
  } else if (message.method === "tools/call") {
    const tool = byName.get(message.params && message.params.name);
    if (!tool) {
      write({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: "Unknown tool." }], isError: true } });
      return;
    }
    const result = await forward(tool, (message.params && message.params.arguments) || {});
    write({ jsonrpc: "2.0", id: message.id, result: { content: content(result), isError: !(result && result.success) } });
  } else if (message.method === "ping") {
    write({ jsonrpc: "2.0", id: message.id, result: {} });
  } else {
    write({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } });
  }
}
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index = buffer.indexOf("\\n");
  while (index >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    index = buffer.indexOf("\\n");
    if (!line) continue;
    try { void handle(JSON.parse(line)); } catch { /* ignore broken lines */ }
  }
});
process.stdin.on("end", () => process.exit(0));
`;

/** Write the bridge once per content version and return its path. */
export async function bridgeFile(directory = join(tmpdir(), "cosgral-acp")): Promise<string> {
  const hash = createHash("sha256").update(BRIDGE_SOURCE).digest("hex").slice(0, 12);
  const file = join(directory, `bridge-${hash}.cjs`);
  await mkdir(directory, { recursive: true });
  await writeFile(file, BRIDGE_SOURCE, "utf8");
  return file;
}

/** Program tools from Codex-style dynamic tool namespaces, with names an ACP agent can call. */
export function bridgeTools(dynamicTools: unknown): BridgeTool[] {
  const tools: BridgeTool[] = [];
  const seen = new Set<string>();
  for (const entry of Array.isArray(dynamicTools) ? dynamicTools.flat() : []) {
    if (!isDynamicRecord(entry) || entry.type !== "namespace" || !isString(entry.name) || !Array.isArray(entry.tools)) {
      continue;
    }
    for (const tool of entry.tools) {
      if (!isDynamicRecord(tool) || !isString(tool.name)) continue;
      const exposed = `${entry.name}__${tool.name}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
      if (seen.has(exposed)) continue;
      seen.add(exposed);
      tools.push({
        exposed,
        namespace: entry.name,
        tool: tool.name,
        description: isString(tool.description) ? tool.description : tool.name,
        inputSchema: isDynamicRecord(tool.inputSchema) ? tool.inputSchema : { type: "object", properties: {} },
      });
    }
  }
  return tools;
}
