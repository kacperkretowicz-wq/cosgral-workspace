import type {
  MarketplaceCategory,
  MarketplaceItem,
  MarketplaceItemDetails,
  MarketplaceItemKind,
  MarketplaceSuggestion,
} from "@openbot/contracts/ipc";
import { MARKETPLACE_CATEGORIES } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";

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
    <section aria-label="Item details">
      <h2>{item().title}</h2>
      <p>{item().description}</p>
      <p>
        {item().category} · version {item().version}
      </p>
      <Show when={props.details.skillMd}>
        <details>
          <summary>Skill instructions and files</summary>
          <pre>{props.details.skillMd}</pre>
          <ul>
            <For each={props.details.files}>{(file) => <li>{file}</li>}</For>
          </ul>
        </details>
      </Show>
      <Show when={props.details.agent}>
        {(agent) => (
          <>
            <p>Role: {agent().role}</p>
            <p>{agent().description}</p>
            <ul>
              <For each={agent().memories}>{(memory) => <li>{memory}</li>}</For>
            </ul>
          </>
        )}
      </Show>
      <Show when={item().kind === "skill"}>
        <label>
          Agent{" "}
          <select value={props.selectedBot} onChange={(e) => props.onSelectBot(e.currentTarget.value)}>
            <option value="">Choose an agent</option>
            <For each={props.bots}>{(bot) => <option value={bot.id}>{bot.name}</option>}</For>
          </select>
        </label>
      </Show>
      <Show when={item().libraryState === "local"}>
        <p>A local skill with this name already exists; installation is disabled.</p>
      </Show>
      <button
        type="button"
        disabled={item().libraryState === "local" || (item().kind === "skill" && !props.selectedBot)}
        onClick={props.onInstall}
      >
        {item().libraryState === "outdated" ? "Update" : "Install"}
      </button>
      <ul>
        <For each={item().installedBotIds}>
          {(id) => (
            <li>
              {props.bots.find((bot) => bot.id === id)?.name ?? id}{" "}
              <button type="button" onClick={() => props.onUninstall(id)}>
                {item().kind === "agent" ? "Delete agent" : "Uninstall"}
              </button>
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
  const [suggestions, setSuggestions] = createSignal<MarketplaceSuggestion[]>([]);
  const [query, setQuery] = createSignal("");
  const [kind, setKind] = createSignal<MarketplaceItemKind | "">("");
  const [category, setCategory] = createSignal<MarketplaceCategory | "">("");
  const [botId, setBotId] = createSignal("");
  const [error, setError] = createSignal("");
  const [warnings, setWarnings] = createSignal<string[]>([]);
  let serial = 0;
  async function refresh() {
    const api = window.openbot.marketplace;
    if (!api) {
      setError("Marketplace is unavailable.");
      return;
    }
    const n = ++serial;
    try {
      const [list, suggested] = await Promise.all([
        api.list({
          query: query(),
          ...(kind() ? { kind: kind() || undefined } : {}),
          ...(category() ? { category: category() || undefined } : {}),
        }),
        api.suggestions(botId() ? { botId: botId() } : {}),
      ]);
      if (n !== serial) return;
      setItems(list);
      setSuggestions(suggested);
      setError("");
      const current = details();
      if (current) setDetails(await api.get({ itemId: current.item.id }));
    } catch (e) {
      if (n === serial) setError(e instanceof Error ? e.message : "Could not load Marketplace.");
    }
  }
  async function choose(item: MarketplaceItem) {
    try {
      setDetails(await window.openbot.marketplace?.get({ itemId: item.id }));
    } catch (e) {
      setError(String(e));
    }
  }
  async function install() {
    const item = details()?.item;
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
      setError(e instanceof Error ? e.message : "Install failed.");
    }
  }
  async function uninstall(id: string) {
    const item = details()?.item;
    const api = window.openbot.marketplace;
    if (!item || !api) return;
    if (item.kind === "agent" && !window.confirm("Delete this agent and its chats and files?")) return;
    try {
      await api.uninstall({ itemId: item.id, botId: id });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uninstall failed.");
    }
  }
  onSettled(() => {
    void refresh();
    const off = window.openbot.agent.onEvent((event) => {
      if (event.type === "marketplace-changed" || event.type === "bots-changed") void refresh();
    });
    return () => {
      serial++;
      off();
    };
  });
  return (
    <main class="w2-library">
      <h1>Marketplace</h1>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <For each={warnings()}>{(warning) => <p role="alert">{warning}</p>}</For>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void refresh();
        }}
      >
        <label>
          Search <input value={query()} onInput={(e) => setQuery(e.currentTarget.value)} />
        </label>
        <label>
          Kind{" "}
          <select
            value={kind()}
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (v === "" || v === "skill" || v === "agent") setKind(v);
            }}
          >
            <option value="">All</option>
            <option value="skill">Skills</option>
            <option value="agent">Agents</option>
          </select>
        </label>
        <label>
          Category{" "}
          <select
            value={category()}
            onChange={(e) => {
              const found = MARKETPLACE_CATEGORIES.find((c) => c === e.currentTarget.value);
              setCategory(found ?? "");
            }}
          >
            <option value="">All</option>
            <For each={MARKETPLACE_CATEGORIES}>{(c) => <option value={c}>{c}</option>}</For>
          </select>
        </label>
        <button type="submit">Search</button>
      </form>
      <h2>Suggestions</h2>
      <ul>
        <For each={suggestions()}>
          {(suggestion) => (
            <li>
              <button type="button" onClick={() => void choose(suggestion.item)}>
                {suggestion.item.title}
              </button>{" "}
              — {suggestion.reason}
            </li>
          )}
        </For>
      </ul>
      <h2>Catalog</h2>
      <Show when={items().length} fallback={<p>No matching items.</p>}>
        <ul>
          <For each={items()}>
            {(item) => (
              <li>
                <button type="button" onClick={() => void choose(item)}>
                  {item.title}
                </button>{" "}
                — {item.summary}
              </li>
            )}
          </For>
        </ul>
      </Show>
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
    </main>
  );
}
