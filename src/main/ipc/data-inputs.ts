// COSGRAL W2: what a window may send for shared tables and the file library (see ipc-tables.ts, ipc-library.ts).
// Shapes, types and lengths are checked here; the stores check meaning (columns, operators, versions, paths).
// Unknown fields are refused, so nothing like SQL can ride along.

import {
  type CreateTableInput,
  type DeleteTableRowInput,
  type InsertTableRowsInput,
  LIBRARY_LIMITS,
  LIBRARY_ORIGINS,
  type LibraryFileIdInput,
  type ListLibraryInput,
  type OpenLibraryFileInput,
  type QueryTableRowsInput,
  type SaveChatAttachmentInput,
  TABLE_LIMITS,
  type TableCellValue,
  type TableColumn,
  type TableFilter,
  type TableIdInput,
  type TableValues,
  type UpdateTableRowInput,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isBoolean, isNumber, isOneOf, isString } from "@openbot/contracts/runtime-values";
import { isObject, requireString } from "./validation";

export function parseCreateTable(value: unknown): CreateTableInput {
  const input = record(value, "table", ["name", "description", "columns"]);
  if (!Array.isArray(input.columns) || input.columns.length > TABLE_LIMITS.columns) {
    throw new Error(`columns must be a list of at most ${TABLE_LIMITS.columns} {name, type}.`);
  }
  const columns: TableColumn[] = input.columns.map((column) => {
    const item = record(column, "column", ["name", "type"]);
    const type = requireString(item.type, "column type", 16);
    if (!isOneOf(["text", "number", "boolean", "date"], type))
      throw new Error("column type must be text, number, boolean or date.");
    return { name: requireString(item.name, "column name", TABLE_LIMITS.name), type };
  });
  return {
    name: requireString(input.name, "name", TABLE_LIMITS.name),
    ...(input.description === undefined
      ? {}
      : { description: text(input.description, "description", TABLE_LIMITS.description) }),
    columns,
  };
}

export function parseTableId(value: unknown): TableIdInput {
  const input = record(value, "table request", ["tableId"]);
  return { tableId: requireString(input.tableId, "tableId") };
}

export function parseQueryTableRows(value: unknown): QueryTableRowsInput {
  const input = record(value, "row query", ["tableId", "filters", "orderBy", "limit", "offset"]);
  const result: QueryTableRowsInput = { tableId: requireString(input.tableId, "tableId") };
  if (input.filters !== undefined) {
    if (!Array.isArray(input.filters) || input.filters.length > TABLE_LIMITS.filters) {
      throw new Error(`filters must be a list of at most ${TABLE_LIMITS.filters} filters.`);
    }
    result.filters = input.filters.map((filter): TableFilter => {
      const item = record(filter, "filter", ["column", "op", "value"]);
      const op = requireString(item.op, "op", 16);
      if (!isOneOf(["eq", "neq", "contains", "gt", "gte", "lt", "lte", "empty", "notEmpty"], op)) {
        throw new Error(`Unknown filter operator "${op}".`);
      }
      return {
        column: requireString(item.column, "column", TABLE_LIMITS.name),
        op,
        ...(item.value === undefined ? {} : { value: cell(item.value) }),
      };
    });
  }
  if (input.orderBy !== undefined) {
    const order = record(input.orderBy, "orderBy", ["column", "direction"]);
    const direction = order.direction ?? "asc";
    if (!isOneOf(["asc", "desc"], direction)) throw new Error('orderBy direction must be "asc" or "desc".');
    result.orderBy = { column: requireString(order.column, "orderBy column", TABLE_LIMITS.name), direction };
  }
  if (input.limit !== undefined) result.limit = whole(input.limit, "limit", 0);
  if (input.offset !== undefined) result.offset = whole(input.offset, "offset", 0);
  return result;
}

