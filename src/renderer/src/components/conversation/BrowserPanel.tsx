import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import type { BrowserControlState, BrowserTab } from "@openbot/contracts/ipc";
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
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
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
