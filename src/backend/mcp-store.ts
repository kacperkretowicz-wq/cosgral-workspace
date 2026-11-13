// COSGRAL W2: MCP servers of the program and each agent's switch, in the local database.
// Secret values (stdio environment, HTTP headers) are encrypted with a SecretBox (Electron
// safeStorage in the app) and stored only in projection_mcp_servers.secrets_encrypted; the event log
// and every read API carry only their names.
import { randomUUID } from "node:crypto";
import {
  type AddMcpServerInput,
  type AgentMcpServerSetting,
  isMcpServerName,
  isMcpTransport,
  MCP_LIMITS,
  type McpServer,
  type McpTransport,
  type SetAgentMcpServerInput,
  type UpdateMcpServerInput,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import type { OpenBotDatabase } from "./openbot-database";

/** Encrypts secrets at rest. In the app: Electron safeStorage (DPAPI on Windows). */
export interface SecretBox {
  canEncrypt(): boolean;
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
}

/** What the database keeps about a server; the connection state is added by McpManager. */
export type McpServerRecord = Omit<McpServer, "status" | "errorMessage" | "tools">;

interface StoredConfig {
  command: string | null;
  args: string[];
  cwd: string | null;
  url: string | null;
  secretNames: string[];
}

const SELECT_SERVER =
  "SELECT server_id, name, transport, config_json, created_at, updated_at FROM projection_mcp_servers";

export class McpStore {
  readonly #database: OpenBotDatabase;
  readonly #box: SecretBox;
  readonly #now: () => Date;

  constructor(database: OpenBotDatabase, box: SecretBox, now: () => Date = () => new Date()) {
    this.#database = database;
    this.#box = box;
    this.#now = now;
  }

  /** Sorted by name. */
  list(): McpServerRecord[] {
    return rows(this.#database.connection.prepare(`${SELECT_SERVER} ORDER BY name`).all()).map(recordFromRow);
  }

  get(serverId: string): McpServerRecord {
    const row = this.#database.connection.prepare(`${SELECT_SERVER} WHERE server_id = ?`).get(serverId);
    if (!row) throw new Error("This MCP server no longer exists.");
    return recordFromRow(asRow(row));
  }

  add(input: AddMcpServerInput): McpServerRecord {
    if (this.list().length >= MCP_LIMITS.servers) throw new Error(`At most ${MCP_LIMITS.servers} MCP servers.`);
    const name = checkedName(input.name);
    this.#assertFreeName(name, null);
    if (!isMcpTransport(input.transport)) throw new Error("The transport is stdio or http.");
    const config = checkedConfig(input.transport, input);
    const secrets = checkedSecrets(input.secrets ?? {});
    const at = this.#isoNow();
    const record: McpServerRecord = {
      id: randomUUID(),
      name,
      transport: input.transport,
      ...config,
      secretNames: Object.keys(secrets),
      createdAt: at,
      updatedAt: at,
    };
    this.#write(record, this.#encrypt(secrets), "mcp-server.added");
    return record;
  }

  update(input: UpdateMcpServerInput): McpServerRecord {
    const current = this.get(input.serverId);
    const name = input.name === undefined ? current.name : checkedName(input.name);
    this.#assertFreeName(name, current.id);
    const config = checkedConfig(current.transport, {
      command: input.command ?? current.command ?? undefined,
      args: input.args ?? current.args,
      cwd: input.cwd === undefined ? current.cwd : input.cwd,
      url: input.url ?? current.url ?? undefined,
    });
    const secrets = input.secrets === undefined ? null : checkedSecrets(input.secrets);
    const record: McpServerRecord = {
      ...current,
      name,
      ...config,
      secretNames: secrets ? Object.keys(secrets) : current.secretNames,
      updatedAt: this.#isoNow(),
    };
    this.#write(record, secrets ? this.#encrypt(secrets) : undefined, "mcp-server.updated");
    return record;
  }

  remove(serverId: string): McpServerRecord {
    const record = this.get(serverId);
    this.#database.dispatch(
      `mcp:remove:${randomUUID()}`,
      [
        {
          aggregateType: "mcp-server",
          aggregateId: serverId,
          eventType: "mcp-server.removed",
          payload: { serverId, name: record.name },
          occurredAt: this.#isoNow(),
        },
      ],
      (db) => {
        db.prepare("DELETE FROM projection_agent_mcp_settings WHERE server_id = ?").run(serverId);
        db.prepare("DELETE FROM projection_mcp_servers WHERE server_id = ?").run(serverId);
        return null;
      },
    );
    return record;
  }

  /** Decrypted secret values, for the connection only. Never send them to the renderer or a log. */
  getSecrets(serverId: string): Record<string, string> {
    const row = this.#database.connection
      .prepare("SELECT secrets_encrypted FROM projection_mcp_servers WHERE server_id = ?")
      .get(serverId);
    if (!row) throw new Error("This MCP server no longer exists.");
    const cipher = asRow(row).secrets_encrypted;
    if (!isString(cipher) || !cipher) return {};
    const parsed = JSON.parse(this.#box.decrypt(cipher));
    if (!isDynamicRecord(parsed)) throw new Error("The MCP server secrets cannot be read.");
    const secrets: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) if (isString(value)) secrets[key] = value;
    return secrets;
  }

  /** One entry per server; no stored switch means on. */
  listAgentSettings(botId: string): AgentMcpServerSetting[] {
    const off = new Set(
      rows(
        this.#database.connection
          .prepare("SELECT server_id FROM projection_agent_mcp_settings WHERE agent_id = ? AND enabled = 0")
          .all(botId),
      ).map((row) => text(row, "server_id")),
    );
    return this.list().map((server) => ({ botId, serverId: server.id, enabled: !off.has(server.id) }));
  }

  isEnabled(botId: string, serverId: string): boolean {
    const row = this.#database.connection
      .prepare("SELECT enabled FROM projection_agent_mcp_settings WHERE agent_id = ? AND server_id = ?")
      .get(botId, serverId);
    return !row || Number(asRow(row).enabled) === 1;
  }

  setAgentEnabled(input: SetAgentMcpServerInput): AgentMcpServerSetting[] {
    this.get(input.serverId);
    const at = this.#isoNow();
    this.#database.dispatch(
      `mcp:agent:${randomUUID()}`,
      [
        {
          aggregateType: "agent-mcp",
          aggregateId: input.botId,
          eventType: "agent-mcp.switched",
          payload: { botId: input.botId, serverId: input.serverId, enabled: input.enabled },
          occurredAt: at,
        },
      ],
      (db, sequences) => {
        db.prepare(
          `INSERT INTO projection_agent_mcp_settings (agent_id, server_id, enabled, updated_at, last_event_sequence)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(agent_id, server_id) DO UPDATE SET enabled = excluded.enabled,
             updated_at = excluded.updated_at, last_event_sequence = excluded.last_event_sequence`,
        ).run(input.botId, input.serverId, input.enabled ? 1 : 0, at, sequences.at(-1) ?? 0);
        return null;
      },
    );
    return this.listAgentSettings(input.botId);
  }

  /** A deleted agent's switches go with it. Called before the agent's own deletion clears its event log. */
  deleteAgent(botId: string): void {
    this.#database.dispatch(
      `mcp:agent-deleted:${randomUUID()}`,
      [
        {
          aggregateType: "agent-mcp",
          aggregateId: botId,
          eventType: "agent-mcp.agent-deleted",
          payload: { botId },
          occurredAt: this.#isoNow(),
        },
      ],
      (db) => {
        db.prepare("DELETE FROM projection_agent_mcp_settings WHERE agent_id = ?").run(botId);
        return null;
      },
    );
  }

  #assertFreeName(name: string, ownId: string | null): void {
    const taken = this.list().find((server) => server.name === name && server.id !== ownId);
    if (taken) throw new Error(`An MCP server named ${name} already exists.`);
  }

  #encrypt(secrets: Record<string, string>): string | null {
    if (Object.keys(secrets).length === 0) return null;
    if (!this.#box.canEncrypt()) {
      throw new Error("Secrets cannot be stored safely on this computer: system encryption is not available.");
    }
    return this.#box.encrypt(JSON.stringify(secrets));
  }

  /** `secretsEncrypted` undefined keeps the stored secrets. The event carries no secret value. */
  #write(record: McpServerRecord, secretsEncrypted: string | null | undefined, eventType: string): void {
    this.#database.dispatch(
      `${eventType}:${randomUUID()}`,
      [
        {
          aggregateType: "mcp-server",
          aggregateId: record.id,
          eventType,
          payload: { server: record },
          occurredAt: this.#isoNow(),
        },
      ],
      (db, sequences) => {
        const config: StoredConfig = {
          command: record.command,
          args: record.args,
          cwd: record.cwd,
          url: record.url,
          secretNames: record.secretNames,
        };
        db.prepare(
          `INSERT INTO projection_mcp_servers (
             server_id, name, transport, config_json, secrets_encrypted, created_at, updated_at, last_event_sequence
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(server_id) DO UPDATE SET name = excluded.name, config_json = excluded.config_json,
             updated_at = excluded.updated_at, last_event_sequence = excluded.last_event_sequence`,
        ).run(
          record.id,
          record.name,
          record.transport,
          JSON.stringify(config),
          secretsEncrypted ?? null,
          record.createdAt,
          record.updatedAt,
          sequences.at(-1) ?? 0,
        );
        if (secretsEncrypted !== undefined) {
          db.prepare("UPDATE projection_mcp_servers SET secrets_encrypted = ? WHERE server_id = ?").run(
            secretsEncrypted,
            record.id,
          );
        }
        return null;
      },
    );
  }

  #isoNow(): string {
    return this.#now().toISOString();
  }
}

