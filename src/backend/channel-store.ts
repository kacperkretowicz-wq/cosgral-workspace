// COSGRAL W1-BE2: channels with a lead agent, and their tasks, in the local database.
// Rules follow the Tester's description docs/cosgral/spec-w1-kanaly.md. This store only
// keeps data and enforces the rules; running agents on tasks is the channel engine's job.

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { posix, win32 } from "node:path";
import {
  type AgentEvent,
  CHANNEL_LIMITS,
  type ChannelAssignment,
  type ChannelMemberInput,
  type ChannelMemory,
  type ChannelMessage,
  type ChannelTask,
  type ChannelTaskActionInput,
  type ChannelTaskState,
  type CreateWorkspaceChannelInput,
  isChannelAssignment,
  isChannelMemory,
  isChannelMessage,
  isChannelName,
  isChannelTaskState,
  type ListChannelMessagesInput,
  type ReassignChannelTaskInput,
  type UpdateWorkspaceChannelInput,
  type WorkspaceChannel,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { purgeChannelMemoryHistory } from "./memory-history";
import type { OpenBotDatabase } from "./openbot-database";

export interface ChannelStoreOptions {
  now?: () => Date;
  /** Members must be existing agents. */
  botExists?: (botId: string) => boolean;
}

/** A new task, made by the channel engine from a message or by an agent asking for help. */
export interface NewChannelTask {
  channelId: string;
  title: string;
  requestMessageId: string;
  /** Defaults to the channel lead. */
  ownerBotId?: string;
  parentTaskId?: string | null;
  dependencyTaskIds?: string[];
  resourceKey?: string | null;
  kind?: "work" | "question";
  questionRootId?: string | null;
}

export interface CompleteChannelTaskInput {
  taskId: string;
  outcome: "done" | "failed";
  resultMessageId: string;
}

export interface ChannelChanges {
  channels: WorkspaceChannel[];
  tasks: ChannelTask[];
}

const FINISHED_STATES: readonly ChannelTaskState[] = ["done", "failed", "cancelled"];
const ACTIVE_STATES: readonly ChannelTaskState[] = ["running", "waiting"];
const OPEN_STATES: readonly ChannelTaskState[] = ["queued", "running", "waiting", "paused"];

export class ChannelStore extends EventEmitter<{ event: [event: AgentEvent] }> {
  readonly #database: OpenBotDatabase;
  readonly #now: () => Date;
  readonly #botExists: (botId: string) => boolean;

  constructor(database: OpenBotDatabase, options: ChannelStoreOptions = {}) {
    super();
    this.#database = database;
    this.#now = options.now ?? (() => new Date());
    this.#botExists = options.botExists ?? (() => true);
  }

  list(): WorkspaceChannel[] {
    return rows(this.#database.connection.prepare(`${CHANNEL_SELECT} ORDER BY created_at, channel_id`).all()).map(
      channelFromRow,
    );
  }

  get(channelId: string): WorkspaceChannel {
    const row = this.#database.connection.prepare(`${CHANNEL_SELECT} WHERE channel_id = ?`).get(channelId);
    if (!isDynamicRecord(row)) throw new Error("This channel no longer exists.");
    return channelFromRow(row);
  }

  create(input: CreateWorkspaceChannelInput): WorkspaceChannel {
    const name = channelName(input.name);
    if (this.list().some((channel) => channel.name === name)) {
      throw new Error(`A channel named ${name} already exists.`);
    }
    const memberBotIds = this.#members(input.memberBotIds);
    if (!memberBotIds.includes(input.leadBotId)) throw new Error("The lead must be a member of the channel.");
    const at = this.#isoNow();
    const channel: WorkspaceChannel = {
      id: randomUUID(),
      name,
      title: channelTitle(input.title),
      instructions: channelInstructions(input.instructions),
      leadBotId: input.leadBotId,
      memberBotIds,
      isolated: input.isolated,
      archived: false,
      createdAt: at,
      updatedAt: at,
    };
    this.#save([channel], [], "channel.created", { channelId: channel.id, name });
    return this.get(channel.id);
  }

  update(input: UpdateWorkspaceChannelInput): WorkspaceChannel {
    const channel = this.get(input.channelId);
    const updated: WorkspaceChannel = {
      ...channel,
      title: input.title === undefined ? channel.title : channelTitle(input.title),
      instructions: input.instructions === undefined ? channel.instructions : channelInstructions(input.instructions),
      isolated: input.isolated ?? channel.isolated,
      archived: input.archived ?? channel.archived,
      updatedAt: this.#isoNow(),
    };
    this.#save([updated], [], "channel.updated", { channelId: channel.id });
    return this.get(channel.id);
  }

  addMember(input: ChannelMemberInput): WorkspaceChannel {
    const channel = this.get(input.channelId);
    if (channel.memberBotIds.includes(input.botId)) return channel;
    const memberBotIds = this.#members([...channel.memberBotIds, input.botId]);
    this.#save([{ ...channel, memberBotIds, updatedAt: this.#isoNow() }], [], "channel.member-added", { ...input });
    return this.get(channel.id);
  }

  removeMember(input: ChannelMemberInput): WorkspaceChannel {
    const channel = this.get(input.channelId);
    if (!channel.memberBotIds.includes(input.botId)) return channel;
    if (channel.leadBotId === input.botId) throw new Error("Choose another lead before removing this member.");
    const ownsOpenTask = this.listTasks(channel.id).some(
      (task) => task.ownerBotId === input.botId && OPEN_STATES.includes(task.state),
    );
    if (ownsOpenTask) throw new Error("Reassign this member's open tasks before removing it.");
    const memberBotIds = channel.memberBotIds.filter((botId) => botId !== input.botId);
    this.#save([{ ...channel, memberBotIds, updatedAt: this.#isoNow() }], [], "channel.member-removed", { ...input });
    return this.get(channel.id);
  }

  setLead(input: ChannelMemberInput): WorkspaceChannel {
    const channel = this.get(input.channelId);
    if (!channel.memberBotIds.includes(input.botId)) throw new Error("The lead must be a member of the channel.");
    if (channel.leadBotId === input.botId) return channel;
    this.#save([{ ...channel, leadBotId: input.botId, updatedAt: this.#isoNow() }], [], "channel.lead-set", {
      ...input,
    });
    return this.get(channel.id);
  }

  /**
   * Removes agents that no longer exist from every channel. A removed lead hands the role to the
   * next member; its open tasks go to the new lead (or stop when the channel has no member left).
   */
  pruneBots(knownBotIds: readonly string[]): ChannelChanges {
    const known = new Set(knownBotIds);
    const channels: WorkspaceChannel[] = [];
    const tasks: ChannelTask[] = [];
    const at = this.#isoNow();
    for (const channel of this.list()) {
      const memberBotIds = channel.memberBotIds.filter((botId) => known.has(botId));
      if (memberBotIds.length === channel.memberBotIds.length) continue;
      const leadBotId =
        channel.leadBotId && known.has(channel.leadBotId) ? channel.leadBotId : (memberBotIds[0] ?? null);
      channels.push({ ...channel, memberBotIds, leadBotId, updatedAt: at });
      for (const task of this.listTasks(channel.id)) {
        if (known.has(task.ownerBotId) || !OPEN_STATES.includes(task.state)) continue;
        tasks.push(
          leadBotId
            ? {
                ...task,
                ownerBotId: leadBotId,
                state: task.state === "paused" ? "paused" : "queued",
                assignmentCount: task.assignmentCount + 1,
                updatedAt: at,
              }
            : { ...task, state: "cancelled", updatedAt: at },
        );
      }
    }
    if (channels.length > 0) this.#save(channels, tasks, "channel.agents-removed", { knownBotIds: [...known] });
    return {
      channels: channels.map((channel) => this.get(channel.id)),
      tasks: tasks.map((task) => this.getTask(task.id)),
    };
  }

  listTasks(channelId: string): ChannelTask[] {
    return rows(
      this.#database.connection
        .prepare(`${TASK_SELECT} WHERE channel_id = ? ORDER BY created_at, projection_channel_tasks.rowid`)
        .all(channelId),
    ).map(taskFromRow);
  }

  getTask(taskId: string): ChannelTask {
    const row = this.#database.connection.prepare(`${TASK_SELECT} WHERE task_id = ?`).get(taskId);
    if (!isDynamicRecord(row)) throw new Error("This task no longer exists.");
    return taskFromRow(row);
  }

  createTask(input: NewChannelTask): ChannelTask {
    const channel = this.get(input.channelId);
    if (channel.archived) throw new Error("This channel is archived.");
    const ownerBotId = input.ownerBotId ?? channel.leadBotId;
    if (!ownerBotId || !channel.memberBotIds.includes(ownerBotId)) {
      throw new Error("Only a member of the channel can own its tasks.");
    }
    const existing = new Set(this.listTasks(channel.id).map((task) => task.id));
    const dependencyTaskIds = [...new Set(input.dependencyTaskIds ?? [])];
    const parentTaskId = input.parentTaskId ?? null;
    if ([...dependencyTaskIds, ...(parentTaskId ? [parentTaskId] : [])].some((id) => !existing.has(id))) {
      throw new Error("A task can only depend on tasks of the same channel.");
    }
    const at = this.#isoNow();
    const task: ChannelTask = {
      id: randomUUID(),
      channelId: channel.id,
      ownerBotId,
      state: "queued",
      title: taskTitle(input.title),
      requestMessageId: input.requestMessageId,
      resultMessageId: null,
      parentTaskId,
      dependencyTaskIds,
      resourceKey: channelResourceKey(input.resourceKey),
      assignmentCount: 1,
      automaticAssignmentCount: 1,
      waitingForTaskIds: [],
      pauseReason: null,
      kind: input.kind ?? "work",
      questionRootId: input.questionRootId ?? null,
      archivedAt: null,
      createdAt: at,
      updatedAt: at,
    };
    this.#save([], [task], "channel-task.created", { taskId: task.id, channelId: channel.id });
    return this.getTask(task.id);
  }

  /**
   * Queued tasks that may start now, oldest first: every dependency is done, nothing else with the
   * same resource is running or waiting, and no older queued task holds the same resource.
   */
  startable(): ChannelTask[] {
    const all = rows(
      this.#database.connection.prepare(`${TASK_SELECT} ORDER BY created_at, projection_channel_tasks.rowid`).all(),
    ).map(taskFromRow);
    const byId = new Map(all.map((task) => [task.id, task]));
    const busy = new Set(
      all.flatMap((task) =>
        ACTIVE_STATES.includes(task.state) && !task.waitingForTaskIds?.length && task.resourceKey
          ? [task.resourceKey]
          : [],
      ),
    );
    const startable: ChannelTask[] = [];
    for (const task of all) {
      if (task.state !== "queued" || task.archivedAt || this.get(task.channelId).archived) continue;
      let ancestor = task.parentTaskId;
      let ancestorStopped = false;
      while (ancestor) {
        const parent = byId.get(ancestor);
        if (!parent || ["paused", "cancelled", "done", "failed"].includes(parent.state)) {
          ancestorStopped = true;
          break;
        }
        ancestor = parent.parentTaskId;
      }
      if (ancestorStopped) continue;
      const ready = task.dependencyTaskIds.every((id) => byId.get(id)?.state === "done");
      const resourceFree = !task.resourceKey || !busy.has(task.resourceKey);
      // An unmet dependency must not reserve a resource needed by that dependency.
      if (ready && task.resourceKey) busy.add(task.resourceKey);
      if (ready && resourceFree) startable.push(task);
    }
    return startable;
  }

  markRunning(taskId: string): ChannelTask {
    return this.#transition(taskId, ["queued", "waiting"], "running", "This task cannot start now.");
  }

  markWaiting(taskId: string): ChannelTask {
    return this.#transition(taskId, ["running"], "waiting", "This task is not running.");
  }

  /** The one result of a task. */
  complete(input: CompleteChannelTaskInput): ChannelTask {
    const task = this.getTask(input.taskId);
    if (!["queued", "running", "waiting", "done", "failed"].includes(task.state))
      throw new Error("This task is not running.");
    const updated: ChannelTask = {
      ...task,
      state: input.outcome,
      resultMessageId: input.resultMessageId,
      updatedAt: this.#isoNow(),
    };
    this.#save([], [updated], "channel-task.completed", { ...input });
    return this.getTask(task.id);
  }

  /** A person's Stop, Pause, Resume, Archive or Restore. */
  act(input: ChannelTaskActionInput, actor: "human" | "agent" = "human"): ChannelTask {
    switch (input.action) {
      case "stop":
        return this.#transition(input.taskId, OPEN_STATES, "cancelled", "This task is already finished.");
      case "pause":
        return this.#transition(input.taskId, ["queued", "running", "waiting"], "paused", "This task is not running.");
      case "resume":
        if (actor !== "human") throw new Error("Only a human can resume a task.");
        if (!["paused", "cancelled"].includes(this.getTask(input.taskId).state))
          throw new Error("Only a paused or stopped task can be resumed.");
        this.#save(
          [],
          [{ ...this.getTask(input.taskId), automaticAssignmentCount: 0, pauseReason: null, waitingForTaskIds: [] }],
          "channel-task.budget-reset",
          {},
        );
        return this.#transition(
          input.taskId,
          ["paused", "cancelled"],
          "queued",
          "Only a paused or stopped task can be resumed.",
        );
      case "archive":
      case "restore": {
        const task = this.getTask(input.taskId);
        const archivedAt = input.action === "archive" ? (task.archivedAt ?? this.#isoNow()) : null;
        if (archivedAt === task.archivedAt) return task;
        this.#save([], [{ ...task, archivedAt, updatedAt: this.#isoNow() }], `channel-task.${input.action}d`, {
          ...input,
        });
        return this.getTask(task.id);
      }
    }
  }

  /** Gives an open task to another member; it starts again for the new owner. */
  reassign(
    input: ReassignChannelTaskInput,
    actor: "human" | "agent" = "human",
    resourceKey?: string | null,
  ): ChannelTask {
    const task = this.getTask(input.taskId);
    const channel = this.get(task.channelId);
    if (!channel.memberBotIds.includes(input.ownerBotId)) {
      throw new Error("Only a member of the channel can own its tasks.");
    }
    if (FINISHED_STATES.includes(task.state)) throw new Error("This task is finished.");
    if (actor === "agent" && task.state === "paused") return task;
    if (
      actor === "agent" &&
      (task.automaticAssignmentCount ?? task.assignmentCount) >= CHANNEL_LIMITS.automaticAssignments
    ) {
      this.#save(
        [],
        [{ ...task, state: "paused", pauseReason: ASSIGNMENT_LIMIT_REASON, updatedAt: this.#isoNow() }],
        "channel-task.limited",
        {},
      );
      return this.getTask(task.id);
    }
    const count = actor === "human" ? 0 : (task.automaticAssignmentCount ?? task.assignmentCount) + 1;
    const updated: ChannelTask = {
      ...task,
      ownerBotId: input.ownerBotId,
      state: count > CHANNEL_LIMITS.automaticAssignments ? "paused" : "queued",
      automaticAssignmentCount: count,
      resourceKey: resourceKey === undefined ? task.resourceKey : channelResourceKey(resourceKey),
      pauseReason: count > CHANNEL_LIMITS.automaticAssignments ? ASSIGNMENT_LIMIT_REASON : null,
      assignmentCount: task.assignmentCount + 1,
      updatedAt: this.#isoNow(),
    };
    this.#save([], [updated], "channel-task.reassigned", { ...input });
    return this.getTask(task.id);
  }

  listMessages(channelId: string, input: Omit<ListChannelMessagesInput, "channelId"> = {}): ChannelMessage[] {
    this.get(channelId);
    const limit = input.limit ?? CHANNEL_LIMITS.historyPage;
    if (!Number.isInteger(limit) || limit < 1 || limit > CHANNEL_LIMITS.historyPage)
      throw new Error("Invalid history page size.");
    let before = Number.MAX_SAFE_INTEGER;
    if (input.beforeMessageId) {
      const row = this.#database.connection
        .prepare("SELECT ordinal FROM projection_channel_messages WHERE channel_id = ? AND message_id = ?")
        .get(channelId, input.beforeMessageId);
      if (!row || !isNumber(row.ordinal)) throw new Error("This message is not in the channel.");
      before = row.ordinal;
    }
    return rows(
      this.#database.connection
        .prepare(
          "SELECT data_json FROM projection_channel_messages WHERE channel_id = ? AND ordinal < ? ORDER BY ordinal DESC LIMIT ?",
        )
        .all(channelId, before, limit),
    )
      .map((row) => jsonColumn(row, isChannelMessage))
      .reverse();
  }

  getMessage(channelId: string, id: string): ChannelMessage {
    const row = this.#database.connection
      .prepare("SELECT data_json FROM projection_channel_messages WHERE channel_id = ? AND message_id = ?")
      .get(channelId, id);
    if (!isDynamicRecord(row)) throw new Error("This message is not in the channel.");
    return jsonColumn(row, isChannelMessage);
  }

  addMessage(
    input: Pick<ChannelMessage, "channelId" | "authorBotId" | "kind" | "text"> &
      Partial<Pick<ChannelMessage, "taskId" | "replyToMessageId">>,
  ): ChannelMessage {
    this.get(input.channelId);
    const message = this.#message(input);
    this.#save([], [], "channel.message-added", { channelId: input.channelId }, { messages: [message] });
    return message;
  }

  /** The request and its task are committed together, before the scheduler can see either. */
  submit(channelId: string, text: string, resourceKey?: string | null): { message: ChannelMessage; task: ChannelTask } {
    // createTask validates membership and resource first; both writes use the same dispatch via pending message.
    const channel = this.get(channelId);
    if (channel.archived || !channel.leadBotId) throw new Error("This channel has no available lead or is archived.");
    const key = channelResourceKey(resourceKey);
    const message = this.#message({ channelId, authorBotId: null, kind: "human", text });
    const at = this.#isoNow();
    const task: ChannelTask = {
      id: randomUUID(),
      channelId,
      ownerBotId: channel.leadBotId,
      state: "queued",
      title: taskTitle(text),
      requestMessageId: message.id,
      resultMessageId: null,
      parentTaskId: null,
      dependencyTaskIds: [],
      resourceKey: key,
      assignmentCount: 1,
      automaticAssignmentCount: 1,
      waitingForTaskIds: [],
      pauseReason: null,
      kind: "work",
      questionRootId: null,
      archivedAt: null,
      createdAt: at,
      updatedAt: at,
    };
    message.taskId = task.id;
    this.#save([], [task], "channel-task.created", { channelId, taskId: task.id }, { messages: [message] });
    return { message, task: this.getTask(task.id) };
  }

  recordResult(taskId: string, authorBotId: string, text: string, outcome: "done" | "failed" = "done"): ChannelMessage {
    const task = this.getTask(taskId);
    if (task.ownerBotId !== authorBotId) throw new Error("Only the task owner can return its result.");
    if (["paused", "cancelled"].includes(task.state)) throw new Error("This task is stopped.");
    const previous = task.resultMessageId ? this.getMessage(task.channelId, task.resultMessageId) : null;
    const message: ChannelMessage = {
      ...this.#message({
        channelId: task.channelId,
        taskId,
        authorBotId,
        kind: task.kind === "question" ? "reply" : "result",
        text,
      }),
      resultVersion: (previous?.resultVersion ?? 0) + 1,
    };
    const messages = previous ? [{ ...previous, superseded: true }, message] : [message];
    const notes = rows(
      this.#database.connection
        .prepare(
          "SELECT data_json FROM projection_channel_messages WHERE channel_id = ? AND json_extract(data_json,'$.taskId') = ? AND json_extract(data_json,'$.kind') = 'note' AND json_extract(data_json,'$.superseded') = 0",
        )
        .all(task.channelId, task.id),
    ).map((row) => ({ ...jsonColumn(row, isChannelMessage), superseded: true }));
    this.#save(
      [],
      [{ ...task, state: outcome, resultMessageId: message.id, updatedAt: this.#isoNow() }],
      "channel-task.result",
      { taskId },
      { messages: [...notes, ...messages] },
    );
    return message;
  }

  listMemory(channelId: string): ChannelMemory[] {
    this.get(channelId);
    return rows(
      this.#database.connection
        .prepare("SELECT data_json FROM projection_channel_memories WHERE channel_id = ? ORDER BY rowid")
        .all(channelId),
    ).map((row) => jsonColumn(row, isChannelMemory));
  }

  remember(channelId: string, authorBotId: string, value: string): ChannelMemory {
    const channel = this.get(channelId);
    if (!channel.memberBotIds.includes(authorBotId)) throw new Error("Only channel members can write its memory.");
    if (!value.trim() || value.length > CHANNEL_LIMITS.memoryEntry)
      throw new Error(`A channel memory entry has 1–${CHANNEL_LIMITS.memoryEntry} characters.`);
    const memory: ChannelMemory = {
      id: randomUUID(),
      channelId,
      authorBotId,
      text: value.trim(),
      createdAt: this.#isoNow(),
    };
    this.#save([], [], "channel.memory-added", { channelId }, { memories: [memory] });
    return memory;
  }

  /**
   * COSGRAL W2: a person adds an entry (no memoryId, author null) or edits one (memoryId; the author stays).
   * Same 500-character limit as the agents' entries.
   */
  saveMemoryByPerson(input: { channelId: string; text: string; memoryId?: string }): ChannelMemory {
    this.get(input.channelId);
    const text = input.text.trim();
    if (!text || text.length > CHANNEL_LIMITS.memoryEntry)
      throw new Error(`A channel memory entry has 1–${CHANNEL_LIMITS.memoryEntry} characters.`);
    const at = this.#isoNow();
    if (input.memoryId) {
      const existing = this.#memory(input.channelId, input.memoryId);
      const memory: ChannelMemory = { ...existing, text, updatedAt: at };
      this.#save([], [], "channel.memory-edited", { channelId: input.channelId }, { memories: [memory] });
      return memory;
    }
    const memory: ChannelMemory = {
      id: randomUUID(),
      channelId: input.channelId,
      authorBotId: null,
      text,
      createdAt: at,
    };
    this.#save([], [], "channel.memory-added", { channelId: input.channelId }, { memories: [memory] });
    return memory;
  }

  /** COSGRAL W2: remove one entry of the channel's memory. */
  forgetMemory(input: { channelId: string; memoryId: string }): ChannelMemory {
    const memory = this.#memory(input.channelId, input.memoryId);
    this.#save([], [], "channel.memory-forgotten", { channelId: input.channelId }, { forgotten: [memory] });
    return memory;
  }

  #memory(channelId: string, memoryId: string): ChannelMemory {
    const memory = this.listMemory(channelId).find((entry) => entry.id === memoryId);
    if (!memory) throw new Error("This channel memory entry no longer exists.");
    return memory;
  }

  listAssignments(taskId: string): ChannelAssignment[] {
    return rows(
      this.#database.connection
        .prepare("SELECT data_json FROM projection_channel_assignments WHERE task_id = ? ORDER BY ordinal")
        .all(taskId),
    ).map((row) => jsonColumn(row, isChannelAssignment));
  }

  waitForTasks(taskId: string, ids: string[]): ChannelTask {
    const task = this.getTask(taskId);
    if (!["running", "waiting"].includes(task.state)) throw new Error("This task is not running.");
    if (ids.some((id) => this.getTask(id).parentTaskId !== taskId)) throw new Error("Only child tasks can be awaited.");
    this.#save(
      [],
      [{ ...task, state: "waiting", waitingForTaskIds: [...new Set(ids)], updatedAt: this.#isoNow() }],
      "channel-task.waiting",
      { taskId },
    );
    return this.getTask(taskId);
  }

  continueTask(taskId: string): ChannelTask {
    const task = this.getTask(taskId);
    if (task.state !== "waiting") return task;
    const count = task.automaticAssignmentCount ?? task.assignmentCount;
    const limited = count >= CHANNEL_LIMITS.automaticAssignments;
    this.#save(
      [],
      [
        {
          ...task,
          state: limited ? "paused" : "queued",
          waitingForTaskIds: [],
          pauseReason: limited ? ASSIGNMENT_LIMIT_REASON : null,
          assignmentCount: limited ? task.assignmentCount : task.assignmentCount + 1,
          automaticAssignmentCount: limited ? count : count + 1,
          updatedAt: this.#isoNow(),
        },
      ],
      "channel-task.continued",
      { taskId },
    );
    return this.getTask(taskId);
  }

  /** Child dispatches consume their asking task's budget too; fan-out cannot bypass the limit. */
  reserveChildAssignment(taskId: string): boolean {
    const task = this.getTask(taskId);
    const count = task.automaticAssignmentCount ?? task.assignmentCount;
    if (count >= CHANNEL_LIMITS.automaticAssignments) {
      this.#save(
        [],
        [{ ...task, state: "paused", pauseReason: ASSIGNMENT_LIMIT_REASON, updatedAt: this.#isoNow() }],
        "channel-task.limited",
        {},
      );
      return false;
    }
    this.#save(
      [],
      [
        {
          ...task,
          automaticAssignmentCount: count + 1,
          assignmentCount: task.assignmentCount + 1,
          updatedAt: this.#isoNow(),
        },
      ],
      "channel-task.child-assigned",
      {},
    );
    return true;
  }

  recoverInterrupted(): ChannelTask[] {
    const changed = this.list()
      .flatMap((c) => this.listTasks(c.id))
      .filter((t) => t.state === "running" || (t.state === "waiting" && !t.waitingForTaskIds?.length))
      .map((t) => ({
        ...t,
        state: "paused" as const,
        pauseReason:
          "The application stopped during this turn. A human must resume it to avoid repeating side effects.",
        updatedAt: this.#isoNow(),
      }));
    if (changed.length) this.#save([], changed, "channel-task.recovered", {});
    return changed;
  }

  #message(
    input: Pick<ChannelMessage, "channelId" | "authorBotId" | "kind" | "text"> &
      Partial<Pick<ChannelMessage, "taskId" | "replyToMessageId">>,
  ): ChannelMessage {
    if (!input.text.trim() || input.text.length > CHANNEL_LIMITS.message)
      throw new Error(`A channel message has 1–${CHANNEL_LIMITS.message} characters.`);
    if (input.authorBotId && !this.get(input.channelId).memberBotIds.includes(input.authorBotId))
      throw new Error("Only a channel member can write here.");
    if (input.replyToMessageId) this.getMessage(input.channelId, input.replyToMessageId);
    return {
      id: randomUUID(),
      channelId: input.channelId,
      taskId: input.taskId ?? null,
      authorBotId: input.authorBotId,
      kind: input.kind,
      text: input.text.trim(),
      replyToMessageId: input.replyToMessageId ?? null,
      resultVersion: null,
      superseded: false,
      createdAt: this.#isoNow(),
    };
  }

  #transition(taskId: string, from: readonly ChannelTaskState[], to: ChannelTaskState, refusal: string): ChannelTask {
    const task = this.getTask(taskId);
    if (!from.includes(task.state)) throw new Error(refusal);
    this.#save([], [{ ...task, state: to, updatedAt: this.#isoNow() }], "channel-task.state-changed", {
      taskId,
      from: task.state,
      to,
    });
    return this.getTask(taskId);
  }

  #members(botIds: readonly string[]): string[] {
    const members = [...new Set(botIds)];
    if (members.length === 0) throw new Error("A channel needs at least one member.");
    if (members.length > CHANNEL_LIMITS.members) {
      throw new Error(`A channel has at most ${CHANNEL_LIMITS.members} members.`);
    }
    if (members.some((botId) => !this.#botExists(botId))) throw new Error("This agent no longer exists.");
    return members;
  }

  #save(
    channels: WorkspaceChannel[],
    tasks: ChannelTask[],
    eventType: string,
    payload: DynamicRecord,
    extra: { messages?: ChannelMessage[]; memories?: ChannelMemory[]; forgotten?: ChannelMemory[] } = {},
  ): void {
    const occurredAt = this.#isoNow();
    this.#database.dispatch(
      `${eventType}:${randomUUID()}`,
      [
        {
          aggregateType: tasks.length > 0 && channels.length === 0 ? "channel-task" : "channel",
          aggregateId: channels[0]?.id ?? tasks[0]?.id ?? "channels",
          eventType,
          // COSGRAL W2: a forgotten memory is named by id only, so its text stays out of the log.
          payload: {
            ...payload,
            channels,
            tasks,
            ...(extra.messages ? { messages: extra.messages } : {}),
            ...(extra.memories ? { memories: extra.memories } : {}),
            ...(extra.forgotten ? { forgottenMemoryIds: extra.forgotten.map((memory) => memory.id) } : {}),
          },
          occurredAt,
        },
      ],
      (db, sequences) => {
        const sequence = sequences.at(-1) ?? 0;
        const upsertChannel = db.prepare(
          `INSERT INTO projection_channels (
             channel_id, name, title, instructions, lead_bot_id, member_bot_ids_json, isolated, archived,
             created_at, updated_at, last_event_sequence
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(channel_id) DO UPDATE SET
             title = excluded.title,
             instructions = excluded.instructions,
             lead_bot_id = excluded.lead_bot_id,
             member_bot_ids_json = excluded.member_bot_ids_json,
             isolated = excluded.isolated,
             archived = excluded.archived,
             updated_at = excluded.updated_at,
             last_event_sequence = excluded.last_event_sequence`,
        );
        for (const channel of channels) {
          upsertChannel.run(
            channel.id,
            channel.name,
            channel.title,
            channel.instructions,
            channel.leadBotId,
            JSON.stringify(channel.memberBotIds),
            channel.isolated ? 1 : 0,
            channel.archived ? 1 : 0,
            channel.createdAt,
            channel.updatedAt,
            sequence,
          );
        }
        const upsertTask = db.prepare(
          `INSERT INTO projection_channel_tasks (
             task_id, channel_id, owner_bot_id, state, title, request_message_id, result_message_id,
             parent_task_id, dependency_task_ids_json, resource_key, assignment_count, archived_at,
             created_at, updated_at, last_event_sequence
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(task_id) DO UPDATE SET
             owner_bot_id = excluded.owner_bot_id,
             state = excluded.state,
             result_message_id = excluded.result_message_id,
             assignment_count = excluded.assignment_count,
             dependency_task_ids_json = excluded.dependency_task_ids_json,
             resource_key = excluded.resource_key,
             archived_at = excluded.archived_at,
             updated_at = excluded.updated_at,
             last_event_sequence = excluded.last_event_sequence`,
        );
        for (const task of tasks) {
          upsertTask.run(
            task.id,
            task.channelId,
            task.ownerBotId,
            task.state,
            task.title,
            task.requestMessageId,
            task.resultMessageId,
            task.parentTaskId,
            JSON.stringify(task.dependencyTaskIds),
            task.resourceKey,
            task.assignmentCount,
            task.archivedAt,
            task.createdAt,
            task.updatedAt,
            sequence,
          );
          db.prepare(
            "INSERT INTO projection_channel_task_runtime(task_id, runtime_json) VALUES (?, ?) ON CONFLICT(task_id) DO UPDATE SET runtime_json = excluded.runtime_json",
          ).run(
            task.id,
            JSON.stringify({
              automaticAssignmentCount: task.automaticAssignmentCount,
              waitingForTaskIds: task.waitingForTaskIds,
              pauseReason: task.pauseReason,
              kind: task.kind,
              questionRootId: task.questionRootId,
            }),
          );
          if (
            [
              "channel-task.created",
              "channel-task.reassigned",
              "channel-task.continued",
              "channel-task.budget-reset",
              "channel-task.child-assigned",
            ].includes(eventType)
          ) {
            const assignment: ChannelAssignment = {
              id: randomUUID(),
              taskId: task.id,
              ownerBotId: task.ownerBotId,
              count: task.assignmentCount,
              reason: eventType,
              createdAt: occurredAt,
            };
            db.prepare("INSERT INTO projection_channel_assignments(task_id, data_json) VALUES (?, ?)").run(
              task.id,
              JSON.stringify(assignment),
            );
          }
        }
        for (const message of extra.messages ?? [])
          db.prepare(
            "INSERT INTO projection_channel_messages(message_id, channel_id, data_json) VALUES (?, ?, ?) ON CONFLICT(message_id) DO UPDATE SET data_json = excluded.data_json",
          ).run(message.id, message.channelId, JSON.stringify(message));
        for (const memory of extra.memories ?? []) {
          db.prepare(
            "INSERT INTO projection_channel_memories(memory_id, channel_id, data_json) VALUES (?, ?, ?) ON CONFLICT(memory_id) DO UPDATE SET data_json = excluded.data_json",
          ).run(memory.id, memory.channelId, JSON.stringify(memory));
          // COSGRAL W2: an edit replaces the text; only the newest event keeps it.
          if (eventType === "channel.memory-edited") purgeChannelMemoryHistory(db, memory.id, sequence);
        }
        for (const memory of extra.forgotten ?? []) {
          db.prepare("DELETE FROM projection_channel_memories WHERE memory_id = ? AND channel_id = ?").run(
            memory.id,
            memory.channelId,
          );
          // COSGRAL W2: a forgotten entry leaves no text in the event log.
          purgeChannelMemoryHistory(db, memory.id, sequence);
        }
        return null;
      },
    );
    if (channels.length) this.emit("event", { type: "channels-changed", channels: this.list() });
    // COSGRAL W2: every change of a channel's memory, by an agent or a person.
    for (const memory of extra.memories ?? [])
      this.emit("event", { type: "channel-memory-changed", channelId: memory.channelId, action: "saved", memory });
    for (const memory of extra.forgotten ?? [])
      this.emit("event", { type: "channel-memory-changed", channelId: memory.channelId, action: "deleted", memory });
    for (const message of extra.messages ?? [])
      this.emit("event", { type: message.superseded ? "channel-message-changed" : "channel-message", message });
    for (const task of tasks) this.emit("event", { type: "task-changed", task: this.getTask(task.id) });
  }

  #isoNow(): string {
    return this.#now().toISOString();
  }
}

