import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  damagedDatabaseText,
  isDamagedDatabaseError,
  moveDamagedDatabaseAside,
  startupLanguage,
} from "./startup-failure";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it("recognises SQLite's wording for a damaged database and nothing else", () => {
  expect(isDamagedDatabaseError("file is not a database")).toBe(true);
  expect(isDamagedDatabaseError("database disk image is malformed")).toBe(true);
  expect(isDamagedDatabaseError("EACCES: permission denied")).toBe(false);
});

it("moves the database files aside without deleting anything", () => {
  const dir = mkdtempSync(join(tmpdir(), "cosgral-damaged-"));
  dirs.push(dir);
  for (const name of ["openbot.db", "openbot.db-wal", "other.json"]) writeFileSync(join(dir, name), name);
  const moved = moveDamagedDatabaseAside(dir, new Date("2026-11-25T19:05:09.123Z"));
  expect(moved).toBe(join(dir, "openbot.db.damaged-2026-11-25T19-05-09"));
  expect(existsSync(join(dir, "openbot.db"))).toBe(false);
  expect(readdirSync(dir).sort()).toEqual([
    "openbot.db-wal.damaged-2026-11-25T19-05-09",
    "openbot.db.damaged-2026-11-25T19-05-09",
    "other.json",
  ]);
});

it("says nothing was moved when there is no database file", () => {
  const dir = mkdtempSync(join(tmpdir(), "cosgral-damaged-"));
  dirs.push(dir);
  expect(moveDamagedDatabaseAside(dir)).toBeNull();
});

it("explains the problem in plain Polish for a Polish system and in English otherwise", () => {
  expect(startupLanguage("pl-PL")).toBe("pl");
  expect(startupLanguage("en-US")).toBe("en");
  const pl = damagedDatabaseText("pl", "file is not a database");
  expect(pl.message).toBe("Plik z danymi programu jest uszkodzony.");
  expect(pl.detail).toContain("Nic nie zostało skasowane");
  expect(damagedDatabaseText("en", "x").startFresh).toBe("Start fresh");
});
