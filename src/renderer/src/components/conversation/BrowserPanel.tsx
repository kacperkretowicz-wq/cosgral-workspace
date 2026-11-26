import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import type { BrowserControlState, BrowserPageCopy, BrowserTab } from "@openbot/contracts/ipc";
import { createSignal, For, Show } from "solid-js";
import { t } from "../../i18n";
import { ChatRightPanelTabs, type ChatSidePanelTarget } from "../ChatSidePanelLauncher";
import { Button, DropdownMenu, Input, Tabs } from "../ui";
import {
  BrowserBackIcon,
  BrowserControlIcon,
  BrowserForwardIcon,
  BrowserReloadIcon,
  CloseIcon,
  PlusIcon,
} from "./ConversationIcons";
import { BROWSER_PANEL_SIZES, browserActionLabel } from "./model";
import { pagePreview } from "./page-share";
import { SidePanelResizer } from "./SidePanelResizer";

type BrowserControlSession = BrowserControlState["sessions"][number];

/**
 * The browser side panel of a conversation: tab strip, toolbar and the surface the browser view is drawn into. Tabs,
 * the address and which agent controls a tab belong to the conversation; this reports what the person does.
 */
export function BrowserPanel(props: {
  tabs: BrowserTab[];
  activeTabId: string | undefined;
  /** Whether an agent is controlling the active tab (the panel gets its "controlled" look). */
  controlled: boolean;
  controlForTab: (tab: BrowserTab) => BrowserControlSession | undefined;
  controllerNameForTab: (tab: BrowserTab) => string | undefined;
  address: string;
  width: number;
  /** Width of the conversation the panel sits in, so the panel never takes all of it. */
  availableWidth: () => number;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  /** Opens the page of the active tab in the default browser of the computer. */
  onOpenExternal: () => void;
  /** Copies the address of the active tab; resolves to whether it worked. */
  onCopyAddress: () => Promise<boolean>;
  /** The agent of this conversation (its name); without one, a page cannot be shown. */
  agentName?: string;
  /** Reads the visible text of the active tab, only after the person asked. */
  onReadPage?: (tabId: string) => Promise<BrowserPageCopy>;
  /** Sends the page to the agent as a message; resolves to whether it was sent. */
  onSendPage?: (page: BrowserPageCopy) => Promise<boolean>;
  onAddressInput: (value: string) => void;
  onAddressSubmit: () => void;
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
  onOpenSidePanel: (target: ChatSidePanelTarget) => void;
  surfaceRef: (element: HTMLDivElement) => void;
}) {
  const activeTab = () => props.tabs.find((tab) => tab.id === props.activeTabId);
  const [menuNote, setMenuNote] = createSignal("");
  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  async function copyAddress() {
    const ok = await props.onCopyAddress();
    setMenuNote(ok ? t("Address copied.") : t("Could not copy the address."));
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => setMenuNote(""), 2500);
  }
  type Share =
    | { phase: "closed" }
    | { phase: "reading" }
    | { phase: "ready"; page: BrowserPageCopy }
    | { phase: "sending"; page: BrowserPageCopy }
    | { phase: "error"; message: string };
  const [share, setShare] = createSignal<Share>({ phase: "closed" });
  const shareError = () => {
    const current = share();
    return current.phase === "error" ? current.message : null;
  };
  async function startShare() {
    const tab = activeTab();
    if (!tab || !props.onReadPage) return;
    setShare({ phase: "reading" });
    try {
      setShare({ phase: "ready", page: await props.onReadPage(tab.id) });
    } catch {
      setShare({
        phase: "error",
        message: t("Could not read this page. Only ordinary web pages can be shown to the agent."),
      });
    }
  }
  async function confirmShare(page: BrowserPageCopy) {
    if (!props.onSendPage) return;
    setShare({ phase: "sending", page });
    const sent = await props.onSendPage(page);
    if (sent) {
      setShare({ phase: "closed" });
      setMenuNote(t("The page was sent to {name}.", { name: props.agentName ?? t("Agent") }));
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => setMenuNote(""), 4000);
    } else setShare({ phase: "error", message: t("Could not send the page. Try again.") });
  }
  return (
    <Tabs.Root
      as="aside"
      id="browser-side-panel"
      class={["browser-panel", { "browser-panel-controlled": props.controlled }]}
      aria-label={t("Browser")}
      value={props.activeTabId ?? "__empty"}
      onChange={props.onActivateTab}
      activationMode="automatic"
    >
      <SidePanelResizer
        controls="browser-side-panel"
        width={props.width}
        sizes={BROWSER_PANEL_SIZES}
        availableWidth={props.availableWidth}
        onResize={props.onResize}
        onResizeEnd={props.onResizeEnd}
      />
      <ChatRightPanelTabs active="browser" onSelect={props.onOpenSidePanel} />
      <header class="browser-panel-header">
        <div class="browser-tabs">
          <Tabs.List class="browser-tab-strip" aria-label={t("Browser tabs")}>
            <For each={props.tabs}>
              {(tab) => {
                const control = () => props.controlForTab(tab);
                const controllerName = () => props.controllerNameForTab(tab) ?? t("Agent");
                const title = () => (tab.loading ? t("Loading…") : tab.title || tab.url);
                return (
                  <div
                    role="presentation"
                    class={["browser-tab-wrap", { "browser-tab-controlled": Boolean(control()) }]}
                  >
                    <Tabs.Trigger
                      as={Button}
                      value={tab.id}
                      aria-label={
                        control()
                          ? t("{title}, controlled by {name}", { title: title(), name: controllerName() })
                          : title()
                      }
                      aria-description={t("Press Delete or Control/Command W to close")}
                      class="browser-tab"
                      onPointerDown={(event) => {
                        if (event.button !== 1) return;
                        event.preventDefault();
                        event.stopPropagation();
                        props.onCloseTab(tab.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Delete") return;
                        event.preventDefault();
                        props.onCloseTab(tab.id);
                      }}
                    >
                      <Show when={control()}>
                        {(session) => (
                          <span
                            class={[
                              "browser-tab-control",
                              { "browser-tab-control-acting": session().phase === "acting" },
                            ]}
                            title={`${controllerName()}: ${browserActionLabel(session().action)}`}
                          >
                            <BrowserControlIcon />
                          </span>
                        )}
                      </Show>
                      <span class="browser-tab-title" data-loading={tab.loading ? "true" : undefined}>
                        <Show when={tab.loading} fallback={tab.title || tab.url}>
                          <span class="browser-tab-loading cosgral-skeleton" aria-hidden="true" />
                          <span class="sr-only">{t("Loading…")}</span>
                        </Show>
                      </span>
                      <span
                        class="browser-tab-close"
                        aria-hidden="true"
                        title={t("Close {title}", { title: tab.title || t("Browser tab") })}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (event.button === 1) props.onCloseTab(tab.id);
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          props.onCloseTab(tab.id);
                        }}
                      >
                        <CloseIcon />
                      </span>
                    </Tabs.Trigger>
                  </div>
                );
              }}
            </For>
          </Tabs.List>
          <Button type="button" class="browser-new-tab" aria-label={t("New browser tab")} onClick={props.onNewTab}>
            <PlusIcon />
          </Button>
        </div>
      </header>
      <Tabs.Content forceMount value={props.activeTabId ?? "__empty"} class="browser-tab-panel">
        <div class="browser-toolbar">
          <Button
            type="button"
            aria-label={t("Go back")}
            title={activeTab()?.canGoBack ? t("Go back") : t("There is no earlier page in this tab.")}
            class="browser-toolbar-button"
            disabled={!activeTab()?.canGoBack}
            onClick={props.onBack}
          >
            <BrowserBackIcon />
          </Button>
          <Button
            type="button"
            aria-label={t("Go forward")}
            title={activeTab()?.canGoForward ? t("Go forward") : t("There is no later page in this tab.")}
            class="browser-toolbar-button"
            disabled={!activeTab()?.canGoForward}
            onClick={props.onForward}
          >
            <BrowserForwardIcon />
          </Button>
          <Button type="button" aria-label={t("Reload page")} class="browser-toolbar-button" onClick={props.onReload}>
            <BrowserReloadIcon />
          </Button>
          <form
            class="browser-address-bar"
            onSubmit={(event) => {
              event.preventDefault();
              props.onAddressSubmit();
            }}
          >
            <Input
              value={props.address}
              aria-label={t("Browser address")}
              maxlength={INPUT_LIMITS.browserUrl}
              onInput={(event) => props.onAddressInput(event.currentTarget.value)}
            />
          </form>
          <DropdownMenu.Root placement="bottom-end" gutter={6} modal={false}>
            <DropdownMenu.Trigger
              as={Button}
              type="button"
              class="browser-toolbar-button"
              aria-label={t("Browser menu")}
              title={t("Browser menu")}
              disabled={!activeTab()}
            >
              <span class="browser-menu-dots">•••</span>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content class="bot-context-menu" aria-label={t("Browser menu")}>
                <DropdownMenu.Item onSelect={() => props.onOpenExternal()}>
                  <span>{t("Open in your default browser")}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => void copyAddress()}>
                  <span>{t("Copy address")}</span>
                </DropdownMenu.Item>
                <Show when={props.onReadPage}>
                  <DropdownMenu.Item
                    disabled={!props.agentName}
                    onSelect={() => void startShare()}
                    title={
                      props.agentName
                        ? t(
                            "Sends this one page to {name} after you confirm. The agent never watches the browser by itself.",
                            {
                              name: props.agentName,
                            },
                          )
                        : t("Open a chat with an agent first.")
                    }
                  >
                    <span>{t("Show this page to the agent")}</span>
                  </DropdownMenu.Item>
                </Show>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
        <Show when={share().phase !== "closed"}>
          <section class="browser-share-card" aria-label={t("Show this page to the agent")}>
            <Show when={share().phase === "reading"}>
              <p role="status">{t("Reading the page…")}</p>
            </Show>
            <Show when={shareError()}>
              <p role="alert">{shareError()}</p>
              <div class="browser-share-actions">
                <Button type="button" onClick={() => setShare({ phase: "closed" })}>
                  {t("Close")}
                </Button>
              </div>
            </Show>
            <Show
              when={(() => {
                const current = share();
                return current.phase === "ready" || current.phase === "sending" ? current : null;
              })()}
              keyed
            >
              {(current) => (
                <>
                  <strong>{t("Show this page to {name}?", { name: props.agentName ?? t("Agent") })}</strong>
                  <p class="browser-share-page">
                    {current.page.title || t("(no title)")} · {current.page.url}
                  </p>
                  <p>
                    {t(
                      "The agent will get the title, the address and the visible text of this one page ({count} characters). It will not see other tabs or pictures. It is sent as an ordinary message in this chat.",
                      { count: current.page.text.length },
                    )}
                  </p>
                  <Show when={current.page.truncated}>
                    <p>{t("The page was long, so only its beginning is sent.")}</p>
                  </Show>
                  <p class="browser-share-preview">
                    <strong>{t("Beginning of the page")}:</strong>{" "}
                    {pagePreview(current.page) || t("This page has no text to show.")}
                  </p>
                  <div class="browser-share-actions">
                    <Button
                      type="button"
                      disabled={current.phase === "sending" || current.page.text.length === 0}
                      onClick={() => void confirmShare(current.page)}
                    >
                      {t("Send to the agent")}
                    </Button>
                    <Button
                      type="button"
                      disabled={current.phase === "sending"}
                      onClick={() => setShare({ phase: "closed" })}
                    >
                      {t("Cancel")}
                    </Button>
                  </div>
                </>
              )}
            </Show>
          </section>
        </Show>
        <Show when={menuNote()}>
          <p class="browser-menu-note" role="status">
            {menuNote()}
          </p>
        </Show>
        <div class="browser-surface" ref={props.surfaceRef}>
          <Show when={props.tabs.length === 0}>
            <div class="browser-empty-state">
              <strong>{t("Open a page")}</strong>
              <span>{t("The agent can browse here while it works.")}</span>
            </div>
          </Show>
        </div>
      </Tabs.Content>
    </Tabs.Root>
  );
}
