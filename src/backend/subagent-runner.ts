// COSGRAL W6-BE4: subagents (spec-w6.md 1D, W23-W28; Q10, Q11). An agent starts a subagent with `cosgral_subagents.spawn`.
// It works in an ephemeral CLI thread of its own (never in the parent's conversation) with the access of its parent and
// never more, and its answer comes back as the result of the parent's tool call. Depth is 1 and at most
// `SUBAGENT_LIMITS.parallel` work at the same time in a thread. Stopping the subagent, ending or stopping the parent's
// turn, or the provider exiting ends it at once, and the parent's waiting call is answered instead of hanging.
// Its questions and approvals are ordinary cards that belong to the PARENT's thread; `waitingRequestIds` links them.

import {
  type AgentEvent,
  type BotSummary,
  parseAgentStopArgs,
  parseSpawnArgs,
  parseWaitArgs,
  SUBAGENT_LIMITS,
  type Subagent,
  type SubagentState,
  subagentIsActive,
  subagentPreviewText,
  subagentResultText,
  subagentStartProblem,
  subagentTitle,
  subagentToolResult,
} from "@openbot/contracts/ipc";
import type { CardContext } from "./action-cards";
import type { AgentClient } from "./agent-client";
import {
  type AppServerNotification,
  type AppServerRequest,
  type DynamicToolCallParams,
  type DynamicToolResult,
  decodeRecordResponse,
  decodeThreadResponse,
  decodeTurnResponse,
  getRecord,
  getString,
} from "./protocol";
import type { SubagentStore } from "./subagent-store";
import { SUBAGENT_PREFACE } from "./subagent-tools";

/** What a subagent inherits from its parent's thread: the same, never more. */
export interface InheritedAccess {
  approvalPolicy: string;
  sandbox: string;
  runtimeWorkspaceRoots: string[];
}

export interface SubagentRunnerOptions {
  emit: (event: AgentEvent) => void;
  store: SubagentStore;
  client: (botId: string) => Promise<AgentClient>;
  bot: (botId: string) => BotSummary;
  /** The tools of the parent, WITHOUT the subagent tools: a subagent gets nothing more (and cannot start subagents). */
  tools: (botId: string) => unknown[];
  /** The developer instructions of the parent, WITHOUT the line about starting subagents. */
  instructions: (bot: BotSummary) => string;
  /** The access of the parent's thread. */
  access: (bot: BotSummary) => InheritedAccess;
  /** The shared handling of a CLI request (approvals, tool calls) of the program. */
  commonRequest: (client: AgentClient, request: AppServerRequest) => Promise<void>;
  /** Tells the program which agent a CLI thread of a subagent belongs to. */
  register: (providerThreadId: string, botId: string) => void;
  /** The subagent's turn is over: open cards of its thread close. */
  clear: (providerThreadId: string, turnId: string | null) => void;
  /** The `requestId` of every open card that waits for the person in this CLI thread. */
  waitingIds: (providerThreadId: string) => string[];
  now?: () => string;
  newId?: () => string;
  /** At most one preview update per this many milliseconds. */
  previewIntervalMs?: number;
}

interface Session {
  subagent: Subagent;
  /** The CLI thread and turn of the parent that started it. */
  parentProviderThreadId: string;
  client: AgentClient | null;
  providerThreadId: string | null;
  childTurnId: string | null;
  items: Map<string, string>;
  lastPreviewAt: number;
  ended: boolean;
  completion: Promise<Subagent>;
  settle: (subagent: Subagent) => void;
}

export class SubagentRunner {
  readonly #options: SubagentRunnerOptions;
  readonly #sessions = new Map<string, Session>();
  readonly #byThread = new Map<string, Session>();
  /** Every CLI thread a subagent ran in, so that its late messages never reach the parent's conversation. */
  readonly #known = new Set<string>();
  readonly #parents = new Map<string, string>();
  #counter = 0;

  constructor(options: SubagentRunnerOptions) {
    this.#options = options;
  }

  /** Whether this CLI thread is one of a subagent. */
  owns(providerThreadId: string): boolean {
    return this.#known.has(providerThreadId);
  }

  /** The thread of the parent that a subagent's cards belong to, or null for a thread that is not a subagent's. */
  publicThread(providerThreadId: string): string | null {
    return this.#parents.get(providerThreadId) ?? null;
  }

  list(input: { botId: string; threadId: string }): Subagent[] {
    return this.#options.store.list(input.botId, input.threadId);
  }

