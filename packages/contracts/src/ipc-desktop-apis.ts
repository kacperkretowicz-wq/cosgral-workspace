import type {
  DeleteDraftInput,
  KeptDraft,
  RespondToBrowserTakeoverInput,
  RespondToDraftPreviewInput,
} from "./ipc-action-cards";
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
import type { ComputerUseState, StopComputerUseInput } from "./ipc-computer-use";
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
import type {
  DockAgentInput,
  DockState,
  IslandState,
  OpenDockChatInput,
  PinDockAgentInput,
  ReorderDockInput,
  SetDockPinHiddenInput,
  SetDockSizeInput,
  SetDockVisibleInput,
  SetIslandEnabledInput,
  ShowMainWindowInput,
} from "./ipc-dock";
import type { AgentEyesState, StopAgentEyesInput } from "./ipc-eyes";
import type {
  LibraryFileIdInput,
  LibraryItem,
  LibraryUsage,
  ListLibraryInput,
  OpenLibraryFileInput,
  SaveChatAttachmentInput,
} from "./ipc-library";
import type {
  AddMcpServerInput,
  AgentMcpServerSetting,
  McpServer,
  McpServerIdInput,
  SetAgentMcpServerInput,
  UpdateMcpServerInput,
} from "./ipc-mcp";
import type {
  AgentMemory,
  AgentMemorySettings,
  DeleteAgentMemoryInput,
  DeleteChannelMemoryInput,
  ListAgentMemoriesInput,
  SaveAgentMemoryInput,
  SaveChannelMemoryInput,
  SearchAgentMemoriesInput,
  SetAgentMemoryLimitInput,
} from "./ipc-memory";
import type {
  CreateRoutineInput,
  Routine,
  RoutineIdInput,
  RoutineRun,
  RoutineWithSecret,
  UpdateRoutineInput,
} from "./ipc-routines";
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
  DeleteSkillInput,
  InstallSkillInput,
  ListSkillInstallsInput,
  LocalSkill,
  ReadSkillInput,
  RestoreSkillVersionInput,
  SkillContent,
  SkillIdInput,
  SkillInstall,
  SkillVersion,
  UninstallSkillInput,
  UpdateSkillInstallInput,
} from "./ipc-skills";
import type {
  CreateTableInput,
  DeleteTableRowInput,
  InsertTableRowsInput,
  QueryTableRowsInput,
  SharedTable,
  TableIdInput,
  TableRow,
  TableRowPage,
  TableWriteResult,
  UpdateTableRowInput,
} from "./ipc-tables";
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
import type {
  DeleteVaultItemInput,
  RespondToVaultRequestInput,
  SaveVaultItemInput,
  VaultItemSummary,
  VaultStatus,
} from "./ipc-vault";
import type {
  ChannelMemberInput,
  ChannelMemory,
  ChannelMessage,
  ChannelTask,
  ChannelTaskActionInput,
  CreateWorkspaceChannelInput,
  ListChannelMessagesInput,
  ReassignChannelTaskInput,
  SendChannelMessageInput,
  UpdateWorkspaceChannelInput,
  WorkspaceChannel,
} from "./ipc-workspace-channels";

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
  /** COSGRAL W1-BE3: decide a draft preview / confirm card (local server only). */
  respondToDraftPreview?: (input: RespondToDraftPreviewInput) => Promise<void>;
  /** COSGRAL W1-BE3: take over, return or decline a browser takeover request (local server only). */
  respondToBrowserTakeover?: (input: RespondToBrowserTakeoverInput) => Promise<void>;
  /** COSGRAL W1-BE3: drafts kept with "keep-draft", newest first; then follow `drafts-changed`. */
  listDrafts?: () => Promise<KeptDraft[]>;
  deleteDraft?: (input: DeleteDraftInput) => Promise<void>;
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

