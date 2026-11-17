import { describe, expect, it } from "vitest";
import { isAgentEvent } from "./ipc-conversation";
import {
  applyServerSettingsChanges,
  defaultServerSettings,
  isServerSettings,
  isServerSettingsChanged,
  isServerSettingsSections,
  isStorageReport,
  MEMORY_REVIEW_INTERVALS,
  parseUpdateServerSettingsInput,
  SERVER_SETTINGS_LIMITS,
  SERVER_SETTINGS_SECTIONS,
  serverSettingsSections,
} from "./ipc-server-settings";

describe("server settings contract (W12 BE-D)", () => {
  it("lists the 14 sections once each, in the order of the window, with a source for every one", () => {
    expect(SERVER_SETTINGS_SECTIONS).toHaveLength(14);
    const sections = serverSettingsSections();
    expect(isServerSettingsSections(sections)).toBe(true);
    expect(sections.map((section) => section.id)).toEqual([...SERVER_SETTINGS_SECTIONS]);
    const kinds = Object.fromEntries(sections.map((section) => [section.id, section.source.kind]));
    expect(kinds).toMatchObject({
      general: "settings",
      storage: "settings",
      vault: "api",
      members: "unavailable",
      sites: "unavailable",
    });
    expect(isServerSettingsSections(sections.slice(1))).toBe(false);
    expect(isServerSettingsSections([...sections].reverse())).toBe(false);
  });

  it("starts from defaults that the guard accepts", () => {
    const defaults = defaultServerSettings();
    expect(isServerSettings(defaults)).toBe(true);
    expect(defaults.general.threadsPerAgent).toBe(4);
    expect(defaults.general.memoriesPerAgent).toBe(256);
    expect(defaults.agents.busyMessage).toBe("queue");
  });

  it("parses a partial change per section and keeps what was left out", () => {
    const changes = parseUpdateServerSettingsInput({
      general: { name: "  Home  ", timezone: "Europe/Warsaw", maxThreads: null },
      agents: { busyMessage: "steer" },
    });
    expect(changes.general).toEqual({ name: "Home", timezone: "Europe/Warsaw", maxThreads: null });
    const next = applyServerSettingsChanges(defaultServerSettings(), changes);
    expect(next.general).toMatchObject({ name: "Home", timezone: "Europe/Warsaw", threadsPerAgent: 4 });
    expect(next.agents.busyMessage).toBe("steer");
    expect(next.personality.responseStyle).toBe("natural");
  });

  it("refuses wrong values with a plain sentence", () => {
    const L = SERVER_SETTINGS_LIMITS;
    const bad: unknown[] = [
      null,
      {},
      { general: {} },
      { general: { name: "   " } },
      { general: { name: "x".repeat(L.nameMax + 1) } },
      { general: { timezone: "Mars/Olympus" } },
      { general: { maxThreads: 0 } },
      { general: { maxThreads: L.maxThreads + 1 } },
      { general: { threadsPerAgent: 1.5 } },
      { general: { memoriesPerAgent: L.minMemories - 1 } },
      { general: { memoryReviewEvery: 7 } },
      { general: { skillLearning: "always" } },
      { general: { learnFromBrowsing: "yes" } },
      { general: { logo: "http://example.com/a.png" } },
      { personality: { responseStyle: "poetic" } },
      { agents: { busyMessage: "interrupt" } },
      { agents: { localScripts: 1 } },
    ];
    for (const input of bad) expect(() => parseUpdateServerSettingsInput(input), JSON.stringify(input)).toThrow();
    expect(MEMORY_REVIEW_INTERVALS).toContain(20);
  });

  it("limits the logo to a small image data URL", () => {
    const small = `data:image/png;base64,${"A".repeat(100)}`;
    expect(parseUpdateServerSettingsInput({ general: { logo: small } }).general?.logo).toBe(small);
    expect(parseUpdateServerSettingsInput({ general: { logo: null } }).general?.logo).toBeNull();
    const huge = `data:image/png;base64,${"A".repeat(SERVER_SETTINGS_LIMITS.logoBytes * 2)}`;
    expect(() => parseUpdateServerSettingsInput({ general: { logo: huge } })).toThrow("at most");
  });

  it("checks a storage report and refuses negative or fractional sizes", () => {
    const report = {
      totalBytes: 10,
      freeBytes: null,
      items: [{ id: "chat-history", bytes: 4 }],
      reclaimableBytes: 0,
      measuredAt: "2026-11-17T12:00:00.000Z",
    };
    expect(isStorageReport(report)).toBe(true);
    expect(isStorageReport({ ...report, totalBytes: -1 })).toBe(false);
    expect(isStorageReport({ ...report, items: [{ id: "chat-history", bytes: 1.5 }] })).toBe(false);
    expect(isStorageReport({ ...report, items: [{ id: "logs", bytes: 1 }] })).toBe(false);
  });

  it("knows the settings event as an agent event", () => {
    const event = { type: "server-settings-changed", settings: defaultServerSettings() };
    expect(isServerSettingsChanged(event)).toBe(true);
    expect(isAgentEvent(event)).toBe(true);
    expect(isAgentEvent({ type: "server-settings-changed", settings: { general: {} } })).toBe(false);
  });
});
