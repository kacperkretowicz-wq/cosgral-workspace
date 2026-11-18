import { type AccessChanged, type AccessDenied, isAccessChanged, isAccessDenied } from "./ipc-access";
import { type AcpLoginChanged, isAcpLoginChanged } from "./ipc-acp-login";
import {
  type BrowserTakeoverPhase,
  type BrowserTakeoverRequest,
  type DraftPreviewCard,
  type DraftPreviewResolution,
  isBrowserTakeoverPhase,
  isBrowserTakeoverRequest,
  isDraftPreviewCard,
  isDraftPreviewResolution,
  isKeptDraft,
  type KeptDraft,
} from "./ipc-action-cards";
import { type AgentPreferencesChanged, isAgentPreferencesChanged } from "./ipc-agent-cards";
import { type AgentTemplate, type AppSettings, isAgentTemplate, isAppSettings } from "./ipc-agent-settings";
import { type ApprovalRule, type ApprovalRuleScope, isApprovalRuleList } from "./ipc-approval-rules";
import {
  type AgentActivity,
  type ApprovalResolution,
  isAgentActivity,
  isApprovalResolution,
  isPromptResolution,
  isRequestId,
  type PromptResolution,
} from "./ipc-attention";
import type { BrowserControlState, BrowserTab } from "./ipc-browser";
import { type BrowserProfilesChanged, isBrowserProfilesChanged } from "./ipc-browser-profiles";
import { type BudgetsChanged, isBudgetsChanged } from "./ipc-budgets";
import { type ChannelRoutinesChanged, isChannelRoutinesChanged } from "./ipc-channel-routines";
import { isSideQuestionChanged, type SideQuestionChanged } from "./ipc-composer";
import { type ComputerUseState, isComputerUseState } from "./ipc-computer-use";
import { type ContextChanged, type ContextSettingsChanged, isContextSettings, isContextState } from "./ipc-context";
import {
  type DockState,
  type IslandRequestRef,
  type IslandState,
  isDockState,
  isIslandRequestRef,
  isIslandState,
} from "./ipc-dock";
import { type EndpointModelId, isEndpointModel, isModelEndpointList, type ModelEndpoint } from "./ipc-endpoints";
import type { AgentEyesRequest, AgentEyesState } from "./ipc-eyes";
import { isUpdatePreferencesChanged, type UpdatePreferencesChanged } from "./ipc-instance-transfer";
import { type IntegrationsChanged, isIntegrationsChanged } from "./ipc-integrations";
import { type IsolationChanged, isIsolationChanged } from "./ipc-isolation";
import { isMarketplaceItem, type MarketplaceItem } from "./ipc-marketplace";
import { type AgentMcpServerSetting, isAgentMcpServerSetting, isMcpServer, type McpServer } from "./ipc-mcp";
import { isMcpOAuthChanged, type McpOAuthChanged } from "./ipc-mcp-oauth";
import { type AgentMemory, isAgentMemory } from "./ipc-memory";
import { isMessagePinsChanged, type MessagePinsChanged } from "./ipc-message-actions";
import { isMessengersChanged, type MessengersChanged } from "./ipc-messengers";
import { isMobileDevice, isMobileState, type MobileDevice, type MobileState } from "./ipc-mobile";
import { isPhoneAccessChanged, type PhoneAccessChanged } from "./ipc-phone-access";
import { isPlanChanged, type PlanChanged } from "./ipc-plan";
import { isPluginCatalogChanged, type PluginCatalogChanged } from "./ipc-plugin-catalog";
import { isProviderCatalogChanged, type ProviderCatalogChanged } from "./ipc-provider-catalog";
import { type AcpAgentConfig, isAcpAgentConfig, isProviderUsage, type ProviderUsage } from "./ipc-providers";
import type { QueueHoldKind } from "./ipc-queue-holds";
import {
  isRemoteDesktopClientState,
  isRemoteDesktopHostState,
  type RemoteDesktopClientState,
  type RemoteDesktopHostState,
} from "./ipc-remote-desktop";
import { isRoutine, isRoutineRun, type Routine, type RoutineRun } from "./ipc-routines";
import { isServerSettingsChanged, type ServerSettingsChanged } from "./ipc-server-settings";
import { isSidebarLayout, type SidebarLayout } from "./ipc-sidebar";
import { isLocalSkill, isSkillInstall, type LocalSkill, type SkillInstall } from "./ipc-skills";
import { isSpacesChanged, type SpacesChanged } from "./ipc-spaces";
import { isSubagentChanged, type SubagentChanged } from "./ipc-subagents";
import {
  type AccountError,
  type AccountLimitReached,
  type AccountSwitched,
  type AccountsSnapshot,
  isAccountError,
  isAccountLimitReached,
  isAccountSwitched,
  isAccountsSnapshot,
  isManagedCliState,
  type ManagedCliState,
} from "./ipc-subscriptions";
import { isSharedTable, type SharedTable } from "./ipc-tables";
import { isThreadTabsChanged, type ThreadTabsChanged } from "./ipc-thread-tabs";
import { isThreadDeletesChanged, type ThreadDeletesChanged } from "./ipc-thread-undo";
import { isThreadActivity, isThreadsChanged, type ThreadActivity, type ThreadsChanged } from "./ipc-threads";
import {
  isVaultItemSummary,
  isVaultRequest,
  isVaultRequestResolution,
  type VaultItemSummary,
  type VaultRequest,
  type VaultRequestResolution,
} from "./ipc-vault";
import { isVaultConnectorsChanged, type VaultConnectorsChanged } from "./ipc-vault-connectors";
import { isVoiceState, type VoiceState } from "./ipc-voice";
import { type ConversationWindowsChanged, isConversationWindowsChanged } from "./ipc-windows";
import { isWorkflow, isWorkflowRun, type Workflow, type WorkflowRun } from "./ipc-workflows";
import {
  type ChannelMemory,
  type ChannelMessage,
  type ChannelTask,
  isChannelMemory,
  isChannelMessage,
  isChannelTask,
  isWorkspaceChannel,
  type WorkspaceChannel,
} from "./ipc-workspace-channels";
import { isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export type AgentPhase = "idle" | "starting" | "ready" | "restarting" | "blocked" | "stopped";

export type CapabilityState = "ready" | "setup-required" | "unavailable";

/** COSGRAL W3: "acp" = any Agent Client Protocol agent over stdio (see ipc-providers.ts). */
export type AgentProviderId = "codex" | "claude" | "acp" | "endpoint";
export type AgentProviderState =
  | "not-started"
  | "checking"
  | "available"
  | "sign-in-required"
  | "not-installed"
  | "outdated"
  | "error";

export interface AgentProviderStatus {
  id: AgentProviderId;
  state: AgentProviderState;
  version: string | null;
  message: string | null;
  email?: string | null;
}

export type AgentAuthState =
  | { kind: "unknown" }
  | { kind: "signed-out" }
  | { kind: "unsupported"; accountType: string }
  | { kind: "chatgpt"; email: string | null }
  | { kind: "claude"; email: string | null };

export interface AccountUsageWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}

