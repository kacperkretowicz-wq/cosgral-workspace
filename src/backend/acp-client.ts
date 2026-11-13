// COSGRAL W3: Agent Client Protocol (ACP) agents as a provider. Speaks the same app-server protocol to
// AgentService as the Codex and Claude clients (thread/start, turn/start, item/agentMessage/delta,
// turn/completed, item/tool/call …) and ACP JSON-RPC over stdio to each configured agent program:
// initialize, session/new (with the program-tools bridge as its MCP server), session/prompt with
// session/update chunks, session/cancel.
//
// Errors of a prompt carry `errorKind` on the "error" notification: "usage-limit" (with resetsAt when the
// agent gives it) and "unavailable" may move the turn to a fallback model; anything else (a user error)
// never does.
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { type AcpAgentConfig, isAcpModel } from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { BRIDGE_ENV, type BridgeTool, bridgeFile, bridgeTools } from "./acp-tool-bridge";
import type { AgentClient, AgentProvider } from "./agent-client";
import type {
  AppServerNotification,
  AppServerRequest,
  RequestId,
  ResponseDecoder,
  RpcError,
  ThreadResponse,
} from "./protocol";

interface ClientEvents {
  notification: [notification: AppServerNotification];
  request: [request: AppServerRequest];
  exit: [error: Error];
  diagnostic: [message: string];
}

export interface AcpClientOptions {
  /** The configured ACP agents (read on every use, so edits apply to new sessions). */
  agents: () => AcpAgentConfig[];
  /** Where the bridge program is written (default: the system temp folder). */
  bridgeDirectory?: string;
}

export type AcpErrorKind = "usage-limit" | "unavailable" | null;

interface ThreadState {
  id: string;
  model: string;
  cwd: string;
  instructions: string;
  tools: BridgeTool[];
  sessionId: string | null;
  /** The agent id whose process owns the session. */
  sessionAgent: string | null;
  instructionsSent: boolean;
  activeTurn: { id: string; itemId: string; text: string; promptId: number | null } | null;
  turns: NonNullable<ThreadResponse["thread"]["turns"]>;
  token: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: AcpRpcError) => void;
}

class AcpRpcError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly data: unknown,
  ) {
    super(message);
  }
}

/** One running ACP agent program. */
class AcpProcess {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #pending = new Map<number, Pending>();
  readonly #onUpdate: (sessionId: string, update: DynamicRecord) => void;
  #nextId = 1;
  #buffer = "";
  readonly ready: Promise<void>;
  exited = false;

