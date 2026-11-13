import { TABLE_LIMITS } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import {
  parseCreateTable,
  parseDeleteTableRow,
  parseInsertTableRows,
  parseLibraryFileId,
  parseListLibrary,
  parseOpenLibraryFile,
  parseQueryTableRows,
  parseSaveChatAttachment,
  parseTableId,
  parseUpdateTableRow,
} from "./data-inputs";

describe("shared tables IPC input parsing", () => {
  it("passes well-formed table requests through", () => {
    expect(
      parseCreateTable({ name: "Leads", description: "Team leads", columns: [{ name: "company", type: "text" }] }),
    ).toEqual({ name: "Leads", description: "Team leads", columns: [{ name: "company", type: "text" }] });
    expect(parseTableId({ tableId: "t1" })).toEqual({ tableId: "t1" });
    expect(
      parseQueryTableRows({
        tableId: "t1",
        filters: [
          { column: "won", op: "eq", value: true },
          { column: "next call", op: "empty" },
        ],
        orderBy: { column: "value", direction: "desc" },
        limit: 20,
        offset: 40,
      }),
    ).toEqual({
      tableId: "t1",
      filters: [
        { column: "won", op: "eq", value: true },
        { column: "next call", op: "empty" },
      ],
      orderBy: { column: "value", direction: "desc" },
      limit: 20,
      offset: 40,
    });
    expect(parseQueryTableRows({ tableId: "t1" })).toEqual({ tableId: "t1" });
    expect(parseInsertTableRows({ tableId: "t1", rows: [{ company: "Test Co", value: 1, won: null }] })).toEqual({
      tableId: "t1",
      rows: [{ company: "Test Co", value: 1, won: null }],
    });
    expect(parseUpdateTableRow({ tableId: "t1", rowId: "r1", expectedVersion: 2, values: { value: 3 } })).toEqual({
      tableId: "t1",
      rowId: "r1",
      expectedVersion: 2,
      values: { value: 3 },
    });
    expect(parseDeleteTableRow({ tableId: "t1", rowId: "r1", expectedVersion: 2 })).toEqual({
      tableId: "t1",
      rowId: "r1",
      expectedVersion: 2,
    });
  });

  it("refuses malformed table requests and SQL-shaped extras", () => {
    expect(() => parseCreateTable({ name: "Leads", columns: "company text" })).toThrow(/columns/);
    expect(() => parseCreateTable(null)).toThrow(/Invalid/);
    expect(() =>
      parseQueryTableRows({ tableId: "t1", filters: [{ column: "a", op: "eq", value: { $gt: 1 } }] }),
    ).toThrow(/value/);
    expect(() => parseQueryTableRows({ tableId: "t1", sql: "DROP TABLE x" })).toThrow(/sql/);
    expect(() => parseQueryTableRows({ tableId: "t1", limit: "all" })).toThrow(/limit/);
    expect(() =>
      parseInsertTableRows({ tableId: "t1", rows: Array.from({ length: TABLE_LIMITS.insertBatch + 1 }, () => ({})) }),
    ).toThrow(/rows/);
    expect(() => parseInsertTableRows({ tableId: "t1", rows: [{ a: [1, 2] }] })).toThrow(/value/);
    expect(() => parseUpdateTableRow({ tableId: "t1", rowId: "r1", expectedVersion: 1.5, values: {} })).toThrow(
      /expectedVersion/,
    );
    expect(() => parseDeleteTableRow({ tableId: "t1", rowId: "r1" })).toThrow(/expectedVersion/);
  });
});

describe("file library IPC input parsing", () => {
  it("parses library requests", () => {
    expect(parseListLibrary(undefined)).toEqual({});
    expect(parseListLibrary({ query: "report", origin: "chat", limit: 10 })).toEqual({
      query: "report",
      origin: "chat",
      limit: 10,
    });
    expect(parseLibraryFileId({ fileId: "f1" })).toEqual({ fileId: "f1" });
    expect(parseOpenLibraryFile({ fileId: "f1", action: "download" })).toEqual({ fileId: "f1", action: "download" });
    expect(parseSaveChatAttachment({ attachmentId: "a1" })).toEqual({ attachmentId: "a1" });
  });

  it("refuses malformed library requests", () => {
    expect(() => parseListLibrary({ origin: "disk" })).toThrow(/origin/);
    expect(() => parseListLibrary({ query: 5 })).toThrow(/query/);
    expect(() => parseOpenLibraryFile({ fileId: "f1", action: "delete" })).toThrow(/action/);
    expect(() => parseLibraryFileId({})).toThrow(/fileId/);
    expect(() => parseSaveChatAttachment({ attachmentId: "" })).toThrow(/attachmentId/);
  });
});
