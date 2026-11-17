// @vitest-environment node
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isStorageReport } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { clearLogs, measureUserData } from "./storage-report";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function userData(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "storage-report-"));
  roots.push(root);
  await writeFile(join(root, "openbot.db"), Buffer.alloc(1000));
  await writeFile(join(root, "openbot.db-wal"), Buffer.alloc(500));
  await mkdir(join(root, "provider-accounts", "a"), { recursive: true });
  await writeFile(join(root, "provider-accounts", "a", "state.bin"), Buffer.alloc(4000));
  await mkdir(join(root, "logs", "remote"), { recursive: true });
  await writeFile(join(root, "logs", "main.log"), Buffer.alloc(300));
  await writeFile(join(root, "logs", "remote", "r.log"), Buffer.alloc(200));
  await writeFile(join(root, "thread-tabs.json"), Buffer.alloc(50));
  return root;
}

describe("storage report (W12 BE-D)", () => {
  it("sorts what the program keeps into chat history, provider environments and app data, and counts the logs as reclaimable", async () => {
    const root = await userData();
    const report = await measureUserData(root, () => new Date("2026-11-17T12:00:00.000Z"));
    expect(isStorageReport(report)).toBe(true);
    const bytes = Object.fromEntries(report.items.map((item) => [item.id, item.bytes]));
    expect(bytes["chat-history"]).toBe(1500);
    expect(bytes["provider-environments"]).toBe(4000);
    expect(bytes["app-data"]).toBe(50 + 500);
    expect(report.reclaimableBytes).toBe(500);
    expect(report.totalBytes).toBe(1500 + 4000 + 550);
    expect(report.measuredAt).toBe("2026-11-17T12:00:00.000Z");
  });

  it("reports a missing folder as empty, never as an error", async () => {
    const report = await measureUserData(join(tmpdir(), "storage-report-does-not-exist"));
    expect(report.totalBytes).toBe(0);
    expect(report.items.map((item) => item.bytes)).toEqual([0, 0, 0]);
  });

  it("deletes the log files but keeps the folder, and nothing else", async () => {
    const root = await userData();
    await clearLogs(root);
    expect(await readdir(join(root, "logs"))).toEqual([]);
    expect((await readdir(root)).sort()).toEqual([
      "logs",
      "openbot.db",
      "openbot.db-wal",
      "provider-accounts",
      "thread-tabs.json",
    ]);
    expect((await measureUserData(root)).reclaimableBytes).toBe(0);
  });
});
