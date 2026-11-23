import type {
  AgentActivity,
  AgentApproval,
  AgentEvent,
  AgentEyesState,
  AgentModelOption,
  AgentStatus,
  AppInfo,
  AppSettings,
  AppSetupState,
  AttachmentImportEvent,
  BotSummary,
  BrowserControlState,
  BrowserOpenInput,
  BrowserTab,
  CentralAuthState,
  CentralAuthUser,
  ConfigureHostInput,
  ConfigureRemoteDesktopInput,
  ConversationMessage,
  ConversationSnapshot,
  CreateTeamInviteInput,
  DirectConversationSnapshot,
  DirectMessage,
  DirectMessageRealtimeEvent,
  DirectThreadSummary,
  DirectTypingRealtimeEvent,
  HostStatus,
  InviteSummary,
  JoinServerInput,
  MacPermissionId,
  MacPermissionsState,
  ManagedCliId,
  ManagedCliState,
  OpenAttachmentInput,
  OpenBotDesktopApi,
  PendingAgentRequest,
  QueueDelivery,
  QueueSnapshot,
  RemoteMacConnectInput,
  RemoteMacSession,
  ReorderQueueInput,
  RespondToApprovalInput,
  RespondToPromptInput,
  SendDirectMessageInput,
  SendMessageInput,
  ServerSummary,
  SetAgentAvatarInput,
  SetMessageReactionInput,
  SetQueuePausedInput,
  SetTeamTypingInput,
  SidebarLayout,
  SteerQueuedMessageInput,
  StopAgentEyesInput,
  TeamInviteSummary,
  TeamMemberSummary,
  TeamPresenceSnapshot,
  TeamSessionSummary,
  ThreadSummary,
  UpdateBotInput,
  UpdateQueuedMessageInput,
  UpdateStatus,
  UpdateTeamMemberInput,
} from "@openbot/contracts/ipc";
import {
  applyWorkspacePatch,
  DEFAULT_APP_APPEARANCE,
  DEFAULT_APP_WORKSPACE,
  defaultNotificationPreferences,
  emptyAgentEyesState,
  isChannelHistoryWindow,
  isPinnedPageIdList,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  normalizeAppTheme,
  parseAppearancePatch,
  parseBehaviorPatch,
  parseWorkspacePatch,
  SETTINGS_TABS,
} from "@openbot/contracts/ipc";
import { isBoolean, isOneOf, isString } from "@openbot/contracts/runtime-values";
import {
  STORY_AGENT_STATUS,
  STORY_APP_INFO,
  STORY_BOT_SUMMARIES,
  STORY_BROWSER_CONTROL,
  STORY_BROWSER_TABS,
  STORY_DIRECT_SNAPSHOTS,
  STORY_DIRECT_THREADS,
  STORY_HOST_STATUS,
  STORY_INVITES,
  STORY_MODELS,
  STORY_PRESENCE,
  STORY_REMOTE_MAC_SESSION,
  STORY_SERVERS,
  STORY_SESSIONS,
  STORY_SNAPSHOTS,
  STORY_TEAM_MEMBERS,
  STORY_UPDATE_STATUS,
  STORY_USAGE,
} from "./fixtures";
import { createMockAccess } from "./mock-access";
import { createMockAccounts } from "./mock-accounts";
import { createMockAcpLogin } from "./mock-acp-login";
import { createMockAcpPresets } from "./mock-acp-presets";
import { createMockAgentCards } from "./mock-agent-cards";
import { createMockApiKeysApi } from "./mock-api-keys-api";
import { createMockBrowserProfiles } from "./mock-browser-profiles";
import { createMockBudgets } from "./mock-budgets";
import { createMockChannelRoutines } from "./mock-channel-routines";
import { createMockComposer, createMockSearch, createMockThreadTabs } from "./mock-composer";
import { createMockContext } from "./mock-context";
import { createMockEndpointsApi } from "./mock-endpoints-api";
import { createMockFallbackModelsApi } from "./mock-fallback-models-api";
import { createMockLibraryView, createMockSchedule, createMockUsageReport } from "./mock-insights";
import { createMockInstanceTransfer } from "./mock-instance-transfer";
import { createMockIntegrations } from "./mock-integrations";
import { createMockIsolation } from "./mock-isolation";
import { createMockMarketplace } from "./mock-marketplace";
import { createMockMcpOAuth } from "./mock-mcp-oauth";
import { createMockMessageActions } from "./mock-message-actions";
import { createMockMessengers } from "./mock-messengers";
import { createMockMobileConnect } from "./mock-mobile-connect";
import { createMockPlans } from "./mock-plans";
import { createMockPluginCatalog } from "./mock-plugin-catalog";
import { createMockProviderCatalog } from "./mock-provider-catalog";
import { createMockRemoteDesktop } from "./mock-remote-desktop";
import { createMockRoutines } from "./mock-routines";
import { createMockServerSettings } from "./mock-server-settings";
import { createMockSidebar } from "./mock-sidebar";
import { createMockSpaces } from "./mock-spaces";
import { createMockSubagents } from "./mock-subagents";
import { createMockTasksView } from "./mock-tasks-view";
import { createMockThreads } from "./mock-threads";
import { createMockVaultConnectors } from "./mock-vault-connectors";
import { createMockW2 } from "./mock-w2";
import { createMockW2Ui2 } from "./mock-w2-ui2";
import { createMockWindows } from "./mock-windows";
import { createMockWorkflows } from "./mock-workflows";

type Listener<T> = (value: T) => void;

export interface MockOpenBotOptions {
  appInfo?: AppInfo;
  authState?: CentralAuthState;
  setupState?: AppSetupState;
  agentStatus?: AgentStatus;
  bots?: typeof STORY_BOT_SUMMARIES;
  models?: AgentModelOption[];
  snapshots?: Record<string, ConversationSnapshot>;
  browserTabs?: BrowserTab[];
  browserControlState?: BrowserControlState;
  servers?: ServerSummary[];
  presence?: TeamPresenceSnapshot;
  directThreads?: DirectThreadSummary[];
  directSnapshots?: Record<string, DirectConversationSnapshot>;
  hostStatus?: HostStatus;
  teamMembers?: TeamMemberSummary[];
  invites?: TeamInviteSummary[];
  sessions?: TeamSessionSummary[];
  remoteMacSessions?: RemoteMacSession[];
  updateStatus?: UpdateStatus;
  /** Agents that are looking at a window, screen or camera when the mock starts. */
  eyesState?: AgentEyesState;
  /** COSGRAL W1: cards that are already open when the window starts (oldest first), like after a reload. */
  pendingRequests?: PendingAgentRequest[];
  /** COSGRAL W1: the row state of agents when the window starts. */
  activity?: AgentActivity[];
  /** COSGRAL W1: folders and placements saved before the window starts. */
  sidebarLayout?: SidebarLayout;
}

