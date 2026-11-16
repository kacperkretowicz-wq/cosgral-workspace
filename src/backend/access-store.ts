// COSGRAL W8-BE1: the access of the agents (level, added and excluded folders), one small JSON file of this computer.
// An agent with no record has the defaults, which is the least access. A file that cannot be read is put aside and
// every agent starts at the default again: a damaged file never leaves an agent at a wider level.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { type AgentAccess, defaultAgentAccess, isAgentAccess } from "@openbot/contracts/ipc";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";

const FILE_VERSION = 1;

export interface AccessStoreOptions {
  filePath: string;
  now?: () => Date;
}

export class AccessStore {
  readonly #filePath: string;
  readonly #now: () => Date;
  readonly #agents = new Map<string, AgentAccess>();

  constructor(options: AccessStoreOptions) {
    this.#filePath = options.filePath;
    this.#now = options.now ?? (() => new Date());
    this.#load();
  }

  /** The access of the agent; the defaults when it was never changed. A copy. */
  get(botId: string): AgentAccess {
    return structuredClone(this.#agents.get(botId) ?? defaultAgentAccess(botId));
  }

  /** Only the agents whose access was changed at least once. */
  list(): AgentAccess[] {
    return structuredClone([...this.#agents.values()]);
  }

  put(access: AgentAccess): AgentAccess {
    if (!isAgentAccess(access)) throw new Error("This access is not valid.");
    this.#agents.set(access.botId, structuredClone(access));
    this.#save();
    return this.get(access.botId);
  }

  remove(botId: string): void {
    if (this.#agents.delete(botId)) this.#save();
  }

  #load(): void {
    if (!existsSync(this.#filePath)) return;
    try {
      const data = JSON.parse(readFileSync(this.#filePath, "utf8"));
      if (!isDynamicRecord(data) || data.version !== FILE_VERSION || !Array.isArray(data.agents)) {
        throw new Error("Unknown format.");
      }
      for (const item of data.agents) if (isAgentAccess(item)) this.#agents.set(item.botId, item);
    } catch {
      this.#agents.clear();
      try {
        renameSync(this.#filePath, `${this.#filePath}.damaged-${this.#now().toISOString().replace(/[:.]/g, "-")}`);
      } catch {
        // The file stays where it is; the defaults hold, and the next change overwrites it.
      }
    }
  }

  #save(): void {
    mkdirSync(dirname(this.#filePath), { recursive: true });
    const temporary = `${this.#filePath}.tmp`;
    writeFileSync(
      temporary,
      JSON.stringify({ version: FILE_VERSION, agents: [...this.#agents.values()] }, null, 2),
      "utf8",
    );
    renameSync(temporary, this.#filePath);
  }
}
