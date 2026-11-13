import type { DatabaseSync } from "node:sqlite";

const SCHEMA_VERSION = 4;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS orchestration_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    command_id TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK(json_valid(payload_json))
  );
  CREATE INDEX IF NOT EXISTS orchestration_events_aggregate
    ON orchestration_events(aggregate_type, aggregate_id, sequence);
  CREATE TABLE IF NOT EXISTS orchestration_command_receipts (
    command_id TEXT PRIMARY KEY,
    accepted_at TEXT NOT NULL,
    first_sequence INTEGER NOT NULL,
    last_sequence INTEGER NOT NULL,
    result_json TEXT NOT NULL CHECK(json_valid(result_json))
  );
  CREATE TABLE IF NOT EXISTS projection_threads (
    thread_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    title TEXT NOT NULL,
    active_turn_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_agents (
    agent_id TEXT PRIMARY KEY,
    thread_id TEXT,
    model TEXT NOT NULL,
    updated_at TEXT,
    sort_order INTEGER NOT NULL,
    agent_json TEXT NOT NULL CHECK(json_valid(agent_json)),
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_provider_sessions (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK(provider IN ('codex', 'claude')),
    external_session_id TEXT NOT NULL,
    model TEXT NOT NULL,
    effort TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('active', 'inactive', 'failed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resume_cursor TEXT,
    last_event_sequence INTEGER NOT NULL,
    UNIQUE(provider, external_session_id)
  );
  CREATE INDEX IF NOT EXISTS provider_sessions_thread
    ON projection_provider_sessions(thread_id, provider, state);
  CREATE TABLE IF NOT EXISTS projection_turns (
    turn_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
    provider_session_id TEXT REFERENCES projection_provider_sessions(id) ON DELETE SET NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_thread_messages (
    thread_id TEXT NOT NULL REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
    message_id TEXT NOT NULL,
    turn_id TEXT,
    author TEXT NOT NULL,
    status TEXT NOT NULL,
    item_type TEXT,
    created_at TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    message_json TEXT NOT NULL CHECK(json_valid(message_json)),
    last_event_sequence INTEGER NOT NULL,
    PRIMARY KEY(thread_id, message_id)
  );
  CREATE INDEX IF NOT EXISTS thread_messages_order
    ON projection_thread_messages(thread_id, created_at, ordinal);
  CREATE TABLE IF NOT EXISTS projection_thread_reads (
    thread_id TEXT NOT NULL REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
    member_id TEXT NOT NULL,
    through_message_id TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(thread_id, member_id)
  );
  CREATE TABLE IF NOT EXISTS projection_thread_read_baselines (
    thread_id TEXT PRIMARY KEY REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
    through_message_id TEXT,
    initialized_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_thread_activities (
    activity_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
    turn_id TEXT,
    activity_type TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
    created_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_mailbox_messages (
    message_id TEXT PRIMARY KEY,
    sender_kind TEXT NOT NULL,
    sender_agent_id TEXT,
    text TEXT NOT NULL,
    reply_to_message_id TEXT,
    created_at TEXT NOT NULL,
    message_json TEXT NOT NULL CHECK(json_valid(message_json)),
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_deliveries (
    delivery_id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES projection_mailbox_messages(message_id) ON DELETE CASCADE,
    recipient_agent_id TEXT NOT NULL,
    status TEXT NOT NULL,
    turn_id TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    delivery_json TEXT NOT NULL CHECK(json_valid(delivery_json)),
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_queue_state (
    agent_id TEXT PRIMARY KEY,
    paused INTEGER NOT NULL CHECK(paused IN (0, 1)),
    metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_reactions (
    agent_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL,
    PRIMARY KEY(agent_id, message_id)
  );
  CREATE TABLE IF NOT EXISTS projection_attachments (
    attachment_id TEXT PRIMARY KEY,
    owner_kind TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
    created_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_thread_summaries (
    summary_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
    through_message_id TEXT,
    summary_text TEXT NOT NULL,
    estimated_tokens INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_direct_threads (
    thread_id TEXT PRIMARY KEY,
    member_a_id TEXT NOT NULL,
    member_b_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_message_id TEXT,
    last_event_sequence INTEGER NOT NULL,
    UNIQUE(member_a_id, member_b_id)
  );
  CREATE INDEX IF NOT EXISTS direct_threads_member_a
    ON projection_direct_threads(member_a_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS direct_threads_member_b
    ON projection_direct_threads(member_b_id, updated_at DESC);
  CREATE TABLE IF NOT EXISTS projection_direct_messages (
    message_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES projection_direct_threads(thread_id) ON DELETE CASCADE,
    sender_member_id TEXT NOT NULL,
    recipient_member_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    message_json TEXT NOT NULL CHECK(json_valid(message_json)),
    last_event_sequence INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS direct_messages_thread
    ON projection_direct_messages(thread_id, last_event_sequence);
  CREATE TABLE IF NOT EXISTS projection_direct_reads (
    thread_id TEXT NOT NULL REFERENCES projection_direct_threads(thread_id) ON DELETE CASCADE,
    member_id TEXT NOT NULL,
    last_read_sequence INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(thread_id, member_id)
  );
  CREATE TABLE IF NOT EXISTS file_deletion_outbox (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
  );
  -- COSGRAL W1: user folders in the sidebar and where each agent or channel sits.
  CREATE TABLE IF NOT EXISTS projection_sidebar_folders (
    folder_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES projection_sidebar_folders(folder_id) DEFERRABLE INITIALLY DEFERRED,
    position INTEGER NOT NULL,
    collapsed INTEGER NOT NULL DEFAULT 0 CHECK(collapsed IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_sidebar_placements (
    item_kind TEXT NOT NULL CHECK(item_kind IN ('agent', 'channel')),
    item_id TEXT NOT NULL,
    folder_id TEXT REFERENCES projection_sidebar_folders(folder_id) DEFERRABLE INITIALLY DEFERRED,
    position INTEGER NOT NULL,
    last_event_sequence INTEGER NOT NULL,
    PRIMARY KEY(item_kind, item_id)
  );
  -- COSGRAL W1-BE2: channels with a lead agent, and channel tasks.
  CREATE TABLE IF NOT EXISTS projection_channels (
    channel_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    instructions TEXT NOT NULL,
    lead_bot_id TEXT,
    member_bot_ids_json TEXT NOT NULL CHECK(json_valid(member_bot_ids_json)),
    isolated INTEGER NOT NULL CHECK(isolated IN (0, 1)),
    archived INTEGER NOT NULL CHECK(archived IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_channel_tasks (
    task_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES projection_channels(channel_id) ON DELETE CASCADE,
    owner_bot_id TEXT NOT NULL,
    state TEXT NOT NULL,
    title TEXT NOT NULL,
    request_message_id TEXT NOT NULL,
    result_message_id TEXT,
    parent_task_id TEXT,
    dependency_task_ids_json TEXT NOT NULL CHECK(json_valid(dependency_task_ids_json)),
    resource_key TEXT,
    assignment_count INTEGER NOT NULL,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS channel_tasks_channel
    ON projection_channel_tasks(channel_id, created_at);
  CREATE TABLE IF NOT EXISTS projection_channel_task_runtime (
    task_id TEXT PRIMARY KEY REFERENCES projection_channel_tasks(task_id) ON DELETE CASCADE,
    runtime_json TEXT NOT NULL CHECK(json_valid(runtime_json))
  );
  CREATE TABLE IF NOT EXISTS projection_channel_messages (
    ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL UNIQUE,
    channel_id TEXT NOT NULL REFERENCES projection_channels(channel_id) ON DELETE CASCADE,
    data_json TEXT NOT NULL CHECK(json_valid(data_json))
  );
  CREATE INDEX IF NOT EXISTS channel_messages_channel ON projection_channel_messages(channel_id, ordinal);
  CREATE TABLE IF NOT EXISTS projection_channel_memories (
    memory_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES projection_channels(channel_id) ON DELETE CASCADE,
    data_json TEXT NOT NULL CHECK(json_valid(data_json))
  );
  CREATE TABLE IF NOT EXISTS projection_channel_assignments (
    ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL REFERENCES projection_channel_tasks(task_id) ON DELETE CASCADE,
    data_json TEXT NOT NULL CHECK(json_valid(data_json))
  );
  -- COSGRAL W1-BE3: drafts the user kept unsent from a draft preview / confirm card.
  CREATE TABLE IF NOT EXISTS projection_kept_drafts (
    draft_id TEXT PRIMARY KEY,
    bot_id TEXT NOT NULL,
    kept_at TEXT NOT NULL,
    data_json TEXT NOT NULL CHECK(json_valid(data_json))
  );
  CREATE INDEX IF NOT EXISTS kept_drafts_kept_at ON projection_kept_drafts(kept_at);
  -- COSGRAL W2: private agent memories ("essential" = always in the prompt, "searchable" = found with a tool).
  -- Channel memory is separate: projection_channel_memories above (channel engine, W1-BE2).
  CREATE TABLE IF NOT EXISTS projection_agent_memories (
    memory_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    text TEXT NOT NULL,
    inclusion TEXT NOT NULL CHECK(inclusion IN ('essential', 'searchable')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS agent_memories_agent
    ON projection_agent_memories(agent_id, inclusion, updated_at DESC);
  -- COSGRAL W2: the per-agent memory limit a person set (absent = default 512).
  CREATE TABLE IF NOT EXISTS projection_agent_memory_settings (
    agent_id TEXT PRIMARY KEY,
    max_memories INTEGER NOT NULL CHECK(max_memories >= 1),
    updated_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL
  );
  -- COSGRAL W2: the local skill library (files of each version live in ~/COSGRAL Workspace/Skills).
  CREATE TABLE IF NOT EXISTS projection_skills (
    skill_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    data_json TEXT NOT NULL CHECK(json_valid(data_json))
  );
  CREATE TABLE IF NOT EXISTS projection_skill_versions (
    skill_id TEXT NOT NULL REFERENCES projection_skills(skill_id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    data_json TEXT NOT NULL CHECK(json_valid(data_json)),
    PRIMARY KEY (skill_id, version)
  );
  CREATE TABLE IF NOT EXISTS projection_skill_installs (
    bot_id TEXT NOT NULL,
    skill_id TEXT NOT NULL REFERENCES projection_skills(skill_id) ON DELETE CASCADE,
    data_json TEXT NOT NULL CHECK(json_valid(data_json)),
    PRIMARY KEY (bot_id, skill_id)
  );
`;

export function migrateOpenBotDatabase(db: DatabaseSync, appliedAt = new Date().toISOString()): void {
  db.exec(SCHEMA_SQL);
  const applied = db.prepare("SELECT version FROM schema_migrations WHERE version = ?").get(SCHEMA_VERSION);
  if (applied) return;
  db.prepare(
    `INSERT OR IGNORE INTO projection_thread_read_baselines (
       thread_id, through_message_id, initialized_at
     )
     SELECT thread.thread_id,
       (
         SELECT message.message_id
         FROM projection_thread_messages message
         WHERE message.thread_id = thread.thread_id
         ORDER BY message.created_at DESC, message.ordinal DESC, message.message_id DESC
         LIMIT 1
       ),
       ?
     FROM projection_threads thread`,
  ).run(appliedAt);
  db.prepare(
    `INSERT OR IGNORE INTO projection_direct_reads (
       thread_id, member_id, last_read_sequence, updated_at
     )
     SELECT thread_id, member_a_id, last_event_sequence, ?
     FROM projection_direct_threads`,
  ).run(appliedAt);
  db.prepare(
    `INSERT OR IGNORE INTO projection_direct_reads (
       thread_id, member_id, last_read_sequence, updated_at
     )
     SELECT thread_id, member_b_id, last_event_sequence, ?
     FROM projection_direct_threads`,
  ).run(appliedAt);
  db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(SCHEMA_VERSION, appliedAt);
}
