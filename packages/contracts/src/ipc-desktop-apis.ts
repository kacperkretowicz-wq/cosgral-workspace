import type { RespondToBrowserTakeoverInput, RespondToDraftPreviewInput } from "./ipc-action-cards";
import type {
  AppInfo,
  AppSetupState,
  CentralAuthDesktopApi,
  ExportResult,
  ExternalDestination,
  MacPermissionId,
  MacPermissionsState,
  SaveSetupInput,
  UpdateStatus,
} from "./ipc-app-auth";
import type { AgentActivity, PendingAgentRequest } from "./ipc-attention";
import type { BrowserControlState, BrowserOpenInput, BrowserTab, BrowserVisibilityInput } from "./ipc-browser";
import type {
  AccountUsage,
  AgentEvent,
  AgentModelOption,
  AgentStatus,
  AttachmentImportEvent,
  BotSummary,
  CancelQueuedMessageInput,
  ConversationReadState,
  ConversationWithReadState,
  DraftAttachment,
  InterruptTurnInput,
  MarkConversationReadInput,
  OpenAttachmentInput,
  QueuedMessageReceipt,
  QueueSnapshot,
  ReorderQueueInput,
  RespondToApprovalInput,
  RespondToPromptInput,
  SendMessageInput,
  SetAgentAvatarInput,
  SetMessageReactionInput,
  SetQueuePausedInput,
  SteerQueuedMessageInput,
  UpdateBotInput,
  UpdateQueuedMessageInput,
} from "./ipc-conversation";
import type { AgentEyesState, StopAgentEyesInput } from "./ipc-eyes";
import type {
  AgentMemory,
  ChannelMemory,
  DeleteAgentMemoryInput,
  DeleteChannelMemoryInput,
  ListAgentMemoriesInput,
  ListChannelMemoriesInput,
  SaveAgentMemoryInput,
  SaveChannelMemoryInput,
  SearchAgentMemoriesInput,
} from "./ipc-memory";
import type {
  CreateSidebarFolderInput,
  DeleteSidebarFolderInput,
  DuplicateSidebarFolderInput,
  MoveSidebarFolderInput,
  MoveSidebarItemInput,
  SidebarFolderChange,
  SidebarLayout,
  UpdateSidebarFolderInput,
} from "./ipc-sidebar";
import type {
  ConfigureHostInput,
  ConfigureRemoteDesktopInput,
  CreateTeamInviteInput,
  DirectConversationReadState,
  DirectConversationSnapshot,
  DirectMessage,
  DirectMessageRealtimeEvent,
  DirectThreadSummary,
  DirectTypingInput,
  DirectTypingRealtimeEvent,
  HostStatus,
  InviteSummary,
  JoinServerInput,
  LoginServerInput,
  MarkDirectReadInput,
  RemoteMacConnectInput,
  RemoteMacCredentials,
  RemoteMacSession,
  SendDirectMessageInput,
  ServerSummary,
  SetTeamTypingInput,
  TeamInviteSummary,
  TeamMemberSummary,
  TeamPresenceSnapshot,
  TeamSessionSummary,
  UpdateTeamMemberInput,
} from "./ipc-team-host";
import type { ChannelTask, WorkspaceChannel } from "./ipc-workspace-channels";

