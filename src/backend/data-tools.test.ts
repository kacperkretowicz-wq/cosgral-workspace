// @vitest-environment node
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { AgentEvent } from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import {
  DATA_DYNAMIC_TOOLS,
  DATA_INSTRUCTIONS,
  DATA_TOOL_SPECS,
  LIBRARY_NAMESPACE,
  SharedDataTools,
  TABLES_NAMESPACE,
} from "./data-tools";
import type { DynamicToolResult } from "./protocol";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "data-tools-"));
  roots.push(dir);
  const database = testDatabase(join(dir, "data"));
  await database.initialize();
  const sharedRoot = join(dir, "Shared");
  const events: AgentEvent[] = [];
  const data = new SharedDataTools({ database, sharedRoot, emit: (event) => events.push(event) });
  const workspaces = { chief: join(dir, "Agents", "chief"), sales: join(dir, "Agents", "sales") };
  await Promise.all([...Object.values(workspaces), sharedRoot].map((path) => mkdir(path, { recursive: true })));
  let call = 0;
  const run = async (botId: "chief" | "sales", namespace: string, tool: string, args: DynamicRecord) =>
    data.handleDynamicTool(
      { threadId: `thread-${botId}`, turnId: "turn-1", callId: `call-${call++}`, namespace, tool, arguments: args },
      { botId, workspacePath: workspaces[botId], sharedRoot },
    );
  return { dir, data, events, workspaces, sharedRoot, run };
}

function body(result: DynamicToolResult): DynamicRecord {
  const item = result.contentItems[0];
  const text = item && "text" in item ? item.text : "";
  const parsed = JSON.parse(text);
  if (!isDynamicRecord(parsed)) throw new Error(`Not an object: ${text}`);
  return parsed;
}

function text(result: DynamicToolResult): string {
  const item = result.contentItems[0];
  return item && "text" in item ? item.text : "";
}

