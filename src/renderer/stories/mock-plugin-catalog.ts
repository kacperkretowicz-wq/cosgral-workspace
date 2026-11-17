// COSGRAL W11-KK (e): the Marketplace Apps tab for Storybook and the preview. DEMO data only (invented plugins, example addresses);
// nothing is downloaded and no server starts. The same rules as the program: nothing installs without `install`, values of `key` fields
// are write-only (never in any answer), a `link` plugin waits for a sign-in, a `local` one only needs the right system, own plugins
// join the same list, and removing a plugin removes its values. `simulate` plays a sign-in finishing, a server failing, a new version.

import {
  type AddCustomPluginInput,
  type AgentEvent,
  compareVersions,
  customPluginSlug,
  emptyPluginCatalogInfo,
  type InstallPluginInput,
  type ListPluginsInput,
  PLUGIN_LIMITS,
  type PluginApp,
  type PluginCatalogDesktopApi,
  type PluginCatalogInfo,
  type PluginDetails,
  type PluginList,
  type PluginState,
  type PluginSummary,
  parseAddCustomPluginInput,
  parseInstallPluginInput,
  parseListPluginsInput,
  parsePluginSlugInput,
  parseSetPluginCatalogFolderInput,
  pluginMatches,
  pluginSearchWords,
} from "@openbot/contracts/ipc";

interface DemoEntry {
  summary: Omit<PluginSummary, "state" | "installedVersion" | "error" | "agentCount" | "serverIds">;
  description: string;
  apps: PluginApp[];
}

const KEY_FIELD = {
  id: "token",
  label: "API key",
  hint: "Account page, API section",
  placeholder: null,
  target: { kind: "env", name: "DEMO_API_KEY" },
} as const;

function app(id: string, name: string, kind: "link" | "key" | "local", extra: Partial<PluginApp> = {}): PluginApp {
  return {
    id,
    name,
    description: `Demo app ${name}.`,
    iconUrl: null,
    transport: kind === "key" ? "stdio" : "http",
    url: kind === "key" ? null : `https://mcp.${id}.example.test/mcp`,
    command: kind === "key" ? "npx" : null,
    args: kind === "key" ? ["-y", `${id}-mcp-server`] : [],
    macOnly: false,
    auth: [
      {
        id: `${id}-auth`,
        kind,
        label: kind === "key" ? "API key" : kind === "link" ? "Sign in" : "No sign-in",
        fields: kind === "key" ? [KEY_FIELD] : [],
        docsUrl: kind === "key" ? "https://docs.example.test/keys" : null,
        docsLabel: kind === "key" ? "Get a key" : null,
        steps: [],
        note: null,
      },
    ],
    ...extra,
  };
}

function entry(
  slug: string,
  name: string,
  category: PluginSummary["category"],
  kind: "link" | "key" | "local",
  options: { featured?: boolean; version?: string; macOnly?: boolean } = {},
): DemoEntry {
  return {
    summary: {
      slug,
      name,
      tagline: `Demo ${name.toLowerCase()} for agents`,
      category,
      creatorName: "Example Maker",
      iconUrl: null,
      version: options.version ?? "1.0.0",
      featured: options.featured ?? false,
      custom: false,
      unavailableHere: options.macOnly ?? false,
    },
    description: `${name} is a demo plugin of the preview. It shows how a plugin with a ${kind} connection looks.`,
    apps: [app(slug, name, kind, { macOnly: options.macOnly ?? false })],
  };
}

const DEMO_CATALOG: DemoEntry[] = [
  entry("demo-docs", "Demo Docs", "documents", "link", { featured: true }),
  entry("demo-board", "Demo Board", "productivity", "link", { featured: true }),
  entry("demo-data", "Demo Data", "data-analytics", "key"),
  entry("demo-code", "Demo Code", "coding", "local"),
  entry("demo-design", "Demo Design", "design", "link"),
  entry("demo-research", "Demo Research", "research", "key", { version: "1.0.1" }),
  entry("demo-flow", "Demo Flow", "automation", "local", { featured: true }),
  entry("demo-mail", "Demo Mail", "productivity", "local", { macOnly: true }),
];

