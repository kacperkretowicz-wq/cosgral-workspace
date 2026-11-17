// COSGRAL W12 (BE-H): the library page (contract: ipc-insights.ts). It does not store anything: it reads the files of the library store
// (the `all` port), adds the name of the agent that made each file, and lets the shared rules filter, sort and cut the page. "Delete
// many" and the clean-up go through the same `remove` the library already uses for one file; a chat attachment is never deleted here
// (it stays with its message).

import {
  type DeleteLibraryFilesResult,
  type LibraryCleanupResult,
  type LibraryEntry,
  type LibraryItem,
  type LibraryPage,
  parseDeleteLibraryFilesInput,
  parseLibraryCleanupInput,
  parseLibraryQuery,
  selectLibraryPage,
} from "@openbot/contracts/ipc";

export interface LibraryViewOptions {
  /** Every library file and chat attachment. */
  all: () => LibraryItem[];
  agentName: (botId: string) => string | null;
  /** Deletes one library file for good; throws when it cannot (already gone, a chat attachment). */
  remove: (fileId: string) => Promise<void>;
  now?: () => Date;
}

const DAY_MS = 86_400_000;

export class LibraryViewService {
  readonly #options: LibraryViewOptions;

  constructor(options: LibraryViewOptions) {
    this.#options = options;
  }

  page(raw: unknown): LibraryPage {
    const query = parseLibraryQuery(raw);
    const entries: LibraryEntry[] = this.#options.all().map((item) => ({
      ...item,
      agentName: item.createdByBotId ? this.#options.agentName(item.createdByBotId) : null,
    }));
    return selectLibraryPage(entries, query);
  }

  async deleteMany(raw: unknown): Promise<DeleteLibraryFilesResult> {
    const { fileIds } = parseDeleteLibraryFilesInput(raw);
    const known = new Map(this.#options.all().map((item) => [item.id, item]));
    const result: DeleteLibraryFilesResult = { deleted: [], skipped: [], freedBytes: 0 };
    for (const fileId of fileIds) {
      const file = known.get(fileId);
      if (!file) result.skipped.push({ fileId, reason: "not-found" });
      else if (file.origin === "chat") result.skipped.push({ fileId, reason: "chat-attachment" });
      else if (await this.#removed(fileId)) {
        result.deleted.push(fileId);
        result.freedBytes += file.size;
      } else result.skipped.push({ fileId, reason: "not-found" });
    }
    return result;
  }

  async cleanup(raw: unknown): Promise<LibraryCleanupResult> {
    const input = parseLibraryCleanupInput(raw);
    const cutoff = (this.#options.now?.() ?? new Date()).getTime() - input.olderThanDays * DAY_MS;
    const old = this.#options
      .all()
      .filter((item) => item.origin === input.origin && Date.parse(item.createdAt) < cutoff);
    if (input.dryRun === true) {
      return { files: old.length, bytes: old.reduce((sum, item) => sum + item.size, 0), deleted: false };
    }
    let files = 0;
    let bytes = 0;
    for (const item of old) {
      if (!(await this.#removed(item.id))) continue;
      files += 1;
      bytes += item.size;
    }
    return { files, bytes, deleted: true };
  }

  async #removed(fileId: string): Promise<boolean> {
    try {
      await this.#options.remove(fileId);
      return true;
    } catch {
      return false;
    }
  }
}