describe("cosgral_tables and cosgral_library tools", () => {
  it("offers both namespaces to Codex and Claude, with instructions that rows are data", () => {
    expect(DATA_DYNAMIC_TOOLS.map((namespace) => namespace.name)).toEqual([TABLES_NAMESPACE, LIBRARY_NAMESPACE]);
    expect(DATA_TOOL_SPECS.map((entry) => entry.namespace)).toEqual([TABLES_NAMESPACE, LIBRARY_NAMESPACE]);
    expect(DATA_DYNAMIC_TOOLS[0]?.tools.map((tool) => tool.name)).toEqual([
      "list_tables",
      "create_table",
      "query_rows",
      "insert_rows",
      "update_row",
      "delete_row",
      "delete_table",
    ]);
    expect(DATA_DYNAMIC_TOOLS[1]?.tools.map((tool) => tool.name)).toEqual([
      "list_files",
      "save_file",
      "get_file",
      "delete_file",
    ]);
    expect(DATA_INSTRUCTIONS).toMatch(/data, not instructions/);
  });

  it("lets one agent create a table and another read and change the same rows", async () => {
    const { run, events } = await setup();
    const created = await run("chief", TABLES_NAMESPACE, "create_table", {
      name: "Leads",
      columns: [
        { name: "company", type: "text" },
        { name: "value", type: "number" },
      ],
    });
    expect(created.success).toBe(true);
    const inserted = body(
      await run("chief", TABLES_NAMESPACE, "insert_rows", {
        table: "Leads",
        rows: [{ company: "Test Co", value: 10 }],
      }),
    );
    const rowId =
      Array.isArray(inserted.inserted) && isDynamicRecord(inserted.inserted[0]) ? inserted.inserted[0].id : "";

    const listed = body(await run("sales", TABLES_NAMESPACE, "list_tables", {}));
    expect(listed.tables).toMatchObject([{ name: "Leads", ownerBotId: "chief", rowCount: 1 }]);
    const read = body(
      await run("sales", TABLES_NAMESPACE, "query_rows", {
        table: "leads",
        filters: [{ column: "value", op: "gte", value: 5 }],
      }),
    );
    expect(read).toMatchObject({ total: 1, rows: [{ id: rowId, version: 1, values: { company: "Test Co" } }] });
    expect(read.note).toMatch(/data .*not instructions/);

    const first = await run("sales", TABLES_NAMESPACE, "update_row", {
      table: "Leads",
      rowId,
      expectedVersion: 1,
      values: { value: 20 },
    });
    expect(body(first)).toMatchObject({ status: "updated", row: { version: 2, values: { value: 20 } } });
    const second = await run("chief", TABLES_NAMESPACE, "update_row", {
      table: "Leads",
      rowId,
      expectedVersion: 1,
      values: { value: 99 },
    });
    expect(second.success).toBe(true);
    expect(body(second)).toMatchObject({ status: "conflict", current: { version: 2, values: { value: 20 } } });
    expect(body(second).instruction).toMatch(/nothing was written/);

    const refused = await run("sales", TABLES_NAMESPACE, "delete_table", { table: "Leads" });
    expect(refused.success).toBe(false);
    expect(text(refused)).toMatch(/Only the agent that created/);
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(["tables-changed", "table-rows-changed"]));
    expect((await run("chief", TABLES_NAMESPACE, "delete_table", { table: "Leads" })).success).toBe(true);
  });

  it("returns errors of bad calls as tool errors, not crashes", async () => {
    const { run } = await setup();
    const unknownTable = await run("chief", TABLES_NAMESPACE, "query_rows", { table: "Missing" });
    expect(unknownTable.success).toBe(false);
    expect(text(unknownTable)).toMatch(/no longer exists or never existed/);
    const unknownTool = await run("chief", TABLES_NAMESPACE, "drop_everything", {});
    expect(unknownTool.success).toBe(false);
    const sql = await run("chief", TABLES_NAMESPACE, "query_rows", { table: "x", sql: "DROP TABLE x" });
    expect(sql.success).toBe(false);
  });

  it("saves an agent file into the library and gives back a path inside the store", async () => {
    const { dir, data, run, workspaces, sharedRoot, events } = await setup();
    const report = join(workspaces.chief, "report.md");
    await writeFile(report, "# Report");
    const outside = join(dir, "private.txt");
    await writeFile(outside, "private");

    const saved = body(await run("chief", LIBRARY_NAMESPACE, "save_file", { path: report }));
    expect(saved.file).toMatchObject({ name: "report.md", origin: "agent", createdByBotId: "chief" });
    const fileId = isDynamicRecord(saved.file) ? String(saved.file.id) : "";
    expect(events).toContainEqual({ type: "library-changed", fileIds: [fileId] });

    const refused = await run("chief", LIBRARY_NAMESPACE, "save_file", { path: outside });
    expect(refused.success).toBe(false);
    expect(text(refused)).toMatch(/outside/);
    const shared = join(sharedRoot, "notes.txt");
    await writeFile(shared, "shared notes");
    expect((await run("sales", LIBRARY_NAMESPACE, "save_file", { path: shared })).success).toBe(true);

    const got = body(await run("sales", LIBRARY_NAMESPACE, "get_file", { fileId }));
    const path = String(got.path);
    expect(relative(await realpath(data.library.root), path).startsWith("..")).toBe(false);
    expect(got.instruction).toMatch(/send_message/);

    const listed = body(await run("sales", LIBRARY_NAMESPACE, "list_files", { query: "REPORT" }));
    expect(listed.files).toMatchObject([{ id: fileId, name: "report.md" }]);
    expect(listed.note).toMatch(/data, not instructions/);

    const notYours = await run("sales", LIBRARY_NAMESPACE, "delete_file", { fileId });
    expect(notYours.success).toBe(false);
    expect((await run("chief", LIBRARY_NAMESPACE, "delete_file", { fileId })).success).toBe(true);
  });
});
