import type { AgentEvent, PluginCategory, PluginDetails, PluginList, PluginSummary } from "@openbot/contracts/ipc";
import { PLUGIN_CATEGORIES, PLUGIN_CATEGORY_LABELS } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { Button, Input, NativeSelect } from "./ui";

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

function pickCategory(value: string): PluginCategory | "" {
  return PLUGIN_CATEGORIES.find((category) => category === value) ?? "";
}

function pickFilter(value: string): Filter {
  return FILTERS.find((filter) => filter.id === value)?.id ?? "";
}

/**
 * The "Apps" tab of the Marketplace (window.openbot.pluginCatalog): the catalog of plugins (MCP servers), a detail
 * view with the sign-in steps and the write-only value fields, install / update / uninstall and own plugins.
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

  async function refresh(patch: { category?: PluginCategory | ""; filter?: Filter } = {}) {
    if (!api) return;
    const n = ++serial;
    try {
      const chosenCategory = patch.category ?? category();
      const chosenFilter = patch.filter ?? filter();
      const next = await api.list({
        query: query(),
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

  onSettled(() => {
    void refresh();
    const listen = window.openbot?.agent?.onEvent;
    if (!listen) return;
    const off = listen((event: AgentEvent) => {
      if (event.type === "plugin-catalog-changed") void refresh();
    });
    return () => {
      serial++;
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

  return (
    <section class="plugin-apps" aria-label={t("Apps")}>
      <Show when={api} fallback={<p class="plugin-note">{t("Apps are not available in this version.")}</p>}>
        <form
          class="plugin-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void refresh();
          }}
        >
          <Input
            type="search"
            aria-label={t("Search apps")}
            placeholder={t("Search apps")}
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
          <NativeSelect
            aria-label={t("Category")}
            value={category()}
            onChange={(event) => {
              const picked = pickCategory(event.currentTarget.value);
              setCategory(picked);
              void refresh({ category: picked });
            }}
          >
            <option value="">{t("All categories")}</option>
            <For each={PLUGIN_CATEGORIES}>
              {(item) => <option value={item}>{t(PLUGIN_CATEGORY_LABELS[item])}</option>}
            </For>
          </NativeSelect>
          <NativeSelect
            aria-label={t("Show")}
            value={filter()}
            onChange={(event) => {
              const picked = pickFilter(event.currentTarget.value);
              setFilter(picked);
              void refresh({ filter: picked });
            }}
          >
            <For each={FILTERS}>{(item) => <option value={item.id}>{t(item.label)}</option>}</For>
          </NativeSelect>
          <Button type="submit">{t("Search")}</Button>
          <Button type="button" variant="ghost" onClick={() => setCustomOpen(!customOpen())}>
            {t("Add custom")}
          </Button>
        </form>

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
                  {value().summary.error ?? t("Finish signing in on the service's page, then come back.")}
                </p>
              </Show>
              <Show when={value().summary.state === "error"}>
                <p class="plugin-error" role="alert">
                  {value().summary.error ?? t("This app has a problem.")}
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
                <p class="plugin-note">
                  {t("No catalog is loaded yet. Choose the catalog folder in the server settings.")}
                </p>
              </Show>
              <Show when={value().plugins.length === 0 && value().info.source !== "none"}>
                <p class="plugin-note cosgral-empty-enter">{t("No matching apps.")}</p>
              </Show>
              <ul class="plugin-grid">
                <For each={value().plugins}>
                  {(plugin) => (
                    <li>
                      <Button type="button" variant="ghost" class="plugin-card" onClick={() => void open(plugin)}>
                        <strong>{plugin.name}</strong>
                        <span class="plugin-card-tagline">{plugin.tagline}</span>
                        <span class="plugin-card-state" data-state={plugin.state}>
                          {t(STATE_LABELS[plugin.state])}
                        </span>
                      </Button>
                    </li>
                  )}
                </For>
              </ul>
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
