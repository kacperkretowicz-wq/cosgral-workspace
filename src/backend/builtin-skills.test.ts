// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { isBuiltinSkillPack } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { BuiltinSkills, programOnPath } from "./builtin-skills";
import { BUILTIN_PACKS, type BuiltinPackSpec } from "./builtin-skills-catalog";
import { SkillLibrary } from "./skill-library";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const SHIPPED = resolve(__dirname, "../../resources/builtin-skills");
const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup(options: { root?: string; packs?: readonly BuiltinPackSpec[]; programFound?: boolean } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "builtin-skills-"));
  roots.push(dir);
  const database = testDatabase(join(dir, "data"));
  await database.initialize();
  const bots = ["chief", "writer"];
  let protectedCheck: (skillId: string) => boolean = () => false;
  const library = new SkillLibrary({
    database,
    root: join(dir, "Skills"),
    workspaceFor: (botId) => join(dir, "Bots", botId),
    isProtected: (skillId) => protectedCheck(skillId),
  });
  const builtin = new BuiltinSkills({
    database,
    library,
    root: options.root ?? SHIPPED,
    botIds: () => bots,
    hasProgram: async () => options.programFound ?? false,
    ...(options.packs ? { packs: options.packs } : {}),
  });
  protectedCheck = (skillId) => builtin.isBuiltin(skillId);
  return { dir, bots, database, library, builtin };
}

async function writeSkill(folder: string, name: string, body = "Do the work.") {
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "SKILL.md"), `---\nname: ${name}\ndescription: Test skill ${name}.\n---\n${body}\n`);
}

function spec(overrides: Partial<BuiltinPackSpec> = {}): BuiltinPackSpec {
  return {
    id: "superpowers",
    title: "Superpowers",
    summary: "s",
    whenToUse: "w",
    license: "MIT",
    sourceUrl: "https://example.test",
    sourceVersion: "1",
    bundleVersion: 1,
    folder: "pack",
    defaultForNewAgents: false,
    program: null,
    ...overrides,
  };
}

describe("shipped built-in skills", () => {
  it("every shipped skill passes the library's own checks, with its license next to it", async () => {
    const { builtin, library } = await setup();
    const packs = await builtin.list();
    expect(packs.map((pack) => pack.id)).toEqual(["superpowers", "i-have-adhd", "graphify"]);
    for (const pack of packs) {
      expect(isBuiltinSkillPack(pack)).toBe(true);
      expect(pack.skills.length).toBeGreaterThan(0);
      for (const skill of pack.skills) expect(skill, `${pack.id}/${skill.name}`).toMatchObject({ state: "ready" });
    }
    expect(packs.find((pack) => pack.id === "superpowers")?.skills).toHaveLength(15);
    expect(library.list()).toHaveLength(17);
    for (const pack of BUILTIN_PACKS) {
      expect(existsSync(join(SHIPPED, pack.folder, "LICENSE")), `${pack.id} LICENSE`).toBe(true);
      expect(existsSync(join(SHIPPED, pack.folder, "SOURCE.md")), `${pack.id} SOURCE.md`).toBe(true);
    }
    const licenseInSkill = await readFile(join(SHIPPED, "graphify/skills/graphify/NOTICE"), "utf8");
    expect(licenseInSkill).toContain("Apache License, Version 2.0");
  });

  it("keeps the upstream text of the skills", async () => {
    const { builtin, library } = await setup();
    await builtin.list();
    const adhd = library.findByName("i-have-adhd");
    expect(adhd?.description).toContain("Shape output for a reader with ADHD");
    expect(library.findByName("graphify")?.description).toContain("knowledge graph");
    expect(library.findByName("brainstorming")?.description).toContain("You MUST use this before any creative work");
  });

  it("gives the sets to new agents as the person chose, and graphify only after they ask", async () => {
    const { builtin, library } = await setup();
    const before = await builtin.list();
    expect(before.map((pack) => pack.defaultForNewAgents)).toEqual([true, true, false]);
    await builtin.applyDefaults("chief");
    expect(library.installedFor("chief").map((skill) => skill.name)).toContain("brainstorming");
    expect(library.installedFor("chief").map((skill) => skill.name)).toContain("i-have-adhd");
    expect(library.installedFor("chief").map((skill) => skill.name)).not.toContain("graphify");

    await builtin.setDefault({ packId: "superpowers", enabled: false });
    await builtin.setDefault({ packId: "graphify", enabled: true });
    await builtin.applyDefaults("writer");
    const writer = library.installedFor("writer").map((skill) => skill.name);
    expect(writer).not.toContain("brainstorming");
    expect(writer).toContain("graphify");
  });
});

