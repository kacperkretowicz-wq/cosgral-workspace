import {
  CHANNEL_LIMITS,
  type ChannelMemory,
  type ChannelMessage,
  type ChannelTask,
  type ChannelTaskActionInput,
  type ReassignChannelTaskInput,
  type SendChannelMessageInput,
  type WorkspaceChannel,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { type ChannelStore, channelResourceKey } from "./channel-store";

export interface ChannelTurnResult {
  status: "completed" | "failed" | "interrupted";
  text: string;
}
export interface ChannelRunInput {
  task: ChannelTask;
  channel: WorkspaceChannel;
  history: ChannelMessage[];
  memory: ChannelMemory[];
  signal: AbortSignal;
  tool: (name: string, args: unknown) => Promise<unknown>;
  waiting: (waiting: boolean) => void;
}
export interface ChannelRunner {
  run(input: ChannelRunInput): Promise<ChannelTurnResult>;
  available?(botId: string): boolean;
}
interface RunLease {
  task: ChannelTask;
  abort: AbortController;
  promise: Promise<void>;
}

/** The scheduler is shared by all channels; a lease lasts until the real provider turn ends. */
export class ChannelEngine {
  readonly #store: ChannelStore;
  readonly #runner: ChannelRunner;
  readonly #workspace: (botId: string) => string | null;
  readonly #active = new Map<string, RunLease>();
  #started = false;
  #scheduled = false;
  readonly #changed = () => this.#schedule();

  constructor(
    store: ChannelStore,
    runner: ChannelRunner,
    options: { workspaceForBot?: (botId: string) => string | null } = {},
  ) {
    this.#store = store;
    this.#runner = runner;
    this.#workspace = options.workspaceForBot ?? (() => null);
  }

  start(): void {
    if (this.#started) return;
    this.#store.recoverInterrupted();
    this.#started = true;
    this.#store.on("event", this.#changed);
    this.#schedule();
  }

  async stop(): Promise<void> {
    this.#started = false;
    this.#store.off("event", this.#changed);
    for (const [id, lease] of this.#active) {
      const task = this.#store.getTask(id);
      if (["running", "waiting"].includes(task.state)) this.#store.act({ taskId: id, action: "pause" });
      lease.abort.abort();
    }
    await Promise.allSettled([...this.#active.values()].map((l) => l.promise));
  }

  sendMessage(input: SendChannelMessageInput): { message: ChannelMessage; task: ChannelTask } {
    const channel = this.#store.get(input.channelId);
    const resource =
      input.resourceKey === undefined ? this.#resource(channel.leadBotId) : channelResourceKey(input.resourceKey);
    const result = this.#store.submit(channel.id, input.text, resource);
    this.#schedule();
    return result;
  }

  actOnTask(input: ChannelTaskActionInput): ChannelTask {
    const previous = this.#store.getTask(input.taskId);
    const task = input.action === "pause" && previous.state === "paused" ? previous : this.#store.act(input);
    if (input.action === "stop" || input.action === "pause") {
      this.#active.get(task.id)?.abort.abort();
      for (const child of this.#descendants(task)) {
        if (["queued", "running", "waiting", "paused"].includes(child.state)) {
          if (input.action === "pause" && child.state === "paused") continue;
          this.#store.act({ taskId: child.id, action: input.action });
          this.#active.get(child.id)?.abort.abort();
        }
      }
    }
    this.#schedule();
    return task;
  }

  reassignTask(input: ReassignChannelTaskInput, actor: "human" | "agent" = "human"): ChannelTask {
    const task = this.#store.getTask(input.taskId);
    // Explicit browser work keeps the browser lease when changing owners.
    const resource = task.resourceKey === "browser" ? "browser" : this.#resource(input.ownerBotId);
    const changed = this.#store.reassign(input, actor, resource);
    if (changed.state === "paused") this.actOnTask({ taskId: changed.id, action: "pause" });
    this.#active.get(task.id)?.abort.abort();
    this.#schedule();
    return changed;
  }

  reconcile(): void {
    for (const [id, lease] of this.#active) {
      const current = this.#store.getTask(id);
      if (current.ownerBotId !== lease.task.ownerBotId || ["paused", "cancelled"].includes(current.state))
        lease.abort.abort();
    }
    this.#schedule();
  }

  #descendants(task: ChannelTask): ChannelTask[] {
    const result: ChannelTask[] = [];
    const all = this.#store.listTasks(task.channelId);
    const parents = new Set([task.id]);
    for (const child of all)
      if (child.parentTaskId && parents.has(child.parentTaskId)) {
        parents.add(child.id);
        result.push(child);
      }
    return result;
  }

  #resource(botId: string | null): string | null {
    const workspace = botId ? this.#workspace(botId) : null;
    return workspace ? channelResourceKey(`workspace:${workspace}`) : null;
  }

  #schedule(): void {
    if (!this.#started || this.#scheduled) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      if (!this.#started) return;
      // A child result is delivered to its waiting parent exactly once, after all helpers finish.
      for (const channel of this.#store.list())
        for (const task of this.#store.listTasks(channel.id)) {
          if (this.#active.has(task.id) || task.state !== "waiting" || !task.waitingForTaskIds?.length) continue;
          if (
            task.waitingForTaskIds.every(
              (id) => !this.#active.has(id) && ["done", "failed", "cancelled"].includes(this.#store.getTask(id).state),
            )
          )
            this.#store.continueTask(task.id);
        }
      const busy = new Set([...this.#active.values()].flatMap((l) => (l.task.resourceKey ? [l.task.resourceKey] : [])));
      const bots = new Set([...this.#active.values()].map((l) => l.task.ownerBotId));
      for (const task of this.#store.startable()) {
        if (this.#runner.available && !this.#runner.available(task.ownerBotId)) continue;
        if (this.#active.has(task.id) || bots.has(task.ownerBotId) || (task.resourceKey && busy.has(task.resourceKey)))
          continue;
        if (task.resourceKey) busy.add(task.resourceKey);
        bots.add(task.ownerBotId);
        this.#launch(task);
      }
    });
  }

  #launch(task: ChannelTask): void {
    const abort = new AbortController();
    const lease: RunLease = { task, abort, promise: Promise.resolve() };
    this.#active.set(task.id, lease);
    const current = this.#store.markRunning(task.id);
    const channel = this.#store.get(task.channelId);
    lease.promise = Promise.resolve()
      .then(() => {
        const history = this.#store.listMessages(channel.id);
        const request = this.#store.getMessage(channel.id, task.requestMessageId);
        if (!history.some((m) => m.id === request.id)) history.unshift(request);
        return abort.signal.aborted
          ? { status: "interrupted" as const, text: "" }
          : this.#runner.run({
              task: current,
              channel,
              history,
              memory: this.#store.listMemory(channel.id),
              signal: abort.signal,
              tool: async (name, args) => {
                this.#assertActive(lease);
                return this.#tool(lease, name, args);
              },
              waiting: (waiting) => {
                if (abort.signal.aborted) return;
                const t = this.#store.getTask(task.id);
                if (waiting && t.state === "running") this.#store.markWaiting(task.id);
                else if (!waiting && t.state === "waiting" && !t.waitingForTaskIds?.length)
                  this.#store.markRunning(task.id);
              },
            });
      })
      .then((result) => {
        if (abort.signal.aborted) return;
        const latest = this.#store.getTask(task.id);
        if (
          latest.ownerBotId !== task.ownerBotId ||
          ["done", "failed", "paused", "cancelled", "queued"].includes(latest.state)
        )
          return;
        // Helpers may finish before this turn ends; the turn's own "waiting" text is never the result.
        if (latest.waitingForTaskIds?.length) {
          this.#store.waitForTasks(latest.id, latest.waitingForTaskIds);
          return;
        }
        if (result.status === "interrupted") this.#store.act({ taskId: task.id, action: "pause" });
        else
          this.#store.recordResult(
            task.id,
            task.ownerBotId,
            result.text || "The agent returned no result.",
            result.status === "failed" ? "failed" : "done",
          );
      })
      .catch((error) => {
        if (abort.signal.aborted) return;
        const latest = this.#store.getTask(task.id);
        if (["running", "waiting"].includes(latest.state))
          this.#store.recordResult(task.id, task.ownerBotId, `Channel turn failed: ${String(error)}`, "failed");
      })
      .finally(() => {
        this.#active.delete(task.id);
        this.#schedule();
      });
  }

  #assertActive(lease: RunLease): ChannelTask {
    const task = this.#store.getTask(lease.task.id);
    const channel = this.#store.get(task.channelId);
    if (
      lease.abort.signal.aborted ||
      this.#active.get(task.id) !== lease ||
      !["running", "waiting", "done"].includes(task.state) ||
      task.ownerBotId !== lease.task.ownerBotId
    )
      throw new Error("This channel turn is stopped or no longer active.");
    if (!channel.memberBotIds.includes(task.ownerBotId)) throw new Error("Only channel members can use these tools.");
    return task;
  }

  async #tool(lease: RunLease, name: string, value: unknown): Promise<unknown> {
    const task = this.#assertActive(lease);
    if (!isDynamicRecord(value)) throw new Error("Tool arguments must be an object.");
    const string = (key: string) => {
      const v = value[key];
      if (!isString(v) || !v.trim()) throw new Error(`${key} is required.`);
      return v;
    };
    if (name === "history") return this.#store.listMessages(task.channelId);
    if (name === "memory") return this.#store.listMemory(task.channelId);
    if (name === "remember") return this.#store.remember(task.channelId, task.ownerBotId, string("text"));
    if (name === "note")
      return this.#store.addMessage({
        channelId: task.channelId,
        taskId: task.id,
        authorBotId: task.ownerBotId,
        kind: "note",
        text: string("text"),
      });
    if (name === "result") {
      if (
        task.waitingForTaskIds?.some((id) => !["done", "failed", "cancelled"].includes(this.#store.getTask(id).state))
      )
        throw new Error("Wait for the child helpers before returning the result.");
      return this.#store.recordResult(task.id, task.ownerBotId, string("text"));
    }
    if (name === "transfer") return this.reassignTask({ taskId: task.id, ownerBotId: string("ownerBotId") }, "agent");
    if (name === "stop") {
      const id = string("taskId");
      const target = this.#store.getTask(id);
      if (
        target.channelId !== task.channelId ||
        (target.id !== task.id && this.#store.get(task.channelId).leadBotId !== task.ownerBotId)
      )
        throw new Error("Only the lead can stop another task in this channel.");
      return this.actOnTask({ taskId: id, action: "stop" });
    }
    if (!["assign", "ask", "reply"].includes(name)) throw new Error(`Unsupported channel tool: ${name}`);
    if (task.state === "done") throw new Error("The task already has a result.");
    let recipient = name === "reply" ? "" : string("ownerBotId");
    let questionRootId: string | null = null;
    let replyToMessageId: string | null = null;
    if (name === "reply") {
      const message = this.#store.getMessage(task.channelId, string("messageId"));
      const answered = message.taskId ? this.#store.getTask(message.taskId) : null;
      if (
        answered?.kind !== "question" ||
        answered.parentTaskId !== task.id ||
        message.kind !== "reply" ||
        !message.authorBotId
      )
        throw new Error("Reply to an answer to this task's short question.");
      questionRootId = answered.questionRootId ?? answered.id;
      const answers = this.#store
        .listTasks(task.channelId)
        .filter((t) => t.id === questionRootId || t.questionRootId === questionRootId);
      if (answers.length >= CHANNEL_LIMITS.repliesPerRequest)
        throw new Error(`A short question allows at most ${CHANNEL_LIMITS.repliesPerRequest} answers.`);
      recipient = message.authorBotId;
      replyToMessageId = message.id;
    }
    const channel = this.#store.get(task.channelId);
    if (!channel.memberBotIds.includes(recipient)) throw new Error("Only a channel member can receive a task.");
    if (task.kind === "question") throw new Error("Short questions cannot delegate or open more question threads.");
    const deps = value.dependencyTaskIds ?? [];
    if (!Array.isArray(deps) || !deps.every(isString)) throw new Error("dependencyTaskIds must be a list.");
    const ancestors = new Set([task.id]);
    let ancestor = task.parentTaskId;
    while (ancestor) {
      ancestors.add(ancestor);
      ancestor = this.#store.getTask(ancestor).parentTaskId;
    }
    if (deps.some((id) => ancestors.has(id))) throw new Error("A child cannot depend on its ancestor task.");
    // Validate before writing an assignment message, including cross-channel dependencies.
    for (const id of deps)
      if (this.#store.getTask(id).channelId !== channel.id) throw new Error("Dependencies must be in this channel.");
    const resource =
      value.resourceKey === undefined
        ? this.#resource(recipient)
        : channelResourceKey(value.resourceKey === null ? null : string("resourceKey"));
    const question = name !== "assign";
    const text = string("text");
    if (!this.#store.reserveChildAssignment(task.id)) {
      this.actOnTask({ taskId: task.id, action: "pause" });
      throw new Error("Automatic assignment limit reached. Only a human can resume this task.");
    }
    const message = this.#store.addMessage({
      channelId: channel.id,
      taskId: task.id,
      authorBotId: task.ownerBotId,
      kind: question ? "question" : "assignment",
      text,
      replyToMessageId,
    });
    const child = this.#store.createTask({
      channelId: channel.id,
      ownerBotId: recipient,
      title: text,
      requestMessageId: message.id,
      parentTaskId: task.id,
      dependencyTaskIds: deps,
      resourceKey: resource,
      kind: question ? "question" : "work",
      questionRootId,
    });
    const waiting = this.#store.getTask(task.id).waitingForTaskIds ?? [];
    this.#store.waitForTasks(task.id, [...waiting, child.id]);
    return child;
  }
}
