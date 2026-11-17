// COSGRAL W11-KK (e): reads the plugin catalog from a FOLDER the owner chose (`catalog.json` + `<slug>/<version>.json`). The folder
// is somebody else's data, so it is only ever read at run time and never copied into the repository. Every detail file is checked
// against the SHA-256 the index names; a file that is missing, too large, unreadable, does not match its checksum or has the wrong
// shape is SKIPPED (counted), never partly used. Texts are cut to a limit, addresses must be https (a server may also be http on this computer), and nothing from the files is
// ever run: an app only becomes an MCP server when the person installs it.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  isPluginSlug,
  PLUGIN_AUTH_KINDS,
  PLUGIN_CATEGORIES,
  PLUGIN_LIMITS,
  type PluginApp,
  type PluginAuth,
  type PluginAuthField,
  type PluginCategory,
  type PluginPrompt,
} from "@openbot/contracts/ipc";
import { isBoolean, isDynamicRecord, isOneOf, isString } from "@openbot/contracts/runtime-values";

const MAX_INDEX_BYTES = 2 * 1024 * 1024;
const MAX_DETAIL_BYTES = 512 * 1024;
const MAX_PLUGINS = 1_000;

export interface CatalogEntry {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: PluginCategory;
  creatorName: string | null;
  iconUrl: string | null;
  version: string;
  featured: boolean;
  prompts: PluginPrompt[];
  apps: PluginApp[];
  websiteUrl: string | null;
  privacyPolicyUrl: string | null;
  termsUrl: string | null;
}

export interface LoadedCatalog {
  catalogVersion: string;
  entries: CatalogEntry[];
  /** Index entries that were not used (see the top of this file). */
  skipped: number;
}

export class CatalogFolderError extends Error {
  constructor() {
    super("That folder does not hold a plugin catalog (catalog.json was not found or is not valid).");
    this.name = "CatalogFolderError";
  }
}

/** Reads a file as text; null when it cannot be read or is larger than `limit` bytes. */
export type ReadText = (path: string, limit: number) => Promise<string | null>;

export const readTextFile: ReadText = async (path, limit) => {
  try {
    const buffer = await readFile(path);
    return buffer.byteLength > limit ? null : buffer.toString("utf8");
  } catch {
    return null;
  }
};

function text(value: unknown, limit: number = PLUGIN_LIMITS.text): string | null {
  if (!isString(value)) return null;
  const tidy = value.trim();
  if (tidy.length === 0) return null;
  return tidy.length > limit ? `${tidy.slice(0, limit - 1)}…` : tidy;
}

