// COSGRAL W11-KK (e): the Marketplace "Apps" tab: a catalog of plugins (each one gives agents an MCP server: documents, mail, design,
// data tools and so on), install, update, own plugins. Our own contract for the behaviour of OpenBot 0.71 (parity row 41: ~250 plugins).
//
// WHERE THE CATALOG COMES FROM. The entries are somebody else's descriptions, so they are NOT in this repository. The program loads
// them from a FOLDER the owner points it to (an `index.json` list plus one detail file per plugin version, each checked against the
// SHA-256 the index names), or from nothing (the tab says so). Own plugins (`custom`) never depend on a catalog.
//
// INSTALLING. A plugin app becomes an MCP server of the program (the W2 MCP engine, limits there): `link` sign-in (OAuth in the
// browser, the existing MCP sign-in), `key` (the person types the values once; they are stored encrypted and never come back) or
// `local` (nothing to sign in to). Nothing installs by itself: an agent may only suggest a plugin and the person confirms.
// Everything is about THIS computer only.

import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const PLUGIN_CATEGORIES = [
  "coding",
  "productivity",
  "data-analytics",
  "automation",
  "research",
  "design",
  "documents",
  "other",
] as const;
export type PluginCategory = (typeof PLUGIN_CATEGORIES)[number];

/** link: sign in on the service's page; key: the person pastes values; local: nothing to sign in to. */
export const PLUGIN_AUTH_KINDS = ["link", "key", "local"] as const;
export type PluginAuthKind = (typeof PLUGIN_AUTH_KINDS)[number];

/**
 * available: not installed.
 * installed: its MCP server is on and answers.
 * needs-sign-in: installed, but the service wants a sign-in (`link`) or the values were refused.
 * update-available: the catalog holds a newer version than the installed one.
 * error: installed, but the server cannot start or answer (`error` says why in a fixed sentence).
 */
export const PLUGIN_STATES = ["available", "installed", "needs-sign-in", "update-available", "error"] as const;
export type PluginState = (typeof PLUGIN_STATES)[number];

/** Where the catalog data came from: nothing yet, a folder the owner chose, or the built-in demo (Storybook, tests). */
export const PLUGIN_CATALOG_SOURCES = ["none", "folder", "demo"] as const;
export type PluginCatalogSource = (typeof PLUGIN_CATALOG_SOURCES)[number];

export const PLUGIN_LIMITS = {
  query: 200,
  slug: 80,
  /** Plugins listed at once (the gallery pages through the rest). */
  page: 100,
  customName: 40,
  secrets: 16,
  secretValue: 8_000,
  /** Characters of one catalog text (tagline, description, prompt) kept; the rest is cut. */
  text: 2_000,
  prompts: 12,
  apps: 8,
} as const;

/** Where the value of a field goes when the server starts: an environment variable (stdio) or a request header (http). */
export interface PluginAuthField {
  id: string;
  label: string;
  hint: string | null;
  placeholder: string | null;
  target: { kind: "env"; name: string } | { kind: "header"; name: string; prefix: string | null };
}

export interface PluginAuth {
  id: string;
  kind: PluginAuthKind;
  label: string;
  fields: PluginAuthField[];
  docsUrl: string | null;
  docsLabel: string | null;
  steps: string[];
  note: string | null;
}

export interface PluginApp {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  transport: "stdio" | "http";
  /** http: the endpoint. */
  url: string | null;
  /** stdio: the program and its arguments. */
  command: string | null;
  args: string[];
  auth: PluginAuth[];
  /** The plugin needs macOS (and the person's permission for Automation): shown as unavailable elsewhere. */
  macOnly: boolean;
}

export interface PluginPrompt {
  id: string;
  text: string;
}

export interface PluginSummary {
  /** A catalog plugin: its slug. An own plugin: "custom-<name>". */
  slug: string;
  name: string;
  tagline: string;
  category: PluginCategory;
  creatorName: string | null;
  iconUrl: string | null;
  /** Catalog version, or the version installed for an own plugin ("custom"). */
  version: string;
  featured: boolean;
  custom: boolean;
  state: PluginState;
  installedVersion: string | null;
  /** Fixed sentence for `error` and `needs-sign-in`; never the server's own text. */
  error: string | null;
  /** Names of the agents that may use it (the MCP per-agent switch), only when installed. */
  agentCount: number;
  /** Windows: the plugin cannot run here (macOS only). */
  unavailableHere: boolean;
}

export interface PluginDetails {
  summary: PluginSummary;
  description: string;
  prompts: PluginPrompt[];
  apps: PluginApp[];
  websiteUrl: string | null;
  privacyPolicyUrl: string | null;
  termsUrl: string | null;
}

