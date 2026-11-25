// COSGRAL W12 (BE-R): routines of a CHANNEL (contract: ipc-channel-routines.ts). The store keeps them (and the history of their runs) in the
// local database; the service plans the starts with the same code as the routines of an agent (`nextRunAfter`), and at the planned time sends
// the routine's prompt to the channel as a message of the person: the channel's lead gets it as a task like any other request. A run that
// cannot start is written down as "skipped" with the reason (archived channel, no lead, the previous run still going, program was off);
// missed runs are not made up. The state of the task of a run is read live, so the history says how each run ended.
//
// The service knows nothing of channels or tasks except through four small ports, so it is tested without the program.

import { randomUUID } from "node:crypto";
import {
  type AgentEvent,
  CHANNEL_ROUTINE_LIMITS,
  type ChannelRoutine,
  type ChannelRoutineRun,
  type ChannelRoutineWebhook,
  type ChannelTaskState,
  channelRoutineChannelProblem,
  channelRoutineMessage,
  channelRoutineProblem,
  isChannelRoutine,
  isChannelRoutineRun,
  parseChannelRoutineIdInput,
  parseCreateChannelRoutineInput,
  parseListChannelRoutinesInput,
  parseUpdateChannelRoutineInput,
  ROUTINE_LIMITS,
  type WorkspaceChannel,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import type { SecretBox } from "./mcp-store";
import type { OpenBotDatabase } from "./openbot-database";
import type { WebhookAnswer } from "./routine-manager";
import { checkSchedule, isTimeZone, nextRunAfter } from "./routine-schedule";
import { newWebhookSecret, verifyWebhook } from "./webhook-signature";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projection_channel_routines (
    routine_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    data_json TEXT NOT NULL CHECK(json_valid(data_json)),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS channel_routines_channel ON projection_channel_routines(channel_id, created_at);
  CREATE TABLE IF NOT EXISTS projection_channel_routine_runs (
    run_id TEXT PRIMARY KEY,
    routine_id TEXT NOT NULL,
    at TEXT NOT NULL,
    data_json TEXT NOT NULL CHECK(json_valid(data_json))
  );
  CREATE INDEX IF NOT EXISTS channel_routine_runs_routine ON projection_channel_routine_runs(routine_id, at);
  CREATE TABLE IF NOT EXISTS projection_channel_routine_secrets (
    routine_id TEXT PRIMARY KEY,
    secret_encrypted TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_channel_routine_deliveries (
    routine_id TEXT NOT NULL,
    delivery_id TEXT NOT NULL,
    at TEXT NOT NULL,
    PRIMARY KEY (routine_id, delivery_id)
  );
`;

/** Characters of a delivery's body passed on to the lead with the routine's prompt (the receiver takes at most ROUTINE_LIMITS.webhookBody). */
const WEBHOOK_TEXT_LIMIT = 2_000;
/** Delivery ids kept per routine to refuse a repeat. */
const DELIVERIES_KEPT = 200;

function parseRow<T>(row: unknown, guard: (value: unknown) => value is T): T {
  if (!isDynamicRecord(row) || !isString(row.data_json)) throw new Error("Invalid routine row.");
  const value = JSON.parse(row.data_json);
  if (!guard(value)) throw new Error("Invalid routine row.");
  return value;
}

export class ChannelRoutineStore {
  readonly #database: OpenBotDatabase;
  readonly #box: SecretBox | null;
  #ready = false;

  /** `box` encrypts the webhook secrets (Electron safeStorage in the program); without one a webhook cannot be turned on. */
  constructor(database: OpenBotDatabase, box: SecretBox | null = null) {
    this.#database = database;
    this.#box = box;
  }

  /** Saves (or with null forgets) the signing secret of a routine, encrypted. */
  setSecret(routineId: string, secret: string | null): void {
    const db = this.#db();
    if (secret === null) {
      db.prepare("DELETE FROM projection_channel_routine_secrets WHERE routine_id = ?").run(routineId);
      return;
    }
    if (!this.#box?.canEncrypt()) {
      throw new Error(
        "The webhook secret cannot be stored safely on this computer: system encryption is not available.",
      );
    }
    db.prepare(
      `INSERT INTO projection_channel_routine_secrets (routine_id, secret_encrypted) VALUES (?, ?)
       ON CONFLICT(routine_id) DO UPDATE SET secret_encrypted = excluded.secret_encrypted`,
    ).run(routineId, this.#box.encrypt(secret));
  }

  getSecret(routineId: string): string | null {
    const row = this.#db()
      .prepare("SELECT secret_encrypted FROM projection_channel_routine_secrets WHERE routine_id = ?")
      .get(routineId);
    if (!isDynamicRecord(row) || !isString(row.secret_encrypted) || !this.#box) return null;
    try {
      return this.#box.decrypt(row.secret_encrypted);
    } catch {
      return null;
    }
  }

  /** True the first time a delivery id is seen for a routine (a repeat is answered without a second run). */
  rememberDelivery(routineId: string, deliveryId: string, at: Date): boolean {
    const db = this.#db();
    const added = db
      .prepare(
        "INSERT OR IGNORE INTO projection_channel_routine_deliveries (routine_id, delivery_id, at) VALUES (?, ?, ?)",
      )
      .run(routineId, deliveryId, at.toISOString());
    db.prepare(
      `DELETE FROM projection_channel_routine_deliveries WHERE routine_id = ? AND delivery_id NOT IN (
         SELECT delivery_id FROM projection_channel_routine_deliveries WHERE routine_id = ? ORDER BY at DESC LIMIT ?)`,
    ).run(routineId, routineId, DELIVERIES_KEPT);
    return Number(added.changes) > 0;
  }

  /** The routine, or null when there is none with this id (the receiver then asks the routines of agents). */
  find(routineId: string): ChannelRoutine | null {
    const row = this.#db()
      .prepare("SELECT data_json FROM projection_channel_routines WHERE routine_id = ?")
      .get(routineId);
    return row ? parseRow(row, isChannelRoutine) : null;
  }

  #db() {
    const connection = this.#database.connection;
    if (!this.#ready) {
      connection.exec(SCHEMA);
      this.#ready = true;
    }
    return connection;
  }

  /** Oldest first; one channel's routines when given. */
  list(channelId?: string): ChannelRoutine[] {
    const db = this.#db();
    const found =
      channelId === undefined
        ? db.prepare("SELECT data_json FROM projection_channel_routines ORDER BY created_at, rowid").all()
        : db
            .prepare(
              "SELECT data_json FROM projection_channel_routines WHERE channel_id = ? ORDER BY created_at, rowid",
            )
            .all(channelId);
    return found.map((row) => parseRow(row, isChannelRoutine));
  }

  get(routineId: string): ChannelRoutine {
    const row = this.#db()
      .prepare("SELECT data_json FROM projection_channel_routines WHERE routine_id = ?")
      .get(routineId);
    if (!row) throw new Error("This routine no longer exists.");
    return parseRow(row, isChannelRoutine);
  }

  count(channelId: string): number {
    const row = this.#db()
      .prepare("SELECT COUNT(*) AS n FROM projection_channel_routines WHERE channel_id = ?")
      .get(channelId);
    return isDynamicRecord(row) && isNumber(row.n) ? row.n : 0;
  }

  save(routine: ChannelRoutine): void {
    this.#db()
      .prepare(
        `INSERT INTO projection_channel_routines (routine_id, channel_id, data_json, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(routine_id) DO UPDATE SET channel_id = excluded.channel_id, data_json = excluded.data_json`,
      )
      .run(routine.id, routine.channelId, JSON.stringify(routine), routine.createdAt);
  }

  remove(routineId: string): void {
    const db = this.#db();
    db.prepare("DELETE FROM projection_channel_routine_runs WHERE routine_id = ?").run(routineId);
    db.prepare("DELETE FROM projection_channel_routine_secrets WHERE routine_id = ?").run(routineId);
    db.prepare("DELETE FROM projection_channel_routine_deliveries WHERE routine_id = ?").run(routineId);
    db.prepare("DELETE FROM projection_channel_routines WHERE routine_id = ?").run(routineId);
  }

  /** Adds one entry to the history of a routine and drops the oldest ones over the limit. */
  addRun(run: ChannelRoutineRun): void {
    const db = this.#db();
    db.prepare(
      "INSERT INTO projection_channel_routine_runs (run_id, routine_id, at, data_json) VALUES (?, ?, ?, ?)",
    ).run(run.id, run.routineId, run.at, JSON.stringify(run));
    db.prepare(
      `DELETE FROM projection_channel_routine_runs WHERE routine_id = ? AND run_id NOT IN (
         SELECT run_id FROM projection_channel_routine_runs WHERE routine_id = ? ORDER BY at DESC, rowid DESC LIMIT ?)`,
    ).run(run.routineId, run.routineId, CHANNEL_ROUTINE_LIMITS.runsKept);
  }

  /** Newest first. */
  runs(routineId: string): ChannelRoutineRun[] {
    return this.#db()
      .prepare(
        "SELECT data_json FROM projection_channel_routine_runs WHERE routine_id = ? ORDER BY at DESC, rowid DESC",
      )
      .all(routineId)
      .map((row) => parseRow(row, isChannelRoutineRun));
  }
}

export interface ChannelRoutineOptions {
  store: ChannelRoutineStore;
  /** The channel as it is now; null when it does not exist. */
  channel: (channelId: string) => Pick<WorkspaceChannel, "archived" | "leadBotId"> | null;
  /** Sends the text to the channel as a message of the person; the lead gets a task. Throws when the channel refuses. */
  send: (channelId: string, text: string) => { messageId: string; taskId: string };
  /** The state of a task now; null when it is gone. */
  taskState: (taskId: string) => ChannelTaskState | null;
  emit: (event: AgentEvent) => void;
  now?: () => Date;
  /** The time zone of this computer (default: the system's). */
  timeZone?: () => string;
  /** Runs `run` after `ms`; the answer stops it. Default: a timer that does not keep the program open. */
  after?: (ms: number, run: () => void) => () => void;
  /** How often the planned starts are looked at (default 30 s). */
  tickMs?: number;
  /** The base address of the local webhook receiver (`http://127.0.0.1:<port>`), or null while it is not listening. */
  webhookBase?: () => string | null;
}

/** A start missed by more than this (the program was off) is written down as skipped, not made up. */
const MISSED_AFTER_MS = 60_000;
const STILL_GOING: readonly ChannelTaskState[] = ["queued", "running", "waiting"];

function defaultAfter(ms: number, run: () => void): () => void {
  const timer = setTimeout(run, ms);
  timer.unref();
  return () => clearTimeout(timer);
}

export class ChannelRoutineService {
  readonly #o: ChannelRoutineOptions;
  #stop: (() => void) | null = null;
  #running = false;

  constructor(options: ChannelRoutineOptions) {
    this.#o = options;
  }

  #now(): Date {
    return this.#o.now?.() ?? new Date();
  }

  list(raw?: unknown): ChannelRoutine[] {
    return this.#o.store.list(parseListChannelRoutinesInput(raw).channelId);
  }

  create(raw: unknown): ChannelRoutine {
    const input = parseCreateChannelRoutineInput(raw);
    const problem = channelRoutineProblem(
      input,
      this.#o.channel(input.channelId),
      this.#o.store.count(input.channelId),
    );
    if (problem) throw new Error(problem);
    const timezone = input.timezone ?? this.#zone();
    this.#checkWhen(input.schedule, timezone);
    const now = this.#now().toISOString();
    const paused = input.paused ?? false;
    const routine: ChannelRoutine = {
      id: randomUUID(),
      channelId: input.channelId,
      name: input.name,
      prompt: input.prompt,
      schedule: input.schedule,
      timezone,
      paused,
      nextRunAt: paused ? null : this.#next(input.schedule, timezone),
      lastRunAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.#o.store.save(routine);
    this.#announce(routine.channelId);
    return routine;
  }

  update(raw: unknown): ChannelRoutine {
    const patch = parseUpdateChannelRoutineInput(raw);
    const current = this.#o.store.get(patch.routineId);
    const schedule = patch.schedule ?? current.schedule;
    const timezone = patch.timezone ?? current.timezone;
    const paused = patch.paused ?? current.paused;
    if (patch.schedule !== undefined || patch.timezone !== undefined) this.#checkWhen(schedule, timezone);
    const planChanged = patch.schedule !== undefined || patch.timezone !== undefined || patch.paused !== undefined;
    const routine: ChannelRoutine = {
      ...current,
      name: patch.name ?? current.name,
      prompt: patch.prompt ?? current.prompt,
      schedule,
      timezone,
      paused,
      nextRunAt: !planChanged ? current.nextRunAt : paused ? null : this.#next(schedule, timezone),
      updatedAt: this.#now().toISOString(),
    };
    this.#o.store.save(routine);
    this.#announce(routine.channelId);
    return routine;
  }

  delete(raw: unknown): void {
    const routine = this.#o.store.get(parseChannelRoutineIdInput(raw).routineId);
    this.#o.store.remove(routine.id);
    this.#announce(routine.channelId);
  }

  /** "Run now": starts the routine outside the schedule (the next planned start does not move). A refusal is an error with the reason. */
  runNow(raw: unknown): ChannelRoutineRun {
    const routine = this.#o.store.get(parseChannelRoutineIdInput(raw).routineId);
    const run = this.#fire(routine, "manual");
    if (run.outcome === "skipped") throw new Error(run.reason ?? "The routine could not start.");
    return run;
  }

  /** Turns the webhook on, or gives a new secret when it is on (the old secret stops working at once). The secret is shown this once. */
  enableWebhook(raw: unknown): ChannelRoutineWebhook {
    const routine = this.#o.store.get(parseChannelRoutineIdInput(raw).routineId);
    const base = this.#o.webhookBase?.() ?? null;
    if (!base) throw new Error("The webhook receiver is not running. Turn on webhooks in the server settings first.");
    const secret = newWebhookSecret();
    this.#o.store.setSecret(routine.id, secret);
    const enabled: ChannelRoutine = { ...routine, webhookEnabled: true, updatedAt: this.#now().toISOString() };
    this.#o.store.save(enabled);
    this.#announce(enabled.channelId);
    return { routine: enabled, url: `${base}/webhooks/${enabled.id}`, secret };
  }

  /** Turns the webhook off and forgets its secret. */
  disableWebhook(raw: unknown): ChannelRoutine {
    const routine = this.#o.store.get(parseChannelRoutineIdInput(raw).routineId);
    this.#o.store.setSecret(routine.id, null);
    const disabled: ChannelRoutine = { ...routine, webhookEnabled: false, updatedAt: this.#now().toISOString() };
    this.#o.store.save(disabled);
    this.#announce(disabled.channelId);
    return disabled;
  }

  /**
   * A delivery from the local receiver (Standard Webhooks headers). null = no routine of a channel has this id (the receiver then asks the
   * routines of agents). A started run sends the prompt to the channel with the start of the body, so the lead knows what came in.
   */
  handleWebhook(
    routineId: string,
    headers: { id: string; timestamp: string; signature: string },
    body: Buffer,
  ): WebhookAnswer | null {
    const routine = this.#o.store.find(routineId);
    if (!routine) return null;
    if (routine.webhookEnabled !== true) return { status: 404, body: { error: "unknown routine" } };
    if (body.length > ROUTINE_LIMITS.webhookBody) return { status: 413, body: { error: "body too large" } };
    const secret = this.#o.store.getSecret(routine.id);
    if (!secret) return { status: 401, body: { error: "no signing secret yet" } };
    const verified = verifyWebhook(secret, headers, body, this.#now().getTime());
    if (!verified.ok) return { status: 401, body: { error: verified.reason } };
    if (!this.#o.store.rememberDelivery(routine.id, headers.id, this.#now())) {
      return { status: 200, body: { status: "duplicate" } };
    }
    if (routine.paused) {
      const run = this.#record(
        routine,
        "webhook",
        "skipped",
        "The routine is paused.",
        null,
        this.#now().toISOString(),
      );
      this.#announce(routine.channelId);
      return { status: 202, body: { status: "ignored", runId: run.id } };
    }
    const text = body.toString("utf8").trim();
    const run = this.#fire(
      routine,
      "webhook",
      text.length > WEBHOOK_TEXT_LIMIT ? `${text.slice(0, WEBHOOK_TEXT_LIMIT)}…` : text,
    );
    return { status: 202, body: { status: run.outcome === "started" ? "accepted" : "skipped", runId: run.id } };
  }

  listRuns(raw: unknown): ChannelRoutineRun[] {
    const routine = this.#o.store.get(parseChannelRoutineIdInput(raw).routineId);
    return this.#o.store.runs(routine.id).map((run) => this.#withState(run));
  }

  /** At the start of the program: planned starts that passed while it was off are written down as skipped; then the planner runs. */
  start(): void {
    const now = this.#now();
    for (const routine of this.#o.store.list()) {
      if (routine.paused || !routine.nextRunAt) continue;
      if (now.getTime() - Date.parse(routine.nextRunAt) <= MISSED_AFTER_MS) continue;
      this.#record(routine, "schedule", "skipped", "The program was off at the planned time.", null, routine.nextRunAt);
      this.#save({
        ...routine,
        lastRunAt: routine.nextRunAt,
        nextRunAt: this.#next(routine.schedule, routine.timezone),
      });
      this.#announce(routine.channelId);
    }
    this.#arm();
  }

  dispose(): void {
    this.#stop?.();
    this.#stop = null;
  }

  /** Starts every routine whose planned time has come. Public so a test (or the timer) can ask for it. */
  tick(): void {
    if (this.#running) return;
    this.#running = true;
    try {
      const now = this.#now().getTime();
      for (const routine of this.#o.store.list()) {
        if (!routine.paused && routine.nextRunAt && Date.parse(routine.nextRunAt) <= now)
          this.#fire(routine, "schedule");
      }
    } finally {
      this.#running = false;
    }
  }

  #arm(): void {
    this.#stop?.();
    const after = this.#o.after ?? defaultAfter;
    this.#stop = after(this.#o.tickMs ?? 30_000, () => {
      this.#stop = null;
      this.tick();
      this.#arm();
    });
  }

  /** Starts one run (or writes down why not), moves the plan and tells the window. */
  #fire(routine: ChannelRoutine, cause: ChannelRoutineRun["cause"], delivery = ""): ChannelRoutineRun {
    const at = this.#now().toISOString();
    let reason: string | null = channelRoutineChannelProblem(this.#o.channel(routine.channelId));
    if (!reason && this.#stillGoing(routine.id)) reason = "The previous run is still going.";
    let sent: { messageId: string; taskId: string } | null = null;
    if (!reason) {
      try {
        const message = channelRoutineMessage(routine.name, routine.prompt);
        sent = this.#o.send(routine.channelId, delivery ? `${message}\n\nWebhook:\n${delivery}` : message);
      } catch (error) {
        reason = error instanceof Error ? error.message : "The project did not take the message.";
      }
    }
    const run = this.#record(routine, cause, sent ? "started" : "skipped", reason, sent, at);
    this.#save({
      ...routine,
      lastRunAt: at,
      nextRunAt:
        cause === "schedule"
          ? routine.paused
            ? null
            : this.#next(routine.schedule, routine.timezone)
          : routine.nextRunAt,
    });
    this.#announce(routine.channelId);
    return this.#withState(run);
  }

  #record(
    routine: ChannelRoutine,
    cause: ChannelRoutineRun["cause"],
    outcome: "started" | "skipped",
    reason: string | null,
    sent: { messageId: string; taskId: string } | null,
    at: string,
  ): ChannelRoutineRun {
    const run: ChannelRoutineRun = {
      id: randomUUID(),
      routineId: routine.id,
      at,
      cause,
      outcome,
      reason,
      messageId: sent?.messageId ?? null,
      taskId: sent?.taskId ?? null,
      taskState: null,
    };
    this.#o.store.addRun(run);
    return run;
  }

  #stillGoing(routineId: string): boolean {
    // The last run that really started (skips in between do not end it).
    const last = this.#o.store.runs(routineId).find((run) => run.outcome === "started" && run.taskId !== null);
    if (!last?.taskId) return false;
    const state = this.#o.taskState(last.taskId);
    return state !== null && STILL_GOING.includes(state);
  }

  #withState(run: ChannelRoutineRun): ChannelRoutineRun {
    return { ...run, taskState: run.taskId ? this.#o.taskState(run.taskId) : null };
  }

  #save(routine: ChannelRoutine): void {
    this.#o.store.save({ ...routine, updatedAt: this.#now().toISOString() });
  }

  #next(schedule: ChannelRoutine["schedule"], timezone: string): string | null {
    return nextRunAfter(schedule, timezone, this.#now())?.toISOString() ?? null;
  }

  #zone(): string {
    return this.#o.timeZone?.() ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  #checkWhen(schedule: ChannelRoutine["schedule"], timezone: string): void {
    if (!isTimeZone(timezone)) throw new Error("The time zone is a name like Europe/Warsaw.");
    checkSchedule(schedule);
  }

  #announce(channelId: string): void {
    this.#o.emit({ type: "channel-routines-changed", channelId, routines: this.#o.store.list(channelId) });
  }
}