export interface AccountUsageLimit {
  id: string;
  primary: AccountUsageWindow | null;
  secondary: AccountUsageWindow | null;
}

export interface AccountUsage {
  limits: AccountUsageLimit[];
}

export interface AgentStatus {
  phase: AgentPhase;
  cliVersion: string | null;
  auth: AgentAuthState;
  providers?: AgentProviderStatus[];
  capabilities: {
    chat: CapabilityState;
    browser: CapabilityState;
    computerUse: CapabilityState;
  };
  message: string | null;
  fullAccess: true;
}

export interface BotSummary {
  id: string;
  name: string;
  role: string;
  description: string;
  notifications: boolean;
  model: AgentModelId;
  reasoningEffort: AgentReasoningEffort;
  threadId: string | null;
  workspacePath: string;
  preview: string;
  updatedAt: string | null;
  avatarSeed: string;
  avatarHue: BotAvatarHue | null;
  avatarUrl: string | null;
  /** COSGRAL W3: set while turns run on a fallback model instead of `model` (see ipc-providers.ts). */
  activeModel?: AgentModelId;
  /** COSGRAL W4-K3: the person hid the agent from the sidebar. It keeps working. Missing means visible. */
  hidden?: boolean;
}

export const AGENT_MODELS = [
  "gpt-5.6-luna",
  "gpt-5.6-terra",
  "gpt-5.6-sol",
  "claude-fable-5",
  "claude-opus-5",
  "claude-sonnet-5",
] as const;
/** COSGRAL W3: an ACP agent added by the person, as one model: "acp:<id>". */
export type AcpModelId = `acp:${string}`;
export type AgentModelId = (typeof AGENT_MODELS)[number] | AcpModelId | EndpointModelId;

export const AGENT_REASONING_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type AgentReasoningEffort = (typeof AGENT_REASONING_EFFORTS)[number];

export interface AgentModelOption {
  id: AgentModelId;
  name: string;
  description: string;
  defaultReasoningEffort: AgentReasoningEffort;
  supportedReasoningEfforts: AgentReasoningEffort[];
}

/**
 * Avatar colour wheel: 17 hues. The first ten values (0, 30, 55, 100, 150, 185, 215, 245, 280, 320) are the original
 * set and stay valid, so stored agents and templates keep working; the other seven only fill the gaps.
 */
export const BOT_AVATAR_HUES = [0, 18, 30, 45, 55, 80, 100, 125, 150, 168, 185, 215, 245, 265, 280, 300, 320] as const;
export type BotAvatarHue = (typeof BOT_AVATAR_HUES)[number];

export function isAgentModel(value: unknown): value is AgentModelId {
  return isOneOf(AGENT_MODELS, value) || isAcpModel(value) || isEndpointModel(value);
}

/** COSGRAL W3: the model id of an ACP agent. */
export function isAcpModel(value: unknown): value is AcpModelId {
  return isString(value) && /^acp:[a-z][a-z0-9-]{0,39}$/.test(value);
}

export function isClaudeModel(model: AgentModelId): boolean {
  return model.startsWith("claude-");
}

export function isReasoningEffort(value: unknown): value is AgentReasoningEffort {
  return isOneOf(AGENT_REASONING_EFFORTS, value);
}

export function isAvatarSeed(value: unknown): value is string {
  return isString(value) && /^[a-z0-9:-]{1,128}$/.test(value);
}

export function isAvatarHue(value: unknown): value is BotAvatarHue {
  return isOneOf(BOT_AVATAR_HUES, value);
}