  constructor(
    config: AcpAgentConfig,
    onUpdate: (sessionId: string, update: DynamicRecord) => void,
    onExit: (error: Error) => void,
  ) {
    this.#onUpdate = onUpdate;
    this.#child = spawn(config.command, config.args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.#child.stdout.setEncoding("utf8");
    this.#child.stdout.on("data", (chunk: string) => this.#read(chunk));
    this.#child.stderr.resume();
    const fail = (error: Error) => {
      if (this.exited) return;
      this.exited = true;
      for (const pending of this.#pending.values()) pending.reject(new AcpRpcError(error.message, -32000, null));
      this.#pending.clear();
      onExit(error);
    };
    this.#child.on("error", (error) => fail(new Error(`${config.name} could not start: ${error.message}`)));
    this.#child.on("exit", (code) => fail(new Error(`${config.name} stopped (exit code ${code ?? "none"}).`)));
    this.ready = this.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: "cosgral-workspace", version: "0.2.0" },
    }).then(() => undefined);
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      if (this.exited) {
        reject(new AcpRpcError("The ACP agent is not running.", -32000, null));
        return;
      }
      this.#pending.set(id, { resolve, reject });
      this.#child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  /** Like request, but gives the JSON-RPC id (to match a cancelled prompt). */
  requestWithId(method: string, params: unknown): { id: number; result: Promise<unknown> } {
    const id = this.#nextId;
    return { id, result: this.request(method, params) };
  }

  notify(method: string, params: unknown): void {
    if (!this.exited) this.#child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  stop(): void {
    this.exited = true;
    this.#child.stdin.end();
    this.#child.kill();
  }

  #read(chunk: string): void {
    this.#buffer += chunk;
    let index = this.#buffer.indexOf("\n");
    while (index >= 0) {
      const line = this.#buffer.slice(0, index).trim();
      this.#buffer = this.#buffer.slice(index + 1);
      index = this.#buffer.indexOf("\n");
      if (!line) continue;
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (isDynamicRecord(message)) this.#handle(message);
    }
  }

  #handle(message: DynamicRecord): void {
    if (message.method === undefined && isNumber(message.id)) {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (isDynamicRecord(message.error)) {
        const error = message.error;
        pending.reject(
          new AcpRpcError(
            isString(error.message) ? error.message : "ACP error",
            isNumber(error.code) ? error.code : -32000,
            error.data,
          ),
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (message.method === "session/update" && isDynamicRecord(message.params)) {
      const { sessionId, update } = message.params;
      if (isString(sessionId) && isDynamicRecord(update)) this.#onUpdate(sessionId, update);
      return;
    }
    if (message.id !== undefined && isString(message.method)) {
      // Requests of the agent: COSGRAL agents have full access, so permission is granted; no file or terminal API.
      if (message.method === "session/request_permission" && isDynamicRecord(message.params)) {
        const options = Array.isArray(message.params.options) ? message.params.options.filter(isDynamicRecord) : [];
        const allow = options.find((option) => isString(option.kind) && option.kind.startsWith("allow")) ?? options[0];
        this.#child.stdin.write(
          `${JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            result: allow
              ? { outcome: { outcome: "selected", optionId: allow.optionId } }
              : { outcome: { outcome: "cancelled" } },
          })}\n`,
        );
        return;
      }
      this.#child.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `COSGRAL does not offer ${message.method}.` } })}\n`,
      );
    }
  }
}

export class AcpAgentClient extends EventEmitter<ClientEvents> implements AgentClient {
  readonly provider: AgentProvider = "acp";
  readonly #agents: () => AcpAgentConfig[];
  readonly #bridgeDirectory: string | undefined;
  readonly #threads = new Map<string, ThreadState>();
  readonly #processes = new Map<string, AcpProcess>();
  readonly #pendingServerRequests = new Map<RequestId, Pending>();
  #toolServer: Server | null = null;
  #toolUrl: string | null = null;
  #bridgePath: string | null = null;
  #running = false;

  constructor(options: AcpClientOptions) {
    super();
    this.#agents = options.agents;
    this.#bridgeDirectory = options.bridgeDirectory;
  }

  get running(): boolean {
    return this.#running;
  }

  start(): void {
    this.#running = true;
  }

