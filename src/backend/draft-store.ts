// COSGRAL W1-BE3: drafts the user kept unsent ("keep-draft" on a draft preview / confirm card).
// They stay in the local database until the agent sends them after a new card, or the user deletes them.

import { ACTION_CARD_LIMITS, isKeptDraft, type KeptDraft } from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import type { OpenBotDatabase } from "./openbot-database";

/** What the action cards need from the draft storage. */
export interface KeptDraftStore {
  list(): KeptDraft[];
  get(id: string): KeptDraft | null;
  save(draft: KeptDraft): void;
  delete(id: string): boolean;
}

export class DraftStore implements KeptDraftStore {
  readonly #database: OpenBotDatabase;

  constructor(database: OpenBotDatabase) {
    this.#database = database;
  }

  /** Newest first. */
  list(): KeptDraft[] {
    const rows = this.#database.connection
      .prepare("SELECT data_json FROM projection_kept_drafts ORDER BY kept_at DESC, rowid DESC")
      .all();
    return rows.flatMap((row) => {
      const draft = parseDraft(row);
      return draft ? [draft] : [];
    });
  }

  get(id: string): KeptDraft | null {
    const row = this.#database.connection
      .prepare("SELECT data_json FROM projection_kept_drafts WHERE draft_id = ?")
      .get(id);
    return parseDraft(row);
  }

  /** Adds a draft or replaces the one with the same id. Over the limit a new draft is refused, never an old one dropped. */
  save(draft: KeptDraft): void {
    if (!isKeptDraft(draft) || !draft.preview.trim() || draft.preview.length > ACTION_CARD_LIMITS.preview) {
      throw new Error("This draft is not valid.");
    }
    const db = this.#database.connection;
    if (!this.get(draft.id)) {
      const row = db.prepare("SELECT COUNT(*) AS count FROM projection_kept_drafts").get();
      const count = isDynamicRecord(row) && isNumber(row.count) ? row.count : 0;
      if (count >= ACTION_CARD_LIMITS.keptDrafts) {
        throw new Error(`At most ${ACTION_CARD_LIMITS.keptDrafts} drafts can be kept. Delete some first.`);
      }
    }
    db.prepare(
      `INSERT INTO projection_kept_drafts (draft_id, bot_id, kept_at, data_json) VALUES (?, ?, ?, ?)
       ON CONFLICT(draft_id) DO UPDATE SET bot_id = excluded.bot_id, kept_at = excluded.kept_at, data_json = excluded.data_json`,
    ).run(draft.id, draft.botId, draft.keptAt, JSON.stringify(draft));
  }

  delete(id: string): boolean {
    return (
      Number(
        this.#database.connection.prepare("DELETE FROM projection_kept_drafts WHERE draft_id = ?").run(id).changes,
      ) > 0
    );
  }

  /** Forgets the drafts of agents that no longer exist. True when something was removed. */
  pruneBots(botIds: string[]): boolean {
    const keep = new Set(botIds);
    let removed = false;
    for (const draft of this.list()) if (!keep.has(draft.botId) && this.delete(draft.id)) removed = true;
    return removed;
  }
}

function parseDraft(row: unknown): KeptDraft | null {
  if (!isDynamicRecord(row) || !isString(row.data_json)) return null;
  try {
    const value = JSON.parse(row.data_json);
    return isKeptDraft(value) ? value : null;
  } catch {
    return null;
  }
}
