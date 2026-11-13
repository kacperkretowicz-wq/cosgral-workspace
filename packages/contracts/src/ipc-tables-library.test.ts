import { describe, expect, it } from "vitest";
import {
  isAgentEvent,
  isLibraryItem,
  isSharedTable,
  isTableColumnName,
  isTableRow,
  isTableWriteResult,
  LIBRARY_LIMITS,
  TABLE_LIMITS,
} from "./ipc";

const AT = "2026-11-13T05:00:00.000Z";
const table = {
  id: "t1",
  name: "Sales leads",
  description: null,
  columns: [
    { name: "company", type: "text" },
    { name: "value", type: "number" },
    { name: "won", type: "boolean" },
    { name: "next_call", type: "date" },
  ],
  ownerBotId: "chief",
  rowCount: 2,
  createdAt: AT,
  updatedAt: AT,
};
const row = {
  id: "r1",
  tableId: "t1",
  version: 3,
  values: { company: "Test Co", value: 1200, won: false, next_call: "2026-11-20" },
  createdByBotId: "chief",
  updatedByBotId: null,
  createdAt: AT,
  updatedAt: AT,
};
const file = {
  id: "f1",
  name: "report.pdf",
  size: 1024,
  kind: "file",
  mimeType: "application/pdf",
  previewKind: "pdf",
  previewUrl: null,
  origin: "agent",
  createdAt: AT,
  createdByBotId: "chief",
  messageId: null,
};

describe("W2 shared tables contract", () => {
  it("accepts tables, rows with a version and conflict results", () => {
    expect(isSharedTable(table)).toBe(true);
    expect(isSharedTable({ ...table, columns: [{ name: "x", type: "json" }] })).toBe(false);
    expect(isTableRow(row)).toBe(true);
    expect(isTableRow({ ...row, version: 0 })).toBe(false);
    expect(isTableRow({ ...row, values: { company: { nested: true } } })).toBe(false);
    expect(isTableWriteResult({ status: "updated", row })).toBe(true);
    expect(isTableWriteResult({ status: "conflict", current: row })).toBe(true);
    expect(isTableWriteResult({ status: "overwritten", row })).toBe(false);
  });

  it("allows only safe column names", () => {
    expect(isTableColumnName("next_call")).toBe(true);
    expect(isTableColumnName("Deal value")).toBe(true);
    expect(isTableColumnName('a"b')).toBe(false);
    expect(isTableColumnName("a.b")).toBe(false);
    expect(isTableColumnName("")).toBe(false);
    expect(isTableColumnName("x".repeat(TABLE_LIMITS.name + 1))).toBe(false);
  });

  it("follows table changes as agent events", () => {
    expect(isAgentEvent({ type: "tables-changed", tables: [table] })).toBe(true);
    expect(isAgentEvent({ type: "table-rows-changed", tableId: "t1", rowIds: ["r1"] })).toBe(true);
    expect(isAgentEvent({ type: "table-rows-changed", tableId: "t1" })).toBe(false);
  });
});

describe("W2 file library contract", () => {
  it("lists files of the library and of chat messages with their origin", () => {
    expect(isLibraryItem(file)).toBe(true);
    expect(isLibraryItem({ ...file, origin: "chat", messageId: "m1", createdByBotId: null })).toBe(true);
    expect(isLibraryItem({ ...file, origin: "disk" })).toBe(false);
    expect(isAgentEvent({ type: "library-changed", fileIds: ["f1"] })).toBe(true);
    expect(LIBRARY_LIMITS.fileBytes).toBeGreaterThan(0);
    expect(LIBRARY_LIMITS.totalBytes).toBeGreaterThan(LIBRARY_LIMITS.fileBytes);
  });
});