/** COSGRAL W1: channels and channel tasks (see ipc-workspace-channels.ts). */
export interface ChannelsDesktopApi {
  /** Optional until all renderer mocks implement channel history/composer. */
  listMessages?: (input: ListChannelMessagesInput) => Promise<ChannelMessage[]>;
  sendMessage?: (input: SendChannelMessageInput) => Promise<{ message: ChannelMessage; task: ChannelTask }>;
  list: () => Promise<WorkspaceChannel[]>;
  /** All tasks of the channel, archived ones included (filter on `archivedAt`). */
  listTasks: (channelId: string) => Promise<ChannelTask[]>;
  /** COSGRAL W2: the channel's shared memory, oldest first. Optional until every renderer mock has it. */
  listMemories?: (channelId: string) => Promise<ChannelMemory[]>;
  /** A person adds an entry (no memoryId) or edits one (memoryId). At most 500 characters. */
  saveMemory?: (input: SaveChannelMemoryInput) => Promise<ChannelMemory>;
  deleteMemory?: (input: DeleteChannelMemoryInput) => Promise<void>;
  create: (input: CreateWorkspaceChannelInput) => Promise<WorkspaceChannel>;
  update: (input: UpdateWorkspaceChannelInput) => Promise<WorkspaceChannel>;
  addMember: (input: ChannelMemberInput) => Promise<WorkspaceChannel>;
  removeMember: (input: ChannelMemberInput) => Promise<WorkspaceChannel>;
  setLead: (input: ChannelMemberInput) => Promise<WorkspaceChannel>;
  /** Stop, pause, resume, archive or restore a task. */
  actOnTask: (input: ChannelTaskActionInput) => Promise<ChannelTask>;
  reassignTask: (input: ReassignChannelTaskInput) => Promise<ChannelTask>;
}

/** COSGRAL W2: an agent's private memory, for the agent settings page (see ipc-memory.ts). */
export interface MemoryDesktopApi {
  /** Newest change first. */
  listAgentMemories: (input: ListAgentMemoriesInput) => Promise<AgentMemory[]>;
  /** Add (no memoryId) or edit (memoryId). Adding at the storage limit rejects with a clear message. */
  saveAgentMemory: (input: SaveAgentMemoryInput) => Promise<AgentMemory>;
  deleteAgentMemory: (input: DeleteAgentMemoryInput) => Promise<void>;
  searchAgentMemories: (input: SearchAgentMemoriesInput) => Promise<AgentMemory[]>;
  getAgentSettings: (botId: string) => Promise<AgentMemorySettings>;
  /** Change the storage limit; a limit below the saved count keeps every entry and only blocks new ones. */
  setAgentLimit: (input: SetAgentMemoryLimitInput) => Promise<AgentMemorySettings>;
}

/** COSGRAL W2: the local skill library and the skills installed for each agent (see ipc-skills.ts). */
export interface SkillsDesktopApi {
  /** Library skills, by name. */
  list: () => Promise<LocalSkill[]>;
  /** SKILL.md and the file list of one version (latest when `version` is omitted). */
  read: (input: ReadSkillInput) => Promise<SkillContent>;
  /** Every stored version, oldest first. */
  listVersions: (input: SkillIdInput) => Promise<SkillVersion[]>;
  /** Rollback: a new library version with the content of an older one; installed copies stay as they are. */
  restoreVersion: (input: RestoreSkillVersionInput) => Promise<LocalSkill>;
  /** Removes the skill and its versions, and uninstalls it from every agent. */
  delete: (input: DeleteSkillInput) => Promise<void>;
  listInstalls: (input?: ListSkillInstallsInput) => Promise<SkillInstall[]>;
  /** Gives one agent its own copy of a version. Other agents are not changed. */
  install: (input: InstallSkillInput) => Promise<SkillInstall>;
  /** Moves an agent's copy to the latest version; a changed copy needs `overwriteLocalChanges`. */
  update: (input: UpdateSkillInstallInput) => Promise<SkillInstall>;
  uninstall: (input: UninstallSkillInput) => Promise<void>;
}

