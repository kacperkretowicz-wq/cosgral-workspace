// COSGRAL W12-KK (g2): makes the `TransferHost` of the Transfer/Import engine from the program's own services (agents, skills,
// memories, routines, server settings). The engine is given ONLY these doors: no Vault, no API key, no chat history, no provider
// file, so none of that can enter an archive. Skills are read as text from the agent's own copy (a file that is not text, or larger than
// a skill may be, is left out with a warning).

import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type BotSummary, type CreateAgentInput, type CreateAgentResult, SKILL_LIMITS } from "@openbot/contracts/ipc";
import type { TransferHost, TransferSkill } from "../backend/instance-transfer/transfer-service";
import type { MemoryStore } from "../backend/memory-store";
import type { RoutineManager } from "../backend/routine-manager";
import type { ServerSettingsService } from "../backend/server-settings";
import type { SkillLibrary } from "../backend/skill-library";

/** The part of the agent service this needs (the real `AgentService` has all of it). */
export interface TransferAgentService {
  listBots(): BotSummary[];
  readonly skillLibrary: SkillLibrary;
  readonly memoryStore: MemoryStore;
  readonly agentTemplates: { createAgent(input: CreateAgentInput): Promise<CreateAgentResult> };
}

export interface TransferHostOptions {
  service: TransferAgentService;
  routines: () => RoutineManager | null;
  settings: () => ServerSettingsService | null;
  appVersion: string;
}

async function readSkillFolder(
  folder: string,
  name: string,
): Promise<{ skill: TransferSkill | null; warnings: string[] }> {
  const warnings: string[] = [];
  let skillMd: string;
  try {
    skillMd = await readFile(join(folder, "SKILL.md"), "utf8");
  } catch {
    return { skill: null, warnings: [`the skill ${name} has no readable SKILL.md and was left out.`] };
  }
  const files: TransferSkill["files"] = [];
  let skipped = 0;
  let names: string[] = [];
  try {
    names = (await readdir(folder, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) =>
        join(entry.parentPath, entry.name)
          .slice(folder.length + 1)
          .split("\\")
          .join("/"),
      );
  } catch {
    names = [];
  }
  for (const path of names) {
    if (path === "SKILL.md") continue;
    if (files.length >= SKILL_LIMITS.files) {
      skipped += 1;
      continue;
    }
    try {
      const full = join(folder, path);
      if ((await stat(full)).size > SKILL_LIMITS.skillMdBytes) {
        skipped += 1;
        continue;
      }
      files.push({ path, content: new TextDecoder("utf-8", { fatal: true }).decode(await readFile(full)) });
    } catch {
      skipped += 1;
    }
  }
  if (skipped > 0)
    warnings.push(`${skipped} file(s) of the skill ${name} were left out (not text, too large or too many).`);
  return { skill: { name, skillMd, files }, warnings };
}

export function createTransferHost(options: TransferHostOptions): TransferHost {
  const { service } = options;
  return {
    appVersion: options.appVersion,
    listAgents: () =>
      service.listBots().map((bot) => ({
        id: bot.id,
        name: bot.name,
        role: bot.role,
        instructions: bot.description,
        avatarSeed: bot.avatarSeed,
        avatarHue: bot.avatarHue,
      })),
    skillsOf: async (agentId) => {
      const skills: TransferSkill[] = [];
      const warnings: string[] = [];
      for (const installed of service.skillLibrary.installedFor(agentId)) {
        const read = await readSkillFolder(dirname(installed.skillMdPath), installed.name);
        if (read.skill) skills.push(read.skill);
        warnings.push(...read.warnings);
      }
      return { skills, warnings };
    },
    memoriesOf: (agentId) =>
      service.memoryStore
        .listAgentMemories(agentId)
        .map((memory) => ({ text: memory.text, inclusion: memory.inclusion })),
    routinesOf: (agentId) =>
      (options.routines()?.list(agentId) ?? []).flatMap((routine) =>
        routine.trigger === "schedule" && routine.schedule !== null
          ? [{ name: routine.name, prompt: routine.prompt, schedule: routine.schedule, timezone: routine.timezone }]
          : [],
      ),
    createAgent: async (input) => {
      const { bot } = await service.agentTemplates.createAgent({
        name: input.name,
        role: input.role,
        description: input.instructions,
        avatarSeed: input.avatarSeed,
        avatarHue: input.avatarHue,
      });
      return { id: bot.id, name: bot.name };
    },
    saveMemory: (agentId, memory) => {
      service.memoryStore.saveAgentMemory({ botId: agentId, text: memory.text, inclusion: memory.inclusion });
    },
    installSkill: async (agentId, skill) => {
      const library = service.skillLibrary;
      const existing = library.findByName(skill.name);
      if (existing) {
        await library.install({ skillId: existing.id, botId: agentId });
        return "kept-existing";
      }
      const created = await library.create({
        source: { kind: "inline", skillMd: skill.skillMd, files: skill.files },
        authorBotId: null,
        note: "Imported from a file",
      });
      await library.install({ skillId: created.id, botId: agentId });
      return "installed";
    },
    createPausedRoutine: (agentId, routine) => {
      const manager = options.routines();
      if (!manager) throw new Error("Routines are not ready.");
      manager.create(
        {
          botId: agentId,
          name: routine.name,
          prompt: routine.prompt,
          trigger: "schedule",
          schedule: routine.schedule,
          ...(routine.timezone ? { timezone: routine.timezone } : {}),
          paused: true,
        },
        "person",
      );
    },
    exportSettings: () => options.settings()?.get() ?? null,
    applySettings: (value) => {
      const settings = options.settings();
      if (!settings) return false;
      settings.update(value);
      return true;
    },
  };
}
