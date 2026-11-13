// COSGRAL W2: shared tables (spec W2 §5, parity row 29; lead decision W2-5: row version).
//
// Durable tables in the program's SQLite database that every agent and the person read and write. Each row has a
// version that grows with every change. A change or deletion names the version it read; a stale version returns
// `conflict` with the current row and writes nothing, so a second writer never silently overwrites the first.
// Every query is built from fixed SQL with bound values: column names are checked against the table and passed as
// bound JSON paths, operators come from a fixed list, and nobody sends SQL. The tables are created here with
// CREATE TABLE IF NOT EXISTS (the shared schema file and its version stay untouched).

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  type CreateTableInput,
  type DeleteTableRowInput,
  type InsertTableRowsInput,
  isTableColumnName,
  type QueryTableRowsInput,
  type SharedTable,
  TABLE_COLUMN_TYPES,
  TABLE_FILTER_OPERATORS,
  TABLE_LIMITS,
  type TableCellValue,
  type TableColumn,
  type TableRow,
  type TableRowPage,
  type TableValues,
  type TableWriteResult,
  type UpdateTableRowInput,
} from "@openbot/contracts/ipc";
import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "@openbot/contracts/runtime-values";
import type { OpenBotDatabase } from "./openbot-database";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projection_shared_tables (
    table_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    description TEXT,
    columns_json TEXT NOT NULL CHECK(json_valid(columns_json)),
    owner_agent_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_shared_table_rows (
    row_id TEXT PRIMARY KEY,
    table_id TEXT NOT NULL REFERENCES projection_shared_tables(table_id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK(version >= 1),
    values_json TEXT NOT NULL CHECK(json_valid(values_json)),
    created_by_agent_id TEXT,
    updated_by_agent_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS shared_table_rows_order ON projection_shared_table_rows(table_id, created_at);
`;

const TABLE_SELECT = `
  SELECT t.table_id, t.name, t.description, t.columns_json, t.owner_agent_id, t.created_at, t.updated_at,
    (SELECT COUNT(*) FROM projection_shared_table_rows r WHERE r.table_id = t.table_id) AS row_count
  FROM projection_shared_tables t`;
const ROW_COLUMNS =
  "row_id, table_id, version, values_json, created_by_agent_id, updated_by_agent_id, created_at, updated_at";
const DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

/** The agent that acts, or null for the person. */
export type TableActor = string | null;

export interface TableStoreEvents {
  "tables-changed": [tables: SharedTable[]];
  "rows-changed": [tableId: string, rowIds: string[]];
}

export class TableStore extends EventEmitter<TableStoreEvents> {
  readonly #database: OpenBotDatabase;
  readonly #now: () => Date;
  readonly #ready = new WeakSet<DatabaseSync>();

  constructor(database: OpenBotDatabase, now: () => Date = () => new Date()) {
    super();
    this.#database = database;
    this.#now = now;
  }

  /** Every table, by name. */
  list(): SharedTable[] {
    return this.#db()
      .prepare(`${TABLE_SELECT} ORDER BY t.name_key`)
      .all()
      .flatMap((row) => {
        const table = parseTable(row);
        return table ? [table] : [];
      });
  }

  /** A table by its id or its name (any letter case). */
  resolve(ref: string): SharedTable {
    const db = this.#db();
    const key = isString(ref) ? ref.trim() : "";
    const row =
      db.prepare(`${TABLE_SELECT} WHERE t.table_id = ?`).get(key) ??
      db.prepare(`${TABLE_SELECT} WHERE t.name_key = ?`).get(nameKey(key));
    const table = parseTable(row);
    if (!table)
      throw new Error(`Table "${key}" no longer exists or never existed. List the tables to see their names.`);
    return table;
  }

  create(input: CreateTableInput, actor: TableActor): SharedTable {
    const name = requireName(input.name, "Table name");
    const description = optionalText(input.description, "Description", TABLE_LIMITS.description);
    const columns = parseColumns(input.columns);
    const db = this.#db();
    if (this.list().length >= TABLE_LIMITS.tables) {
      throw new Error(`There are at most ${TABLE_LIMITS.tables} shared tables; delete one first.`);
    }
    if (db.prepare("SELECT 1 FROM projection_shared_tables WHERE name_key = ?").get(nameKey(name))) {
      throw new Error(`A table named "${name}" already exists.`);
    }
    const id = randomUUID();
    const at = this.#now().toISOString();
    db.prepare(
      `INSERT INTO projection_shared_tables
         (table_id, name, name_key, description, columns_json, owner_agent_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, name, nameKey(name), description, JSON.stringify(columns), actor, at, at);
    this.#emitTables();
    return this.resolve(id);
  }

  /** Deletes the table and its rows for everyone. Only its owner agent or the person may. */
  deleteTable(tableId: string, actor: TableActor): void {
    const table = this.resolve(tableId);
    if (actor !== null && actor !== table.ownerBotId) {
      throw new Error(`Only the agent that created table "${table.name}" or the person can delete it.`);
    }
    this.#transaction((db) => {
      db.prepare("DELETE FROM projection_shared_table_rows WHERE table_id = ?").run(table.id);
      db.prepare("DELETE FROM projection_shared_tables WHERE table_id = ?").run(table.id);
    });
    this.#emitTables();
    this.emit("rows-changed", table.id, []);
  }

  queryRows(input: QueryTableRowsInput): TableRowPage {
    const table = this.resolve(input.tableId);
    const where: string[] = ["table_id = ?"];
    const params: SQLInputValue[] = [table.id];
    const filters = input.filters ?? [];
    if (!Array.isArray(filters)) throw new Error("filters must be a list.");
    if (filters.length > TABLE_LIMITS.filters) throw new Error(`Use at most ${TABLE_LIMITS.filters} filters.`);
    for (const filter of filters) {
      if (!isDynamicRecord(filter)) throw new Error("Each filter needs column, op and value.");
      const column = findColumn(table, filter.column);
      if (!isOneOf(TABLE_FILTER_OPERATORS, filter.op)) {
        throw new Error(`Unknown filter operator "${String(filter.op)}": use ${TABLE_FILTER_OPERATORS.join(", ")}.`);
      }
      const path = jsonPath(column.name);
      const cell = "json_extract(values_json, ?)";
      switch (filter.op) {
        case "empty":
          where.push(`(${cell} IS NULL OR ${cell} = '')`);
          params.push(path, path);
          break;
        case "notEmpty":
          where.push(`(${cell} IS NOT NULL AND ${cell} <> '')`);
          params.push(path, path);
          break;
        case "contains": {
          if (!isString(filter.value) || filter.value === "") {
            throw new Error(`Filter "contains" on "${column.name}" needs some text.`);
          }
          where.push(`instr(lower(CAST(${cell} AS TEXT)), lower(?)) > 0`);
          params.push(path, filter.value);
          break;
        }
        case "eq":
        case "neq": {
          const value = filter.value === undefined ? null : cellValue(column, filter.value);
          where.push(`${cell} ${filter.op === "eq" ? "IS" : "IS NOT"} ?`);
          params.push(path, sqlValue(value));
          break;
        }
        default: {
          if (column.type === "boolean") {
            throw new Error(`Operator "${filter.op}" does not work on the true/false column "${column.name}".`);
          }
          const value = cellValue(column, filter.value);
          if (value === null) throw new Error(`Operator "${filter.op}" on "${column.name}" needs a value.`);
          const operator = { gt: ">", gte: ">=", lt: "<", lte: "<=" }[filter.op];
          where.push(`${cell} ${operator} ?`);
          params.push(path, sqlValue(value));
        }
      }
    }
    let order = "created_at, rowid";
    const orderParams: SQLInputValue[] = [];
    if (input.orderBy !== undefined) {
      if (!isDynamicRecord(input.orderBy)) throw new Error("orderBy needs a column.");
      const column = findColumn(table, input.orderBy.column);
      const direction = input.orderBy.direction ?? "asc";
      if (!isOneOf(["asc", "desc"], direction)) throw new Error('orderBy direction is "asc" or "desc".');
      order = `json_extract(values_json, ?) ${direction === "desc" ? "DESC" : "ASC"}, created_at, rowid`;
      orderParams.push(jsonPath(column.name));
    }
    const limit = clampInteger(input.limit, 1, TABLE_LIMITS.queryLimit, TABLE_LIMITS.defaultQueryLimit);
    const offset = clampInteger(input.offset, 0, Number.MAX_SAFE_INTEGER, 0);
    const db = this.#db();
    const condition = where.join(" AND ");
    const total = db
      .prepare(`SELECT COUNT(*) AS total FROM projection_shared_table_rows WHERE ${condition}`)
      .get(...params);
    const rows = db
      .prepare(
        `SELECT ${ROW_COLUMNS} FROM projection_shared_table_rows WHERE ${condition} ORDER BY ${order} LIMIT ? OFFSET ?`,
      )
      .all(...params, ...orderParams, limit, offset)
      .flatMap((row) => {
        const parsed = parseRow(table, row);
        return parsed ? [parsed] : [];
      });
    return { rows, total: isDynamicRecord(total) && isNumber(total.total) ? total.total : rows.length };
  }

  insertRows(input: InsertTableRowsInput, actor: TableActor): TableRow[] {
    const table = this.resolve(input.tableId);
    if (!Array.isArray(input.rows) || input.rows.length === 0) throw new Error("Give at least one row.");
    if (input.rows.length > TABLE_LIMITS.insertBatch) {
      throw new Error(`Insert at most ${TABLE_LIMITS.insertBatch} rows at once.`);
    }
    if (table.rowCount + input.rows.length > TABLE_LIMITS.rowsPerTable) {
      throw new Error(`A table holds at most ${TABLE_LIMITS.rowsPerTable} rows.`);
    }
    const values = input.rows.map((row) => fullValues(table, rowValues(table, row)));
    const at = this.#now().toISOString();
    const ids = values.map(() => randomUUID());
    this.#transaction((db) => {
      const insert = db.prepare(
        `INSERT INTO projection_shared_table_rows (${ROW_COLUMNS}) VALUES (?, ?, 1, ?, ?, NULL, ?, ?)`,
      );
      values.forEach((row, index) => {
        insert.run(ids[index] ?? randomUUID(), table.id, JSON.stringify(row), actor, at, at);
      });
      touch(db, table.id, at);
    });
    const inserted = ids.map((id) => this.#row(table, id));
    this.emit("rows-changed", table.id, ids);
    this.#emitTables();
    return inserted.flatMap((row) => (row ? [row] : []));
  }

  /** Changes only the given columns when `expectedVersion` is still current; otherwise returns the conflict. */
  updateRow(input: UpdateTableRowInput, actor: TableActor): TableWriteResult {
    const table = this.resolve(input.tableId);
    const rowId = requireRowId(input.rowId);
    const expectedVersion = requireVersion(input.expectedVersion);
    const changes = rowValues(table, input.values);
    const current = this.#existingRow(table, rowId);
    if (current.version !== expectedVersion) return { status: "conflict", current };
    const at = this.#now().toISOString();
    let changed = 0;
    this.#transaction((db) => {
      changed = Number(
        db
          .prepare(
            `UPDATE projection_shared_table_rows
             SET values_json = ?, version = version + 1, updated_by_agent_id = ?, updated_at = ?
             WHERE row_id = ? AND table_id = ? AND version = ?`,
          )
          .run(JSON.stringify({ ...current.values, ...changes }), actor, at, rowId, table.id, expectedVersion).changes,
      );
      if (changed > 0) touch(db, table.id, at);
    });
    if (changed === 0) return { status: "conflict", current: this.#existingRow(table, rowId) };
    this.emit("rows-changed", table.id, [rowId]);
    this.#emitTables();
    return { status: "updated", row: this.#existingRow(table, rowId) };
  }

  /** Any agent or the person may delete a row, with its current version. */
  deleteRow(input: DeleteTableRowInput): TableWriteResult {
    const table = this.resolve(input.tableId);
    const rowId = requireRowId(input.rowId);
    const expectedVersion = requireVersion(input.expectedVersion);
    const at = this.#now().toISOString();
    let changed = 0;
    this.#transaction((db) => {
      changed = Number(
        db
          .prepare("DELETE FROM projection_shared_table_rows WHERE row_id = ? AND table_id = ? AND version = ?")
          .run(rowId, table.id, expectedVersion).changes,
      );
      if (changed > 0) touch(db, table.id, at);
    });
    if (changed === 0) return { status: "conflict", current: this.#existingRow(table, rowId) };
    this.emit("rows-changed", table.id, [rowId]);
    this.#emitTables();
    return { status: "deleted", rowId };
  }

  #db(): DatabaseSync {
    const db = this.#database.connection;
    if (!this.#ready.has(db)) {
      db.exec(SCHEMA);
      this.#ready.add(db);
    }
    return db;
  }

  #transaction(work: (db: DatabaseSync) => void): void {
    const db = this.#db();
    db.exec("BEGIN IMMEDIATE");
    try {
      work(db);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  #row(table: SharedTable, rowId: string): TableRow | null {
    return parseRow(
      table,
      this.#db()
        .prepare(`SELECT ${ROW_COLUMNS} FROM projection_shared_table_rows WHERE row_id = ? AND table_id = ?`)
        .get(rowId, table.id),
    );
  }

  #existingRow(table: SharedTable, rowId: string): TableRow {
    const row = this.#row(table, rowId);
    if (!row) throw new Error(`Row "${rowId}" no longer exists in table "${table.name}".`);
    return row;
  }

  #emitTables(): void {
    this.emit("tables-changed", this.list());
  }
}