  /** An agent's `cosgral_subagents` call. `spawn` and `wait` wait until the subagents have ended. */
  async handleTool(params: DynamicToolCallParams, context: CardContext): Promise<DynamicToolResult> {
    try {
      switch (params.tool) {
        case "spawn":
          return await this.#spawn(context, params.arguments);
        case "wait":
          return await this.#wait(context, params.arguments);
        case "list":
          return textResult({
            subagents: this.list(context).map((subagent) => subagentToolResult(subagent)),
          });
        case "stop": {
          const { subagentId } = parseAgentStopArgs(params.arguments);
          this.#ownRecord(context, subagentId);
          return textResult(subagentToolResult(await this.stop(subagentId)));
        }
        default:
          throw new Error(`Unknown subagent tool: ${params.tool}`);
      }
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  /** The person's Stop. Ends the subagent at once. Stopping one that ended changes nothing. */
  async stop(subagentId: string): Promise<Subagent> {
    const session = this.#sessions.get(subagentId);
    if (!session) {
      const stored = this.#options.store.get(subagentId);
      if (!stored) throw new Error("Unknown subagent.");
      return stored;
    }
    return this.#finish(session, "stopped", "Stopped by the user.");
  }

  /** The turn of the parent ended or was stopped: its subagents stop (nothing runs without its parent). */
  stopForTurn(parentProviderThreadId: string, turnId: string): void {
    for (const session of [...this.#sessions.values()]) {
      if (session.parentProviderThreadId === parentProviderThreadId && session.subagent.parentTurnId === turnId) {
        this.#finish(session, "stopped", "The turn of the agent ended.");
      }
    }
  }

  /** An agent that is deleted takes its running subagents with it. */
  stopBot(botId: string, reason: string): void {
    for (const session of [...this.#sessions.values()]) {
      if (session.subagent.botId === botId) this.#finish(session, "stopped", reason);
    }
  }

  stopAll(reason: string): void {
    for (const session of [...this.#sessions.values()]) this.#finish(session, "stopped", reason);
  }

  /** A deleted thread takes its subagents with it (the working ones stop first). */
  forgetThread(botId: string, threadId: string): void {
    for (const session of [...this.#sessions.values()]) {
      if (session.subagent.botId === botId && session.subagent.threadId === threadId) {
        this.#finish(session, "stopped", "The thread was deleted.");
      }
    }
    this.#options.store.deleteThread(botId, threadId);
  }

  /** After a restart nothing runs any more: what was working is closed. */
  recover(): void {
    for (const subagent of this.#options.store.listActive()) {
      if (this.#sessions.has(subagent.id)) continue;
      Object.assign(subagent, {
        state: "stopped",
        error: "The program was closed.",
        finishedAt: this.#now(),
        preview: null,
        waitingRequestIds: [],
        updatedAt: this.#now(),
      });
      this.#options.store.save(subagent);
      this.#options.emit({ type: "subagent-changed", subagent: structuredClone(subagent) });
    }
  }

  /** Re-reads which cards wait for the person in each subagent's session, and tells the window what changed. */
  refreshWaiting(): void {
    for (const session of this.#sessions.values()) {
      if (!session.providerThreadId || session.ended) continue;
      const ids = this.#options.waitingIds(session.providerThreadId);
      const state: SubagentState =
        ids.length > 0 ? "waiting" : session.subagent.state === "waiting" ? "working" : session.subagent.state;
      const same =
        state === session.subagent.state &&
        ids.length === session.subagent.waitingRequestIds.length &&
        ids.every((id, index) => id === session.subagent.waitingRequestIds[index]);
      if (!same) this.#update(session, { state, waitingRequestIds: ids });
    }
  }

  /** A notification of a subagent's CLI thread. True when it was one (the program must not treat it as the parent's). */
  notification(notification: AppServerNotification): boolean {
    const threadId = getString(notification.params, "threadId");
    if (!threadId || !this.#known.has(threadId)) return false;
    const session = this.#byThread.get(threadId);
    if (!session || session.ended) return true;
    const params = notification.params;
    switch (notification.method) {
      case "turn/started": {
        session.childTurnId ??= getString(getRecord(params, "turn"), "id");
        this.#markWorking(session);
        return true;
      }
      case "item/agentMessage/delta": {
        const id = getString(params, "itemId");
        const delta = getString(params, "delta");
        if (id && delta) {
          session.items.set(id, (session.items.get(id) ?? "") + delta);
          this.#updatePreview(session);
        }
        return true;
      }
      case "item/completed": {
        const item = getRecord(params, "item");
        if (getString(item, "type") === "agentMessage") {
          const id = getString(item, "id");
          const text = getString(item, "text");
          if (id && text !== null) session.items.set(id, text);
        }
        return true;
      }
      case "turn/completed": {
        const status = getString(getRecord(params, "turn"), "status");
        if (status === "failed") this.#finish(session, "failed", "The subagent's turn failed.");
        else if (status === "interrupted") this.#finish(session, "stopped", "The subagent's turn was interrupted.");
        else this.#finish(session, "done", null);
        return true;
      }
      default:
        return true;
    }
  }

  /** A request of a subagent's CLI thread (an approval, a tool call). True when it was one. */
  request(client: AgentClient, request: AppServerRequest): boolean {
    const threadId = getString(request.params, "threadId") ?? getString(request.params, "conversationId");
    if (!threadId || !this.#known.has(threadId)) return false;
    const session = this.#byThread.get(threadId);
    void (async () => {
      try {
        if (!session || session.ended) throw new Error("This subagent was stopped.");
        await this.#options.commonRequest(client, request);
      } catch (error) {
        if (!client.running) return;
        if (request.method === "item/tool/call") {
          client.respond(request.id, {
            success: false,
            contentItems: [{ type: "inputText", text: String(error instanceof Error ? error.message : error) }],
          });
        } else {
          client.respondError(request.id, {
            code: -32603,
            message: String(error instanceof Error ? error.message : error),
          });
        }
      }
    })();
    return true;
  }

  /** The provider process exited: the subagents it ran end. */
  clientExited(client: AgentClient): void {
    for (const session of [...this.#sessions.values()]) {
      if (session.client === client) this.#finish(session, "failed", "The provider process exited.");
    }
  }

  // --- internals ---

  async #spawn(context: CardContext, args: unknown): Promise<DynamicToolResult> {
    const { task, title, wait } = parseSpawnArgs(args);
    const problem = subagentStartProblem({
      depth: this.owns(context.providerThreadId) ? SUBAGENT_LIMITS.depth : 0,
      running: this.#activeCount(context.botId, context.threadId),
    });
    if (problem) throw new Error(problem);
    const at = this.#now();
    let settle!: (subagent: Subagent) => void;
    const completion = new Promise<Subagent>((resolve) => {
      settle = resolve;
    });
    const session: Session = {
      subagent: {
        id: `sub-${this.#newId()}`,
        botId: context.botId,
        threadId: context.threadId,
        parentTurnId: context.turnId || null,
        title: subagentTitle(title, task),
        task,
        state: "starting",
        createdAt: at,
        updatedAt: at,
        finishedAt: null,
        preview: null,
        result: null,
        error: null,
        waitingRequestIds: [],
      },
      parentProviderThreadId: context.providerThreadId,
      client: null,
      providerThreadId: null,
      childTurnId: null,
      items: new Map(),
      lastPreviewAt: 0,
      ended: false,
      completion,
      settle,
    };
    // Saved before anything starts: when the store refuses, nothing runs.
    this.#options.store.save(session.subagent);
    this.#sessions.set(session.subagent.id, session);
    this.#options.emit({ type: "subagent-changed", subagent: structuredClone(session.subagent) });
    void this.#start(session, task);
    if (!wait) return textResult(subagentToolResult(structuredClone(session.subagent)));
    return textResult(subagentToolResult(await session.completion));
  }

  async #wait(context: CardContext, args: unknown): Promise<DynamicToolResult> {
    const { subagentIds } = parseWaitArgs(args);
    const records = subagentIds.map((id) => this.#ownRecord(context, id));
    const done: Subagent[] = [];
    for (const record of records) {
      const session = this.#sessions.get(record.id);
      done.push(session ? await session.completion : (this.#options.store.get(record.id) ?? record));
    }
    return textResult({ subagents: done.map((subagent) => subagentToolResult(subagent)) });
  }

  /** The record of a subagent of THIS agent and thread, else a refusal. */
  #ownRecord(context: CardContext, subagentId: string): Subagent {
    const record = this.#sessions.get(subagentId)?.subagent ?? this.#options.store.get(subagentId);
    if (!record || record.botId !== context.botId || record.threadId !== context.threadId) {
      throw new Error("There is no such subagent in this thread.");
    }
    return record;
  }

  async #start(session: Session, task: string): Promise<void> {
    const { subagent } = session;
    try {
      const client = await this.#options.client(subagent.botId);
      if (session.ended) return;
      session.client = client;
      const bot = this.#options.bot(subagent.botId);
      const access = this.#options.access(bot);
      const response = await client.request(
        "thread/start",
        {
          model: bot.activeModel ?? bot.model,
          effort: bot.reasoningEffort,
          cwd: bot.workspacePath,
          runtimeWorkspaceRoots: access.runtimeWorkspaceRoots,
          approvalPolicy: access.approvalPolicy,
          sandbox: access.sandbox,
          ephemeral: true,
          serviceName: "cosgral-subagent",
          developerInstructions: [SUBAGENT_PREFACE, this.#options.instructions(bot)].join("\n"),
          dynamicTools: this.#options.tools(bot.id),
        },
        decodeThreadResponse,
      );
      const providerThreadId = response.thread.id;
      this.#known.add(providerThreadId);
      this.#parents.set(providerThreadId, subagent.threadId);
      if (session.ended) return;
      session.providerThreadId = providerThreadId;
      this.#byThread.set(providerThreadId, session);
      this.#options.register(providerThreadId, bot.id);
      const turn = await client.request(
        "turn/start",
        {
          threadId: providerThreadId,
          model: bot.activeModel ?? bot.model,
          effort: bot.reasoningEffort,
          cwd: bot.workspacePath,
          approvalPolicy: access.approvalPolicy,
          input: [{ type: "text", text: task }],
        },
        decodeTurnResponse,
      );
      if (session.ended) return;
      session.childTurnId ??= turn.turn.id;
      this.#markWorking(session);
    } catch (error) {
      this.#finish(session, "failed", error instanceof Error ? error.message : String(error));
    }
  }

  #markWorking(session: Session): void {
    if (session.subagent.state === "starting") this.#update(session, { state: "working" });
  }

  #updatePreview(session: Session): void {
    const interval = this.#options.previewIntervalMs ?? 400;
    const nowMs = Date.now();
    if (interval > 0 && nowMs - session.lastPreviewAt < interval) return;
    const preview = subagentPreviewText([...session.items.values()].join("\n\n"));
    if (preview === session.subagent.preview) return;
    session.lastPreviewAt = nowMs;
    this.#update(session, { preview });
  }

  #finish(session: Session, state: "done" | "failed" | "stopped", error: string | null): Subagent {
    if (session.ended) return structuredClone(session.subagent);
    session.ended = true;
    this.#sessions.delete(session.subagent.id);
    if (session.providerThreadId) this.#byThread.delete(session.providerThreadId);
    if (state === "stopped" && session.client && session.providerThreadId && session.childTurnId) {
      // The subagent ends now; the CLI may take a moment to end its turn, and its late messages are ignored.
      void session.client
        .request(
          "turn/interrupt",
          { threadId: session.providerThreadId, turnId: session.childTurnId },
          decodeRecordResponse,
        )
        .catch(() => undefined);
    }
    if (session.providerThreadId) this.#options.clear(session.providerThreadId, session.childTurnId);
    const text = [...session.items.values()].join("\n\n").trim();
    this.#update(session, {
      state,
      finishedAt: this.#now(),
      preview: null,
      waitingRequestIds: [],
      result: state === "done" ? subagentResultText(text) : null,
      error,
    });
    const finished = structuredClone(session.subagent);
    session.settle(finished);
    return finished;
  }

  #update(session: Session, patch: Partial<Subagent>): void {
    Object.assign(session.subagent, patch, { updatedAt: this.#now() });
    this.#options.store.save(session.subagent);
    this.#options.emit({ type: "subagent-changed", subagent: structuredClone(session.subagent) });
  }

  #activeCount(botId: string, threadId: string): number {
    let count = 0;
    for (const session of this.#sessions.values()) {
      if (
        session.subagent.botId === botId &&
        session.subagent.threadId === threadId &&
        subagentIsActive(session.subagent)
      ) {
        count += 1;
      }
    }
    return count;
  }

  #now(): string {
    return this.#options.now?.() ?? new Date().toISOString();
  }

  #newId(): string {
    this.#counter += 1;
    return this.#options.newId?.() ?? `${Date.now().toString(36)}${this.#counter}`;
  }
}

function textResult(value: unknown): DynamicToolResult {
  return { success: true, contentItems: [{ type: "inputText", text: JSON.stringify(value) }] };
}

function failure(message: string): DynamicToolResult {
  return { success: false, contentItems: [{ type: "inputText", text: message }] };
}