function httpsUrl(value: unknown): string | null {
  if (!isString(value)) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A server address: https, or http only for this computer (an app that runs on the person's own machine). */
function serverUrl(value: unknown): string | null {
  if (!isString(value)) return null;
  try {
    const url = new URL(value.trim());
    const loopback = url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
    return (url.protocol === "https:" || loopback) && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseField(value: unknown): PluginAuthField | null {
  if (!isDynamicRecord(value) || !isString(value.id) || !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(value.id)) return null;
  const label = text(value.label, 200);
  if (label === null) return null;
  const base = { id: value.id, label, hint: text(value.hint, 300), placeholder: text(value.placeholder, 200) };
  if (isString(value.env) && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value.env)) {
    return { ...base, target: { kind: "env", name: value.env } };
  }
  if (isString(value.header) && /^[A-Za-z0-9-]{1,128}$/.test(value.header)) {
    return { ...base, target: { kind: "header", name: value.header, prefix: headerPrefix(value.prefix) } };
  }
  return null;
}

function parseAuth(value: unknown): PluginAuth | null {
  if (!isDynamicRecord(value) || !isString(value.id) || !isOneOf(PLUGIN_AUTH_KINDS, value.kind)) return null;
  const label = text(value.label, 200);
  if (label === null) return null;
  const fields = Array.isArray(value.fields) ? value.fields.slice(0, PLUGIN_LIMITS.secrets).map(parseField) : [];
  if (fields.some((field) => field === null)) return null;
  return {
    id: value.id,
    kind: value.kind,
    label,
    fields: fields.flatMap((field) => (field ? [field] : [])),
    docsUrl: httpsUrl(value.docsUrl),
    docsLabel: text(value.docsLabel, 120),
    steps: Array.isArray(value.steps) ? value.steps.flatMap((step) => text(step, 500) ?? []).slice(0, 12) : [],
    note: text(value.note, 500),
  };
}

function parseApp(value: unknown): PluginApp | null {
  if (!isDynamicRecord(value) || !isString(value.id) || !isDynamicRecord(value.server)) return null;
  const server = value.server;
  const name = text(value.name, 120);
  if (name === null) return null;
  const transport = server.transport;
  let url: string | null = null;
  let command: string | null = null;
  let args: string[] = [];
  if (transport === "http") {
    url = serverUrl(server.url);
    if (url === null) return null;
  } else if (transport === "stdio") {
    command = text(server.command, 1_000);
    if (command === null) return null;
    if (Array.isArray(server.args)) {
      if (server.args.length > 64 || !server.args.every((arg) => isString(arg) && arg.length <= 2_000)) return null;
      args = [...server.args];
    }
  } else {
    return null;
  }
  const auth = Array.isArray(server.auth) ? server.auth.map(parseAuth) : [];
  if (auth.some((entry) => entry === null)) return null;
  return {
    id: value.id,
    name,
    description: text(value.description) ?? "",
    iconUrl: httpsUrl(value.iconUrl),
    transport,
    url,
    command,
    args,
    auth: auth.flatMap((entry) => (entry ? [entry] : [])),
    macOnly: Array.isArray(value.macAutomation) && value.macAutomation.length > 0,
  };
}

/** The entry of one detail file, or null when it has the wrong shape. `slug` and `version` come from the index and must match. */
export function parseCatalogEntry(raw: unknown, slug: string, version: string, featured: boolean): CatalogEntry | null {
  if (!isDynamicRecord(raw) || raw.slug !== slug || raw.version !== version) return null;
  const name = text(raw.name, 120);
  const category = isOneOf(PLUGIN_CATEGORIES, raw.category) ? raw.category : "other";
  if (name === null || !Array.isArray(raw.apps) || raw.apps.length === 0 || raw.apps.length > PLUGIN_LIMITS.apps)
    return null;
  const apps = raw.apps.map(parseApp);
  if (apps.some((app) => app === null)) return null;
  const prompts = Array.isArray(raw.prompts)
    ? raw.prompts
        .flatMap((prompt) =>
          isDynamicRecord(prompt) && isString(prompt.id) && text(prompt.text, 500) !== null
            ? [{ id: prompt.id, text: text(prompt.text, 500) ?? "" }]
            : [],
        )
        .slice(0, PLUGIN_LIMITS.prompts)
    : [];
  return {
    slug,
    name,
    tagline: text(raw.tagline, 300) ?? "",
    description: text(raw.description) ?? "",
    category,
    creatorName: text(raw.creatorName, 120),
    iconUrl: httpsUrl(raw.iconUrl),
    version,
    featured,
    prompts,
    apps: apps.flatMap((app) => (app ? [app] : [])),
    websiteUrl: httpsUrl(raw.websiteUrl),
    privacyPolicyUrl: httpsUrl(raw.privacyPolicyUrl),
    termsUrl: httpsUrl(raw.termsUrl),
  };
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Loads the catalog of `directory`. Throws `CatalogFolderError` when the index itself is missing or invalid. */
export async function loadCatalogFolder(directory: string, read: ReadText = readTextFile): Promise<LoadedCatalog> {
  const indexText = await read(join(directory, "catalog.json"), MAX_INDEX_BYTES);
  if (indexText === null) throw new CatalogFolderError();
  let index: unknown;
  try {
    index = JSON.parse(indexText);
  } catch {
    throw new CatalogFolderError();
  }
  if (!isDynamicRecord(index) || index.schemaVersion !== 1 || !Array.isArray(index.plugins))
    throw new CatalogFolderError();
  const catalogVersion = text(index.catalogVersion, 64) ?? "unknown";
  const entries: CatalogEntry[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const item of index.plugins.slice(0, MAX_PLUGINS)) {
    if (
      !isDynamicRecord(item) ||
      !isString(item.slug) ||
      !isPluginSlug(item.slug) ||
      !isString(item.version) ||
      !/^\d+(?:\.\d+){0,3}$/.test(item.version) ||
      !isString(item.detailSha256) ||
      !/^[a-f0-9]{64}$/i.test(item.detailSha256) ||
      seen.has(item.slug)
    ) {
      skipped += 1;
      continue;
    }
    seen.add(item.slug);
    const detail = await read(join(directory, item.slug, `${item.version}.json`), MAX_DETAIL_BYTES);
    if (detail === null || sha256(detail) !== item.detailSha256.toLowerCase()) {
      skipped += 1;
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(detail);
    } catch {
      skipped += 1;
      continue;
    }
    const entry = parseCatalogEntry(parsed, item.slug, item.version, isBoolean(item.featured) && item.featured);
    if (entry === null) {
      skipped += 1;
      continue;
    }
    entries.push(entry);
  }
  skipped += Math.max(0, index.plugins.length - MAX_PLUGINS);
  return { catalogVersion, entries, skipped };
}

/** The text put before a header value ("Bearer "): kept as written, trailing space included; no control characters, short. */
function headerPrefix(value: unknown): string | null {
  if (!isString(value) || value.length === 0 || value.length > 64) return null;
  return /^[\x20-\x7e]+$/.test(value) ? value : null;
}
