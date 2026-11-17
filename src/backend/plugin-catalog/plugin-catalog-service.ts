// COSGRAL W11-KK (e): the engine of the Marketplace Apps tab. It holds the catalog (loaded from the folder the owner chose), and turns
// "install" into MCP servers of the program (the W2 MCP engine does the connecting, the encryption of values and the per-agent
// switch). It keeps ONE small table of what it installed (slug, version, the MCP server ids) so that a plugin can be updated and
// removed cleanly. Values the person types for a `key` plugin go straight to the MCP store (encrypted) and are never kept, returned,
// logged or put in an error here. Nothing installs by itself.

import {
  type AddCustomPluginInput,
  type AddMcpServerInput,
  type AgentEvent,
  customPluginSlug,
  emptyPluginCatalogInfo,
  type InstallPluginInput,
  type ListPluginsInput,
  type McpServer,
  PLUGIN_LIMITS,
  type PluginApp,
  type PluginCatalogInfo,
  type PluginDetails,
  type PluginList,
  type PluginSummary,
  pluginMatches,
  pluginSearchWords,
  pluginState,
  type UpdateMcpServerInput,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import type { OpenBotDatabase } from "../openbot-database";
import { type CatalogEntry, CatalogFolderError, loadCatalogFolder, type ReadText } from "./catalog-loader";

/** What the service needs of the MCP engine (the real `McpManager` fits; tests use a fake). */
export interface McpPort {
  list(): McpServer[];
  add(input: AddMcpServerInput): Promise<McpServer>;
  update(input: UpdateMcpServerInput): Promise<McpServer>;
  remove(input: { serverId: string }): Promise<void>;
  listAgentSettings(botId: string): Array<{ serverId: string; enabled: boolean }>;
}

export interface PluginCatalogServiceOptions {
  database: OpenBotDatabase;
  mcp: McpPort;
  emit: (event: AgentEvent) => void;
  /** The ids of the agents, to count who may use a plugin. */
  botIds?: () => string[];
  platform?: NodeJS.Platform;
  now?: () => Date;
  /** For tests: how files are read. */
  read?: ReadText;
}

interface InstalledRow {
  slug: string;
  version: string;
  serverIds: string[];
  custom: boolean;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projection_plugins (
    slug TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    server_ids_json TEXT NOT NULL,
    custom INTEGER NOT NULL DEFAULT 0,
    installed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_plugin_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

const CATALOG_FOLDER_KEY = "catalog_folder";

/** An MCP server name from a plugin slug and the app's position: lowercase letter first, then letters, digits, underscores. */
export function serverNameFor(slug: string, appIndex: number, taken: ReadonlySet<string>): string {
  const base = `p_${slug.replace(/[^a-z0-9]+/g, "_")}`.slice(0, 34).replace(/_+$/g, "");
  let name = appIndex === 0 ? base : `${base}_${appIndex + 1}`;
  for (let suffix = 2; taken.has(name); suffix += 1) name = `${base}_${suffix}`.slice(0, 40);
  return name;
}

/** The values of the `key` fields turned into what the MCP server gets: environment values (stdio) or headers (http). */
export function secretsFor(
  app: PluginApp,
  given: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const fields = app.auth.filter((auth) => auth.kind === "key").flatMap((auth) => auth.fields);
  const secrets: Record<string, string> = {};
  for (const field of fields) {
    const value = given?.[field.id];
    if (value === undefined || value.length === 0) throw new Error("This plugin needs its key first.");
    secrets[field.target.name] =
      field.target.kind === "header" && field.target.prefix ? `${field.target.prefix}${value}` : value;
  }
  return secrets;
}

export class PluginCatalogService {
  readonly #options: PluginCatalogServiceOptions;
  readonly #platform: NodeJS.Platform;
  #ready = false;
  #info: PluginCatalogInfo = emptyPluginCatalogInfo();
  #entries = new Map<string, CatalogEntry>();
  /** Serializes installs, updates and removals, so two quick clicks never add a server twice. */
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: PluginCatalogServiceOptions) {
    this.#options = options;
    this.#platform = options.platform ?? process.platform;
  }

  /** Loads the folder saved before, if any. A folder that is gone leaves the catalog empty (the tab says so). */
  async load(): Promise<PluginCatalogInfo> {
    const directory = this.#setting(CATALOG_FOLDER_KEY);
    if (directory) await this.#loadFolder(directory).catch(() => undefined);
    return this.info();
  }

  info(): PluginCatalogInfo {
    return structuredClone(this.#info);
  }

  async setCatalogFolder(directory: string | null): Promise<PluginCatalogInfo> {
    if (directory === null) {
      this.#db().prepare("DELETE FROM projection_plugin_settings WHERE key = ?").run(CATALOG_FOLDER_KEY);
      this.#entries = new Map();
      this.#info = emptyPluginCatalogInfo();
    } else {
      // The folder is saved only when it holds a valid catalog; a wrong folder leaves the current catalog untouched.
      await this.#loadFolder(directory);
      this.#db()
        .prepare(
          "INSERT INTO projection_plugin_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run(CATALOG_FOLDER_KEY, directory);
    }
    this.publish();
    return this.info();
  }

  list(input: ListPluginsInput = {}): PluginList {
    const words = pluginSearchWords(input.query ?? "");
    const rows = this.#rows();
    const all = [...this.#entries.keys(), ...rows.filter((row) => row.custom).map((row) => row.slug)]
      .map((slug) => this.#summary(slug, rows))
      .filter((plugin) => pluginMatches(plugin, words))
      .filter((plugin) => !input.category || plugin.category === input.category)
      .filter((plugin) => {
        if (input.filter === "installed") return plugin.state !== "available";
        if (input.filter === "featured") return plugin.featured;
        if (input.filter === "needs-attention") {
          return plugin.state === "needs-sign-in" || plugin.state === "error" || plugin.state === "update-available";
        }
        return true;
      })
      .sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name));
    const offset = input.offset ?? 0;
    return { info: this.info(), plugins: all.slice(offset, offset + PLUGIN_LIMITS.page), total: all.length };
  }

  get(slug: string): PluginDetails {
    const rows = this.#rows();
    const entry = this.#entries.get(slug);
    if (!entry) {
      const row = rows.find((candidate) => candidate.slug === slug && candidate.custom);
      if (!row) throw new Error("That plugin is not in the catalog.");
      return {
        summary: this.#summary(slug, rows),
        description: "A plugin added by hand.",
        prompts: [],
        apps: [],
        websiteUrl: null,
        privacyPolicyUrl: null,
        termsUrl: null,
      };
    }
    return {
      summary: this.#summary(slug, rows),
      description: entry.description,
      prompts: entry.prompts,
      apps: entry.apps,
      websiteUrl: entry.websiteUrl,
      privacyPolicyUrl: entry.privacyPolicyUrl,
      termsUrl: entry.termsUrl,
    };
  }

  install(input: InstallPluginInput): Promise<PluginSummary> {
    return this.#serial(async () => {
      const entry = this.#entries.get(input.slug);
      if (!entry) throw new Error("That plugin is not in the catalog.");
      if (this.#rows().some((row) => row.slug === input.slug)) throw new Error("That plugin is already installed.");
      const apps = input.appId ? entry.apps.filter((app) => app.id === input.appId) : entry.apps;
      if (apps.length === 0) throw new Error("That app is not part of this plugin.");
      if (apps.some((app) => app.macOnly) && this.#platform !== "darwin") {
        throw new Error("This plugin needs macOS and cannot run on this computer.");
      }
      // Everything is checked BEFORE the first server is added, so a missing key leaves nothing half installed.
      const secretsPerApp = apps.map((app) => secretsFor(app, input.secrets));
      const taken = new Set(this.#options.mcp.list().map((server) => server.name));
      const serverIds: string[] = [];
      try {
        for (const [index, app] of apps.entries()) {
          const name = serverNameFor(entry.slug, index, taken);
          taken.add(name);
          const secrets = secretsPerApp[index];
          const server = await this.#options.mcp.add(
            app.transport === "http"
              ? {
                  name,
                  transport: "http",
                  url: app.url ?? "",
                  ...(secrets && Object.keys(secrets).length > 0 ? { secrets } : {}),
                }
              : {
                  name,
                  transport: "stdio",
                  command: app.command ?? "",
                  args: app.args,
                  ...(secrets && Object.keys(secrets).length > 0 ? { secrets } : {}),
                },
          );
          serverIds.push(server.id);
        }
      } catch (error) {
        await Promise.all(serverIds.map((serverId) => this.#options.mcp.remove({ serverId }).catch(() => undefined)));
        // The engine's own sentence, unless it holds one of the values the person typed.
        const typed = Object.values(input.secrets ?? {});
        const message = error instanceof Error ? error.message : "";
        throw new Error(
          message && !typed.some((value) => message.includes(value)) ? message : "The plugin could not be installed.",
        );
      }
      this.#save({ slug: entry.slug, version: entry.version, serverIds, custom: false });
      this.publish();
      return this.#summary(entry.slug, this.#rows());
    });
  }

  uninstall(slug: string): Promise<PluginList> {
    return this.#serial(async () => {
      const row = this.#rows().find((candidate) => candidate.slug === slug);
      if (!row) throw new Error("That plugin is not installed.");
      await Promise.all(row.serverIds.map((serverId) => this.#options.mcp.remove({ serverId }).catch(() => undefined)));
      this.#db().prepare("DELETE FROM projection_plugins WHERE slug = ?").run(slug);
      this.publish();
      return this.list();
    });
  }

  /** Moves an installed plugin to the newest catalog version: the servers get the new address or command, the saved values stay. */
  update(slug: string): Promise<PluginSummary> {
    return this.#serial(async () => {
      const row = this.#rows().find((candidate) => candidate.slug === slug);
      if (!row) throw new Error("That plugin is not installed.");
      const entry = this.#entries.get(slug);
      if (!entry || row.custom) throw new Error("This plugin has no catalog version to update to.");
      const servers = this.#options.mcp.list();
      for (const [index, serverId] of row.serverIds.entries()) {
        const app = entry.apps[index];
        if (!app || !servers.some((server) => server.id === serverId)) continue;
        await this.#options.mcp.update(
          app.transport === "http"
            ? { serverId, url: app.url ?? "" }
            : { serverId, command: app.command ?? "", args: app.args },
        );
      }
      this.#save({ ...row, version: entry.version });
      this.publish();
      return this.#summary(slug, this.#rows());
    });
  }

  addCustom(input: AddCustomPluginInput): Promise<PluginSummary> {
    return this.#serial(async () => {
      const slug = customPluginSlug(input.name);
      if (this.#rows().some((row) => row.slug === slug) || this.#entries.has(slug)) {
        throw new Error("A plugin with this name already exists.");
      }
      const server = await this.#options.mcp.add(
        input.transport === "http"
          ? {
              name: input.name,
              transport: "http",
              url: input.url ?? "",
              ...(input.secrets ? { secrets: input.secrets } : {}),
            }
          : {
              name: input.name,
              transport: "stdio",
              command: input.command ?? "",
              args: input.args ?? [],
              ...(input.secrets ? { secrets: input.secrets } : {}),
            },
      );
      this.#save({ slug, version: "custom", serverIds: [server.id], custom: true });
      this.publish();
      return this.#summary(slug, this.#rows());
    });
  }

  /** Tells the window the whole picture (call it when the MCP servers change state too). */
  publish(): void {
    const rows = this.#rows();
    this.#options.emit({
      type: "plugin-catalog-changed",
      info: this.info(),
      installed: rows.map((row) => this.#summary(row.slug, rows)),
    });
  }

  // --- internals ---

  #serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(work, work);
    this.#queue = next.catch(() => undefined);
    return next;
  }

  async #loadFolder(directory: string): Promise<void> {
    const loaded = await loadCatalogFolder(directory, this.#options.read);
    this.#entries = new Map(loaded.entries.map((entry) => [entry.slug, entry]));
    this.#info = {
      source: "folder",
      catalogVersion: loaded.catalogVersion,
      count: loaded.entries.length,
      loadedAt: (this.#options.now?.() ?? new Date()).toISOString(),
      skipped: loaded.skipped,
      directory,
    };
  }

  #summary(slug: string, rows: readonly InstalledRow[]): PluginSummary {
    const row = rows.find((candidate) => candidate.slug === slug) ?? null;
    const entry = this.#entries.get(slug) ?? null;
    const servers = row ? this.#options.mcp.list().filter((server) => row.serverIds.includes(server.id)) : [];
    const removed = row !== null && servers.length < row.serverIds.length;
    const state = pluginState({
      installed: row !== null,
      serverStatuses: servers.map((server) => server.status),
      installedVersion: row?.version ?? null,
      catalogVersion: entry?.version ?? null,
    });
    const failing = servers.find((server) => server.status === "error" || server.status === "needs-login");
    // A fixed sentence: the MCP engine's text may name a server or a path.
    let error: string | null = null;
    if (removed) error = "A server of this plugin was removed. Remove the plugin and install it again.";
    else if (failing) {
      error =
        failing.status === "needs-login"
          ? "Sign in on the service's page to finish."
          : "The plugin's server does not answer. Try again.";
    }
    const base = entry
      ? {
          slug,
          name: entry.name,
          tagline: entry.tagline,
          category: entry.category,
          creatorName: entry.creatorName,
          iconUrl: entry.iconUrl,
          version: entry.version,
          featured: entry.featured,
          custom: false,
          unavailableHere: entry.apps.some((app) => app.macOnly) && this.#platform !== "darwin",
        }
      : {
          slug,
          name: servers[0]?.name ?? slug.replace(/^custom-/, ""),
          tagline: "Added by hand",
          category: "other" as const,
          creatorName: null,
          iconUrl: null,
          version: "custom",
          featured: false,
          custom: true,
          unavailableHere: false,
        };
    return {
      ...base,
      state: removed ? "error" : state,
      installedVersion: row?.version ?? null,
      error,
      agentCount: this.#agentCount(servers),
    };
  }

  #agentCount(servers: readonly McpServer[]): number {
    const ids = new Set(servers.map((server) => server.id));
    if (ids.size === 0) return 0;
    const bots = this.#options.botIds?.() ?? [];
    // An agent may use a server unless the person switched it off; settings list the ones switched off or on explicitly.
    return bots.filter((botId) => {
      const settings = this.#options.mcp.listAgentSettings(botId).filter((setting) => ids.has(setting.serverId));
      return settings.length === 0 || settings.some((setting) => setting.enabled);
    }).length;
  }

  #db() {
    const connection = this.#options.database.connection;
    if (!this.#ready) {
      connection.exec(SCHEMA);
      this.#ready = true;
    }
    return connection;
  }

  #rows(): InstalledRow[] {
    return this.#db()
      .prepare("SELECT slug, version, server_ids_json, custom FROM projection_plugins ORDER BY installed_at, slug")
      .all()
      .flatMap((raw) => {
        if (!isDynamicRecord(raw) || !isString(raw.slug) || !isString(raw.version) || !isString(raw.server_ids_json))
          return [];
        try {
          const ids = JSON.parse(raw.server_ids_json);
          if (!Array.isArray(ids) || !ids.every(isString)) return [];
          return [{ slug: raw.slug, version: raw.version, serverIds: ids, custom: raw.custom === 1 }];
        } catch {
          return [];
        }
      });
  }

  #save(row: InstalledRow): void {
    this.#db()
      .prepare(
        `INSERT INTO projection_plugins (slug, version, server_ids_json, custom, installed_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET version = excluded.version, server_ids_json = excluded.server_ids_json`,
      )
      .run(
        row.slug,
        row.version,
        JSON.stringify(row.serverIds),
        row.custom ? 1 : 0,
        (this.#options.now?.() ?? new Date()).toISOString(),
      );
  }

  #setting(key: string): string | null {
    const raw = this.#db().prepare("SELECT value FROM projection_plugin_settings WHERE key = ?").get(key);
    return isDynamicRecord(raw) && isString(raw.value) ? raw.value : null;
  }
}

export { CatalogFolderError };
