// COSGRAL W12 (BE-D): what the existing services know about the cards of an agent, as the `counts` port of AgentCardsService.
// A service that fails leaves its card without a count (the screen still lists it); it never breaks the whole overview.

import type { AccessLevel, AgentCardId } from "@openbot/contracts/ipc";
import type { AgentCardCount } from "./agent-cards";

export interface AgentCardSources {
  memories: (botId: string) => number;
  skills: (botId: string) => number;
  files: (botId: string) => number;
  /** The tables are shared by all agents. */
  tables: () => number;
  routines: (botId: string) => number;
  access: (botId: string) => { level: AccessLevel; additionalFolders: string[]; excludedFolders: string[] };
  backupModels: (botId: string) => number;
}

function counted(count: number, one: string, many: string, none: string): AgentCardCount {
  return { count, summary: count === 0 ? none : `${count} ${count === 1 ? one : many}` };
}

function attempt(work: () => AgentCardCount): AgentCardCount | undefined {
  try {
    return work();
  } catch {
    return undefined;
  }
}

export function agentCardCounts(
  sources: AgentCardSources,
): (botId: string) => Partial<Record<AgentCardId, AgentCardCount>> {
  return (botId) => {
    const out: Partial<Record<AgentCardId, AgentCardCount>> = {
      publish: { available: false, summary: "Not available in this build" },
    };
    const set = (id: AgentCardId, work: () => AgentCardCount): void => {
      const card = attempt(work);
      if (card) out[id] = card;
    };
    set("memory", () => counted(sources.memories(botId), "memory", "memories", "No memories"));
    set("skills", () => counted(sources.skills(botId), "skill", "skills", "No skills"));
    set("files", () => counted(sources.files(botId), "file", "files", "No files"));
    set("tables", () => counted(sources.tables(), "table", "tables", "No tables"));
    set("routines", () => counted(sources.routines(botId), "routine", "routines", "No routines"));
    set("backup-models", () => counted(sources.backupModels(botId), "backup model", "backup models", "None"));
    set("folders", () => {
      const access = sources.access(botId);
      const added = access.additionalFolders.length;
      const excluded = access.excludedFolders.length;
      return {
        count: added + excluded,
        summary: added + excluded === 0 ? "Working folder only" : `${added} added, ${excluded} excluded`,
      };
    });
    set("permissions", () => ({ count: null, summary: sources.access(botId).level }));
    return out;
  };
}
