// COSGRAL W5-K2: the person's own model endpoints (OpenAI-compatible servers, Ollama, LM Studio) in the local database.
// - An endpoint is saved without contacting anything. The model list is fetched only when the person asks (`check`,
//   `detectLocal`): GET <baseUrl>/models, no redirects, a short time limit, a size limit.
// - The key (optional) lives in the ApiKeyStore of W5-BE3 (encrypted, slot "endpoint:<id>"). It is read only to send it
//   to the host of that endpoint and is never part of an answer, an event or a message of this store. A key belongs to
//   one host: changing the host of the address removes it. Removing the endpoint removes it.
// - Nothing here writes through `dispatch`: no key and no address goes to the event log.

import {
  checkEndpointUrl,
  ENDPOINT_LIMITS,
  ENDPOINT_PRESETS,
  type EndpointKind,
  type EndpointState,
  endpointModelId,
  isEndpointId,
  isEndpointKind,
  type ModelEndpoint,
  type SaveEndpointInput,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import type { ApiKeyStore } from "./api-key-store";
import type { OpenBotDatabase } from "./openbot-database";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projection_model_endpoints (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    kind TEXT NOT NULL,
    base_url TEXT NOT NULL,
    models TEXT NOT NULL DEFAULT '[]',
    state TEXT NOT NULL DEFAULT 'unchecked',
    message TEXT,
    checked_at TEXT,
    created_at TEXT NOT NULL
  );
`;

const CHECK_TIMEOUT_MS = 8_000;
const DETECT_TIMEOUT_MS = 1_500;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

export function endpointKeySlot(id: string): string {
  return `endpoint:${id}`;
}

export interface EndpointProbe {
  id: string;
  kind: EndpointKind;
  label: string;
  baseUrl: string;
}

export interface EndpointStoreOptions {
  /** Tests give a fake or a loopback server; the app uses the global fetch. */
  fetch?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
  detectTimeoutMs?: number;
  /** What "detect local" looks at. Defaults to Ollama on port 11434 and LM Studio on port 1234 of 127.0.0.1. */
  probes?: readonly EndpointProbe[];
  /** Called with the whole list after every change (the window replaces its list). */
  onChange?: (endpoints: ModelEndpoint[]) => void;
}

export const DEFAULT_PROBES: readonly EndpointProbe[] = ENDPOINT_PRESETS.map((preset) => ({
  id: preset.kind,
  kind: preset.kind,
  label: preset.label,
  baseUrl: preset.baseUrl,
}));

interface Row {
  id: string;
  label: string;
  kind: EndpointKind;
  baseUrl: string;
  models: string[];
  state: Exclude<EndpointState, "checking">;
  message: string | null;
  checkedAt: string | null;
}

/** What the chat client needs to talk to one endpoint. */
export interface ResolvedEndpoint {
  id: string;
  label: string;
  baseUrl: string;
  key: string | null;
}

export class EndpointStore {
  readonly #database: OpenBotDatabase;
  readonly #keys: ApiKeyStore;
  readonly #options: EndpointStoreOptions;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;
  readonly #running = new Set<string>();
  /** Counts changes per endpoint, so a fetch that ends after an edit or removal does not write its answer. */
  readonly #versions = new Map<string, number>();

  constructor(database: OpenBotDatabase, keys: ApiKeyStore, options: EndpointStoreOptions = {}) {
    this.#database = database;
    this.#keys = keys;
    this.#options = options;
    this.#fetch = options.fetch ?? ((...args) => fetch(...args));
    this.#now = options.now ?? (() => new Date());
    database.connection.exec(SCHEMA);
  }

  list(): ModelEndpoint[] {
    return this.#rows().map((row) => this.#view(row));
  }

  get(id: string): ModelEndpoint | null {
    const row = this.#row(id);
    return row ? this.#view(row) : null;
  }

  /** The address and key of one endpoint for the chat client; null when it is gone. */
  resolve(id: string): ResolvedEndpoint | null {
    const row = this.#row(id);
    if (!row) return null;
    return { id: row.id, label: row.label, baseUrl: row.baseUrl, key: this.#keys.slotKey(endpointKeySlot(id)) };
  }

  /** The agent models of every endpoint with a model list: `endpoint:<id>/<model>` and a readable name. */
  modelOptions(): Array<{ id: ReturnType<typeof endpointModelId>; name: string }> {
    return this.#rows().flatMap((row) =>
      row.models.map((model) => ({
        id: endpointModelId(row.id, model),
        name: `${model} (${row.label}, chat only)`,
      })),
    );
  }

  save(input: SaveEndpointInput): ModelEndpoint {
    const url = checkEndpointUrl(input.baseUrl);
    if (!url.ok) throw new Error(url.reason);
    const existing = input.id ? this.#row(input.id) : null;
    if (input.id && !existing) throw new Error("This endpoint no longer exists.");
    if (!existing && this.#rows().length >= ENDPOINT_LIMITS.endpoints)
      throw new Error(`You can add up to ${ENDPOINT_LIMITS.endpoints} endpoints. Remove one first.`);
    const id = existing?.id ?? this.#newId(input.label);
    const slot = endpointKeySlot(id);
    const addressChanged = existing !== null && existing.baseUrl !== url.baseUrl;
    const hostChanged = existing !== null && originOf(existing.baseUrl) !== originOf(url.baseUrl);
    let note: string | null = null;
    if (input.key) {
      this.#keys.setSlot(slot, input.key);
    } else if (input.clearKey) {
      this.#keys.removeSlot(slot);
    } else if (hostChanged && this.#keys.slotMask(slot)) {
      // A key is for one host: it is not carried to another address.
      this.#keys.removeSlot(slot);
      note = "The address now points to another host, so the saved key was removed. Enter it again if it applies.";
    }
    this.#bump(id);
    if (existing) {
      this.#database.connection
        .prepare(
          `UPDATE projection_model_endpoints SET label = ?, kind = ?, base_url = ?,
             models = CASE WHEN ? THEN '[]' ELSE models END,
             state = CASE WHEN ? THEN 'unchecked' ELSE state END,
             message = CASE WHEN ? THEN ? ELSE message END,
             checked_at = CASE WHEN ? THEN NULL ELSE checked_at END
           WHERE id = ?`,
        )
        .run(
          input.label,
          input.kind,
          url.baseUrl,
          addressChanged ? 1 : 0,
          addressChanged ? 1 : 0,
          addressChanged || note ? 1 : 0,
          note,
          addressChanged ? 1 : 0,
          id,
        );
    } else {
      this.#database.connection
        .prepare(
          "INSERT INTO projection_model_endpoints (id, label, kind, base_url, models, state, message, created_at) VALUES (?, ?, ?, ?, '[]', 'unchecked', NULL, ?)",
        )
        .run(id, input.label, input.kind, url.baseUrl, this.#iso());
    }
    this.#changed();
    return this.#required(id);
  }

  /** Removes the endpoint and its key. Agents set to one of its models get a readable error from the chat client. */
  remove(id: string): void {
    if (!isEndpointId(id) || !this.#row(id)) return;
    this.#database.connection.prepare("DELETE FROM projection_model_endpoints WHERE id = ?").run(id);
    this.#keys.removeSlot(endpointKeySlot(id));
    this.#bump(id);
    this.#running.delete(id);
    this.#changed();
  }

  /**
   * Fetches the model list. Only when the person clicked. A server that is down, slow or answers something else is
   * "unreachable"; 401/403 is "rejected". Never throws for a bad answer.
   */
  async check(id: string): Promise<ModelEndpoint> {
    const row = this.#row(id);
    if (!row) throw new Error("This endpoint no longer exists.");
    if (this.#running.has(id)) return this.#required(id);
    const version = this.#versions.get(id) ?? 0;
    this.#running.add(id);
    this.#changed();
    const result = await this.#fetchModels(row.baseUrl, this.#keys.slotKey(endpointKeySlot(id)), this.#timeout());
    this.#running.delete(id);
    // The endpoint was edited or removed while the request ran: that answer is about an older address.
    if ((this.#versions.get(id) ?? 0) === version && this.#row(id)) this.#writeResult(id, result);
    this.#changed();
    return this.#row(id) ? this.#required(id) : this.#view({ ...row, ...asRow(result) });
  }

  /**
   * Looks only at the loopback addresses of the probes (Ollama, LM Studio). Nothing listening is not an error: the
   * list is empty. A server that answers is added (or refreshed) with its models.
   */
  async detectLocal(): Promise<ModelEndpoint[]> {
    const found: ModelEndpoint[] = [];
    const probes = this.#options.probes ?? DEFAULT_PROBES;
    const results = await Promise.all(
      probes.map(async (probe) => ({
        probe,
        result: await this.#fetchModels(probe.baseUrl, null, this.#options.detectTimeoutMs ?? DETECT_TIMEOUT_MS),
      })),
    );
    for (const { probe, result } of results) {
      if (result.state !== "ok") continue;
      if (!this.#row(probe.id)) {
        if (this.#rows().length >= ENDPOINT_LIMITS.endpoints) continue;
        this.#database.connection
          .prepare(
            "INSERT INTO projection_model_endpoints (id, label, kind, base_url, models, state, message, created_at) VALUES (?, ?, ?, ?, '[]', 'unchecked', NULL, ?)",
          )
          .run(probe.id, probe.label, probe.kind, probe.baseUrl, this.#iso());
      }
      this.#bump(probe.id);
      this.#writeResult(probe.id, result);
      found.push(this.#required(probe.id));
    }
    if (found.length > 0) this.#changed();
    return found;
  }

  // --- the model list request ---

  async #fetchModels(baseUrl: string, key: string | null, timeoutMs: number): Promise<FetchResult> {
    const url = checkEndpointUrl(baseUrl);
    if (!url.ok) return { state: "unreachable", message: url.reason, models: [] };
    const headers: Record<string, string> = { accept: "application/json" };
    if (key) headers.authorization = `Bearer ${key}`;
    try {
      const response = await this.#fetch(`${url.baseUrl}/models`, {
        method: "GET",
        headers,
        // A redirect could carry the key to another host: it is an error, not a hop.
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel().catch(() => undefined);
        return {
          state: "rejected",
          message: key
            ? "The server did not accept the key. Check it or enter a new one."
            : "The server asks for a key. Enter one and try again.",
          models: [],
        };
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return {
          state: "unreachable",
          message:
            response.status === 404
              ? "The server has no model list at this address. The address usually ends with /v1."
              : `The server answered ${response.status}. Try again later.`,
          models: [],
        };
      }
      const models = parseModelList(await readLimited(response, MAX_BODY_BYTES));
      if (!models)
        return {
          state: "unreachable",
          message: "The server answered, but not with an OpenAI-style model list. Check the address.",
          models: [],
        };
      return {
        state: "ok",
        message:
          models.length === 0
            ? "The server answered, but lists no models yet."
            : `${models.length} model${models.length === 1 ? "" : "s"} found.`,
        models,
      };
    } catch (error) {
      return { state: "unreachable", message: unreachableMessage(error), models: [] };
    }
  }

  #writeResult(id: string, result: FetchResult): void {
    this.#database.connection
      .prepare("UPDATE projection_model_endpoints SET models = ?, state = ?, message = ?, checked_at = ? WHERE id = ?")
      .run(JSON.stringify(result.models), result.state, result.message, this.#iso(), id);
  }

  // --- rows ---

  #rows(): Row[] {
    return this.#database.connection
      .prepare(
        "SELECT id, label, kind, base_url, models, state, message, checked_at FROM projection_model_endpoints ORDER BY created_at, id",
      )
      .all()
      .flatMap((raw) => {
        const row = toRow(raw);
        return row ? [row] : [];
      });
  }

  #row(id: string): Row | null {
    const raw = this.#database.connection
      .prepare(
        "SELECT id, label, kind, base_url, models, state, message, checked_at FROM projection_model_endpoints WHERE id = ?",
      )
      .get(id);
    return toRow(raw);
  }

  #required(id: string): ModelEndpoint {
    const row = this.#row(id);
    if (!row) throw new Error("This endpoint no longer exists.");
    return this.#view(row);
  }

  #view(row: Row): ModelEndpoint {
    const mask = this.#keys.slotMask(endpointKeySlot(row.id));
    const url = checkEndpointUrl(row.baseUrl);
    return {
      id: row.id,
      label: row.label,
      kind: row.kind,
      baseUrl: row.baseUrl,
      hasKey: mask !== null,
      maskedKey: mask,
      models: row.models,
      state: this.#running.has(row.id) ? "checking" : row.state,
      message: row.message,
      checkedAt: row.checkedAt,
      warning: url.ok ? url.warning : url.reason,
      chatOnly: true,
    };
  }

  #newId(label: string): string {
    const slug =
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24) || "endpoint";
    const base = /^[a-z]/.test(slug) ? slug : `ep-${slug}`;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const id = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      if (!this.#row(id)) return id;
    }
    throw new Error("Could not make a name for the endpoint. Try again.");
  }

  #bump(id: string): void {
    this.#versions.set(id, (this.#versions.get(id) ?? 0) + 1);
  }

  #changed(): void {
    this.#options.onChange?.(this.list());
  }

  #timeout(): number {
    return this.#options.timeoutMs ?? CHECK_TIMEOUT_MS;
  }

  #iso(): string {
    return this.#now().toISOString();
  }
}

interface FetchResult {
  state: "ok" | "rejected" | "unreachable";
  message: string;
  models: string[];
}

function asRow(result: FetchResult): Partial<Row> {
  return { models: result.models, state: result.state, message: result.message };
}

function originOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return baseUrl;
  }
}

function toRow(raw: unknown): Row | null {
  if (!isDynamicRecord(raw) || !isEndpointId(raw.id) || !isString(raw.label) || !isString(raw.base_url)) return null;
  if (!isEndpointKind(raw.kind)) return null;
  let models: string[] = [];
  try {
    const parsed = isString(raw.models) ? JSON.parse(raw.models) : [];
    if (Array.isArray(parsed)) models = parsed.filter(isString);
  } catch {
    models = [];
  }
  const state = raw.state === "ok" || raw.state === "rejected" || raw.state === "unreachable" ? raw.state : "unchecked";
  return {
    id: raw.id,
    label: raw.label,
    kind: raw.kind,
    baseUrl: raw.base_url,
    models,
    state,
    message: isString(raw.message) ? raw.message : null,
    checkedAt: isString(raw.checked_at) ? raw.checked_at : null,
  };
}

/** Never repeats the text of the system error: it may quote the address. */
function unreachableMessage(error: unknown) {
  const name = isDynamicRecord(error) && isString(error.name) ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError")
    return "The server did not answer in time. Is it running? Try again.";
  return "Could not reach the server. Check the address and that it is running.";
}

/** The answer of `GET /models`: `{ data: [{ id }] }`. Names are trimmed, deduplicated and limited. */
export function parseModelList(text: string | null): string[] | null {
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isDynamicRecord(value) || !Array.isArray(value.data)) return null;
  const names = new Set<string>();
  for (const item of value.data) {
    const id = isDynamicRecord(item) && isString(item.id) ? item.id.trim() : "";
    if (id && id.length <= ENDPOINT_LIMITS.model && !/\p{Cc}/u.test(id)) names.add(id);
    if (names.size >= ENDPOINT_LIMITS.models) break;
  }
  return [...names];
}

/** The body as text, or null when it is larger than `max` bytes. */
async function readLimited(response: Response, max: number): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
