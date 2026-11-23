import type { SearchHit, SearchKind } from "@openbot/contracts/ipc";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import type { BotMessage, BotProfile } from "../data";
import { t } from "../i18n";
import { modKeyLabel } from "../keyboard-shortcuts";
import { AgentAvatar } from "./AgentAvatar";
import { Combobox, Dialog, Input, Kbd, Search, Tabs } from "./ui";

type SearchTab = "all" | "agents" | "channels" | "messages" | "files" | "routines";

const SEARCH_TABS: ReadonlyArray<{ id: SearchTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "agents", label: "Agents" },
  { id: "channels", label: "Channels" },
  { id: "messages", label: "Messages" },
  { id: "files", label: "Files" },
  { id: "routines", label: "Routines" },
];

/** Kinds the window cannot search by itself: they come from window.openbot.search. */
const REMOTE_KINDS: SearchKind[] = ["channels", "files", "routines"];

type GlobalSearchResult =
  | { kind: "bot"; bot: BotProfile }
  | { kind: "message"; bot: BotProfile; message: BotMessage }
  | { kind: "hit"; hit: SearchHit };

interface GlobalSearchProps {
  open: boolean;
  bots: BotProfile[];
  messagesByBot: Record<string, BotMessage[]>;
  onOpenChange: (open: boolean) => void;
  onSelectBot: (botId: string) => void;
  onSelectMessage: (botId: string, messageId: string) => void;
  /** A channel, file or routine found by window.openbot.search. */
  onSelectHit?: (hit: SearchHit) => void;
}

const SEARCH_RESULT_LIMIT = 100;

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function isSearchTab(value: string): value is SearchTab {
  return SEARCH_TABS.some((tab) => tab.id === value);
}

function messagePreview(message: BotMessage): string {
  return message.body.trim().replace(/\s+/g, " ");
}

function resultKey(result: GlobalSearchResult): string {
  if (result.kind === "hit") return `hit:${result.hit.kind}:${result.hit.id}`;
  return result.kind === "bot" ? `bot:${result.bot.id}` : `message:${result.bot.id}:${result.message.id}`;
}

function resultLabel(result: GlobalSearchResult): string {
  if (result.kind === "hit") return result.hit.title;
  return result.kind === "bot" ? result.bot.name : messagePreview(result.message);
}

function resultSearchText(result: GlobalSearchResult): string {
  if (result.kind === "hit") return normalized(`${result.hit.title} ${result.hit.snippet}`);
  if (result.kind === "bot") {
    return normalized(`${result.bot.name} ${result.bot.role} ${result.bot.description} ${result.bot.preview}`);
  }
  return normalized(`${result.message.body} ${result.bot.name} ${result.bot.role}`);
}

function resultDescription(result: GlobalSearchResult): string {
  if (result.kind === "hit") return result.hit.snippet;
  if (result.kind === "bot") return result.bot.role || result.bot.preview;
  const direction =
    result.message.author === "you"
      ? t("You to {name}", { name: result.bot.name })
      : t("{name} to you", { name: result.bot.name });
  return `${direction} · ${result.message.time}`;
}

function resultKindLabel(result: GlobalSearchResult): string {
  if (result.kind === "bot") return t("Agent");
  if (result.kind === "message") return t("Message");
  const kind = result.hit.kind;
  return kind === "channels"
    ? t("Channel")
    : kind === "files"
      ? t("File")
      : kind === "routines"
        ? t("Routine")
        : t("Result");
}

