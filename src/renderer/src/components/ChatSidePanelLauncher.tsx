import { t } from "../i18n";
import { Button, Folder, Monitor, Settings } from "./ui";
import "../styles/chat-side-panel-launcher.css";

export type ChatSidePanelTarget = "browser" | "files" | "settings";

const ITEMS: Array<{
  id: ChatSidePanelTarget;
  label: string;
  Icon: typeof Folder;
}> = [
  { id: "browser", label: "Open Browser", Icon: Monitor },
  { id: "files", label: "Open Files", Icon: Folder },
  { id: "settings", label: "Open Agent settings", Icon: Settings },
];

/**
 * Openers for the chat side panels (0.71 screen 052): Browser, Files, Agent settings.
 * `floating`: the labelled column at the right edge of the chat. `header`: compact icon buttons in the conversation
 * header, like OpenBot's header icons; Browser is left out there because the header has its own browser button.
 */
export function ChatSidePanelLauncher(props: {
  onOpen: (target: ChatSidePanelTarget) => void;
  variant?: "floating" | "header";
}) {
  const header = () => props.variant === "header";
  const items = () => (header() ? ITEMS.filter((item) => item.id !== "browser") : ITEMS);
  return (
    <nav class={header() ? "chat-header-panels" : "chat-side-panel-launcher"} aria-label={t("Chat side panels")}>
      {items().map((item) => {
        const Icon = item.Icon;
        return (
          <Button
            type="button"
            unstyled={header()}
            class={header() ? "header-panel-toggle chat-header-panel" : "chat-side-panel-launcher-item"}
            aria-label={t(item.label)}
            title={t(item.label)}
            onClick={() => props.onOpen(item.id)}
          >
            <Icon size={header() ? 16 : 18} stroke-width={1.5} aria-hidden="true" />
            {header() ? null : <span>{t(item.label)}</span>}
          </Button>
        );
      })}
    </nav>
  );
}

/**
 * Tab strip inside an open right panel (0.71 screens 052/059): Browser | Files | Agent settings.
 */
export function ChatRightPanelTabs(props: {
  active: ChatSidePanelTarget;
  onSelect: (target: ChatSidePanelTarget) => void;
}) {
  const tabs: Array<{ id: ChatSidePanelTarget; label: string }> = [
    { id: "browser", label: "Browser" },
    { id: "files", label: "Files" },
    { id: "settings", label: "Agent settings" },
  ];
  return (
    <nav class="chat-right-panel-tabs" aria-label={t("Panel sections")}>
      {tabs.map((tab) => (
        <Button
          type="button"
          class="chat-right-panel-tab"
          aria-current={props.active === tab.id ? "page" : undefined}
          aria-label={t(tab.label)}
          onClick={() => props.onSelect(tab.id)}
        >
          {t(tab.label)}
        </Button>
      ))}
    </nav>
  );
}
