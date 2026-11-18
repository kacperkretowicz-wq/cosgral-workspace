import { t } from "../i18n";
import { Button, Folder, Mic, Monitor, Settings } from "./ui";
import "../styles/chat-side-panel-launcher.css";

export type ChatSidePanelTarget = "browser" | "files" | "settings" | "voice";

const ITEMS: Array<{
  id: ChatSidePanelTarget;
  label: string;
  Icon: typeof Folder;
}> = [
  { id: "browser", label: "Open Browser", Icon: Monitor },
  { id: "files", label: "Open Files", Icon: Folder },
  { id: "settings", label: "Open Agent settings", Icon: Settings },
  { id: "voice", label: "Open Voice", Icon: Mic },
];

/**
 * Right-edge openers for the chat chrome (0.71 screen 052): Browser, Files, Agent settings, Voice.
 * Shown only while no right panel is open.
 */
export function ChatSidePanelLauncher(props: {
  onOpen: (target: ChatSidePanelTarget) => void;
  voiceDisabledReason?: string;
}) {
  return (
    <nav class="chat-side-panel-launcher" aria-label={t("Chat side panels")}>
      {ITEMS.map((item) => {
        const disabled = item.id === "voice" && Boolean(props.voiceDisabledReason);
        const Icon = item.Icon;
        return (
          <Button
            type="button"
            class="chat-side-panel-launcher-item"
            aria-label={t(item.label)}
            title={disabled ? props.voiceDisabledReason : t(item.label)}
            disabled={disabled}
            onClick={() => {
              if (!disabled) props.onOpen(item.id);
            }}
          >
            <Icon size={18} stroke-width={1.5} aria-hidden="true" />
            <span>{t(item.label)}</span>
          </Button>
        );
      })}
    </nav>
  );
}

/**
 * Tab strip inside an open right panel (0.71 screens 052/059): Browser | Files | Voice | Agent settings.
 */
export function ChatRightPanelTabs(props: {
  active: ChatSidePanelTarget;
  onSelect: (target: ChatSidePanelTarget) => void;
  voiceDisabledReason?: string;
}) {
  const tabs: Array<{ id: ChatSidePanelTarget; label: string }> = [
    { id: "browser", label: "Browser" },
    { id: "files", label: "Files" },
    { id: "voice", label: "Voice" },
    { id: "settings", label: "Agent settings" },
  ];
  return (
    <nav class="chat-right-panel-tabs" aria-label={t("Panel sections")}>
      {tabs.map((tab) => {
        const disabled = tab.id === "voice" && Boolean(props.voiceDisabledReason);
        return (
          <Button
            type="button"
            class="chat-right-panel-tab"
            aria-current={props.active === tab.id ? "page" : undefined}
            aria-label={t(tab.label)}
            title={disabled ? props.voiceDisabledReason : undefined}
            disabled={disabled}
            onClick={() => {
              if (!disabled) props.onSelect(tab.id);
            }}
          >
            {t(tab.label)}
          </Button>
        );
      })}
    </nav>
  );
}
