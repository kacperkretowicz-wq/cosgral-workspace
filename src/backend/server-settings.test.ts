// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgentEvent,
  defaultServerSettings,
  isAgentEvent,
  isServerSettings,
  type StorageReport,
} from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { ServerSettingsService } from "./server-settings";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const report = (reclaimable: number): StorageReport => ({
  totalBytes: 100,
  freeBytes: null,
  items: [{ id: "app-data", bytes: 100 }],
  reclaimableBytes: reclaimable,
  measuredAt: "2026-11-17T12:00:00.000Z",
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "server-settings-"));
  roots.push(root);
  const file = join(root, "server-settings.json");
  const events: AgentEvent[] = [];
  let logs = 40;
  const make = () =>
    new ServerSettingsService({
      file,
      emit: (event) => events.push(event),
      measure: async () => report(logs),
      clearLogs: async () => {
        logs = 0;
      },
    });
  return { file, events, settings: make(), make };
}

describe("ServerSettingsService (W12 BE-D)", () => {
  it("starts from the defaults and lists the 14 sections", async () => {
    const { settings } = await setup();
    expect(settings.get()).toEqual(defaultServerSettings());
    expect(settings.sections()).toHaveLength(14);
  });

  it("changes only what was named, sends one event with the whole settings and keeps it over a restart", async () => {
    const { settings, events, make } = await setup();
    const next = settings.update({ general: { name: "Home" }, agents: { busyMessage: "steer" } });
    expect(next.general.name).toBe("Home");
    expect(next.general.threadsPerAgent).toBe(4);
    expect(events).toHaveLength(1);
    expect(isAgentEvent(events[0])).toBe(true);
    const again = make().get();
    expect(again.general.name).toBe("Home");
    expect(again.agents.busyMessage).toBe("steer");
  });

  it("says nothing when nothing changes and refuses wrong values before anything is written", async () => {
    const { settings, events } = await setup();
    settings.update({ general: { name: "Home" } });
    events.length = 0;
    settings.update({ general: { name: "Home" } });
    expect(events).toEqual([]);
    expect(() => settings.update({ general: { maxThreads: 0 } })).toThrow();
    expect(() => settings.update({})).toThrow();
    expect(settings.get().general.maxThreads).toBeNull();
  });

  it("survives a damaged file and fixes single bad fields", async () => {
    const { file, make } = await setup();
    await writeFile(file, "{ nope");
    expect(make().get()).toEqual(defaultServerSettings());
    await writeFile(
      file,
      JSON.stringify({ general: { name: "Kept", threadsPerAgent: 99 }, agents: { busyMessage: "x" } }),
    );
    const read = make().get();
    expect(isServerSettings(read)).toBe(true);
    expect(read.general.name).toBe("Kept");
    expect(read.general.threadsPerAgent).toBe(4);
    expect(read.agents.busyMessage).toBe("queue");
  });

  it("measures the storage again on request and cleaning the logs returns a new measurement", async () => {
    const { settings } = await setup();
    expect((await settings.measureStorage()).reclaimableBytes).toBe(40);
    expect((await settings.clearLogs()).reclaimableBytes).toBe(0);
  });

  it("gives the default of a message sent while an agent works to the message queue", async () => {
    const { settings } = await setup();
    expect(settings.busyMessageDefault()).toBe("queue");
    settings.update({ agents: { busyMessage: "steer" } });
    expect(settings.busyMessageDefault()).toBe("steer");
  });
});
