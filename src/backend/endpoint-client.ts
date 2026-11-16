// COSGRAL W5-K2: an agent that talks through a model endpoint (OpenAI-compatible server, Ollama, LM Studio).
// Speaks the app-server protocol to AgentService, like the Codex, Claude and ACP clients, and Chat Completions to the
// endpoint: POST <baseUrl>/chat/completions with stream:true. The model is "endpoint:<id>/<model>".
//
// This is a conversation only ("chat only"): the endpoint gets the instructions and the messages, no program tools
// (servers differ in tool support, spec R4). The agent is told so, so it does not promise what it cannot do.
//
// - The key goes only to the address of that endpoint; redirects are errors, so it never travels to another host.
// - Errors of a turn carry `errorKind` like the ACP client: 429 is a "usage-limit" (Retry-After becomes resetsAt), no
//   answer or 5xx is "unavailable" (a fallback model may take over), anything else (a key refused, a wrong model, a
//   removed endpoint) is a plain error that never moves the turn to another model.
// - A thread keeps its messages in memory. After a restart of the program a thread starts empty (the usual hand-off of
//   the conversation applies when the agent moves from one provider to another).

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { parseEndpointModel } from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import type { AgentClient, AgentProvider } from "./agent-client";
import { redactApiKeys } from "./api-key-env";
import type { ResolvedEndpoint } from "./endpoint-store";
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

export interface EndpointClientOptions {
  /** The address and key of an endpoint, read at every turn so edits apply at once; null = removed. */
  resolve: (endpointId: string) => ResolvedEndpoint | null;
  /** The agent models of every endpoint with a model list (for `model/list`). */
  models: () => Array<{ id: string; name: string }>;
  fetch?: typeof fetch;
  /** How long the server may stay silent before the turn fails (default 2 minutes: a local model may be loading). */
  idleMs?: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ThreadState {
  id: string;
  model: string;
  instructions: string;
  messages: ChatMessage[];
  activeTurn: ActiveTurn | null;
  turns: NonNullable<ThreadResponse["thread"]["turns"]>;
}

interface ActiveTurn {
  id: string;
  itemId: string;
  text: string;
  controller: AbortController;
  interrupted: boolean;
  timedOut: boolean;
}

type FailureKind = "usage-limit" | "unavailable" | null;

class TurnFailure extends Error {
  constructor(
    message: string,
    readonly kind: FailureKind,
    readonly resetsAt: number | null = null,
  ) {
    super(message);
  }
}

const IDLE_MS = 120_000;
const MAX_HISTORY_MESSAGES = 40;
const MAX_HISTORY_CHARS = 200_000;
const MAX_ERROR_BODY = 4_000;
const CHAT_ONLY_NOTE =
  "You are connected through a plain chat endpoint. You cannot use tools, run commands, browse or change files here. Answer in text only, and say so if a request needs a tool.";

export class EndpointAgentClient extends EventEmitter<ClientEvents> implements AgentClient {
  readonly provider: AgentProvider = "endpoint";
  readonly #options: EndpointClientOptions;
  readonly #fetch: typeof fetch;
  readonly #threads = new Map<string, ThreadState>();
  #running = false;

  constructor(options: EndpointClientOptions) {
    super();
    this.#options = options;
    this.#fetch = options.fetch ?? ((...args) => fetch(...args));
  }

  get running(): boolean {
    return this.#running;
  }

  start(): void {
    this.#running = true;
  }

