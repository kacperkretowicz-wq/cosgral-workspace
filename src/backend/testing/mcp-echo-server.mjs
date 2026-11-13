// COSGRAL W2 test fixture: a tiny MCP server. Run directly for stdio (`node mcp-echo-server.mjs`),
// or use echoHttpHandler() as a plain Node HTTP handler for the streamable HTTP transport
// (JSON responses, no session), or echoFetch() to answer the same way without the network.
// Tools:
//   echo {text}  -> "cosgral-mcp-echo: <text>"
//   env_check {} -> whether ECHO_SECRET reached the process and its length (never its value)
import { pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const TOOLS = [
  {
    name: "echo",
    description: "Echo the text back, prefixed with cosgral-mcp-echo.",
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
  {
    name: "env_check",
    description: "Report whether the ECHO_SECRET environment value reached the server (length only).",
    inputSchema: { type: "object", properties: {} },
  },
];

function callTool(name, args = {}) {
  if (name === "echo") return { content: [{ type: "text", text: `cosgral-mcp-echo: ${String(args.text ?? "")}` }] };
  if (name === "env_check") {
    const value = process.env.ECHO_SECRET ?? "";
    return {
      content: [{ type: "text", text: JSON.stringify({ secretPresent: value.length > 0, length: value.length }) }],
    };
  }
  return { content: [{ type: "text", text: `Unknown tool ${name}` }], isError: true };
}

export function createEchoServer() {
  const server = new Server({ name: "cosgral-echo", version: "0.1.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    callTool(request.params.name, request.params.arguments),
  );
  return server;
}

/** Minimal streamable HTTP endpoint: POST JSON-RPC in, JSON out; notifications get 202; GET gets 405. */
export async function echoHttpHandler(request, response) {
  if (request.method !== "POST") {
    response.writeHead(405).end();
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = answerJsonRpc(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  if (body === null) {
    response.writeHead(202).end();
    return;
  }
  response.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  response.end(body);
}

/** The same endpoint as a fetch function, without the network (see the note in mcp-manager.test.ts). */
export async function echoFetch(_url, init = {}) {
  if ((init.method ?? "GET") !== "POST") return new Response(null, { status: 405 });
  const body = answerJsonRpc(JSON.parse(String(init.body)));
  if (body === null) return new Response(null, { status: 202 });
  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

/** The JSON text answering one JSON-RPC message, or null for a notification. */
export function answerJsonRpc(message) {
  if (message.id === undefined) return null;
  let result;
  if (message.method === "initialize") {
    result = {
      protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "cosgral-echo-http", version: "0.1.0" },
    };
  } else if (message.method === "tools/list") {
    result = { tools: TOOLS };
  } else if (message.method === "tools/call") {
    result = callTool(message.params?.name, message.params?.arguments);
  } else if (message.method === "ping") {
    result = {};
  }
  return JSON.stringify(
    result === undefined
      ? { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `No method ${message.method}` } }
      : { jsonrpc: "2.0", id: message.id, result },
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await createEchoServer().connect(new StdioServerTransport());
}