function checkedName(value: string): string {
  const name = value.trim();
  if (!isMcpServerName(name)) {
    throw new Error(
      `The MCP server name starts with a lowercase letter and has only lowercase letters, digits and underscores (at most ${MCP_LIMITS.name}).`,
    );
  }
  return name;
}

function checkedConfig(
  transport: McpTransport,
  input: { command?: string; args?: string[]; cwd?: string | null; url?: string },
): Omit<StoredConfig, "secretNames"> {
  if (transport === "stdio") {
    const command = input.command?.trim() ?? "";
    if (!command || command.length > MCP_LIMITS.command)
      throw new Error("A stdio MCP server needs a command to start.");
    const args = input.args ?? [];
    if (args.length > MCP_LIMITS.args || args.some((arg) => arg.length > MCP_LIMITS.arg)) {
      throw new Error(`At most ${MCP_LIMITS.args} arguments of ${MCP_LIMITS.arg} characters.`);
    }
    const cwd = input.cwd?.trim() || null;
    return { command, args: [...args], cwd, url: null };
  }
  const address = input.url?.trim() ?? "";
  if (!address || address.length > MCP_LIMITS.url) throw new Error("An http MCP server needs an address.");
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new Error("The MCP server address is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("The MCP server address uses http or https.");
  if (url.username || url.password) throw new Error("Put credentials in a secret header, not in the address.");
  return { command: null, args: [], cwd: null, url: url.toString() };
}

function checkedSecrets(secrets: Record<string, string>): Record<string, string> {
  const entries = Object.entries(secrets);
  if (entries.length > MCP_LIMITS.secrets) throw new Error(`At most ${MCP_LIMITS.secrets} secrets.`);
  const checked: Record<string, string> = {};
  for (const [name, value] of entries) {
    const key = name.trim();
    if (!key || key.length > MCP_LIMITS.secretName || !/^[A-Za-z0-9_-]+$/.test(key)) {
      throw new Error("A secret name has letters, digits, dashes and underscores.");
    }
    if (!isString(value) || value.length > MCP_LIMITS.secretValue) throw new Error("A secret value is too long.");
    checked[key] = value;
  }
  return checked;
}

function asRow(value: unknown): DynamicRecord {
  if (!isDynamicRecord(value)) throw new Error("Invalid MCP row.");
  return value;
}

function rows(value: unknown): DynamicRecord[] {
  if (!Array.isArray(value)) throw new Error("Invalid SQLite result set.");
  return value.map(asRow);
}

function text(row: DynamicRecord, key: string): string {
  const value = row[key];
  if (!isString(value)) throw new Error(`Invalid MCP column ${key}.`);
  return value;
}

function recordFromRow(row: DynamicRecord): McpServerRecord {
  const transport = text(row, "transport");
  if (!isMcpTransport(transport)) throw new Error("Invalid MCP transport.");
  const config = JSON.parse(text(row, "config_json"));
  if (!isDynamicRecord(config)) throw new Error("Invalid MCP config.");
  const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter(isString) : []);
  return {
    id: text(row, "server_id"),
    name: text(row, "name"),
    transport,
    command: isString(config.command) ? config.command : null,
    args: strings(config.args),
    cwd: isString(config.cwd) ? config.cwd : null,
    url: isString(config.url) ? config.url : null,
    secretNames: strings(config.secretNames),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}
