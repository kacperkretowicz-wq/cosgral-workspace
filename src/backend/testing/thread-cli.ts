// COSGRAL W6: a fake Codex for tests of threads, context and the plan. It answers at once, or holds a turn open until the
// test finishes it, can report the tokens used per CLI thread (like Codex does) and handles a compaction request.

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import type { AgentClient, AgentProvider } from "../agent-client";
import type { AppServerNotification, RequestId, ResponseDecoder, RpcError } from "../protocol";

export class ThreadCli extends EventEmitter implements AgentClient {
  readonly provider: AgentProvider = "codex";
  readonly requests: Array<{ method: string; params: unknown }> = [];
  readonly pending: Array<{ threadId: string; turnId: string; text: string }> = [];
  /** Tokens the CLI reports as used when a turn of this CLI thread ends (window: `windowTokens`). */
  readonly usage = new Map<string, number>();
  /** The parts of the running total a thread reports (input, cached input, output, reasoning), when a test wants them. */
  readonly usageParts = new Map<string, { input: number; cached: number; output: number; reasoning: number }>();
  windowTokens = 100_000;
  /** Say nothing about tokens at all. */
  reportUsage = true;
  hold = false;
  /** The compaction request fails. */
  failCompaction = false;
  running = false;
  #threads = 0;
  #toolCalls = 0;

  start(): void {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  calls(method: string): unknown[] {
    return this.requests.filter((request) => request.method === method).map((request) => request.params);
  }

  /** The text of every turn started, in order. */
  turnTexts(): string[] {
    return this.calls("turn/start").map((params) => inputText(params));
  }

  async request<T>(method: string, params: unknown, decoder: ResponseDecoder<T>): Promise<T> {
    this.requests.push({ method, params: structuredClone(params) });
    let result: unknown;
    if (method === "initialize") result = {};
    if (method === "account/read")
      result = { account: { type: "chatgpt", email: "codex@example.com" }, requiresOpenaiAuth: false };
    if (method === "account/rateLimits/read") result = { rateLimits: null, rateLimitsByLimitId: null };
    if (method === "model/list") result = { data: ["gpt-5.6-luna", "gpt-5.6-terra"].map((model) => ({ model })) };
    if (method === "plugin/list") result = { marketplaces: [] };
    if (method === "thread/start") {
      this.#threads += 1;
      result = { thread: { id: `cli-thread-${this.#threads}` } };
    }
    if (method === "thread/resume" || method === "thread/read")
      result = { thread: { id: stringParam(params, "threadId"), turns: [] } };
    if (method === "turn/interrupt") result = {};
    if (method === "thread/compact/start") {
      if (this.failCompaction) throw new Error("Compaction unavailable");
      const threadId = stringParam(params, "threadId");
      const turnId = randomUUID();
      setTimeout(() => {
        if (!this.running) return;
        const item = { type: "contextCompaction", id: `${turnId}:compaction` };
        const send = (name: string, body: unknown) => this.emit("notification", notification(name, body));
        send("turn/started", { threadId, turn: { id: turnId } });
        send("item/started", { threadId, turnId, item });
        send("item/completed", { threadId, turnId, item });
        send("turn/completed", { threadId, turn: { id: turnId, status: "completed" } });
      }, 0);
      result = {};
    }
    if (method === "turn/start") {
      const threadId = stringParam(params, "threadId");
      const turnId = randomUUID();
      const text = inputText(params);
      setTimeout(() => {
        if (!this.running) return;
        this.emit("notification", notification("turn/started", { threadId, turn: { id: turnId } }));
        if (this.hold) this.pending.push({ threadId, turnId, text });
        else this.#answer({ threadId, turnId, text });
      }, 0);
      result = { turn: { id: turnId, status: "inProgress", items: [] } };
    }
    if (result === undefined) throw new Error(`Fake CLI does not implement ${method}.`);
    return decoder(result);
  }

  /** Finishes the oldest held turn, or the oldest held turn of one CLI thread. */
  finish(threadId?: string): void {
    const index = threadId === undefined ? 0 : this.pending.findIndex((turn) => turn.threadId === threadId);
    const next = index < 0 ? undefined : this.pending.splice(index, 1)[0];
    if (!next) throw new Error("No held turn.");
    this.#answer(next);
  }

  /** The CLI threads started so far, in order (`cli-thread-1`, ...). */
  startedThreads(): string[] {
    return this.calls("thread/start").map((_params, index) => `cli-thread-${index + 1}`);
  }

  #answer(turn: { threadId: string; turnId: string; text: string }): void {
    const { threadId, turnId } = turn;
    const itemId = `${turnId}:assistant`;
    const answer = `ANSWER_TO[${firstLine(turn.text)}]`;
    const send = (method: string, params: unknown) => this.emit("notification", notification(method, params));
    send("item/started", { threadId, turnId, item: { id: itemId, type: "agentMessage", text: "" } });
    send("item/agentMessage/delta", { threadId, turnId, itemId, delta: answer });
    send("item/completed", { threadId, turnId, item: { id: itemId, type: "agentMessage", text: answer } });
    const used = this.usage.get(threadId);
    if (this.reportUsage && used !== undefined) {
      send("thread/tokenUsage/updated", {
        threadId,
        turnId,
        tokenUsage: {
          total: {
            totalTokens: used,
            ...(this.usageParts.has(threadId)
              ? {
                  inputTokens: this.usageParts.get(threadId)?.input,
                  cachedInputTokens: this.usageParts.get(threadId)?.cached,
                  outputTokens: this.usageParts.get(threadId)?.output,
                  reasoningOutputTokens: this.usageParts.get(threadId)?.reasoning,
                }
              : {}),
          },
          last: { totalTokens: used },
          modelContextWindow: this.windowTokens,
        },
      });
    }
    send("turn/completed", { threadId, turn: { id: turnId, status: "completed" } });
  }

  /** What the program answered to the CLI's own requests (tool calls, approvals), in order. */
  readonly responses: Array<{ id: RequestId; result: unknown }> = [];

  /** Asks the program for a tool of its own, like the CLI does when the model calls one. */
  callTool(turn: { threadId: string; turnId: string }, namespace: string, tool: string, args: unknown): void {
    this.#toolCalls += 1;
    this.emit("request", {
      method: "item/tool/call",
      id: `tool-${this.#toolCalls}-${tool}`,
      params: { ...turn, callId: `call-${tool}`, namespace, tool, arguments: args },
    });
  }

  notify(): void {}
  respond(id: RequestId, result: unknown): void {
    this.responses.push({ id, result });
  }
  respondError(_id: RequestId, _error: RpcError): void {}
}

export function firstLine(value: string): string {
  return value.split("\n")[0]?.trim() ?? "";
}

export function inputText(params: unknown): string {
  if (!isDynamicRecord(params) || !Array.isArray(params.input)) return "";
  const first = params.input[0];
  return isDynamicRecord(first) && isString(first.text) ? first.text : "";
}

export function notification(method: string, params: unknown): AppServerNotification {
  return { method, params };
}

export function stringParam(value: unknown, key: string): string {
  if (!isDynamicRecord(value)) throw new Error(`${key} is missing.`);
  const result = value[key];
  if (!isString(result)) throw new Error(`${key} is missing.`);
  return result;
}