describe("built-in skills control", () => {
  it("turns a set on and off for chosen agents, and says who has it", async () => {
    const { builtin, library } = await setup();
    let packs = await builtin.apply({ packId: "superpowers", botIds: ["chief"], enabled: true });
    expect(packs[0]?.installedBotIds).toEqual(["chief"]);
    expect(packs[0]?.partialBotIds).toEqual([]);
    expect(library.installedFor("chief")).toHaveLength(15);
    // The same request twice changes nothing.
    packs = await builtin.apply({ packId: "superpowers", botIds: ["chief"], enabled: true });
    expect(library.installedFor("chief")).toHaveLength(15);

    const one = library.findByName("brainstorming");
    if (!one) throw new Error("brainstorming is missing");
    await library.uninstall({ skillId: one.id, botId: "chief" });
    packs = await builtin.list();
    expect(packs[0]?.installedBotIds).toEqual([]);
    expect(packs[0]?.partialBotIds).toEqual(["chief"]);

    packs = await builtin.apply({ packId: "superpowers", botIds: ["chief"], enabled: false });
    expect(packs[0]?.partialBotIds).toEqual([]);
    expect(library.installedFor("chief")).toHaveLength(0);
  });

  it("refuses an agent that does not exist and a set that does not exist", async () => {
    const { builtin } = await setup();
    await expect(builtin.apply({ packId: "superpowers", botIds: ["ghost"], enabled: true })).rejects.toThrow(
      "This agent does not exist.",
    );
  });

  it("keeps built-in skills in the library when someone tries to delete them", async () => {
    const { builtin, library } = await setup();
    await builtin.list();
    const skill = library.findByName("graphify");
    if (!skill) throw new Error("graphify is missing");
    await expect(library.delete({ skillId: skill.id })).rejects.toThrow("built-in skill");
    expect(library.findByName("graphify")).not.toBeNull();
  });

  it("tells whether the graphify program is on this computer", async () => {
    const missing = await setup({ programFound: false });
    const found = await setup({ programFound: true });
    expect((await missing.builtin.list()).find((pack) => pack.id === "graphify")?.program).toEqual({
      command: "graphify",
      installCommand: "uv tool install graphifyy",
      found: false,
    });
    expect((await found.builtin.list()).find((pack) => pack.id === "graphify")?.program?.found).toBe(true);
    expect((await found.builtin.list()).find((pack) => pack.id === "superpowers")?.program).toBeNull();
  });
});

describe("built-in skills sync", () => {
  it("leaves a skill of the person's own alone when it has the same name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "builtin-skills-ship-"));
    roots.push(dir);
    const root = join(dir, "ship");
    await writeSkill(join(root, "pack", "skills", "plan-first"), "plan-first", "Shipped text.");
    const mine = join(dir, "mine");
    await writeSkill(mine, "plan-first", "My own text.");
    const { library, builtin } = await setup({ root, packs: [spec()] });
    const own = await library.create({ source: { kind: "folder", path: mine }, authorBotId: null });
    const [pack] = await builtin.list();
    expect(pack?.skills).toEqual([
      { name: "plan-first", description: "Test skill plan-first.", skillId: own.id, state: "name-taken" },
    ]);
    expect(library.get(own.id).version).toBe(1);
    expect(builtin.isBuiltin(own.id)).toBe(false);
    await expect(builtin.apply({ packId: "superpowers", botIds: ["chief"], enabled: true })).rejects.toThrow(
      "not in the library",
    );
  });

  it("adds a new version when the shipped files change, and keeps agents' copies until they update", async () => {
    const dir = await mkdtemp(join(tmpdir(), "builtin-skills-ship-"));
    roots.push(dir);
    const root = join(dir, "ship");
    await writeSkill(join(root, "pack", "skills", "plan-first"), "plan-first", "Version one.");
    const first = await setup({ root, packs: [spec()] });
    await first.builtin.apply({ packId: "superpowers", botIds: ["chief"], enabled: true });
    const skill = first.library.findByName("plan-first");
    expect(skill?.version).toBe(1);

    await writeSkill(join(root, "pack", "skills", "plan-first"), "plan-first", "Version two.");
    const next = new BuiltinSkills({
      database: first.database,
      library: first.library,
      root,
      botIds: () => first.bots,
      packs: [spec({ bundleVersion: 2 })],
    });
    await next.ready();
    expect(first.library.findByName("plan-first")?.version).toBe(2);
    const [installed] = await first.library.listInstalls({ botId: "chief" });
    expect(installed).toMatchObject({ installedVersion: 1, updateAvailable: true });
    // Giving the set again moves the agent to the new version.
    await next.apply({ packId: "superpowers", botIds: ["chief"], enabled: true });
    const [moved] = await first.library.listInstalls({ botId: "chief" });
    expect(moved).toMatchObject({ installedVersion: 2, updateAvailable: false });
  });

  it("reports a pack whose files are missing instead of failing", async () => {
    const { builtin } = await setup({ root: join(tmpdir(), "does-not-exist-builtin"), packs: [spec()] });
    const [pack] = await builtin.list();
    expect(pack?.skills).toEqual([]);
    await expect(builtin.apply({ packId: "superpowers", botIds: ["chief"], enabled: true })).rejects.toThrow(
      "not in the library",
    );
  });
});

describe("programOnPath", () => {
  it("finds a program in a given folder and says no for one that is not there", async () => {
    const dir = await mkdtemp(join(tmpdir(), "builtin-path-"));
    roots.push(dir);
    const name = process.platform === "win32" ? "tool.exe" : "tool";
    await writeFile(join(dir, name), "#!/bin/sh\n", { mode: 0o755 });
    expect(await programOnPath("tool", [dir])).toBe(true);
    expect(await programOnPath("no-such-program-cosgral", [dir])).toBe(false);
  });
});