function touch(db: DatabaseSync, tableId: string, at: string): void {
  db.prepare("UPDATE projection_shared_tables SET updated_at = ? WHERE table_id = ?").run(at, tableId);
}

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** A bound JSON path; the column name is already checked against the table and the safe name pattern. */
function jsonPath(column: string): string {
  return `$."${column}"`;
}

function requireName(value: unknown, label: string): string {
  const name = isString(value) ? value.trim() : "";
  if (!name) throw new Error(`${label} is required.`);
  if (name.length > TABLE_LIMITS.name) throw new Error(`${label} has at most ${TABLE_LIMITS.name} characters.`);
  if (hasControlCharacter(name)) throw new Error(`${label} cannot contain control characters.`);
  return name;
}

function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function optionalText(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (!isString(value)) throw new Error(`${label} must be text.`);
  const text = value.trim();
  if (text.length > max) throw new Error(`${label} has at most ${max} characters.`);
  return text || null;
}

function parseColumns(value: unknown): TableColumn[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("A table needs at least one column.");
  if (value.length > TABLE_LIMITS.columns) throw new Error(`A table has at most ${TABLE_LIMITS.columns} columns.`);
  const seen = new Set<string>();
  return value.map((column) => {
    const name = isDynamicRecord(column) ? column.name : undefined;
    if (!isTableColumnName(name)) {
      throw new Error(
        `Invalid column name "${String(name)}": start with a letter, then letters, digits, spaces, "_" or "-", at most ${TABLE_LIMITS.name} characters.`,
      );
    }
    const type = isDynamicRecord(column) ? column.type : undefined;
    if (!isOneOf(TABLE_COLUMN_TYPES, type)) {
      throw new Error(`Unknown column type "${String(type)}" for "${name}": use ${TABLE_COLUMN_TYPES.join(", ")}.`);
    }
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error(`Column "${name}" is listed twice.`);
    seen.add(key);
    return { name, type };
  });
}