const CHANNEL_SELECT = `SELECT channel_id, name, title, instructions, lead_bot_id, member_bot_ids_json, isolated, archived,
  created_at, updated_at FROM projection_channels`;

const TASK_SELECT = `SELECT task_id, channel_id, owner_bot_id, state, title, request_message_id, result_message_id,
  parent_task_id, dependency_task_ids_json, resource_key, assignment_count, archived_at, created_at, updated_at
  , runtime_json FROM projection_channel_tasks LEFT JOIN projection_channel_task_runtime USING(task_id)`;

function channelName(value: string): string {
  const name = value.trim();
  if (!isChannelName(name)) {
    throw new Error(`A channel name has 1–${CHANNEL_LIMITS.name} lowercase letters, digits or dashes.`);
  }
  return name;
}

function channelTitle(value: string): string {
  const title = value.trim();
  if (title.length > CHANNEL_LIMITS.title)
    throw new Error(`A channel title has at most ${CHANNEL_LIMITS.title} characters.`);
  return title;
}

function channelInstructions(value: string): string {
  if (value.length > CHANNEL_LIMITS.instructions) {
    throw new Error(`Channel instructions have at most ${CHANNEL_LIMITS.instructions} characters.`);
  }
  return value.trim();
}

/** A short, one-line title from the request text. */
function taskTitle(value: string): string {
  const line = value.replace(/\s+/g, " ").trim() || "Task";
  return line.length > CHANNEL_LIMITS.taskTitle ? `${line.slice(0, CHANNEL_LIMITS.taskTitle - 1)}…` : line;
}

