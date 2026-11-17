// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentEvent, DEFAULT_UPDATE_PREFERENCES, type UpdatePreferences } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { UpdatePreferencesService } from "./update-preferences";

const folders: string[] = [];
afterEach(async () => {
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function setup(initial?: string) {
  const folder = await mkdtemp(join(tmpdir(), "cosgral-updprefs-"));
  folders.push(folder);
  const file = join(folder, "update-preferences.json");
  if (initial !== undefined) await writeFile(file, initial, "utf8");
  const events: AgentEvent[] = [];
  const applied: UpdatePreferences[] = [];
  const service = new UpdatePreferencesService({
    file,
    emit: (event) => events.push(event),
    apply: (preferences) => applied.push(preferences),
  });
  return { service, file, events, applied };
}

describe("update preferences (W12-KK g2)", () => {
  it("starts with the defaults, also from a missing, damaged or wrong file", async () => {
    expect((await setup()).service.get()).toEqual(DEFAULT_UPDATE_PREFERENCES);
    expect((await setup("{broken")).service.get()).toEqual(DEFAULT_UPDATE_PREFERENCES);
    expect((await setup(JSON.stringify({ checkEveryHours: 99999 }))).service.get()).toEqual(DEFAULT_UPDATE_PREFERENCES);
    expect(
      (await setup(JSON.stringify({ automaticChecks: false, automaticDownload: true }))).service.get(),
    ).toMatchObject({
      automaticChecks: false,
      automaticDownload: false,
    });
  });

  it("a change is written, applied, told once, and survives a restart", async () => {
    const { service, file, events, applied } = await setup();
    const next = await service.set({ automaticDownload: true, checkEveryHours: 12, includePrereleases: true });
    expect(next).toMatchObject({ automaticDownload: true, checkEveryHours: 12, includePrereleases: true });
    expect(applied.at(-1)).toEqual(next);
    expect(events.filter((event) => event.type === "update-preferences-changed")).toHaveLength(1);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(next);
    const again = new UpdatePreferencesService({ file, emit: () => undefined, apply: () => undefined });
    expect(again.get()).toEqual(next);
  });

  it("switching the checks off switches the download off; a bad request changes nothing", async () => {
    const { service, applied } = await setup();
    await service.set({ automaticDownload: true });
    const off = await service.set({ automaticChecks: false });
    expect(off).toMatchObject({ automaticChecks: false, automaticDownload: false });
    const count = applied.length;
    await expect(service.set({ checkEveryHours: 0 })).rejects.toThrow(/hours/);
    expect(service.get()).toEqual(off);
    expect(applied).toHaveLength(count);
  });
});