export interface MockOpenBotControls {
  api: OpenBotDesktopApi;
  emitAgentEvent: (event: AgentEvent) => void;
  emitAuthState: (state: CentralAuthState) => void;
  emitPresence: (snapshot: TeamPresenceSnapshot) => void;
  emitDirectMessage: (event: DirectMessageRealtimeEvent) => void;
  emitDirectTyping: (event: DirectTypingRealtimeEvent) => void;
  emitInvite: (inviteUrl: string) => void;
  emitHostStatus: (status: HostStatus) => void;
  emitRemoteMacSessions: (sessions: RemoteMacSession[]) => void;
  /** Replace the eyes state and emit `eyes-changed`. */
  emitEyesState: (state: AgentEyesState) => void;
  /** Replace one agent's row state and emit `activity-changed`. */
  emitActivity: (activity: AgentActivity) => void;
  /** Replace the folder layout (as if another window changed it) and emit `sidebar-layout-changed`. */
  emitSidebarLayout: (layout: SidebarLayout) => void;
  /** Cards the mock still holds open: what `listPendingRequests()` returns, oldest first. */
  pendingRequests: () => PendingAgentRequest[];
  dispose: () => void;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createMockOpenBot(options: MockOpenBotOptions = {}): MockOpenBotControls {
  const managedCli = new Map<ManagedCliId, ManagedCliState>(
    (["codex", "claude"] as const).map((id) => [
      id,
      {
        id,
        source: id === "codex" ? "system" : "none",
        executable: id === "codex" ? "codex.cmd" : null,
        version: id === "codex" ? "0.167.2" : null,
        managedVersion: null,
        pinnedVersion: null,
        latestVersion: null,
        autoUpdate: true,
        customPath: null,
        phase: "idle",
        progress: null,
        error: null,
        checkedAt: null,
      },
    ]),
  );
  const appInfo = clone(options.appInfo ?? STORY_APP_INFO);
  const defaultAuthState: CentralAuthState = {
    status: "signed_in",
    user: {
      id: "user-1",
      email: "person@example.com",
      name: "Norbert",
      avatarUrl: null,
    },
  };
  let authState = clone<CentralAuthState>(options.authState ?? defaultAuthState);
  let setupState = clone<AppSetupState>(options.setupState ?? { completed: true, preferredProvider: "codex" });
  let appSettingsState: AppSettings = {
    language: "en",
    theme: "system",
    languageChosen: true,
    notifications: defaultNotificationPreferences(),
    tabs: SETTINGS_TABS.map((id) => ({ id, available: true })),
    navigation: { pinnedPageIds: ["agents", "workflows", "tasks", "usage", "library"] },
    appearance: { ...DEFAULT_APP_APPEARANCE },
    behavior: { launchAtLogin: false, keepBackground: false, externalLinks: "browser" },
    workspace: { ...DEFAULT_APP_WORKSPACE },
  };
  const agentStatus = clone(options.agentStatus ?? STORY_AGENT_STATUS);
  let bots = clone(options.bots ?? STORY_BOT_SUMMARIES);
  const threadSnapshots = new Map<string, ConversationSnapshot>();
  const threadQueues = new Map<string, QueueSnapshot>();
  const models = clone(options.models ?? STORY_MODELS);
  const snapshots = clone(options.snapshots ?? STORY_SNAPSHOTS);
  let browserTabs = clone(options.browserTabs ?? STORY_BROWSER_TABS);
  const browserControlState = clone(options.browserControlState ?? STORY_BROWSER_CONTROL);
  let servers = clone(options.servers ?? STORY_SERVERS);
  let presence = clone(options.presence ?? STORY_PRESENCE);
  let directThreads = clone(options.directThreads ?? STORY_DIRECT_THREADS);
  const directSnapshots = clone(options.directSnapshots ?? STORY_DIRECT_SNAPSHOTS);
  let hostStatus = clone(options.hostStatus ?? STORY_HOST_STATUS);
  let teamMembers = clone(options.teamMembers ?? STORY_TEAM_MEMBERS);
  let invites = clone(options.invites ?? STORY_INVITES);
  let sessions = clone(options.sessions ?? STORY_SESSIONS);
  let remoteMacSessions = clone(options.remoteMacSessions ?? [STORY_REMOTE_MAC_SESSION]);
  let updateStatus = clone(options.updateStatus ?? STORY_UPDATE_STATUS);
  let eyesState = clone(options.eyesState ?? emptyAgentEyesState());
  let pending = clone(options.pendingRequests ?? []);
  let mockChannels: import("@openbot/contracts/ipc").WorkspaceChannel[] = [
    {
      id: "demo-channel",
      name: "project",
      title: "Project",
      instructions: "Coordinate the work and share progress.",
      leadBotId: "chief",
      memberBotIds: ["chief", "research"],
      isolated: true,
      archived: false,
      createdAt: "2026-11-13T00:00:00Z",
      updatedAt: "2026-11-13T00:00:00Z",
    },
  ];
  let mockMessages: import("@openbot/contracts/ipc").ChannelMessage[] = [
    {
      id: "demo-message",
      channelId: "demo-channel",
      taskId: null,
      authorBotId: null,
      kind: "human",
      text: "Prepare the release plan.",
      replyToMessageId: null,
      resultVersion: null,
      superseded: false,
      createdAt: "2026-11-13T00:00:00Z",
    },
    {
      id: "demo-note",
      channelId: "demo-channel",
      taskId: "demo-task",
      authorBotId: "chief",
      kind: "note",
      text: "Reviewing the requirements.",
      replyToMessageId: "demo-message",
      resultVersion: null,
      superseded: false,
      createdAt: "2026-11-13T00:01:00Z",
    },
  ];
  const demoTasks: { state: import("@openbot/contracts/ipc").ChannelTaskState; title: string }[] = [
    { state: "paused", title: "Review the plan" },
    { state: "running", title: "Collect evidence" },
    { state: "done", title: "Define scope" },
  ];
  let mockTasks: import("@openbot/contracts/ipc").ChannelTask[] = demoTasks.map(({ state, title }, index) => ({
    id: `demo-task-${index}`,
    channelId: "demo-channel",
    ownerBotId: index === 1 ? "research" : "chief",
    state,
    title,
    requestMessageId: "demo-message",
    resultMessageId: null,
    parentTaskId: null,
    dependencyTaskIds: [],
    resourceKey: null,
    assignmentCount: 1,
    archivedAt: null,
    createdAt: "2026-11-13T00:00:00Z",
    updatedAt: "2026-11-13T00:00:00Z",
  }));
  const keptDrafts: import("@openbot/contracts/ipc").KeptDraft[] = [];
  const activityByBot = new Map<string, AgentActivity>(
    clone(options.activity ?? []).map((activity) => [activity.botId, activity]),
  );
  let sidebar = createMockSidebar(options.sidebarLayout);
  const usage = clone(STORY_USAGE);
  let botCounter = bots.length;
  let messageCounter = 10;
  let directMessageCounter = 10;

  const agentListeners = new Set<Listener<AgentEvent>>();
  const authListeners = new Set<Listener<CentralAuthState>>();
  const presenceListeners = new Set<Listener<TeamPresenceSnapshot>>();
  const directMessageListeners = new Set<Listener<DirectMessageRealtimeEvent>>();
  const directTypingListeners = new Set<Listener<DirectTypingRealtimeEvent>>();
  const inviteListeners = new Set<Listener<string>>();
  const hostListeners = new Set<Listener<HostStatus>>();
  const remoteMacListeners = new Set<Listener<RemoteMacSession[]>>();
  const updateListeners = new Set<Listener<UpdateStatus>>();
  const attachmentListeners = new Set<Listener<AttachmentImportEvent>>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const emit = <T>(listeners: Set<Listener<T>>, value: T) => {
    for (const listener of listeners) listener(clone(value));
  };
  const schedule = (callback: () => void, delay = 24) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
  };
  const emptyQueue = (botId: string): QueueSnapshot => ({ botId, paused: false, deliveries: [] });
  const queues = new Map<string, QueueSnapshot>(bots.map((bot) => [bot.id, emptyQueue(bot.id)]));

  /** Like the backend: the mock keeps cards open until a `*-resolved` event, so a "reload" can read them again. */
  function trackAgentEvent(event: AgentEvent): void {
    const createdAt = new Date().toISOString();
    switch (event.type) {
      case "prompt": {
        const { requestId, botId, threadId, turnId, questions } = event;
        pending = [
          ...pending.filter((card) => !(card.kind === "prompt" && card.requestId === requestId)),
          { kind: "prompt", requestId, botId, threadId, turnId, questions, createdAt },
        ];
        return;
      }
      case "approval":
        pending = [
          ...pending.filter(
            (card) => !(card.kind === "approval" && card.approval.requestId === event.approval.requestId),
          ),
          { kind: "approval", approval: event.approval, createdAt },
        ];
        return;
      case "prompt-resolved":
        pending = pending.filter((card) => !(card.kind === "prompt" && card.requestId === event.requestId));
        return;
      case "approval-resolved":
        pending = pending.filter((card) => !(card.kind === "approval" && card.approval.requestId === event.requestId));
        return;
      case "draft-preview":
        pending = [
          ...pending.filter((card) => !(card.kind === "draft-preview" && card.card.requestId === event.card.requestId)),
          { kind: "draft-preview", card: event.card },
        ];
        return;
      case "draft-preview-resolved":
        pending = pending.filter((card) => !(card.kind === "draft-preview" && card.card.requestId === event.requestId));
        return;
      case "vault-request":
        pending = [
          ...pending.filter(
            (card) => !(card.kind === "vault-request" && card.request.requestId === event.request.requestId),
          ),
          { kind: "vault-request", request: event.request },
        ];
        return;
      case "vault-request-resolved":
        pending = pending.filter(
          (card) => !(card.kind === "vault-request" && card.request.requestId === event.requestId),
        );
        return;
      case "browser-takeover":
        pending = [
          ...pending.filter(
            (card) => !(card.kind === "browser-takeover" && card.request.requestId === event.request.requestId),
          ),
          { kind: "browser-takeover", request: event.request, phase: "requested" },
        ];
        return;
      case "browser-takeover-changed":
        pending = pending.flatMap((card) =>
          card.kind === "browser-takeover" && card.request.requestId === event.requestId
            ? event.phase === "taken-over"
              ? [{ ...card, phase: event.phase }]
              : []
            : [card],
        );
        return;
      case "activity-changed":
        activityByBot.set(event.activity.botId, clone(event.activity));
        return;
      default:
    }
  }

