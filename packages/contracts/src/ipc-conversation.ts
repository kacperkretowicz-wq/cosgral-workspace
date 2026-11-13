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
import { type ComputerUseState, isComputerUseState } from "./ipc-computer-use";
import type { AgentEyesRequest, AgentEyesState } from "./ipc-eyes";
import { type AgentMcpServerSetting, isAgentMcpServerSetting, isMcpServer, type McpServer } from "./ipc-mcp";
import { type AgentMemory, isAgentMemory } from "./ipc-memory";
import { type AcpAgentConfig, isAcpAgentConfig, isProviderUsage, type ProviderUsage } from "./ipc-providers";
import { isRoutine, isRoutineRun, type Routine, type RoutineRun } from "./ipc-routines";
import { isSidebarLayout, type SidebarLayout } from "./ipc-sidebar";
import { isLocalSkill, isSkillInstall, type LocalSkill, type SkillInstall } from "./ipc-skills";
import { isSharedTable, type SharedTable } from "./ipc-tables";
import {
  isVaultItemSummary,
  isVaultRequest,
  isVaultRequestResolution,
  type VaultItemSummary,
  type VaultRequest,
  type VaultRequestResolution,
} from "./ipc-vault";
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
export type AgentProviderId = "codex" | "claude" | "acp";
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
export type AgentModelId = (typeof AGENT_MODELS)[number] | AcpModelId;

export const AGENT_REASONING_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type AgentReasoningEffort = (typeof AGENT_REASONING_EFFORTS)[number];

export interface AgentModelOption {
  id: AgentModelId;
  name: string;
  description: string;
  defaultReasoningEffort: AgentReasoningEffort;
  supportedReasoningEfforts: AgentReasoningEffort[];
}

export const BOT_AVATAR_HUES = [0, 30, 55, 100, 150, 185, 215, 245, 280, 320] as const;
export type BotAvatarHue = (typeof BOT_AVATAR_HUES)[number];

export function isAgentModel(value: unknown): value is AgentModelId {
  return isOneOf(AGENT_MODELS, value) || isAcpModel(value);
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

export interface QueueSnapshot {
  botId: string;
  paused: boolean;
  deliveries: QueueDelivery[];
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