  async stop(): Promise<void> {
    this.#running = false;
    for (const thread of this.#threads.values()) thread.activeTurn?.controller.abort();
  }

  async request<T>(method: string, params: unknown, decoder: ResponseDecoder<T>, _timeoutMs?: number): Promise<T> {
    if (!this.#running) throw new Error("The endpoint client is not running.");
    switch (method) {
      case "initialize":
      case "thread/compact/start":
        return decoder({});
      case "account/read":
        return decoder({ account: { type: "endpoint", email: null }, requiresOpenaiAuth: false });
      case "account/rateLimits/read":
        return decoder({ rateLimits: null, rateLimitsByLimitId: null });
      case "model/list":
        return decoder({
          data: this.#options.models().map((model) => ({
            model: model.id,
            displayName: model.name,
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
        const next = this.#newThread(id, params);
        const current = this.#threads.get(id);
        if (!current) this.#threads.set(id, next);
        else current.instructions = next.instructions;
        return decoder({ thread: { id, turns: [] } });
      }
      case "thread/read": {
        const thread = this.#threads.get(text(params, "threadId"));
        return decoder({ thread: { id: text(params, "threadId"), turns: thread?.turns ?? [] } });
      }
      case "turn/start":
        return decoder(this.#startTurn(params));
      case "turn/interrupt": {
        const turn = this.#threads.get(text(params, "threadId"))?.activeTurn;
        if (turn) {
          turn.interrupted = true;
          turn.controller.abort();
        }
        return decoder({});
      }
      default:
        throw new Error(`The endpoint adapter does not implement ${method}.`);
    }
  }

  notify(): void {}

  respond(_id: RequestId, _result: unknown): void {}

  respondError(_id: RequestId, _error: RpcError): void {}

  #newThread(id: string, params: unknown): ThreadState {
    return {
      id,
      model: optionalText(params, "model") ?? "",
      instructions: optionalText(params, "developerInstructions") ?? "",
      messages: [],
      activeTurn: null,
      turns: [],
    };
  }

  #startTurn(params: unknown): { turn: { id: string; status: string } } {
    const thread = this.#threads.get(text(params, "threadId"));
    if (!thread) throw new Error("Unknown endpoint thread.");
    if (thread.activeTurn) throw new Error("The endpoint thread already has an active turn.");
    const model = optionalText(params, "model") ?? thread.model;
    const target = parseEndpointModel(model);
    if (!target) throw new Error(`${model} is not an endpoint model.`);
    const endpoint = this.#options.resolve(target.endpointId);
    if (!endpoint)
      throw new Error("The endpoint of this model was removed. Pick another model for this agent in its settings.");
    thread.model = model;
    const turnId = randomUUID();
    const turn: ActiveTurn = {
      id: turnId,
      itemId: `${turnId}:assistant`,
      text: "",
      controller: new AbortController(),
      interrupted: false,
      timedOut: false,
    };
    thread.activeTurn = turn;
    const userText = readInputText(params);
    this.emit("notification", {
      method: "turn/started",
      params: { threadId: thread.id, turn: { id: turnId, status: "inProgress" } },
    });
    void this.#run(thread, turn, endpoint, target.model, userText);
    return { turn: { id: turnId, status: "inProgress" } };
  }

  async #run(
    thread: ThreadState,
    turn: ActiveTurn,
    endpoint: ResolvedEndpoint,
    model: string,
    userText: string,
  ): Promise<void> {
    try {
      const reply = await this.#chat(thread, turn, endpoint, model, userText);
      thread.messages.push({ role: "user", content: userText }, { role: "assistant", content: reply });
      trimHistory(thread.messages);
      this.#complete(thread, turn, "completed", null);
    } catch (error) {
      if (turn.interrupted) this.#complete(thread, turn, "interrupted", null);
      else this.#complete(thread, turn, "failed", turn.timedOut ? timeoutFailure(endpoint) : error);
    }
  }

  async #chat(
    thread: ThreadState,
    turn: ActiveTurn,
    endpoint: ResolvedEndpoint,
    model: string,
    userText: string,
  ): Promise<string> {
    const idleMs = this.#options.idleMs ?? IDLE_MS;
    let timer: NodeJS.Timeout | null = null;
    const touch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        turn.timedOut = true;
        turn.controller.abort();
      }, idleMs);
    };
    const headers: Record<string, string> = { "content-type": "application/json", accept: "text/event-stream" };
    if (endpoint.key) headers.authorization = `Bearer ${endpoint.key}`;
    const system = [thread.instructions, CHAT_ONLY_NOTE].filter(Boolean).join("\n\n");
    touch();
    try {
      let response: Response;
      try {
        response = await this.#fetch(`${endpoint.baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            stream: true,
            messages: [{ role: "system", content: system }, ...thread.messages, { role: "user", content: userText }],
          }),
          // A redirect could carry the key and the conversation to another host: it is an error, not a hop.
          redirect: "error",
          signal: turn.controller.signal,
        });
      } catch (error) {
        if (turn.controller.signal.aborted) throw error;
        throw new TurnFailure(`Could not reach ${endpoint.label}. Is it running?`, "unavailable");
      }
      if (!response.ok) throw await failureOf(response, endpoint);
      return await this.#readAnswer(response, thread, turn, touch);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async #readAnswer(response: Response, thread: ThreadState, turn: ActiveTurn, touch: () => void): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) throw new TurnFailure("The server sent an empty answer.", "unavailable");
    const decoder = new TextDecoder();
    const contentType = response.headers.get("content-type") ?? "";
    let buffer = "";
    let started = false;
    const begin = () => {
      if (started) return;
      started = true;
      this.emit("notification", {
        method: "item/started",
        params: { threadId: thread.id, turnId: turn.id, item: { id: turn.itemId, type: "agentMessage", text: "" } },
      });
    };
    const add = (delta: string) => {
      if (!delta) return;
      begin();
      turn.text += delta;
      this.emit("notification", {
        method: "item/agentMessage/delta",
        params: { threadId: thread.id, turnId: turn.id, itemId: turn.itemId, delta },
      });
    };
    // A server that ignores stream:true answers with one JSON document.
    const whole = !contentType.includes("event-stream");
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      touch();
      buffer += decoder.decode(value, { stream: true });
      if (whole) {
        if (buffer.length > 4 * 1024 * 1024) throw new TurnFailure("The answer of the server is too large.", null);
        continue;
      }
      let cut = buffer.search(/\r?\n\r?\n/);
      while (cut >= 0) {
        const event = buffer.slice(0, cut);
        buffer = buffer.slice(cut).replace(/^\r?\n\r?\n/, "");
        for (const delta of eventDeltas(event)) add(delta);
        cut = buffer.search(/\r?\n\r?\n/);
      }
    }
    buffer += decoder.decode();
    if (whole) add(wholeAnswer(buffer));
    else for (const delta of eventDeltas(buffer)) add(delta);
    if (!turn.text.trim()) throw new TurnFailure("The model sent no answer.", null);
    return turn.text;
  }

  #complete(thread: ThreadState, turn: ActiveTurn, status: string, error: unknown): void {
    if (thread.activeTurn !== turn) return;
    thread.activeTurn = null;
    // No empty answer when the model said nothing (a failed attempt may move to a fallback model).
    if (turn.text)
      this.emit("notification", {
        method: "item/completed",
        params: {
          threadId: thread.id,
          turnId: turn.id,
          item: { id: turn.itemId, type: "agentMessage", text: turn.text },
        },
      });
    if (error) {
      const failure = error instanceof TurnFailure ? error : new TurnFailure(plainError(error), null);
      this.emit("notification", {
        method: "error",
        params: {
          threadId: thread.id,
          turnId: turn.id,
          message: redactApiKeys(failure.message),
          errorKind: failure.kind,
          resetsAt: failure.resetsAt,
        },
      });
    }
    thread.turns.push({
      id: turn.id,
      status,
      items: turn.text ? [{ id: turn.itemId, type: "agentMessage", text: turn.text }] : [],
    });
    this.emit("notification", {
      method: "turn/completed",
      params: { threadId: thread.id, turn: { id: turn.id, status } },
    });
  }
}

