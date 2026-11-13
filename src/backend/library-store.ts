// COSGRAL W2: the file library (spec W2 §6, parity row 30; lead decision W2-6: one store, two views).
//
// One store of files: the Transfers folder of the program and its index, the `projection_attachments` table. Chat
// attachments are already there (rows of the mailbox); library files are added next to them, in Transfers/library,
// as rows of kind "library". The library view and the chat view are two filters of the same index. The database
// keeps only the index; the bytes stay in the folder. A path that resolves outside the store is refused, an agent
// saves only from the folders it is given, and every limit comes from LIBRARY_LIMITS (one place).

import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { copyFile, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import {
  type AttachmentDataInput,
  LIBRARY_LIMITS,
  LIBRARY_ORIGINS,
  type LibraryItem,
  type LibraryOrigin,
  type LibraryUsage,
  type ListLibraryInput,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isOneOf, isString } from "@openbot/contracts/runtime-values";
import { attachmentMetadata, attachmentPreviewUrl, sanitizeName } from "./mailbox-store";
import type { OpenBotDatabase } from "./openbot-database";

/** The agent that acts, or null for the person. */
export type LibraryActor = string | null;

export interface LibraryLimits {
  fileBytes: number;
  totalBytes: number;
  files: number;
}

export interface LibraryStoreOptions {
  database: OpenBotDatabase;
  /** `<shared>/Transfers`: the folder of chat attachments; library files go to its `library` folder. */
  transfersRoot: string;
  now?: () => Date;
  /** Tests only; the program uses LIBRARY_LIMITS. */
  limits?: Partial<LibraryLimits>;
}

export interface ResolvedLibraryFile {
  path: string;
  name: string;
  mimeType: string;
}

const LIBRARY_KIND = "library";
const CHAT_KINDS = ["mailbox-message", "generated"];
const ROW_SELECT = `
  SELECT a.attachment_id, a.owner_kind, a.owner_id, a.name, a.path, a.metadata_json, a.created_at,
    m.sender_kind, m.sender_agent_id
  FROM projection_attachments a
  LEFT JOIN projection_mailbox_messages m ON a.owner_kind = 'mailbox-message' AND m.message_id = a.owner_id
  WHERE a.owner_kind IN ('library', 'mailbox-message', 'generated')`;

interface IndexRow {
  id: string;
  kind: string;
  path: string;
  item: LibraryItem;
}

interface Source {
  name: string;
  size: number;
  mimeType?: string;
  path?: string;
  bytes?: Uint8Array;
}

export class LibraryStore extends EventEmitter<{ changed: [fileIds: string[]] }> {
  /** Where library files live: `<Transfers>/library/<file id>/<name>`. */
  readonly root: string;
  readonly #database: OpenBotDatabase;
  readonly #transfersRoot: string;
  readonly #now: () => Date;
  readonly #limits: LibraryLimits;

  constructor(options: LibraryStoreOptions) {
    super();
    this.#database = options.database;
    this.#transfersRoot = options.transfersRoot;
    this.root = join(options.transfersRoot, "library");
    this.#now = options.now ?? (() => new Date());
    this.#limits = {
      fileBytes: options.limits?.fileBytes ?? LIBRARY_LIMITS.fileBytes,
      totalBytes: options.limits?.totalBytes ?? LIBRARY_LIMITS.totalBytes,
      files: options.limits?.files ?? LIBRARY_LIMITS.files,
    };
  }

  /** Library files and chat attachments, newest first. */
  list(input: ListLibraryInput = {}): LibraryItem[] {
    const query = isString(input.query) ? input.query.trim().toLocaleLowerCase() : "";
    if (query.length > LIBRARY_LIMITS.query) throw new Error(`Search with at most ${LIBRARY_LIMITS.query} characters.`);
    if (input.origin !== undefined && !isOneOf(LIBRARY_ORIGINS, input.origin)) {
      throw new Error(`origin is one of ${LIBRARY_ORIGINS.join(", ")}.`);
    }
    const limit = isNumber(input.limit)
      ? Math.min(LIBRARY_LIMITS.listLimit, Math.max(1, Math.floor(input.limit)))
      : LIBRARY_LIMITS.defaultListLimit;
    const items: LibraryItem[] = [];
    for (const row of this.#database.connection
      .prepare(`${ROW_SELECT} ORDER BY a.created_at DESC, a.rowid DESC`)
      .all()) {
      const parsed = parseIndexRow(row);
      if (!parsed) continue;
      if (input.origin && parsed.item.origin !== input.origin) continue;
      if (query && !parsed.item.name.toLocaleLowerCase().includes(query)) continue;
      items.push(parsed.item);
      if (items.length >= limit) break;
    }
    return items;
  }

  /** One file of either view. */
  get(fileId: string): LibraryItem {
    const row = this.#row(fileId);
    if (!row) throw new Error(`File "${fileId}" no longer exists in the library.`);
    return row.item;
  }

  /** Space used by library files; chat attachments are counted by the chat. */
  usage(): LibraryUsage {
    const row = this.#database.connection
      .prepare(
        `SELECT COUNT(*) AS files, COALESCE(SUM(json_extract(metadata_json, '$.size')), 0) AS bytes
         FROM projection_attachments WHERE owner_kind = ?`,
      )
      .get(LIBRARY_KIND);
    return {
      files: isDynamicRecord(row) && isNumber(row.files) ? row.files : 0,
      bytes: isDynamicRecord(row) && isNumber(row.bytes) ? row.bytes : 0,
      limitBytes: this.#limits.totalBytes,
    };
  }

  /**
   * Copies files into the library. The person may pick any file; an agent passes `allowedRoots` (its workspace and
   * the shared folder) and a path that resolves outside them is refused.
   */
  async addFiles(
    input: { paths?: string[]; data?: AttachmentDataInput[] },
    actor: LibraryActor,
    options: { allowedRoots?: readonly string[] } = {},
  ): Promise<LibraryItem[]> {
    const sources = await this.#sources(input, options.allowedRoots);
    this.#checkLimits(sources);
    const at = this.#now().toISOString();
    const created: IndexRow[] = [];
    const folders: string[] = [];
    const insert = this.#database.connection.prepare(
      `INSERT INTO projection_attachments
         (attachment_id, owner_kind, owner_id, name, path, metadata_json, created_at, last_event_sequence)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    );
    try {
      for (const source of sources) {
        const id = randomUUID();
        const folder = join(this.root, id);
        const target = join(folder, source.name);
        folders.push(folder);
        await mkdir(folder, { recursive: true, mode: 0o700 });
        if (source.path) await copyFile(source.path, target);
        else await writeFile(target, source.bytes ?? new Uint8Array(), { mode: 0o600 });
        const content = await readFile(target);
        const item: LibraryItem = {
          id,
          name: source.name,
          size: content.byteLength,
          ...attachmentMetadata(source.name, source.mimeType),
          previewUrl: attachmentPreviewUrl(id),
          origin: actor === null ? "upload" : "agent",
          createdAt: at,
          createdByBotId: actor,
          messageId: null,
        };
        const sha256 = createHash("sha256").update(content).digest("hex");
        insert.run(id, LIBRARY_KIND, actor ?? "person", item.name, target, JSON.stringify({ ...item, sha256 }), at);
        created.push({ id, kind: LIBRARY_KIND, path: target, item });
      }
    } catch (error) {
      for (const row of created) {
        this.#database.connection.prepare("DELETE FROM projection_attachments WHERE attachment_id = ?").run(row.id);
      }
      await Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true })));
      throw error;
    }
    this.emit(
      "changed",
      created.map((row) => row.id),
    );
    return created.map((row) => row.item);
  }

  /** Keeps a copy of a chat attachment among the library files. */
  async saveFromChat(attachmentId: string, actor: LibraryActor): Promise<LibraryItem> {
    const row = this.#row(attachmentId);
    if (!row || row.kind === LIBRARY_KIND) throw new Error("This file is not a chat attachment.");
    const resolved = await this.resolve(attachmentId);
    if (!resolved) throw new Error("This chat attachment is no longer available.");
    const [item] = await this.addFiles({ paths: [resolved.path] }, actor);
    if (!item) throw new Error("The file was not saved.");
    return item;
  }

  /** Deletes a library file and frees its space. The person deletes any; an agent only the files it saved. */
  async delete(fileId: string, actor: LibraryActor): Promise<void> {
    const row = this.#row(fileId);
    if (!row) throw new Error(`File "${fileId}" no longer exists in the library.`);
    if (row.kind !== LIBRARY_KIND) throw new Error("This file is a chat attachment; it stays with its message.");
    if (actor !== null && row.item.createdByBotId !== actor) {
      throw new Error("An agent can delete only the files it saved; the person can delete any library file.");
    }
    this.#database.connection.prepare("DELETE FROM projection_attachments WHERE attachment_id = ?").run(fileId);
    const folder = join(this.root, fileId);
    if (resolve(dirname(row.path)) === resolve(folder)) await rm(folder, { recursive: true, force: true });
    this.emit("changed", [fileId]);
  }

  /** The file on disk, only when it is still inside the store; null otherwise. */
  async resolve(fileId: string): Promise<ResolvedLibraryFile | null> {
    const row = this.#row(fileId);
    if (!row?.path) return null;
    try {
      const root = row.kind === LIBRARY_KIND ? this.root : this.#transfersRoot;
      const [canonicalRoot, canonicalPath] = await Promise.all([realpath(root), realpath(row.path)]);
      if (!isInside(canonicalPath, canonicalRoot)) return null;
      if (!(await stat(canonicalPath)).isFile()) return null;
      return { path: canonicalPath, name: row.item.name, mimeType: row.item.mimeType };
    } catch {
      return null;
    }
  }

  async #sources(
    input: { paths?: string[]; data?: AttachmentDataInput[] },
    allowedRoots: readonly string[] | undefined,
  ): Promise<Source[]> {
    const paths = input.paths ?? [];
    const data = input.data ?? [];
    if (paths.length + data.length === 0) throw new Error("Choose at least one file.");
    if (paths.length + data.length > INPUT_LIMITS.attachments) {
      throw new Error(`Save at most ${INPUT_LIMITS.attachments} files at once.`);
    }
    const roots = allowedRoots
      ? (await Promise.all(allowedRoots.map((root) => realpath(root).catch(() => null)))).filter(isString)
      : null;
    const sources: Source[] = [];
    for (const path of paths) {
      if (!isString(path) || !path || path.length > INPUT_LIMITS.path) throw new Error("A file path is invalid.");
      let real: string;
      try {
        real = await realpath(path);
      } catch {
        throw new Error(`File not found: ${basename(path)}`);
      }
      if (roots && !roots.some((root) => isInside(real, root))) {
        throw new Error(
          `${basename(path)} is outside the folders you may save from (your workspace and the shared folder).`,
        );
      }
      const info = await stat(real);
      if (!info.isFile()) throw new Error(`Only regular files can be saved: ${basename(real)}`);
      sources.push({ name: sanitizeName(real), size: info.size, path: real });
    }
    for (const item of data) {
      if (!isDynamicRecord(item) || !isString(item.name) || !(item.bytes instanceof Uint8Array)) {
        throw new Error("File data is invalid.");
      }
      if (item.name.length > INPUT_LIMITS.attachmentName || (item.mimeType ?? "").length > INPUT_LIMITS.mimeType) {
        throw new Error("File name or type is too long.");
      }
      sources.push({
        name: sanitizeName(item.name || "pasted-file"),
        size: item.bytes.byteLength,
        mimeType: isString(item.mimeType) ? item.mimeType : undefined,
        bytes: item.bytes,
      });
    }
    return sources;
  }

  #checkLimits(sources: Source[]): void {
    for (const source of sources) {
      if (source.size > this.#limits.fileBytes) {
        throw new Error(`${source.name} is too big: one file has at most ${formatBytes(this.#limits.fileBytes)}.`);
      }
    }
    const usage = this.usage();
    if (usage.files + sources.length > this.#limits.files) {
      throw new Error(`The library holds at most ${this.#limits.files} files. Delete files first.`);
    }
    const adding = sources.reduce((total, source) => total + source.size, 0);
    if (usage.bytes + adding > this.#limits.totalBytes) {
      throw new Error(
        `The library is full: at most ${formatBytes(this.#limits.totalBytes)} in all. Delete files first.`,
      );
    }
  }

  #row(fileId: string): IndexRow | null {
    if (!isString(fileId) || !fileId) return null;
    return parseIndexRow(this.#database.connection.prepare(`${ROW_SELECT} AND a.attachment_id = ?`).get(fileId));
  }
}

