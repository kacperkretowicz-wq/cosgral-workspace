import type {
  MarketplaceCategory,
  MarketplaceItem,
  MarketplaceItemDetails,
  MarketplaceItemKind,
} from "@openbot/contracts/ipc";
import { createEffect, createSignal, For, onSettled, Show } from "solid-js";
import { errorText } from "../errors";
import { language, t, tData } from "../i18n";
import { CATEGORY_LABELS, MarketplaceGallery } from "./MarketplaceGallery";
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
  let panel: HTMLElement | undefined;
  // The details open below the whole catalog: bring them into view (and to the screen reader) when another card is opened.
  createEffect(
    () => props.details.item.id,
    () => {
      panel?.scrollIntoView?.({
        block: "nearest",
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    },
  );
  // Done is done: a skill for the chosen agent, an agent that already exists (like the card, which hides its quick install).
  const installedForChoice = () =>
    item().kind === "skill" ? item().installedBotIds.includes(props.selectedBot) : item().installedBotIds.length > 0;
  return (
    <section ref={panel} class="marketplace-detail" aria-label={t("Item details")} tabindex="-1">
      <h2>{tData(item().title)}</h2>
      <p>{tData(item().description)}</p>
      <p>
        {t(CATEGORY_LABELS[item().category])} · {t("version {number}", { number: item().version })}
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
            <p>{t("Role: {role}", { role: tData(agent().role) })}</p>
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
        disabled={
          item().libraryState === "local" ||
          (item().kind === "skill" && !props.selectedBot) ||
          (installedForChoice() && item().libraryState !== "outdated")
        }
        onClick={props.onInstall}
      >
        {item().libraryState === "outdated" ? t("Update") : installedForChoice() ? t("Installed") : t("Install")}
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

/** Lower case without accents, like the engine's own search ("spotkan" finds "spotkań"). */
function folded(value: string): string {
  return value.toLocaleLowerCase("pl-PL").normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l");
}

/** Every word of the query appears in the item's Polish or English title, summary, description, tags or category. */
export function matchesBothLanguages(item: MarketplaceItem, query: string): boolean {
  const haystack = folded(
    [item.title, item.summary, item.description, ...item.tags, CATEGORY_LABELS[item.category]]
      .flatMap((value) => [value, tData(value)])
      .join(" "),
  );
  return folded(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
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
      const text = (patch.query ?? query()).trim();
      // The engine searches its English texts. In Polish the window asks for everything and filters on both the
      // Polish and the English words, so "notatki" finds "Meeting notes".
      const polish = language() === "pl" && text !== "";
      const list = await api.list({
        query: polish ? "" : text,
        ...(chosenKind ? { kind: chosenKind } : {}),
        ...(chosenCategory ? { category: chosenCategory } : {}),
      });
      if (n !== serial) return;
      setItems(polish ? list.filter((item) => matchesBothLanguages(item, text)) : list);
      setError("");
      const current = details();
      if (current) setDetails(await api.get({ itemId: current.item.id }));
    } catch (e) {
      if (n === serial) setError(errorText(e, t("Could not load Marketplace.")));
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
      // The catalog is English; an agent made from it gets the name and role the window shows, in its language.
      const profile = item.kind === "agent" ? (await api.get({ itemId: item.id })).agent : null;
      const result =
        item.kind === "skill"
          ? await api.installSkill({ itemId: item.id, botId: botId() })
          : await api.installAgent({
              itemId: item.id,
              name: tData(item.title),
              ...(profile ? { role: tData(profile.role) } : {}),
            });
      setWarnings(result.warnings);
      await refresh();
    } catch (e) {
      setError(errorText(e, t("Install failed.")));
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
      setError(errorText(e, t("Uninstall failed.")));
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