/** Tolerant parser: any finite number (or numeric string) snaps to the nearest hue on the wheel; anything else is null. */
export function normalizeAvatarHue(value: unknown): BotAvatarHue | null {
  const number = isString(value) && value.trim() !== "" ? Number(value) : value;
  if (!isNumber(number) || !Number.isFinite(number)) return null;
  const wrapped = ((number % 360) + 360) % 360;
  let best: BotAvatarHue = BOT_AVATAR_HUES[0];
  let bestDistance = 361;
  for (const hue of BOT_AVATAR_HUES) {
    const raw = Math.abs(hue - wrapped);
    const distance = Math.min(raw, 360 - raw);
    if (distance < bestDistance) {
      best = hue;
      bestDistance = distance;
    }
  }
  return best;
}

export interface UpdateBotInput {
  botId: string;
  name?: string;
  role?: string;
  description?: string;
  notifications?: boolean;
  model?: AgentModelId;
  reasoningEffort?: AgentReasoningEffort;
  avatarSeed?: string;
  avatarHue?: BotAvatarHue | null;
}

export interface AvatarImageInput {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  bytes: Uint8Array;
}

export interface SetAgentAvatarInput {
  botId: string;
  image: AvatarImageInput | null;
}

/** COSGRAL W4-K3: omitted or `includeHidden: true` = every agent (hidden ones carry `hidden: true`); `false` = only visible. */
export interface ListBotsInput {
  includeHidden?: boolean;
}

/** COSGRAL W4-K3: hide an agent from the sidebar (it keeps working) or show it again. */
export interface SetBotHiddenInput {
  botId: string;
  hidden: boolean;
}

export type ConversationMessageAuthor = "user" | "assistant" | "agent" | "system";

export const IMAGE_GENERATION_ASPECT_RATIOS = ["square", "portrait", "landscape"] as const;
export type ImageGenerationAspectRatio = (typeof IMAGE_GENERATION_ASPECT_RATIOS)[number];

export interface ImageGenerationInfo {
  prompt?: string;
  resolution: string;
  aspectRatio: ImageGenerationAspectRatio;
  error?: string;
}

export function isImageGenerationAspectRatio(value: unknown): value is ImageGenerationAspectRatio {
  return isOneOf(IMAGE_GENERATION_ASPECT_RATIOS, value);
}

export function isImageGenerationInfo(value: unknown): value is ImageGenerationInfo {
  return (
    isDynamicRecord(value) &&
    (value.prompt === undefined || isString(value.prompt)) &&
    isString(value.resolution) &&
    isImageGenerationAspectRatio(value.aspectRatio) &&
    (value.error === undefined || isString(value.error))
  );
}

export type AttachmentKind = "image" | "file";
export type AttachmentPreviewKind = "image" | "pdf" | "text" | "none";

export interface AttachmentSummary {
  id: string;
  name: string;
  size: number;
  kind: AttachmentKind;
  mimeType: string;
  previewKind: AttachmentPreviewKind;
  previewUrl: string | null;
}

export type DraftAttachment = AttachmentSummary;

