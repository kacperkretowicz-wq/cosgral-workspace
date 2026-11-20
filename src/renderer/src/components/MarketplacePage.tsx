import type {
  MarketplaceCategory,
  MarketplaceItem,
  MarketplaceItemDetails,
  MarketplaceItemKind,
} from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { t } from "../i18n";
import { MarketplaceGallery } from "./MarketplaceGallery";
import { PluginAppsPanel } from "./PluginAppsPanel";
import { Button, NativeSelect } from "./ui";
import { Bot, Plug, Sparkles } from "./ui/icons";
import { WorkPage } from "./WorkPage";
import "../styles/plugin-apps.css";

type Person = { id: string; name: string };
export function MarketplaceDetail(props: {
  details: MarketplaceItemDetails;
  bots: Person[];
  selectedBot: string;
  onSelectBot: (id: string) => void;
  onInstall: () => void;
  onUninstall: (id: string) => void;
}) {
  const item = () => props.details.item;
  return (
    <section class="marketplace-detail" aria-label={t("Item details")}>
      <h2>{item().title}</h2>
      <p>{item().description}</p>
      <p>
        {item().category} · {t("version {number}", { number: item().version })}
      </p>
      <Show when={props.details.skillMd}>
        <details>
          <summary>{t("Skill instructions and files")}</summary>
          <pre>{props.details.skillMd}</pre>
          <ul>
            <For each={props.details.files}>{(file) => <li>{file}</li>}</For>
          </ul>
        </details>
      </Show>
      <Show when={props.details.agent}>
        {(agent) => (
          <>
            <p>{t("Role: {role}", { role: agent().role })}</p>
            <p>{agent().description}</p>
            <ul>
              <For each={agent().memories}>{(memory) => <li>{memory}</li>}</For>
            </ul>
          </>
        )}
      </Show>
      <Show when={item().kind === "skill"}>
        <label>
          {t("Agent")}{" "}
          <NativeSelect unstyled value={props.selectedBot} onChange={(e) => props.onSelectBot(e.currentTarget.value)}>
            <option value="">{t("Choose an agent")}</option>
            <For each={props.bots}>{(bot) => <option value={bot.id}>{bot.name}</option>}</For>
          </NativeSelect>
        </label>
      </Show>
      <Show when={item().libraryState === "local"}>
        <p>{t("A local skill with this name already exists; installation is disabled.")}</p>
      </Show>
      <Button
        unstyled
        type="button"
        disabled={item().libraryState === "local" || (item().kind === "skill" && !props.selectedBot)}
        onClick={props.onInstall}
      >
        {item().libraryState === "outdated" ? t("Update") : t("Install")}
      </Button>
      <ul>
        <For each={item().installedBotIds}>
          {(id) => (
            <li>
              {props.bots.find((bot) => bot.id === id)?.name ?? id}{" "}
              <Button unstyled type="button" onClick={() => props.onUninstall(id)}>
                {item().kind === "agent" ? t("Delete agent") : t("Uninstall")}
              </Button>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}

export function MarketplacePage(props: { bots: Person[] }) {
  const [items, setItems] = createSignal<MarketplaceItem[]>([]);
  const [details, setDetails] = createSignal<MarketplaceItemDetails>();
  const [query, setQuery] = createSignal("");
  const [kind, setKind] = createSignal<MarketplaceItemKind | "">("");
  const [category, setCategory] = createSignal<MarketplaceCategory | "">("");
  const [botId, setBotId] = createSignal("");
  const [error, setError] = createSignal("");
  const [warnings, setWarnings] = createSignal<string[]>([]);
  // Three tabs when the plugin catalog exists (Apps first, like the reference); without it the old single list stays.
  const hasApps = Boolean(window.openbot?.pluginCatalog);
  const [tab, setTab] = createSignal<"apps" | "agents" | "skills" | "all">(hasApps ? "apps" : "all");
  function selectTab(next: "apps" | "agents" | "skills") {
    setTab(next);
    setDetails(undefined);
    const nextKind = next === "agents" ? "agent" : next === "skills" ? "skill" : kind();
    setKind(nextKind);
    if (next !== "apps") void refresh({ kind: nextKind });
  }
  let serial = 0;
  let typing: ReturnType<typeof setTimeout> | undefined;
  // Search as you type: wait a moment after the last key, then ask with the text that was typed.
  function queueSearch(value: string) {
    clearTimeout(typing);
    typing = setTimeout(() => void refresh({ query: value }), 250);
  }
  async function refresh(
    patch: { query?: string; category?: MarketplaceCategory | ""; kind?: MarketplaceItemKind | "" } = {},
  ) {
    const api = window.openbot.marketplace;
    if (!api) {
      setError(t("Marketplace is unavailable."));
      return;
    }
    const n = ++serial;
    try {
      const chosenKind = patch.kind ?? kind();
      const chosenCategory = patch.category ?? category();
      const list = await api.list({
        query: patch.query ?? query(),
        ...(chosenKind ? { kind: chosenKind } : {}),
        ...(chosenCategory ? { category: chosenCategory } : {}),
      });
      if (n !== serial) return;
      setItems(list);
      setError("");
      const current = details();
      if (current) setDetails(await api.get({ itemId: current.item.id }));
    } catch (e) {
      if (n === serial) setError(e instanceof Error ? e.message : t("Could not load Marketplace."));
    }
  }
  async function choose(item: MarketplaceItem) {
    try {
      setDetails(await window.openbot.marketplace?.get({ itemId: item.id }));
    } catch (e) {
      setError(String(e));
    }
  }
  async function install(chosen?: MarketplaceItem) {
    const item = chosen ?? details()?.item;
    const api = window.openbot.marketplace;
    if (!item || !api) return;
    try {
      const result =
        item.kind === "skill"
          ? await api.installSkill({ itemId: item.id, botId: botId() })
          : await api.installAgent({ itemId: item.id });
      setWarnings(result.warnings);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Install failed."));
    }
  }
  async function uninstall(id: string) {
    const item = details()?.item;
    const api = window.openbot.marketplace;
    if (!item || !api) return;
    if (item.kind === "agent" && !window.confirm(t("Delete this agent and its chats and files?"))) return;
    try {
      await api.uninstall({ itemId: item.id, botId: id });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Uninstall failed."));
    }
  }
  onSettled(() => {
    void refresh();
    const off = window.openbot.agent.onEvent((event) => {
      if (event.type === "marketplace-changed" || event.type === "bots-changed") void refresh();
    });
    return () => {
      serial++;
      clearTimeout(typing);
      off();
    };
  });
  return (
    <WorkPage
      page="marketplace"
      class="marketplace-shell"
      title={t("Marketplace")}
      description={t("Apps, agents and skills for your team. Connect or install them in one click.")}
    >
      <div class="work-page-body marketplace-body" data-single={hasApps ? "false" : "true"}>
        <Show when={hasApps}>
          <nav class="work-page-nav marketplace-nav-list" aria-label={t("Marketplace sections")}>
            <For
              each={
                [
                  ["apps", "Apps", Plug],
                  ["agents", "Agents", Bot],
                  ["skills", "Skills", Sparkles],
                ] as const
              }
            >
              {([id, label, Icon]) => (
                <Button
                  unstyled
                  type="button"
                  class="work-page-nav-item"
                  aria-current={tab() === id ? "page" : undefined}
                  onClick={() => selectTab(id)}
                >
                  <Icon aria-hidden="true" size={16} stroke-width={1.5} />
                  <span>{t(label)}</span>
                </Button>
              )}
            </For>
          </nav>
        </Show>
        <div class="marketplace-main">
          <Show when={tab() === "apps"}>
            <PluginAppsPanel />
          </Show>
          <Show when={tab() !== "apps"}>
            <Show when={error()}>
              <p role="alert">{error()}</p>
            </Show>
            <For each={warnings()}>{(warning) => <p role="alert">{warning}</p>}</For>
            <MarketplaceGallery
              items={items()}
              query={query()}
              category={category()}
              selectedId={details()?.item.id ?? ""}
              onQuery={(value) => {
                setQuery(value);
                queueSearch(value);
              }}
              onCategory={(value) => {
                setCategory(value);
                void refresh({ category: value });
              }}
              onSearch={() => void refresh()}
              onOpen={(item) => void choose(item)}
              onInstall={(item) => void install(item)}
            />
            <Show when={details()}>
              {(value) => (
                <MarketplaceDetail
                  details={value()}
                  bots={props.bots}
                  selectedBot={botId()}
                  onSelectBot={(id) => {
                    setBotId(id);
                    void refresh();
                  }}
                  onInstall={() => void install()}
                  onUninstall={(id) => void uninstall(id)}
                />
              )}
            </Show>
          </Show>
        </div>
      </div>
    </WorkPage>
  );
}
