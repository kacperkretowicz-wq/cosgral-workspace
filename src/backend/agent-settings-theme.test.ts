// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, BotSummary, UpdateBotInput } from "@openbot/contracts/ipc";
import { afterEach, expect, it } from "vitest";
import { AgentSettingsService } from "./agent-settings";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function botFixture(overrides: Partial<BotSummary> = {}): BotSummary {
  return {
    id: "chief",
    name: "Chief",
    role: "Lead",
    description: "",
    notifications: true,
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    threadId: null,
    workspacePath: "C:\\work\\chief",
    preview: "No messages yet",
    updatedAt: null,
    avatarSeed: "chief",
    avatarHue: null,
    avatarUrl: null,
    ...overrides,
  };
}

async function open(root?: string) {
  const dir = root ?? (await mkdtemp(join(tmpdir(), "agent-settings-")));
  if (!root) roots.push(dir);
  const database = testDatabase(join(dir, "data"));
  await database.initialize();
  const bots = new Map([["chief", botFixture()]]);
  const updates: UpdateBotInput[] = [];
  const events: AgentEvent[] = [];
  const availability = { computer: false };
  const service = new AgentSettingsService({
    database,
    bot: (botId) => bots.get(botId) ?? null,
    models: () => [],
    updateBot: async (input) => {
      updates.push(input);
      const next = { ...(bots.get(input.botId) ?? botFixture()), ...input };
      bots.set(input.botId, next);
      return next;
    },
    memory: (botId) => ({
      botId,
      maxMemories: 512,
      customLimit: false,
      essentialCount: 1,
      searchableCount: 2,
      essentialInPrompt: 1,
      essentialPromptBytes: 40,
    }),
    skills: async () => [{ skillId: "s1", name: "weekly-report", installedVersion: 2, updateAvailable: false }],
    mcp: (botId) => [{ botId, serverId: "m1", enabled: false }],
    availability: () => availability,
    emit: (event) => events.push(event),
  });
  return { dir, database, service, bots, updates, events, availability };
}

it("persists theme across reopening and normalizes older or edited settings", async () => {
  const { dir, database, service, events } = await open();
  expect(service.appSettings().theme).toBe("system");
  await service.updateAppSettings({ theme: "light" });
  expect(events).toContainEqual({ type: "app-settings-changed", settings: service.appSettings() });
  database.close();
  const reopened = await open(dir);
  expect(reopened.service.appSettings().theme).toBe("light");
  await reopened.service.updateAppSettings({ language: "pl" });
  expect(reopened.service.appSettings().theme).toBe("light");
  reopened.database.connection
    .prepare("UPDATE projection_app_settings SET value_json = ? WHERE setting_key = 'app'")
    .run(JSON.stringify({ theme: "sepia" }));
  reopened.database.close();
  const repaired = await open(dir);
  expect(repaired.service.appSettings().theme).toBe("system");
});