/** COSGRAL W2: routines and webhooks (see ipc-routines.ts). */
export interface RoutinesDesktopApi {
  /** Every routine, or one agent's routines. */
  list: (botId?: string) => Promise<Routine[]>;
  /** A webhook routine's secret comes back here once; schedule routines have secret null. */
  create: (input: CreateRoutineInput) => Promise<RoutineWithSecret>;
  update: (input: UpdateRoutineInput) => Promise<Routine>;
  delete: (input: RoutineIdInput) => Promise<void>;
  /** Start a run now (a paused routine is not started). */
  runNow: (input: RoutineIdInput) => Promise<RoutineRun>;
  /** Newest first. */
  listRuns: (input: RoutineIdInput) => Promise<RoutineRun[]>;
  /** A new webhook secret, shown once; the old one stops working. */
  regenerateSecret: (input: RoutineIdInput) => Promise<RoutineWithSecret>;
}

/** COSGRAL W2: MCP servers of the program and the per-agent switch (see ipc-mcp.ts). */
export interface McpDesktopApi {
  /** Every server with its status and tools. Secret values are never returned, only their names. */
  list: () => Promise<McpServer[]>;
  /** Adds the server and starts connecting ("checking"); the result of the check comes as `mcp-servers-changed`. */
  add: (input: AddMcpServerInput) => Promise<McpServer>;
  /** Changes the server and reconnects it. */
  update: (input: UpdateMcpServerInput) => Promise<McpServer>;
  /** Removes the server; its tools leave every agent from the next turn and running calls fail. */
  remove: (input: McpServerIdInput) => Promise<void>;
  /** Connects again, e.g. after a login or a fixed command. */
  reconnect: (input: McpServerIdInput) => Promise<McpServer>;
  /** One entry per server for this agent (servers are on unless the person switched them off). */
  listAgentSettings: (botId: string) => Promise<AgentMcpServerSetting[]>;
  setAgentEnabled: (input: SetAgentMcpServerInput) => Promise<AgentMcpServerSetting[]>;
}

/**
 * COSGRAL W2: the local Vault (see ipc-vault.ts). Secrets go in only through `save`; nothing returns them.
 * Vault requests of agents come with `agent.listPendingRequests()` and the `vault-request` event.
 */
export interface VaultDesktopApi {
  status: () => Promise<VaultStatus>;
  /** Summaries without secret values, newest first. */
  list: () => Promise<VaultItemSummary[]>;
  /** A new item, or a change of `id` that keeps every secret field left out. */
  save: (input: SaveVaultItemInput) => Promise<VaultItemSummary>;
  delete: (input: DeleteVaultItemInput) => Promise<void>;
  /** Answer an agent's request with the item to use (saved now or chosen), or decline it. */
  respondToRequest: (input: RespondToVaultRequestInput) => Promise<void>;
}

/**
 * COSGRAL W2: shared tables (see ipc-tables.ts), the same data every agent reads and writes.
 * Changes come as `tables-changed` and `table-rows-changed` events.
 */
export interface TablesDesktopApi {
  /** Every table, by name. */
  list: () => Promise<SharedTable[]>;
  create: (input: CreateTableInput) => Promise<SharedTable>;
  /** Deletes the table and its rows for every agent. */
  delete: (input: TableIdInput) => Promise<void>;
  queryRows: (input: QueryTableRowsInput) => Promise<TableRowPage>;
  insertRows: (input: InsertTableRowsInput) => Promise<TableRow[]>;
  /** A stale `expectedVersion` returns `conflict` with the current row and writes nothing. */
  updateRow: (input: UpdateTableRowInput) => Promise<TableWriteResult>;
  deleteRow: (input: DeleteTableRowInput) => Promise<TableWriteResult>;
}

/**
 * COSGRAL W2: the file library (see ipc-library.ts): one store, two views. `list` returns library files
 * (origin "upload" or "agent") and chat attachments (origin "chat"). Changes come as `library-changed`.
 */
/**
 * COSGRAL W3: Computer Use (see ipc-computer-use.ts). The consent card is a confirm card in Needs you; changes come
 * as `computer-use-changed`.
 */
export interface ComputerUseDesktopApi {
  getState: () => Promise<ComputerUseState>;
  /** Ends the session at once and takes the permission back: one agent with `botId`, otherwise every agent. */
  stop: (input?: StopComputerUseInput) => Promise<ComputerUseState>;
}

