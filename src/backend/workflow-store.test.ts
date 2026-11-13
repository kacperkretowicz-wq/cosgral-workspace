// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Workflow, WorkflowRun } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { WorkflowStore } from "./workflow-store";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function open(root?: string) {
  const directory = root ?? (await mkdtemp(join(tmpdir(), "cosgral-workflow-store-")));
  if (!root) roots.push(directory);
  const database = testDatabase(directory);
  await database.initialize();
  return { root: directory, store: new WorkflowStore(database) };
}

function workflow(id: string, createdAt = "2026-11-13T12:00:00.000Z"): Workflow {
  return {
    id,
    name: `Workflow ${id}`,
    description: "",
    nodes: [
      { id: "start", type: "trigger", title: "Start", x: 0, y: 0, trigger: { kind: "manual" } },
      { id: "ask", type: "agent", title: "Ask", x: 200, y: 0, botId: "chief", prompt: "Say hi." },
    ],
    edges: [{ id: "e1", from: "start", to: "ask", on: "next" }],
    paused: false,
    createdAt,
    updatedAt: createdAt,
    lastRun: null,
  };
}

function run(id: string, workflowId: string, startedAt: string, status: WorkflowRun["status"] = "done"): WorkflowRun {
  return {
    id,
    workflowId,
    workflowName: `Workflow ${workflowId}`,
    cause: "manual",
    status,
    input: "",
    steps: [],
    result: null,
    error: null,
    startedAt,
    finishedAt: status === "running" || status === "waiting" ? null : startedAt,
  };
}

describe("WorkflowStore", () => {
  it("keeps workflows in the order they were created and returns what was saved", async () => {
    const { store } = await open();
    store.save(workflow("b", "2026-11-13T12:00:02.000Z"));
    store.save(workflow("a", "2026-11-13T12:00:01.000Z"));
    expect(store.list().map((item) => item.id)).toEqual(["a", "b"]);
    expect(store.get("a")).toEqual(workflow("a", "2026-11-13T12:00:01.000Z"));
    store.save({ ...workflow("a", "2026-11-13T12:00:01.000Z"), name: "Renamed", paused: true });
    expect(store.get("a")).toMatchObject({ name: "Renamed", paused: true });
    expect(store.list()).toHaveLength(2);
    expect(() => store.get("missing")).toThrow(/no longer exists/);
  });

  it("keeps workflows and runs after a restart", async () => {
    const first = await open();
    first.store.save(workflow("a"));
    first.store.saveRun(run("r1", "a", "2026-11-13T12:01:00.000Z"));
    closeTestDatabases();
    const second = await open(first.root);
    expect(second.store.list().map((item) => item.id)).toEqual(["a"]);
    expect(second.store.listRuns("a").map((item) => item.id)).toEqual(["r1"]);
  });

  it("lists runs newest first, updates one in place and keeps the last 100 per workflow", async () => {
    const { store } = await open();
    store.save(workflow("a"));
    store.save(workflow("b"));
    for (let index = 0; index < 105; index += 1) {
      const at = new Date(Date.UTC(2026, 10, 13, 12, 0, index)).toISOString();
      store.saveRun(run(`a-${index}`, "a", at));
    }
    store.saveRun(run("b-0", "b", "2026-11-13T11:00:00.000Z"));
    const kept = store.listRuns("a");
    expect(kept).toHaveLength(100);
    expect(kept[0]?.id).toBe("a-104");
    expect(kept.at(-1)?.id).toBe("a-5");
    expect(store.listRuns("b").map((item) => item.id)).toEqual(["b-0"]);

    store.saveRun({ ...run("a-104", "a", kept[0]?.startedAt ?? ""), status: "failed", error: "Boom" });
    expect(store.getRun("a-104")).toMatchObject({ status: "failed", error: "Boom" });
    expect(store.listRuns("a")).toHaveLength(100);
    expect(() => store.getRun("nope")).toThrow(/no longer exists/);
  });

  it("finds the runs that were open and removes a workflow together with its runs", async () => {
    const { store } = await open();
    store.save(workflow("a"));
    store.saveRun(run("r1", "a", "2026-11-13T12:01:00.000Z", "running"));
    store.saveRun(run("r2", "a", "2026-11-13T12:02:00.000Z", "waiting"));
    store.saveRun(run("r3", "a", "2026-11-13T12:03:00.000Z", "done"));
    expect(
      store
        .openRuns()
        .map((item) => item.id)
        .sort(),
    ).toEqual(["r1", "r2"]);
    store.remove("a");
    expect(store.list()).toEqual([]);
    expect(store.listRuns("a")).toEqual([]);
    expect(() => store.remove("a")).toThrow(/no longer exists/);
  });
});