/** What the program has: the channel store, the channel engine and the database. Builds the service so `main` needs one expression. */
export function createChannelRoutineService(deps: {
  database: OpenBotDatabase;
  /** Encrypts webhook secrets; without it a webhook cannot be turned on. */
  box?: SecretBox | null;
  webhookBase?: () => string | null;
  channels: { list: () => WorkspaceChannel[]; getTask: (taskId: string) => { state: ChannelTaskState } };
  engine: {
    sendMessage: (input: { channelId: string; text: string }) => { message: { id: string }; task: { id: string } };
  };
  emit: (event: AgentEvent) => void;
}): ChannelRoutineService {
  return new ChannelRoutineService({
    store: new ChannelRoutineStore(deps.database, deps.box ?? null),
    webhookBase: deps.webhookBase,
    channel: (channelId) => deps.channels.list().find((channel) => channel.id === channelId) ?? null,
    send: (channelId, text) => {
      const sent = deps.engine.sendMessage({ channelId, text });
      return { messageId: sent.message.id, taskId: sent.task.id };
    },
    taskState: (taskId) => {
      try {
        return deps.channels.getTask(taskId).state;
      } catch {
        return null;
      }
    },
    emit: deps.emit,
  });
}

/**
 * The handler of the local webhook receiver: a routine of a channel answers first (null = it has no routine with this id), then the
 * routines of agents. `channels` is read at each delivery, because the channel service starts after the receiver.
 */
export function routeWebhook(
  channels: () => Pick<ChannelRoutineService, "handleWebhook"> | null,
  agents: {
    handleWebhook: (
      routineId: string,
      headers: { id: string; timestamp: string; signature: string },
      body: Buffer,
    ) => Promise<WebhookAnswer>;
  },
): (
  routineId: string,
  headers: { id: string; timestamp: string; signature: string },
  body: Buffer,
) => Promise<WebhookAnswer> {
  return async (routineId, headers, body) =>
    channels()?.handleWebhook(routineId, headers, body) ?? agents.handleWebhook(routineId, headers, body);
}