export interface AgentDesktopApi {
  getStatus: () => Promise<AgentStatus>;
  getUsage: () => Promise<AccountUsage>;
  listModels: () => Promise<AgentModelOption[]>;
  listBots: () => Promise<BotSummary[]>;
  createBot: () => Promise<BotSummary>;
  updateBot: (input: UpdateBotInput) => Promise<BotSummary>;
  setAvatar: (input: SetAgentAvatarInput) => Promise<BotSummary>;
  deleteBot: (botId: string) => Promise<void>;
  readConversation: (botId: string) => Promise<ConversationWithReadState>;
  listConversationReads: () => Promise<Record<string, ConversationReadState>>;
  markConversationRead: (input: MarkConversationReadInput) => Promise<ConversationReadState>;
  chooseAttachments: () => Promise<DraftAttachment[]>;
  onAttachmentImport: (listener: (event: AttachmentImportEvent) => void) => () => void;
  discardDraftAttachment: (attachmentId: string) => Promise<void>;
  openAttachment: (input: OpenAttachmentInput) => Promise<void>;
  sendMessage: (input: SendMessageInput) => Promise<QueuedMessageReceipt>;
  setMessageReaction: (input: SetMessageReactionInput) => Promise<void>;
  listQueue: (botId: string) => Promise<QueueSnapshot>;
  cancelQueuedMessage: (input: CancelQueuedMessageInput) => Promise<void>;
  setQueuePaused: (input: SetQueuePausedInput) => Promise<void>;
  steerQueuedMessage: (input: SteerQueuedMessageInput) => Promise<void>;
  updateQueuedMessage: (input: UpdateQueuedMessageInput) => Promise<void>;
  reorderQueue: (input: ReorderQueueInput) => Promise<void>;
  interrupt: (input: InterruptTurnInput) => Promise<void>;
  respondToPrompt: (input: RespondToPromptInput) => Promise<void>;
  respondToApproval: (input: RespondToApprovalInput) => Promise<void>;
  /** COSGRAL agent eyes (local server only). Optional until every renderer mock implements it. */
  getEyesState?: () => Promise<AgentEyesState>;
  stopEyes?: (input: StopAgentEyesInput) => Promise<AgentEyesState>;
  /** COSGRAL W1: open cards of every agent, oldest first; read again after a window reload. */
  listPendingRequests?: () => Promise<PendingAgentRequest[]>;
  /** COSGRAL W1: the row state of every agent; then follow `activity-changed`. */
  listActivity?: () => Promise<AgentActivity[]>;
  respondToDraftPreview?: (input: RespondToDraftPreviewInput) => Promise<void>;
  respondToBrowserTakeover?: (input: RespondToBrowserTakeoverInput) => Promise<void>;
  onEvent: (listener: (event: AgentEvent) => void) => () => void;
}

/** COSGRAL W1: user folders in the sidebar (see ipc-sidebar.ts). */
export interface SidebarDesktopApi {
  getLayout: () => Promise<SidebarLayout>;
  createFolder: (input: CreateSidebarFolderInput) => Promise<SidebarFolderChange>;
  updateFolder: (input: UpdateSidebarFolderInput) => Promise<SidebarLayout>;
  moveFolder: (input: MoveSidebarFolderInput) => Promise<SidebarLayout>;
  duplicateFolder: (input: DuplicateSidebarFolderInput) => Promise<SidebarFolderChange>;
  deleteFolder: (input: DeleteSidebarFolderInput) => Promise<SidebarLayout>;
  moveItem: (input: MoveSidebarItemInput) => Promise<SidebarLayout>;
}

/** COSGRAL W1: channels and channel tasks, read side (engine and writes in W1-BE2). */
export interface ChannelsDesktopApi {
  list: () => Promise<WorkspaceChannel[]>;
  listTasks: (channelId: string) => Promise<ChannelTask[]>;
  listMemories?: (input: ListChannelMemoriesInput | string) => Promise<ChannelMemory[]>;
  saveMemory?: (input: SaveChannelMemoryInput) => Promise<ChannelMemory>;
  deleteMemory?: (input: DeleteChannelMemoryInput) => Promise<void>;
}

/** COSGRAL W2: agent and channel memory (see ipc-memory.ts). */
export interface MemoryDesktopApi {
  listAgentMemories: (input: ListAgentMemoriesInput) => Promise<AgentMemory[]>;
  saveAgentMemory: (input: SaveAgentMemoryInput) => Promise<AgentMemory>;
  deleteAgentMemory: (input: DeleteAgentMemoryInput) => Promise<void>;
  searchAgentMemories?: (input: SearchAgentMemoriesInput) => Promise<AgentMemory[]>;
  listChannelMemories: (input: ListChannelMemoriesInput | string) => Promise<ChannelMemory[]>;
  saveChannelMemory: (input: SaveChannelMemoryInput) => Promise<ChannelMemory>;
  deleteChannelMemory: (input: DeleteChannelMemoryInput) => Promise<void>;
}

export interface BrowserDesktopApi {
  open: (input: BrowserOpenInput) => Promise<BrowserTab>;
  activate: (tabId: string) => Promise<void>;
  close: (tabId: string) => Promise<void>;
  listTabs: () => Promise<BrowserTab[]>;
  getControlState: () => Promise<BrowserControlState>;
  setVisible: (input: BrowserVisibilityInput) => Promise<void>;
}

export interface UpdateDesktopApi {
  getStatus: () => Promise<UpdateStatus>;
  check: () => Promise<UpdateStatus>;
  download: () => Promise<UpdateStatus>;
  install: () => Promise<void>;
  onEvent: (listener: (status: UpdateStatus) => void) => () => void;
}

