// COSGRAL W2: forgetting must really forget. Memory events carry the memory text in the event log
// (orchestration_events); when an entry is edited or forgotten, its older events go too, so the old
// text is not kept in the local database. Runs inside the same transaction as the change.
import type { DatabaseSync, SQLInputValue } from "node:sqlite";

/** Delete matching events older than `beforeSequence`, and the command receipts that produced them. */
export function purgeEventHistory(
  db: DatabaseSync,
  filter: string,
  parameters: SQLInputValue[],
  beforeSequence: number,
): void {
  const where = `(${filter}) AND sequence < ?`;
  db.prepare(
    `DELETE FROM orchestration_command_receipts WHERE command_id IN (
       SELECT DISTINCT command_id FROM orchestration_events WHERE ${where}
     )`,
  ).run(...parameters, beforeSequence);
  db.prepare(`DELETE FROM orchestration_events WHERE ${where}`).run(...parameters, beforeSequence);
}

/** Earlier events of one private agent memory (created, updated). */
export function purgeAgentMemoryHistory(
  db: DatabaseSync,
  botId: string,
  memoryId: string,
  beforeSequence: number,
): void {
  purgeEventHistory(
    db,
    "aggregate_type = 'agent-memory' AND aggregate_id = ? AND json_extract(payload_json, '$.memory.id') = ?",
    [botId, memoryId],
    beforeSequence,
  );
}

/** Earlier events of one channel memory entry (added by an agent or a person, edited). */
export function purgeChannelMemoryHistory(db: DatabaseSync, memoryId: string, beforeSequence: number): void {
  purgeEventHistory(
    db,
    "aggregate_type = 'channel' AND json_extract(payload_json, '$.memories[0].id') = ?",
    [memoryId],
    beforeSequence,
  );
}