  function emitAgentEvent(event: AgentEvent): void {
    trackAgentEvent(event);
    emit(agentListeners, event);
  }

  /** The turn ended before anyone answered: close its cards in every window. */
  function expireCards(botId: string): void {
    for (const card of [...pending]) {
      if (card.kind === "prompt" && card.botId === botId) {
        emitAgentEvent({ type: "prompt-resolved", requestId: card.requestId, botId, resolution: "expired" });
      } else if (card.kind === "approval" && card.approval.botId === botId) {
        emitAgentEvent({
          type: "approval-resolved",
          requestId: card.approval.requestId,
          botId,
          resolution: "expired",
        });
      }
    }
  }

  function respondToPrompt(input: RespondToPromptInput): void {
    const card = pending.find((item) => item.kind === "prompt" && item.requestId === input.requestId);
    if (card?.kind !== "prompt") return;
    const answered = Object.values(input.answers).some((answers) => answers.length > 0);
    emitAgentEvent({
      type: "prompt-resolved",
      requestId: card.requestId,
      botId: card.botId,
      resolution: answered ? "answered" : "skipped",
    });
  }

  function respondToApproval(input: RespondToApprovalInput): void {
    const card = pending.find((item) => item.kind === "approval" && item.approval.requestId === input.requestId);
    if (card?.kind !== "approval") return;
    const approval: AgentApproval = card.approval;
    emitAgentEvent({
      type: "approval-resolved",
      requestId: approval.requestId,
      botId: approval.botId,
      resolution: input.decision === "accept" ? "accepted" : "declined",
    });
  }

  function emitActivity(activity: AgentActivity): void {
    emitAgentEvent({ type: "activity-changed", activity });
  }

  function emitSidebarLayout(layout: SidebarLayout): void {
    sidebar = createMockSidebar(layout);
    emitAgentEvent({ type: "sidebar-layout-changed", layout: sidebar.layout() });
  }

  function emitAuthState(state: CentralAuthState): void {
    authState = clone(state);
    emit(authListeners, state);
  }

  function emitPresence(snapshot: TeamPresenceSnapshot): void {
    presence = clone(snapshot);
    emit(presenceListeners, snapshot);
  }

  function emitDirectMessage(event: DirectMessageRealtimeEvent): void {
    emit(directMessageListeners, event);
  }

  function emitDirectTyping(event: DirectTypingRealtimeEvent): void {
    emit(directTypingListeners, event);
  }

  function emitInvite(inviteUrl: string): void {
    emit(inviteListeners, inviteUrl);
  }

  function emitHostStatus(status: HostStatus): void {
    hostStatus = clone(status);
    emit(hostListeners, status);
  }

  function emitRemoteMacSessions(sessionsValue: RemoteMacSession[]): void {
    remoteMacSessions = clone(sessionsValue);
    emit(remoteMacListeners, sessionsValue);
  }

  function emitEyesState(state: AgentEyesState): void {
    eyesState = clone(state);
    emitAgentEvent({ type: "eyes-changed", state: eyesState });
  }

  /** Stopping clears the matching sessions (and, for a bot or everyone, its grants) and emits `eyes-changed`. */
  function stopEyes(input: StopAgentEyesInput): AgentEyesState {
    const bySession = input.sessionId !== undefined;
    emitEyesState({
      sessions: eyesState.sessions.filter((session) => {
        if (bySession) return session.id !== input.sessionId;
        return input.botId !== undefined && session.botId !== input.botId;
      }),
      grants: bySession
        ? eyesState.grants
        : eyesState.grants.filter((grant) => input.botId !== undefined && grant.botId !== input.botId),
    });
    return clone(eyesState);
  }

  function getSnapshot(botId: string): ConversationSnapshot {
    return (
      snapshots[botId] ?? {
        botId,
        threadId: `thread-${botId}`,
        activeTurnId: null,
        revision: 0,
        messages: [],
      }
    );
  }

  function updateSnapshot(botId: string, update: (snapshot: ConversationSnapshot) => void): void {
    const snapshot = getSnapshot(botId);
    update(snapshot);
    snapshot.revision += 1;
    snapshots[botId] = snapshot;
    emitAgentEvent({ type: "conversation", snapshot });
  }

  function createBotSummary(input: Partial<BotSummary> = {}): BotSummary {
    botCounter += 1;
    const id = input.id ?? `mock-agent-${botCounter}`;
    return {
      id,
      name: input.name ?? "New agent",
      role: input.role ?? "Generalist agent",
      description: input.description ?? "A new agent ready to help with focused work.",
      notifications: input.notifications ?? true,
      model: input.model ?? "gpt-5.6-luna",
      reasoningEffort: input.reasoningEffort ?? "medium",
      threadId: input.threadId ?? `thread-${id}`,
      workspacePath: input.workspacePath ?? `/mock/COSGRAL/Bots/${id}`,
      preview: input.preview ?? "No messages yet",
      updatedAt: input.updatedAt ?? null,
      avatarSeed: input.avatarSeed ?? id,
      avatarHue: input.avatarHue ?? null,
      avatarUrl: input.avatarUrl ?? null,
    };
  }