export interface PluginCatalogInfo {
  source: PluginCatalogSource;
  catalogVersion: string | null;
  count: number;
  loadedAt: string | null;
  /** Entries of the folder that were skipped (a detail file that is missing, unreadable or does not match its checksum). */
  skipped: number;
  /** The folder, when `source` is "folder" (for the settings screen). */
  directory: string | null;
}

export interface PluginList {
  info: PluginCatalogInfo;
  plugins: PluginSummary[];
  /** Matching plugins in all (the list is cut at `PLUGIN_LIMITS.page`). */
  total: number;
}

export interface ListPluginsInput {
  /** Words that must all appear (name, tagline, creator, category); case and accents do not matter. */
  query?: string;
  category?: PluginCategory;
  /** Only plugins in this state; `installed` means installed in any state except `available`. */
  filter?: "installed" | "featured" | "needs-attention";
  offset?: number;
}

export interface PluginSlugInput {
  slug: string;
}

export interface InstallPluginInput {
  slug: string;
  /** Write-only values of the `key` fields, by field id. Never returned, logged or put in an error. */
  secrets?: Record<string, string>;
  /** Install this app of the plugin only; every app when omitted. */
  appId?: string;
}

export interface AddCustomPluginInput {
  name: string;
  transport: "stdio" | "http";
  url?: string;
  command?: string;
  args?: string[];
  /** stdio: environment values; http: request headers. Write-only. */
  secrets?: Record<string, string>;
}

export interface SetPluginCatalogFolderInput {
  /** An absolute folder with `index.json`, or null to forget the folder. */
  directory: string | null;
}

export interface PluginCatalogDesktopApi {
  info: () => Promise<PluginCatalogInfo>;
  list: (input?: ListPluginsInput) => Promise<PluginList>;
  get: (input: PluginSlugInput) => Promise<PluginDetails>;
  /** Adds the plugin's MCP servers. A `link` sign-in continues in the browser: the answer is `needs-sign-in` until it ends. */
  install: (input: InstallPluginInput) => Promise<PluginSummary>;
  /** Removes the plugin's MCP servers and their saved values; its tools leave every agent. */
  uninstall: (input: PluginSlugInput) => Promise<PluginList>;
  /** Installs the newest catalog version of an installed plugin; the values stay. */
  update: (input: PluginSlugInput) => Promise<PluginSummary>;
  /** An own plugin: any MCP server the person adds by hand. Appears in the same list. */
  addCustom: (input: AddCustomPluginInput) => Promise<PluginSummary>;
  /** Loads the catalog from a folder (checked against the checksums of its index). Answers what was loaded. */
  setCatalogFolder: (input: SetPluginCatalogFolderInput) => Promise<PluginCatalogInfo>;
}

/** Event `plugin-catalog-changed`: the catalog info and the installed plugins (a changed install state, a load, an update). */
export interface PluginCatalogChanged {
  info: PluginCatalogInfo;
  installed: PluginSummary[];
}

// --- rules shared by the engine and the mock ---

export const PLUGIN_CATEGORY_LABELS: Readonly<Record<PluginCategory, string>> = {
  coding: "Coding",
  productivity: "Productivity",
  "data-analytics": "Data & analytics",
  automation: "Automation",
  research: "Research",
  design: "Design",
  documents: "Documents",
  other: "Other",
};

export function customPluginSlug(name: string): string {
  return `custom-${name}`;
}

/** A catalog slug: lowercase letters, digits and hyphens (a folder name). */
export function isPluginSlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
}

