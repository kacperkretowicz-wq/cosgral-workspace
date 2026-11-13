// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LocalSkill, SkillInstall } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { SkillLibrary } from "./skill-library";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup(root?: string, limits?: ConstructorParameters<typeof SkillLibrary>[0]["limits"]) {
  const dir = root ?? (await mkdtemp(join(tmpdir(), "skill-library-")));
  if (!root) roots.push(dir);
  const database = testDatabase(join(dir, "data"));
  await database.initialize();
  const events: Array<{ skills?: LocalSkill[]; installs?: SkillInstall[] }> = [];
  const library = new SkillLibrary({
    database,
    root: join(dir, "Skills"),
    workspaceFor: (botId) => join(dir, "Bots", botId),
    limits,
  });
  library.on("skills-changed", (skills) => events.push({ skills }));
  library.on("installs-changed", (installs) => events.push({ installs }));
  return { dir, library, events };
}

async function writeSkill(
  folder: string,
  frontMatter: string,
  body = "## Steps\n1. Read the shared table.\n2. Write the report.\n",
  files: Record<string, string> = {},
): Promise<string> {
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "SKILL.md"), `---\n${frontMatter}\n---\n${body}`);
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(folder, path, ".."), { recursive: true });
    await writeFile(join(folder, path), content);
  }
  return folder;
}

const WEEKLY =
  "name: weekly-report\ndescription: Builds the weekly sales report.\nexample-prompt: Prepare this week's report";

