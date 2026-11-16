// COSGRAL W6-BE3: the messages a person pinned in a thread (spec-w6.md 1E, W29-W35). A pin is a mark kept in the local
// database, so it survives a restart. It belongs to a message of one thread; a deleted message or thread loses its pin.

import { MESSAGE_ACTION_LIMITS, type MessagePin } from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import type { OpenBotDatabase } from "./openbot-database";

export class MessagePinStore {
  readonly #database: OpenBotDatabase;
  /** The pinned ids per thread, so that marking every message of a conversation does not read the database each time. */
  readonly #cache = new Map<string, Set<string>>();

  constructor(database: OpenBotDatabase) {
    this.#database = database;
  }

  /** Newest first. */
  list(threadId: string): MessagePin[] {
    const rows = this.#database.connection
      .prepare(
        "SELECT message_id, pinned_at FROM projection_message_pins WHERE thread_id = ? ORDER BY pinned_at DESC, rowid DESC",
      )
      .all(threadId);
    return rows.flatMap((row) =>
      isDynamicRecord(row) && isString(row.message_id) && isString(row.pinned_at)
        ? [{ messageId: row.message_id, pinnedAt: row.pinned_at }]
        : [],
    );
  }

  /** The ids of the pinned messages of a thread (cached). */
  pinnedIds(threadId: string): ReadonlySet<string> {
    const cached = this.#cache.get(threadId);
    if (cached) return cached;
    const ids = new Set(this.list(threadId).map((pin) => pin.messageId));
    this.#cache.set(threadId, ids);
    return ids;
  }

  /** Pins or unpins. Over the limit a new pin is refused; pinning again changes nothing. Answers the pins, newest first. */
  set(botId: string, threadId: string, messageId: string, pinned: boolean, now: string): MessagePin[] {
    const db = this.#database.connection;
    if (!pinned) {
      db.prepare("DELETE FROM projection_message_pins WHERE thread_id = ? AND message_id = ?").run(threadId, messageId);
    } else if (!this.pinnedIds(threadId).has(messageId)) {
      if (this.pinnedIds(threadId).size >= MESSAGE_ACTION_LIMITS.pinsPerThread) {
        throw new Error(`At most ${MESSAGE_ACTION_LIMITS.pinsPerThread} messages can be pinned in a thread.`);
      }
      db.prepare(
        "INSERT INTO projection_message_pins (thread_id, message_id, agent_id, pinned_at) VALUES (?, ?, ?, ?)",
      ).run(threadId, messageId, botId, now);
    }
    this.#cache.delete(threadId);
    return this.list(threadId);
  }

  /** The messages left the thread: their pins go too. */
  removeMessages(threadId: string, messageIds: readonly string[]): void {
    const statement = this.#database.connection.prepare(
      "DELETE FROM projection_message_pins WHERE thread_id = ? AND message_id = ?",
    );
    for (const id of messageIds) statement.run(threadId, id);
    this.#cache.delete(threadId);
  }

  deleteThread(threadId: string): void {
    this.#database.connection.prepare("DELETE FROM projection_message_pins WHERE thread_id = ?").run(threadId);
    this.#cache.delete(threadId);
  }

  /** Forgets the pins of agents that no longer exist. */
  pruneBots(botIds: string[]): void {
    const keep = new Set(botIds);
    const rows = this.#database.connection.prepare("SELECT DISTINCT agent_id FROM projection_message_pins").all();
    for (const row of rows) {
      if (!isDynamicRecord(row) || !isString(row.agent_id) || keep.has(row.agent_id)) continue;
      this.#database.connection.prepare("DELETE FROM projection_message_pins WHERE agent_id = ?").run(row.agent_id);
    }
    this.#cache.clear();
  }
}
