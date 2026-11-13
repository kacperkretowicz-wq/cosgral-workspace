// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { ProviderRegistry } from "./provider-registry";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const T0 = Date.parse("2026-11-13T06:00:00.000Z");

async function setup(root?: string) {
  const directory = root ?? (await mkdtemp(join(tmpdir(), "cosgral-providers-")));
  if (!root) roots.push(directory);
  const database = testDatabase(directory);
  await database.initialize();
  const clock = { now: T0 };
  const events: AgentEvent[] = [];
  const registry = new ProviderRegistry({
    database,
    emit: (event) => events.push(event),
    now: () => clock.now,
    timers: false,
  });
  return { root: directory, registry, clock, events };
}

describe("ProviderRegistry", () => {
  it("adds, edits and removes ACP agents; they survive a restart", async () => {
    const { root, registry, events } = await setup();
    const saved = registry.saveAcpAgent({
      id: "gemini",
      name: "Gemini CLI",
      command: "gemini",
      args: ["--experimental-acp"],
    });
    expect(saved).toMatchObject({ id: "gemini", name: "Gemini CLI", args: ["--experimental-acp"] });
    registry.saveAcpAgent({ id: "gemini", name: "Gemini", command: "gemini.cmd" });
    expect(registry.listAcpAgents()).toMatchObject([{ id: "gemini", name: "Gemini", command: "gemini.cmd", args: [] }]);
    expect(events.filter((event) => event.type === "acp-agents-changed")).toHaveLength(2);
    expect(() => registry.saveAcpAgent({ id: "Bad Id", name: "x", command: "x" })).toThrow(/id/);
    expect(() => registry.saveAcpAgent({ id: "x", name: "x", command: " " })).toThrow(/command/);
    closeTestDatabases();

    const reopened = (await setup(root)).registry;
    expect(reopened.listAcpAgents().map((agent) => agent.id)).toEqual(["gemini"]);
    reopened.removeAcpAgent({ id: "gemini" });
    expect(reopened.listAcpAgents()).toEqual([]);
  });

  it("keeps each agent's ordered fallback models, without duplicates, at most four", async () => {
    const { root, registry } = await setup();
    expect(registry.getFallbackModels("chief")).toEqual([]);
    expect(registry.setFallbackModels({ botId: "chief", fallbackModels: ["acp:gemini", "claude-sonnet-5"] })).toEqual([
      "acp:gemini",
      "claude-sonnet-5",
    ]);
    expect(() =>
      registry.setFallbackModels({ botId: "chief", fallbackModels: ["claude-sonnet-5", "claude-sonnet-5"] }),
    ).toThrow(/twice/);
    expect(() =>
      registry.setFallbackModels({
        botId: "chief",
        fallbackModels: ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol", "claude-opus-5", "claude-sonnet-5"],
      }),
    ).toThrow(/4/);
    closeTestDatabases();
    const reopened = (await setup(root)).registry;
    expect(reopened.getFallbackModels("chief")).toEqual(["acp:gemini", "claude-sonnet-5"]);
    reopened.deleteAgent("chief");
    expect(reopened.getFallbackModels("chief")).toEqual([]);
  });

  it("tracks limits with their reset time and unavailability with a short pause, per provider and ACP agent", async () => {
    const { registry, clock, events } = await setup();
    expect(registry.isUsable("acp:gemini")).toBe(true);
    registry.reportFailure("acp:gemini", { kind: "usage-limit", resetsAt: T0 / 1000 + 600, message: "Quota exceeded" });
    expect(registry.isUsable("acp:gemini")).toBe(false);
    expect(registry.isUsable("acp:opencode")).toBe(true);
    expect(registry.limitFor("acp", "acp:gemini")).toEqual({
      provider: "acp",
      limitId: "acp:gemini",
      resetsAt: T0 / 1000 + 600,
    });
    registry.reportFailure("claude-opus-5", { kind: "unavailable", resetsAt: null, message: "Overloaded" });
    expect(registry.isUsable("claude-sonnet-5")).toBe(false);
    expect(registry.listUsage()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "acp", model: "acp:gemini", state: "limited", reason: "Quota exceeded" }),
        expect.objectContaining({ provider: "claude", model: null, state: "unavailable", resetsAt: T0 / 1000 + 300 }),
      ]),
    );
    expect(events.filter((event) => event.type === "provider-usage-changed")).toHaveLength(2);

    clock.now = T0 + 301_000;
    registry.tick();
    expect(registry.isUsable("claude-opus-5")).toBe(true);
    expect(registry.isUsable("acp:gemini")).toBe(false);
    clock.now = T0 + 601_000;
    registry.tick();
    expect(registry.isUsable("acp:gemini")).toBe(true);
    expect(registry.listUsage().filter((usage) => usage.state !== "ok")).toEqual([]);
    expect(events.filter((event) => event.type === "provider-usage-changed").length).toBeGreaterThanOrEqual(3);
  });

  it("chooses the first usable model not tried yet for this message; a user error never counts", async () => {
    const { registry } = await setup();
    registry.setFallbackModels({ botId: "chief", fallbackModels: ["acp:gemini", "claude-sonnet-5"] });
    const tried = new Set<string>();
    expect(registry.chooseModel("chief", "gpt-5.6-luna", tried)).toBe("gpt-5.6-luna");
    tried.add("gpt-5.6-luna");
    registry.reportFailure("gpt-5.6-luna", { kind: "usage-limit", resetsAt: null, message: "limit" });
    expect(registry.chooseModel("chief", "gpt-5.6-luna", tried)).toBe("acp:gemini");
    tried.add("acp:gemini");
    expect(registry.chooseModel("chief", "gpt-5.6-luna", tried)).toBe("claude-sonnet-5");
    tried.add("claude-sonnet-5");
    expect(registry.chooseModel("chief", "gpt-5.6-luna", tried)).toBeNull();
    expect(registry.reportFailure("acp:gemini", { kind: null, resetsAt: null, message: "bad input" })).toBe(false);
    expect(registry.isUsable("acp:gemini")).toBe(true);
  });

  it("reads Codex's own usage windows as its limit", async () => {
    const { registry } = await setup();
    registry.updateCodexUsage({
      limits: [
        {
          id: "codex",
          primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: T0 / 1000 + 900 },
          secondary: null,
        },
      ],
    });
    expect(registry.isUsable("gpt-5.6-luna")).toBe(false);
    expect(registry.listUsage()).toContainEqual(
      expect.objectContaining({ provider: "codex", state: "limited", usedPercent: 100, resetsAt: T0 / 1000 + 900 }),
    );
    registry.updateCodexUsage({
      limits: [
        {
          id: "codex",
          primary: { usedPercent: 40, windowDurationMins: 300, resetsAt: T0 / 1000 + 900 },
          secondary: null,
        },
      ],
    });
    expect(registry.isUsable("gpt-5.6-luna")).toBe(true);
  });
});
