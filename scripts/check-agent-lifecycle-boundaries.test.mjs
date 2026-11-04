import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentLifecycleWriteViolations, scanAgentLifecycleBoundaries } from "./check-agent-lifecycle-boundaries.mjs";
const source = body => `import { agents as records } from "@paperclipai/db"; ${body}`;
test("finds inserts, deletes, and lifecycle writes through an import alias", () => {
  for (const body of ["db.insert(records).values(input)", "db.delete(records)", "db.update(records).set({ lifecycleState: 'ready' })", "db.update(records).set({ pauseReason })"]) {
    assert.equal(agentLifecycleWriteViolations(source(body)).length, 1);
  }
});
test("permits configuration writes and guards execution status writes", () => {
  assert.deepEqual(agentLifecycleWriteViolations(source("db.update(records).set({ name })")), []);
  assert.equal(agentLifecycleWriteViolations(source("db.update(records).set({ status: 'idle' })")).length, 1);
  assert.deepEqual(agentLifecycleWriteViolations(source('db.update(records).set({ status: "idle" }).where(eq(records.lifecycleState, "ready"))')), []);
});

test("execution configuration writes must use lifecycle invalidation", () => {
  for (const field of ["adapterType", "adapterConfig", "runtimeConfig", "defaultEnvironmentId"]) {
    assert.equal(agentLifecycleWriteViolations(source(`db.update(records).set({ ${field}: value })`)).length, 1);
  }
});

test("offline seed quarantine can disable timers but cannot change lifecycle state", () => {
  const file = "cli/src/commands/worktree.ts";
  assert.deepEqual(agentLifecycleWriteViolations(source("db.update(records).set({ runtimeConfig })"), file), []);
  assert.equal(agentLifecycleWriteViolations(source("db.update(records).set({ lifecycleState: 'ready' })"), file).length, 1);
});

test("offline seed quarantine handles Windows path separators", () => {
  const file = "cli\\src\\commands\\worktree.ts";
  assert.deepEqual(agentLifecycleWriteViolations(source("db.update(records).set({ runtimeConfig })"), file), []);
});

test("rejects agent deletion outside the module even with a terminal state guard", () => {
  assert.equal(agentLifecycleWriteViolations(source('db.delete(records).where(and(eq(records.id, id), inArray(records.lifecycleState, ["terminated", "rejected"])))')).length, 1);
  assert.equal(agentLifecycleWriteViolations(source('db.delete(records).where(inArray(records.lifecycleState, ["ready", "terminated"]))')).length, 1);
});

test("fixture suffix cannot bypass production lifecycle checks", () => {
  const root = mkdtempSync(join(tmpdir(), "cosgral-boundaries-"));
  try {
    for (const directory of ["server/src", "server/scripts", "cli/src", "packages/db/src"]) {
      mkdirSync(join(root, directory), { recursive: true });
    }
    const write = source("db.update(records).set({ lifecycleState: 'ready' })");
    writeFileSync(join(root, "server/src/unsafe-fixture.ts"), write);
    writeFileSync(join(root, "server/scripts/unknown-fixture.ts"), write);
    writeFileSync(join(root, "server/scripts/cosgral-roles-fixture.ts"), write);
    const violations = scanAgentLifecycleBoundaries(root);
    assert.equal(violations.length, 2);
    assert.ok(violations.some(entry => entry.startsWith("server/src/unsafe-fixture.ts:")));
    assert.ok(violations.some(entry => entry.startsWith("server/scripts/unknown-fixture.ts:")));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
