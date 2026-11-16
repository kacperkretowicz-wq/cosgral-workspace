// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "@openbot/contracts/ipc";
import { GENERAL_FALLBACK_SCOPE } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { ProviderRegistry } from "./provider-registry";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const EIGHT = [
  "gpt-5.6-luna",
  "gpt-5.6-terra",
  "gpt-5.6-sol",
  "claude-opus-5",
  "claude-sonnet-5",
  "acp:a",
  "acp:b",
  "acp:c",
] as const;

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
  return { root: directory, registry, clock, events, database };
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

  it("keeps each agent's ordered fallback models, without duplicates, at most eight", async () => {
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
        fallbackModels: [...EIGHT, "acp:i"],
      }),
    ).toThrow(/8/);
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
    registry.saveAcpAgent({ id: "gemini", name: "Gemini", command: "gemini" });
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

// W4-BE1: Providers and Usage say what onboarding says. The engine's provider states (AgentStatus.providers) are the
// one source; the registry never shows a missing or signed-out CLI as available.
describe("provider state from the engine", () => {
  it("shows a CLI that is not installed or not signed in as unavailable, with the engine's reason", async () => {
    const { registry, events } = await setup();
    registry.setProviderStatuses([
      { id: "codex", state: "available", version: "0.150.0", message: null },
      {
        id: "claude",
        state: "not-installed",
        version: null,
        message: "Claude CLI was not found. Install Claude Code, run `claude auth login`, then choose Try again.",
      },
    ]);
    const usage = registry.listUsage();
    expect(usage.find((item) => item.provider === "codex")).toMatchObject({ state: "ok", reason: null });
    expect(usage.find((item) => item.provider === "claude")).toMatchObject({
      state: "unavailable",
      reason: expect.stringContaining("Not installed"),
    });
    expect(events.at(-1)).toMatchObject({ type: "provider-usage-changed" });

    registry.setProviderStatuses([
      { id: "codex", state: "sign-in-required", version: "0.150.0", message: "Run `codex login` to use Codex." },
      { id: "claude", state: "checking", version: null, message: null },
    ]);
    const next = registry.listUsage();
    expect(next.find((item) => item.provider === "codex")).toMatchObject({
      state: "unavailable",
      reason: expect.stringContaining("Sign in required"),
    });
    expect(next.find((item) => item.provider === "claude")).toMatchObject({
      state: "unavailable",
      reason: "Checking",
    });
  });

  it("keeps a usage limit when the CLI is available", async () => {
    const { registry } = await setup();
    registry.setProviderStatuses([{ id: "codex", state: "available", version: "1", message: null }]);
    registry.reportFailure("gpt-5.6-luna", { kind: "usage-limit", message: "Limit reached", resetsAt: null });
    expect(registry.listUsage().find((item) => item.provider === "codex")?.state).toBe("limited");
  });

  it("emits nothing when the states did not change", async () => {
    const { registry, events } = await setup();
    const statuses = [{ id: "codex" as const, state: "available" as const, version: "1", message: null }];
    registry.setProviderStatuses(statuses);
    const count = events.length;
    registry.setProviderStatuses(structuredClone(statuses));
    expect(events.length).toBe(count);
  });
});

