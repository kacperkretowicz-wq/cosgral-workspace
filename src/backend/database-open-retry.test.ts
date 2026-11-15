// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { isTransientSqliteOpenError, openWithRetry } from "./openbot-database";

// W4-BE2: the first start a few seconds after the program was killed failed with "disk I/O error" (1 of 2 tries;
// the data was intact). Windows still held the old process's handles on the WAL files for a moment.

function sqliteError(errcode: number, message = "disk I/O error"): Error {
  return Object.assign(new Error(message), { code: "ERR_SQLITE_ERROR", errcode });
}

describe("database open after a crash", () => {
  it("treats I/O, busy, locked and can't-open errors as transient (extended codes too)", () => {
    expect(isTransientSqliteOpenError(sqliteError(10))).toBe(true); // SQLITE_IOERR
    expect(isTransientSqliteOpenError(sqliteError(3850))).toBe(true); // SQLITE_IOERR_LOCK
    expect(isTransientSqliteOpenError(sqliteError(5, "database is locked"))).toBe(true); // SQLITE_BUSY
    expect(isTransientSqliteOpenError(sqliteError(6))).toBe(true); // SQLITE_LOCKED
    expect(isTransientSqliteOpenError(sqliteError(14))).toBe(true); // SQLITE_CANTOPEN
    expect(isTransientSqliteOpenError(sqliteError(11, "database disk image is malformed"))).toBe(false); // CORRUPT
    expect(isTransientSqliteOpenError(new Error("disk I/O error"))).toBe(true);
    expect(isTransientSqliteOpenError(new Error("no such table"))).toBe(false);
  });

  it("tries again with a short wait and then opens", async () => {
    const open = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(sqliteError(10))
      .mockRejectedValueOnce(sqliteError(3850))
      .mockResolvedValue("opened");
    const waits: number[] = [];
    await expect(openWithRetry(open, { delaysMs: [1, 2, 3], wait: async (ms) => void waits.push(ms) })).resolves.toBe(
      "opened",
    );
    expect(open).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([1, 2]);
  });

  it("gives up after the last wait with a message that says what to do", async () => {
    const open = vi.fn<() => Promise<string>>().mockRejectedValue(sqliteError(10));
    await expect(openWithRetry(open, { delaysMs: [1, 1], wait: async () => undefined })).rejects.toThrow(
      /still in use.*Wait a few seconds/,
    );
    expect(open).toHaveBeenCalledTimes(3);
  });

  it("does not retry other errors", async () => {
    const open = vi.fn<() => Promise<string>>().mockRejectedValue(sqliteError(11, "database disk image is malformed"));
    await expect(openWithRetry(open, { delaysMs: [1, 1], wait: async () => undefined })).rejects.toThrow("malformed");
    expect(open).toHaveBeenCalledTimes(1);
  });
});