describe("skill library", () => {
  it("creates a skill from a folder without running it and keeps it after a restart", async () => {
    const { dir, library, events } = await setup();
    const source = await writeSkill(join(dir, "draft"), WEEKLY, undefined, {
      "scripts/run.ps1": "Write-Output 'never run by the library'",
      "references/notes.md": "Use the Sales table.",
    });
    const skill = await library.create({ source: { kind: "folder", path: source }, authorBotId: "chief" });
    expect(skill).toMatchObject({
      name: "weekly-report",
      description: "Builds the weekly sales report.",
      examplePrompt: "Prepare this week's report",
      version: 1,
      createdByBotId: "chief",
    });
    expect(existsSync(join(skill.path, "SKILL.md"))).toBe(true);
    expect(events.at(-1)?.skills?.map((item) => item.name)).toEqual(["weekly-report"]);
    closeTestDatabases();

    const { library: reopened } = await setup(dir);
    expect(reopened.list().map((item) => item.name)).toEqual(["weekly-report"]);
    const content = await reopened.read({ skillId: skill.id });
    expect(content.version).toBe(1);
    expect(content.skillMd).toContain("2. Write the report.");
    expect(content.files.map((file) => file.path)).toEqual(["SKILL.md", "references/notes.md", "scripts/run.ps1"]);
  });

  it("revises only from the latest version, keeps every version and restores an old one as a new version", async () => {
    const { dir, library } = await setup();
    const first = await library.create({
      source: { kind: "inline", skillMd: `---\n${WEEKLY}\n---\nVersion one steps.\n` },
      authorBotId: "chief",
    });
    const second = await library.revise({
      skillId: first.id,
      baseVersion: 1,
      source: {
        kind: "inline",
        skillMd: "---\nname: weekly-report\ndescription: Report with charts.\n---\nVersion two steps.\n",
      },
      authorBotId: "chief",
      note: "Add charts",
    });
    expect(second).toMatchObject({ version: 2, description: "Report with charts." });
    await expect(
      library.revise({
        skillId: first.id,
        baseVersion: 1,
        source: { kind: "inline", skillMd: `---\n${WEEKLY}\n---\nStale edit.\n` },
        authorBotId: "writer",
      }),
    ).rejects.toThrow(/latest version/);
    await expect(
      library.revise({
        skillId: first.id,
        baseVersion: 2,
        source: { kind: "inline", skillMd: "---\nname: renamed\ndescription: x\n---\n" },
        authorBotId: "chief",
      }),
    ).rejects.toThrow(/name/);
    expect((await library.read({ skillId: first.id, version: 1 })).skillMd).toContain("Version one steps.");

    const restored = await library.restoreVersion({ skillId: first.id, version: 1 });
    expect(restored).toMatchObject({ version: 3, description: "Builds the weekly sales report." });
    const versions = library.listVersions(first.id);
    expect(versions.map((item) => [item.version, item.restoredFrom, item.note])).toEqual([
      [1, null, null],
      [2, null, "Add charts"],
      [3, 1, "Restored from version 1"],
    ]);
    expect(versions[2]?.contentHash).toBe(versions[0]?.contentHash);
    expect((await library.read({ skillId: first.id })).skillMd).toContain("Version one steps.");
    expect(existsSync(join(dir, "Skills", "weekly-report", "v2", "SKILL.md"))).toBe(true);
  });

  it("rejects an invalid skill with a clear reason and stores nothing", async () => {
    const { dir, library } = await setup(undefined, { files: 3, totalBytes: 2_000, description: 40 });
    const inline = (skillMd: string) => library.create({ source: { kind: "inline", skillMd }, authorBotId: null });
    await expect(inline("No front matter")).rejects.toThrow(/front matter/);
    await expect(inline("---\ndescription: Missing name\n---\n")).rejects.toThrow(/name/);
    await expect(inline("---\nname: Weekly Report\ndescription: Bad name\n---\n")).rejects.toThrow(/name/);
    await expect(inline(`---\nname: long\ndescription: ${"x".repeat(41)}\n---\n`)).rejects.toThrow(/description/);
    await expect(
      library.create({ source: { kind: "folder", path: join(dir, "missing") }, authorBotId: null }),
    ).rejects.toThrow(/SKILL\.md|folder/);
    const many = await writeSkill(join(dir, "many"), "name: many\ndescription: Many files", "", {
      "a.txt": "a",
      "b.txt": "b",
      "c.txt": "c",
    });
    await expect(library.create({ source: { kind: "folder", path: many }, authorBotId: null })).rejects.toThrow(
      /at most 3 files/,
    );
    const big = await writeSkill(join(dir, "big"), "name: big\ndescription: Too big", "x".repeat(2_100));
    await expect(library.create({ source: { kind: "folder", path: big }, authorBotId: null })).rejects.toThrow(
      /at most/,
    );
    const linked = await writeSkill(join(dir, "linked"), "name: linked\ndescription: Has a link");
    await mkdir(join(dir, "outside"), { recursive: true });
    await symlink(join(dir, "outside"), join(linked, "escape"), "junction");
    await expect(library.create({ source: { kind: "folder", path: linked }, authorBotId: null })).rejects.toThrow(
      /link/,
    );
    await expect(
      library.create({
        source: {
          kind: "inline",
          skillMd: "---\nname: escape\ndescription: x\n---\n",
          files: [{ path: "../x.txt", content: "x" }],
        },
        authorBotId: null,
      }),
    ).rejects.toThrow(/path/);
    await library.create({
      source: { kind: "inline", skillMd: "---\nname: once\ndescription: x\n---\n" },
      authorBotId: null,
    });
    await expect(inline("---\nname: once\ndescription: again\n---\n")).rejects.toThrow(/already exists/);
    expect(library.list().map((skill) => skill.name)).toEqual(["once"]);
  });

  it("reads folded and quoted front matter values", async () => {
    const { library } = await setup();
    const skill = await library.create({
      source: {
        kind: "inline",
        skillMd:
          "---\nname: \"quoted\"\ndescription: >\n  Builds the report\n  from the table.\nexample-prompt: 'Try: weekly'\n---\nBody\n",
      },
      authorBotId: null,
    });
    expect(skill).toMatchObject({
      name: "quoted",
      description: "Builds the report from the table.",
      examplePrompt: "Try: weekly",
    });
  });

  it("gives each agent its own copy, keeps it on library updates and protects local changes", async () => {
    const { dir, library, events } = await setup();
    const skill = await library.create({
      source: { kind: "inline", skillMd: `---\n${WEEKLY}\n---\nVersion one steps.\n` },
      authorBotId: "chief",
    });
    const chief = await library.install({ skillId: skill.id, botId: "chief" });
    expect(chief).toMatchObject({
      installedVersion: 1,
      latestVersion: 1,
      updateAvailable: false,
      modifiedLocally: false,
    });
    expect(chief.path).toBe(join(dir, "Bots", "chief", ".cosgral", "skills", "weekly-report"));
    await library.install({ skillId: skill.id, botId: "writer" });
    expect(events.some((event) => event.installs?.length === 2)).toBe(true);

    await library.revise({
      skillId: skill.id,
      baseVersion: 1,
      source: { kind: "inline", skillMd: `---\n${WEEKLY}\n---\nVersion two steps.\n` },
      authorBotId: "chief",
    });
    const [installedChief] = await library.listInstalls({ botId: "chief" });
    expect(installedChief).toMatchObject({ installedVersion: 1, latestVersion: 2, updateAvailable: true });
    expect(await readFile(join(chief.path, "SKILL.md"), "utf8")).toContain("Version one steps.");

    await writeFile(join(chief.path, "SKILL.md"), "My own edit");
    expect((await library.listInstalls({ botId: "chief" }))[0]?.modifiedLocally).toBe(true);
    await expect(library.update({ skillId: skill.id, botId: "chief" })).rejects.toThrow(/changed/);
    expect(await readFile(join(chief.path, "SKILL.md"), "utf8")).toBe("My own edit");
    const updated = await library.update({ skillId: skill.id, botId: "chief", overwriteLocalChanges: true });
    expect(updated).toMatchObject({ installedVersion: 2, modifiedLocally: false, updateAvailable: false });
    expect(await readFile(join(chief.path, "SKILL.md"), "utf8")).toContain("Version two steps.");

    expect(await library.update({ skillId: skill.id, botId: "writer" })).toMatchObject({ installedVersion: 2 });
    await library.uninstall({ skillId: skill.id, botId: "writer" });
    expect(existsSync(join(dir, "Bots", "writer", ".cosgral", "skills", "weekly-report"))).toBe(false);
    expect(library.installedFor("writer")).toEqual([]);
    closeTestDatabases();

    const { library: reopened } = await setup(dir);
    expect(await reopened.listInstalls()).toEqual([
      expect.objectContaining({ botId: "chief", installedVersion: 2, modifiedLocally: false }),
    ]);
    expect(reopened.installedFor("chief")).toEqual([
      expect.objectContaining({ name: "weekly-report", version: 2, skillMdPath: join(chief.path, "SKILL.md") }),
    ]);
  });

  it("deletes a skill with its versions and copies, but keeps a changed copy unless forced", async () => {
    const { dir, library } = await setup();
    const skill = await library.create({
      source: { kind: "inline", skillMd: `---\n${WEEKLY}\n---\nSteps\n` },
      authorBotId: null,
    });
    const install = await library.install({ skillId: skill.id, botId: "chief" });
    await writeFile(join(install.path, "notes.md"), "local note");
    await expect(library.delete({ skillId: skill.id })).rejects.toThrow(/changed/);
    await library.delete({ skillId: skill.id, force: true });
    expect(library.list()).toEqual([]);
    expect(await library.listInstalls()).toEqual([]);
    expect(existsSync(install.path)).toBe(false);
    expect(existsSync(join(dir, "Skills", "weekly-report"))).toBe(false);
  });

  it("forgets the installs of deleted agents", async () => {
    const { library } = await setup();
    const skill = await library.create({
      source: { kind: "inline", skillMd: `---\n${WEEKLY}\n---\nSteps\n` },
      authorBotId: null,
    });
    await library.install({ skillId: skill.id, botId: "chief" });
    await library.install({ skillId: skill.id, botId: "gone" });
    expect(await library.pruneBots(["chief"])).toBe(true);
    expect((await library.listInstalls()).map((install) => install.botId)).toEqual(["chief"]);
    expect(await library.pruneBots(["chief"])).toBe(false);
  });
});