function rows(value: unknown): DynamicRecord[] {
  if (!Array.isArray(value)) throw new Error("Invalid SQLite result set.");
  return value.map((row) => {
    if (!isDynamicRecord(row)) throw new Error("Invalid channel row.");
    return row;
  });
}

function jsonColumn<T>(row: DynamicRecord, guard: (value: unknown) => value is T): T {
  const value = JSON.parse(text(row, "data_json"));
  if (!guard(value)) throw new Error("Invalid channel data column.");
  return value;
}

function stringList(value: unknown): string[] {
  if (!isString(value)) throw new Error("Invalid channel list column.");
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every(isString)) throw new Error("Invalid channel list column.");
  return parsed;
}

function text(row: DynamicRecord, key: string): string {
  const value = row[key];
  if (!isString(value)) throw new Error(`Invalid channel column ${key}.`);
  return value;
}

function optionalText(row: DynamicRecord, key: string): string | null {
  const value = row[key];
  if (value === null || isString(value)) return value;
  throw new Error(`Invalid channel column ${key}.`);
}

function flag(row: DynamicRecord, key: string): boolean {
  const value = row[key];
  if (value !== 0 && value !== 1) throw new Error(`Invalid channel column ${key}.`);
  return value === 1;
}

function channelFromRow(row: DynamicRecord): WorkspaceChannel {
  return {
    id: text(row, "channel_id"),
    name: text(row, "name"),
    title: text(row, "title"),
    instructions: text(row, "instructions"),
    leadBotId: optionalText(row, "lead_bot_id"),
    memberBotIds: stringList(row.member_bot_ids_json),
    isolated: flag(row, "isolated"),
    archived: flag(row, "archived"),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

function taskFromRow(row: DynamicRecord): ChannelTask {
  const state = row.state;
  const assignmentCount = row.assignment_count;
  if (!isChannelTaskState(state) || !isNumber(assignmentCount)) throw new Error("Invalid channel task row.");
  return {
    id: text(row, "task_id"),
    channelId: text(row, "channel_id"),
    ownerBotId: text(row, "owner_bot_id"),
    state,
    title: text(row, "title"),
    requestMessageId: text(row, "request_message_id"),
    resultMessageId: optionalText(row, "result_message_id"),
    parentTaskId: optionalText(row, "parent_task_id"),
    dependencyTaskIds: stringList(row.dependency_task_ids_json),
    resourceKey: optionalText(row, "resource_key"),
    assignmentCount,
    archivedAt: optionalText(row, "archived_at"),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
    ...(isString(row.runtime_json) ? JSON.parse(row.runtime_json) : {}),
  };
}

export const ASSIGNMENT_LIMIT_REASON = `Automatic assignment limit (${CHANNEL_LIMITS.automaticAssignments}) reached. A human can resume or reassign this task.`;

/** Canonical keys are stable across Windows spelling/case and trailing separators. */
export function channelResourceKey(value?: string | null): string | null {
  if (value == null || value === "") return null;
  if (value === "browser") return value;
  if (!value.startsWith("workspace:")) throw new Error("A resource must be browser or workspace:<absolute path>.");
  const path = value.slice("workspace:".length);
  if (win32.isAbsolute(path) && (/^[a-z]:[\\/]/i.test(path) || path.startsWith("\\\\"))) {
    const normalized = win32.normalize(path).toLowerCase();
    return `workspace:${normalized.length > win32.parse(normalized).root.length ? normalized.replace(/[\\/]+$/, "") : normalized}`;
  }
  if (posix.isAbsolute(path)) return `workspace:${posix.normalize(path).replace(/\/$/, "") || "/"}`;
  throw new Error("A workspace resource requires an absolute path.");
}
