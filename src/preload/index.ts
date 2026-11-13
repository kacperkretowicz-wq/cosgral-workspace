import {
  type AccountUsage,
  type AcpAgentConfig,
  type AgentActivity,
  type AgentEyesGrant,
  type AgentEyesSession,
  type AgentEyesState,
  type AgentIpcRequest,
  type AgentMcpServerSetting,
  type AgentMemory,
  type AgentMemorySettings,
  type AgentModelId,
  type AgentModelOption,
  type AgentStatus,
  type AttachmentImportEvent,
  type BotSummary,
  type ChannelMemory,
  type ChannelMessage,
  type ChannelTask,
  type ConversationReadState,
  type ConversationWithReadState,
  type DraftAttachment,
  type ImportAttachmentsInput,
  IPC_CHANNELS,
  isAcpAgentConfig,
  isAgentActivity,
  isAgentMcpServerSetting,
  isAgentMemory,
  isAgentMemorySettings,
  isAgentModel,
  isChannelMemory,
  isChannelMessage,
  isChannelTask,
  isKeptDraft,
  isLocalSkill,
  isMcpServer,
  isPendingAgentRequest,
  isProviderUsage,
  isReasoningEffort,
  isRoutine,
  isRoutineRun,
  isRoutineWithSecret,
  isSidebarFolder,
  isSidebarLayout,
  isSkillContent,
  isSkillInstall,
  isSkillVersion,
  isVaultItemSummary,
  isVaultStatus,
  isWorkspaceChannel,
  type KeptDraft,
  type LocalSkill,
  type McpServer,
  type OpenBotDesktopApi,
  type PendingAgentRequest,
  type ProviderUsage,
  type QueuedMessageReceipt,
  type QueueSnapshot,
  type Routine,
  type RoutineRun,
  type RoutineWithSecret,
  type ScopedAgentEvent,
  type ScopedDirectMessageEvent,
  type ScopedDirectTypingEvent,
  type ScopedTeamPresenceSnapshot,
  type SidebarFolderChange,
  type SidebarLayout,
  type UpdateStatus,
  type WorkspaceChannel,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isBoolean, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { contextBridge, ipcRenderer, webUtils } from "electron";

const attachmentImportListeners = new Set<(event: AttachmentImportEvent) => void>();
let selectedServerId = "local";

function invokeAgent<TResult>(
  channel: string,
  payload: unknown = null,
  decoder: (value: unknown) => TResult,
): Promise<TResult> {
  const request: AgentIpcRequest = { serverId: selectedServerId, payload };
  return ipcRenderer.invoke(channel, request).then(decoder);
}

function rememberActiveServer<T extends { id: string; active: boolean }[]>(servers: T): T {
  selectedServerId = servers.find((server) => server.active)?.id ?? "local";
  return servers;
}

function emitAttachmentImport(event: AttachmentImportEvent): void {
  for (const listener of attachmentImportListeners) listener(event);
}

async function importFiles(files: File[]): Promise<void> {
  if (files.length === 0) return;
  const requestId = crypto.randomUUID();
  emitAttachmentImport({ type: "started", requestId });
  try {
    const input: ImportAttachmentsInput = { paths: [], data: [] };
    for (const file of files) {
      const path = webUtils.getPathForFile(file);
      if (path) input.paths.push(path);
      else {
        input.data.push({
          name: file.name || `pasted-${Date.now()}.png`,
          mimeType: file.type,
          bytes: new Uint8Array(await file.arrayBuffer()),
        });
      }
    }
    const attachments = await invokeAgent(IPC_CHANNELS.agentImportAttachments, input, decodeDraftAttachments);
    emitAttachmentImport({ type: "completed", requestId, attachments });
  } catch (error) {
    emitAttachmentImport({
      type: "error",
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function record(value: unknown, label: string): DynamicRecord {
  if (!isDynamicRecord(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

function nullableString(value: unknown, label: string): value is string | null {
  if (value !== null && !isString(value)) throw new Error(`Invalid ${label}.`);
  return true;
}

function decodeVoid(value: unknown): undefined {
  if (value !== undefined && value !== null) throw new Error("IPC returned unexpected data.");
  return undefined;
}

function decodeAgentStatus(value: unknown): AgentStatus {
  if (!isAgentStatusValue(value)) throw new Error("Invalid agent status response.");
  return value;
}

function isAgentStatusValue(value: unknown): value is AgentStatus {
  if (!isDynamicRecord(value) || !isDynamicRecord(value.auth)) return false;
  if (!isDynamicRecord(value.capabilities)) return false;
  return (
    isString(value.phase) &&
    (value.cliVersion === null || isString(value.cliVersion)) &&
    isString(value.auth.kind) &&
    isString(value.capabilities.chat) &&
    isString(value.capabilities.browser) &&
    isString(value.capabilities.computerUse) &&
    nullableString(value.message, "status message") &&
    value.fullAccess === true
  );
}

function decodeAccountUsage(value: unknown): AccountUsage {
  if (!isAccountUsageValue(value)) throw new Error("Invalid agent usage response.");
  return value;
}

function isAccountUsageValue(value: unknown): value is AccountUsage {
  return (
    isDynamicRecord(value) &&
    Array.isArray(value.limits) &&
    value.limits.every(
      (limit) =>
        isDynamicRecord(limit) &&
        isString(limit.id) &&
        (limit.primary === null || isDynamicRecord(limit.primary)) &&
        (limit.secondary === null || isDynamicRecord(limit.secondary)),
    )
  );
}

function decodeAgentModels(value: unknown): AgentModelOption[] {
  if (!isAgentModelList(value)) throw new Error("Invalid agent model response.");
  return value;
}

function isAgentModelList(value: unknown): value is AgentModelOption[] {
  return (
    Array.isArray(value) &&
    value.every(
      (model) =>
        isDynamicRecord(model) &&
        isAgentModel(model.id) &&
        isString(model.name) &&
        isString(model.description) &&
        isReasoningEffort(model.defaultReasoningEffort) &&
        Array.isArray(model.supportedReasoningEfforts) &&
        model.supportedReasoningEfforts.every(isReasoningEffort),
    )
  );
}

function decodeBot(value: unknown): BotSummary {
  if (!isBotSummary(value)) throw new Error("Invalid agent response.");
  return value;
}

function isBotSummary(value: unknown): value is BotSummary {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.role) &&
    isString(value.description) &&
    isBoolean(value.notifications) &&
    isAgentModel(value.model) &&
    (value.activeModel === undefined || isAgentModel(value.activeModel)) &&
    isReasoningEffort(value.reasoningEffort) &&
    nullableString(value.threadId, "thread ID") &&
    isString(value.workspacePath) &&
    isString(value.preview) &&
    nullableString(value.updatedAt, "updated at") &&
    isString(value.avatarSeed) &&
    (value.avatarHue === null || isNumber(value.avatarHue)) &&
    nullableString(value.avatarUrl, "avatar URL")
  );
}

function decodeBots(value: unknown): BotSummary[] {
  if (!Array.isArray(value) || !value.every(isBotSummary)) {
    throw new Error("Invalid agent list response.");
  }
  return value;
}

function decodeConversation(value: unknown): ConversationWithReadState {
  if (!isConversationWithReadState(value)) throw new Error("Invalid conversation response.");
  return value;
}

function isConversationWithReadState(value: unknown): value is ConversationWithReadState {
  return (
    isDynamicRecord(value) &&
    isString(value.botId) &&
    nullableString(value.threadId, "thread ID") &&
    nullableString(value.activeTurnId, "active turn ID") &&
    isNumber(value.revision) &&
    Array.isArray(value.messages) &&
    isDynamicRecord(value.readState)
  );
}

function decodeReadState(value: unknown): ConversationReadState {
  const item = record(value, "conversation read state");
  return {
    unreadCount: requiredNumber(item, "unreadCount"),
    firstUnreadMessageId: requiredNullableString(item, "firstUnreadMessageId"),
    throughMessageId: requiredNullableString(item, "throughMessageId"),
  };
}

function decodeReadStates(value: unknown): Record<string, ConversationReadState> {
  const item = record(value, "conversation reads");
  return Object.fromEntries(Object.entries(item).map(([botId, state]) => [botId, decodeReadState(state)]));
}

function decodeAttachments(value: unknown): DraftAttachment[] {
  if (!Array.isArray(value) || !value.every(isDraftAttachment)) {
    throw new Error("Invalid attachment response.");
  }
  return value;
}

function decodeDraftAttachments(value: unknown): DraftAttachment[] {
  return decodeAttachments(value);
}

function isDraftAttachment(value: unknown): value is DraftAttachment {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isNumber(value.size) &&
    isString(value.kind) &&
    isString(value.mimeType) &&
    isString(value.previewKind) &&
    nullableString(value.previewUrl, "preview URL")
  );
}

function decodeReceipt(value: unknown): QueuedMessageReceipt {
  if (!isQueuedMessageReceipt(value)) {
    throw new Error("Invalid queued message response.");
  }
  return value;
}

function isQueuedMessageReceipt(value: unknown): value is QueuedMessageReceipt {
  return isDynamicRecord(value) && isString(value.messageId) && Array.isArray(value.deliveries);
}

function decodeQueue(value: unknown): QueueSnapshot {
  if (!isQueueSnapshot(value)) {
    throw new Error("Invalid queue response.");
  }
  return value;
}

/** COSGRAL: agent eyes state (who is looking, standing approvals). */
function decodeEyesState(value: unknown): AgentEyesState {
  if (!isDynamicRecord(value) || !Array.isArray(value.sessions) || !Array.isArray(value.grants)) {
    throw new Error("Invalid agent eyes response.");
  }
  return { sessions: value.sessions.filter(isEyesSession), grants: value.grants.filter(isEyesGrant) };
}

function isEyesSession(value: unknown): value is AgentEyesSession {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.botId) &&
    isString(value.threadId) &&
    isString(value.turnId) &&
    (value.source === "screen" || value.source === "window" || value.source === "camera") &&
    isString(value.targetLabel) &&
    (value.phase === "capturing" || value.phase === "watching") &&
    isNumber(value.framesCaptured) &&
    isNumber(value.framesPlanned) &&
    isString(value.startedAt) &&
    (value.endsAt === null || isString(value.endsAt))
  );
}

function isEyesGrant(value: unknown): value is AgentEyesGrant {
  return (
    isDynamicRecord(value) &&
    isString(value.botId) &&
    isString(value.threadId) &&
    value.source === "screen" &&
    isString(value.grantedAt)
  );
}

/** COSGRAL W1: open cards for a reloaded window; malformed entries are dropped. */
function decodePendingRequests(value: unknown): PendingAgentRequest[] {
  if (!Array.isArray(value)) throw new Error("Invalid pending requests response.");
  return value.filter(isPendingAgentRequest);
}

/** COSGRAL W2: the skill library; malformed list entries are dropped. */
/** COSGRAL W2: Vault summaries; anything that is not a secret-free summary is dropped. */
function decodeVaultItems(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Invalid Vault list response.");
  return value.filter(isVaultItemSummary);
}

function decodeVaultItem(value: unknown) {
  if (!isVaultItemSummary(value)) throw new Error("Invalid Vault item response.");
  return value;
}

function decodeVaultStatus(value: unknown) {
  if (!isVaultStatus(value)) throw new Error("Invalid Vault status response.");
  return value;
}

function decodeSkills(value: unknown): LocalSkill[] {
  if (!Array.isArray(value)) throw new Error("Invalid skill list response.");
  return value.filter(isLocalSkill);
}

function decodeSkill(value: unknown): LocalSkill {
  if (!isLocalSkill(value)) throw new Error("Invalid skill response.");
  return value;
}

function decodeSkillContent(value: unknown) {
  if (!isSkillContent(value)) throw new Error("Invalid skill content response.");
  return value;
}

function decodeSkillVersions(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Invalid skill versions response.");
  return value.filter(isSkillVersion);
}

function decodeSkillInstall(value: unknown) {
  if (!isSkillInstall(value)) throw new Error("Invalid skill install response.");
  return value;
}

function decodeSkillInstalls(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Invalid skill installs response.");
  return value.filter(isSkillInstall);
}

/** COSGRAL W1-BE3: kept drafts; malformed entries are dropped. */
function decodeDrafts(value: unknown): KeptDraft[] {
  if (!Array.isArray(value)) throw new Error("Invalid drafts response.");
  return value.filter(isKeptDraft);
}

/** COSGRAL W1: agent row states; malformed entries are dropped. */
function decodeActivities(value: unknown): AgentActivity[] {
  if (!Array.isArray(value)) throw new Error("Invalid agent activity response.");
  return value.filter(isAgentActivity);
}

/** COSGRAL W1: the sidebar folder layout. */
function decodeSidebarLayout(value: unknown): SidebarLayout {
  if (!isSidebarLayout(value)) throw new Error("Invalid sidebar layout response.");
  return value;
}

function decodeSidebarFolderChange(value: unknown): SidebarFolderChange {
  if (!isDynamicRecord(value) || !isSidebarFolder(value.folder) || !isSidebarLayout(value.layout)) {
    throw new Error("Invalid sidebar folder response.");
  }
  return { folder: value.folder, layout: value.layout };
}

/** COSGRAL W2: memory decoders. */
function decodeAgentMemory(value: unknown): AgentMemory {
  if (!isAgentMemory(value)) throw new Error("Invalid agent memory response.");
  return value;
}

function decodeAgentMemories(value: unknown): AgentMemory[] {
  if (!Array.isArray(value)) throw new Error("Invalid agent memories response.");
  return value.filter(isAgentMemory);
}

/** COSGRAL W2: routine decoders. */
function decodeRoutine(value: unknown): Routine {
  if (!isRoutine(value)) throw new Error("Invalid routine response.");
  return value;
}

/** COSGRAL W3: provider decoders. */
function decodeAcpAgents(value: unknown): AcpAgentConfig[] {
  if (!Array.isArray(value)) throw new Error("Invalid ACP agent list response.");
  return value.filter(isAcpAgentConfig);
}

function decodeAcpAgent(value: unknown): AcpAgentConfig {
  if (!isAcpAgentConfig(value)) throw new Error("Invalid ACP agent response.");
  return value;
}

function decodeProviderUsage(value: unknown): ProviderUsage[] {
  if (!Array.isArray(value)) throw new Error("Invalid provider usage response.");
  return value.filter(isProviderUsage);
}

function decodeModelIds(value: unknown): AgentModelId[] {
  if (!Array.isArray(value)) throw new Error("Invalid fallback models response.");
  return value.filter(isAgentModel);
}

function decodeRoutines(value: unknown): Routine[] {
  if (!Array.isArray(value)) throw new Error("Invalid routine list response.");
  return value.filter(isRoutine);
}

function decodeRoutineRun(value: unknown): RoutineRun {
  if (!isRoutineRun(value)) throw new Error("Invalid routine run response.");
  return value;
}

function decodeRoutineRuns(value: unknown): RoutineRun[] {
  if (!Array.isArray(value)) throw new Error("Invalid routine history response.");
  return value.filter(isRoutineRun);
}

function decodeRoutineWithSecret(value: unknown): RoutineWithSecret {
  if (!isRoutineWithSecret(value)) throw new Error("Invalid routine response.");
  return value;
}

/** COSGRAL W2: MCP decoders. */
function decodeMcpServer(value: unknown): McpServer {
  if (!isMcpServer(value)) throw new Error("Invalid MCP server response.");
  return value;
}

function decodeMcpServers(value: unknown): McpServer[] {
  if (!Array.isArray(value)) throw new Error("Invalid MCP server list response.");
  return value.filter(isMcpServer);
}

function decodeAgentMcpSettings(value: unknown): AgentMcpServerSetting[] {
  if (!Array.isArray(value)) throw new Error("Invalid MCP settings response.");
  return value.filter(isAgentMcpServerSetting);
}

function decodeAgentMemorySettings(value: unknown): AgentMemorySettings {
  if (!isAgentMemorySettings(value)) throw new Error("Invalid memory settings response.");
  return value;
}

function decodeChannelMemory(value: unknown): ChannelMemory {
  if (!isChannelMemory(value)) throw new Error("Invalid channel memory response.");
  return value;
}

function decodeChannelMemories(value: unknown): ChannelMemory[] {
  if (!Array.isArray(value)) throw new Error("Invalid channel memories response.");
  return value.filter(isChannelMemory);
}

/** COSGRAL W1-BE2: channels and channel tasks. */
function decodeChannel(value: unknown): WorkspaceChannel {
  if (!isWorkspaceChannel(value)) throw new Error("Invalid channel response.");
  return value;
}

function decodeChannels(value: unknown): WorkspaceChannel[] {
  if (!Array.isArray(value)) throw new Error("Invalid channel list response.");
  return value.filter(isWorkspaceChannel);
}

function decodeChannelTask(value: unknown): ChannelTask {
  if (!isChannelTask(value)) throw new Error("Invalid channel task response.");
  return value;
}

function decodeChannelTasks(value: unknown): ChannelTask[] {
  if (!Array.isArray(value)) throw new Error("Invalid channel task list response.");
  return value.filter(isChannelTask);
}

function decodeChannelMessages(value: unknown): ChannelMessage[] {
  if (!Array.isArray(value) || !value.every(isChannelMessage)) throw new Error("Invalid channel history response.");
  return value;
}

function decodeChannelReceipt(value: unknown): { message: ChannelMessage; task: ChannelTask } {
  if (!isDynamicRecord(value) || !isChannelMessage(value.message) || !isChannelTask(value.task))
    throw new Error("Invalid channel message response.");
  return { message: value.message, task: value.task };
}

function isQueueSnapshot(value: unknown): value is QueueSnapshot {
  return isDynamicRecord(value) && isString(value.botId) && isBoolean(value.paused) && Array.isArray(value.deliveries);
}

function requiredNumber(value: DynamicRecord, field: string): number {
  if (!isNumber(value[field])) throw new Error(`Invalid ${field}.`);
  return value[field];
}

function requiredNullableString(value: DynamicRecord, field: string): string | null {
  const item = value[field];
  if (item !== null && !isString(item)) throw new Error(`Invalid ${field}.`);
  return item;
}

window.addEventListener("dragover", (event) => {
  if ([...(event.dataTransfer?.items ?? [])].some((item) => item.kind === "file")) {
    event.preventDefault();
  }
});
window.addEventListener("drop", (event) => {
  const files = [...(event.dataTransfer?.files ?? [])];
  if (!files.length) return;
  event.preventDefault();
  void importFiles(files);
});
window.addEventListener("paste", (event) => {
  const files = [...(event.clipboardData?.files ?? [])];
  if (files.length) {
    event.preventDefault();
    void importFiles(files);
  }
});

const openbotApi: OpenBotDesktopApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo),
  getSetupState: () => ipcRenderer.invoke(IPC_CHANNELS.getSetupState),
  saveSetup: (input) => ipcRenderer.invoke(IPC_CHANNELS.saveSetup, input),
  getMacPermissions: () => ipcRenderer.invoke(IPC_CHANNELS.getMacPermissions),
  requestMacPermission: (permission) => ipcRenderer.invoke(IPC_CHANNELS.requestMacPermission, permission),
  openExternal: (destination) => ipcRenderer.invoke(IPC_CHANNELS.openExternal, destination),
  openUrl: (url) => ipcRenderer.invoke(IPC_CHANNELS.openUrl, url),
  auth: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.authGetState),
    retry: () => ipcRenderer.invoke(IPC_CHANNELS.authRetry),
    requestEmailCode: (email) => ipcRenderer.invoke(IPC_CHANNELS.authRequestEmailCode, email),
    verifyEmailCode: (challengeId, code) => ipcRenderer.invoke(IPC_CHANNELS.authVerifyEmailCode, { challengeId, code }),
    updateAvatar: (image) => ipcRenderer.invoke(IPC_CHANNELS.authUpdateAvatar, image),
    logout: () => ipcRenderer.invoke(IPC_CHANNELS.authLogout),
    onEvent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state);
      ipcRenderer.on(IPC_CHANNELS.authEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.authEvent, handler);
    },
  },
  agent: {
    getStatus: () => invokeAgent(IPC_CHANNELS.agentGetStatus, null, decodeAgentStatus),
    getUsage: () => invokeAgent(IPC_CHANNELS.agentGetUsage, null, decodeAccountUsage),
    listModels: () => invokeAgent(IPC_CHANNELS.agentListModels, null, decodeAgentModels),
    listBots: () => invokeAgent(IPC_CHANNELS.agentListBots, null, decodeBots),
    createBot: () => invokeAgent(IPC_CHANNELS.agentCreateBot, null, decodeBot),
    updateBot: (input) => invokeAgent(IPC_CHANNELS.agentUpdateBot, input, decodeBot),
    setAvatar: (input) => invokeAgent(IPC_CHANNELS.agentSetAvatar, input, decodeBot),
    deleteBot: (botId) => invokeAgent(IPC_CHANNELS.agentDeleteBot, botId, decodeVoid),
    readConversation: (botId) => invokeAgent(IPC_CHANNELS.agentReadConversation, botId, decodeConversation),
    listConversationReads: () => invokeAgent(IPC_CHANNELS.agentListConversationReads, null, decodeReadStates),
    markConversationRead: (input) => invokeAgent(IPC_CHANNELS.agentMarkConversationRead, input, decodeReadState),
    chooseAttachments: () => invokeAgent(IPC_CHANNELS.agentChooseAttachments, null, decodeAttachments),
    onAttachmentImport: (listener) => {
      attachmentImportListeners.add(listener);
      return () => attachmentImportListeners.delete(listener);
    },
    discardDraftAttachment: (attachmentId) =>
      invokeAgent(IPC_CHANNELS.agentDiscardDraftAttachment, attachmentId, decodeVoid),
    openAttachment: (input) => invokeAgent(IPC_CHANNELS.agentOpenAttachment, input, decodeVoid),
    sendMessage: (input) => invokeAgent(IPC_CHANNELS.agentSendMessage, input, decodeReceipt),
    setMessageReaction: (input) => invokeAgent(IPC_CHANNELS.agentSetMessageReaction, input, decodeVoid),
    listQueue: (botId) => invokeAgent(IPC_CHANNELS.agentListQueue, botId, decodeQueue),
    cancelQueuedMessage: (input) => invokeAgent(IPC_CHANNELS.agentCancelQueuedMessage, input, decodeVoid),
    setQueuePaused: (input) => invokeAgent(IPC_CHANNELS.agentSetQueuePaused, input, decodeVoid),
    steerQueuedMessage: (input) => invokeAgent(IPC_CHANNELS.agentSteerQueuedMessage, input, decodeVoid),
    updateQueuedMessage: (input) => invokeAgent(IPC_CHANNELS.agentUpdateQueuedMessage, input, decodeVoid),
    reorderQueue: (input) => invokeAgent(IPC_CHANNELS.agentReorderQueue, input, decodeVoid),
    interrupt: (input) => invokeAgent(IPC_CHANNELS.agentInterrupt, input, decodeVoid),
    respondToPrompt: (input) => invokeAgent(IPC_CHANNELS.agentRespondToPrompt, input, decodeVoid),
    respondToApproval: (input) => invokeAgent(IPC_CHANNELS.agentRespondToApproval, input, decodeVoid),
    getEyesState: () => invokeAgent(IPC_CHANNELS.agentGetEyesState, null, decodeEyesState),
    stopEyes: (input) => invokeAgent(IPC_CHANNELS.agentStopEyes, input, decodeEyesState),
    listPendingRequests: () => invokeAgent(IPC_CHANNELS.agentListPendingRequests, null, decodePendingRequests),
    listActivity: () => invokeAgent(IPC_CHANNELS.agentListActivity, null, decodeActivities),
    respondToDraftPreview: (input) => invokeAgent(IPC_CHANNELS.agentRespondToDraftPreview, input, decodeVoid),
    respondToBrowserTakeover: (input) => invokeAgent(IPC_CHANNELS.agentRespondToBrowserTakeover, input, decodeVoid),
    listDrafts: () => invokeAgent(IPC_CHANNELS.agentListDrafts, null, decodeDrafts),
    deleteDraft: (input) => invokeAgent(IPC_CHANNELS.agentDeleteDraft, input, decodeVoid),
    onEvent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: ScopedAgentEvent) => {
        if (payload.serverId === selectedServerId) listener(payload.event);
      };
      ipcRenderer.on(IPC_CHANNELS.agentEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.agentEvent, handler);
    },
  },
  sidebar: {
    getLayout: () => invokeAgent(IPC_CHANNELS.sidebarGetLayout, null, decodeSidebarLayout),
    createFolder: (input) => invokeAgent(IPC_CHANNELS.sidebarCreateFolder, input, decodeSidebarFolderChange),
    updateFolder: (input) => invokeAgent(IPC_CHANNELS.sidebarUpdateFolder, input, decodeSidebarLayout),
    moveFolder: (input) => invokeAgent(IPC_CHANNELS.sidebarMoveFolder, input, decodeSidebarLayout),
    duplicateFolder: (input) => invokeAgent(IPC_CHANNELS.sidebarDuplicateFolder, input, decodeSidebarFolderChange),
    deleteFolder: (input) => invokeAgent(IPC_CHANNELS.sidebarDeleteFolder, input, decodeSidebarLayout),
    moveItem: (input) => invokeAgent(IPC_CHANNELS.sidebarMoveItem, input, decodeSidebarLayout),
  },
  memory: {
    listAgentMemories: (input) => invokeAgent(IPC_CHANNELS.memoryListAgentMemories, input, decodeAgentMemories),
    saveAgentMemory: (input) => invokeAgent(IPC_CHANNELS.memorySaveAgentMemory, input, decodeAgentMemory),
    deleteAgentMemory: (input) => invokeAgent(IPC_CHANNELS.memoryDeleteAgentMemory, input, decodeVoid),
    searchAgentMemories: (input) => invokeAgent(IPC_CHANNELS.memorySearchAgentMemories, input, decodeAgentMemories),
    getAgentSettings: (botId) => invokeAgent(IPC_CHANNELS.memoryGetAgentSettings, botId, decodeAgentMemorySettings),
    setAgentLimit: (input) => invokeAgent(IPC_CHANNELS.memorySetAgentLimit, input, decodeAgentMemorySettings),
  },
  routines: {
    list: (botId) => invokeAgent(IPC_CHANNELS.routinesList, botId ?? null, decodeRoutines),
    create: (input) => invokeAgent(IPC_CHANNELS.routinesCreate, input, decodeRoutineWithSecret),
    update: (input) => invokeAgent(IPC_CHANNELS.routinesUpdate, input, decodeRoutine),
    delete: (input) => invokeAgent(IPC_CHANNELS.routinesDelete, input, decodeVoid),
    runNow: (input) => invokeAgent(IPC_CHANNELS.routinesRunNow, input, decodeRoutineRun),
    listRuns: (input) => invokeAgent(IPC_CHANNELS.routinesListRuns, input, decodeRoutineRuns),
    regenerateSecret: (input) => invokeAgent(IPC_CHANNELS.routinesRegenerateSecret, input, decodeRoutineWithSecret),
  },
  providers: {
    listAcpAgents: () => invokeAgent(IPC_CHANNELS.providersListAcpAgents, null, decodeAcpAgents),
    saveAcpAgent: (input) => invokeAgent(IPC_CHANNELS.providersSaveAcpAgent, input, decodeAcpAgent),
    removeAcpAgent: (input) => invokeAgent(IPC_CHANNELS.providersRemoveAcpAgent, input, decodeVoid),
    listUsage: () => invokeAgent(IPC_CHANNELS.providersListUsage, null, decodeProviderUsage),
    getFallbackModels: (botId) => invokeAgent(IPC_CHANNELS.providersGetFallbackModels, botId, decodeModelIds),
    setFallbackModels: (input) => invokeAgent(IPC_CHANNELS.providersSetFallbackModels, input, decodeModelIds),
  },
  mcp: {
    list: () => invokeAgent(IPC_CHANNELS.mcpList, null, decodeMcpServers),
    add: (input) => invokeAgent(IPC_CHANNELS.mcpAdd, input, decodeMcpServer),
    update: (input) => invokeAgent(IPC_CHANNELS.mcpUpdate, input, decodeMcpServer),
    remove: (input) => invokeAgent(IPC_CHANNELS.mcpRemove, input, decodeVoid),
    reconnect: (input) => invokeAgent(IPC_CHANNELS.mcpReconnect, input, decodeMcpServer),
    listAgentSettings: (botId) => invokeAgent(IPC_CHANNELS.mcpListAgentSettings, botId, decodeAgentMcpSettings),
    setAgentEnabled: (input) => invokeAgent(IPC_CHANNELS.mcpSetAgentEnabled, input, decodeAgentMcpSettings),
  },
  channels: {
    listMemories: (channelId) => invokeAgent(IPC_CHANNELS.channelsListMemories, channelId, decodeChannelMemories),
    saveMemory: (input) => invokeAgent(IPC_CHANNELS.channelsSaveMemory, input, decodeChannelMemory),
    deleteMemory: (input) => invokeAgent(IPC_CHANNELS.channelsDeleteMemory, input, decodeVoid),
    listMessages: (input) => invokeAgent(IPC_CHANNELS.channelsListMessages, input, decodeChannelMessages),
    sendMessage: (input) => invokeAgent(IPC_CHANNELS.channelsSendMessage, input, decodeChannelReceipt),
    list: () => invokeAgent(IPC_CHANNELS.channelsList, null, decodeChannels),
    listTasks: (channelId) => invokeAgent(IPC_CHANNELS.channelsListTasks, channelId, decodeChannelTasks),
    create: (input) => invokeAgent(IPC_CHANNELS.channelsCreate, input, decodeChannel),
    update: (input) => invokeAgent(IPC_CHANNELS.channelsUpdate, input, decodeChannel),
    addMember: (input) => invokeAgent(IPC_CHANNELS.channelsAddMember, input, decodeChannel),
    removeMember: (input) => invokeAgent(IPC_CHANNELS.channelsRemoveMember, input, decodeChannel),
    setLead: (input) => invokeAgent(IPC_CHANNELS.channelsSetLead, input, decodeChannel),
    actOnTask: (input) => invokeAgent(IPC_CHANNELS.channelsTaskAction, input, decodeChannelTask),
    reassignTask: (input) => invokeAgent(IPC_CHANNELS.channelsReassignTask, input, decodeChannelTask),
  },
  skills: {
    list: () => invokeAgent(IPC_CHANNELS.skillsList, null, decodeSkills),
    read: (input) => invokeAgent(IPC_CHANNELS.skillsRead, input, decodeSkillContent),
    listVersions: (input) => invokeAgent(IPC_CHANNELS.skillsListVersions, input, decodeSkillVersions),
    restoreVersion: (input) => invokeAgent(IPC_CHANNELS.skillsRestoreVersion, input, decodeSkill),
    delete: (input) => invokeAgent(IPC_CHANNELS.skillsDelete, input, decodeVoid),
    listInstalls: (input) => invokeAgent(IPC_CHANNELS.skillsListInstalls, input ?? null, decodeSkillInstalls),
    install: (input) => invokeAgent(IPC_CHANNELS.skillsInstall, input, decodeSkillInstall),
    update: (input) => invokeAgent(IPC_CHANNELS.skillsUpdate, input, decodeSkillInstall),
    uninstall: (input) => invokeAgent(IPC_CHANNELS.skillsUninstall, input, decodeVoid),
  },
  vault: {
    status: () => invokeAgent(IPC_CHANNELS.vaultStatus, null, decodeVaultStatus),
    list: () => invokeAgent(IPC_CHANNELS.vaultList, null, decodeVaultItems),
    save: (input) => invokeAgent(IPC_CHANNELS.vaultSave, input, decodeVaultItem),
    delete: (input) => invokeAgent(IPC_CHANNELS.vaultDelete, input, decodeVoid),
    respondToRequest: (input) => invokeAgent(IPC_CHANNELS.vaultRespondToRequest, input, decodeVoid),
  },
  browser: {
    open: (input) => ipcRenderer.invoke(IPC_CHANNELS.browserOpen, input),
    activate: (tabId) => ipcRenderer.invoke(IPC_CHANNELS.browserActivate, tabId),
    close: (tabId) => ipcRenderer.invoke(IPC_CHANNELS.browserClose, tabId),
    listTabs: () => ipcRenderer.invoke(IPC_CHANNELS.browserListTabs),
    getControlState: () => ipcRenderer.invoke(IPC_CHANNELS.browserGetControlState),
    setVisible: (input) => ipcRenderer.invoke(IPC_CHANNELS.browserSetVisible, input),
  },
  update: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.updateGetStatus),
    check: () => ipcRenderer.invoke(IPC_CHANNELS.updateCheck),
    download: () => ipcRenderer.invoke(IPC_CHANNELS.updateDownload),
    install: () => ipcRenderer.invoke(IPC_CHANNELS.updateInstall),
    onEvent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => listener(status);
      ipcRenderer.on(IPC_CHANNELS.updateEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.updateEvent, handler);
    },
  },
  maintenance: {
    exportData: () => ipcRenderer.invoke(IPC_CHANNELS.maintenanceExportData),
    exportDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.maintenanceExportDiagnostics),
  },
  servers: {
    list: async () => rememberActiveServer(await ipcRenderer.invoke(IPC_CHANNELS.serversList)),
    select: async (serverId) => rememberActiveServer(await ipcRenderer.invoke(IPC_CHANNELS.serversSelect, serverId)),
    join: async (input) => {
      const server = await ipcRenderer.invoke(IPC_CHANNELS.serversJoin, input);
      selectedServerId = server.id;
      return server;
    },
    login: async (input) => {
      const server = await ipcRenderer.invoke(IPC_CHANNELS.serversLogin, input);
      selectedServerId = server.id;
      return server;
    },
    updateAddress: (updateUrl) => ipcRenderer.invoke(IPC_CHANNELS.serversUpdateAddress, updateUrl),
    remove: (serverId) => ipcRenderer.invoke(IPC_CHANNELS.serversRemove, serverId),
    getPresence: () => ipcRenderer.invoke(IPC_CHANNELS.serversGetPresence),
    setTyping: (input) => ipcRenderer.invoke(IPC_CHANNELS.serversSetTyping, input),
    onPresence: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: ScopedTeamPresenceSnapshot) => {
        if (payload.serverId === selectedServerId) listener(payload.snapshot);
      };
      ipcRenderer.on(IPC_CHANNELS.serversPresence, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.serversPresence, handler);
    },
    listDirectThreads: () => ipcRenderer.invoke(IPC_CHANNELS.serversListDirectThreads),
    readDirectConversation: (memberId) => ipcRenderer.invoke(IPC_CHANNELS.serversReadDirectConversation, memberId),
    sendDirectMessage: (input) => ipcRenderer.invoke(IPC_CHANNELS.serversSendDirectMessage, input),
    markDirectRead: (input) => ipcRenderer.invoke(IPC_CHANNELS.serversMarkDirectRead, input),
    setDirectTyping: (input) => ipcRenderer.invoke(IPC_CHANNELS.serversSetDirectTyping, input),
    onDirectMessage: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: ScopedDirectMessageEvent) => {
        if (payload.serverId === selectedServerId) listener(payload.event);
      };
      ipcRenderer.on(IPC_CHANNELS.serversDirectMessage, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.serversDirectMessage, handler);
    },
    onDirectTyping: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: ScopedDirectTypingEvent) => {
        if (payload.serverId === selectedServerId) listener(payload.event);
      };
      ipcRenderer.on(IPC_CHANNELS.serversDirectTyping, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.serversDirectTyping, handler);
    },
    onEvent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, servers: Parameters<typeof listener>[0]) =>
        listener(rememberActiveServer(servers));
      ipcRenderer.on(IPC_CHANNELS.serversEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.serversEvent, handler);
    },
    onInvite: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, inviteUrl: string) => listener(inviteUrl);
      ipcRenderer.on(IPC_CHANNELS.serversInvite, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.serversInvite, handler);
    },
  },
  host: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.hostGetStatus),
    configure: (input) => ipcRenderer.invoke(IPC_CHANNELS.hostConfigure, input),
    configureRemoteDesktop: (input) => ipcRenderer.invoke(IPC_CHANNELS.hostConfigureRemoteDesktop, input),
    start: () => ipcRenderer.invoke(IPC_CHANNELS.hostStart),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.hostStop),
    listMembers: () => ipcRenderer.invoke(IPC_CHANNELS.hostListMembers),
    updateMember: (input) => ipcRenderer.invoke(IPC_CHANNELS.hostUpdateMember, input),
    removeMember: (memberId) => ipcRenderer.invoke(IPC_CHANNELS.hostRemoveMember, memberId),
    listSessions: () => ipcRenderer.invoke(IPC_CHANNELS.hostListSessions),
    revokeSession: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.hostRevokeSession, sessionId),
    listInvites: () => ipcRenderer.invoke(IPC_CHANNELS.hostListInvites),
    revokeInvite: (inviteId) => ipcRenderer.invoke(IPC_CHANNELS.hostRevokeInvite, inviteId),
    createInvite: (input) => ipcRenderer.invoke(IPC_CHANNELS.hostCreateInvite, input),
    createAddressUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.hostCreateAddressUpdate),
    onEvent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, status: Parameters<typeof listener>[0]) => listener(status);
      ipcRenderer.on(IPC_CHANNELS.hostEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.hostEvent, handler);
    },
  },
  remoteMac: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.remoteMacList),
    connect: (input) => ipcRenderer.invoke(IPC_CHANNELS.remoteMacConnect, input),
    disconnect: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.remoteMacDisconnect, sessionId),
    getCredentials: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.remoteMacGetCredentials, sessionId),
    onEvent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, sessions: Parameters<typeof listener>[0]) =>
        listener(sessions);
      ipcRenderer.on(IPC_CHANNELS.remoteMacEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.remoteMacEvent, handler);
    },
  },
};

contextBridge.exposeInMainWorld("openbot", openbotApi);