/** Words of a query lower-cased and without accents; all must appear. */
export function pluginSearchWords(query: string): string[] {
  return query
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

export function pluginMatches(summary: PluginSummary, words: readonly string[]): boolean {
  if (words.length === 0) return true;
  const haystack = [summary.name, summary.tagline, summary.creatorName ?? "", summary.category, summary.slug]
    .join(" ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function emptyPluginCatalogInfo(): PluginCatalogInfo {
  return { source: "none", catalogVersion: null, count: 0, loadedAt: null, skipped: 0, directory: null };
}

/** The state a plugin shows given what is known about its installed servers. */
export function pluginState(input: {
  installed: boolean;
  serverStatuses: readonly ("checking" | "available" | "needs-login" | "error")[];
  installedVersion: string | null;
  catalogVersion: string | null;
}): PluginState {
  if (!input.installed) return "available";
  if (input.serverStatuses.includes("error")) return "error";
  if (input.serverStatuses.includes("needs-login")) return "needs-sign-in";
  if (
    input.catalogVersion !== null &&
    input.installedVersion !== null &&
    compareVersions(input.catalogVersion, input.installedVersion) > 0
  ) {
    return "update-available";
  }
  return "installed";
}

/** Dotted numeric versions ("1.0.1" > "1.0.0"); a part that is not a number counts as 0. */
export function compareVersions(left: string, right: string): number {
  const a = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

// --- guards and parsers ---

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

export function isPluginSummary(value: unknown): value is PluginSummary {
  return (
    isDynamicRecord(value) &&
    isString(value.slug) &&
    value.slug.length > 0 &&
    isString(value.name) &&
    isString(value.tagline) &&
    isOneOf(PLUGIN_CATEGORIES, value.category) &&
    isNullableString(value.creatorName) &&
    isNullableString(value.iconUrl) &&
    isString(value.version) &&
    isBoolean(value.featured) &&
    isBoolean(value.custom) &&
    isOneOf(PLUGIN_STATES, value.state) &&
    isNullableString(value.installedVersion) &&
    isNullableString(value.error) &&
    isNumber(value.agentCount) &&
    isBoolean(value.unavailableHere) &&
    (value.state === "available" ? value.installedVersion === null : value.installedVersion !== null)
  );
}

export function isPluginCatalogInfo(value: unknown): value is PluginCatalogInfo {
  return (
    isDynamicRecord(value) &&
    isOneOf(PLUGIN_CATALOG_SOURCES, value.source) &&
    isNullableString(value.catalogVersion) &&
    isNumber(value.count) &&
    isNullableString(value.loadedAt) &&
    isNumber(value.skipped) &&
    isNullableString(value.directory) &&
    (value.source === "none" ? value.count === 0 : true)
  );
}

export function isPluginList(value: unknown): value is PluginList {
  return (
    isDynamicRecord(value) &&
    isPluginCatalogInfo(value.info) &&
    Array.isArray(value.plugins) &&
    value.plugins.every(isPluginSummary) &&
    isNumber(value.total) &&
    value.total >= value.plugins.length
  );
}

function isAuthField(value: unknown): boolean {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.label) &&
    isNullableString(value.hint) &&
    isNullableString(value.placeholder) &&
    isDynamicRecord(value.target) &&
    (value.target.kind === "env" || value.target.kind === "header") &&
    isString(value.target.name)
  );
}

function isPluginApp(value: unknown): value is PluginApp {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.description) &&
    isNullableString(value.iconUrl) &&
    (value.transport === "stdio" || value.transport === "http") &&
    isNullableString(value.url) &&
    isNullableString(value.command) &&
    Array.isArray(value.args) &&
    value.args.every(isString) &&
    isBoolean(value.macOnly) &&
    Array.isArray(value.auth) &&
    value.auth.every(
      (auth) =>
        isDynamicRecord(auth) &&
        isString(auth.id) &&
        isOneOf(PLUGIN_AUTH_KINDS, auth.kind) &&
        isString(auth.label) &&
        Array.isArray(auth.fields) &&
        auth.fields.every(isAuthField) &&
        isNullableString(auth.docsUrl) &&
        isNullableString(auth.docsLabel) &&
        Array.isArray(auth.steps) &&
        auth.steps.every(isString) &&
        isNullableString(auth.note),
    )
  );
}

export function isPluginDetails(value: unknown): value is PluginDetails {
  return (
    isDynamicRecord(value) &&
    isPluginSummary(value.summary) &&
    isString(value.description) &&
    Array.isArray(value.prompts) &&
    value.prompts.every((prompt) => isDynamicRecord(prompt) && isString(prompt.id) && isString(prompt.text)) &&
    Array.isArray(value.apps) &&
    value.apps.every(isPluginApp) &&
    isNullableString(value.websiteUrl) &&
    isNullableString(value.privacyPolicyUrl) &&
    isNullableString(value.termsUrl)
  );
}

export function isPluginCatalogChanged(
  value: unknown,
): value is PluginCatalogChanged & { type: "plugin-catalog-changed" } {
  return (
    isDynamicRecord(value) &&
    value.type === "plugin-catalog-changed" &&
    isPluginCatalogInfo(value.info) &&
    Array.isArray(value.installed) &&
    value.installed.every(isPluginSummary)
  );
}

function parseSlug(value: unknown): string {
  if (!isString(value) || !(isPluginSlug(value) || /^custom-[a-z][a-z0-9_]{0,39}$/.test(value))) {
    throw new Error("Choose a plugin from the list.");
  }
  return value;
}

export function parsePluginSlugInput(input: unknown): PluginSlugInput {
  if (!isDynamicRecord(input)) throw new Error("The plugin request is malformed.");
  return { slug: parseSlug(input.slug) };
}

