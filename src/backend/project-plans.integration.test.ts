// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChannelEngine, type ChannelRunner } from "./channel-engine";
import { ChannelStore } from "./channel-store";
import { createProjectPlanService } from "./project-plans";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
const BOTS = new Set(["chief", "writer"]);

afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const REPLY = [
  "## Cel",
  "Otworzyć sklep.",
  "## Kolejność",
  "Najpierw sklep.",
  "## Skille do utworzenia",
  "### opis-produktu",
  "Opis: gdy trzeba opisać produkt.",
  "Instrukcja:",
  "Zapytaj o zapach.",
  "## Potrzebne narzędzia",
  "- GitHub",
].join("\n");

/** The real store, the real engine and the real database; only the model (the runner) and the skill library are stand-ins. */
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "cosgral-project-plans-"));
  roots.push(root);
  const database = testDatabase(root);
  await database.initialize();
  const store = new ChannelStore(database, { botExists: (id) => BOTS.has(id) });
  const prompts: string[] = [];
  const runner: ChannelRunner = {
    run: async ({ history }) => {
      prompts.push(history.at(-1)?.text ?? "");
      return { status: "completed", text: REPLY };
    },
  };
  const engine = new ChannelEngine(store, runner);
  engine.start();
  const skills = {
    findByName: vi.fn(() => null),
    create: vi.fn(async () => ({ id: "skill-1" })),
    install: vi.fn(async () => ({})),
  };
  const service = createProjectPlanService({
    database,
    channels: store,
    engine,
    skills,
    marketplace: { list: () => [] },
    plugins: () => null,
  });
  const channel = store.create({
    name: "sklep",
    title: "Sklep",
    instructions: "",
    memberBotIds: ["chief", "writer"],
    leadBotId: "chief",
    isolated: true,
  });
  return { database, store, engine, service, channel, skills, prompts };
}

describe("project plans with the real channel store and engine", () => {
  it("sends the description to the lead, reads its result as the plan and keeps the approved plan in the project memory", async () => {
    const { store, engine, service, channel, prompts } = await setup();
    service.saveDescription({ channelId: channel.id, description: "Otwieramy sklep ze świecami" });
    const requested = service.requestPlan({ channelId: channel.id });
    expect(requested.phase).toBe("planning");

    await vi.waitFor(() => expect(service.get({ channelId: channel.id })?.phase).toBe("proposed"), { timeout: 5_000 });
    const plan = service.get({ channelId: channel.id });
    expect(prompts[0]).toContain("Otwieramy sklep ze świecami");
    expect(plan?.sections.map((section) => section.aspect)).toEqual(["goal", "order"]);
    expect(plan?.skills.map((skill) => skill.name)).toEqual(["opis-produktu"]);
    expect(plan?.needs).toEqual(["GitHub"]);
    expect(store.listMemory(channel.id)).toEqual([]);

    service.accept({ channelId: channel.id });
    expect(store.listMemory(channel.id).map((entry) => entry.text)).toEqual([
      expect.stringContaining("Cel: Otworzyć sklep."),
    ]);
    await engine.stop();
  });

  it("creates the skills for every member only after the person says yes", async () => {
    const { engine, service, channel, skills } = await setup();
    service.saveDescription({ channelId: channel.id, description: "Sklep" });
    service.requestPlan({ channelId: channel.id });
    await vi.waitFor(() => expect(service.get({ channelId: channel.id })?.phase).toBe("proposed"), { timeout: 5_000 });
    service.accept({ channelId: channel.id });
    expect(skills.create).not.toHaveBeenCalled();

    const plan = await service.decideSkills({ channelId: channel.id, allow: true });
    expect(plan.skillsConsent).toBe("done");
    expect(skills.create).toHaveBeenCalledTimes(1);
    expect(skills.install.mock.calls.map(([input]) => input)).toEqual([
      { skillId: "skill-1", botId: "chief" },
      { skillId: "skill-1", botId: "writer" },
    ]);
    await engine.stop();
  });
});