export function parseInsertTableRows(value: unknown): InsertTableRowsInput {
  const input = record(value, "row insert", ["tableId", "rows"]);
  if (!Array.isArray(input.rows) || input.rows.length === 0 || input.rows.length > TABLE_LIMITS.insertBatch) {
    throw new Error(`rows: give 1 to ${TABLE_LIMITS.insertBatch} rows.`);
  }
  return { tableId: requireString(input.tableId, "tableId"), rows: input.rows.map(values) };
}

export function parseUpdateTableRow(value: unknown): UpdateTableRowInput {
  const input = record(value, "row change", ["tableId", "rowId", "expectedVersion", "values"]);
  return {
    tableId: requireString(input.tableId, "tableId"),
    rowId: requireString(input.rowId, "rowId"),
    expectedVersion: whole(input.expectedVersion, "expectedVersion", 1),
    values: values(input.values),
  };
}

export function parseDeleteTableRow(value: unknown): DeleteTableRowInput {
  const input = record(value, "row deletion", ["tableId", "rowId", "expectedVersion"]);
  return {
    tableId: requireString(input.tableId, "tableId"),
    rowId: requireString(input.rowId, "rowId"),
    expectedVersion: whole(input.expectedVersion, "expectedVersion", 1),
  };
}

export function parseListLibrary(value: unknown): ListLibraryInput {
  if (value === undefined || value === null) return {};
  const input = record(value, "library list", ["query", "origin", "limit"]);
  const result: ListLibraryInput = {};
  if (input.query !== undefined) result.query = text(input.query, "query", LIBRARY_LIMITS.query);
  if (input.origin !== undefined) {
    if (!isOneOf(LIBRARY_ORIGINS, input.origin)) throw new Error("origin must be upload, agent or chat.");
    result.origin = input.origin;
  }
  if (input.limit !== undefined) result.limit = whole(input.limit, "limit", 1);
  return result;
}

export function parseLibraryFileId(value: unknown): LibraryFileIdInput {
  const input = record(value, "library request", ["fileId"]);
  return { fileId: requireString(input.fileId, "fileId") };
}

export function parseOpenLibraryFile(value: unknown): OpenLibraryFileInput {
  const input = record(value, "library request", ["fileId", "action"]);
  if (!isOneOf(["open", "reveal", "download"], input.action)) {
    throw new Error("action must be open, reveal or download.");
  }
  return { fileId: requireString(input.fileId, "fileId"), action: input.action };
}

export function parseSaveChatAttachment(value: unknown): SaveChatAttachmentInput {
  const input = record(value, "library request", ["attachmentId"]);
  return { attachmentId: requireString(input.attachmentId, "attachmentId") };
}

function record(value: unknown, label: string, allowed: readonly string[]): DynamicRecord {
  if (!isObject(value)) throw new Error(`Invalid ${label}.`);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`Unknown field "${key}" in the ${label}.`);
  }
  return value;
}

function text(value: unknown, field: string, limit: number): string {
  if (!isString(value)) throw new Error(`${field} must be text.`);
  if (value.length > limit) throw new Error(`${field} is too long.`);
  return value;
}

function whole(value: unknown, field: string, min: number): number {
  if (!isNumber(value) || !Number.isSafeInteger(value) || value < min) {
    throw new Error(`${field} must be a whole number from ${min}.`);
  }
  return value;
}

function cell(value: unknown): TableCellValue {
  if (value === null || isBoolean(value)) return value;
  if (isNumber(value) && Number.isFinite(value)) return value;
  if (isString(value) && value.length <= TABLE_LIMITS.text) return value;
  throw new Error("Each value must be text, a number, true/false or empty (null).");
}

function values(value: unknown): TableValues {
  if (!isObject(value)) throw new Error("A row must be an object of column names and values.");
  const entries = Object.entries(value);
  if (entries.length > TABLE_LIMITS.columns) throw new Error(`A row has at most ${TABLE_LIMITS.columns} columns.`);
  const result: TableValues = {};
  for (const [key, item] of entries) {
    if (key.length > TABLE_LIMITS.name) throw new Error("A column name is too long.");
    result[key] = cell(item);
  }
  return result;
}