export interface MaintenanceDesktopApi {
  exportData: () => Promise<ExportResult>;
  exportDiagnostics: () => Promise<ExportResult>;
}

export interface ServersDesktopApi {
  list: () => Promise<ServerSummary[]>;
  select: (serverId: string) => Promise<ServerSummary[]>;
  join: (input: JoinServerInput) => Promise<ServerSummary>;
  login: (input: LoginServerInput) => Promise<ServerSummary>;
  updateAddress: (updateUrl: string) => Promise<ServerSummary>;
  remove: (serverId: string) => Promise<void>;
  getPresence: () => Promise<TeamPresenceSnapshot>;
  setTyping: (input: SetTeamTypingInput) => Promise<void>;
  onPresence: (listener: (snapshot: TeamPresenceSnapshot) => void) => () => void;
  listDirectThreads: () => Promise<DirectThreadSummary[]>;
  readDirectConversation: (memberId: string) => Promise<DirectConversationSnapshot>;
  sendDirectMessage: (input: SendDirectMessageInput) => Promise<DirectMessage>;
  markDirectRead: (input: MarkDirectReadInput) => Promise<DirectConversationReadState>;
  setDirectTyping: (input: DirectTypingInput) => Promise<void>;
  onDirectMessage: (listener: (event: DirectMessageRealtimeEvent) => void) => () => void;
  onDirectTyping: (listener: (event: DirectTypingRealtimeEvent) => void) => () => void;
  onEvent: (listener: (servers: ServerSummary[]) => void) => () => void;
  onInvite: (listener: (inviteUrl: string) => void) => () => void;
}

export interface HostDesktopApi {
  getStatus: () => Promise<HostStatus>;
  configure: (input: ConfigureHostInput) => Promise<HostStatus>;
  configureRemoteDesktop: (input: ConfigureRemoteDesktopInput) => Promise<HostStatus>;
  start: () => Promise<HostStatus>;
  stop: () => Promise<HostStatus>;
  listMembers: () => Promise<TeamMemberSummary[]>;
  updateMember: (input: UpdateTeamMemberInput) => Promise<TeamMemberSummary>;
  removeMember: (memberId: string) => Promise<void>;
  listSessions: () => Promise<TeamSessionSummary[]>;
  revokeSession: (sessionId: string) => Promise<void>;
  listInvites: () => Promise<TeamInviteSummary[]>;
  revokeInvite: (inviteId: string) => Promise<void>;
  createInvite: (input: CreateTeamInviteInput) => Promise<InviteSummary>;
  createAddressUpdate: () => Promise<string>;
  onEvent: (listener: (status: HostStatus) => void) => () => void;
}

export interface RemoteMacDesktopApi {
  list: () => Promise<RemoteMacSession[]>;
  connect: (input: RemoteMacConnectInput) => Promise<RemoteMacSession>;
  disconnect: (sessionId: string) => Promise<void>;
  getCredentials: (sessionId: string) => Promise<RemoteMacCredentials | null>;
  onEvent: (listener: (sessions: RemoteMacSession[]) => void) => () => void;
}

export interface OpenBotDesktopApi {
  getAppInfo: () => Promise<AppInfo>;
  getSetupState: () => Promise<AppSetupState>;
  saveSetup: (input: SaveSetupInput) => Promise<AppSetupState>;
  getMacPermissions: () => Promise<MacPermissionsState>;
  requestMacPermission: (permission: MacPermissionId) => Promise<MacPermissionsState>;
  openExternal: (destination: ExternalDestination) => Promise<void>;
  openUrl: (url: string) => Promise<void>;
  auth: CentralAuthDesktopApi;
  agent: AgentDesktopApi;
  browser: BrowserDesktopApi;
  update: UpdateDesktopApi;
  maintenance: MaintenanceDesktopApi;
  servers: ServersDesktopApi;
  host: HostDesktopApi;
  remoteMac: RemoteMacDesktopApi;
  /** COSGRAL W1. Optional until every renderer mock implements it. */
  sidebar?: SidebarDesktopApi;
  /** COSGRAL W1 (engine in W1-BE2). Optional until every renderer mock implements it. */
  channels?: ChannelsDesktopApi;
  /** COSGRAL W2: agent and channel memory. Optional until every renderer mock implements it. */
  memory?: MemoryDesktopApi;
}