  const w2 = createMockW2(emitAgentEvent);
  const w2ui2 = createMockW2Ui2(emitAgentEvent, (requestId, decline) => {
    const card = pending.find((item) => item.kind === "vault-request" && item.request.requestId === requestId);
    if (card?.kind !== "vault-request") throw new Error("Request is no longer open");
    emitAgentEvent({
      type: "vault-request-resolved",
      requestId,
      botId: card.request.botId,
      resolution: decline ? "declined" : "provided",
    });
  });
  const mockVaultConnectors = createMockVaultConnectors((event) => emitAgentEvent(event));
  const mockMobileConnect = createMockMobileConnect((event) => emitAgentEvent(event));
  const mockInstanceTransfer = createMockInstanceTransfer((event) => emitAgentEvent(event));
  // COSGRAL W12-KK: routines, workflows and the Marketplace tabs (demo data on the agents and channels of this mock).
  const firstBotId = bots[0]?.id ?? "chief";
  const mockRoutines = createMockRoutines((event) => emitAgentEvent(event), {
    botExists: (botId) => bots.some((bot) => bot.id === botId),
    seed: { botId: firstBotId },
  });
  const mockWorkflows = createMockWorkflows((event) => emitAgentEvent(event), {
    known: () => ({
      botIds: bots.map((bot) => bot.id),
      channelIds: mockChannels.map((channel) => channel.id),
      routineIds: ["routine-demo", "rt-demo-pipeline"],
    }),
    seed: { botId: firstBotId, channelId: mockChannels[0]?.id ?? "demo-channel" },
  });
  const mockMarketplace = createMockMarketplace((event) => emitAgentEvent(event), {
    bots: () => bots.map((bot) => ({ id: bot.id, name: bot.name })),
    createAgent: (name, item) => {
      const bot = createBotSummary({ name, role: item.title, description: item.description });
      bots = [...bots, bot];
      queues.set(bot.id, emptyQueue(bot.id));
      emitAgentEvent({ type: "bots-changed", bots });
      return bot;
    },
    removeAgent: (botId) => {
      bots = bots.filter((bot) => bot.id !== botId);
      queues.delete(botId);
      emitAgentEvent({ type: "bots-changed", bots });
    },
  });
  // COSGRAL W6-BE1: several threads per agent (demo; `simulate` is only for stories that build the mock themselves).
  const mockThreads = createMockThreads(
    (event) => {
      if (event.type === "threads-changed" && event.activeThreadId) {
        const old = getSnapshot(event.botId);
        if (old.threadId && old.threadId !== event.activeThreadId) {
          threadSnapshots.set(old.threadId, clone(old));
          const oldQueue = queues.get(event.botId);
          if (oldQueue) threadQueues.set(old.threadId, clone(oldQueue));
        }
        snapshots[event.botId] = clone(
          threadSnapshots.get(event.activeThreadId) ??
            (old.threadId === event.activeThreadId
              ? old
              : {
                  botId: event.botId,
                  threadId: event.activeThreadId,
                  activeTurnId: null,
                  revision: 0,
                  messages: [],
                }),
        );
        queues.set(
          event.botId,
          clone(
            threadQueues.get(event.activeThreadId) ??
              (old.threadId === event.activeThreadId
                ? (queues.get(event.botId) ?? emptyQueue(event.botId))
                : emptyQueue(event.botId)),
          ),
        );
        bots = bots.map((bot) => (bot.id === event.botId ? { ...bot, threadId: event.activeThreadId } : bot));
      }
      emitAgentEvent(event);
    },
    Object.fromEntries(
      bots.map((bot) => {
        const id = getSnapshot(bot.id).threadId ?? bot.threadId ?? `thread-${bot.id}`;
        const thread: ThreadSummary = {
          id,
          botId: bot.id,
          title: "New thread",
          titled: false,
          state: "idle",
          active: true,
          unread: 0,
          queued: 0,
          needsYou: 0,
          createdAt: "2026-11-16T12:00:00.000Z",
          updatedAt: "2026-11-16T12:00:00.000Z",
          archivedAt: null,
          preview: "",
          parentThreadId: null,
          parentTitle: null,
          branchedFromMessageId: null,
        };
        return [bot.id, [thread]];
      }),
    ),
  );
  const mockMessageActions = createMockMessageActions((event) => emitAgentEvent(event));
  const api: OpenBotDesktopApi = {
    ...w2ui2,
    memory: w2.memory,
    skills: w2.skills,
    mcp: w2.mcp,
    channels: {
      ...w2.channels,
      ...{ supportsMessageReplies: true },
      list: async () => clone(mockChannels),
      listMessages: async ({ channelId }) => clone(mockMessages.filter((item) => item.channelId === channelId)),
      listTasks: async (channelId) => clone(mockTasks.filter((item) => item.channelId === channelId)),
      clearHistory: async ({ channelId }) => {
        if (!mockChannels.some((item) => item.id === channelId)) throw new Error("This channel no longer exists.");
        const busy = mockTasks.filter(
          (item) =>
            item.channelId === channelId &&
            item.archivedAt === null &&
            ["queued", "running", "waiting", "paused"].includes(item.state),
        ).length;
        if (busy > 0) {
          throw new Error(
            `This channel has ${busy} task${busy === 1 ? "" : "s"} in progress or paused. Stop or archive ${busy === 1 ? "it" : "them"} first.`,
          );
        }
        const removedMessages = mockMessages.filter((item) => item.channelId === channelId).length;
        const removedTasks = mockTasks.filter((item) => item.channelId === channelId).length;
        mockMessages = mockMessages.filter((item) => item.channelId !== channelId);
        mockTasks = mockTasks.filter((item) => item.channelId !== channelId);
        emitAgentEvent({ type: "channel-history-cleared", channelId });
        return { channelId, removedMessages, removedTasks };
      },
      sendMessage: async (input) => {
        const { channelId, text } = input;
        const replyToMessageId =
          "replyToMessageId" in input && isString(input.replyToMessageId) ? input.replyToMessageId : null;
        if (
          replyToMessageId &&
          !mockMessages.some((item) => item.id === replyToMessageId && item.channelId === channelId)
        )
          throw new Error("This message is not in the channel.");
        const now = new Date().toISOString();
        const id = `demo-${Date.now()}`;
        const message: import("@openbot/contracts/ipc").ChannelMessage = {
          id,
          channelId,
          taskId: id,
          authorBotId: null,
          kind: "human",
          text,
          replyToMessageId,
          resultVersion: null,
          superseded: false,
          createdAt: now,
        };
        const template = mockTasks[0];
        if (!template) throw new Error("Demo task template unavailable");
        const task = {
          ...template,
          id,
          channelId,
          title: text.slice(0, 120),
          requestMessageId: id,
          state: "queued" as const,
          createdAt: now,
          updatedAt: now,
        };
        mockMessages = [...mockMessages, message];
        mockTasks = [...mockTasks, task];
        emitAgentEvent({ type: "channel-message", message });
        emitAgentEvent({ type: "task-changed", task });
        return clone({ message, task });
      },
      actOnTask: async ({ taskId, action }) => {
        const old = mockTasks.find((task) => task.id === taskId);
        if (!old || action !== "resume") throw new Error("Task action unavailable");
        const task = { ...old, state: "queued" as const };
        mockTasks = mockTasks.map((item) => (item.id === taskId ? task : item));
        emitAgentEvent({ type: "task-changed", task });
        return clone(task);
      },
      reassignTask: async ({ taskId, ownerBotId }) => {
        const old = mockTasks.find((task) => task.id === taskId);
        if (!old) throw new Error("Task not found");
        const task = { ...old, ownerBotId, state: "queued" as const };
        mockTasks = mockTasks.map((item) => (item.id === taskId ? task : item));
        emitAgentEvent({ type: "task-changed", task });
        return clone(task);
      },
      create: async () => {
        throw new Error("Not implemented in demo");
      },
      update: async (input) => {
        const found = mockChannels.find((item) => item.id === input.channelId);
        if (!found) throw new Error("This channel no longer exists.");
        if (input.historyWindow !== undefined && !isChannelHistoryWindow(input.historyWindow)) {
          throw new Error("historyWindow is 20, 50, 100 or 200.");
        }
        const next = {
          ...found,
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.instructions === undefined ? {} : { instructions: input.instructions }),
          ...(input.isolated === undefined ? {} : { isolated: input.isolated }),
          ...(input.archived === undefined ? {} : { archived: input.archived }),
          ...(input.historyWindow === undefined ? {} : { historyWindow: input.historyWindow }),
          updatedAt: new Date().toISOString(),
        };
        mockChannels = mockChannels.map((item) => (item.id === next.id ? next : item));
        emitAgentEvent({ type: "channels-changed", channels: clone(mockChannels) });
        return clone(next);
      },
      addMember: async () => {
        throw new Error("Not implemented in demo");
      },
      removeMember: async () => {
        throw new Error("Not implemented in demo");
      },
      setLead: async () => {
        throw new Error("Not implemented in demo");
      },
    },
    getAppInfo: async () => clone(appInfo),
    getSetupState: async () => clone(setupState),
    saveSetup: async ({ preferredProvider }) => {
      setupState = { completed: true, preferredProvider };
      return clone(setupState);
    },
    getMacPermissions: async (): Promise<MacPermissionsState> => ({
      screenRecording: "granted",
      accessibility: "granted",
    }),
    requestMacPermission: async (_permission: MacPermissionId) => ({
      screenRecording: "granted",
      accessibility: "granted",
    }),
    openExternal: async () => undefined,
    openUrl: async () => undefined,
    auth: {
      getState: async () => clone(authState),
      retry: async () => clone(authState),
      requestEmailCode: async (email) => {
        authState = {
          status: "code_sent",
          challengeId: "mock-challenge",
          email,
          expiresAt: Date.now() + 600_000,
          resendAvailableAt: Date.now() + 60_000,
          developmentCode: "2345-6789",
        };
        return clone(authState);
      },
      verifyEmailCode: async (_challengeId, _code) => {
        const email = authState.status === "code_sent" ? authState.email : "person@example.com";
        const user: CentralAuthUser = {
          id: "user-1",
          email,
          name: "Norbert",
          avatarUrl: null,
        };
        authState = { status: "signed_in", user };
        return clone(authState);
      },
      updateAvatar: async () => clone(authState),
      logout: async () => {
        authState = { status: "signed_out" };
        emitAuthState(authState);
        return clone(authState);
      },
      onEvent: (listener) => {
        authListeners.add(listener);
        return () => authListeners.delete(listener);
      },
    },
    appSettings: {
      get: async () => clone(appSettingsState),
      update: async (input) => {
        if (input.navigation && !isPinnedPageIdList(input.navigation.pinnedPageIds)) {
          throw new Error("pinnedPageIds must list known pages, each at most once.");
        }
        const notifications = clone(appSettingsState.notifications);
        for (const [event, row] of Object.entries(input.notifications?.matrix ?? {})) {
          if (!isOneOf(NOTIFICATION_EVENTS, event)) continue;
          for (const [channel, enabled] of Object.entries(row ?? {})) {
            if (isOneOf(NOTIFICATION_CHANNELS, channel) && isBoolean(enabled)) {
              notifications.matrix[event][channel] = enabled;
            }
          }
        }
        if (input.notifications?.onlyWhenUnfocused !== undefined) {
          notifications.onlyWhenUnfocused = input.notifications.onlyWhenUnfocused;
        }
        appSettingsState = {
          ...appSettingsState,
          ...(input.theme !== undefined ? { theme: normalizeAppTheme(input.theme) } : {}),
          ...(input.language ? { language: input.language, languageChosen: true } : {}),
          notifications,
          navigation: input.navigation
            ? { pinnedPageIds: [...input.navigation.pinnedPageIds] }
            : appSettingsState.navigation,
          appearance: input.appearance
            ? { ...appSettingsState.appearance, ...parseAppearancePatch(input.appearance) }
            : appSettingsState.appearance,
          behavior: input.behavior
            ? { ...appSettingsState.behavior, ...parseBehaviorPatch(input.behavior) }
            : appSettingsState.behavior,
          workspace: input.workspace
            ? applyWorkspacePatch(appSettingsState.workspace, parseWorkspacePatch(input.workspace))
            : appSettingsState.workspace,
        };
        emitAgentEvent({ type: "app-settings-changed", settings: clone(appSettingsState) });
        return clone(appSettingsState);
      },
    },
    providers: {
      ...createMockFallbackModelsApi([], { agentModels: Object.fromEntries(bots.map((bot) => [bot.id, bot.model])) }),
      listAcpAgents: async () => [],
      saveAcpAgent: async (input) => ({
        ...input,
        args: input.args ?? [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      removeAcpAgent: async () => {},
      listUsage: async () => [],
    },
    agent: {
      getStatus: async () => clone(agentStatus),
      getUsage: async () => clone(usage),
      listModels: async () => clone(models),
      listBots: async (input) =>
        clone(input?.includeHidden === false ? bots.filter((bot) => bot.hidden !== true) : bots),
      duplicateBot: async ({ sourceBotId, name }) => {
        const source = bots.find((bot) => bot.id === sourceBotId);
        if (!source) throw new Error("Agent not found");
        const taken = new Set(bots.map((bot) => bot.name.toLowerCase()));
        let copyName = name?.trim() ?? "";
        for (let number = 1; !copyName; number += 1) {
          const candidate = number === 1 ? `${source.name} kopia` : `${source.name} kopia ${number}`;
          if (!taken.has(candidate.toLowerCase())) copyName = candidate;
        }
        // The copy gets its own id, thread, workspace and avatar seed; history and memory stay behind.
        const {
          id: _id,
          hidden: _hidden,
          activeModel: _active,
          workspacePath: _path,
          avatarSeed: _seed,
          threadId: _thread,
          ...profile
        } = source;
        const copy = createBotSummary({ ...profile, name: copyName, preview: "No messages yet", updatedAt: null });
        bots = [...bots, copy];
        queues.set(copy.id, emptyQueue(copy.id));
        emitAgentEvent({ type: "bots-changed", bots });
        return clone({ bot: copy, warnings: [] });
      },
      setBotHidden: async ({ botId, hidden }) => {
        const current = bots.find((bot) => bot.id === botId);
        if (!current) throw new Error("Agent not found");
        const { hidden: _previous, ...rest } = current;
        const updated: BotSummary = hidden ? { ...rest, hidden: true } : rest;
        bots = bots.map((bot) => (bot.id === botId ? updated : bot));
        emitAgentEvent({ type: "bots-changed", bots });
        return clone(updated);
      },
      createBot: async () => {
        const bot = createBotSummary();
        bots = [...bots, bot];
        queues.set(bot.id, emptyQueue(bot.id));
        emitAgentEvent({ type: "bots-changed", bots });
        return clone(bot);
      },
      updateBot: async (input: UpdateBotInput) => {
        const current = bots.find((bot) => bot.id === input.botId);
        if (!current) throw new Error("Agent not found");
        const { botId: _botId, ...updates } = input;
        const updated = { ...current, ...updates };
        bots = bots.map((bot) => (bot.id === updated.id ? updated : bot));
        emitAgentEvent({ type: "bots-changed", bots });
        return clone(updated);
      },
      setAvatar: async (input: SetAgentAvatarInput) => {
        const current = bots.find((bot) => bot.id === input.botId);
        if (!current) throw new Error("Agent not found");
        const updated = {
          ...current,
          avatarUrl: input.image ? `mock-avatar://${input.botId}` : null,
        };
        bots = bots.map((bot) => (bot.id === updated.id ? updated : bot));
        emitAgentEvent({ type: "bots-changed", bots });
        return clone(updated);
      },
      deleteBot: async (botId) => {
        bots = bots.filter((bot) => bot.id !== botId);
        queues.delete(botId);
        emitAgentEvent({ type: "bots-changed", bots });
      },
      readConversation: async (botId) => ({
        ...clone(getSnapshot(botId)),
        readState: { unreadCount: 0, firstUnreadMessageId: null, throughMessageId: null },
      }),
      listConversationReads: async () => ({}),
      markConversationRead: async (input) => ({
        unreadCount: 0,
        firstUnreadMessageId: null,
        throughMessageId: input.throughMessageId,
      }),
      chooseAttachments: async () => [],
      onAttachmentImport: (listener) => {
        attachmentListeners.add(listener);
        return () => attachmentListeners.delete(listener);
      },
      discardDraftAttachment: async () => undefined,
      openAttachment: async (_input: OpenAttachmentInput) => undefined,
      sendMessage: async (input: SendMessageInput) => {
        const messageId = `mock-message-${messageCounter++}`;
        const deliveryId = `mock-delivery-${messageCounter++}`;
        const turnId = `mock-turn-${messageCounter++}`;
        const createdAt = new Date().toISOString();
        const userMessage: ConversationMessage = {
          id: messageId,
          turnId,
          author: "user",
          source: "user",
          text: input.text,
          createdAt,
          status: "completed",
          replyToMessageId: input.replyToMessageId ?? null,
        };
        const delivery: QueueDelivery = {
          id: deliveryId,
          messageId,
          recipientBotId: input.botId,
          sender: { kind: "user" },
          text: input.text,
          attachments: [],
          replyToMessageId: input.replyToMessageId ?? null,
          status: "running",
          position: null,
          turnId,
          error: null,
          createdAt,
        };
        updateSnapshot(input.botId, (snapshot) => {
          snapshot.activeTurnId = turnId;
          snapshot.messages = [...snapshot.messages, userMessage];
        });
        queues.set(input.botId, { botId: input.botId, paused: false, deliveries: [delivery] });
        emitAgentEvent({
          type: "queue-changed",
          snapshot: queues.get(input.botId) ?? emptyQueue(input.botId),
        });
        emitAgentEvent({
          type: "turn-started",
          botId: input.botId,
          threadId: getSnapshot(input.botId).threadId ?? `thread-${input.botId}`,
          turnId,
        });

        schedule(() => {
          const assistantMessage: ConversationMessage = {
            id: `mock-reply-${messageCounter++}`,
            turnId,
            author: "assistant",
            source: "assistant",
            text: `Mock reply from ${bots.find((bot) => bot.id === input.botId)?.name ?? "agent"}: I received “${input.text}” and added it to the working context.`,
            createdAt: new Date().toISOString(),
            status: "completed",
          };
          updateSnapshot(input.botId, (snapshot) => {
            snapshot.activeTurnId = null;
            snapshot.messages = [...snapshot.messages, assistantMessage];
          });
          queues.set(input.botId, {
            botId: input.botId,
            paused: false,
            deliveries: [{ ...delivery, status: "completed" }],
          });
          emitAgentEvent({
            type: "queue-changed",
            snapshot: queues.get(input.botId) ?? emptyQueue(input.botId),
          });
          emitAgentEvent({
            type: "turn-completed",
            botId: input.botId,
            threadId: getSnapshot(input.botId).threadId ?? `thread-${input.botId}`,
            turnId,
            status: "completed",
          });
        }, 80);

        return {
          messageId,
          deliveries: [{ id: deliveryId, recipientBotId: input.botId, status: "running", position: null }],
        };
      },
      setMessageReaction: async (input: SetMessageReactionInput) => {
        updateSnapshot(input.botId, (snapshot) => {
          const message = snapshot.messages.find((candidate) => candidate.id === input.messageId);
          if (message) message.reaction = input.emoji;
        });
      },
      listQueue: async (botId) => clone(queues.get(botId) ?? emptyQueue(botId)),
      cancelQueuedMessage: async (input) => {
        const queue = queues.get(input.botId) ?? emptyQueue(input.botId);
        queue.deliveries = queue.deliveries.map((delivery) =>
          delivery.id === input.deliveryId ? { ...delivery, status: "cancelled" } : delivery,
        );
        queues.set(input.botId, queue);
        emitAgentEvent({ type: "queue-changed", snapshot: queue });
      },
      steerQueuedMessage: async (input: SteerQueuedMessageInput) => {
        const queue = queues.get(input.botId) ?? emptyQueue(input.botId);
        queue.deliveries = queue.deliveries.map((delivery) =>
          delivery.id === input.deliveryId
            ? { ...delivery, status: "running", turnId: input.expectedTurnId, position: null }
            : delivery,
        );
        queues.set(input.botId, queue);
        emitAgentEvent({ type: "queue-changed", snapshot: queue });
      },
      updateQueuedMessage: async (input: UpdateQueuedMessageInput) => {
        const queue = queues.get(input.botId) ?? emptyQueue(input.botId);
        queue.deliveries = queue.deliveries.map((delivery) =>
          delivery.id === input.deliveryId ? { ...delivery, text: input.text } : delivery,
        );
        queues.set(input.botId, queue);
        emitAgentEvent({ type: "queue-changed", snapshot: queue });
      },
      reorderQueue: async (input: ReorderQueueInput) => {
        const queue = queues.get(input.botId) ?? emptyQueue(input.botId);
        const byId = new Map(queue.deliveries.map((delivery) => [delivery.id, delivery]));
        queue.deliveries = input.deliveryIds.flatMap((deliveryId, index) => {
          const delivery = byId.get(deliveryId);
          return delivery ? [{ ...delivery, position: index + 1 }] : [];
        });
        queues.set(input.botId, queue);
        emitAgentEvent({ type: "queue-changed", snapshot: queue });
      },
      setQueuePaused: async (input: SetQueuePausedInput) => {
        const queue = queues.get(input.botId) ?? emptyQueue(input.botId);
        queue.paused = input.paused;
        queues.set(input.botId, queue);
        emitAgentEvent({ type: "queue-changed", snapshot: queue });
      },
      interrupt: async (input) => {
        expireCards(input.botId);
        emitAgentEvent({
          type: "turn-completed",
          botId: input.botId,
          threadId: getSnapshot(input.botId).threadId ?? `thread-${input.botId}`,
          turnId: input.turnId,
          status: "interrupted",
        });
      },
      respondToPrompt: async (input: RespondToPromptInput) => respondToPrompt(input),
      respondToApproval: async (input: RespondToApprovalInput) => respondToApproval(input),
      respondToDraftPreview: async (input) => {
        const item = pending.find((card) => card.kind === "draft-preview" && card.card.requestId === input.requestId);
        if (item?.kind !== "draft-preview") throw new Error("Card is no longer open");
        if (input.decision === "keep-draft")
          keptDrafts.unshift({
            id: item.card.draftId ?? item.card.requestId,
            botId: item.card.botId,
            threadId: item.card.threadId,
            variant: item.card.variant,
            title: item.card.title,
            recipient: item.card.recipient,
            channel: item.card.channel,
            preview: item.card.preview,
            keptAt: new Date().toISOString(),
          });
        emitAgentEvent({
          type: "draft-preview-resolved",
          requestId: input.requestId,
          botId: item.card.botId,
          resolution: input.decision,
        });
      },
      respondToBrowserTakeover: async (input) => {
        const item = pending.find(
          (card) => card.kind === "browser-takeover" && card.request.requestId === input.requestId,
        );
        if (item?.kind !== "browser-takeover") throw new Error("Card is no longer open");
        emitAgentEvent({
          type: "browser-takeover-changed",
          requestId: input.requestId,
          botId: item.request.botId,
          phase: input.action === "take-over" ? "taken-over" : input.action === "return" ? "returned" : "declined",
        });
      },
      listDrafts: async () => clone(keptDrafts),
      deleteDraft: async ({ draftId }) => {
        const index = keptDrafts.findIndex((draft) => draft.id === draftId);
        if (index >= 0) keptDrafts.splice(index, 1);
      },
      // Optional in the contract until Backend makes them required (see docs/cosgral-raporty/ui-w1-ui1.md).
      getEyesState: async () => clone(eyesState),
      stopEyes: async (input: StopAgentEyesInput) => stopEyes(input),
      // Optional in the contract until Backend makes them required (see docs/cosgral-raporty/ui-w1-ui2.md).
      listPendingRequests: async () => clone(pending),
      listActivity: async () => clone([...activityByBot.values()]),
      onEvent: (listener) => {
        agentListeners.add(listener);
        return () => agentListeners.delete(listener);
      },
    },
    browser: {
      open: async (input: BrowserOpenInput) => {
        const tab: BrowserTab = {
          id: `browser-tab-${browserTabs.length + 1}`,
          title: input.url,
          url: input.url,
          loading: false,
          ownerThreadId: input.ownerThreadId ?? null,
          ownerBotId: input.ownerBotId ?? null,
        };
        browserTabs = [...browserTabs, tab];
        emitAgentEvent({ type: "browser-changed", tabs: browserTabs, activeTabId: tab.id });
        return clone(tab);
      },
      activate: async () => undefined,
      close: async (tabId) => {
        browserTabs = browserTabs.filter((tab) => tab.id !== tabId);
        emitAgentEvent({
          type: "browser-changed",
          tabs: browserTabs,
          activeTabId: browserTabs[0]?.id ?? null,
        });
      },
      listTabs: async () => clone(browserTabs),
      getControlState: async () => clone(browserControlState),
      setVisible: async () => undefined,
    },
    update: {
      getStatus: async () => clone(updateStatus),
      check: async () => {
        updateStatus = { ...updateStatus, phase: "up-to-date", availableVersion: null };
        emit(updateListeners, updateStatus);
        return clone(updateStatus);
      },
      download: async () => {
        updateStatus = { ...updateStatus, phase: "downloading", progress: 0 };
        emit(updateListeners, updateStatus);
        return clone(updateStatus);
      },
      install: async () => {
        updateStatus = { ...updateStatus, phase: "installing" };
        emit(updateListeners, updateStatus);
      },
      onEvent: (listener) => {
        updateListeners.add(listener);
        return () => updateListeners.delete(listener);
      },
    },
    maintenance: {
      exportData: async () => ({ saved: true }),
      exportDiagnostics: async () => ({ saved: true }),
    },
    // Optional in the contract until Backend makes it required (see docs/cosgral-raporty/ui-w1-ui2.md).
    // Every change returns the new layout and also emits `sidebar-layout-changed`, like the real store.
    sidebar: {
      getLayout: async () => sidebar.layout(),
      createFolder: async (input) => {
        const change = sidebar.createFolder(input);
        emitAgentEvent({ type: "sidebar-layout-changed", layout: change.layout });
        return change;
      },
      updateFolder: async (input) => {
        const layout = sidebar.updateFolder(input);
        emitAgentEvent({ type: "sidebar-layout-changed", layout });
        return layout;
      },
      moveFolder: async (input) => {
        const layout = sidebar.moveFolder(input);
        emitAgentEvent({ type: "sidebar-layout-changed", layout });
        return layout;
      },
      duplicateFolder: async (input) => {
        const change = sidebar.duplicateFolder(input.folderId);
        emitAgentEvent({ type: "sidebar-layout-changed", layout: change.layout });
        return change;
      },
      deleteFolder: async (input) => {
        const layout = sidebar.deleteFolder(input.folderId);
        emitAgentEvent({ type: "sidebar-layout-changed", layout });
        return layout;
      },
      moveItem: async (input) => {
        const layout = sidebar.moveItem(input);
        emitAgentEvent({ type: "sidebar-layout-changed", layout });
        return layout;
      },
    },
    servers: {
      list: async () => clone(servers),
      select: async (serverId) => {
        servers = servers.map((server) => ({ ...server, active: server.id === serverId }));
        emitAgentEvent({ type: "bots-changed", bots });
        return clone(servers);
      },
      join: async (input: JoinServerInput) => {
        const server: ServerSummary = {
          id: `server-${servers.length + 1}`,
          name: "Joined workspace",
          kind: "remote",
          state: "online",
          apiUrl: input.inviteUrl,
          vncHostname: null,
          role: "member",
          active: false,
        };
        servers = [...servers, server];
        return clone(server);
      },
      login: async (input) => {
        const server = servers.find((candidate) => candidate.id === input.serverId);
        if (!server) throw new Error("Server not found");
        return clone(server);
      },
      updateAddress: async () => clone(servers[0] ?? STORY_SERVERS[0]),
      remove: async (serverId) => {
        servers = servers.filter((server) => server.id !== serverId);
      },
      getPresence: async () => clone(presence),
      setTyping: async (_input: SetTeamTypingInput) => undefined,
      onPresence: (listener) => {
        presenceListeners.add(listener);
        return () => presenceListeners.delete(listener);
      },
      listDirectThreads: async () => clone(directThreads),
      readDirectConversation: async (memberId) =>
        clone(
          directSnapshots[memberId] ?? {
            threadId: `direct-${memberId}`,
            otherMemberId: memberId,
            messages: [],
            revision: 0,
          },
        ),
      sendDirectMessage: async (input: SendDirectMessageInput) => {
        const message: DirectMessage = {
          id: input.clientMessageId,
          threadId: `direct-${input.memberId}`,
          senderMemberId: "member-self",
          recipientMemberId: input.memberId,
          text: input.text,
          createdAt: new Date().toISOString(),
          sequence: directMessageCounter++,
        };
        const snapshot = directSnapshots[input.memberId] ?? {
          threadId: message.threadId,
          otherMemberId: input.memberId,
          messages: [],
          revision: 0,
        };
        snapshot.messages = [...snapshot.messages, message];
        snapshot.revision += 1;
        directSnapshots[input.memberId] = snapshot;
        return clone(message);
      },
      markDirectRead: async (input) => {
        directThreads = directThreads.map((thread) =>
          thread.otherMemberId === input.memberId ? { ...thread, unreadCount: 0 } : thread,
        );
        const snapshot = directSnapshots[input.memberId];
        const readState = {
          unreadCount: 0,
          firstUnreadMessageId: null,
          throughSequence: input.throughSequence,
        };
        if (snapshot) snapshot.readState = readState;
        return readState;
      },
      setDirectTyping: async () => undefined,
      onDirectMessage: (listener) => {
        directMessageListeners.add(listener);
        return () => directMessageListeners.delete(listener);
      },
      onDirectTyping: (listener) => {
        directTypingListeners.add(listener);
        return () => directTypingListeners.delete(listener);
      },
      onEvent: (listener) => {
        void listener;
        return () => undefined;
      },
      onInvite: (listener) => {
        inviteListeners.add(listener);
        return () => inviteListeners.delete(listener);
      },
    },
    host: {
      getStatus: async () => clone(hostStatus),
      configure: async (input: ConfigureHostInput) => {
        hostStatus = {
          ...hostStatus,
          configured: true,
          phase: "idle",
          serverName: input.serverName,
        };
        emitHostStatus(hostStatus);
        return clone(hostStatus);
      },
      configureRemoteDesktop: async (_input: ConfigureRemoteDesktopInput) => {
        hostStatus = { ...hostStatus, remoteDesktopCredentialConfigured: true };
        emitHostStatus(hostStatus);
        return clone(hostStatus);
      },
      start: async () => {
        hostStatus = { ...hostStatus, phase: "online", apiOnline: true, vncOnline: true };
        emitHostStatus(hostStatus);
        return clone(hostStatus);
      },
      stop: async () => {
        hostStatus = { ...hostStatus, phase: "idle", apiOnline: false, vncOnline: false };
        emitHostStatus(hostStatus);
        return clone(hostStatus);
      },
      listMembers: async () => clone(teamMembers),
      updateMember: async (input: UpdateTeamMemberInput) => {
        const member = teamMembers.find((candidate) => candidate.id === input.memberId);
        if (!member) throw new Error("Member not found");
        const updated = { ...member, ...input };
        teamMembers = teamMembers.map((candidate) => (candidate.id === updated.id ? updated : candidate));
        return clone(updated);
      },
      removeMember: async (memberId) => {
        teamMembers = teamMembers.filter((member) => member.id !== memberId);
      },
      listSessions: async () => clone(sessions),
      revokeSession: async (sessionId) => {
        sessions = sessions.filter((session) => session.id !== sessionId);
      },
      listInvites: async () => clone(invites),
      revokeInvite: async (inviteId) => {
        invites = invites.filter((invite) => invite.id !== inviteId);
      },
      createInvite: async (input: CreateTeamInviteInput): Promise<InviteSummary> => ({
        id: `invite-${invites.length + 1}`,
        role: input.role,
        expiresAt: "2026-09-19T10:00:00.000Z",
        usedAt: null,
        inviteUrl: "cosgral://invite/mock-invite",
        email: input.email ?? null,
      }),
      createAddressUpdate: async () => "cosgral://server-update/mock",
      onEvent: (listener) => {
        hostListeners.add(listener);
        return () => hostListeners.delete(listener);
      },
    },
    remoteMac: {
      list: async () => clone(remoteMacSessions),
      connect: async (input: RemoteMacConnectInput) => {
        const session: RemoteMacSession = {
          id: `remote-mac-${remoteMacSessions.length + 1}`,
          serverId: input.serverId ?? null,
          hostname: input.hostname,
          localPort: 5901,
          websocketUrl: "wss://desktop.example.com/socket",
          phase: "connected",
          errorCode: null,
          message: null,
          createdAt: new Date().toISOString(),
        };
        remoteMacSessions = [...remoteMacSessions, session];
        emitRemoteMacSessions(remoteMacSessions);
        return clone(session);
      },
      disconnect: async (sessionId) => {
        remoteMacSessions = remoteMacSessions.filter((session) => session.id !== sessionId);
        emitRemoteMacSessions(remoteMacSessions);
      },
      getCredentials: async (_sessionId) => null,
      onEvent: (listener) => {
        remoteMacListeners.add(listener);
        return () => remoteMacListeners.delete(listener);
      },
    },
    // COSGRAL W6-BE1: several threads per agent (demo; `simulate` is only for stories that build the mock themselves).
    threads: mockThreads,
    // COSGRAL W12 (BE-K): delete a thread with a few minutes to bring it back (demo).
    threadUndo: mockThreads.undo,
    // COSGRAL W5-BE3: provider API keys (demo; the answers carry only a mask and a state).
    apiKeys: createMockApiKeysApi(),
    // COSGRAL W6-BE2: conversation context (demo; `simulate` is for stories that build the mock themselves).
    context: createMockContext((event) => emitAgentEvent(event)),
    // COSGRAL W6-BE3: the plan card and the actions on a message (demo; `propose`, `seed`, `setBusy` are for stories).
    plans: createMockPlans((event) => emitAgentEvent(event)),
    // COSGRAL W6-BE4: the subagents of a thread (demo; `spawn`, `complete`, ... are for stories).
    subagents: createMockSubagents((event) => emitAgentEvent(event)),
    // COSGRAL W6-BE5: sign in to an ACP agent with a link and a code (demo; the link is not a real page).
    acpLogin: createMockAcpLogin((event) => emitAgentEvent(event)),
    // COSGRAL W6-BE5: ready settings for Gemini CLI and Antigravity (demo; nothing is installed).
    acpPresets: createMockAcpPresets(),
    // COSGRAL W8-BE1: the access level and folders of an agent (demo; `allowRaise` plays the card of Needs you).
    access: createMockAccess((event) => emitAgentEvent(event)),
    // COSGRAL W8-BE2: isolation of the processes (demo; `allowOff` plays the card of Needs you).
    isolation: createMockIsolation((event) => emitAgentEvent(event)),
    messageActions: mockMessageActions,
    messageMenu: { get: mockMessageActions.menu },
    // COSGRAL W6-KK3: separate conversation windows (demo; `simulate` is for stories that build the mock themselves).
    windows: createMockWindows((event) => emitAgentEvent(event)),
    // COSGRAL W8-KK1: client spaces (demo; `simulate.restarted` plays the restart after a switch).
    spaces: createMockSpaces((event) => emitAgentEvent(event)),
    // COSGRAL W8-KK2: budgets (demo; `simulate.record` plays a finished turn).
    budgets: createMockBudgets((event) => emitAgentEvent(event)),
    // COSGRAL W8-KK3: browser profiles per agent (demo; `simulate.tabs` sets the open pages).
    browserProfiles: createMockBrowserProfiles((event) => emitAgentEvent(event)),
    // COSGRAL W10-KK1: account sign-ins for apps (demo; `simulate` plays the browser coming back).
    integrations: createMockIntegrations((event) => emitAgentEvent(event)),
    // COSGRAL W9-BE1: the phone away from home (demo; `simulate` plays a phone setting a PIN or allowing notifications).
    phone: mockMobileConnect.phone,
    // COSGRAL W12-KK: the Mobile Connect page in one query (joined with the demo phone above).
    mobileConnect: { getOverview: mockMobileConnect.getOverview },
    // COSGRAL W12-KK: routines, workflows and the Marketplace tabs Agents and Skills (demo; nothing is scheduled, run or installed).
    routines: mockRoutines.api,
    workflows: mockWorkflows.api,
    marketplace: mockMarketplace.api,
    // COSGRAL W12-KK: remote desktop host and client (demo; no socket, no screen).
    remoteDesktop: createMockRemoteDesktop((event) => emitAgentEvent(event)),
    // COSGRAL W11 (U3-U6): search, message box (side question, slash, @), thread tabs (demo data).
    search: createMockSearch(),
    composer: createMockComposer((event) => emitAgentEvent(event)),
    threadTabs: createMockThreadTabs((event) => emitAgentEvent(event)),
    agentCards: createMockAgentCards((event) => emitAgentEvent(event)),
    serverSettings: createMockServerSettings((event) => emitAgentEvent(event)),
    providerCatalog: createMockProviderCatalog((event) => emitAgentEvent(event)),
    libraryView: createMockLibraryView(),
    usageReport: createMockUsageReport(),
    schedule: createMockSchedule(),
    // COSGRAL W12 (BE-J): the Tasks view over the same channels, tasks and messages as `channels` above.
    tasksView: createMockTasksView({
      channels: () => mockChannels,
      tasks: () => mockTasks,
      messages: () => mockMessages,
      agentName: (botId) => bots.find((bot) => bot.id === botId)?.name ?? null,
    }),
    // COSGRAL W12 (BE-R): routines of a channel over the same channels as `channels` above (demo; `tick` is for stories that build the mock).
    channelRoutines: createMockChannelRoutines({
      channels: () => mockChannels,
      emit: (event) => emitAgentEvent(event),
    }),
    // COSGRAL W10-KK2: Telegram bridge (demo; nothing is contacted; `simulate` plays a message coming in).
    messengers: createMockMessengers((event) => emitAgentEvent(event)),
    // COSGRAL W11-KK (d): Vault connectors and the person's Vault tools (demo; no manager is touched).
    vaultConnectors: mockVaultConnectors.connectors,
    vaultSecrets: mockVaultConnectors.secrets,
    // COSGRAL W11-KK (e): the Marketplace Apps tab (demo plugins; nothing is downloaded).
    pluginCatalog: createMockPluginCatalog((event) => emitAgentEvent(event)),
    // COSGRAL W12-KK (1): sign-in (OAuth) to MCP servers (demo; no browser opens).
    mcpOAuth: createMockMcpOAuth((event) => emitAgentEvent(event)),
    // COSGRAL W12-KK (g2): Transfer/Import of agents and the update preferences (demo; no file is touched).
    instanceTransfer: mockInstanceTransfer.transfer,
    updatePreferences: mockInstanceTransfer.updates,
    // COSGRAL W5-K2: own model endpoints (demo; nothing is contacted).
    endpoints: createMockEndpointsApi(),
    // COSGRAL W5-BE1: managed CLIs for Storybook and the preview (demo data; nothing is downloaded).
    subscriptions: {
      ...createMockAccounts((event) => emitAgentEvent(event)),
      listCli: async () => clone([...managedCli.values()]),
      checkCli: async ({ id }) =>
        updateCli(id, { latestVersion: id === "codex" ? "0.170.0" : "2.1.330", checkedAt: new Date().toISOString() }),
      installCli: async ({ id, version }) => installMockCli(id, version),
      updateCli: async ({ id }) => installMockCli(id),
      removeCli: async ({ id }) =>
        updateCli(id, {
          managedVersion: null,
          ...(managedCli.get(id)?.source === "managed" ? { source: "none", executable: null, version: null } : {}),
        }),
      pinCli: async ({ id, version }) => updateCli(id, { pinnedVersion: version }),
      setCliSettings: async ({ id, autoUpdate, customPath }) =>
        updateCli(id, {
          ...(autoUpdate === undefined ? {} : { autoUpdate }),
          ...(customPath === undefined
            ? {}
            : customPath === null
              ? { customPath: null, source: managedCli.get(id)?.managedVersion ? "managed" : "none" }
              : { customPath, source: "custom", executable: customPath }),
        }),
    },
  };

  function updateCli(id: ManagedCliId, patch: Partial<ManagedCliState>): ManagedCliState {
    const current = managedCli.get(id);
    if (!current) throw new Error("Unknown CLI.");
    const next = { ...current, ...patch };
    managedCli.set(id, next);
    emitAgentEvent({ type: "managed-cli-changed", state: clone(next) });
    return clone(next);
  }

  async function installMockCli(id: ManagedCliId, version?: string): Promise<ManagedCliState> {
    const target = version ?? managedCli.get(id)?.pinnedVersion ?? (id === "codex" ? "0.170.0" : "2.1.330");
    updateCli(id, { phase: "downloading", progress: { receivedBytes: 0, totalBytes: 40_000_000 }, error: null });
    updateCli(id, { phase: "downloading", progress: { receivedBytes: 20_000_000, totalBytes: 40_000_000 } });
    updateCli(id, { phase: "verifying", progress: null });
    return updateCli(id, {
      phase: "idle",
      managedVersion: target,
      latestVersion: target,
      ...(managedCli.get(id)?.customPath
        ? {}
        : { source: "managed", executable: `managed/${id}/${target}`, version: target }),
    });
  }

  if (api.threads) {
    const threads = api.threads;
    const branch = threads.branch;
    threads.branch = async (input) => {
      const current = getSnapshot(input.botId);
      const parent = current.threadId === input.threadId ? current : threadSnapshots.get(input.threadId);
      const index = parent?.messages.findIndex((message) => message.id === input.fromMessageId) ?? -1;
      if (!parent || index < 0) throw new Error("That message is not in this thread.");
      const history = clone(parent.messages.slice(0, index + 1));
      const result = await branch(input);
      if (result.activeThreadId) {
        const snapshot: ConversationSnapshot = {
          botId: input.botId,
          threadId: result.activeThreadId,
          activeTurnId: null,
          revision: 0,
          messages: history,
        };
        snapshots[input.botId] = snapshot;
        threadSnapshots.set(result.activeThreadId, clone(snapshot));
        emitAgentEvent({ type: "conversation", snapshot });
      }
      return result;
    };
  }
  return {
    api,
    emitAgentEvent,
    emitAuthState,
    emitPresence,
    emitDirectMessage,
    emitDirectTyping,
    emitInvite,
    emitHostStatus,
    emitRemoteMacSessions,
    emitEyesState,
    emitActivity,
    emitSidebarLayout,
    pendingRequests: () => clone(pending),
    dispose: () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      agentListeners.clear();
      authListeners.clear();
      presenceListeners.clear();
      directMessageListeners.clear();
      directTypingListeners.clear();
      inviteListeners.clear();
      hostListeners.clear();
      remoteMacListeners.clear();
      updateListeners.clear();
      attachmentListeners.clear();
      void appInfo;
    },
  };
}