function findColumn(table: SharedTable, name: unknown): TableColumn {
  const column = table.columns.find((candidate) => candidate.name === name);
  if (!column) {
    throw new Error(
      `Unknown column "${String(name)}" in table "${table.name}". Columns: ${table.columns.map((item) => item.name).join(", ")}.`,
    );
  }
  return column;
}

function cellValue(column: TableColumn, value: unknown): TableCellValue {
  if (value === null) return null;
  switch (column.type) {
    case "text":
      if (!isString(value)) throw new Error(`"${column.name}" must be text.`);
      if (value.length > TABLE_LIMITS.text) {
        throw new Error(`"${column.name}" holds at most ${TABLE_LIMITS.text} characters.`);
      }
      return value;
    case "number":
      if (!isNumber(value) || !Number.isFinite(value)) throw new Error(`"${column.name}" must be a number.`);
      return value;
    case "boolean":
      if (!isBoolean(value)) throw new Error(`"${column.name}" must be true or false.`);
      return value;
    case "date":
      if (!isString(value) || !DATE.test(value) || Number.isNaN(Date.parse(value))) {
        throw new Error(`"${column.name}" must be a date like 2026-11-20 or an ISO time like 2026-11-20T09:30:00Z.`);
      }
      return value;
  }
}

/** The given cells of one row, checked against the columns. */
function rowValues(table: SharedTable, value: unknown): TableValues {
  if (!isDynamicRecord(value)) throw new Error("A row is an object of column names and values.");
  const entries = Object.entries(value);
  if (entries.length === 0) throw new Error("A row cannot be empty; give at least one column.");
  const values: TableValues = {};
  for (const [name, cell] of entries) {
    const column = findColumn(table, name);
    values[column.name] = cellValue(column, cell);
  }
  return values;
}