function timeoutFailure(endpoint: ResolvedEndpoint): TurnFailure {
  return new TurnFailure(
    `${endpoint.label} stopped answering. Is the model still loading or the server down?`,
    "unavailable",
  );
}

function plainError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** What a failed HTTP answer means for the turn. The key is never in the text. */
async function failureOf(response: Response, endpoint: ResolvedEndpoint): Promise<TurnFailure> {
  const detail = await errorDetail(response);
  const suffix = detail ? ` (${detail})` : "";
  if (response.status === 401 || response.status === 403)
    return new TurnFailure(`${endpoint.label} did not accept the key. Check the key of this endpoint.${suffix}`, null);
  if (response.status === 429) {
    const wait = Number(response.headers.get("retry-after"));
    const resetsAt = Number.isFinite(wait) && wait > 0 ? Math.floor(Date.now() / 1000) + Math.ceil(wait) : null;
    return new TurnFailure(`${endpoint.label} is at its usage limit.${suffix}`, "usage-limit", resetsAt);
  }
  if (response.status === 404)
    return new TurnFailure(
      `${endpoint.label} does not know this model or address. Fetch the model list again.${suffix}`,
      null,
    );
  if (response.status >= 500)
    return new TurnFailure(`${endpoint.label} is not available (${response.status}).${suffix}`, "unavailable");
  return new TurnFailure(`${endpoint.label} refused the request (${response.status}).${suffix}`, null);
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.text()).slice(0, MAX_ERROR_BODY);
    const parsed = JSON.parse(body);
    const error = isDynamicRecord(parsed) ? parsed.error : null;
    const message = isDynamicRecord(error) ? error.message : isString(error) ? error : null;
    return isString(message) ? message.replace(/\s+/g, " ").slice(0, 200) : "";
  } catch {
    return "";
  }
}

