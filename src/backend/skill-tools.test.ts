// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DynamicRecord, isDynamicRecord } from "@openbot/contracts/runtime-values";
import { afterEach, expect, it } from "vitest";
import type { DynamicToolCallParams, DynamicToolResult } from "./protocol";
import { SkillLibrary } from "./skill-library";
import { type SkillToolContext, SkillTools } from "./skill-tools";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "skill-tools-"));
  roots.push(dir);
  const database = testDatabase(join(dir, "data"));
  await database.initialize();
  const workspaceFor = (botId: string) => join(dir, "Bots", botId);
  const library = new SkillLibrary({ database, root: join(dir, "Skills"), workspaceFor });
  const tools = new SkillTools(library);
  const context = (botId: string): SkillToolContext => ({
    botId,
    workspacePath: workspaceFor(botId),
    sharedRoot: join(dir, "Shared"),
  });
  return { dir, library, tools, context };
}

function call(tool: string, args: unknown): DynamicToolCallParams {
  return {
    threadId: "thread",
    turnId: "turn",
    callId: `${tool}-call`,
    namespace: "cosgral_skills",
    tool,
    arguments: args,
  };
}

function payload(result: DynamicToolResult): DynamicRecord {
  const item = result.contentItems[0];
  if (item?.type !== "inputText") throw new Error("Expected a text result.");
  const value = JSON.parse(item.text);
  if (!isDynamicRecord(value)) throw new Error("Expected a JSON object.");
  return value;
}

function text(result: DynamicToolResult): string {
  const item = result.contentItems[0];
  return item?.type === "inputText" ? item.text : "";
}

const SKILL_MD = "---\nname: weekly-report\ndescription: Builds the weekly sales report.\n---\nVersion one.\n";

it("creates a skill from a prepared folder, installs it for its author only and lists it", async () => {
  const { dir, tools, context } = await setup();
  const folder = join(dir, "Bots", "chief", "drafts", "weekly-report");
  await mkdir(join(folder, "scripts"), { recursive: true });
  await writeFile(join(folder, "SKILL.md"), SKILL_MD);
  await writeFile(join(folder, "scripts", "build.ps1"), "Write-Output report");

  const created = await tools.handleDynamicTool(call("create_skill", { sourcePath: folder }), context("chief"));
  expect(created.success).toBe(true);
  const result = payload(created);
  expect(result).toMatchObject({ skill: { name: "weekly-report", version: 1 }, installed: { version: 1 } });
  const installed = isDynamicRecord(result.installed) ? String(result.installed.skillMdPath) : "";
  expect(await readFile(installed, "utf8")).toContain("Version one.");

  expect(payload(await tools.handleDynamicTool(call("list_local_skills", {}), context("chief")))).toMatchObject({
    skills: [{ name: "weekly-report", version: 1, installedVersion: 1, updateAvailable: false }],
  });
  expect(payload(await tools.handleDynamicTool(call("list_local_skills", {}), context("writer")))).toMatchObject({
    skills: [{ name: "weekly-report", installedVersion: null }],
  });
});

it("revises from the version the agent read, keeps installed copies and updates on an explicit install", async () => {
  const { tools, context } = await setup();
  await tools.handleDynamicTool(call("create_skill", { skillMd: SKILL_MD }), context("chief"));
  await tools.handleDynamicTool(call("install_local_skill", { name: "weekly-report" }), context("writer"));

  const read = payload(
    await tools.handleDynamicTool(call("read_local_skill", { name: "weekly-report" }), context("writer")),
  );
  expect(read).toMatchObject({ name: "weekly-report", version: 1, latestVersion: 1 });
  expect(String(read.skillMd)).toContain("Version one.");

  const revised = await tools.handleDynamicTool(
    call("revise_skill", {
      name: "weekly-report",
      baseVersion: 1,
      skillMd: SKILL_MD.replace("Version one.", "Version two."),
      note: "Clearer steps",
    }),
    context("writer"),
  );
  expect(payload(revised)).toMatchObject({ skill: { name: "weekly-report", version: 2 } });
  const stale = await tools.handleDynamicTool(
    call("revise_skill", { name: "weekly-report", baseVersion: 1, skillMd: SKILL_MD }),
    context("chief"),
  );
  expect(stale.success).toBe(false);
  expect(text(stale)).toMatch(/latest version/);

  expect(payload(await tools.handleDynamicTool(call("list_local_skills", {}), context("chief")))).toMatchObject({
    skills: [{ installedVersion: 1, version: 2, updateAvailable: true }],
  });
  const updated = await tools.handleDynamicTool(
    call("install_local_skill", { name: "weekly-report" }),
    context("chief"),
  );
  expect(payload(updated)).toMatchObject({ install: { installedVersion: 2, updateAvailable: false } });
  const exact = await tools.handleDynamicTool(
    call("install_local_skill", { name: "weekly-report", version: 1 }),
    context("chief"),
  );
  expect(payload(exact)).toMatchObject({ install: { installedVersion: 1 } });
});

it("protects an agent's changed copy and refuses folders outside its workspace", async () => {
  const { dir, tools, context, library } = await setup();
  await tools.handleDynamicTool(call("create_skill", { skillMd: SKILL_MD }), context("chief"));
  const skill = library.findByName("weekly-report");
  if (!skill) throw new Error("Expected the skill.");
  await library.revise({
    skillId: skill.id,
    baseVersion: 1,
    source: { kind: "inline", skillMd: SKILL_MD.replace("one", "two") },
    authorBotId: null,
  });
  const [install] = await library.listInstalls({ botId: "chief" });
  await writeFile(join(install?.path ?? "", "SKILL.md"), "My change");
  const refused = await tools.handleDynamicTool(
    call("install_local_skill", { name: "weekly-report" }),
    context("chief"),
  );
  expect(refused.success).toBe(false);
  expect(text(refused)).toMatch(/changed/);
  const forced = await tools.handleDynamicTool(
    call("install_local_skill", { name: "weekly-report", overwriteLocalChanges: true }),
    context("chief"),
  );
  expect(payload(forced)).toMatchObject({ install: { installedVersion: 2, modifiedLocally: false } });

  const outside = join(dir, "outside", "skill");
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, "SKILL.md"), SKILL_MD.replace("weekly-report", "outside-skill"));
  const escaped = await tools.handleDynamicTool(call("create_skill", { sourcePath: outside }), context("chief"));
  expect(escaped.success).toBe(false);
  expect(text(escaped)).toMatch(/workspace|shared/);
  const dotted = join(dir, "Bots", "chief", "..drafts", "dotted-skill");
  await mkdir(dotted, { recursive: true });
  await writeFile(join(dotted, "SKILL.md"), SKILL_MD.replace("weekly-report", "dotted-skill"));
  expect((await tools.handleDynamicTool(call("create_skill", { sourcePath: dotted }), context("chief"))).success).toBe(
    true,
  );
  const both = await tools.handleDynamicTool(call("create_skill", {}), context("chief"));
  expect(both.success).toBe(false);
  expect((await tools.handleDynamicTool(call("delete_everything", {}), context("chief"))).success).toBe(false);
});