function fullValues(table: SharedTable, values: TableValues): TableValues {
  const full: TableValues = {};
  for (const column of table.columns) full[column.name] = values[column.name] ?? null;
  return full;
}

function sqlValue(value: TableCellValue): SQLInputValue {
  if (isBoolean(value)) return value ? 1 : 0;
  return value;
}

function requireRowId(value: unknown): string {
  if (!isString(value) || !value.trim()) throw new Error("rowId is required.");
  return value.trim();
}

function requireVersion(value: unknown): number {
  if (!isNumber(value) || !Number.isInteger(value) || value < 1) {
    throw new Error("expectedVersion must be the version you read: a whole number from 1.");
  }
  return value;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (!isNumber(value) || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function storedColumns(value: unknown): TableColumn[] | null {
  if (!isString(value)) return null;
  let columns: unknown;
  try {
    columns = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(columns)) return null;
  const parsed: TableColumn[] = [];
  for (const column of columns) {
    if (!isDynamicRecord(column) || !isTableColumnName(column.name) || !isOneOf(TABLE_COLUMN_TYPES, column.type)) {
      return null;
    }
    parsed.push({ name: column.name, type: column.type });
  }
  return parsed;
}

/** The stored cells of a row for the table's columns; anything else reads as empty. */
function storedValues(table: SharedTable, value: unknown): TableValues {
  let stored: unknown = null;
  try {
    stored = isString(value) ? JSON.parse(value) : null;
  } catch {
    stored = null;
  }
  const values: TableValues = {};
  for (const column of table.columns) {
    const cell = isDynamicRecord(stored) ? stored[column.name] : null;
    values[column.name] = isString(cell) || isNumber(cell) || isBoolean(cell) ? cell : null;
  }
  return values;
}

function nullableString(value: unknown): string | null {
  return isString(value) ? value : null;
}

function parseTable(row: unknown): SharedTable | null {
  if (!isDynamicRecord(row) || !isString(row.table_id) || !isString(row.name)) return null;
  const parsed = storedColumns(row.columns_json);
  if (!parsed) return null;
  return {
    id: row.table_id,
    name: row.name,
    description: nullableString(row.description),
    columns: parsed,
    ownerBotId: nullableString(row.owner_agent_id),
    rowCount: isNumber(row.row_count) ? row.row_count : 0,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function parseRow(table: SharedTable, row: unknown): TableRow | null {
  if (!isDynamicRecord(row) || !isString(row.row_id) || !isNumber(row.version)) return null;
  return {
    id: row.row_id,
    tableId: table.id,
    version: row.version,
    values: storedValues(table, row.values_json),
    createdByBotId: nullableString(row.created_by_agent_id),
    updatedByBotId: nullableString(row.updated_by_agent_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