export interface AttachmentDataInput {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface ImportAttachmentsInput {
  paths: string[];
  data: AttachmentDataInput[];
}

export type AttachmentImportEvent =
  | { type: "started"; requestId: string }
  | { type: "completed"; requestId: string; attachments: DraftAttachment[] }
  | { type: "error"; requestId: string; message: string };

export interface OpenAttachmentInput {
  attachmentId: string;
  action: "open" | "reveal" | "download";
}

export type QueueDeliveryStatus =
  | "queued"
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "interrupted"
  | "cancelled";

export interface QueueDelivery {
  id: string;
  messageId: string;
  recipientBotId: string;
  /** COSGRAL W6-BE1: the thread of the agent this message belongs to; missing for a message from before threads. */
  threadId?: string;
  sender: { kind: "user" } | { kind: "bot"; botId: string };
  text: string;
  attachments: AttachmentSummary[];
  replyToMessageId: string | null;
  status: QueueDeliveryStatus;
  position: number | null;
  turnId: string | null;
  error: string | null;
  createdAt: string;
}

/** COSGRAL W3: whether a queued message can be steered into the running turn on this agent's provider. */
export interface QueueSteerSupport {
  available: boolean;
  /** Why not, in a short sentence (null when available). */
  reason: string | null;
}

export interface QueueSnapshot {
  botId: string;
  paused: boolean;
  deliveries: QueueDelivery[];
  /** COSGRAL W3: set by the program; absent in snapshots from older servers (treat as available). */
  steer?: QueueSteerSupport;
  /** COSGRAL W8-BE2 / W12: the queue waits before a new turn; one plain sentence for the person (null/absent: not held). */
  heldReason?: string | null;
  /** COSGRAL W12 (BE-N): which hold `heldReason` is (see ipc-queue-holds.ts); null/absent: not held (older servers send none). */
  heldKind?: QueueHoldKind | null;
}

export interface ConversationMessage {
  id: string;
  turnId?: string;
  author: ConversationMessageAuthor;
  text: string;
  createdAt: string;
  status: "streaming" | "completed" | "failed" | "interrupted";
  itemType?: string;
  source?: "user" | "assistant" | "agent" | "system";
  senderBotId?: string;
  replyToMessageId?: string | null;
  attachments?: AttachmentSummary[];
  imageGeneration?: ImageGenerationInfo;
  delivery?: Pick<QueueDelivery, "id" | "status" | "position">;
  exchange?: AgentExchangeSummary;
  reaction?: MessageReaction | null;
  /** COSGRAL W6-BE3: the person pinned this message (it survives a restart). */
  pinned?: boolean;
  /** COSGRAL W6-BE3: the person edited this message and sent it again (the later conversation was removed). */
  edited?: boolean;
  /**
   * COSGRAL W6-BE3 (retry): this message asks for, or is part of, a new answer to the message `ofMessageId`. The old
   * answer is still in the conversation. The request row is quiet (the same text again); the answer is marked.
   */
  regeneration?: { ofMessageId: string };
}

export const MESSAGE_REACTIONS = ["👍", "👎", "❤️", "😂", "🎉", "😮"] as const;
export const MORE_MESSAGE_REACTIONS = ["🔥", "👏", "🙏", "🤔", "👀", "✅", "🚀", "💯"] as const;
export const ALL_MESSAGE_REACTIONS = [...MESSAGE_REACTIONS, ...MORE_MESSAGE_REACTIONS] as const;
export type MessageReaction = (typeof MESSAGE_REACTIONS)[number] | (typeof MORE_MESSAGE_REACTIONS)[number];

export function isMessageReaction(value: unknown): value is MessageReaction {
  return isOneOf(ALL_MESSAGE_REACTIONS, value);
}

export interface AgentExchangeSummary {
  direction: "incoming" | "outgoing";
  messageId: string;
  senderBotId: string;
  recipientBotIds: string[];
  replyToMessageId: string | null;
  deliveries: Array<Pick<QueueDelivery, "id" | "recipientBotId" | "status" | "position" | "error">>;
}

export interface ConversationSnapshot {
  botId: string;
  threadId: string | null;
  activeTurnId: string | null;
  revision: number;
  messages: ConversationMessage[];
}

export interface ConversationReadState {
  unreadCount: number;
  firstUnreadMessageId: string | null;
  throughMessageId: string | null;
}

export interface ConversationWithReadState extends ConversationSnapshot {
  readState?: ConversationReadState;
}

export interface MarkConversationReadInput {
  botId: string;
  throughMessageId: string | null;
}

export interface SendMessageInput {
  botId: string;
  text: string;
  attachmentDraftIds?: string[];
  replyToMessageId?: string | null;
}

export interface SetMessageReactionInput {
  botId: string;
  messageId: string;
  emoji: MessageReaction | null;
}

export interface QueuedMessageReceipt {
  messageId: string;
  deliveries: Array<{
    id: string;
    recipientBotId: string;
    status: QueueDeliveryStatus;
    position: number | null;
  }>;
}

export interface CancelQueuedMessageInput {
  botId: string;
  deliveryId: string;
}

export interface SetQueuePausedInput {
  botId: string;
  paused: boolean;
}

export interface SteerQueuedMessageInput {
  botId: string;
  deliveryId: string;
  expectedTurnId: string;
}

export interface UpdateQueuedMessageInput {
  botId: string;
  deliveryId: string;
  text: string;
  keepAttachmentIds: string[];
  attachmentDraftIds: string[];
}

export interface ReorderQueueInput {
  botId: string;
  deliveryIds: string[];
}

export interface InterruptTurnInput {
  botId: string;
  turnId: string;
}

export interface AgentPromptQuestion {
  id: string;
  header: string;
  question: string;
  isSecret: boolean;
  options: Array<{ label: string; description: string }> | null;
}

export interface RespondToPromptInput {
  requestId: string | number;
  answers: Record<string, string[]>;
}

/** COSGRAL: "screen" (windows and screens, once per conversation) and "camera" (every photo) are agent eyes. */
export type AgentApprovalKind = "command" | "file-change" | "permissions" | "screen" | "camera";

export interface AgentApprovalPermissions {
  fileSystem: {
    read: string[];
    write: string[];
  };
  network: boolean;
}

export interface AgentApproval {
  requestId: string | number;
  botId: string;
  threadId: string;
  turnId: string;
  kind: AgentApprovalKind;
  command: string | null;
  cwd: string | null;
  reason: string | null;
  grantRoot: string | null;
  permissions: AgentApprovalPermissions | null;
  /** COSGRAL: set for the "screen" and "camera" kinds. */
  eyes?: AgentEyesRequest | null;
}

export interface RespondToApprovalInput {
  requestId: string | number;
  decision: "accept" | "decline";
  /**
   * COSGRAL W3-KK3: with "accept", also save an "always" rule for this agent and this kind of request (see
   * ipc-approval-rules.ts). Only the window of this computer sends it; the phone and remote servers never do.
   */
  always?: ApprovalRuleScope;
}

export type AgentEvent =
  | { type: "status"; status: AgentStatus }
  | { type: "usage-changed"; usage: AccountUsage }
  | { type: "bots-changed"; bots: BotSummary[] }
  | { type: "conversation"; snapshot: ConversationSnapshot }
  | {
      type: "conversation-delta";
      botId: string;
      threadId: string;
      turnId: string;
      messageId: string;
      delta: string;
      createdAt: string;
      revision: number;
    }
  | { type: "queue-changed"; snapshot: QueueSnapshot }
  | { type: "turn-started"; botId: string; threadId: string; turnId: string }
  | {
      type: "turn-completed";
      botId: string;
      threadId: string;
      turnId: string;
      status: string;
    }
  | {
      type: "prompt";
      requestId: string | number;
      botId: string;
      threadId: string;
      turnId: string;
      questions: AgentPromptQuestion[];
    }
  | { type: "approval"; approval: AgentApproval }
  | { type: "browser-changed"; tabs: BrowserTab[]; activeTabId: string | null }
  | { type: "browser-control-changed"; state: BrowserControlState }
  /** COSGRAL: agent eyes sessions and approvals changed. */
  | { type: "eyes-changed"; state: AgentEyesState }
  /** COSGRAL W1: a question card ended; drop it in every window. */
  | { type: "prompt-resolved"; requestId: string | number; botId: string; resolution: PromptResolution }
  /** COSGRAL W1: an approval card ended; drop it in every window. */
  | { type: "approval-resolved"; requestId: string | number; botId: string; resolution: ApprovalResolution }
  /** COSGRAL W1: the agent row state changed (waiting, working, limited, error, idle). */
  | { type: "activity-changed"; activity: AgentActivity }
  /** COSGRAL W1: folders or item placements changed. */
  | { type: "sidebar-layout-changed"; layout: SidebarLayout }
  /** COSGRAL W1 (engine in W1-BE2): the channel list changed. */
  | { type: "channels-changed"; channels: WorkspaceChannel[] }
  /** COSGRAL W1 (engine in W1-BE2): one channel task was created or changed. */
  | { type: "task-changed"; task: ChannelTask }
  | { type: "channel-message"; message: ChannelMessage }
  | { type: "channel-message-changed"; message: ChannelMessage }
  /** COSGRAL W1: an agent shows a draft before sending it in the user's name. */
  | { type: "draft-preview"; card: DraftPreviewCard }
  | { type: "draft-preview-resolved"; requestId: string; botId: string; resolution: DraftPreviewResolution }
  /** COSGRAL W1-BE3: the kept drafts of every agent, newest first; replace the whole list. */
  | { type: "drafts-changed"; drafts: KeptDraft[] }
  /** COSGRAL W2: the skill library changed (new skill, new version, rollback, deletion); replace the list. */
  | { type: "skills-changed"; skills: LocalSkill[] }
  /** COSGRAL W2: installed skills of the agents changed; replace the list. */
  | { type: "skill-installs-changed"; installs: SkillInstall[] }
  /** COSGRAL W2: Vault items changed; summaries only, never a secret value. Replace the list. */
  | { type: "vault-changed"; items: VaultItemSummary[] }
  /** COSGRAL W2: an agent needs a Vault item (add or choose); a Needs you card. */
  | { type: "vault-request"; request: VaultRequest }
  | { type: "vault-request-resolved"; requestId: string; botId: string; resolution: VaultRequestResolution }
  /** COSGRAL W2: a shared table was created, deleted or got other rows; replace the whole list. */
  | { type: "tables-changed"; tables: SharedTable[] }
  /** COSGRAL W2: rows of one table were added, changed or deleted; read them again. */
  | { type: "table-rows-changed"; tableId: string; rowIds: string[] }
  /** COSGRAL W2: files of the library or chat attachments were added or deleted; read the list again. */
  | { type: "library-changed"; fileIds: string[] }
  /** COSGRAL W3: who controls the computer and which conversations may; replace the whole state. */
  | { type: "computer-use-changed"; state: ComputerUseState }
  /** COSGRAL W3: the dock changed (pins, order, size, visibility, open chat); replace the whole state. */
  | { type: "dock-changed"; state: DockState }
  /** COSGRAL W3: the Dynamic Island shows another state; replace the whole state. */
  | { type: "island-changed"; state: IslandState }
  /** COSGRAL W3: the island was clicked; the main window opens this agent and its Needs you card. */
  | { type: "island-open-request"; botId: string; request: IslandRequestRef | null }
  /** COSGRAL W3: this computer as a remote desktop host changed (sharing, token, viewers, consent); replace the state. */
  | { type: "remote-desktop-host-changed"; state: RemoteDesktopHostState }
  /** COSGRAL W3: this computer as a remote desktop viewer changed (connection phase, picture size); replace the state. */
  | { type: "remote-desktop-client-changed"; state: RemoteDesktopClientState }
  /** COSGRAL W3: an agent's tool switches changed; read its settings again (profile changes come as bots-changed). */
  | { type: "agent-settings-changed"; botId: string }
  /** COSGRAL W3: saved agent templates changed; replace the whole list. */
  | { type: "agent-templates-changed"; templates: AgentTemplate[] }
  /** COSGRAL W3: language, notification matrix or settings tabs changed. */
  | { type: "app-settings-changed"; settings: AppSettings }
  /** COSGRAL W1: an agent asks the user to take over a browser tab. */
  | { type: "browser-takeover"; request: BrowserTakeoverRequest }
  | { type: "browser-takeover-changed"; requestId: string; botId: string; phase: BrowserTakeoverPhase }
  /** COSGRAL W2: an agent's saved memories changed. */
  | { type: "agent-memory-changed"; botId: string; action: "saved" | "deleted"; memory: AgentMemory }
  /** COSGRAL W2: a channel's shared memories changed (an agent or a person saved, edited or deleted one). */
  | { type: "channel-memory-changed"; channelId: string; action: "saved" | "deleted"; memory: ChannelMemory }
  /** COSGRAL W2: the MCP server list, a status or a tool list changed; replace the whole list. */
  | { type: "mcp-servers-changed"; servers: McpServer[] }
  /** COSGRAL W2: one agent's MCP switches changed; replace that agent's settings. */
  | { type: "agent-mcp-changed"; botId: string; settings: AgentMcpServerSetting[] }
  /** COSGRAL W2: the routine list changed (created, edited, paused, next run moved); replace the list. */
  | { type: "routines-changed"; routines: Routine[] }
  /** COSGRAL W3: a provider hit or left a usage limit, or became unavailable; replace the list. */
  | { type: "provider-usage-changed"; usage: ProviderUsage[] }
  /** COSGRAL W3: a turn moved to a fallback model (toModel), or back to the agent's own model (toModel = model). */
  | { type: "model-fallback"; botId: string; fromModel: AgentModelId; toModel: AgentModelId; reason: string }
  /** COSGRAL W3: the ACP agents of the program changed; replace the list. */
  | { type: "acp-agents-changed"; agents: AcpAgentConfig[] }
  /** COSGRAL W2: a routine run started, finished, or was skipped or ignored. */
  | { type: "routine-run"; run: RoutineRun }
  /** COSGRAL W3: the workflow list changed (saved, edited, paused, a run started or ended); replace the list. */
  | { type: "workflows-changed"; workflows: Workflow[] }
  /** COSGRAL W3: a workflow run started or changed (a step finished, an approval opened or was decided). */
  | { type: "workflow-run-changed"; run: WorkflowRun }
  /** COSGRAL W3: the Marketplace catalog or an install state changed; replace the whole list. */
  | { type: "marketplace-changed"; items: MarketplaceItem[] }
  /** COSGRAL W3: voice state changed (speaking, a download's progress, a model, the settings); replace it. */
  | { type: "voice-changed"; state: VoiceState }
  /** COSGRAL W3: Mobile Connect changed (server, pairing, devices); replace the whole state. */
  | { type: "mobile-changed"; state: MobileState }
  /** COSGRAL W3: a phone was paired after the person approved it. */
  | { type: "mobile-pairing-completed"; device: MobileDevice }
  /** COSGRAL W3-KK3: the "always allow" rules changed (made, used, revoked); replace the whole list. */
  | { type: "approval-rules-changed"; rules: ApprovalRule[] }
  /** COSGRAL W5-BE1: a managed CLI changed (check, download progress, install, remove, settings). */
  | { type: "managed-cli-changed"; state: ManagedCliState }
  | ({ type: "accounts-changed" } & AccountsSnapshot)
  /** COSGRAL W5-K2: the own model endpoints changed (saved, removed, models fetched); replace the list and reload the models. */
  | { type: "endpoints-changed"; endpoints: ModelEndpoint[] }
  /** COSGRAL W5-K1: a turn runs on another account than the agent's previous turn (limit moved it, or it is back). */
  | ({ type: "account-switched" } & AccountSwitched)
  /** COSGRAL W5-K1: an account hit its usage limit during a turn (see AccountLimitOutcome). */
  | ({ type: "account-limit-reached" } & AccountLimitReached)
  /** COSGRAL W5-BE8: a turn on an account failed on the network, not on a limit; nothing switched (see AccountError). */
  | ({ type: "account-error" } & AccountError)
  /** COSGRAL W6-BE2: the context state of one thread changed (a report, a compaction, history cleared). */
  | ({ type: "context-changed" } & ContextChanged)
  /** COSGRAL W6-BE2: the context settings (auto-compaction, threshold) changed. */
  | ({ type: "context-settings-changed" } & ContextSettingsChanged)
  /** COSGRAL W6-KK3: the list of open separate conversation windows changed. */
  | ({ type: "conversation-windows-changed" } & ConversationWindowsChanged)
  /** COSGRAL W8-KK1: the client spaces changed (created, renamed, archived, deleted, a switch chosen). */
  | ({ type: "spaces-changed" } & SpacesChanged)
  /** COSGRAL W8-KK2: a budget was set or cleared, or usage was counted (the whole overview). */
  | ({ type: "budgets-changed" } & BudgetsChanged)
  /** COSGRAL W8-KK3: a browser profile was made, its domain lists changed or its sessions were cleared (the whole list). */
  | ({ type: "browser-profiles-changed" } & BrowserProfilesChanged)
  /** COSGRAL W10-KK1: a sign-in of an app started, ended, failed or was removed (the whole list). */
  | ({ type: "integrations-changed" } & IntegrationsChanged)
  /** COSGRAL W9-BE1: the reach of the phone, the push switch or a phone's PIN or subscription changed (the whole state). */
  | ({ type: "phone-access-changed" } & PhoneAccessChanged)
  /** COSGRAL W11 (U4): a side question started, grew, ended, failed or was cancelled (its whole state). */
  | ({ type: "side-question-changed" } & SideQuestionChanged)
  /** COSGRAL W11 (BE-B): the small per-agent choices of one agent changed (the whole preferences). */
  | ({ type: "agent-preferences-changed" } & AgentPreferencesChanged)
  /** COSGRAL W12 (BE-E): a provider key or ACP agent changed (the whole catalog list). */
  | ({ type: "provider-catalog-changed" } & ProviderCatalogChanged)
  /** COSGRAL W12 (BE-D): the settings of the server changed (the whole settings). */
  | ({ type: "server-settings-changed" } & ServerSettingsChanged)
  /** COSGRAL W11 (U6): the strip of thread tabs of one agent changed. */
  | ({ type: "thread-tabs-changed" } & ThreadTabsChanged)
  /** COSGRAL W10-KK2: the messenger bridge changed (connected, failed, allow list, a chat wrote that is not allowed) (the whole list). */
  | ({ type: "messengers-changed" } & MessengersChanged)
  /** COSGRAL W11-KK (d): a Vault connector changed (connecting, connected, failed, login count) (the whole list). */
  | ({ type: "vault-connectors-changed" } & VaultConnectorsChanged)
  /** COSGRAL W11-KK (e): the plugin catalog or an install state changed (the info and the installed plugins). */
  | ({ type: "plugin-catalog-changed" } & PluginCatalogChanged)
  /** COSGRAL W12-KK (1): the sign-in (OAuth) of an MCP server changed (waiting for the browser, signed in, failed) (every status). */
  | ({ type: "mcp-oauth-changed" } & McpOAuthChanged)
  /** COSGRAL W12-KK (g2): the preferences of program updates changed. */
  | ({ type: "update-preferences-changed" } & UpdatePreferencesChanged)
  /** COSGRAL W6-BE1: the threads of an agent changed (created, renamed, archived, restored, deleted, switched). */
  | ({ type: "threads-changed" } & ThreadsChanged)
  /** COSGRAL W6-BE1: a light update of one thread (turn started or ended, new message, card opened or closed). */
  | ({ type: "thread-activity" } & ThreadActivity)
  /** COSGRAL W12 (BE-K): the deleted threads of an agent that can still be brought back changed. */
  | ({ type: "thread-deletes-changed" } & ThreadDeletesChanged)
  /** COSGRAL W12 (BE-R): the routines of a channel changed. */
  | ({ type: "channel-routines-changed" } & ChannelRoutinesChanged)
  /** COSGRAL W6-BE3: a plan was proposed, decided, advanced, stopped or finished (replace the plan with this requestId). */
  | ({ type: "plan-changed" } & PlanChanged)
  /** COSGRAL W6-BE3: the pins of one thread changed. */
  | ({ type: "message-pins-changed" } & MessagePinsChanged)
  /** COSGRAL W6-BE4: a subagent started, wrote, waited, ended or was stopped (replace the subagent with this id). */
  | ({ type: "subagent-changed" } & SubagentChanged)
  /** COSGRAL W6-BE5: the sign-in state of an ACP agent changed (replace the state of this agent). */
  | ({ type: "acp-login-changed" } & AcpLoginChanged)
  /** COSGRAL W8-BE1: the access level, folders or raise of an agent changed (replace the access of this agent). */
  | ({ type: "access-changed" } & AccessChanged)
  /** COSGRAL W8-BE1: the program refused something an agent asked for (outside its folders, or an excluded folder). */
  | ({ type: "access-denied" } & AccessDenied)
  /** COSGRAL W8-BE2: what isolation of the processes this computer can do changed, or an agent's isolation did (replace the whole picture). */
  | ({ type: "isolation-changed" } & IsolationChanged)
  | { type: "error"; botId?: string; code: string; message: string };

export function isAgentEvent(value: unknown): value is AgentEvent {
  if (!isDynamicRecord(value) || !isString(value.type)) return false;
  switch (value.type) {
    case "status":
      return isDynamicRecord(value.status);
    case "usage-changed":
      return isDynamicRecord(value.usage);
    case "bots-changed":
      return Array.isArray(value.bots);
    case "conversation":
      return isDynamicRecord(value.snapshot);
    case "conversation-delta":
      return (
        isString(value.botId) &&
        isString(value.threadId) &&
        isString(value.turnId) &&
        isString(value.messageId) &&
        isString(value.delta) &&
        isString(value.createdAt) &&
        isNumber(value.revision)
      );
    case "queue-changed":
      return isDynamicRecord(value.snapshot);
    case "turn-started":
    case "turn-completed":
      return isString(value.botId) && isString(value.threadId) && isString(value.turnId);
    case "prompt":
      return (
        (isString(value.requestId) || isNumber(value.requestId)) &&
        isString(value.botId) &&
        isString(value.threadId) &&
        isString(value.turnId) &&
        Array.isArray(value.questions)
      );
    case "approval":
      return isDynamicRecord(value.approval);
    case "browser-changed":
      return Array.isArray(value.tabs) && (value.activeTabId === null || isString(value.activeTabId));
    case "browser-control-changed":
      return isDynamicRecord(value.state);
    case "eyes-changed":
      return isDynamicRecord(value.state) && Array.isArray(value.state.sessions) && Array.isArray(value.state.grants);
    case "prompt-resolved":
      return isRequestId(value.requestId) && isString(value.botId) && isPromptResolution(value.resolution);
    case "approval-resolved":
      return isRequestId(value.requestId) && isString(value.botId) && isApprovalResolution(value.resolution);
    case "activity-changed":
      return isAgentActivity(value.activity);
    case "sidebar-layout-changed":
      return isSidebarLayout(value.layout);
    case "channels-changed":
      return Array.isArray(value.channels) && value.channels.every(isWorkspaceChannel);
    case "task-changed":
      return isChannelTask(value.task);
    case "channel-message":
    case "channel-message-changed":
      return isChannelMessage(value.message);
    case "draft-preview":
      return isDraftPreviewCard(value.card);
    case "draft-preview-resolved":
      return isString(value.requestId) && isString(value.botId) && isDraftPreviewResolution(value.resolution);
    case "drafts-changed":
      return Array.isArray(value.drafts) && value.drafts.every(isKeptDraft);
    case "skills-changed":
      return Array.isArray(value.skills) && value.skills.every(isLocalSkill);
    case "skill-installs-changed":
      return Array.isArray(value.installs) && value.installs.every(isSkillInstall);
    case "vault-changed":
      return Array.isArray(value.items) && value.items.every(isVaultItemSummary);
    case "vault-request":
      return isVaultRequest(value.request);
    case "vault-request-resolved":
      return isString(value.requestId) && isString(value.botId) && isVaultRequestResolution(value.resolution);
    case "tables-changed":
      return Array.isArray(value.tables) && value.tables.every(isSharedTable);
    case "table-rows-changed":
      return isString(value.tableId) && Array.isArray(value.rowIds) && value.rowIds.every(isString);
    case "library-changed":
      return Array.isArray(value.fileIds) && value.fileIds.every(isString);
    case "computer-use-changed":
      return isComputerUseState(value.state);
    case "dock-changed":
      return isDockState(value.state);
    case "island-changed":
      return isIslandState(value.state);
    case "island-open-request":
      return isString(value.botId) && (value.request === null || isIslandRequestRef(value.request));
    case "remote-desktop-host-changed":
      return isRemoteDesktopHostState(value.state);
    case "remote-desktop-client-changed":
      return isRemoteDesktopClientState(value.state);
    case "agent-settings-changed":
      return isString(value.botId);
    case "agent-templates-changed":
      return Array.isArray(value.templates) && value.templates.every(isAgentTemplate);
    case "app-settings-changed":
      return isAppSettings(value.settings);
    case "browser-takeover":
      return isBrowserTakeoverRequest(value.request);
    case "browser-takeover-changed":
      return isString(value.requestId) && isString(value.botId) && isBrowserTakeoverPhase(value.phase);
    case "mcp-servers-changed":
      return Array.isArray(value.servers) && value.servers.every(isMcpServer);
    case "provider-usage-changed":
      return Array.isArray(value.usage) && value.usage.every(isProviderUsage);
    case "model-fallback":
      return (
        isString(value.botId) && isAgentModel(value.fromModel) && isAgentModel(value.toModel) && isString(value.reason)
      );
    case "acp-agents-changed":
      return Array.isArray(value.agents) && value.agents.every(isAcpAgentConfig);
    case "routines-changed":
      return Array.isArray(value.routines) && value.routines.every(isRoutine);
    case "routine-run":
      return isRoutineRun(value.run);
    case "workflows-changed":
      return Array.isArray(value.workflows) && value.workflows.every(isWorkflow);
    case "workflow-run-changed":
      return isWorkflowRun(value.run);
    case "marketplace-changed":
      return Array.isArray(value.items) && value.items.every(isMarketplaceItem);
    case "voice-changed":
      return isVoiceState(value.state);
    case "mobile-changed":
      return isMobileState(value.state);
    case "mobile-pairing-completed":
      return isMobileDevice(value.device);
    case "approval-rules-changed":
      return isApprovalRuleList(value.rules);
    case "managed-cli-changed":
      return isManagedCliState(value.state);
    case "endpoints-changed":
      return isModelEndpointList(value.endpoints);
    case "accounts-changed":
      return isAccountsSnapshot(value);
    case "account-switched":
      return isAccountSwitched(value);
    case "account-limit-reached":
      return isAccountLimitReached(value);
    case "account-error":
      return isAccountError(value);
    case "context-changed":
      return isContextState(value);
    case "context-settings-changed":
      return isContextSettings(value);
    case "conversation-windows-changed":
      return isConversationWindowsChanged(value);
    case "spaces-changed":
      return isSpacesChanged(value);
    case "budgets-changed":
      return isBudgetsChanged(value);
    case "browser-profiles-changed":
      return isBrowserProfilesChanged(value);
    case "integrations-changed":
      return isIntegrationsChanged(value);
    case "phone-access-changed":
      return isPhoneAccessChanged(value);
    case "side-question-changed":
      return isSideQuestionChanged(value);
    case "agent-preferences-changed":
      return isAgentPreferencesChanged(value);
    case "server-settings-changed":
      return isServerSettingsChanged(value);
    case "provider-catalog-changed":
      return isProviderCatalogChanged(value);
    case "thread-tabs-changed":
      return isThreadTabsChanged(value);
    case "messengers-changed":
      return isMessengersChanged(value);
    case "vault-connectors-changed":
      return isVaultConnectorsChanged(value);
    case "plugin-catalog-changed":
      return isPluginCatalogChanged(value);
    case "mcp-oauth-changed":
      return isMcpOAuthChanged(value);
    case "update-preferences-changed":
      return isUpdatePreferencesChanged(value);
    case "threads-changed":
      return isThreadsChanged(value);
    case "thread-activity":
      return isThreadActivity(value);
    case "thread-deletes-changed":
      return isThreadDeletesChanged(value);
    case "channel-routines-changed":
      return isChannelRoutinesChanged(value);
    case "plan-changed":
      return isPlanChanged(value);
    case "subagent-changed":
      return isSubagentChanged(value);
    case "acp-login-changed":
      return isAcpLoginChanged(value);
    case "access-changed":
      return isAccessChanged(value);
    case "access-denied":
      return isAccessDenied(value);
    case "isolation-changed":
      return isIsolationChanged(value);
    case "message-pins-changed":
      return isMessagePinsChanged(value);
    case "agent-mcp-changed":
      return isString(value.botId) && Array.isArray(value.settings) && value.settings.every(isAgentMcpServerSetting);
    case "agent-memory-changed":
      return (
        isString(value.botId) && (value.action === "saved" || value.action === "deleted") && isAgentMemory(value.memory)
      );
    case "channel-memory-changed":
      return (
        isString(value.channelId) &&
        (value.action === "saved" || value.action === "deleted") &&
        isChannelMemory(value.memory)
      );
    case "error":
      return isString(value.code) && isString(value.message);
    default:
      return false;
  }
}

export interface ScopedAgentEvent {
  serverId: string;
  event: AgentEvent;
}

export interface AgentIpcRequest<T = unknown> {
  serverId: string;
  payload: T;
}