  async stop(): Promise<void> {
    this.#running = false;
    for (const agentProcess of this.#processes.values()) agentProcess.stop();
    this.#processes.clear();
    for (const pending of this.#pendingServerRequests.values())
      pending.reject(new AcpRpcError("ACP client stopped.", -32000, null));
    this.#pendingServerRequests.clear();
    const server = this.#toolServer;
    this.#toolServer = null;
    this.#toolUrl = null;
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  async request<T>(method: string, params: unknown, decoder: ResponseDecoder<T>, _timeoutMs?: number): Promise<T> {
    if (!this.#running) throw new Error("The ACP client is not running.");
    switch (method) {
      case "initialize":
      case "thread/compact/start":
        return decoder({});
      case "account/read":
        return decoder({ account: { type: "acp", email: null }, requiresOpenaiAuth: false });
      case "account/rateLimits/read":
        return decoder({ rateLimits: null, rateLimitsByLimitId: null });
      case "model/list":
        return decoder({
          data: this.#agents().map((agent) => ({
            model: `acp:${agent.id}`,
            displayName: agent.name,
            defaultReasoningEffort: "medium",
            supportedReasoningEfforts: [{ reasoningEffort: "medium" }],
          })),
        });
      case "plugin/list":
        return decoder({ marketplaces: [] });
      case "thread/start": {
        const id = randomUUID();
        this.#threads.set(id, this.#newThread(id, params));
        return decoder({ thread: { id, turns: [] } });
      }
      case "thread/resume": {
        const id = text(params, "threadId");
        const current = this.#threads.get(id);
        const next = this.#newThread(id, params);
        if (!current) {
          this.#threads.set(id, next);
        } else if (
          JSON.stringify(current.tools) !== JSON.stringify(next.tools) ||
          current.instructions !== next.instructions
        ) {
          // New tools or instructions need a new ACP session (MCP servers are fixed per session).
          Object.assign(current, {
            tools: next.tools,
            instructions: next.instructions,
            sessionId: null,
            instructionsSent: false,
          });
        }
        return decoder({ thread: { id, turns: [] } });
      }
      case "thread/read": {
        const thread = this.#threads.get(text(params, "threadId"));
        return decoder({ thread: { id: text(params, "threadId"), turns: thread?.turns ?? [] } });
      }
      case "turn/start":
        return decoder(await this.#startTurn(params));
      case "turn/interrupt": {
        const thread = this.#threads.get(text(params, "threadId"));
        if (thread?.sessionId && thread.sessionAgent) {
          this.#processes.get(thread.sessionAgent)?.notify("session/cancel", { sessionId: thread.sessionId });
        }
        return decoder({});
      }
      default:
        throw new Error(`The ACP adapter does not implement ${method}.`);
    }
  }

  notify(): void {
    // ACP agents get their own initialize request per process.
  }

  respond(id: RequestId, result: unknown): void {
    const pending = this.#pendingServerRequests.get(id);
    if (!pending) return;
    this.#pendingServerRequests.delete(id);
    pending.resolve(result);
  }

  respondError(id: RequestId, error: RpcError): void {
    const pending = this.#pendingServerRequests.get(id);
    if (!pending) return;
    this.#pendingServerRequests.delete(id);
    pending.reject(new AcpRpcError(error.message, error.code, null));
  }

  #newThread(id: string, params: unknown): ThreadState {
    return {
      id,
      model: optionalText(params, "model") ?? "",
      cwd: optionalText(params, "cwd") ?? process.cwd(),
      instructions: optionalText(params, "developerInstructions") ?? "",
      tools: bridgeTools(isDynamicRecord(params) ? params.dynamicTools : undefined),
      sessionId: null,
      sessionAgent: null,
      instructionsSent: false,
      activeTurn: null,
      turns: [],
      token: randomUUID(),
    };
  }

  async #startTurn(params: unknown): Promise<{ turn: { id: string; status: string } }> {
    const thread = this.#threads.get(text(params, "threadId"));
    if (!thread) throw new Error("Unknown ACP thread.");
    if (thread.activeTurn) throw new Error("The ACP thread already has an active turn.");
    const model = optionalText(params, "model") ?? thread.model;
    if (!isAcpModel(model)) throw new Error(`${model} is not an ACP agent model.`);
    const agentId = model.slice("acp:".length);
    const config = this.#agents().find((agent) => agent.id === agentId);
    if (!config) throw new Error(`There is no ACP agent ${agentId}; add it in Settings.`);
    const agentProcess = await this.#process(config);
    if (!thread.sessionId || thread.sessionAgent !== agentId || thread.model !== model) {
      const session = await agentProcess.request("session/new", {
        cwd: thread.cwd,
        mcpServers: [await this.#bridgeServer(thread)],
      });
      if (!isDynamicRecord(session) || !isString(session.sessionId))
        throw new Error(`${config.name} did not open a session.`);
      Object.assign(thread, { sessionId: session.sessionId, sessionAgent: agentId, model, instructionsSent: false });
    }
    const userText = readInputText(params);
    const prompt =
      thread.instructionsSent || !thread.instructions
        ? userText
        : `<cosgral_instructions>\n${thread.instructions}\n</cosgral_instructions>\n\n${userText}`;
    thread.instructionsSent = true;
    const turnId = randomUUID();
    thread.activeTurn = { id: turnId, itemId: `${turnId}:assistant`, text: "", promptId: null };
    this.emit("notification", {
      method: "turn/started",
      params: { threadId: thread.id, turn: { id: turnId, status: "inProgress" } },
    });
    const sent = agentProcess.requestWithId("session/prompt", {
      sessionId: thread.sessionId,
      prompt: [{ type: "text", text: prompt }],
    });
    thread.activeTurn.promptId = sent.id;
    void sent.result.then(
      (result) => {
        const stop = isDynamicRecord(result) && isString(result.stopReason) ? result.stopReason : "end_turn";
        this.#complete(
          thread,
          turnId,
          stop === "cancelled" ? "interrupted" : stop === "refusal" ? "failed" : "completed",
          null,
        );
      },
      (error: unknown) => this.#complete(thread, turnId, "failed", error),
    );
    return { turn: { id: turnId, status: "inProgress" } };
  }

