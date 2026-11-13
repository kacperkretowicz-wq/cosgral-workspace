// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Routine, RoutineRun } from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import type { SecretBox } from "./mcp-store";
import type { OpenBotDatabase } from "./openbot-database";
import { RoutineStore } from "./routine-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const box: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => `enc:${Buffer.from(plain).toString("base64").split("").reverse().join("")}`,
  decrypt: (cipher) => Buffer.from(cipher.slice(4).split("").reverse().join(""), "base64").toString(),
};

async function open(root?: string) {
  const directory = root ?? (await mkdtemp(join(tmpdir(), "cosgral-routine-store-")));
  if (!root) roots.push(directory);
  const database: OpenBotDatabase = testDatabase(directory);
  await database.initialize();
  return { root: directory, database, store: new RoutineStore(database, box) };
}

function routine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "r1",
    botId: "chief",
    name: "Every minute",
    prompt: "Say hi.",
    trigger: "schedule",
    schedule: { type: "interval", everyMinutes: 1 },
    timezone: "UTC",
    paused: false,
    nextRunAt: "2026-11-13T04:01:00.000Z",
    webhook: null,
    createdBy: "person",
    createdAt: "2026-11-13T04:00:00.000Z",
    updatedAt: "2026-11-13T04:00:00.000Z",
    ...overrides,
  };
}

function run(overrides: Partial<RoutineRun> = {}): RoutineRun {
  return {
    id: "run1",
    routineId: "r1",
    botId: "chief",
    cause: "schedule",
    status: "running",
    reason: null,
    startedAt: "2026-11-13T04:01:00.000Z",
    finishedAt: null,
    deliveryId: null,
    ...overrides,
  };
}

function textEverywhere(database: OpenBotDatabase, needle: string): string[] {
  const db = database.connection;
  const found: string[] = [];
  for (const table of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()) {
    if (!isDynamicRecord(table) || !isString(table.name) || table.name.startsWith("sqlite_")) continue;
    for (const row of db.prepare(`SELECT * FROM "${table.name}"`).all()) {
      if (JSON.stringify(row).includes(needle)) found.push(table.name);
    }
  }
  return found;
}

describe("RoutineStore", () => {
  it("saves, lists by agent, updates and removes routines; they survive a restart", async () => {
    const { root, store } = await open();
    store.save(routine());
    store.save(routine({ id: "r2", botId: "research", name: "Other" }));
    expect(store.list().map((item) => item.id)).toEqual(["r1", "r2"]);
    expect(store.list("chief").map((item) => item.id)).toEqual(["r1"]);
    store.save({ ...routine(), paused: true, nextRunAt: null });
    expect(store.get("r1")).toMatchObject({ paused: true, nextRunAt: null });
    closeTestDatabases();

    const reopened = (await open(root)).store;
    expect(reopened.get("r1")).toMatchObject({ name: "Every minute", paused: true });
    reopened.remove("r1");
    expect(() => reopened.get("r1")).toThrow(/no longer exists/);
  });

  it("keeps the webhook secret encrypted and out of the event log", async () => {
    const { database, store } = await open();
    store.save(routine({ trigger: "webhook", schedule: null, webhook: { url: "", eventTypes: [] } }));
    store.setSecret("r1", "whsec_c2VjcmV0LXZhbHVlLWZvci10ZXN0LTEyMzQ1Njc4OTA=");
    expect(store.getSecret("r1")).toBe("whsec_c2VjcmV0LXZhbHVlLWZvci10ZXN0LTEyMzQ1Njc4OTA=");
    expect(textEverywhere(database, "c2VjcmV0LXZhbHVlLWZvci10ZXN0")).toEqual([]);
    store.setSecret("r1", null);
    expect(store.getSecret("r1")).toBeNull();
  });

  it("keeps a bounded run history, newest first", async () => {
    const { store } = await open();
    store.save(routine());
    for (let index = 0; index < 105; index += 1) {
      store.saveRun(run({ id: `run${index}`, startedAt: new Date(Date.UTC(2026, 10, 13, 4, index)).toISOString() }));
    }
    const runs = store.listRuns("r1");
    expect(runs).toHaveLength(100);
    expect(runs[0]?.id).toBe("run104");
    store.saveRun({ ...run({ id: "run104" }), status: "done", finishedAt: "2026-11-13T05:45:00.000Z" });
    expect(store.listRuns("r1")[0]).toMatchObject({ id: "run104", status: "done" });
    store.remove("r1");
    expect(store.listRuns("r1")).toEqual([]);
  });

  it("remembers webhook delivery ids for 7 days", async () => {
    const { store } = await open();
    const now = Date.parse("2026-11-13T04:00:00Z");
    expect(store.rememberDelivery("r1", "msg_1", now)).toBe(true);
    expect(store.rememberDelivery("r1", "msg_1", now + 1000)).toBe(false);
    expect(store.rememberDelivery("r2", "msg_1", now)).toBe(true);
    expect(store.rememberDelivery("r1", "msg_1", now + 7 * 24 * 3600 * 1000 + 1000)).toBe(true);
  });

  it("stores small settings such as the receiver port", async () => {
    const { store } = await open();
    expect(store.setting("receiverPort")).toBeNull();
    store.setSetting("receiverPort", "47900");
    expect(store.setting("receiverPort")).toBe("47900");
  });
});
