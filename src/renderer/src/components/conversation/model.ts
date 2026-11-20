import type {
  AgentReasoningEffort,
  AttachmentSummary,
  BrowserControlAction,
  DraftAttachment,
} from "@openbot/contracts/ipc";
import { t } from "../../i18n";

/** Types, constants and small pure helpers of the conversation view, kept apart from the component. */

export interface ComposerDraft {
  text: string;
  attachments: DraftAttachment[];
  replyToMessageId: string | null;
}

export interface MediaPreview {
  attachment: AttachmentSummary;
  text: string | null;
  loading: boolean;
  error: string | null;
}

export type RightPanelMode = "none" | "browser" | "desktop" | "settings" | "files" | "voice";

export const EMPTY_DRAFT: ComposerDraft = {
  text: "",
  attachments: [],
  replyToMessageId: null,
};
export const ONBOARDING_CHOICE_KEYS = [
  "Work & projects",
  "Research & writing",
  "Sales & outreach",
  "Something else",
] as const;
export const SETTINGS_PANEL_STORAGE_KEY = "openbot:settings-panel-width";
export const SETTINGS_PANEL_DEFAULT = 296;
export const SETTINGS_PANEL_MIN = 180;
export const SETTINGS_PANEL_MAX = 1600;
export const BROWSER_PANEL_STORAGE_KEY = "openbot:browser-panel-width";
export const BROWSER_PANEL_DEFAULT = 380;
export const BROWSER_PANEL_MIN = 220;
export const BROWSER_PANEL_MAX = 1600;
export const CONVERSATION_PANEL_MIN = 96;

export function browserActionLabel(action: BrowserControlAction): string {
  const labels: Record<BrowserControlAction, string> = {
    open: t("Opening a page…"),
    "list-tabs": t("Checking tabs…"),
    snapshot: t("Reading the page…"),
    click: t("Clicking…"),
    type: t("Typing…"),
    key: t("Using the keyboard…"),
    scroll: t("Scrolling…"),
    back: t("Going back…"),
    forward: t("Going forward…"),
    reload: t("Reloading…"),
    screenshot: t("Taking a screenshot…"),
    "close-tab": t("Closing a tab…"),
  };
  return labels[action];
}

export function reasoningLabel(effort: AgentReasoningEffort): string {
  if (effort === "xhigh") return t("Extra high");
  return t(`${effort.slice(0, 1).toUpperCase()}${effort.slice(1)}`);
}