  #complete(thread: ThreadState, turnId: string, status: string, error: unknown): void {
    const turn = thread.activeTurn;
    if (!turn || turn.id !== turnId) return;
    thread.activeTurn = null;
    this.emit("notification", {
      method: "item/completed",
      params: { threadId: thread.id, turnId, item: { id: turn.itemId, type: "agentMessage", text: turn.text } },
    });
    if (error) {
      const classified = classifyAcpError(error);
      this.emit("notification", {
        method: "error",
        params: {
          threadId: thread.id,
          turnId,
          message: classified.message,
          errorKind: classified.kind,
          resetsAt: classified.resetsAt,
        },
      });
    }
    thread.turns.push({
      id: turnId,
      status,
      items: turn.text ? [{ id: turn.itemId, type: "agentMessage", text: turn.text }] : [],
    });
    this.emit("notification", {
      method: "turn/completed",
      params: { threadId: thread.id, turn: { id: turnId, status } },
    });
  }

  #onUpdate(sessionId: string, update: DynamicRecord): void {
    const thread = [...this.#threads.values()].find((candidate) => candidate.sessionId === sessionId);
    const turn = thread?.activeTurn;
    if (!thread || !turn || update.sessionUpdate !== "agent_message_chunk" || !isDynamicRecord(update.content)) return;
    const delta = isString(update.content.text) ? update.content.text : "";
    if (!delta) return;
    turn.text += delta;
    this.emit("notification", {
      method: "item/agentMessage/delta",
      params: { threadId: thread.id, turnId: turn.id, itemId: turn.itemId, delta },
    });
  }

  async #process(config: AcpAgentConfig): Promise<AcpProcess> {
    const existing = this.#processes.get(config.id);
    if (existing && !existing.exited) {
      await existing.ready;
      return existing;
    }
    const created = new AcpProcess(
      config,
      (sessionId, update) => this.#onUpdate(sessionId, update),
      (error) => {
        if (this.#processes.get(config.id) !== created) return;
        this.#processes.delete(config.id);
        for (const thread of this.#threads.values()) {
          if (thread.sessionAgent !== config.id) continue;
          thread.sessionId = null;
          if (thread.activeTurn)
            this.#complete(thread, thread.activeTurn.id, "failed", new AcpRpcError(error.message, 503, null));
        }
        if (this.#running) this.emit("diagnostic", `ACP agent ${config.name}: ${error.message}`);
      },
    );
    this.#processes.set(config.id, created);
    await created.ready;
    return created;
  }

  /** The bridge as an ACP stdio MCP server entry for this thread. */
  async #bridgeServer(thread: ThreadState) {
    const url = await this.#toolEndpoint();
    this.#bridgePath ??= await bridgeFile(this.#bridgeDirectory);
    const config = Buffer.from(JSON.stringify({ url, token: thread.token, tools: thread.tools })).toString("base64");
    return {
      name: "cosgral",
      command: process.execPath,
      args: [this.#bridgePath],
      env: [
        { name: "ELECTRON_RUN_AS_NODE", value: "1" },
        { name: BRIDGE_ENV, value: config },
      ],
    };
  }

  /** Loopback endpoint the bridges call; each call is answered through item/tool/call. */
  async #toolEndpoint(): Promise<string> {
    if (this.#toolUrl) return this.#toolUrl;
    const server = createServer((request, response) => void this.#serveTool(request, response));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = isDynamicRecord(address) && isNumber(address.port) ? address.port : 0;
    this.#toolServer = server;
    this.#toolUrl = `http://127.0.0.1:${port}/acp-tools`;
    return this.#toolUrl;
  }

  async #serveTool(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const answer = (status: number, body: unknown) => {
      const payload = JSON.stringify(body);
      response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
      response.end(payload);
    };
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const thread = isDynamicRecord(body)
        ? [...this.#threads.values()].find((candidate) => candidate.token === body.token)
        : undefined;
      if (!thread || !isDynamicRecord(body) || !isString(body.namespace) || !isString(body.tool)) {
        answer(403, { success: false, contentItems: [{ type: "inputText", text: "Unknown session." }] });
        return;
      }
      const result = await this.#callServerRequest("item/tool/call", {
        threadId: thread.id,
        turnId: thread.activeTurn?.id ?? randomUUID(),
        callId: randomUUID(),
        namespace: body.namespace,
        tool: body.tool,
        arguments: body.arguments ?? {},
      });
      answer(200, result);
    } catch (error) {
      answer(200, {
        success: false,
        contentItems: [{ type: "inputText", text: error instanceof Error ? error.message : String(error) }],
      });
    }
  }

  #callServerRequest(method: string, params: unknown): Promise<unknown> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      this.#pendingServerRequests.set(id, { resolve, reject });
      this.emit("request", { id, method, params });
    });
  }
}

