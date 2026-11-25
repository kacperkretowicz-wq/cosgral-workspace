import type { AgentEvent, PluginCategory, PluginDetails, PluginList, PluginSummary } from "@openbot/contracts/ipc";
import { PLUGIN_CATEGORIES, PLUGIN_CATEGORY_LABELS } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { Button, Input, NativeSelect } from "./ui";
import { Blocks, FileText, Palette, Plus, Search, Table2, Terminal, Workflow, Zap } from "./ui/icons";
import "../styles/plugin-apps.css";

interface CustomForm {
  name: string;
  transport: "http" | "stdio";
  target: string;
}

type Filter = "" | "installed" | "featured" | "needs-attention";

const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: "", label: "All" },
  { id: "installed", label: "Installed" },
  { id: "featured", label: "Featured" },
  { id: "needs-attention", label: "Needs attention" },
];

const STATE_LABELS = {
  available: "Not installed",
  installed: "Installed",
  "needs-sign-in": "Needs sign-in",
  "update-available": "Update available",
  error: "Problem",
} as const;

/** How many apps to show per category before “See all”. */
const SECTION_PREVIEW = 6;

function groupByCategory(plugins: PluginSummary[]): Array<{ category: PluginCategory; items: PluginSummary[] }> {
  const buckets = new Map<PluginCategory, PluginSummary[]>();
  for (const plugin of plugins) {
    const list = buckets.get(plugin.category) ?? [];
    list.push(plugin);
    buckets.set(plugin.category, list);
  }
  return PLUGIN_CATEGORIES.filter((category) => buckets.has(category)).map((category) => ({
    category,
    items: buckets.get(category) ?? [],
  }));
}

const CATEGORY_ICONS: Record<PluginCategory, typeof Terminal> = {
  coding: Terminal,
  productivity: Zap,
  "data-analytics": Table2,
  automation: Workflow,
  research: Search,
  design: Palette,
  documents: FileText,
  other: Blocks,
};

/** One icon per category instead of the name's initials ("DB", "DF"), which said nothing about the app. */
function CategoryIcon(props: { category: PluginCategory }) {
  const Icon = CATEGORY_ICONS[untrack(() => props.category)] ?? Blocks;
  return <Icon size={18} stroke-width={1.75} />;
}

function PluginRow(props: {
  plugin: PluginSummary;
  busy: boolean;
  onOpen: (plugin: PluginSummary) => void;
  onConnect: (plugin: PluginSummary) => void;
}) {
  const canConnect = () => props.plugin.state === "available" && !props.plugin.unavailableHere;
  return (
    <li class="plugin-row" data-slug={props.plugin.slug} data-state={props.plugin.state}>
      <Button
        type="button"
        variant="ghost"
        class="plugin-row-open"
        aria-label={props.plugin.name}
        onClick={() => props.onOpen(props.plugin)}
      >
        <span class="plugin-row-icon" aria-hidden="true" data-category={props.plugin.category}>
          <CategoryIcon category={props.plugin.category} />
        </span>
        <span class="plugin-row-copy">
          <strong>{props.plugin.name}</strong>
          <small>{props.plugin.tagline}</small>
        </span>
      </Button>
      <Show
        when={canConnect()}
        fallback={
          <span class="plugin-row-state" data-state={props.plugin.state}>
            {t(STATE_LABELS[props.plugin.state])}
          </span>
        }
      >
        <Button
          type="button"
          class="plugin-row-connect"
          disabled={props.busy}
          aria-label={t("Connect {name}", { name: props.plugin.name })}
          onClick={() => props.onConnect(props.plugin)}
        >
          <Plus size={14} stroke-width={1.5} aria-hidden="true" /> {t("Connect")}
        </Button>
      </Show>
    </li>
  );
}

/**
 * The "Apps" tab of the Marketplace (window.openbot.pluginCatalog): category sections, search, Connect, and custom apps.
 * Layout follows OpenBot 0.71 screens 035–036 (own COSGRAL markup).
 */