interface Installed {
  version: string;
  state: PluginState;
  error: string | null;
  custom: boolean;
  /** Names only: the values themselves are never kept in the mock's answers. */
  secretNames: string[];
}

export interface MockPluginCatalog extends Required<PluginCatalogDesktopApi> {
  simulate: {
    /** The sign-in of a `link` plugin finished in the browser. */
    signedIn: (slug: string) => void;
    /** The plugin's server stopped answering. */
    serverFailed: (slug: string) => void;
    /** The person closes the folder dialog of the next `chooseCatalogFolder`. */
    closeNextFolderDialog: () => void;
    /** The catalog holds a newer version of this plugin. */
    newVersion: (slug: string, version: string) => void;
  };
}

export function createMockPluginCatalog(emit: (event: AgentEvent) => void): MockPluginCatalog {
  let clock = Date.parse("2026-11-17T08:00:00.000Z");
  const now = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };
  const catalog = new Map<string, DemoEntry>(DEMO_CATALOG.map((item) => [item.summary.slug, structuredClone(item)]));
  const installed = new Map<string, Installed>();
  const customs = new Map<string, AddCustomPluginInput>();
  let folder: string | null = null;
  let nextFolderDialog: "chosen" | "closed" = "chosen";
  let info: PluginCatalogInfo = {
    source: "demo",
    catalogVersion: "demo-1",
    count: catalog.size,
    loadedAt: now(),
    skipped: 0,
    directory: null,
  };

  const summaryOf = (slug: string): PluginSummary => {
    const custom = customs.get(slug.replace(/^custom-/, ""));
    const have = installed.get(slug);
    if (custom && have) {
      return {
        slug,
        name: custom.name,
        tagline: "Added by hand",
        category: "other",
        creatorName: null,
        iconUrl: null,
        version: "custom",
        featured: false,
        custom: true,
        state: have.state,
        installedVersion: "custom",
        error: have.error,
        agentCount: 1,
        serverIds: [`srv-${slug}`],
        unavailableHere: false,
      };
    }
    const item = catalog.get(slug);
    if (!item) throw new Error("That plugin is not in the catalog.");
    const state: PluginState =
      have === undefined
        ? "available"
        : have.state === "installed" && compareVersions(item.summary.version, have.version) > 0
          ? "update-available"
          : have.state;
    return {
      ...item.summary,
      state,
      installedVersion: have?.version ?? null,
      error: have?.error ?? null,
      agentCount: have ? 1 : 0,
      serverIds: have ? [`srv-${slug}`] : [],
    };
  };
  const installedSummaries = () => [...installed.keys()].map(summaryOf);
  const changed = () =>
    emit({ type: "plugin-catalog-changed", info: structuredClone(info), installed: installedSummaries() });
  const requireInstalled = (slug: string): Installed => {
    const value = installed.get(slug);
    if (!value) throw new Error("That plugin is not installed.");
    return value;
  };

  const api: Required<PluginCatalogDesktopApi> = {
    info: async () => structuredClone(info),
    list: async (input?: ListPluginsInput): Promise<PluginList> => {
      const request = parseListPluginsInput(input);
      const words = pluginSearchWords(request.query ?? "");
      const all = [...catalog.keys(), ...[...customs.keys()].map(customPluginSlug)]
        .filter((slug) => catalog.has(slug) || installed.has(slug))
        .map(summaryOf)
        .filter((plugin) => pluginMatches(plugin, words))
        .filter((plugin) => !request.category || plugin.category === request.category)
        .filter((plugin) => {
          if (request.filter === "installed") return plugin.state !== "available";
          if (request.filter === "featured") return plugin.featured;
          if (request.filter === "needs-attention")
            return plugin.state === "needs-sign-in" || plugin.state === "error" || plugin.state === "update-available";
          return true;
        })
        .sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name));
      const offset = request.offset ?? 0;
      return {
        info: structuredClone(info),
        plugins: all.slice(offset, offset + PLUGIN_LIMITS.page),
        total: all.length,
      };
    },
    get: async (input): Promise<PluginDetails> => {
      const { slug } = parsePluginSlugInput(input);
      const item = catalog.get(slug);
      if (!item) {
        if (!installed.has(slug)) throw new Error("That plugin is not in the catalog.");
        return {
          summary: summaryOf(slug),
          description: "A plugin added by hand.",
          prompts: [],
          apps: [],
          websiteUrl: null,
          privacyPolicyUrl: null,
          termsUrl: null,
        };
      }
      return {
        summary: summaryOf(slug),
        description: item.description,
        prompts: [{ id: `${slug}-prompt`, text: `What can ${item.summary.name} do for me?` }],
        apps: structuredClone(item.apps),
        websiteUrl: "https://example.test",
        privacyPolicyUrl: "https://example.test/privacy",
        termsUrl: "https://example.test/terms",
      };
    },
    install: async (input: InstallPluginInput) => {
      const request = parseInstallPluginInput(input);
      const item = catalog.get(request.slug);
      if (!item) throw new Error("That plugin is not in the catalog.");
      if (item.summary.unavailableHere) throw new Error("This plugin needs macOS and cannot run on this computer.");
      const kinds = item.apps.flatMap((entryApp) => entryApp.auth.map((auth) => auth.kind));
      const secretNames = Object.keys(request.secrets ?? {});
      if (kinds.includes("key") && secretNames.length === 0) throw new Error("This plugin needs its key first.");
      installed.set(request.slug, {
        version: item.summary.version,
        state: kinds.includes("link") ? "needs-sign-in" : "installed",
        error: kinds.includes("link") ? "Sign in on the service's page to finish." : null,
        custom: false,
        secretNames,
      });
      changed();
      return summaryOf(request.slug);
    },
    uninstall: async (input) => {
      const { slug } = parsePluginSlugInput(input);
      requireInstalled(slug);
      installed.delete(slug);
      customs.delete(slug.replace(/^custom-/, ""));
      changed();
      return api.list();
    },
    update: async (input) => {
      const { slug } = parsePluginSlugInput(input);
      const current = requireInstalled(slug);
      const item = catalog.get(slug);
      if (!item) throw new Error("This plugin has no catalog version to update to.");
      current.version = item.summary.version;
      changed();
      return summaryOf(slug);
    },
    addCustom: async (input) => {
      const request = parseAddCustomPluginInput(input);
      const slug = customPluginSlug(request.name);
      if (installed.has(slug) || catalog.has(slug)) throw new Error("A plugin with this name already exists.");
      customs.set(request.name, request);
      installed.set(slug, {
        version: "custom",
        state: "installed",
        error: null,
        custom: true,
        secretNames: Object.keys(request.secrets ?? {}),
      });
      changed();
      return summaryOf(slug);
    },
    chooseCatalogFolder: async () => {
      if (nextFolderDialog === "closed") {
        nextFolderDialog = "chosen";
        return null;
      }
      return api.setCatalogFolder({ directory: "C:\\catalog-demo" });
    },
    setCatalogFolder: async (input) => {
      const request = parseSetPluginCatalogFolderInput(input);
      folder = request.directory;
      info =
        folder === null
          ? {
              ...emptyPluginCatalogInfo(),
              source: "demo",
              catalogVersion: "demo-1",
              count: catalog.size,
              loadedAt: now(),
            }
          : {
              source: "folder",
              catalogVersion: "demo-folder",
              count: catalog.size,
              loadedAt: now(),
              skipped: 0,
              directory: folder,
            };
      changed();
      return structuredClone(info);
    },
  };

  return {
    ...api,
    simulate: {
      /** The person closes the folder dialog of the next `chooseCatalogFolder`. */
      closeNextFolderDialog: () => {
        nextFolderDialog = "closed";
      },
      signedIn: (slug) => {
        const current = installed.get(slug);
        if (current?.state !== "needs-sign-in") return;
        current.state = "installed";
        current.error = null;
        changed();
      },
      serverFailed: (slug) => {
        const current = installed.get(slug);
        if (!current) return;
        current.state = "error";
        current.error = "The plugin's server does not answer. Try again.";
        changed();
      },
      newVersion: (slug, version) => {
        const item = catalog.get(slug);
        if (!item) return;
        item.summary.version = version;
        changed();
      },
    },
  };
}
