// @vitest-environment node
import {
  type AgentEvent,
  DEFAULT_UPDATE_PREFERENCES,
  isApplyTransferResult,
  isExportInstanceResult,
  isImportSourceInfo,
  isInstanceTransferSummary,
  isTransferPreview,
  isUpdatePreferences,
  isUpdatePreferencesChanged,
  mergeUpdatePreferences,
  parseApplyTransferInput,
  parseExportInstanceInput,
  parseSetUpdatePreferencesInput,
} from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockInstanceTransfer } from "./mock-instance-transfer";

const setup = () => {
  const events: AgentEvent[] = [];
  return { mock: createMockInstanceTransfer((event) => events.push(event)), events };
};

describe("transfer contract rules (W12-KK g2)", () => {
  it("requests are checked", () => {
    expect(parseExportInstanceInput({ agentIds: ["a", "a", "b"], includeSettings: false })).toEqual({
      agentIds: ["a", "b"],
      includeSettings: false,
    });
    expect(() => parseExportInstanceInput({ agentIds: [], includeSettings: false })).toThrow(/at least one/);
    expect(parseExportInstanceInput({ agentIds: [], includeSettings: true }).includeSettings).toBe(true);
    expect(() => parseExportInstanceInput({ agentIds: "a", includeSettings: true })).toThrow(/not valid/);
    expect(() => parseApplyTransferInput({ token: "", keys: ["a"], includeSettings: false })).toThrow(/Choose a file/);
    expect(() => parseApplyTransferInput({ token: "t", keys: [], includeSettings: false })).toThrow(/at least one/);
  });

  it("update preferences: bounds, and no download by itself without the checks", () => {
    expect(() => parseSetUpdatePreferencesInput({ checkEveryHours: 0 })).toThrow(/hours/);
    expect(() => parseSetUpdatePreferencesInput({ checkEveryHours: 1.5 })).toThrow(/hours/);
    expect(() => parseSetUpdatePreferencesInput({ installOnQuit: "yes" })).toThrow(/true or false/);
    const on = mergeUpdatePreferences(DEFAULT_UPDATE_PREFERENCES, { automaticDownload: true });
    expect(on.automaticDownload).toBe(true);
    expect(mergeUpdatePreferences(on, { automaticChecks: false })).toMatchObject({
      automaticChecks: false,
      automaticDownload: false,
    });
  });
});

describe("mock transfer (W12-KK g2)", () => {
  it("summary lists agents and says what is not carried", async () => {
    const { mock } = setup();
    const summary = await mock.transfer.summary();
    expect(isInstanceTransferSummary(summary)).toBe(true);
    expect(summary.agents).toHaveLength(3);
    expect(summary.capabilities).toEqual({ settings: true, files: false, history: false });
  });

  it("export saves, or says cancelled when the dialog is closed; a wrong agent is refused", async () => {
    const { mock } = setup();
    const saved = await mock.transfer.exportAgents({ agentIds: ["demo-chief"], includeSettings: false });
    expect(isExportInstanceResult(saved)).toBe(true);
    expect(saved).toMatchObject({ status: "saved", agents: 1 });
    mock.simulate.cancelNextExport();
    expect(await mock.transfer.exportAgents({ agentIds: ["demo-chief"], includeSettings: false })).toEqual({
      status: "cancelled",
    });
    await expect(mock.transfer.exportAgents({ agentIds: ["nope"], includeSettings: false })).rejects.toThrow(
      /does not exist/,
    );
  });

  it("choose only stages: nothing exists until apply; apply makes new agents with numbered names and reports the rest", async () => {
    const { mock } = setup();
    mock.simulate.existingNames(["Chief"]);
    const preview = await mock.transfer.choose();
    expect(preview && isTransferPreview(preview)).toBe(true);
    expect(preview?.agents.map((agent) => [agent.key, agent.nameTaken])).toEqual([
      ["chief", true],
      ["analyst", false],
    ]);
    if (!preview) return;
    const result = await mock.transfer.apply({ token: preview.token, keys: ["chief"], includeSettings: true });
    expect(isApplyTransferResult(result)).toBe(true);
    expect(result.agents).toEqual([{ key: "chief", id: "imported-chief", name: "Chief (imported 2)" }]);
    expect(result.skipped).toEqual([{ key: "analyst", reason: "unselected" }]);
    expect(result.warnings.join(" ")).toMatch(/paused/);
    expect(result.settingsApplied).toBe(true);
    // The token is used up.
    await expect(
      mock.transfer.apply({ token: preview.token, keys: ["chief"], includeSettings: false }),
    ).rejects.toThrow(/no longer staged/);
  });

  it("a closed dialog answers null, and a discarded file cannot be applied", async () => {
    const { mock } = setup();
    mock.simulate.nextFile(null);
    expect(await mock.transfer.choose()).toBeNull();
    const preview = await mock.transfer.choose();
    if (!preview) throw new Error("no preview");
    await mock.transfer.discard({ token: preview.token });
    await expect(
      mock.transfer.apply({ token: preview.token, keys: ["chief"], includeSettings: false }),
    ).rejects.toThrow(/no longer staged/);
  });

  it("import sources: a zip and another computer work, Hermes says why not", async () => {
    const { mock } = setup();
    const sources = await mock.transfer.importSources();
    expect(sources.every(isImportSourceInfo)).toBe(true);
    expect(sources.map((source) => [source.id, source.available])).toEqual([
      ["agent-zip", true],
      ["hermes", false],
      ["other-computer", true],
    ]);
    expect(sources.find((source) => source.id === "hermes")?.note).toMatch(/not supported/);
  });
});

describe("mock update preferences (W12-KK g2)", () => {
  it("get/set with an event, and switching the checks off switches the download off", async () => {
    const { mock, events } = setup();
    const start = await mock.updates.get();
    expect(isUpdatePreferences(start)).toBe(true);
    await mock.updates.set({ automaticDownload: true, checkEveryHours: 12 });
    expect(await mock.updates.get()).toMatchObject({ automaticDownload: true, checkEveryHours: 12 });
    const off = await mock.updates.set({ automaticChecks: false });
    expect(off).toMatchObject({ automaticChecks: false, automaticDownload: false });
    expect(isUpdatePreferencesChanged(events.at(-1))).toBe(true);
    await expect(mock.updates.set({ checkEveryHours: 1000 })).rejects.toThrow(/hours/);
  });
});
