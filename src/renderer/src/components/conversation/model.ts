import type {
  AgentEvent,
  AgentEyesState,
  AgentModelId,
  AgentModelOption,
  AgentReasoningEffort,
  AgentStatus,
  ApprovalRuleScope,
  AttachmentSummary,
  AvatarImageInput,
  BrowserControlAction,
  BrowserControlState,
  BrowserTab,
  DraftAttachment,
  QueueSnapshot,
  RemoteMacSession,
  ServerSummary,
  StopAgentEyesInput,
  TeamPresenceSnapshot,
  ThreadList,
  UpdateBotInput,
} from "@openbot/contracts/ipc";
import type { BotMessage, BotProfile } from "../../data";
import { t } from "../../i18n";
import type { PendingCard } from "../../pending-cards";
import type { AccountNotice } from "../account-usage-view";

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

/** The same for the browser side panel. */
export const BROWSER_PANEL_SIZES = {
  default: BROWSER_PANEL_DEFAULT,
  min: BROWSER_PANEL_MIN,
  max: BROWSER_PANEL_MAX,
} as const;
export const CONVERSATION_PANEL_MIN = 96;

/** Default, smallest and largest width of the settings, files and voice side panels. */
export const SETTINGS_PANEL_SIZES = {
  default: SETTINGS_PANEL_DEFAULT,
  min: SETTINGS_PANEL_MIN,
  max: SETTINGS_PANEL_MAX,
} as const;

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

/** What the conversation view needs from the app shell. */
export interface ConversationProps {
  onThreadsChanged?: (list: ThreadList) => void;
  agentStatus: AgentStatus;
  bot: BotProfile | undefined;
  bots: BotProfile[];
  modelOptions: AgentModelOption[];
  messages: BotMessage[];
  unreadCount: number;
  firstUnreadMessageId: string | null;
  loaded: boolean;
  activeTurnId: string | null | undefined;
  agentPickerOpen: boolean;
  globalOverlayOpen: boolean;
  creatingAgent: boolean;
  settingsRequest: { botId: string; nonce: number; focus?: "name" } | null;
  onboardingRequest: { botId: string; nonce: number } | null;
  messageFocusRequest: { botId: string; messageId: string; nonce: number } | null;
  queue: QueueSnapshot | undefined;
  onOpenBudget?: () => void;
  browserTabs: BrowserTab[];
  activeBrowserTabId: string | null;
  browserControlState: BrowserControlState;
  server: ServerSummary | undefined;
  presence: TeamPresenceSnapshot;
  currentUserEmail: string;
  remoteMacSession: RemoteMacSession | undefined;
  remoteDesktopRequest: number;
  prompt: Extract<AgentEvent, { type: "prompt" }> | undefined;
  approval: Extract<AgentEvent, { type: "approval" }>["approval"] | undefined;
  actionCard?: PendingCard;
  /** COSGRAL: agents that are looking at a window, screen or camera right now. */
  eyes?: AgentEyesState;
  onStopEyes?: (input: StopAgentEyesInput) => void;
  /** COSGRAL W5-K1: account limit and switch cards of this agent. */
  accountNotices?: AccountNotice[];
  onDismissAccountNotice?: (id: string) => void;
  onCloseAgentPicker: () => void;
  onCreateAgent: () => void;
  onSelectAgent: (botId: string) => void;
  onUpdateBot: (botId: string, updates: Omit<UpdateBotInput, "botId">) => Promise<void>;
  onSetAgentAvatar: (botId: string, image: AvatarImageInput | null) => Promise<void>;
  onSendMessage: (body: string, attachmentDraftIds: string[], replyToMessageId: string | null) => Promise<boolean>;
  onMarkRead: () => Promise<void>;
  onTypingChange: (botId: string, typing: boolean) => void;
  onCompleteOnboarding: (
    answer: string,
    model: AgentModelId,
    reasoningEffort: AgentReasoningEffort,
  ) => Promise<boolean>;
  onAnswerPrompt: (answers: Record<string, string[]>) => Promise<boolean>;
  onRespondToApproval: (decision: "accept" | "decline", always?: ApprovalRuleScope) => Promise<boolean>;
  onCancelQueuedMessage: (deliveryId: string) => void;
  onSteerQueuedMessage: (deliveryId: string) => void;
  onUpdateQueuedMessage: (
    deliveryId: string,
    text: string,
    keepAttachmentIds: string[],
    attachmentDraftIds: string[],
  ) => Promise<boolean>;
  onReorderQueue: (deliveryIds: string[]) => void;
  onResumeQueue: () => void;
  onActivateBrowserTab: (tabId: string) => void;
  onCloseBrowserTab: (tabId: string) => void | Promise<void>;
  onConnectRemoteMac: (hostname: string, serverId: string | null) => Promise<void>;
  onDisconnectRemoteMac: (sessionId: string) => Promise<void>;
  onOpenAgentSetup: () => Promise<void>;
  onStop: () => void;
}