/** Usage limit and unavailability may move a turn to a fallback model; nothing else does. */
export function classifyAcpError(error: unknown): { message: string; kind: AcpErrorKind; resetsAt: number | null } {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof AcpRpcError ? error.code : null;
  const data = error instanceof AcpRpcError && isDynamicRecord(error.data) ? error.data : null;
  const resetsAt = data && isNumber(data.resetsAt) ? data.resetsAt : null;
  if (code === 429 || data?.kind === "usage_limit" || /usage limit|rate limit|quota|too many requests/i.test(message)) {
    return { message, kind: "usage-limit", resetsAt };
  }
  if (code === 503 || code === 502 || /unavailable|overloaded|not running|could not start|stopped/i.test(message)) {
    return { message, kind: "unavailable", resetsAt };
  }
  return { message, kind: null, resetsAt: null };
}

function text(value: unknown, key: string): string {
  const result = optionalText(value, key);
  if (!result) throw new Error(`${key} is required.`);
  return result;
}

function optionalText(value: unknown, key: string): string | null {
  return isDynamicRecord(value) && isString(value[key]) ? value[key] : null;
}

function readInputText(params: unknown): string {
  const input = isDynamicRecord(params) && Array.isArray(params.input) ? params.input : [];
  const parts = input.flatMap((item) => {
    if (!isDynamicRecord(item)) return [];
    if (item.type === "text" && isString(item.text)) return [item.text];
    if ((item.type === "localImage" || item.type === "mention") && isString(item.path))
      return [`[attached file: ${item.path}]`];
    return [];
  });
  return parts.join("\n");
}
