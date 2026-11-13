// COSGRAL W2: shared tables (spec W2 §5, parity row 29; lead decision W2-5: row version).
//
// Durable tables every agent of the program and the person can read and write. Each row has a version: a change
// or deletion names the version it read, and a stale version gets a conflict with the current row, never a
// silent overwrite. Filters use a fixed list of operators on known columns; nobody sends SQL.

import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

/** Every limit of the shared tables in one place. */
export const TABLE_LIMITS = {
  tables: 200,
  columns: 50,
  rowsPerTable: 10_000,
  /** Table and column names. */
  name: 64,
  description: 500,
  /** One text cell. */
  text: 10_000,
  defaultQueryLimit: 100,
  queryLimit: 500,
  filters: 10,
  insertBatch: 50,
} as const;

export const TABLE_COLUMN_TYPES = ["text", "number", "boolean", "date"] as const;
export type TableColumnType = (typeof TABLE_COLUMN_TYPES)[number];

export interface TableColumn {
  name: string;
  type: TableColumnType;
}

export interface SharedTable {
  id: string;
  /** Unique, case-insensitive. */
  name: string;
  description: string | null;
  columns: TableColumn[];
  /** The agent that created it, or null for a person. Only the owner or a person deletes the table. */
  ownerBotId: string | null;
  rowCount: number;
  createdAt: string;
  updatedAt: string;
}

/** A cell; every column also accepts null. Dates are "YYYY-MM-DD" or a full ISO time. */
export type TableCellValue = string | number | boolean | null;
export type TableValues = Record<string, TableCellValue>;

export interface TableRow {
  id: string;
  tableId: string;
  /** Starts at 1 and grows with every change. */
  version: number;
  values: TableValues;
  createdByBotId: string | null;
  updatedByBotId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const TABLE_FILTER_OPERATORS = ["eq", "neq", "contains", "gt", "gte", "lt", "lte", "empty", "notEmpty"] as const;
export type TableFilterOperator = (typeof TABLE_FILTER_OPERATORS)[number];

export interface TableFilter {
  column: string;
  op: TableFilterOperator;
  /** Not used by "empty" and "notEmpty". */
  value?: TableCellValue;
}

export interface QueryTableRowsInput {
  tableId: string;
  /** All filters must match. */
  filters?: TableFilter[];
  orderBy?: { column: string; direction?: "asc" | "desc" };
  limit?: number;
  offset?: number;
}

export interface TableRowPage {
  rows: TableRow[];
  /** Matching rows without limit and offset. */
  total: number;
}

export interface CreateTableInput {
  name: string;
  description?: string;
  columns: TableColumn[];
}

export interface TableIdInput {
  tableId: string;
}

export interface InsertTableRowsInput {
  tableId: string;
  rows: TableValues[];
}

/** Only the given columns change. `expectedVersion` is the version the writer read. */
export interface UpdateTableRowInput {
  tableId: string;
  rowId: string;
  expectedVersion: number;
  values: TableValues;
}

export interface DeleteTableRowInput {
  tableId: string;
  rowId: string;
  expectedVersion: number;
}

/** A stale `expectedVersion` gets the current row; nothing was written. */
export type TableWriteResult =
  | { status: "updated"; row: TableRow }
  | { status: "deleted"; rowId: string }
  | { status: "conflict"; current: TableRow };

const COLUMN_NAME = /^[A-Za-z][A-Za-z0-9 _-]*$/;

export function isTableColumnName(value: unknown): value is string {
  return isString(value) && value.length <= TABLE_LIMITS.name && COLUMN_NAME.test(value) && value.trim() === value;
}

export function isTableCellValue(value: unknown): value is TableCellValue {
  return value === null || isString(value) || (isNumber(value) && Number.isFinite(value)) || isBoolean(value);
}

function isTableColumn(value: unknown): value is TableColumn {
  return isDynamicRecord(value) && isTableColumnName(value.name) && isOneOf(TABLE_COLUMN_TYPES, value.type);
}

export function isSharedTable(value: unknown): value is SharedTable {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    (value.description === null || isString(value.description)) &&
    Array.isArray(value.columns) &&
    value.columns.every(isTableColumn) &&
    (value.ownerBotId === null || isString(value.ownerBotId)) &&
    isNumber(value.rowCount) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

export function isTableRow(value: unknown): value is TableRow {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.tableId) &&
    isNumber(value.version) &&
    Number.isInteger(value.version) &&
    value.version >= 1 &&
    isDynamicRecord(value.values) &&
    Object.values(value.values).every(isTableCellValue) &&
    (value.createdByBotId === null || isString(value.createdByBotId)) &&
    (value.updatedByBotId === null || isString(value.updatedByBotId)) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

export function isTableWriteResult(value: unknown): value is TableWriteResult {
  if (!isDynamicRecord(value)) return false;
  switch (value.status) {
    case "updated":
      return isTableRow(value.row);
    case "deleted":
      return isString(value.rowId);
    case "conflict":
      return isTableRow(value.current);
    default:
      return false;
  }
}
