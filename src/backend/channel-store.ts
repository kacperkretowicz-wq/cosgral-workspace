// COSGRAL W1-BE2: channels with a lead agent, and their tasks, in the local database.
// Rules follow the Tester's description docs/cosgral/spec-w1-kanaly.md. This store only
// keeps data and enforces the rules; running agents on tasks is the channel engine's job.

import { randomUUID } from "node:crypto";
import {
  CHANNEL_LIMITS,
  type ChannelMemberInput,
  type ChannelTask,
  type ChannelTaskActionInput,
  type ChannelTaskState,
  type CreateWorkspaceChannelInput,
  isChannelName,
  isChannelTaskState,
  type ReassignChannelTaskInput,
  type UpdateWorkspaceChannelInput,
  type WorkspaceChannel,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
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

export class ChannelStore {
  readonly #database: OpenBotDatabase;
  readonly #now: () => Date;
  readonly #botExists: (botId: string) => boolean;

  constructor(database: OpenBotDatabase, options: ChannelStoreOptions = {}) {
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
                state: "queued",
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
        .prepare(`${TASK_SELECT} WHERE channel_id = ? ORDER BY created_at, rowid`)
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
      resourceKey: input.resourceKey?.trim() || null,
      assignmentCount: 1,
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
    const all = rows(this.#database.connection.prepare(`${TASK_SELECT} ORDER BY created_at, rowid`).all()).map(
      taskFromRow,
    );
    const byId = new Map(all.map((task) => [task.id, task]));
    const busy = new Set(
      all.flatMap((task) => (ACTIVE_STATES.includes(task.state) && task.resourceKey ? [task.resourceKey] : [])),
    );
    const startable: ChannelTask[] = [];
    for (const task of all) {
      if (task.state !== "queued" || task.archivedAt) continue;
      const ready = task.dependencyTaskIds.every((id) => byId.get(id)?.state === "done");
      const resourceFree = !task.resourceKey || !busy.has(task.resourceKey);
      if (task.resourceKey) busy.add(task.resourceKey);
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
    if (task.resultMessageId) throw new Error("This task already has a result.");
    if (!["queued", "running", "waiting"].includes(task.state)) throw new Error("This task is not running.");
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
  act(input: ChannelTaskActionInput): ChannelTask {
    switch (input.action) {
      case "stop":
        return this.#transition(input.taskId, OPEN_STATES, "cancelled", "This task is already finished.");
      case "pause":
        return this.#transition(input.taskId, ["queued", "running", "waiting"], "paused", "This task is not running.");
      case "resume":
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
  reassign(input: ReassignChannelTaskInput): ChannelTask {
    const task = this.getTask(input.taskId);
    const channel = this.get(task.channelId);
    if (!channel.memberBotIds.includes(input.ownerBotId)) {
      throw new Error("Only a member of the channel can own its tasks.");
    }
    if (FINISHED_STATES.includes(task.state)) throw new Error("This task is finished.");
    const updated: ChannelTask = {
      ...task,
      ownerBotId: input.ownerBotId,
      state: task.state === "paused" ? "paused" : "queued",
      assignmentCount: task.assignmentCount + 1,
      updatedAt: this.#isoNow(),
    };
    this.#save([], [updated], "channel-task.reassigned", { ...input });
    return this.getTask(task.id);
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

  #save(channels: WorkspaceChannel[], tasks: ChannelTask[], eventType: string, payload: DynamicRecord): void {
    const occurredAt = this.#isoNow();
    this.#database.dispatch(
      `${eventType}:${randomUUID()}`,
      [
        {
          aggregateType: tasks.length > 0 && channels.length === 0 ? "channel-task" : "channel",
          aggregateId: channels[0]?.id ?? tasks[0]?.id ?? "channels",
          eventType,
          payload: { ...payload },
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
        }
        return null;
      },
    );
  }

  #isoNow(): string {
    return this.#now().toISOString();
  }
}

const CHANNEL_SELECT = `SELECT channel_id, name, title, instructions, lead_bot_id, member_bot_ids_json, isolated, archived,
  created_at, updated_at FROM projection_channels`;

const TASK_SELECT = `SELECT task_id, channel_id, owner_bot_id, state, title, request_message_id, result_message_id,
  parent_task_id, dependency_task_ids_json, resource_key, assignment_count, archived_at, created_at, updated_at
  FROM projection_channel_tasks`;

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
  };
}