export function GlobalSearch(props: GlobalSearchProps) {
  /** "Ctrl" on Windows and Linux, "⌘" on macOS (the result hints always showed ⌘). */
  const modKey = modKeyLabel();
  const [tab, setTab] = createSignal<SearchTab>("all");
  const [query, setQuery] = createSignal("");
  const [remoteHits, setRemoteHits] = createSignal<SearchHit[]>([]);
  let searchSerial = 0;
  let input: HTMLInputElement | undefined;

  const botResults = createMemo<GlobalSearchResult[]>(() => props.bots.map((bot) => ({ kind: "bot", bot })));
  const messageResults = createMemo<GlobalSearchResult[]>(() =>
    props.bots.flatMap((bot) =>
      [...(props.messagesByBot[bot.id] ?? [])]
        .reverse()
        .filter((message) => message.kind !== "thinking" && messagePreview(message).length > 0)
        .map((message) => ({ kind: "message" as const, bot, message })),
    ),
  );
  const remoteResults = createMemo<GlobalSearchResult[]>(() =>
    remoteHits().map((hit) => ({ kind: "hit" as const, hit })),
  );
  const results = createMemo(() => {
    const value = normalized(query());
    const category = tab();
    const ofKind = (kind: SearchKind) =>
      remoteResults().filter((result) => result.kind === "hit" && result.hit.kind === kind);
    const candidates =
      category === "agents"
        ? botResults()
        : category === "messages"
          ? messageResults()
          : category === "channels" || category === "files" || category === "routines"
            ? ofKind(category)
            : value
              ? [...botResults(), ...messageResults(), ...remoteResults()]
              : botResults();
    if (!value) return candidates.slice(0, SEARCH_RESULT_LIMIT);
    return candidates
      .filter((result) => result.kind === "hit" || resultSearchText(result).includes(value))
      .slice(0, SEARCH_RESULT_LIMIT);
  });

  createEffect(
    () => props.open,
    (open) => {
      if (!open) return;
      setTab("all");
      setQuery("");
      requestAnimationFrame(() => input?.focus());
    },
  );

  createEffect(
    () => ({ open: props.open, q: query().trim() }),
    ({ open, q }) => {
      const api = window.openbot?.search;
      const serial = ++searchSerial;
      if (!open || !q || !api) {
        setRemoteHits([]);
        return;
      }
      const timer = setTimeout(() => {
        void api
          .query({ q, kinds: REMOTE_KINDS, limit: 10 })
          .then((answer) => {
            if (serial === searchSerial) setRemoteHits(answer.hits);
          })
          .catch(() => {
            if (serial === searchSerial) setRemoteHits([]);
          });
      }, 150);
      return () => clearTimeout(timer);
    },
  );

  function activate(result: GlobalSearchResult | null | undefined): void {
    if (!result) return;
    props.onOpenChange(false);
    if (result.kind === "hit") props.onSelectHit?.(result.hit);
    else if (result.kind === "bot") props.onSelectBot(result.bot.id);
    else props.onSelectMessage(result.bot.id, result.message.id);
  }

  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay class="global-search-overlay" />
        <Dialog.Content class="global-search-dialog" aria-describedby={undefined}>
          <Dialog.Title class="sr-only">{t("Search COSGRAL")}</Dialog.Title>
          <Combobox.Root<GlobalSearchResult>
            options={results()}
            open={true}
            modal={false}
            triggerMode="input"
            closeOnSelection={false}
            shouldFocusWrap={true}
            allowsEmptyCollection={true}
            noResetInputOnBlur={true}
            onInputChange={setQuery}
            defaultFilter={() => true}
            optionValue={resultKey}
            optionTextValue={resultSearchText}
            optionLabel={resultLabel}
            onChange={activate}
            itemComponent={(itemProps) => {
              const result = itemProps.item.rawValue;
              const index = () => results().findIndex((candidate) => resultKey(candidate) === resultKey(result));
              return (
                <Combobox.Item item={itemProps.item} class="global-search-result">
                  <Show when={result.kind !== "hit"}>
                    <AgentAvatar
                      bot={result.kind === "hit" ? undefined : result.bot}
                      motion="hover"
                      class="global-search-avatar"
                    />
                  </Show>
                  <span class="global-search-result-copy">
                    <Combobox.ItemLabel>
                      <span class="global-search-result-title">{resultLabel(result)}</span>
                    </Combobox.ItemLabel>
                    <span class="global-search-result-description">{resultDescription(result)}</span>
                  </span>
                  <span class="global-search-result-shortcut" aria-hidden="true">
                    <Show when={index() >= 0 && index() < 9} fallback={<span>{resultKindLabel(result)}</span>}>
                      <Kbd>{modKey}</Kbd>
                      <Kbd>{index() + 1}</Kbd>
                    </Show>
                  </span>
                </Combobox.Item>
              );
            }}
          >
            <Combobox.Control class="global-search-control">
              <Search aria-hidden="true" />
              <Combobox.Input
                as={Input}
                ref={(element) => (input = element)}
                class="global-search-input"
                aria-label={t("Search COSGRAL")}
                placeholder={t("Search")}
                autocomplete="off"
                autocapitalize="none"
                spellcheck={false}
                onKeyDown={(event) => {
                  // The result list is part of the search window: one Escape closes the window (the combobox only
                  // closed its list, so the window needed a second Escape).
                  if (event.key === "Escape" && !event.isComposing) {
                    event.preventDefault();
                    event.stopPropagation();
                    props.onOpenChange(false);
                    return;
                  }
                  if (event.key === "Enter" && !event.isComposing && !input?.getAttribute("aria-activedescendant")) {
                    const firstResult = results()[0];
                    if (!firstResult) return;
                    event.preventDefault();
                    activate(firstResult);
                    return;
                  }
                  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
                  const index = Number(event.key) - 1;
                  if (!Number.isInteger(index) || index < 0 || index > 8) return;
                  const result = results()[index];
                  if (!result) return;
                  event.preventDefault();
                  activate(result);
                }}
              />
            </Combobox.Control>

            <Tabs.Root
              value={tab()}
              onChange={(value) => {
                if (isSearchTab(value)) setTab(value);
              }}
              class="global-search-tabs"
            >
              <Tabs.List aria-label={t("Filter results")}>
                <For each={SEARCH_TABS}>{(item) => <Tabs.Trigger value={item.id}>{t(item.label)}</Tabs.Trigger>}</For>
              </Tabs.List>
            </Tabs.Root>

            <Combobox.Content class="global-search-results">
              <Combobox.Listbox aria-label={t("Results")} />
              <Show when={results().length === 0}>
                <div class="global-search-empty">{t("Nothing found")}</div>
              </Show>
            </Combobox.Content>
          </Combobox.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
