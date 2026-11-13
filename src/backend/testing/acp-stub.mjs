// COSGRAL W3 test fixture: a tiny Agent Client Protocol agent over stdio. It is NOT a model.
// Words in the prompt choose what it does:
//   TOOLS                      -> lists the tools of the MCP server(s) from session/new
//   TOOL <exposed name> <text> -> calls that tool through the MCP server and answers with the result
//   LIMIT                      -> JSON-RPC error: usage limit, resets in 10 minutes
//   UNAVAILABLE                -> JSON-RPC error: service unavailable
//   BADINPUT                   -> JSON-RPC error: invalid request (a user error)
//   SLOW                       -> answers after 3 s (to cancel it)
// Anything else: "ACP stub (not a model): received <text>" in two chunks.
// The first prompt of a session also reports whether program instructions came with it.
import { spawn } from "node:child_process";

const name = process.argv[2] ?? "acp-stub";
const sessions = new Map();
let counter = 0;
const write = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
const update = (sessionId, text) =>
  write({
    method: "session/update",
    params: { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } },
  });

/** A minimal MCP client over stdio for the bridge in session/new. */
function mcpCall(server, method, params) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    for (const item of server.env ?? []) env[item.name] = item.value;
    const child = spawn(server.command, server.args ?? [], { env, stdio: ["pipe", "pipe", "ignore"] });
    let buffer = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("MCP server timeout"));
    }, 15_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      for (const line of buffer.split("\n").slice(0, -1)) {
        const message = JSON.parse(line);
        if (message.id === 2) {
          clearTimeout(timer);
          child.stdin.end();
          resolve(message.result ?? message.error);
        }
      }
      buffer = buffer.slice(buffer.lastIndexOf("\n") + 1);
    });
    child.on("error", reject);
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name, version: "0" } } })}\n`,
    );
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method, params })}\n`);
  });
}

async function prompt(id, params) {
  const session = sessions.get(params.sessionId);
  if (!session) return write({ id, error: { code: -32602, message: "Unknown session" } });
  const text = (params.prompt ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  const first = !session.prompted;
  session.prompted = true;
  const said = text.split("</cosgral_instructions>").pop().trim();
  if (said.includes("LIMIT")) {
    return write({
      id,
      error: {
        code: 429,
        message: "Usage limit reached for this account.",
        data: { kind: "usage_limit", resetsAt: Math.floor(Date.now() / 1000) + 600 },
      },
    });
  }
  if (said.includes("UNAVAILABLE"))
    return write({ id, error: { code: 503, message: "Service unavailable, try again later." } });
  if (said.includes("BADINPUT"))
    return write({ id, error: { code: -32602, message: "Invalid request: the prompt is not allowed." } });
  const intro = first ? `[instructions ${text.includes("<cosgral_instructions>") ? "received" : "missing"}] ` : "";
  if (said.includes("TOOLS")) {
    const server = session.mcpServers[0];
    const listed = server ? await mcpCall(server, "tools/list", {}) : { tools: [] };
    update(
      params.sessionId,
      `${intro}ACP stub (not a model): tools ${listed.tools.map((tool) => tool.name).join(", ")}`,
    );
    return write({ id, result: { stopReason: "end_turn" } });
  }
  const tool = said.match(/TOOL\s+(\S+)\s*(.*)$/s);
  if (tool) {
    const server = session.mcpServers[0];
    const result = await mcpCall(server, "tools/call", { name: tool[1], arguments: tool[2] ? { text: tool[2] } : {} });
    const resultText = (result.content ?? []).map((item) => item.text ?? "").join(" ");
    update(
      params.sessionId,
      `${intro}ACP stub (not a model): ${tool[1]} -> ${result.isError ? "error" : "ok"}: ${resultText}`,
    );
    return write({ id, result: { stopReason: "end_turn" } });
  }
  const reply = `${intro}ACP stub (not a model): received "${said.slice(0, 200)}"`;
  const half = Math.ceil(reply.length / 2);
  const delay = said.includes("SLOW") ? 3_000 : 50;
  session.pending = { id, timers: [] };
  session.pending.timers.push(setTimeout(() => update(params.sessionId, reply.slice(0, half)), 20));
  session.pending.timers.push(
    setTimeout(() => {
      update(params.sessionId, reply.slice(half));
      session.pending = null;
      write({ id, result: { stopReason: "end_turn" } });
    }, delay),
  );
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index = buffer.indexOf("\n");
  while (index >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    index = buffer.indexOf("\n");
    if (!line) continue;
    const { id, method, params } = JSON.parse(line);
    if (method === "initialize") {
      write({ id, result: { protocolVersion: 1, agentCapabilities: { loadSession: false }, authMethods: [] } });
    } else if (method === "session/new") {
      const sessionId = `${name}-session-${++counter}`;
      sessions.set(sessionId, { mcpServers: params.mcpServers ?? [], prompted: false, pending: null });
      write({ id, result: { sessionId } });
    } else if (method === "session/prompt") {
      void prompt(id, params).catch((error) => write({ id, error: { code: -32603, message: String(error) } }));
    } else if (method === "session/cancel") {
      const session = sessions.get(params.sessionId);
      if (session?.pending) {
        for (const timer of session.pending.timers) clearTimeout(timer);
        write({ id: session.pending.id, result: { stopReason: "cancelled" } });
        session.pending = null;
      }
    } else if (id !== undefined) {
      write({ id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  }
});
process.stdin.on("end", () => process.exit(0));