export interface LibraryDesktopApi {
  /** Newest first. */
  list: (input?: ListLibraryInput) => Promise<LibraryItem[]>;
  /** Space used by library files (chat attachments are not counted) and the limit. */
  usage: () => Promise<LibraryUsage>;
  /** Opens the system file picker and saves the chosen files in the library. */
  choose: () => Promise<LibraryItem[]>;
  /** Saves dropped or pasted files in the library. */
  addFiles: (files: File[]) => Promise<LibraryItem[]>;
  /** Keeps a copy of a chat attachment among the library files. */
  saveFromChat: (input: SaveChatAttachmentInput) => Promise<LibraryItem>;
  /** Deletes a library file and frees its space. A chat attachment stays with its message. */
  delete: (input: LibraryFileIdInput) => Promise<void>;
  /** "download" asks where to save a copy; "reveal" shows the file in its folder. */
  open: (input: OpenLibraryFileInput) => Promise<void>;
  /** Adds the file to the composer as an attachment of the next message, like a picked file. */
  attachToDraft: (input: LibraryFileIdInput) => Promise<DraftAttachment>;
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
  /** COSGRAL W2 skill library (this computer only). Optional until every renderer mock implements it. */
  skills?: SkillsDesktopApi;
  /** COSGRAL W2: MCP servers. Optional until every renderer mock implements it. */
  mcp?: McpDesktopApi;
  /** COSGRAL W2 local Vault (this computer only). Optional until every renderer mock implements it. */
  vault?: VaultDesktopApi;
  /** COSGRAL W2: routines and webhooks. Optional until every renderer mock implements it. */
  routines?: RoutinesDesktopApi;
  /** COSGRAL W2 shared tables (this computer only). Optional until every renderer mock implements it. */
  tables?: TablesDesktopApi;
  /** COSGRAL W2 file library (this computer only). Optional until every renderer mock implements it. */
  library?: LibraryDesktopApi;
  /** COSGRAL W3 Computer Use (this computer only). Optional until every renderer mock implements it. */
  computerUse?: ComputerUseDesktopApi;
  /** COSGRAL W3 agent dock (this computer only). Optional until every renderer mock implements it. */
  dock?: DockDesktopApi;
  /** COSGRAL W3 Dynamic Island (this computer only). Optional until every renderer mock implements it. */
  island?: IslandDesktopApi;
}

/**
 * COSGRAL W3: the agent dock (see ipc-dock.ts). Every call returns the whole new state; every window also gets
 * `dock-changed`. The mini chats use the usual `agent` API (readConversation, sendMessage, onEvent).
 */
export interface DockDesktopApi {
  getState: () => Promise<DockState>;
  /** Pinning an agent that is already pinned moves it; more than `DOCK_LIMITS.pins` agents is an error. */
  pin: (input: PinDockAgentInput) => Promise<DockState>;
  unpin: (input: DockAgentInput) => Promise<DockState>;
  reorder: (input: ReorderDockInput) => Promise<DockState>;
  setPinHidden: (input: SetDockPinHiddenInput) => Promise<DockState>;
  setSize: (input: SetDockSizeInput) => Promise<DockState>;
  /** Shows or hides the dock window. */
  setVisible: (input: SetDockVisibleInput) => Promise<DockState>;
  openChat: (input: OpenDockChatInput) => Promise<DockState>;
  /** "Open COSGRAL": the main window again (created when it was closed), at an agent or a card when given. */
  showMainWindow: (input?: ShowMainWindowInput) => Promise<void>;
}

/** COSGRAL W3: the Dynamic Island (see ipc-dock.ts). Changes come as `island-changed`. */
export interface IslandDesktopApi {
  getState: () => Promise<IslandState>;
  setEnabled: (input: SetIslandEnabledInput) => Promise<IslandState>;
  /** The click on the island: opens the main window at the card of the shown state (`island-open-request`). */
  activate: () => Promise<IslandState>;
  /** Hides a "message" or "error" state until something new happens. */
  dismiss: () => Promise<IslandState>;
}