function parseIndexRow(row: unknown): IndexRow | null {
  if (!isDynamicRecord(row) || !isString(row.attachment_id) || !isString(row.owner_kind)) return null;
  let metadata: unknown;
  try {
    metadata = isString(row.metadata_json) ? JSON.parse(row.metadata_json) : null;
  } catch {
    return null;
  }
  if (!isDynamicRecord(metadata)) return null;
  const name = isString(metadata.name) ? metadata.name : isString(row.name) ? row.name : "";
  if (!name) return null;
  const library = row.owner_kind === LIBRARY_KIND;
  if (!library && !CHAT_KINDS.includes(row.owner_kind)) return null;
  const origin: LibraryOrigin = library ? (metadata.origin === "agent" ? "agent" : "upload") : "chat";
  const sender = row.sender_kind === "bot" && isString(row.sender_agent_id) ? row.sender_agent_id : null;
  const item: LibraryItem = {
    id: row.attachment_id,
    name,
    size: isNumber(metadata.size) ? metadata.size : 0,
    ...attachmentMetadata(name, isString(metadata.mimeType) ? metadata.mimeType : undefined),
    previewUrl: isString(metadata.previewUrl) ? metadata.previewUrl : null,
    origin,
    createdAt: isString(row.created_at) ? row.created_at : "",
    createdByBotId: library ? (isString(metadata.createdByBotId) ? metadata.createdByBotId : null) : sender,
    messageId: row.owner_kind === "mailbox-message" && isString(row.owner_id) ? row.owner_id : null,
  };
  return { id: row.attachment_id, kind: row.owner_kind, path: isString(row.path) ? row.path : "", item };
}

function isInside(path: string, root: string): boolean {
  const between = relative(resolve(root), resolve(path));
  return between !== "" && between !== ".." && !between.startsWith(`..${sep}`) && !isAbsolute(between);
}

function formatBytes(bytes: number): string {
  const units: Array<[number, string]> = [
    [1024 ** 3, "GB"],
    [1024 ** 2, "MB"],
    [1024, "KB"],
  ];
  for (const [size, unit] of units) {
    if (bytes >= size) return `${Math.round((bytes / size) * 10) / 10} ${unit}`;
  }
  return `${bytes} B`;
}