describe("ProviderRegistry fallback lists (W5-BE4)", () => {
  it("takes 0 and 8 models, refuses 9, a repeat and an unknown model, and keeps the old list on a refusal", async () => {
    const { registry } = await setup();
    expect(registry.setFallbackModels({ botId: "chief", fallbackModels: [] })).toEqual([]);
    expect(registry.setFallbackModels({ botId: "chief", fallbackModels: [...EIGHT] })).toEqual([...EIGHT]);
    expect(registry.getFallbackModels("chief")).toEqual([...EIGHT]);
    expect(() => registry.setFallbackModels({ botId: "chief", fallbackModels: [...EIGHT, "acp:i"] })).toThrow(
      /at most 8/i,
    );
    expect(() => registry.setFallbackModels({ botId: "chief", fallbackModels: ["acp:a", "acp:a"] })).toThrow(/twice/i);
    expect(() =>
      registry.setFallbackModels({ botId: "chief", fallbackModels: JSON.parse('["acp:a","nope"]') }),
    ).toThrow(/unknown/i);
    expect(registry.getFallbackModels("chief")).toEqual([...EIGHT]);
  });

  it("changes the order when the same models are saved in another order", async () => {
    const { registry } = await setup();
    registry.setFallbackModels({ botId: "chief", fallbackModels: ["acp:a", "claude-opus-5", "acp:b"] });
    registry.setFallbackModels({ botId: "chief", fallbackModels: ["acp:b", "acp:a", "claude-opus-5"] });
    expect(registry.getFallbackModels("chief")).toEqual(["acp:b", "acp:a", "claude-opus-5"]);
  });

  it("keeps a list saved before (up to 4 models) exactly as it was", async () => {
    const { registry } = await setup();
    registry.saveAcpAgent({ id: "gemini", name: "Gemini", command: "gemini" });
    registry.saveAcpAgent({ id: "backup", name: "Backup", command: "backup" });
    const old = ["acp:gemini", "claude-sonnet-5", "gpt-5.6-terra", "acp:backup"] as const;
    registry.setFallbackModels({ botId: "old-agent", fallbackModels: [...old] });
    expect(registry.getFallbackModels("old-agent")).toEqual([...old]);
    expect(registry.getFallbackInfo("old-agent")).toMatchObject({
      own: [...old],
      effective: [...old],
      unavailable: [],
    });
  });

  it("reads a damaged stored list safely: unknown models and repeats dropped, at most 8", async () => {
    const { registry, database } = await setup();
    const put = (id: string, json: string) =>
      database.connection
        .prepare("INSERT INTO projection_agent_fallback_models (agent_id, models_json, updated_at) VALUES (?, ?, ?)")
        .run(id, json, "2026-11-13T06:00:00.000Z");
    put("messy", JSON.stringify(["acp:a", "no-such", "acp:a", 7, "claude-opus-5"]));
    put("long", JSON.stringify([...EIGHT, "acp:d", "acp:e"]));
    put("broken", "{}");
    expect(registry.getFallbackModels("messy")).toEqual(["acp:a", "claude-opus-5"]);
    expect(registry.getFallbackModels("long")).toEqual([...EIGHT]);
    expect(registry.getFallbackModels("broken")).toEqual([]);
  });

  it("an agent without its own list follows the general list; its own list, even an empty one, wins", async () => {
    const { registry } = await setup();
    registry.saveAcpAgent({ id: "a", name: "A", command: "a" });
    registry.setFallbackModels({ botId: GENERAL_FALLBACK_SCOPE, fallbackModels: ["acp:a", "claude-opus-5"] });
    expect(registry.getFallbackInfo("chief")).toMatchObject({
      botId: "chief",
      own: null,
      general: ["acp:a", "claude-opus-5"],
      effective: ["acp:a", "claude-opus-5"],
      unavailable: [],
    });
    expect(registry.chooseModel("chief", "gpt-5.6-luna", new Set(["gpt-5.6-luna"]))).toBe("acp:a");

    registry.setFallbackModels({ botId: "chief", fallbackModels: ["claude-sonnet-5"] });
    expect(registry.getFallbackInfo("chief")).toMatchObject({
      own: ["claude-sonnet-5"],
      effective: ["claude-sonnet-5"],
    });
    expect(registry.chooseModel("chief", "gpt-5.6-luna", new Set(["gpt-5.6-luna"]))).toBe("claude-sonnet-5");

    registry.setFallbackModels({ botId: "chief", fallbackModels: [] });
    expect(registry.getFallbackInfo("chief")).toMatchObject({ own: [], effective: [] });
    expect(registry.chooseModel("chief", "gpt-5.6-luna", new Set(["gpt-5.6-luna"]))).toBeNull();

    expect(registry.resetFallbackModels("chief")).toMatchObject({ own: null, effective: ["acp:a", "claude-opus-5"] });
    expect(registry.chooseModel("chief", "gpt-5.6-luna", new Set(["gpt-5.6-luna"]))).toBe("acp:a");
  });

  it("deleting an agent never touches the general list, and the general list can be emptied", async () => {
    const { registry } = await setup();
    registry.setFallbackModels({ botId: GENERAL_FALLBACK_SCOPE, fallbackModels: ["claude-opus-5"] });
    registry.setFallbackModels({ botId: "chief", fallbackModels: ["claude-sonnet-5"] });
    registry.deleteAgent("chief");
    expect(registry.getFallbackModels(GENERAL_FALLBACK_SCOPE)).toEqual(["claude-opus-5"]);
    expect(registry.resetFallbackModels(GENERAL_FALLBACK_SCOPE).general).toEqual([]);
  });

  it("skips a model whose ACP agent was removed, shows it as unavailable, and keeps it in the list", async () => {
    const { registry } = await setup();
    registry.saveAcpAgent({ id: "gone", name: "Gone", command: "gone" });
    registry.saveAcpAgent({ id: "kept", name: "Kept", command: "kept" });
    registry.setFallbackModels({ botId: "chief", fallbackModels: ["acp:gone", "acp:kept", "claude-opus-5"] });
    registry.removeAcpAgent({ id: "gone" });
    expect(registry.getFallbackModels("chief")).toEqual(["acp:gone", "acp:kept", "claude-opus-5"]);
    expect(registry.getFallbackInfo("chief")).toMatchObject({
      own: ["acp:gone", "acp:kept", "claude-opus-5"],
      effective: ["acp:kept", "claude-opus-5"],
      unavailable: ["acp:gone"],
    });
    expect(registry.chooseModel("chief", "gpt-5.6-luna", new Set(["gpt-5.6-luna"]))).toBe("acp:kept");
    // The same ACP agent added again works again.
    registry.saveAcpAgent({ id: "gone", name: "Gone", command: "gone" });
    expect(registry.getFallbackInfo("chief").unavailable).toEqual([]);
  });

  it("walks all 8 models in order, one try each, and stops: no loop", async () => {
    const { registry } = await setup();
    for (const id of ["a", "b", "c"]) registry.saveAcpAgent({ id, name: id, command: id });
    registry.setFallbackModels({ botId: "chief", fallbackModels: [...EIGHT] });
    const tried = new Set<string>();
    const order: string[] = [];
    for (let step = 0; step < 12; step += 1) {
      const next = registry.chooseModel("chief", "gpt-5.6-luna", tried);
      if (!next) break;
      order.push(next);
      tried.add(next);
    }
    expect(order).toEqual(["gpt-5.6-luna", ...EIGHT.filter((model) => model !== "gpt-5.6-luna")]);
  });

  it("a limit of the provider blocks its other models too, so a fallback on the same provider is not a way around it", async () => {
    const { registry } = await setup();
    registry.setFallbackModels({ botId: "chief", fallbackModels: ["gpt-5.6-terra", "claude-sonnet-5"] });
    registry.reportFailure("gpt-5.6-luna", { kind: "usage-limit", resetsAt: null, message: "limit" });
    expect(registry.chooseModel("chief", "gpt-5.6-luna", new Set(["gpt-5.6-luna"]))).toBe("claude-sonnet-5");
  });

  it("chooses models only: it never picks an account, so a fallback never moves an agent to another account", async () => {
    const { registry } = await setup();
    registry.setFallbackModels({ botId: "chief", fallbackModels: ["gpt-5.6-terra"] });
    expect(registry.chooseModel("chief", "gpt-5.6-luna", new Set(["gpt-5.6-luna"]))).toBe("gpt-5.6-terra");
  });

  it("W5-BE5: a free account of the pool lifts a Codex limit known here, and only for that provider", async () => {
    const { registry } = await setup();
    registry.setFallbackModels({ botId: "chief", fallbackModels: ["gpt-5.6-terra", "claude-sonnet-5"] });
    registry.reportFailure("gpt-5.6-luna", { kind: "usage-limit", resetsAt: null, message: "limit" });
    registry.reportFailure("claude-sonnet-5", { kind: "usage-limit", resetsAt: null, message: "limit" });
    const codexFree = (provider: string) => provider === "codex";
    expect(registry.chooseModel("chief", "gpt-5.6-luna", new Set(), codexFree)).toBe("gpt-5.6-luna");
    expect(registry.chooseModel("chief", "gpt-5.6-luna", new Set(["gpt-5.6-luna"]), codexFree)).toBe("gpt-5.6-terra");
    // No free account: the limit holds for every Codex model, and a Claude limit is not lifted by a Codex account.
    expect(registry.chooseModel("chief", "gpt-5.6-luna", new Set(), () => false)).toBeNull();
    expect(
      registry.chooseModel("chief", "gpt-5.6-luna", new Set(["gpt-5.6-luna", "gpt-5.6-terra"]), codexFree),
    ).toBeNull();
  });

  it("W5-BE5: skips a model of a removed own endpoint and shows it as unavailable", async () => {
    const { registry } = await setup();
    const kept = "endpoint:local-llm/llama3:8b";
    const gone = "endpoint:old-box/llama3:8b";
    registry.setFallbackModels({ botId: "chief", fallbackModels: [gone, kept] });
    // Without a lookup (no endpoint store attached) the list is taken as it is.
    expect(registry.getFallbackInfo("chief")).toMatchObject({ effective: [gone, kept], unavailable: [] });
    registry.useEndpointLookup((id) => id === "local-llm");
    expect(registry.getFallbackInfo("chief")).toMatchObject({
      own: [gone, kept],
      effective: [kept],
      unavailable: [gone],
    });
    expect(registry.chooseModel("chief", "gpt-5.6-luna", new Set(["gpt-5.6-luna"]))).toBe(kept);
  });
});
