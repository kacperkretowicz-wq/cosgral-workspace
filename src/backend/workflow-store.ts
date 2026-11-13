// COSGRAL W3: workflows (canvas graphs) and their run history in the local database.
import { randomUUID } from "node:crypto";
import { isWorkflow, isWorkflowRun, WORKFLOW_LIMITS, type Workflow, type WorkflowRun } from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import type { OpenBotDatabase } from "./openbot-database";

export class WorkflowStore {
  readonly #database: OpenBotDatabase;

  constructor(database: OpenBotDatabase) {
    this.#database = database;
  }

  /** Oldest first. */
  list(): Workflow[] {
    return rows(
      this.#database.connection.prepare("SELECT data_json FROM projection_workflows ORDER BY created_at, rowid").all(),
    ).map((row) => parse(row, isWorkflow));
  }

  get(workflowId: string): Workflow {
    const row = this.#database.connection
      .prepare("SELECT data_json FROM projection_workflows WHERE workflow_id = ?")
      .get(workflowId);
    if (!row) throw new Error("This workflow no longer exists.");
    return parse(asRow(row), isWorkflow);
  }

  /** Insert or replace one workflow. */
  save(workflow: Workflow): Workflow {
    this.#database.dispatch(
      `workflow:save:${randomUUID()}`,
      [
        {
          aggregateType: "workflow",
          aggregateId: workflow.id,
          eventType: "workflow.saved",
          payload: { workflowId: workflow.id },
        },
      ],
      (db, sequences) => {
        db.prepare(
          `INSERT INTO projection_workflows (workflow_id, data_json, created_at, updated_at, last_event_sequence)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(workflow_id) DO UPDATE SET data_json = excluded.data_json,
             updated_at = excluded.updated_at, last_event_sequence = excluded.last_event_sequence`,
        ).run(workflow.id, JSON.stringify(workflow), workflow.createdAt, workflow.updatedAt, sequences.at(-1) ?? 0);
        return null;
      },
    );
    return workflow;
  }

  remove(workflowId: string): void {
    this.get(workflowId);
    this.#database.dispatch(
      `workflow:remove:${randomUUID()}`,
      [{ aggregateType: "workflow", aggregateId: workflowId, eventType: "workflow.removed", payload: { workflowId } }],
      (db) => {
        db.prepare("DELETE FROM projection_workflows WHERE workflow_id = ?").run(workflowId);
        db.prepare("DELETE FROM projection_workflow_runs WHERE workflow_id = ?").run(workflowId);
        return null;
      },
    );
  }

  /** Newest first, at most WORKFLOW_LIMITS.runsKept. */
  listRuns(workflowId: string): WorkflowRun[] {
    return rows(
      this.#database.connection
        .prepare(
          "SELECT data_json FROM projection_workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC, rowid DESC",
        )
        .all(workflowId),
    ).map((row) => parse(row, isWorkflowRun));
  }

  getRun(runId: string): WorkflowRun {
    const row = this.#database.connection
      .prepare("SELECT data_json FROM projection_workflow_runs WHERE run_id = ?")
      .get(runId);
    if (!row) throw new Error("This workflow run no longer exists.");
    return parse(asRow(row), isWorkflowRun);
  }

  /** Runs that were still going (running or waiting for a decision), e.g. when the program stopped. */
  openRuns(): WorkflowRun[] {
    return rows(
      this.#database.connection
        .prepare("SELECT data_json FROM projection_workflow_runs WHERE status IN ('running', 'waiting')")
        .all(),
    ).map((row) => parse(row, isWorkflowRun));
  }

  saveRun(run: WorkflowRun): WorkflowRun {
    const db = this.#database.connection;
    db.prepare(
      `INSERT INTO projection_workflow_runs (run_id, workflow_id, started_at, status, data_json) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET status = excluded.status, data_json = excluded.data_json`,
    ).run(run.id, run.workflowId, run.startedAt, run.status, JSON.stringify(run));
    db.prepare(
      `DELETE FROM projection_workflow_runs WHERE workflow_id = ? AND run_id NOT IN (
         SELECT run_id FROM projection_workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC, rowid DESC LIMIT ?
       )`,
    ).run(run.workflowId, run.workflowId, WORKFLOW_LIMITS.runsKept);
    return run;
  }
}

function asRow(value: unknown): DynamicRecord {
  if (!isDynamicRecord(value)) throw new Error("Invalid workflow row.");
  return value;
}

function rows(value: unknown): DynamicRecord[] {
  if (!Array.isArray(value)) throw new Error("Invalid SQLite result set.");
  return value.map(asRow);
}

function parse<T>(row: DynamicRecord, guard: (value: unknown) => value is T): T {
  const text = row.data_json;
  if (!isString(text)) throw new Error("Invalid workflow data.");
  const value = JSON.parse(text);
  if (!guard(value)) throw new Error("Invalid workflow data.");
  return value;
}