export function parseListPluginsInput(input: unknown): ListPluginsInput {
  if (input === undefined || input === null) return {};
  if (!isDynamicRecord(input)) throw new Error("The plugin request is malformed.");
  const parsed: ListPluginsInput = {};
  if (input.query !== undefined) {
    if (!isString(input.query) || input.query.length > PLUGIN_LIMITS.query) throw new Error("That search is too long.");
    if (input.query.trim()) parsed.query = input.query.trim();
  }
  if (input.category !== undefined) {
    if (!isOneOf(PLUGIN_CATEGORIES, input.category))
      throw new Error(`The category is one of: ${PLUGIN_CATEGORIES.join(", ")}.`);
    parsed.category = input.category;
  }
  if (input.filter !== undefined) {
    if (input.filter !== "installed" && input.filter !== "featured" && input.filter !== "needs-attention") {
      throw new Error("The filter is one of: installed, featured, needs-attention.");
    }
    parsed.filter = input.filter;
  }
  if (input.offset !== undefined) {
    if (!isNumber(input.offset) || !Number.isInteger(input.offset) || input.offset < 0)
      throw new Error("The offset is a whole number.");
    parsed.offset = input.offset;
  }
  return parsed;
}

function parseSecrets(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isDynamicRecord(value)) throw new Error("The values are malformed.");
  const entries = Object.entries(value);
  if (entries.length > PLUGIN_LIMITS.secrets) throw new Error("Too many values.");
  const secrets: Record<string, string> = {};
  for (const [name, secret] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(name)) throw new Error("A value has a name that is not allowed.");
    if (!isString(secret) || secret.length === 0 || secret.length > PLUGIN_LIMITS.secretValue) {
      throw new Error("A value is empty or too long.");
    }
    secrets[name] = secret;
  }
  return secrets;
}

/** The values are checked for shape only; an error never repeats what was typed. */
export function parseInstallPluginInput(input: unknown): InstallPluginInput {
  if (!isDynamicRecord(input)) throw new Error("The plugin request is malformed.");
  const parsed: InstallPluginInput = { slug: parseSlug(input.slug) };
  if (input.appId !== undefined) {
    if (!isString(input.appId) || input.appId.length === 0 || input.appId.length > 200)
      throw new Error("Choose an app of the plugin.");
    parsed.appId = input.appId;
  }
  const secrets = parseSecrets(input.secrets);
  if (secrets) parsed.secrets = secrets;
  return parsed;
}

export function parseAddCustomPluginInput(input: unknown): AddCustomPluginInput {
  if (!isDynamicRecord(input)) throw new Error("The plugin request is malformed.");
  if (!isString(input.name) || !/^[a-z][a-z0-9_]{0,39}$/.test(input.name)) {
    throw new Error(
      "A plugin name starts with a lowercase letter and has lowercase letters, digits and underscores (at most 40).",
    );
  }
  if (input.transport !== "stdio" && input.transport !== "http") throw new Error("The transport is stdio or http.");
  const parsed: AddCustomPluginInput = { name: input.name, transport: input.transport };
  if (input.transport === "http") {
    if (!isString(input.url)) throw new Error("An http plugin needs an address.");
    let url: URL;
    try {
      url = new URL(input.url.trim());
    } catch {
      throw new Error("That address is not valid.");
    }
    const local = url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
    if ((url.protocol !== "https:" && !local) || url.username || url.password) {
      throw new Error(
        "An address starts with https:// (http:// only for this computer) and has no user name or password.",
      );
    }
    parsed.url = url.toString();
  } else {
    if (!isString(input.command) || input.command.trim().length === 0 || input.command.length > 1_000) {
      throw new Error("A stdio plugin needs the program to start.");
    }
    parsed.command = input.command.trim();
    if (input.args !== undefined) {
      if (
        !Array.isArray(input.args) ||
        input.args.length > 64 ||
        !input.args.every((arg) => isString(arg) && arg.length <= 2_000)
      ) {
        throw new Error("The arguments are a short list of texts.");
      }
      parsed.args = [...input.args];
    }
  }
  const secrets = parseSecrets(input.secrets);
  if (secrets) parsed.secrets = secrets;
  return parsed;
}

export function parseSetPluginCatalogFolderInput(input: unknown): SetPluginCatalogFolderInput {
  if (!isDynamicRecord(input)) throw new Error("The folder request is malformed.");
  if (input.directory === null) return { directory: null };
  if (!isString(input.directory) || input.directory.length === 0 || input.directory.length > 1_000) {
    throw new Error("Choose a folder.");
  }
  if (!/^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(input.directory)) throw new Error("A folder is given with its full path.");
  return { directory: input.directory };
}
