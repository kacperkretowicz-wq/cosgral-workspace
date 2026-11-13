// COSGRAL W2: agent tools for the local skill library (`cosgral_skills`), the same path as `cosgral_eyes`:
// Codex dynamic functions and a Claude in-process MCP server. An agent creates and revises library skills,
// reads them, and installs them for itself; installing for another agent is a person's decision.

import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { SKILL_LIMITS, type SkillInstall } from "@openbot/contracts/ipc";
import { type DynamicRecord, isBoolean, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { z } from "zod";
import type { DynamicToolCallParams, DynamicToolResult } from "./protocol";
import type { InstalledSkillSummary, SkillLibrary, SkillSource } from "./skill-library";

export const SKILLS_NAMESPACE = "cosgral_skills";

const name = z.string().min(1).max(SKILL_LIMITS.name);
const version = z.number().int().min(1);
const source = {
  sourcePath: z.string().max(1_024).optional(),
  skillMd: z.string().max(SKILL_LIMITS.skillMdBytes).optional(),
  note: z.string().max(SKILL_LIMITS.note).optional(),
};

/** One schema for Codex dynamic functions and the Claude in-process MCP server. */
export const SKILLS_TOOL_SPECS: Array<{ name: string; description: string; schema: z.ZodRawShape }> = [
  {
    name: "list_local_skills",
    description:
      "List the skills in this computer's skill library: latest version, the version installed for you (null when not installed), and whether an update is available or your copy was changed.",
    schema: {},
  },
  {
    name: "read_local_skill",
    description:
      "Read SKILL.md and the file list of a library skill (latest version unless you give one). Remember the version: revise_skill needs it.",
    schema: { name, version: version.optional() },
  },
  {
    name: "create_skill",
    description: `Add a new skill to the library from a folder you prepared in your workspace or the shared folder (sourcePath), or from SKILL.md text (skillMd). SKILL.md starts with front matter: name (kebab-case), description, optional example-prompt. At most ${SKILL_LIMITS.files} files and ${SKILL_LIMITS.totalBytes / 1024 / 1024} MB. It is installed for you right away; other agents get it only when it is installed for them. Nothing in it runs.`,
    schema: source,
  },
  {
    name: "revise_skill",
    description:
      "Save a new library version of a skill from a folder (sourcePath) or SKILL.md text (skillMd). baseVersion must be the version you last read; if the skill changed since, read it again. Installed copies, yours included, keep their version until they are installed again.",
    schema: { name, baseVersion: version, ...source },
  },
  {
    name: "install_local_skill",
    description:
      "Install a library skill for yourself (latest version unless you give one), or move your copy to the latest or a given version. A copy you changed is never replaced unless overwriteLocalChanges is true.",
    schema: { name, version: version.optional(), overwriteLocalChanges: z.boolean().optional() },
  },
];

export const SKILLS_DYNAMIC_TOOLS = {
  type: "namespace",
  name: SKILLS_NAMESPACE,
  description: "Create, revise, read and install reusable skills from this computer's local skill library.",
  tools: SKILLS_TOOL_SPECS.map((spec) => ({
    type: "function",
    name: spec.name,
    description: spec.description,
    inputSchema: z.toJSONSchema(z.object(spec.schema)),
  })),
};

export interface SkillToolContext {
  botId: string;
  workspacePath: string;
  sharedRoot: string;
}

/** Instructions that tell an agent about its installed skills (direct and channel threads). */
export function skillInstructions(skills: InstalledSkillSummary[]): string {
  const lines = [
    `Reusable procedures live in this computer's skill library; use ${SKILLS_NAMESPACE} to list, read, create, revise and install them. When the user asks to save a workflow as a skill, or corrects how you follow one of your skills, create or revise it there. Read a skill's SKILL.md before you follow it.`,
  ];
  if (skills.length) {
    lines.push("Your installed skills:");
    for (const skill of skills) {
      lines.push(`- ${skill.name} (version ${skill.version}): ${skill.description} SKILL.md: ${skill.skillMdPath}`);
    }
  }
  return lines.join("\n");
}

export class SkillTools {
  readonly #library: SkillLibrary;

  constructor(library: SkillLibrary) {
    this.#library = library;
  }

  async handleDynamicTool(params: DynamicToolCallParams, context: SkillToolContext): Promise<DynamicToolResult> {
    try {
      const args = isDynamicRecord(params.arguments) ? params.arguments : {};
      switch (params.tool) {
        case "list_local_skills":
          return textResult({ skills: await this.#list(context.botId) });
        case "read_local_skill":
          return textResult(await this.#read(args));
        case "create_skill":
          return textResult(await this.#create(args, context));
        case "revise_skill":
          return textResult(await this.#revise(args, context));
        case "install_local_skill":
          return textResult(await this.#install(args, context.botId));
        default:
          throw new Error(`Unknown skill tool: ${params.tool}`);
      }
    } catch (error) {
      return { success: false, contentItems: [{ type: "inputText", text: errorText(error) }] };
    }
  }

  async #list(botId: string) {
    const installs = new Map(
      (await this.#library.listInstalls({ botId })).map((install) => [install.skillId, install]),
    );
    return this.#library.list().map((skill) => {
      const install = installs.get(skill.id);
      return {
        name: skill.name,
        description: skill.description,
        version: skill.version,
        installedVersion: install?.installedVersion ?? null,
        updateAvailable: install?.updateAvailable ?? false,
        modifiedLocally: install?.modifiedLocally ?? false,
      };
    });
  }

  async #read(args: DynamicRecord) {
    const skill = this.#skill(args);
    const content = await this.#library.read({ skillId: skill.id, version: optionalVersion(args.version) });
    return {
      name: skill.name,
      version: content.version,
      latestVersion: skill.version,
      skillMd: content.skillMd,
      files: content.files,
    };
  }

  async #create(args: DynamicRecord, context: SkillToolContext) {
    const skill = await this.#library.create({
      source: this.#source(args, context),
      authorBotId: context.botId,
      note: optionalText(args.note),
    });
    // The author can use its skill at once (spec W2 1.2); other agents need an install.
    const install = await this.#library.install({ skillId: skill.id, botId: context.botId });
    return {
      skill: { name: skill.name, version: skill.version },
      installed: { version: install.installedVersion, skillMdPath: skillMdPath(install) },
      instruction:
        "The skill is in the library and installed for you. Other agents get it only when it is installed for them.",
    };
  }

  async #revise(args: DynamicRecord, context: SkillToolContext) {
    const current = this.#skill(args);
    const baseVersion = optionalVersion(args.baseVersion);
    if (baseVersion === undefined) throw new Error("baseVersion is required: the version you last read.");
    const skill = await this.#library.revise({
      skillId: current.id,
      baseVersion,
      source: this.#source(args, context),
      authorBotId: context.botId,
      note: optionalText(args.note),
    });
    return {
      skill: { name: skill.name, version: skill.version },
      instruction: `Saved as version ${skill.version}. Installed copies keep their version; install it again to use the new one.`,
    };
  }

  async #install(args: DynamicRecord, botId: string) {
    const skill = this.#skill(args);
    const version = optionalVersion(args.version);
    const overwrite = args.overwriteLocalChanges;
    if (overwrite !== undefined && !isBoolean(overwrite))
      throw new Error("overwriteLocalChanges must be true or false.");
    const [existing] = await this.#library
      .listInstalls({ botId })
      .then((installs) => installs.filter((install) => install.skillId === skill.id));
    const install = existing
      ? await this.#library.update({ skillId: skill.id, botId, version, overwriteLocalChanges: overwrite === true })
      : await this.#library.install({ skillId: skill.id, botId, version });
    return {
      install,
      instruction: `Read ${skillMdPath(install)} before you follow this skill.`,
    };
  }

  #skill(args: DynamicRecord) {
    if (!isString(args.name)) throw new Error("name is required.");
    const skill = this.#library.findByName(args.name);
    if (!skill) throw new Error(`There is no skill named ${args.name}. List the library with list_local_skills.`);
    return skill;
  }

  /** A folder the agent prepared in its workspace or the shared folder, or SKILL.md text; never both. */
  #source(args: DynamicRecord, context: SkillToolContext): SkillSource {
    const path = optionalText(args.sourcePath);
    const skillMd = optionalText(args.skillMd);
    if ((path === undefined) === (skillMd === undefined)) {
      throw new Error("Give either sourcePath (a folder with SKILL.md) or skillMd (the SKILL.md text).");
    }
    if (skillMd !== undefined) return { kind: "inline", skillMd };
    const folder = resolve(context.workspacePath, path ?? "");
    if (!isInside(folder, context.workspacePath) && !isInside(folder, context.sharedRoot)) {
      throw new Error("Prepare the skill folder in your workspace or the shared folder.");
    }
    return { kind: "folder", path: folder };
  }
}

/** True for a folder strictly inside `root` (case-insensitive on Windows, other drives refused). */
function isInside(path: string, root: string): boolean {
  const between = relative(resolve(root), resolve(path));
  return between !== "" && between !== ".." && !between.startsWith(`..${sep}`) && !isAbsolute(between);
}

function skillMdPath(install: SkillInstall): string {
  return join(install.path, "SKILL.md");
}

function optionalVersion(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isNumber(value) || !Number.isInteger(value) || value < 1)
    throw new Error("version must be a whole number from 1.");
  return value;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isString(value)) throw new Error("Expected text.");
  return value.trim() ? value : undefined;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function textResult(value: unknown): DynamicToolResult {
  return { success: true, contentItems: [{ type: "inputText", text: JSON.stringify(value) }] };
}
