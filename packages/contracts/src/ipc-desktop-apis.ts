import type { AccessDesktopApi } from "./ipc-access";
import type { AcpLoginDesktopApi } from "./ipc-acp-login";
import type { AcpPresetsDesktopApi } from "./ipc-acp-presets";
import type {
  DeleteDraftInput,
  KeptDraft,
  RespondToBrowserTakeoverInput,
  RespondToDraftPreviewInput,
} from "./ipc-action-cards";
import type { AgentCardsDesktopApi } from "./ipc-agent-cards";
import type {
  AgentSettings,
  AgentTemplate,
  AgentTemplateIdInput,
  AppSettings,
  CompleteOnboardingInput,
  CreateAgentInput,
  CreateAgentResult,
  DuplicateAgentInput,
  OnboardingState,
  SaveAgentTemplateInput,
  UpdateAgentSettingsInput,
  UpdateAppSettingsInput,
} from "./ipc-agent-settings";
import type { ApiKeysDesktopApi } from "./ipc-api-keys";
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
import type { AppDataDesktopApi } from "./ipc-app-data";
import type { ApprovalRulesDesktopApi } from "./ipc-approval-rules";
import type { AgentActivity, PendingAgentRequest } from "./ipc-attention";
import type { BrowserControlState, BrowserOpenInput, BrowserTab, BrowserVisibilityInput } from "./ipc-browser";
import type { BrowserProfilesDesktopApi } from "./ipc-browser-profiles";
import type { BudgetsDesktopApi } from "./ipc-budgets";
import type { BuiltinSkillsDesktopApi } from "./ipc-builtin-skills";
import type { ChannelRoutinesDesktopApi } from "./ipc-channel-routines";
import type { ComposerDesktopApi } from "./ipc-composer";
import type { ComputerUseState, StopComputerUseInput } from "./ipc-computer-use";
import type { ContextDesktopApi } from "./ipc-context";
import type {
  AccountUsage,
  AgentEvent,
  AgentModelId,
  AgentModelOption,
  AgentStatus,
  AttachmentImportEvent,
  BotSummary,
  CancelQueuedMessageInput,
  ConversationReadState,
  ConversationWithReadState,
  DraftAttachment,
  InterruptTurnInput,
  ListBotsInput,
  MarkConversationReadInput,
  OpenAttachmentInput,
  QueuedMessageReceipt,
  QueueSnapshot,
  ReorderQueueInput,
  RespondToApprovalInput,
  RespondToPromptInput,
  SendMessageInput,
  SetAgentAvatarInput,
  SetBotHiddenInput,
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
import type { EndpointsDesktopApi } from "./ipc-endpoints";
import type { AgentEyesState, StopAgentEyesInput } from "./ipc-eyes";
import type { LibraryViewDesktopApi, ScheduleDesktopApi, UsageReportDesktopApi } from "./ipc-insights";
import type { InstanceTransferDesktopApi, UpdatePreferencesDesktopApi } from "./ipc-instance-transfer";
import type { IntegrationsDesktopApi } from "./ipc-integrations";
import type { IsolationDesktopApi } from "./ipc-isolation";
import type {
  LibraryFileIdInput,
  LibraryItem,
  LibraryUsage,
  ListLibraryInput,
  OpenLibraryFileInput,
  SaveChatAttachmentInput,
} from "./ipc-library";
import type { MachineFilesDesktopApi } from "./ipc-machine-files";
import type { MarketplaceDesktopApi } from "./ipc-marketplace";
import type {
  AddMcpServerInput,
  AgentMcpServerSetting,
  McpServer,
  McpServerIdInput,
  SetAgentMcpServerInput,
  UpdateMcpServerInput,
} from "./ipc-mcp";
import type { McpOAuthDesktopApi } from "./ipc-mcp-oauth";
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
import type { MessageActionsDesktopApi } from "./ipc-message-actions";
import type { MessageMenuDesktopApi } from "./ipc-message-menu";
import type { MessengersDesktopApi } from "./ipc-messengers";
import type { MobileDesktopApi } from "./ipc-mobile";
import type { MobileConnectDesktopApi } from "./ipc-mobile-connect";
import type { PhoneDesktopApi } from "./ipc-phone-access";
import type { PlansDesktopApi } from "./ipc-plan";
import type { PluginCatalogDesktopApi } from "./ipc-plugin-catalog";
import type { ProjectPlansDesktopApi } from "./ipc-project-plans";
import type { ProviderCatalogDesktopApi } from "./ipc-provider-catalog";
import type {
  AcpAgentConfig,
  AcpAgentIdInput,
  FallbackModelsInfo,
  FallbackModelsInput,
  ProviderUsage,
  SaveAcpAgentInput,
} from "./ipc-providers";
import type {
  ConnectRemoteDesktopInput,
  EnableRemoteDesktopInput,
  RemoteDesktopClientState,
  RemoteDesktopFrame,
  RemoteDesktopHostState,
  RemoteDesktopInput,
  RemoteDesktopPeerInput,
  RemoteDesktopTokenResult,
  SetRemoteDesktopAskEverySessionInput,
  SetRemoteDesktopPeerPolicyInput,
  SetRemoteDesktopSessionModeInput,
  StopRemoteDesktopInput,
} from "./ipc-remote-desktop";
import type {
  CreateRoutineInput,
  Routine,
  RoutineIdInput,
  RoutineRun,
  RoutineWithSecret,
  UpdateRoutineInput,
} from "./ipc-routines";
import type { SearchDesktopApi } from "./ipc-search";
import type { ServerSettingsDesktopApi } from "./ipc-server-settings";
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
import type { SpacesDesktopApi } from "./ipc-spaces";
import type { SubagentsDesktopApi } from "./ipc-subagents";
import type { SubscriptionsDesktopApi } from "./ipc-subscriptions";
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
import type { TasksViewDesktopApi } from "./ipc-tasks-view";
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
import type { ThreadTabsDesktopApi } from "./ipc-thread-tabs";
import type { ThreadUndoDesktopApi } from "./ipc-thread-undo";
import type { ThreadsDesktopApi } from "./ipc-threads";
import type {
  DeleteVaultItemInput,
  RespondToVaultRequestInput,
  SaveVaultItemInput,
  VaultItemSummary,
  VaultStatus,
} from "./ipc-vault";
import type { VaultConnectorsDesktopApi, VaultSecretsDesktopApi } from "./ipc-vault-connectors";
import type { WindowsDesktopApi } from "./ipc-windows";
import type { WorkflowVersionDetails, WorkflowVersionInput, WorkflowVersionSummary } from "./ipc-workflow-versions";
import type {
  CreateWorkflowInput,
  RunWorkflowInput,
  UpdateWorkflowInput,
  Workflow,
  WorkflowIdInput,
  WorkflowRun,
  WorkflowRunIdInput,
} from "./ipc-workflows";
import type {
  ChannelHistoryCleared,
  ChannelMemberInput,
  ChannelMemory,
  ChannelMessage,
  ChannelTask,
  ChannelTaskActionInput,
  ClearChannelHistoryInput,
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
  /** COSGRAL W4-K3: with no input, every agent (hidden ones have `hidden: true`); `{ includeHidden: false }` = only visible ones. */
  listBots: (input?: ListBotsInput) => Promise<BotSummary[]>;
  createBot: () => Promise<BotSummary>;
  /** COSGRAL W4-BE2: start the agent CLIs again after a failed start; answers with the new status. This computer only. */
  retryStart?: () => Promise<AgentStatus>;
  updateBot: (input: UpdateBotInput) => Promise<BotSummary>;
  setAvatar: (input: SetAgentAvatarInput) => Promise<BotSummary>;
  /** COSGRAL W4-K3: hide an agent from the sidebar or show it again; it keeps working. `bots-changed` follows. This computer only. */
  setBotHidden: (input: SetBotHiddenInput) => Promise<BotSummary>;
  /** COSGRAL W4-K3: a new agent with the source's settings but without its memory and history (see DuplicateAgentInput). This computer only. */
  duplicateBot: (input: DuplicateAgentInput) => Promise<CreateAgentResult>;
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
  readonly supportsMessageReplies?: boolean;
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
  /** COSGRAL W12: remove the messages and tasks of a channel (refused while a task is queued, running, waiting or paused). */
  clearHistory?: (input: ClearChannelHistoryInput) => Promise<ChannelHistoryCleared>;
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

/** COSGRAL W3: ACP agents, fallback models, usage and limits (see ipc-providers.ts). */
export interface ProvidersDesktopApi {
  listAcpAgents: () => Promise<AcpAgentConfig[]>;
  /** Add or edit; the agent's model id is `acp:<id>`. */
  saveAcpAgent: (input: SaveAcpAgentInput) => Promise<AcpAgentConfig>;
  removeAcpAgent: (input: AcpAgentIdInput) => Promise<void>;
  /** One entry per provider (and per ACP agent) with limit state and reset time. */
  listUsage: () => Promise<ProviderUsage[]>;
  getFallbackModels: (botId: string) => Promise<AgentModelId[]>;
  /**
   * Up to 8, in order, no repeats. `botId` is an agent, "*" (GENERAL_FALLBACK_SCOPE, all providers) or, W5-BE7, a
   * provider list "provider:codex" | "provider:claude" | "provider:acp:<id>" | "provider:endpoint:<id>".
   */
  setFallbackModels: (input: FallbackModelsInput) => Promise<AgentModelId[]>;
  /** W5-BE4/BE7: the lists and the chain an agent really tries (own → provider → general), with each model's source. */
  getFallbackInfo?: (botId: string) => Promise<FallbackModelsInfo>;
  /** W5-BE4/BE7: forget the saved list of `botId`; an agent then follows its provider list and the general list. */
  resetFallbackModels?: (botId: string) => Promise<FallbackModelsInfo>;
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

/** COSGRAL W3: workflows drawn on a canvas (see ipc-workflows.ts). This computer only. */
export interface WorkflowsDesktopApi {
  /** Oldest first. */
  list: () => Promise<Workflow[]>;
  /** Refused with the list of problems when `workflowProblems` finds any, or an agent or channel is unknown. */
  create: (input: CreateWorkflowInput) => Promise<Workflow>;
  update: (input: UpdateWorkflowInput) => Promise<Workflow>;
  /** Also removes its runs. */
  delete: (input: WorkflowIdInput) => Promise<void>;
  /** Start a run now; a paused workflow, or one that is already running, is refused. */
  run: (input: RunWorkflowInput) => Promise<WorkflowRun>;
  /** Ends an open run as "cancelled" and closes its approval card. */
  cancelRun: (input: WorkflowRunIdInput) => Promise<WorkflowRun>;
  /** Newest first, at most the last 100. */
  listRuns: (input: WorkflowIdInput) => Promise<WorkflowRun[]>;
  /** Newest first, at most WORKFLOW_VERSION_LIMITS.kept; a workflow made before versions existed gets its first one here. */
  listVersions: (input: WorkflowIdInput) => Promise<WorkflowVersionSummary[]>;
  /** One version with its graph (for a preview and for `diffWorkflowGraphs`). */
  getVersion: (input: WorkflowVersionInput) => Promise<WorkflowVersionDetails>;
  /** Puts that graph back as the current one (checked like a save) and keeps it as a new version. Returns the workflow. */
  restoreVersion: (input: WorkflowVersionInput) => Promise<Workflow>;
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
/**
 * COSGRAL W3: full agent settings, templates and the agent creator (see ipc-agent-settings.ts). Changes come as
 * `agent-settings-changed`, `agent-templates-changed` and, for name, model and the rest of the profile, `bots-changed`.
 */
export interface AgentSettingsDesktopApi {
  get: (botId: string) => Promise<AgentSettings>;
  /** One save for the whole screen; returns the settings after the change. */
  update: (input: UpdateAgentSettingsInput) => Promise<AgentSettings>;
  /** Built-in templates first, then saved ones. */
  listTemplates: () => Promise<AgentTemplate[]>;
  saveTemplate: (input: SaveAgentTemplateInput) => Promise<AgentTemplate>;
  /** Saved templates only; built-in ones cannot be deleted. */
  deleteTemplate: (input: AgentTemplateIdInput) => Promise<void>;
  /** The agent creator. */
  createAgent: (input: CreateAgentInput) => Promise<CreateAgentResult>;
}

/** COSGRAL W3: language, the notification matrix and which settings tabs exist. */
export interface AppSettingsDesktopApi {
  get: () => Promise<AppSettings>;
  update: (input: UpdateAppSettingsInput) => Promise<AppSettings>;
}

/** COSGRAL W3: onboarding (language, first provider, first agent from a proposal, Computer Use). */
export interface OnboardingDesktopApi {
  getState: () => Promise<OnboardingState>;
  /** Saves the language and the provider, starts it and creates the first agent from the chosen proposal. */
  complete: (input: CompleteOnboardingInput) => Promise<OnboardingState>;
}

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
  /** COSGRAL W3: workflows. Optional until every renderer mock implements it. */
  workflows?: WorkflowsDesktopApi;
  /** COSGRAL W2 shared tables (this computer only). Optional until every renderer mock implements it. */
  tables?: TablesDesktopApi;
  /** COSGRAL W2 file library (this computer only). Optional until every renderer mock implements it. */
  library?: LibraryDesktopApi;
  /** COSGRAL W3 Computer Use (this computer only). Optional until every renderer mock implements it. */
  computerUse?: ComputerUseDesktopApi;
  /** COSGRAL W3: providers. Optional until every renderer mock implements it. */
  providers?: ProvidersDesktopApi;
  /** COSGRAL W3 agent dock (this computer only). Optional until every renderer mock implements it. */
  dock?: DockDesktopApi;
  /** COSGRAL W3 Dynamic Island (this computer only). Optional until every renderer mock implements it. */
  island?: IslandDesktopApi;
  /** COSGRAL W3 agent settings, templates and creator (this computer only). Optional until every mock has it. */
  agentSettings?: AgentSettingsDesktopApi;
  /** COSGRAL W3 app settings (this computer only). Optional until every renderer mock implements it. */
  appSettings?: AppSettingsDesktopApi;
  /** COSGRAL W3 onboarding (this computer only). Optional until every renderer mock implements it. */
  onboarding?: OnboardingDesktopApi;
  /** COSGRAL W3 remote desktop (this computer only). Optional until every renderer mock implements it. */
  remoteDesktop?: RemoteDesktopDesktopApi;
  /** COSGRAL built-in skills: superpowers, i-have-adhd, graphify (this computer only). Optional until every mock has it. */
  builtinSkills?: BuiltinSkillsDesktopApi;
  /** COSGRAL W3 local Marketplace (this computer only). Optional until every renderer mock implements it. */
  marketplace?: MarketplaceDesktopApi;
  /** COSGRAL W3 Mobile Connect (this computer only). Optional until every renderer mock implements it. */
  mobile?: MobileDesktopApi;
  /** COSGRAL W3-KK3 "always allow" rules of approval cards (this computer only). Optional until every mock has it. */
  approvalRules?: ApprovalRulesDesktopApi;
  /** COSGRAL W4-BE5 "Delete my data" (this computer only). Optional until every renderer mock implements it. */
  appData?: AppDataDesktopApi;
  /** COSGRAL W5 subscriptions: managed CLIs (BE1), later accounts and keys. Optional until every mock implements it. */
  subscriptions?: SubscriptionsDesktopApi;
  /** COSGRAL W6-BE1: several threads per agent (this computer only). Optional until every mock implements it. */
  threads?: ThreadsDesktopApi;
  /** COSGRAL W12 (BE-K): delete a thread with a few minutes to bring it back. */
  threadUndo?: ThreadUndoDesktopApi;
  /** COSGRAL W12 (BE-R): routines of a channel (the lead gets the prompt as a message at the planned time). */
  channelRoutines?: ChannelRoutinesDesktopApi;
  /** COSGRAL: the plan of a project made by its lead, with separate yes or no for skills and for the plugin review (this computer only). */
  projectPlans?: ProjectPlansDesktopApi;
  /** COSGRAL W6-BE3: the plan card (this computer only). Optional until every mock implements it. */
  plans?: PlansDesktopApi;
  /** COSGRAL W6-BE4: the subagents of a thread, and Stop (this computer only). Optional until every mock implements it. */
  subagents?: SubagentsDesktopApi;
  /** COSGRAL W6-BE5: sign in to an ACP agent with a link and a code (this computer only). Optional until every mock implements it. */
  acpLogin?: AcpLoginDesktopApi;
  /** COSGRAL W6-BE5: ready settings for Gemini CLI and Antigravity in Providers (this computer only). Optional until every mock implements it. */
  acpPresets?: AcpPresetsDesktopApi;
  /** COSGRAL W8-BE1: the access level, added and excluded folders of an agent (this computer only). Optional until every mock implements it. */
  access?: AccessDesktopApi;
  /** COSGRAL W8-BE2: what isolation of the processes this computer can do, and what is in force for each agent (this computer only). */
  isolation?: IsolationDesktopApi;
  /** COSGRAL W6-BE3: retry, edit, delete and pin a message (this computer only). Optional until every mock implements it. */
  messageActions?: MessageActionsDesktopApi;
  /** COSGRAL W12 (BE-J): the menu of one message (which actions it offers now, and why not) in one read. */
  messageMenu?: MessageMenuDesktopApi;
  /** COSGRAL W5-BE3: provider API keys (encrypted, masked answers). Optional until every mock implements it. */
  apiKeys?: ApiKeysDesktopApi;
  /** COSGRAL W5-K2: own model endpoints (OpenAI-compatible, Ollama, LM Studio). Optional until every mock implements it. */
  endpoints?: EndpointsDesktopApi;
  /** COSGRAL W6-BE2: context of a conversation (indicator, compaction, settings). Optional until every mock implements it. */
  context?: ContextDesktopApi;
  /** COSGRAL W6-KK3: separate conversation windows (open, list, close). Optional until every mock implements it. */
  windows?: WindowsDesktopApi;
  /** COSGRAL W8-KK1: client spaces (separate data folders; a switch restarts the program). Optional until every mock implements it. */
  spaces?: SpacesDesktopApi;
  /** COSGRAL W8-KK2: budgets and the cost counter (tokens, dollars only from reported prices). Optional until every mock implements it. */
  budgets?: BudgetsDesktopApi;
  /** COSGRAL W8-KK3: browser profiles per agent (own cookies and storage, domain lists, clear). Optional until every mock implements it. */
  browserProfiles?: BrowserProfilesDesktopApi;
  /** COSGRAL W10-KK1: account sign-ins for apps (GitHub, Google, Notion, Meta) as MCP servers. Optional until every mock implements it. */
  integrations?: IntegrationsDesktopApi;
  /** COSGRAL W9-BE1: the phone away from home (Tailscale guide, push switch, PIN state of the paired phones). Optional until every mock implements it. */
  phone?: PhoneDesktopApi;
  /** COSGRAL W11 (U3): the search box (agents, channels, messages, files, routines). Optional until every mock implements it. */
  search?: SearchDesktopApi;
  /** COSGRAL W11 (U4, U5): the message box: side question, slash commands, mentions. Optional until every mock implements it. */
  composer?: ComposerDesktopApi;
  /** COSGRAL W11 (U6): the tabs of the threads of an agent. Optional until every mock implements it. */
  threadTabs?: ThreadTabsDesktopApi;
  /** COSGRAL W11 (BE-B): overview of the agent cards and the small per-agent choices. */
  agentCards?: AgentCardsDesktopApi;
  /** COSGRAL W12 (BE-D): the 14 sections of the server settings. */
  serverSettings?: ServerSettingsDesktopApi;
  /** COSGRAL W12 (BE-E): the catalog of the 18 providers with the state on this computer. */
  providerCatalog?: ProviderCatalogDesktopApi;
  /** COSGRAL W12 (BE-H): the library page, the usage report and the schedule (screens that read what the program holds). */
  libraryView?: LibraryViewDesktopApi;
  /** Library › Files › This computer: folders the person shares (person only). Optional until every mock implements it. */
  machineFiles?: MachineFilesDesktopApi;
  usageReport?: UsageReportDesktopApi;
  schedule?: ScheduleDesktopApi;
  /** COSGRAL W12 (BE-J): the Tasks view (all channels in one list; one task with result, steps and log). */
  tasksView?: TasksViewDesktopApi;
  /** COSGRAL W10-KK2: messenger bridge (Telegram; token write-only, allow list of chats, nobody by default). Optional until every mock implements it. */
  messengers?: MessengersDesktopApi;
  /** COSGRAL W11-KK (d): connectors of 1Password, Bitwarden, Proton Pass (token write-only) and the person's Vault tools (reveal, copy, CSV, codes). Optional until every mock implements it. */
  vaultConnectors?: VaultConnectorsDesktopApi;
  vaultSecrets?: VaultSecretsDesktopApi;
  /** COSGRAL W11-KK (e): the Marketplace Apps tab: plugin catalog (from a folder the owner chose), install as MCP servers, own plugins. Optional until every mock implements it. */
  pluginCatalog?: PluginCatalogDesktopApi;
  /** COSGRAL W12-KK (1): sign-in (OAuth) to MCP servers over http: the system browser, a one-time loopback answer, encrypted tokens. Optional until every mock implements it. */
  mcpOAuth?: McpOAuthDesktopApi;
  /** COSGRAL W12-KK: the Mobile Connect page in one query (phones, route, what is not offered). Optional until every mock implements it. */
  mobileConnect?: MobileConnectDesktopApi;
  /** COSGRAL W12-KK (g2): Transfer and Import of agents with one .zip (the paths never reach the window) and the preferences of program updates. Optional until every mock implements it. */
  instanceTransfer?: InstanceTransferDesktopApi;
  updatePreferences?: UpdatePreferencesDesktopApi;
}

/**
 * COSGRAL W3: remote desktop between two Windows computers (see ipc-remote-desktop.ts). `host` is this computer shared
 * to others, `client` is this computer looking at another one. Changes come as `remote-desktop-host-changed` and
 * `remote-desktop-client-changed`; the pictures come through `onFrame` (not through `agent.onEvent`). The consent card
 * for a new viewer is a confirm card in Needs you. Stop is local and ends every session at once.
 */
export interface RemoteDesktopDesktopApi {
  host: RemoteDesktopHostDesktopApi;
  client: RemoteDesktopClientDesktopApi;
  /** Pictures of the host that this computer looks at; at most `REMOTE_DESKTOP_LIMITS.framesPerSecond` a second. */
  onFrame: (listener: (frame: RemoteDesktopFrame) => void) => () => void;
}

export interface RemoteDesktopHostDesktopApi {
  getState: () => Promise<RemoteDesktopHostState>;
  /** Starts listening with a NEW token, returned once (also when sharing was on already: the old token stops working). */
  enable: (input?: EnableRemoteDesktopInput) => Promise<RemoteDesktopTokenResult>;
  /** Stops listening and ends every session. The next `enable` makes a new token. */
  disable: () => Promise<RemoteDesktopHostState>;
  /** A new token; viewers that are connected stay, new ones need the new token. Returned once. */
  regenerateToken: () => Promise<RemoteDesktopTokenResult>;
  setPeerPolicy: (input: SetRemoteDesktopPeerPolicyInput) => Promise<RemoteDesktopHostState>;
  /** The "Ask on this computer" switch: a card for every session, also for viewers that were allowed before. */
  setAskEverySession: (input: SetRemoteDesktopAskEverySessionInput) => Promise<RemoteDesktopHostState>;
  /** Forgets a viewer (its session ends). The next connection asks again. */
  removePeer: (input: RemoteDesktopPeerInput) => Promise<RemoteDesktopHostState>;
  /** "control" to "view" takes the mouse and keyboard away at once; "view" to "control" is refused (the viewer asks anew). */
  setSessionMode: (input: SetRemoteDesktopSessionModeInput) => Promise<RemoteDesktopHostState>;
  /** Ends one session or all of them at once; interrupts an input in progress. */
  stop: (input?: StopRemoteDesktopInput) => Promise<RemoteDesktopHostState>;
}

export interface RemoteDesktopClientDesktopApi {
  getState: () => Promise<RemoteDesktopClientState>;
  /** Resolves when the owner of the host answered ("connected") or the attempt failed ("failed"; see `error`). */
  connect: (input: ConnectRemoteDesktopInput) => Promise<RemoteDesktopClientState>;
  disconnect: () => Promise<RemoteDesktopClientState>;
  /** Fire and forget; refused in "view" mode. Rate limited by the host. */
  sendInput: (input: RemoteDesktopInput) => Promise<void>;
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