export function PluginAppsPanel() {
  const api = untrack(() => window.openbot?.pluginCatalog);
  const [list, setList] = createSignal<PluginList | null>(null);
  const [details, setDetails] = createSignal<PluginDetails | null>(null);
  const [query, setQuery] = createSignal("");
  const [category, setCategory] = createSignal<PluginCategory | "">("");
  const [filter, setFilter] = createSignal<Filter>("");
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [secrets, setSecrets] = createSignal<Record<string, string>>({});
  const [customOpen, setCustomOpen] = createSignal(false);
  const [custom, setCustom] = createSignal<CustomForm>({ name: "", transport: "http", target: "" });
  let serial = 0;
  let typing: ReturnType<typeof setTimeout> | undefined;

  async function refresh(patch: { category?: PluginCategory | ""; filter?: Filter; query?: string } = {}) {
    if (!api) return;
    const n = ++serial;
    try {
      const chosenCategory = patch.category ?? category();
      const chosenFilter = patch.filter ?? filter();
      const chosenQuery = patch.query ?? query();
      const next = await api.list({
        query: chosenQuery,
        ...(chosenCategory ? { category: chosenCategory } : {}),
        ...(chosenFilter ? { filter: chosenFilter } : {}),
      });
      if (n !== serial) return;
      setList(next);
      setError("");
      const open = details();
      if (open) setDetails(await api.get({ slug: open.summary.slug }));
    } catch (cause) {
      if (n === serial) setError(cause instanceof Error ? cause.message : t("Could not load the catalog."));
    }
  }

  function queueSearch(value: string) {
    clearTimeout(typing);
    typing = setTimeout(() => void refresh({ query: value }), 250);
  }

  onSettled(() => {
    void refresh();
    const listen = window.openbot?.agent?.onEvent;
    if (!listen) return;
    const off = listen((event: AgentEvent) => {
      if (event.type === "plugin-catalog-changed") void refresh();
    });
    return () => {
      serial++;
      clearTimeout(typing);
      off();
    };
  });

  async function open(plugin: PluginSummary) {
    if (!api) return;
    setSecrets({});
    try {
      setDetails(await api.get({ slug: plugin.slug }));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not load the plugin."));
    }
  }

  async function run(work: () => Promise<unknown>, failure: string) {
    if (busy()) return;
    setBusy(true);
    setError("");
    try {
      await work();
      setSecrets({});
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : failure);
    } finally {
      setBusy(false);
    }
  }

  const keyFields = (value: PluginDetails) =>
    value.apps.flatMap((app) => app.auth.filter((auth) => auth.kind === "key").flatMap((auth) => auth.fields));

  const browsingHome = () => query().trim() === "" && category() === "" && filter() === "";
  const featured = () => (list()?.plugins ?? []).filter((plugin) => plugin.featured);
  const sections = () =>
    groupByCategory((list()?.plugins ?? []).filter((plugin) => !browsingHome() || !plugin.featured));

  return (
    <section class="plugin-apps" aria-label={t("Apps")}>
      <Show when={api} fallback={<p class="plugin-note">{t("Apps are not available in this version.")}</p>}>
        <header class="plugin-apps-hero">
          <h2>{t("Apps")}</h2>
          <p>{t("Connect the tools and services that your agents work with.")}</p>
        </header>

        <form
          class="plugin-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            void refresh();
          }}
        >
          <div class="plugin-search">
            <Search size={18} stroke-width={1.5} aria-hidden="true" />
            <Input
              type="search"
              aria-label={t("Search apps")}
              placeholder={t("Search")}
              value={query()}
              onInput={(event) => {
                const value = event.currentTarget.value;
                setQuery(value);
                queueSearch(value);
              }}
            />
          </div>
          <Button type="submit" class="sr-only">
            {t("Search")}
          </Button>
          <Button type="button" variant="primary" onClick={() => setCustomOpen(!customOpen())}>
            <Plus size={14} stroke-width={1.5} aria-hidden="true" /> {t("Add custom")}
          </Button>
        </form>

        <fieldset class="plugin-filter-chips">
          <legend class="sr-only">{t("Show")}</legend>
          <For each={FILTERS}>
            {(item) => (
              <Button
                type="button"
                variant="ghost"
                aria-pressed={filter() === item.id ? "true" : "false"}
                onClick={() => {
                  setFilter(item.id);
                  void refresh({ filter: item.id });
                }}
              >
                {t(item.label)}
              </Button>
            )}
          </For>
        </fieldset>

        <Show when={customOpen()}>
          <form
            class="plugin-custom"
            aria-label={t("Add a custom app")}
            onSubmit={(event) => {
              event.preventDefault();
              const form = custom();
              void run(
                () =>
                  api?.addCustom({
                    name: form.name.trim(),
                    transport: form.transport,
                    ...(form.transport === "http" ? { url: form.target.trim() } : { command: form.target.trim() }),
                  }) ?? Promise.resolve(),
                t("Could not add the app."),
              ).then(() => {
                if (!error()) {
                  setCustom({ name: "", transport: "http", target: "" });
                  setCustomOpen(false);
                }
              });
            }}
          >
            <Input
              aria-label={t("Name")}
              placeholder={t("Name")}
              value={custom().name}
              onInput={(event) => setCustom({ ...custom(), name: event.currentTarget.value })}
            />
            <NativeSelect
              aria-label={t("Connection type")}
              value={custom().transport}
              onChange={(event) =>
                setCustom({ ...custom(), transport: event.currentTarget.value === "stdio" ? "stdio" : "http" })
              }
            >
              <option value="http">{t("Web address (http)")}</option>
              <option value="stdio">{t("Local program (stdio)")}</option>
            </NativeSelect>
            <Input
              aria-label={custom().transport === "http" ? t("Address") : t("Command")}
              placeholder={custom().transport === "http" ? t("Address") : t("Command")}
              value={custom().target}
              onInput={(event) => setCustom({ ...custom(), target: event.currentTarget.value })}
            />
            <Button
              type="submit"
              variant="primary"
              disabled={busy() || !custom().name.trim() || !custom().target.trim()}
            >
              {t("Add")}
            </Button>
          </form>
        </Show>

        <Show when={error()}>
          <p class="plugin-error" role="alert">
            {error()}
            <Button type="button" variant="ghost" onClick={() => void refresh()}>
              {t("Retry")}
            </Button>
          </p>
        </Show>

        <Show when={details()}>
          {(value) => (
            <section class="plugin-detail" aria-label={t("App details")}>
              <header>
                <h2>{value().summary.name}</h2>
                <Button type="button" variant="ghost" onClick={() => setDetails(null)}>
                  {t("Close")}
                </Button>
              </header>
              <p>{value().description || value().summary.tagline}</p>
              <Show when={value().summary.unavailableHere}>
                <p class="plugin-note">{t("This app cannot run on this computer.")}</p>
              </Show>
              <Show when={value().summary.state === "needs-sign-in"}>
                <p class="plugin-note" role="status">
                  {t(value().summary.error ?? "Finish signing in on the service's page, then come back.")}
                </p>
              </Show>
              <Show when={value().summary.state === "error"}>
                <p class="plugin-error" role="alert">
                  {t(value().summary.error ?? "This app has a problem.")}
                </p>
              </Show>
              <For each={value().apps.flatMap((app) => app.auth)}>
                {(auth) => (
                  <Show when={auth.steps.length > 0}>
                    <ol class="plugin-steps" aria-label={auth.label}>
                      <For each={auth.steps}>{(step) => <li>{step}</li>}</For>
                    </ol>
                  </Show>
                )}
              </For>
              <Show when={value().summary.state === "available" && !value().summary.unavailableHere}>
                <For each={keyFields(value())}>
                  {(field) => (
                    <label class="plugin-field">
                      <span>{field.label}</span>
                      <Input
                        type="password"
                        autocomplete="off"
                        placeholder={field.placeholder ?? ""}
                        value={secrets()[field.id] ?? ""}
                        onInput={(event) => setSecrets({ ...secrets(), [field.id]: event.currentTarget.value })}
                      />
                    </label>
                  )}
                </For>
              </Show>
              <div class="plugin-actions">
                <Show when={value().summary.state === "available"}>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={busy() || value().summary.unavailableHere}
                    onClick={() =>
                      void run(
                        () => api?.install({ slug: value().summary.slug, secrets: secrets() }) ?? Promise.resolve(),
                        t("Could not install the app."),
                      )
                    }
                  >
                    {t("Install")}
                  </Button>
                </Show>
                <Show when={value().summary.state === "update-available"}>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={busy()}
                    onClick={() =>
                      void run(
                        () => api?.update({ slug: value().summary.slug }) ?? Promise.resolve(),
                        t("Could not update the app."),
                      )
                    }
                  >
                    {t("Update")}
                  </Button>
                </Show>
                <Show when={value().summary.state !== "available"}>
                  <Button
                    type="button"
                    disabled={busy()}
                    onClick={() =>
                      void run(
                        () => api?.uninstall({ slug: value().summary.slug }) ?? Promise.resolve(),
                        t("Could not uninstall the app."),
                      )
                    }
                  >
                    {t("Uninstall")}
                  </Button>
                </Show>
              </div>
            </section>
          )}
        </Show>

        <Show
          when={list()}
          fallback={
            <Show when={!error()}>
              <CosgralLoadingSkeleton label={t("Loading apps…")} />
            </Show>
          }
        >
          {(value) => (
            <>
              <Show when={value().info.source === "none"}>
                <div class="plugin-note plugin-empty">
                  <p>{t("No app catalog is loaded yet. Choose the folder with the catalog to load it.")}</p>
                  <Show when={api?.chooseCatalogFolder}>
                    <Button
                      type="button"
                      disabled={busy()}
                      onClick={() =>
                        void run(
                          () => api?.chooseCatalogFolder() ?? Promise.resolve(),
                          t("Could not load the catalog."),
                        )
                      }
                    >
                      {t("Choose the catalog folder")}
                    </Button>
                  </Show>
                </div>
              </Show>
              <Show when={value().plugins.length === 0 && value().info.source !== "none"}>
                <p class="plugin-note cosgral-empty-enter">{t("No matching apps.")}</p>
              </Show>

              <Show when={browsingHome() && featured().length > 0}>
                <section class="plugin-section" aria-label={t("Featured")}>
                  <div class="plugin-section-head">
                    <h3>
                      {t("Featured")}
                      <span class="plugin-section-count">{featured().length}</span>
                    </h3>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setFilter("featured");
                        void refresh({ filter: "featured" });
                      }}
                    >
                      {t("See all")}
                    </Button>
                  </div>
                  <ul class="plugin-rows">
                    <For each={featured().slice(0, SECTION_PREVIEW)}>
                      {(plugin) => (
                        <PluginRow
                          plugin={plugin}
                          busy={busy()}
                          onOpen={(item) => void open(item)}
                          onConnect={(item) => void open(item)}
                        />
                      )}
                    </For>
                  </ul>
                </section>
              </Show>

              <Show when={browsingHome()}>
                <For each={sections()}>
                  {(section) => (
                    <section class="plugin-section" aria-label={t(PLUGIN_CATEGORY_LABELS[section.category])}>
                      <div class="plugin-section-head">
                        <h3>
                          {t(PLUGIN_CATEGORY_LABELS[section.category])}
                          <span class="plugin-section-count">{section.items.length}</span>
                        </h3>
                        <Show when={section.items.length > SECTION_PREVIEW}>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setCategory(section.category);
                              void refresh({ category: section.category });
                            }}
                          >
                            {t("See all")}
                          </Button>
                        </Show>
                      </div>
                      <ul class="plugin-rows">
                        <For each={section.items.slice(0, SECTION_PREVIEW)}>
                          {(plugin) => (
                            <PluginRow
                              plugin={plugin}
                              busy={busy()}
                              onOpen={(item) => void open(item)}
                              onConnect={(item) => void open(item)}
                            />
                          )}
                        </For>
                      </ul>
                    </section>
                  )}
                </For>
              </Show>

              <Show when={!browsingHome()}>
                <section class="plugin-section" aria-label={t("Results")}>
                  <div class="plugin-section-head">
                    <h3>
                      {(() => {
                        const selected = category();
                        return selected ? t(PLUGIN_CATEGORY_LABELS[selected]) : t("Results");
                      })()}
                      <span class="plugin-section-count">{value().total}</span>
                    </h3>
                    <Show when={category() || filter()}>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setCategory("");
                          setFilter("");
                          void refresh({ category: "", filter: "" });
                        }}
                      >
                        {t("Clear filters")}
                      </Button>
                    </Show>
                  </div>
                  <ul class="plugin-rows">
                    <For each={value().plugins}>
                      {(plugin) => (
                        <PluginRow
                          plugin={plugin}
                          busy={busy()}
                          onOpen={(item) => void open(item)}
                          onConnect={(item) => void open(item)}
                        />
                      )}
                    </For>
                  </ul>
                </section>
              </Show>

              <Show when={value().total > value().plugins.length}>
                <p class="plugin-note">
                  {t("Showing")} {value().plugins.length} {t("of")} {value().total}.{" "}
                  {t("Narrow the search to see more.")}
                </p>
              </Show>
            </>
          )}
        </Show>
      </Show>
    </section>
  );
}
