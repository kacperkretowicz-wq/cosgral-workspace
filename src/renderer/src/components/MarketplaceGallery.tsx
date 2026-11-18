import type { MarketplaceCategory, MarketplaceItem } from "@openbot/contracts/ipc";
import { MARKETPLACE_CATEGORIES } from "@openbot/contracts/ipc";
import { For, Show } from "solid-js";
import { t } from "../i18n";
import { Button, Input } from "./ui";
import { Check, Download, Search } from "./ui/icons";
import "../styles/marketplace-gallery.css";

const CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
  productivity: "Productivity",
  research: "Research",
  writing: "Writing",
  communication: "Communication",
  development: "Development",
  data: "Data",
  travel: "Travel",
};

function monogram(title: string): string {
  const words = title.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}` : title.slice(0, 2);
  return letters.toUpperCase();
}

function stateLabel(item: MarketplaceItem): string | null {
  if (item.libraryState === "local") return t("Local skill");
  if (item.libraryState === "outdated") return t("Update available");
  if (item.installedBotIds.length > 0) return t("Installed");
  return null;
}

/** One catalog card: a coloured monogram tile, title, one line, category and the install state. */
function MarketplaceCard(props: {
  item: MarketplaceItem;
  large?: boolean;
  selected: boolean;
  onOpen: (item: MarketplaceItem) => void;
  onInstall: (item: MarketplaceItem) => void;
}) {
  const state = () => stateLabel(props.item);
  const canQuickInstall = () => props.item.kind === "agent" && props.item.installedBotIds.length === 0;
  return (
    <li
      class="mk-card"
      data-large={props.large ? "true" : "false"}
      data-selected={props.selected ? "true" : "false"}
      data-category={props.item.category}
    >
      <Button
        type="button"
        variant="ghost"
        class="mk-card-open"
        aria-label={t("Open {title}", { title: props.item.title })}
        onClick={() => props.onOpen(props.item)}
      >
        <span class="mk-tile" aria-hidden="true">
          {monogram(props.item.title)}
        </span>
        <span class="mk-card-copy">
          <strong>{props.item.title}</strong>
          <small>{props.item.summary}</small>
          <span class="mk-card-meta">
            <span class="mk-chip">{t(CATEGORY_LABELS[props.item.category])}</span>
            <span class="mk-chip mk-chip-kind">{props.item.kind === "agent" ? t("Agent") : t("Skill")}</span>
            <Show when={state()}>
              {(label) => (
                <span class="mk-chip mk-chip-state" data-state={props.item.libraryState ?? "installed"}>
                  <Check size={12} stroke-width={1.5} aria-hidden="true" /> {label()}
                </span>
              )}
            </Show>
          </span>
        </span>
      </Button>
      <Show when={canQuickInstall()}>
        <Button
          type="button"
          class="mk-card-install"
          aria-label={t("Install {title}", { title: props.item.title })}
          onClick={() => props.onInstall(props.item)}
        >
          <Download size={14} stroke-width={1.5} aria-hidden="true" /> {t("Install")}
        </Button>
      </Show>
    </li>
  );
}

/**
 * The Agents / Skills gallery: a wide search, category chips, a "Featured" row when nothing is filtered, and the card grid.
 * It only draws; the page owns the data and the actions.
 */
export function MarketplaceGallery(props: {
  items: MarketplaceItem[];
  query: string;
  category: MarketplaceCategory | "";
  selectedId: string;
  onQuery: (value: string) => void;
  onCategory: (value: MarketplaceCategory | "") => void;
  onSearch: () => void;
  onOpen: (item: MarketplaceItem) => void;
  onInstall: (item: MarketplaceItem) => void;
}) {
  const filtered = () => props.query.trim() !== "" || props.category !== "";
  const featured = () => props.items.filter((item) => item.featured);
  const rest = () => (filtered() ? props.items : props.items.filter((item) => !item.featured));
  return (
    <div class="mk-gallery">
      <form
        class="mk-search"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSearch();
        }}
      >
        <Search size={18} stroke-width={1.5} aria-hidden="true" />
        <Input
          type="search"
          aria-label={t("Search the catalog")}
          placeholder={t("Search the catalog")}
          value={props.query}
          onInput={(event) => props.onQuery(event.currentTarget.value)}
        />
      </form>
      <fieldset class="mk-categories">
        <legend class="sr-only">{t("Category")}</legend>
        <Button
          type="button"
          variant="ghost"
          aria-pressed={props.category === "" ? "true" : "false"}
          onClick={() => props.onCategory("")}
        >
          {t("All")}
        </Button>
        <For each={MARKETPLACE_CATEGORIES}>
          {(category) => (
            <Button
              type="button"
              variant="ghost"
              aria-pressed={props.category === category ? "true" : "false"}
              onClick={() => props.onCategory(category)}
            >
              {t(CATEGORY_LABELS[category])}
            </Button>
          )}
        </For>
      </fieldset>
      <Show when={!filtered() && featured().length > 0}>
        <section aria-label={t("Featured")}>
          <h2 class="mk-heading">{t("Featured")}</h2>
          <ul class="mk-grid mk-grid-featured">
            <For each={featured()}>
              {(item) => (
                <MarketplaceCard
                  item={item}
                  large
                  selected={props.selectedId === item.id}
                  onOpen={props.onOpen}
                  onInstall={props.onInstall}
                />
              )}
            </For>
          </ul>
        </section>
      </Show>
      <section aria-label={t("Catalog")}>
        <h2 class="mk-heading">{filtered() ? t("Results") : t("Catalog")}</h2>
        <Show when={rest().length > 0} fallback={<p class="mk-empty">{t("No matching items.")}</p>}>
          <ul class="mk-grid">
            <For each={rest()}>
              {(item) => (
                <MarketplaceCard
                  item={item}
                  selected={props.selectedId === item.id}
                  onOpen={props.onOpen}
                  onInstall={props.onInstall}
                />
              )}
            </For>
          </ul>
        </Show>
      </section>
    </div>
  );
}