/** The text pieces of one server-sent event ("data: {...}" lines). */
function eventDeltas(event: string): string[] {
  const deltas: string[] = [];
  for (const line of event.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    let value: unknown;
    try {
      value = JSON.parse(data);
    } catch {
      continue;
    }
    if (!isDynamicRecord(value)) continue;
    if (value.error !== undefined) {
      const error = value.error;
      const message =
        isDynamicRecord(error) && isString(error.message) ? error.message : "The server reported an error.";
      throw new TurnFailure(message.slice(0, 300), null);
    }
    const choice = Array.isArray(value.choices) ? value.choices[0] : null;
    const delta = isDynamicRecord(choice) && isDynamicRecord(choice.delta) ? choice.delta.content : null;
    if (isString(delta)) deltas.push(delta);
  }
  return deltas;
}

/** A non-streamed answer: choices[0].message.content. */
function wholeAnswer(body: string): string {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new TurnFailure("The server did not send a readable answer.", null);
  }
  if (isDynamicRecord(value) && value.error !== undefined) {
    const error = value.error;
    const message = isDynamicRecord(error) && isString(error.message) ? error.message : "The server reported an error.";
    throw new TurnFailure(message.slice(0, 300), null);
  }
  const choice = isDynamicRecord(value) && Array.isArray(value.choices) ? value.choices[0] : null;
  const message = isDynamicRecord(choice) ? choice.message : null;
  return isDynamicRecord(message) && isString(message.content) ? message.content : "";
}

function trimHistory(messages: ChatMessage[]): void {
  while (messages.length > MAX_HISTORY_MESSAGES) messages.shift();
  let size = messages.reduce((sum, message) => sum + message.content.length, 0);
  while (size > MAX_HISTORY_CHARS && messages.length > 2) {
    size -= messages.shift()?.content.length ?? 0;
  }
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
  const input: unknown[] = isDynamicRecord(params) && Array.isArray(params.input) ? params.input : [];
  const parts = input.flatMap((item: unknown) => {
    if (!isDynamicRecord(item)) return [];
    if (item.type === "text" && isString(item.text)) return [item.text];
    if ((item.type === "localImage" || item.type === "mention") && isString(item.path))
      return [`[attached file, not readable through this endpoint: ${item.path}]`];
    return [];
  });
  return parts.join("\n");
}
