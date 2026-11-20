import {
  attachmentReferenceIds,
  expandAttachmentReferences,
  removeAttachmentReferences,
} from "@openbot/contracts/attachment-references";
import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import type {
  AgentModelId,
  AgentReasoningEffort,
  AttachmentSummary,
  AvatarImageInput,
  BotAvatarHue,
  BrowserTab,
  DraftAttachment,
  MessageReaction,
  QueueDelivery,
  UpdateBotInput,
} from "@openbot/contracts/ipc";
import { isClaudeModel } from "@openbot/contracts/ipc";
import { createEffect, createMemo, createSignal, For, onCleanup, onSettled, Show, untrack } from "solid-js";
import { normalizeAvatarFile } from "../avatar-image";
import { avatarCandidateSeeds } from "../blobatar";
import type { BotMessage } from "../data";
import { t, tData } from "../i18n";
import { AccountErrorCard } from "./AccountErrorCard";
import { AccountLimitReachedCard, AccountSwitchedCard } from "./AccountLimitCards";
import { ActionCard } from "./ActionCard";
import { AgentAvatar } from "./AgentAvatar";
import { AgentCardDetail } from "./AgentCardDetail";
import { AgentCardsSection } from "./AgentCardsSection";
import { AgentSettingsW3 } from "./AgentSettingsW3";
import { ApprovalRulesSettings } from "./ApprovalRulesSettings";
import { ChatRightPanelTabs, ChatSidePanelLauncher, type ChatSidePanelTarget } from "./ChatSidePanelLauncher";
import { ComposerEditor, expandComposerMentions } from "./ComposerEditor";
import { ContextIndicator } from "./ContextIndicator";
import { ChoiceCard } from "./ConversationPrompts";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { AgentActivityIndicator, ThinkingDisclosure } from "./conversation/AgentActivity";
import { AgentRecipientPicker } from "./conversation/AgentRecipientPicker";
import { AttachmentCards, fileBadge, formatFileSize } from "./conversation/AttachmentCards";
import { AvatarEditor } from "./conversation/AvatarEditor";
import { BrowserPanel } from "./conversation/BrowserPanel";
import { ChatSearch } from "./conversation/ChatSearch";
import {
  BackIcon,
  CloseIcon,
  ComputerIcon,
  PlusIcon,
  RemoteDesktopIcon,
  SettingsForwardIcon,
  StopIcon,
} from "./conversation/ConversationIcons";
import {
  type ChatSearchMatch,
  clearChatSearchHighlights,
  findChatSearchMatches,
  renderChatSearchHighlights,
} from "./conversation/chat-search";
import { ScrollToLatestButton, scrollToLatestMessage } from "./conversation/MessageNavigation";
import { ExchangeSystemRow, MessageActions, MessageBody } from "./conversation/MessageRendering";
import {
  BROWSER_PANEL_DEFAULT,
  BROWSER_PANEL_MAX,
  BROWSER_PANEL_MIN,
  BROWSER_PANEL_STORAGE_KEY,
  type ComposerDraft,
  type ConversationProps,
  EMPTY_DRAFT,
  type MediaPreview,
  ONBOARDING_CHOICE_KEYS,
  type RightPanelMode,
  SETTINGS_PANEL_DEFAULT,
  SETTINGS_PANEL_MAX,
  SETTINGS_PANEL_MIN,
  SETTINGS_PANEL_SIZES,
  SETTINGS_PANEL_STORAGE_KEY,
} from "./conversation/model";
import { QueuePanel } from "./conversation/QueuePanel";
import { ReasoningSelect } from "./conversation/ReasoningSelect";
import { MessageSelectionActions } from "./conversation/SelectionActions";
import { SidePanelResizer } from "./conversation/SidePanelResizer";
import {
  scrollToUnreadBoundary,
  UnreadMessagesBanner,
  UnreadMessagesDivider,
  unreadMessagesDividerIsVisible,
} from "./conversation/UnreadMessages";
import { EyesBar } from "./EyesIndicator";
import { FallbackModelBadge } from "./FallbackModelBadge";
import { LibraryPanel } from "./LibraryPanel";
import { McpSettings } from "./McpSettings";
import { readPanelWidth, savePanelWidth } from "./PanelResizer";
import { PlanCard, PlanPanel } from "./PlanPanel";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { providerError } from "./provider-error";
import { QueueHoldNotice } from "./QueueHoldNotice";
import {
  REMOTE_DESKTOP_PANEL_DEFAULT,
  REMOTE_DESKTOP_PANEL_MAX,
  REMOTE_DESKTOP_PANEL_MIN,
  REMOTE_DESKTOP_PANEL_STORAGE_KEY,
  RemoteMacPanel,
} from "./RemoteMacPanel";
import { RoutinePanel } from "./RoutinePanel";
import { SideQuestionPanel } from "./SideQuestionPanel";
import { SkillQuickPick } from "./SkillQuickPick";
import { StickyDecision } from "./StickyDecision";
import { ThreadPanel } from "./ThreadPanel";
import { NewThreadButton, ThreadTabs } from "./ThreadTabs";
import {
  AudioLines,
  Button,
  Crosshair,
  Dialog,
  Input,
  LibraryBig,
  MessageCircleQuestion,
  Paperclip,
  Popover,
  SlidersHorizontal,
  Sparkles,
  Switch,
  Text,
  Textarea,
} from "./ui";
import { VaultRequestCard } from "./VaultRequestCard";
import { VoiceAutoRead, VoicePlayback } from "./VoicePlayback";
import { VoiceRecorder } from "./VoiceRecorder";

export function Conversation(props: ConversationProps) {
  const agentReady = () => props.agentStatus.phase === "ready";
  const imageGenerationUnavailable = () => Boolean(props.bot && isClaudeModel(props.bot.model));
  const [drafts, setDrafts] = createSignal<Record<string, ComposerDraft>>({});
  const [voicePlaybackEnabled, setVoicePlaybackEnabled] = createSignal(false);
  onSettled(() => {
    const api = window.openbot.voice;
    if (!api) return;
    void api
      .getState()
      .then((state) => setVoicePlaybackEnabled(state.settings.enabled && state.speech.available))
      .catch(() => setVoicePlaybackEnabled(false));
    return window.openbot.agent.onEvent((event) => {
      if (event.type === "voice-changed")
        setVoicePlaybackEnabled(event.state.settings.enabled && event.state.speech.available);
    });
  });
  const [editingDeliveryId, setEditingDeliveryId] = createSignal<string | null>(null);
  const [editingDraftBackup, setEditingDraftBackup] = createSignal<ComposerDraft | null>(null);
  const [showAttachments, setShowAttachments] = createSignal(false);
  /** One thread: no tab strip, "New thread" sits in the header (set by ThreadTabs once the list arrived). */
  const [singleThread, setSingleThread] = createSignal(false);
  const [libraryOpen, setLibraryOpen] = createSignal(false);
  let libraryDetails: HTMLDetailsElement | undefined;
  let libraryOwner: string | undefined;
  const [attachmentBusy, setAttachmentBusy] = createSignal(false);
  const [attachMenuView, setAttachMenuView] = createSignal<"main" | "skills">("main");
  const [sideQuestionOpen, setSideQuestionOpen] = createSignal(false);
  const [composerError, setComposerError] = createSignal<string | null>(null);
  // COSGRAL W4-BE2: "Try again" on the agent setup card while the CLIs restart.
  const [retryingStart, setRetryingStart] = createSignal(false);
  const [markingRead, setMarkingRead] = createSignal(false);
  const [settingsSaveError, setSettingsSaveError] = createSignal<string | null>(null);
  const [submitting, setSubmitting] = createSignal(false);
  const [selectionSending, setSelectionSending] = createSignal(false);
  const [dropActive, setDropActive] = createSignal(false);
  const [rightPanels, setRightPanels] = createSignal<Record<string, RightPanelMode>>({});
  const [settingsName, setSettingsName] = createSignal("");
  const [settingsTitle, setSettingsTitle] = createSignal("");
  const [settingsDescription, setSettingsDescription] = createSignal("");
  let settingsNameDirty = false;
  let settingsTitleDirty = false;
  let settingsDescriptionDirty = false;
  const [settingsNotifications, setSettingsNotifications] = createSignal(true);
  const [settingsModel, setSettingsModel] = createSignal<AgentModelId>("gpt-5.6-luna");
  const [settingsReasoning, setSettingsReasoning] = createSignal<AgentReasoningEffort>("medium");
  const [onboardingBots, setOnboardingBots] = createSignal<Record<string, true>>({});
  const [modelConfirmedBots, setModelConfirmedBots] = createSignal<Record<string, true>>({});
  const [completedOnboardingBots, setCompletedOnboardingBots] = createSignal<Record<string, true>>({});
  const [avatarPickerOpen, setAvatarPickerOpen] = createSignal(false);
  const [avatarSeed, setAvatarSeed] = createSignal("agent");
  const [avatarHue, setAvatarHue] = createSignal<BotAvatarHue | null>(null);
  const avatarUrl = () => props.bot?.avatarUrl ?? null;
  const [avatarUploadBusy, setAvatarUploadBusy] = createSignal(false);
  const [avatarCandidateSeed, setAvatarCandidateSeed] = createSignal("agent");
  const [avatarBatch, setAvatarBatch] = createSignal(0);
  const avatarCandidates = createMemo(() => {
    const bot = props.bot;
    return bot ? avatarCandidateSeeds(bot.id, avatarCandidateSeed(), avatarBatch()) : [];
  });
  const [browserAddress, setBrowserAddress] = createSignal("https://www.google.com");
  const [mediaPreview, setMediaPreview] = createSignal<MediaPreview | null>(null);
  const [openReactionMessageId, setOpenReactionMessageId] = createSignal<string | null>(null);
  const [openMoreMessageId, setOpenMoreMessageId] = createSignal<string | null>(null);
  const [expandedEmojiMessageId, setExpandedEmojiMessageId] = createSignal<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = createSignal<string | null>(null);
  const [chatSearchOpen, setChatSearchOpen] = createSignal(false);
  const [chatSearchQuery, setChatSearchQuery] = createSignal("");
  const [chatSearchMatches, setChatSearchMatches] = createSignal<ChatSearchMatch[]>([]);
  const [threadActionError, setThreadActionError] = createSignal("");
  const [activeChatSearchIndex, setActiveChatSearchIndex] = createSignal(-1);
  let typingIdleTimer: ReturnType<typeof setTimeout> | undefined;
  let typingBotId: string | null = null;
  const [settingsPanelWidth, setSettingsPanelWidth] = createSignal(
    readPanelWidth(SETTINGS_PANEL_STORAGE_KEY, SETTINGS_PANEL_DEFAULT, SETTINGS_PANEL_MIN, SETTINGS_PANEL_MAX),
  );
  const [browserPanelWidth, setBrowserPanelWidth] = createSignal(
    readPanelWidth(BROWSER_PANEL_STORAGE_KEY, BROWSER_PANEL_DEFAULT, BROWSER_PANEL_MIN, BROWSER_PANEL_MAX),
  );
  const [remoteDesktopPanelWidth, setRemoteDesktopPanelWidth] = createSignal(
    readPanelWidth(
      REMOTE_DESKTOP_PANEL_STORAGE_KEY,
      REMOTE_DESKTOP_PANEL_DEFAULT,
      REMOTE_DESKTOP_PANEL_MIN,
      REMOTE_DESKTOP_PANEL_MAX,
    ),
  );
  const selectedModel = createMemo(() => props.modelOptions.find((option) => option.id === settingsModel()));
  const reasoningOptions = createMemo(() => selectedModel()?.supportedReasoningEfforts ?? ["medium" as const]);
  const onboardingActive = createMemo(() => {
    const botId = props.bot?.id;
    return Boolean(botId && onboardingBots()[botId]);
  });
  const onboardingModelConfirmed = createMemo(() => {
    const botId = props.bot?.id;
    return Boolean(botId && onboardingActive() && modelConfirmedBots()[botId]);
  });
  const onboardingModelRequired = createMemo(() => agentReady() && onboardingActive() && !onboardingModelConfirmed());
  const currentDraft = createMemo(() => {
    const id = props.bot?.id;
    return id ? (drafts()[id] ?? EMPTY_DRAFT) : EMPTY_DRAFT;
  });
  const unreferencedDraftAttachments = createMemo(() => {
    const referencedIds = attachmentReferenceIds(currentDraft().text);
    return currentDraft().attachments.filter((attachment) => !referencedIds.has(attachment.id));
  });
  const replyTarget = createMemo(() => {
    const id = currentDraft().replyToMessageId;
    return id ? props.messages.find((message) => message.id === id) : undefined;
  });
  const activeRightPanel = createMemo<RightPanelMode>(() => {
    if (props.agentPickerOpen) return "none";
    const botId = props.bot?.id;
    return botId ? (rightPanels()[botId] ?? "none") : "none";
  });
  const screenOpen = () => activeRightPanel() === "browser";
  const remoteDesktopOpen = () => activeRightPanel() === "desktop";
  const settingsOpen = () => activeRightPanel() === "settings";
  const filesOpen = () => activeRightPanel() === "files";
  const voiceOpen = () => activeRightPanel() === "voice";
  function openChatSidePanel(target: ChatSidePanelTarget) {
    setActiveRightPanel(target);
  }
  const browserTabs = createMemo(() => {
    const bot = props.bot;
    if (!bot) return [];
    return props.browserTabs.filter((tab) =>
      tab.ownerBotId ? tab.ownerBotId === bot.id : Boolean(bot.threadId && tab.ownerThreadId === bot.threadId),
    );
  });
  const activeBrowserTab = createMemo(
    () => browserTabs().find((tab) => tab.id === props.activeBrowserTabId) ?? browserTabs()[0],
  );
  let previousBrowserTabCount = 0;
  createEffect(
    () => ({ count: browserTabs().length, open: screenOpen() }),
    ({ count, open }) => {
      const browserWasClosed = open && previousBrowserTabCount > 0 && count === 0;
      previousBrowserTabCount = count;
      if (browserWasClosed) hideBrowserPanel();
    },
  );
  const activeBrowserControl = createMemo(() => {
    const sessions = props.browserControlState.sessions;
    const activeTab = activeBrowserTab();
    const forActiveTab = activeTab?.ownerThreadId
      ? sessions.filter((session) => session.threadId === activeTab.ownerThreadId)
      : [];
    const forActiveBot = props.bot?.threadId
      ? sessions.filter((session) => session.threadId === props.bot?.threadId)
      : [];
    const candidates = forActiveTab.length > 0 ? forActiveTab : forActiveBot;
    return (
      [...candidates]
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
        .find((session) => session.phase === "acting") ?? candidates.at(-1)
    );
  });
  const browserControlBot = createMemo(() => {
    const control = activeBrowserControl();
    return control ? props.bots.find((bot) => bot.threadId === control.threadId) : undefined;
  });
  const browserControlForTab = (tab: BrowserTab) => {
    const sessions = props.browserControlState.sessions;
    return (
      sessions.find((session) => session.tabId === tab.id) ??
      sessions.find(
        (session) =>
          session.tabId === null && tab.id === activeBrowserTab()?.id && session.threadId === tab.ownerThreadId,
      )
    );
  };
  const browserControllerForTab = (tab: BrowserTab) => {
    const control = browserControlForTab(tab);
    return control ? props.bots.find((bot) => bot.threadId === control.threadId) : undefined;
  };
  const agentActivity = createMemo<"Queued" | "Working" | null>(() => {
    if (
      props.activeTurnId ||
      props.queue?.deliveries.some((delivery) => delivery.status === "starting" || delivery.status === "running")
    ) {
      return "Working";
    }
    if (!props.queue?.paused && props.queue?.deliveries.some((delivery) => delivery.status === "queued")) {
      return "Queued";
    }
    return null;
  });
  const visibleAgentActivity = (): "Queued" | "Working" | null => {
    const activity = agentActivity();
    if (activity !== "Working") return activity;
    const activeTurnId = props.activeTurnId;
    if (!activeTurnId) return activity;
    const imageGenerationFinished = props.messages.some(
      (message) =>
        message.itemType === "image_generation" &&
        message.turnId === activeTurnId &&
        (message.status === "completed" ||
          message.status === "failed" ||
          message.status === "interrupted" ||
          (message.attachments?.length ?? 0) > 0),
    );
    return imageGenerationFinished ? null : activity;
  };
  const queueBarVisible = createMemo(
    () =>
      Boolean(props.queue?.paused) ||
      Boolean(props.queue?.deliveries.some((item) => item.status === "queued" || item.status === "starting")),
  );
  const seenMessageIds = new Set<string>();
  const [fadeAtTop, setFadeAtTop] = createSignal(false);
  const [fadeAtBottom, setFadeAtBottom] = createSignal(false);
  const [showScrollToLatest, setShowScrollToLatest] = createSignal(false);
  const [unreadDividerVisible, setUnreadDividerVisible] = createSignal(false);
  let scrollElement: HTMLDivElement | undefined;
  let unreadMessagesDivider: HTMLDivElement | undefined;
  let unreadVisibilityFrame: number | undefined;
  let currentUnreadCount = 0;
  let conversationPanel: HTMLElement | undefined;
  let browserSurface: HTMLDivElement | undefined;
  let browserResizeObserver: ResizeObserver | undefined;
  let browserWindowResizeHandler: (() => void) | undefined;
  let browserVisibilityFrame: number | undefined;
  let browserBoundsFrame: number | undefined;
  let browserVisibilityGeneration = 0;
  let pickerInput: HTMLInputElement | undefined;
  let chatSearchInput: HTMLInputElement | undefined;
  let chatSearchReturnFocus: HTMLElement | undefined;
  let chatSearchFrame: number | undefined;
  let lastChatSearchQuery = "";
  let settingsNameInput: HTMLInputElement | undefined;
  let settingsTitleInput: HTMLInputElement | undefined;
  let settingsDescriptionInput: HTMLTextAreaElement | undefined;
  let avatarPickerRoot: HTMLDivElement | undefined;
  let avatarFileInput: HTMLInputElement | undefined;
  let stickToLatest = true;
  let lastConversationBotId: string | undefined;
  let lastPanelBotId: string | undefined;
  let lastHandledSettingsRequestNonce: number | undefined;
  let lastHandledRemoteDesktopRequest = 0;
  let lastHandledOnboardingRequestNonce: number | undefined;
  let lastHandledMessageFocusNonce: number | undefined;
  let lastSettingsSignature: string | undefined;
  let lastAvatarSettingsBotId: string | undefined;
  let controlledBrowserBotIds = new Set<string>();
  const importTargetBots = new Map<string, string>();

  function openChatSearch(): void {
    if (!chatSearchOpen() && document.activeElement instanceof HTMLElement) {
      chatSearchReturnFocus = document.activeElement;
    }
    setChatSearchOpen(true);
    requestAnimationFrame(() => {
      chatSearchInput?.focus();
      chatSearchInput?.select();
    });
  }

  function closeChatSearch(restoreFocus = true): void {
    setChatSearchOpen(false);
    setChatSearchQuery("");
    setChatSearchMatches([]);
    setActiveChatSearchIndex(-1);
    clearChatSearchHighlights();
    const returnFocus = chatSearchReturnFocus;
    if (restoreFocus && returnFocus?.isConnected) {
      requestAnimationFrame(() => returnFocus.focus());
    }
    chatSearchReturnFocus = undefined;
  }

  function moveChatSearch(direction: 1 | -1): void {
    const total = chatSearchMatches().length;
    if (total === 0) return;
    setActiveChatSearchIndex((current) => (current + direction + total) % total);
  }

  function handleChatSearchShortcut(event: KeyboardEvent): void {
    const primaryModifier = event.metaKey || event.ctrlKey;
    const key = event.key.toLocaleLowerCase();
    if (primaryModifier && !event.altKey && !event.shiftKey && key === "f") {
      event.preventDefault();
      event.stopPropagation();
      openChatSearch();
      return;
    }
    if (!chatSearchOpen() || !primaryModifier || event.altKey || key !== "g") return;
    event.preventDefault();
    event.stopPropagation();
    moveChatSearch(event.shiftKey ? -1 : 1);
  }

  async function saveBotPatch(updates: Omit<UpdateBotInput, "botId">, targetBotId = props.bot?.id): Promise<boolean> {
    const botId = targetBotId;
    if (!botId) return false;
    setSettingsSaveError(null);
    try {
      await props.onUpdateBot(botId, updates);
      return true;
    } catch (error) {
      setSettingsSaveError(error instanceof Error ? error.message : t("Could not save agent settings."));
      return false;
    }
  }

  function saveSettingsName(): void {
    const botId = props.bot?.id;
    if (!botId) return;
    const name = settingsName().trim() || t("New agent");
    setSettingsName(name);
    if (settingsNameInput) settingsNameInput.value = name;
    setTimeout(() => {
      void saveBotPatch({ name }, botId).then((saved) => {
        if (saved && props.bot?.id === botId && settingsName() === name) settingsNameDirty = false;
      });
    }, 0);
  }

  function saveSettingsTitle(): void {
    const botId = props.bot?.id;
    if (!botId) return;
    const role = settingsTitle().trim();
    setSettingsTitle(role);
    if (settingsTitleInput) settingsTitleInput.value = role;
    setTimeout(() => {
      void saveBotPatch({ role }, botId).then((saved) => {
        if (saved && props.bot?.id === botId && settingsTitle() === role) settingsTitleDirty = false;
      });
    }, 0);
  }

  function changeReasoning(reasoningEffort: AgentReasoningEffort): void {
    setSettingsReasoning(reasoningEffort);
    saveBotPatch({ reasoningEffort });
  }
  function saveSettingsDescription(): void {
    const botId = props.bot?.id;
    if (!botId) return;
    const description = settingsDescription();
    setTimeout(() => {
      void saveBotPatch({ description }, botId).then((saved) => {
        if (saved && props.bot?.id === botId && settingsDescription() === description) {
          settingsDescriptionDirty = false;
        }
      });
    }, 0);
  }

  async function setCustomAvatar(image: AvatarImageInput | null): Promise<boolean> {
    const botId = props.bot?.id;
    if (!botId || avatarUploadBusy()) return false;
    setAvatarUploadBusy(true);
    setSettingsSaveError(null);
    try {
      await props.onSetAgentAvatar(botId, image);
      return true;
    } catch (error) {
      setSettingsSaveError(error instanceof Error ? error.message : t("Could not save the agent avatar."));
      return false;
    } finally {
      setAvatarUploadBusy(false);
    }
  }

  async function uploadAgentAvatar(file: File | undefined): Promise<void> {
    if (!file) return;
    setAvatarUploadBusy(true);
    setSettingsSaveError(null);
    try {
      const image = await normalizeAvatarFile(file);
      const botId = props.bot?.id;
      if (!botId) return;
      await props.onSetAgentAvatar(botId, image);
    } catch (error) {
      setSettingsSaveError(error instanceof Error ? error.message : t("Could not process the agent avatar."));
    } finally {
      setAvatarUploadBusy(false);
      if (avatarFileInput) avatarFileInput.value = "";
    }
  }

  async function selectGeneratedAvatar(seed: string): Promise<void> {
    if (avatarUrl() && !(await setCustomAvatar(null))) return;
    setAvatarSeed(seed);
    await saveBotPatch({ avatarSeed: seed });
  }

  async function selectModel(model: AgentModelId, persist = true, reportComposerError = false): Promise<boolean> {
    const option = props.modelOptions.find((candidate) => candidate.id === model);
    if (!option) return false;
    const reasoningEffort = option.supportedReasoningEfforts.includes(settingsReasoning())
      ? settingsReasoning()
      : option.defaultReasoningEffort;
    const previousModel = settingsModel();
    const previousReasoning = settingsReasoning();
    setSettingsModel(model);
    setSettingsReasoning(reasoningEffort);
    if (!persist) return true;
    if (reportComposerError) setComposerError(null);
    const saved = await saveBotPatch({ model, reasoningEffort });
    if (saved) return true;
    setSettingsModel(previousModel);
    setSettingsReasoning(previousReasoning);
    if (reportComposerError) setComposerError(t("Could not change model. Try again."));
    return false;
  }

  async function selectAndConfirmModel(model: AgentModelId): Promise<void> {
    if (!(await selectModel(model, true, true))) return;
    const botId = props.bot?.id;
    if (botId) setModelConfirmedBots((current) => ({ ...current, [botId]: true }));
  }

  function finishOnboarding(botId: string): void {
    setCompletedOnboardingBots((current) => ({ ...current, [botId]: true }));
    setOnboardingBots((current) => {
      if (!current[botId]) return current;
      const next = { ...current };
      delete next[botId];
      return next;
    });
    setModelConfirmedBots((current) => {
      if (!current[botId]) return current;
      const next = { ...current };
      delete next[botId];
      return next;
    });
  }

  function updateScrollFade(element = scrollElement) {
    if (!element) return;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    setFadeAtTop(element.scrollTop > 2);
    setFadeAtBottom(remaining > 2);
    setShowScrollToLatest(remaining > 80);
  }

  function updateUnreadDividerVisibility(): void {
    setUnreadDividerVisible(
      Boolean(
        currentUnreadCount > 0 &&
          scrollElement &&
          unreadMessagesDivider &&
          unreadMessagesDividerIsVisible(scrollElement, unreadMessagesDivider),
      ),
    );
  }

  function scheduleUnreadDividerVisibilityUpdate(): void {
    if (unreadVisibilityFrame !== undefined) cancelAnimationFrame(unreadVisibilityFrame);
    unreadVisibilityFrame = requestAnimationFrame(() => {
      unreadVisibilityFrame = undefined;
      updateUnreadDividerVisibility();
    });
  }

  const markMessageSeen = (messageId: string): boolean => {
    const key = `${props.bot?.id ?? "none"}:${messageId}`;
    if (seenMessageIds.has(key)) return false;
    seenMessageIds.add(key);
    return true;
  };

  const updateCurrentDraft = (patch: Partial<ComposerDraft>) => {
    const id = props.bot?.id;
    if (!id) return;
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? EMPTY_DRAFT), ...patch },
    }));
  };

  onSettled(() => {
    const unsubscribeImport = window.openbot.agent.onAttachmentImport((event) => {
      if (event.type === "started") {
        const botId = props.bot?.id;
        if (botId) importTargetBots.set(event.requestId, botId);
        setAttachmentBusy(true);
        setComposerError(null);
      } else if (event.type === "error") {
        importTargetBots.delete(event.requestId);
        setAttachmentBusy(false);
        setComposerError(event.message);
      } else {
        setAttachmentBusy(false);
        const botId = importTargetBots.get(event.requestId);
        importTargetBots.delete(event.requestId);
        if (botId && props.bots.some((bot) => bot.id === botId)) {
          addAttachments(event.attachments, botId);
        } else {
          for (const attachment of event.attachments) {
            void window.openbot.agent.discardDraftAttachment(attachment.id);
          }
        }
      }
    });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (chatSearchOpen()) {
        event.preventDefault();
        closeChatSearch();
        return;
      }
      if (editingDeliveryId()) {
        cancelQueuedMessageEdit();
        return;
      }
      setOpenReactionMessageId(null);
      setOpenMoreMessageId(null);
      setExpandedEmojiMessageId(null);
      hideBrowserPanel();
      setMediaPreview(null);
      setAvatarPickerOpen(false);
      props.onCloseAgentPicker();
    };
    const closeActiveBrowserTab = (event: KeyboardEvent) => {
      if (
        !screenOpen() ||
        event.key.toLowerCase() !== "w" ||
        (!event.ctrlKey && !event.metaKey) ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }
      const tab = activeBrowserTab();
      if (!tab) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void closeBrowserTab(tab.id);
    };
    const closeMessageMenus = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(".message-actions")) return;
      setOpenReactionMessageId(null);
      setOpenMoreMessageId(null);
      setExpandedEmojiMessageId(null);
    };
    const closeAvatarPicker = (event: PointerEvent) => {
      if (!avatarPickerOpen()) return;
      if (event.target instanceof Node && avatarPickerRoot?.contains(event.target)) return;
      setAvatarPickerOpen(false);
    };
    const keyboardTarget = conversationPanel?.ownerDocument ?? document;
    const keyboardWindow = keyboardTarget.defaultView ?? window;
    keyboardTarget.addEventListener("keydown", closeOnEscape);
    keyboardWindow.addEventListener("keydown", closeActiveBrowserTab);
    keyboardTarget.addEventListener("keydown", handleChatSearchShortcut);
    window.addEventListener("pointerdown", closeMessageMenus);
    window.addEventListener("pointerdown", closeAvatarPicker);
    const scrollResizeObserver = new ResizeObserver(() => {
      updateScrollFade();
      updateUnreadDividerVisibility();
    });
    if (scrollElement) scrollResizeObserver.observe(scrollElement);
    requestAnimationFrame(() => {
      if (!scrollElement) return;
      if (stickToLatest) scrollElement.scrollTop = scrollElement.scrollHeight;
      updateScrollFade(scrollElement);
      updateUnreadDividerVisibility();
    });
    return () => {
      if (unreadVisibilityFrame !== undefined) cancelAnimationFrame(unreadVisibilityFrame);
      scrollResizeObserver.disconnect();
      unsubscribeImport();
      keyboardTarget.removeEventListener("keydown", closeOnEscape);
      keyboardWindow.removeEventListener("keydown", closeActiveBrowserTab);
      keyboardTarget.removeEventListener("keydown", handleChatSearchShortcut);
      window.removeEventListener("pointerdown", closeMessageMenus);
      window.removeEventListener("pointerdown", closeAvatarPicker);
    };
  });

  createEffect(
    () => ({
      open: chatSearchOpen(),
      query: chatSearchQuery(),
      messageSignature: props.messages
        .map((message) => `${message.id}:${message.body}:${message.items?.join("\u0000") ?? ""}`)
        .join("\u0001"),
    }),
    ({ open, query }) => {
      if (chatSearchFrame !== undefined) cancelAnimationFrame(chatSearchFrame);
      const queryChanged = query !== lastChatSearchQuery;
      lastChatSearchQuery = query;
      if (!open || !query.trim()) {
        setChatSearchMatches([]);
        setActiveChatSearchIndex(-1);
        clearChatSearchHighlights();
        return;
      }
      chatSearchFrame = requestAnimationFrame(() => {
        chatSearchFrame = undefined;
        if (!scrollElement) return;
        const matches = findChatSearchMatches(scrollElement, query);
        setChatSearchMatches(matches);
        setActiveChatSearchIndex((current) => {
          if (matches.length === 0) return -1;
          if (queryChanged || current < 0) return 0;
          return Math.min(current, matches.length - 1);
        });
      });
    },
  );

  createEffect(
    () => ({
      request: props.messageFocusRequest,
      botId: props.bot?.id,
      loaded: props.loaded,
      messageIds: props.messages.map((message) => message.id).join("\u0000"),
    }),
    ({ request, botId, loaded }) => {
      if (!request || request.botId !== botId || !loaded || request.nonce === lastHandledMessageFocusNonce) return;
      requestAnimationFrame(() => {
        const target = scrollElement?.querySelector<HTMLElement>(
          `[data-chat-search-message="${CSS.escape(request.messageId)}"]`,
        );
        if (!target) return;
        lastHandledMessageFocusNonce = request.nonce;
        stickToLatest = false;
        target.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
      });
    },
  );

  createEffect(
    () => ({
      open: chatSearchOpen(),
      matches: chatSearchMatches(),
      activeIndex: activeChatSearchIndex(),
    }),
    ({ open, matches, activeIndex }) => {
      if (!open) return;
      renderChatSearchHighlights(matches, activeIndex);
      const match = matches[activeIndex];
      if (!match) return;
      stickToLatest = false;
      match.message.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center",
        inline: "nearest",
      });
    },
  );

  onCleanup(() => {
    if (chatSearchFrame !== undefined) cancelAnimationFrame(chatSearchFrame);
    clearChatSearchHighlights();
  });

  createEffect(
    () => ({ request: props.onboardingRequest, botId: props.bot?.id }),
    ({ request, botId }) => {
      if (!request || botId !== request.botId || request.nonce === lastHandledOnboardingRequestNonce) return;
      lastHandledOnboardingRequestNonce = request.nonce;
      setOnboardingBots((current) => ({ ...current, [request.botId]: true }));
      setModelConfirmedBots((current) => ({
        ...current,
        [request.botId]: true,
      }));
      setActiveRightPanel("none", botId);
    },
  );

  createEffect(
    () => {
      const lastMessage = props.messages[props.messages.length - 1];
      return {
        botId: props.bot?.id,
        activeTurnId: props.activeTurnId,
        queueSignature: props.queue?.deliveries.map((delivery) => `${delivery.id}:${delivery.status}`).join("|"),
        lastMessageBody: lastMessage?.body,
        lastMessageStatus: lastMessage?.status,
        deliverySignature: lastMessage?.exchange?.deliveries
          .map((delivery) => `${delivery.id}:${delivery.status}:${delivery.position}`)
          .join("|"),
        loaded: props.loaded,
        agentPickerOpen: props.agentPickerOpen,
        prompt: props.prompt,
        unreadCount: props.unreadCount,
      };
    },
    ({ botId, unreadCount }) => {
      currentUnreadCount = unreadCount;
      if (botId !== lastConversationBotId) {
        if (lastConversationBotId !== undefined) closeChatSearch(false);
        lastConversationBotId = botId;
        stickToLatest = true;
        setEditingDeliveryId(null);
        setEditingDraftBackup(null);
      }
      requestAnimationFrame(() => {
        if (!scrollElement) return;
        if (stickToLatest) scrollElement.scrollTop = scrollElement.scrollHeight;
        updateScrollFade(scrollElement);
        updateUnreadDividerVisibility();
      });
    },
  );

  createEffect(
    () => {
      const bot = props.bot;
      if (!bot) return null;
      return {
        id: bot.id,
        signature: [
          bot.id,
          bot.name,
          bot.role,
          bot.description,
          String(bot.notifications),
          bot.model,
          bot.reasoningEffort,
          bot.avatarSeed,
          String(bot.avatarHue),
        ].join("\u0000"),
        name: bot.name,
        role: bot.role,
        description: bot.description,
        notifications: bot.notifications,
        model: bot.model,
        reasoningEffort: bot.reasoningEffort,
        avatarSeed: bot.avatarSeed,
        avatarHue: bot.avatarHue,
      };
    },
    (bot) => {
      if (!bot || bot.signature === lastSettingsSignature) return;
      const botChanged = bot.id !== lastAvatarSettingsBotId;
      lastSettingsSignature = bot.signature;
      lastAvatarSettingsBotId = bot.id;
      if (botChanged) {
        settingsNameDirty = false;
        settingsTitleDirty = false;
        settingsDescriptionDirty = false;
      }
      if (botChanged || !settingsNameDirty) {
        setSettingsName(bot.name);
        if (settingsNameInput) settingsNameInput.value = bot.name;
      }
      if (botChanged || !settingsTitleDirty) {
        setSettingsTitle(bot.role);
        if (settingsTitleInput) settingsTitleInput.value = bot.role;
      }
      if (botChanged || !settingsDescriptionDirty) {
        setSettingsDescription(bot.description);
        if (settingsDescriptionInput) settingsDescriptionInput.value = bot.description;
      }
      setSettingsNotifications(bot.notifications);
      setSettingsModel(bot.model);
      setSettingsReasoning(bot.reasoningEffort);
      setAvatarSeed(bot.avatarSeed);
      setAvatarHue(bot.avatarHue);
      if (botChanged) {
        setAvatarCandidateSeed(bot.avatarSeed);
        setAvatarBatch(0);
        setAvatarPickerOpen(false);
      }
    },
  );

  createEffect(
    () => {
      const botId = props.bot?.id;
      if (
        !botId ||
        !props.loaded ||
        !agentReady() ||
        props.activeTurnId ||
        props.messages.length > 0 ||
        props.onboardingRequest?.botId === botId ||
        completedOnboardingBots()[botId] ||
        onboardingBots()[botId]
      )
        return null;
      return botId;
    },
    (botId) => {
      if (botId) setOnboardingBots((current) => ({ ...current, [botId]: true }));
    },
  );

  createEffect(
    () => {
      const botId = props.bot?.id;
      return { botId, panel: botId ? rightPanels()[botId] : undefined };
    },
    ({ botId, panel }) => {
      if (botId === lastPanelBotId) return;
      const previousBotId = lastPanelBotId;
      lastPanelBotId = botId;
      if (!previousBotId || !botId || panel !== "settings") return;
      setRightPanels((current) => ({ ...current, [botId]: "none" }));
    },
  );

  createEffect(
    () => ({ request: props.settingsRequest, botId: props.bot?.id }),
    ({ request, botId }) => {
      if (!request || botId !== request.botId || request.nonce === lastHandledSettingsRequestNonce) return;
      lastHandledSettingsRequestNonce = request.nonce;
      setActiveRightPanel("settings", botId);
      if (request.focus === "name") {
        requestAnimationFrame(() => {
          settingsNameInput?.focus();
          settingsNameInput?.select();
        });
      }
    },
  );

  createEffect(
    () => ({ request: props.remoteDesktopRequest, botId: props.bot?.id }),
    ({ request, botId }) => {
      if (!request || request === lastHandledRemoteDesktopRequest) return;
      lastHandledRemoteDesktopRequest = request;
      setActiveRightPanel("desktop", botId);
    },
  );

  createEffect(
    () => props.agentPickerOpen,
    (open) => {
      if (!open) return;
      requestAnimationFrame(() => pickerInput?.focus());
    },
  );

  createEffect(
    () => ({
      botId: props.bot?.id,
      activeTab: activeBrowserTab(),
      screenOpen: screenOpen(),
      activeBrowserTabId: props.activeBrowserTabId,
      onActivateBrowserTab: props.onActivateBrowserTab,
    }),
    ({ activeTab, screenOpen, activeBrowserTabId, onActivateBrowserTab }) => {
      setBrowserAddress(activeTab?.url ?? "https://www.google.com");
      if (screenOpen && activeTab && activeTab.id !== activeBrowserTabId) {
        onActivateBrowserTab(activeTab.id);
      }
    },
  );

  createEffect(
    () =>
      new Set(
        props.browserControlState.sessions
          .map((session) => props.bots.find((bot) => bot.threadId === session.threadId)?.id)
          .filter((botId): botId is string => Boolean(botId)),
      ),
    (controlledBotIds) => {
      const newlyControlledBotIds = [...controlledBotIds].filter((botId) => !controlledBrowserBotIds.has(botId));
      controlledBrowserBotIds = controlledBotIds;
      if (newlyControlledBotIds.length === 0) return;
      setRightPanels((current) => {
        const next = { ...current };
        let changed = false;
        for (const botId of newlyControlledBotIds) {
          if (next[botId] === "browser") continue;
          next[botId] = "browser";
          changed = true;
        }
        return changed ? next : current;
      });
    },
  );

  createEffect(
    () => ({ botId: props.bot?.id, visible: screenOpen() && !props.globalOverlayOpen }),
    ({ botId, visible }) => {
      const generation = ++browserVisibilityGeneration;
      if (browserVisibilityFrame !== undefined) cancelAnimationFrame(browserVisibilityFrame);
      browserResizeObserver?.disconnect();
      browserResizeObserver = undefined;
      if (browserWindowResizeHandler) window.removeEventListener("resize", browserWindowResizeHandler);
      browserWindowResizeHandler = undefined;
      if (browserBoundsFrame !== undefined) cancelAnimationFrame(browserBoundsFrame);
      browserBoundsFrame = undefined;
      if (!visible) {
        void window.openbot.browser.setVisible({ visible: false });
        return;
      }
      browserVisibilityFrame = requestAnimationFrame(() => {
        browserVisibilityFrame = undefined;
        if (generation !== browserVisibilityGeneration || props.bot?.id !== botId || !screenOpen() || !browserSurface) {
          return;
        }
        const syncBounds = () => {
          if (
            generation !== browserVisibilityGeneration ||
            props.bot?.id !== botId ||
            !screenOpen() ||
            !browserSurface
          ) {
            return;
          }
          const bounds = browserSurface.getBoundingClientRect();
          void window.openbot.browser.setVisible({
            visible: true,
            bounds: {
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: bounds.height,
            },
          });
        };
        syncBounds();
        const scheduleBoundsSync = () => {
          if (browserBoundsFrame !== undefined) cancelAnimationFrame(browserBoundsFrame);
          browserBoundsFrame = requestAnimationFrame(() => {
            browserBoundsFrame = undefined;
            syncBounds();
          });
        };
        browserResizeObserver = new ResizeObserver(scheduleBoundsSync);
        browserResizeObserver.observe(browserSurface);
        browserWindowResizeHandler = scheduleBoundsSync;
        window.addEventListener("resize", browserWindowResizeHandler);
      });
    },
  );

  onCleanup(() => {
    browserVisibilityGeneration += 1;
    if (browserVisibilityFrame !== undefined) cancelAnimationFrame(browserVisibilityFrame);
    if (browserBoundsFrame !== undefined) cancelAnimationFrame(browserBoundsFrame);
    browserResizeObserver?.disconnect();
    if (browserWindowResizeHandler) window.removeEventListener("resize", browserWindowResizeHandler);
    if (typingIdleTimer) clearTimeout(typingIdleTimer);
    if (typingBotId) props.onTypingChange(typingBotId, false);
    void window.openbot.browser.setVisible({ visible: false });
  });

  function updateTeamTyping(text: string): void {
    const botId = props.bot?.id;
    if (typingIdleTimer) clearTimeout(typingIdleTimer);
    if (!botId || !text.trim()) {
      stopTeamTyping();
      return;
    }
    if (typingBotId && typingBotId !== botId) props.onTypingChange(typingBotId, false);
    typingBotId = botId;
    props.onTypingChange(botId, true);
    typingIdleTimer = setTimeout(stopTeamTyping, 3_000);
  }

  function stopTeamTyping(): void {
    if (typingIdleTimer) clearTimeout(typingIdleTimer);
    typingIdleTimer = undefined;
    if (!typingBotId) return;
    props.onTypingChange(typingBotId, false);
    typingBotId = null;
  }

  function addAttachments(selected: DraftAttachment[], botId = props.bot?.id) {
    if (!botId) return;
    const draft = drafts()[botId] ?? EMPTY_DRAFT;
    const available = Math.max(0, 10 - draft.attachments.length);
    const accepted = selected.slice(0, available);
    for (const attachment of selected.slice(available)) {
      void window.openbot.agent.discardDraftAttachment(attachment.id);
    }
    setDrafts((current) => ({
      ...current,
      [botId]: {
        ...(current[botId] ?? EMPTY_DRAFT),
        attachments: [...draft.attachments, ...accepted],
      },
    }));
    if (selected.length > accepted.length) setComposerError(t("You can attach at most 10 files."));
    setShowAttachments(false);
  }

  async function chooseAttachments() {
    if (attachmentBusy()) return;
    setShowAttachments(false);
    setAttachmentBusy(true);
    setComposerError(null);
    try {
      addAttachments(await window.openbot.agent.chooseAttachments());
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : String(error));
    } finally {
      setAttachmentBusy(false);
    }
  }

  function editQueuedMessage(delivery: QueueDelivery) {
    const botId = props.bot?.id;
    if (!botId || delivery.status !== "queued") return;
    setEditingDraftBackup({
      text: currentDraft().text,
      attachments: [...currentDraft().attachments],
      replyToMessageId: currentDraft().replyToMessageId,
    });
    setEditingDeliveryId(delivery.id);
    setDrafts((current) => ({
      ...current,
      [botId]: {
        text: delivery.text,
        attachments: [...delivery.attachments],
        replyToMessageId: delivery.replyToMessageId,
      },
    }));
    setShowAttachments(false);
    setComposerError(null);
  }

  function cancelQueuedMessageEdit() {
    const botId = props.bot?.id;
    const backup = editingDraftBackup();
    const backupAttachmentIds = new Set(backup?.attachments.map((attachment) => attachment.id));
    for (const attachment of currentDraft().attachments) {
      if (!backupAttachmentIds.has(attachment.id)) {
        void window.openbot.agent.discardDraftAttachment(attachment.id);
      }
    }
    if (botId) {
      setDrafts((current) => ({ ...current, [botId]: backup ?? EMPTY_DRAFT }));
    }
    setEditingDeliveryId(null);
    setEditingDraftBackup(null);
  }

  async function saveQueuedMessageEdit(): Promise<void> {
    const botId = props.bot?.id;
    const deliveryId = editingDeliveryId();
    const draft = currentDraft();
    if (!botId || !deliveryId || submitting()) return;
    const delivery = props.queue?.deliveries.find((item) => item.id === deliveryId);
    if (delivery?.status !== "queued") {
      setComposerError(t("This queued message is no longer available."));
      cancelQueuedMessageEdit();
      return;
    }
    const text = expandComposerMentions(draft.text);
    const originalAttachmentIds = new Set(delivery.attachments.map((attachment) => attachment.id));
    const keepAttachmentIds = draft.attachments
      .filter((attachment) => originalAttachmentIds.has(attachment.id))
      .map((attachment) => attachment.id);
    const attachmentDraftIds = draft.attachments
      .filter((attachment) => !originalAttachmentIds.has(attachment.id))
      .map((attachment) => attachment.id);
    if (!text.trim() && keepAttachmentIds.length === 0 && attachmentDraftIds.length === 0) return;

    stopTeamTyping();
    setSubmitting(true);
    setComposerError(null);
    const saved = await props.onUpdateQueuedMessage(deliveryId, text, keepAttachmentIds, attachmentDraftIds);
    setSubmitting(false);
    if (!saved) return;
    setDrafts((current) => ({ ...current, [botId]: EMPTY_DRAFT }));
    setEditingDeliveryId(null);
    setEditingDraftBackup(null);
  }

  async function submitMessage(override?: string) {
    if (selectionSending()) return;
    if (!override && editingDeliveryId()) {
      await saveQueuedMessageEdit();
      return;
    }
    const botId = props.bot?.id;
    const draft = currentDraft();
    const text = override ?? expandComposerMentions(draft.text);
    const attachments = override ? [] : draft.attachments;
    if (!botId || submitting() || onboardingModelRequired() || (!text.trim() && attachments.length === 0)) return;
    stopTeamTyping();
    stickToLatest = true;
    setSubmitting(true);
    setComposerError(null);
    const sent = await props.onSendMessage(
      text,
      attachments.map((item) => item.id),
      override ? null : draft.replyToMessageId,
    );
    setSubmitting(false);
    if (sent) {
      setDrafts((current) => ({ ...current, [botId]: EMPTY_DRAFT }));
      finishOnboarding(botId);
    }
  }

  async function sendSelectionInstruction(messageId: string, body: string): Promise<boolean> {
    if (!props.bot || submitting() || selectionSending() || !agentReady() || onboardingModelRequired()) {
      return false;
    }
    setSelectionSending(true);
    try {
      return await props.onSendMessage(body, [], messageId);
    } finally {
      setSelectionSending(false);
    }
  }

  async function markUnreadMessages(): Promise<void> {
    if (markingRead()) return;
    setMarkingRead(true);
    setComposerError(null);
    try {
      await props.onMarkRead();
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : t("Could not mark messages as read."));
    } finally {
      setMarkingRead(false);
    }
  }

  function jumpToUnreadMessages(): void {
    if (!scrollElement || !unreadMessagesDivider) return;
    const divider = unreadMessagesDivider;
    const firstUnreadMessage = divider.nextElementSibling instanceof HTMLElement ? divider.nextElementSibling : divider;
    stickToLatest = false;
    scrollToUnreadBoundary(scrollElement, firstUnreadMessage);
    void markUnreadMessages().then(() => {
      requestAnimationFrame(() => {
        if (!scrollElement) return;
        const settledBoundary = divider.isConnected ? divider : firstUnreadMessage;
        if (settledBoundary.isConnected) {
          scrollToUnreadBoundary(scrollElement, settledBoundary);
        }
      });
    });
  }

  function jumpToLatestMessage(): void {
    if (!scrollElement) return;
    stickToLatest = true;
    scrollToLatestMessage(scrollElement);
  }

  function replyToMessage(message: BotMessage) {
    updateCurrentDraft({ replyToMessageId: message.id });
    setOpenReactionMessageId(null);
    setOpenMoreMessageId(null);
  }

  async function reactToMessage(message: BotMessage, emoji: MessageReaction | null) {
    const botId = props.bot?.id;
    if (!botId) return;
    setOpenReactionMessageId(null);
    setExpandedEmojiMessageId(null);
    try {
      await window.openbot.agent.setMessageReaction({
        botId,
        messageId: message.id,
        emoji,
      });
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : String(error));
    }
  }

  async function copyMessage(message: BotMessage) {
    const attachmentNames = new Map((message.attachments ?? []).map((attachment) => [attachment.id, attachment.name]));
    const text = expandAttachmentReferences(message.body, (reference) => attachmentNames.get(reference.attachmentId));
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement("textarea");
        input.value = text;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.append(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }
      setCopiedMessageId(message.id);
      window.setTimeout(() => {
        if (copiedMessageId() === message.id) setCopiedMessageId(null);
      }, 1_400);
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : t("Could not copy the message."));
    }
  }

  function removeAttachment(id: string) {
    updateCurrentDraft({
      attachments: currentDraft().attachments.filter((attachment) => attachment.id !== id),
      text: removeAttachmentReferences(currentDraft().text, id),
    });
    void window.openbot.agent.discardDraftAttachment(id);
  }

  async function openBrowserAddress(address = browserAddress()) {
    const value = address.trim();
    if (!value) return;
    const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const tab = await window.openbot.browser.open({
        url,
        ownerThreadId: props.bot?.threadId ?? null,
        ownerBotId: props.bot?.id ?? null,
      });
      setBrowserAddress(tab.url);
      setActiveRightPanel("browser");
    } catch {
      setBrowserAddress(url);
    }
  }

  async function openMessageLink(url: string) {
    try {
      // "Open external links in" (App settings): the program's own browser panel, or the default browser (the default).
      const links = (await window.openbot.appSettings?.get().catch(() => null))?.behavior.externalLinks;
      if (links === "app") {
        await openBrowserAddress(url);
        return;
      }
      await window.openbot.openUrl(url);
    } catch {
      setComposerError(t("Could not open the link."));
    }
  }

  function showBrowserPanel() {
    setActiveRightPanel("browser");
    if (browserTabs().length === 0) void openBrowserAddress();
  }

  function activeActionCard() {
    const card = props.actionCard;
    return card?.kind === "draft-preview" || card?.kind === "browser-takeover" ? card : undefined;
  }

  let shownTakeoverId: string | undefined;
  createEffect(
    () => props.actionCard,
    (card) => {
      if (card?.kind !== "browser-takeover" || card.phase !== "taken-over") {
        shownTakeoverId = undefined;
        return;
      }
      if (shownTakeoverId === card.requestId) return;
      shownTakeoverId = card.requestId;
      props.onActivateBrowserTab(card.request.tabId);
      setActiveRightPanel("browser");
    },
  );

  async function respondActionDraft(input: import("@openbot/contracts/ipc").RespondToDraftPreviewInput) {
    const respond = window.openbot.agent.respondToDraftPreview;
    if (!respond) throw new Error(t("Draft actions are unavailable in this build."));
    await respond(input);
  }

  async function respondActionTakeover(input: import("@openbot/contracts/ipc").RespondToBrowserTakeoverInput) {
    const respond = window.openbot.agent.respondToBrowserTakeover;
    if (!respond) throw new Error(t("Browser takeover is unavailable in this build."));
    await respond(input);
    if (input.action === "take-over" && props.actionCard?.kind === "browser-takeover") {
      props.onActivateBrowserTab(props.actionCard.request.tabId);
      setActiveRightPanel("browser");
    }
  }

  function hideBrowserPanel() {
    setActiveRightPanel("none");
    void window.openbot.browser.setVisible({ visible: false });
  }

  async function closeBrowserTab(tabId: string) {
    const closesLastTab = browserTabs().length === 1 && browserTabs()[0]?.id === tabId;
    await props.onCloseBrowserTab(tabId);
    if (closesLastTab) hideBrowserPanel();
  }

  function setActiveRightPanel(mode: RightPanelMode, botId = props.bot?.id) {
    if (!botId) return;
    setRightPanels((current) => (current[botId] === mode ? current : { ...current, [botId]: mode }));
  }

  async function previewAttachment(attachment: AttachmentSummary) {
    if (!attachment.previewUrl || attachment.previewKind === "none") return;
    setMediaPreview({
      attachment,
      text: null,
      loading: attachment.previewKind === "text",
      error: null,
    });
    if (attachment.previewKind !== "text") return;
    try {
      const response = await fetch(attachment.previewUrl);
      if (!response.ok) throw new Error(t("Preview is unavailable."));
      const text = await response.text();
      setMediaPreview((current) =>
        current?.attachment.id === attachment.id
          ? { ...current, text: text.slice(0, 1_000_000), loading: false }
          : current,
      );
    } catch (error) {
      setMediaPreview((current) =>
        current?.attachment.id === attachment.id
          ? {
              ...current,
              loading: false,
              error: error instanceof Error ? error.message : String(error),
            }
          : current,
      );
    }
  }

  function attachmentAction(attachment: AttachmentSummary, action: "open" | "reveal" | "download") {
    void window.openbot.agent
      .openAttachment({ attachmentId: attachment.id, action })
      .catch((error) => setComposerError(error instanceof Error ? error.message : String(error)));
  }

  return (
    <main
      ref={(element) => (conversationPanel = element)}
      aria-label={t("Conversation")}
      onKeyDown={handleChatSearchShortcut}
      class={[
        "conversation-panel",
        {
          "conversation-drop-active": dropActive(),
          "browser-panel-active": screenOpen(),
          "remote-desktop-panel-active": remoteDesktopOpen(),
          "chat-side-panel-active": filesOpen() || voiceOpen() || settingsOpen(),
        },
      ]}
      style={`--settings-panel-width: ${settingsPanelWidth()}px; --browser-panel-width: ${browserPanelWidth()}px; --remote-desktop-panel-width: ${remoteDesktopPanelWidth()}px`}
      onDragEnter={(event) => {
        if (event.dataTransfer?.types.includes("Files")) setDropActive(true);
      }}
      onDragOver={(event) => {
        if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDropActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropActive(false);
      }}
    >
      <MessageSelectionActions
        contextKey={props.bot?.id}
        disabled={!props.bot || !agentReady() || onboardingModelRequired() || submitting()}
        onSend={sendSelectionInstruction}
      />
      <Show when={dropActive()}>
        <div class="attachment-drop-overlay">{t("Drop files to attach")}</div>
      </Show>
      <header class="window-drag conversation-header">
        <Show
          when={props.agentPickerOpen}
          fallback={
            <>
              <div class="conversation-heading-group">
                <Show when={props.bot}>
                  {(bot) => (
                    <Button
                      type="button"
                      class="conversation-title no-drag"
                      aria-label={t("View agent settings")}
                      onClick={() => {
                        setActiveRightPanel("settings");
                      }}
                    >
                      <AgentAvatar bot={bot()} mood={agentActivity() === "Working" ? "working" : "idle"} />
                      <h1>{bot().name}</h1>
                    </Button>
                  )}
                </Show>
                <Show when={props.bot}>{(bot) => <FallbackModelBadge bot={bot()} models={props.modelOptions} />}</Show>
              </div>
              <div class="conversation-header-actions no-drag">
                <Show when={props.bot}>
                  <ProviderModelPicker
                    value={settingsModel()}
                    modelOptions={props.modelOptions}
                    agentStatus={props.agentStatus}
                    disabled={!agentReady() || agentActivity() === "Working"}
                    disabledReason={
                      agentActivity() === "Working"
                        ? t("Wait for the current work to finish before changing models.")
                        : t("Models are available after an agent CLI connects.")
                    }
                    onChange={(model) => void selectAndConfirmModel(model)}
                  />
                </Show>
                <Show when={props.bot && reasoningOptions().length > 1}>
                  <ReasoningSelect
                    class="header-effort"
                    value={settingsReasoning()}
                    options={reasoningOptions()}
                    ariaLabel={t("Effort")}
                    disabled={!agentReady() || agentActivity() === "Working"}
                    onChange={changeReasoning}
                  />
                </Show>
                <Show when={props.bot && singleThread() ? props.bot : undefined}>
                  {(bot) => <NewThreadButton botId={bot().id} onChanged={props.onThreadsChanged} />}
                </Show>
                <Show when={props.bot}>
                  <ChatSidePanelLauncher variant="header" onOpen={openChatSidePanel} />
                </Show>
                <Show when={props.server?.kind === "remote"}>
                  <Button
                    type="button"
                    class="header-panel-toggle remote-desktop-button"
                    aria-label={remoteDesktopOpen() ? t("Hide remote desktop") : t("Open remote desktop")}
                    aria-expanded={remoteDesktopOpen() ? "true" : "false"}
                    onClick={() => setActiveRightPanel(remoteDesktopOpen() ? "none" : "desktop")}
                  >
                    <RemoteDesktopIcon />
                    <Show when={props.server?.state === "online"}>
                      <span class="remote-desktop-button-dot" aria-hidden="true" />
                    </Show>
                  </Button>
                </Show>
                <Button
                  type="button"
                  class={[
                    "header-panel-toggle computer-button",
                    {
                      "computer-button-agent-active": Boolean(activeBrowserControl()),
                    },
                  ]}
                  aria-label={
                    activeBrowserControl()
                      ? t("{name} is controlling the browser", {
                          name: browserControlBot()?.name ?? t("Agent"),
                        })
                      : screenOpen()
                        ? t("Hide computer")
                        : t("Open computer")
                  }
                  aria-expanded={screenOpen() ? "true" : "false"}
                  onClick={() => {
                    if (screenOpen()) hideBrowserPanel();
                    else showBrowserPanel();
                  }}
                >
                  <ComputerIcon />
                  <Show when={activeBrowserControl()}>
                    <span class="computer-control-dot" aria-hidden="true" />
                  </Show>
                </Button>
              </div>
            </>
          }
        >
          <AgentRecipientPicker
            bots={props.bots}
            open={props.agentPickerOpen}
            creating={props.creatingAgent}
            onCreate={props.onCreateAgent}
            onSelect={props.onSelectAgent}
            onClose={props.onCloseAgentPicker}
            inputRef={(element) => (pickerInput = element)}
          />
        </Show>
      </header>

      <Show when={threadActionError()}>
        <p role="alert">{threadActionError()}</p>
      </Show>
      <Show when={props.bot}>
        {(bot) => (
          <ThreadTabs botId={bot().id} onChanged={props.onThreadsChanged} onSingleThreadChange={setSingleThread} />
        )}
      </Show>
      <Show when={props.bot}>
        {(bot) => (
          <details class="chat-tools">
            <summary
              class="chat-tools-toggle"
              aria-label={t("Thread tools and context")}
              title={t("Thread tools and context")}
            >
              <SlidersHorizontal aria-hidden="true" />
            </summary>
            <div class="chat-tools-body">
              <ThreadPanel botId={bot().id} onChanged={props.onThreadsChanged} />
              <ContextIndicator botId={bot().id} threadId={bot().threadId} />
            </div>
          </details>
        )}
      </Show>
      <EyesBar sessions={props.eyes?.sessions ?? []} bots={props.bots} onStop={(input) => props.onStopEyes?.(input)} />

      <Show when={(props.accountNotices?.length ?? 0) > 0}>
        <section class="account-notices" aria-label={t("Account notices")}>
          <For each={props.accountNotices}>
            {(notice) =>
              notice.kind === "limit" ? (
                <AccountLimitReachedCard
                  view={notice.view}
                  nowMs={Date.now()}
                  onDismiss={() => props.onDismissAccountNotice?.(notice.id)}
                />
              ) : notice.kind === "error" ? (
                <AccountErrorCard view={notice.view} onDismiss={() => props.onDismissAccountNotice?.(notice.id)} />
              ) : (
                <AccountSwitchedCard view={notice.view} onDismiss={() => props.onDismissAccountNotice?.(notice.id)} />
              )
            }
          </For>
        </section>
      </Show>

      <Show when={chatSearchOpen()}>
        <ChatSearch
          query={chatSearchQuery()}
          current={activeChatSearchIndex()}
          total={chatSearchMatches().length}
          inputRef={(element) => (chatSearchInput = element)}
          onQueryChange={setChatSearchQuery}
          onPrevious={() => moveChatSearch(-1)}
          onNext={() => moveChatSearch(1)}
          onClose={closeChatSearch}
        />
      </Show>

      <Show when={props.unreadCount > 0 && !unreadDividerVisible()}>
        <UnreadMessagesBanner
          count={props.unreadCount}
          busy={markingRead()}
          onJumpToUnread={jumpToUnreadMessages}
          onMarkRead={() => void markUnreadMessages()}
        />
      </Show>

      <div
        class={[
          "conversation-scroll",
          {
            "scroll-fade-top": fadeAtTop(),
            "scroll-fade-bottom": fadeAtBottom(),
          },
        ]}
        ref={(element) => (scrollElement = element)}
        onScroll={(event) => {
          const element = event.currentTarget;
          stickToLatest = element.scrollHeight - element.scrollTop - element.clientHeight <= 80;
          updateScrollFade(element);
          updateUnreadDividerVisibility();
        }}
      >
        <Show when={showScrollToLatest()}>
          <ScrollToLatestButton onClick={jumpToLatestMessage} />
        </Show>
        <Show when={!props.agentPickerOpen && props.loaded}>
          <Show when={!agentReady()}>
            <section class="agent-setup-card" role="status">
              <div>
                <strong>
                  {props.agentStatus.phase === "starting" || props.agentStatus.phase === "restarting"
                    ? t("Connecting to agent CLIs…")
                    : t("Agent CLI setup required")}
                </strong>
                <p>
                  {props.agentStatus.message ??
                    t("Install and sign in to Codex CLI or Claude CLI, then restart COSGRAL Workspace.")}
                </p>
              </div>
              <Show when={props.agentStatus.phase !== "starting" && props.agentStatus.phase !== "restarting"}>
                <div class="agent-setup-actions">
                  <Show when={props.agentStatus.phase === "blocked" && window.openbot.agent.retryStart}>
                    {(retryStart) => (
                      <Button
                        type="button"
                        variant="primary"
                        loading={retryingStart()}
                        loadingLabel={t("Starting…")}
                        onClick={() => {
                          setRetryingStart(true);
                          void retryStart()()
                            .catch((error) => setComposerError(error instanceof Error ? error.message : String(error)))
                            .finally(() => setRetryingStart(false));
                        }}
                      >
                        {t("Try again")}
                      </Button>
                    )}
                  </Show>
                  <Button
                    type="button"
                    onClick={() =>
                      void props
                        .onOpenAgentSetup()
                        .catch((error) => setComposerError(error instanceof Error ? error.message : String(error)))
                    }
                  >
                    {t("Setup guide")}
                  </Button>
                </div>
              </Show>
            </section>
          </Show>
          <Show when={props.messages.length > 0}>
            <div class="time-marker">
              <span>{props.messages[0]?.time ?? t("now")}</span>
            </div>
          </Show>
          <Show when={agentReady() && onboardingActive() && !props.activeTurnId}>
            <article class="message-entry message-entry-animated message-entry-bot onboarding-message">
              <div class="bot-bubble">
                <p class="message-copy">{t("Choose a model to get started.")}</p>
              </div>
              <div class="onboarding-model-picker">
                <ProviderModelPicker
                  ariaLabel={t("Onboarding model")}
                  value={settingsModel()}
                  agentStatus={props.agentStatus}
                  modelOptions={props.modelOptions}
                  onChange={(model) => void selectAndConfirmModel(model)}
                />
              </div>
              <Show when={onboardingModelConfirmed()}>
                <div
                  class="onboarding-specialty-step message-entry-animated"
                  data-collapsed={props.messages.length > 0 ? "true" : undefined}
                >
                  <ChoiceCard
                    title={t("What do you want me helping with most?")}
                    hint={t("This becomes my ongoing specialty. You can change it later in Settings.")}
                    choices={ONBOARDING_CHOICE_KEYS.map((key) => t(key))}
                    customChoice={t("Something else")}
                    pending={submitting()}
                    onSubmit={async (answer) => {
                      if (submitting()) return false;
                      setSubmitting(true);
                      setComposerError(null);
                      const completed = await props.onCompleteOnboarding(answer, settingsModel(), settingsReasoning());
                      if (completed) {
                        const botId = props.bot?.id;
                        if (botId) finishOnboarding(botId);
                      }
                      setSubmitting(false);
                      return completed;
                    }}
                  />
                </div>
              </Show>
            </article>
          </Show>
          <Show when={props.bot?.id} keyed>
            {(botId) => <VoiceAutoRead botId={botId} messages={props.messages} />}
          </Show>
          <For each={props.messages}>
            {(message) => {
              const animateEntrance = untrack(() => message.animate === true && markMessageSeen(message.id));
              return (
                <>
                  <Show when={message.id === props.firstUnreadMessageId}>
                    <UnreadMessagesDivider
                      elementRef={(element) => {
                        unreadMessagesDivider = element;
                        scheduleUnreadDividerVisibilityUpdate();
                      }}
                    />
                  </Show>
                  <Show
                    when={message.exchange}
                    fallback={
                      <Show
                        when={message.kind === "thinking"}
                        fallback={
                          <article
                            data-chat-search-message={message.id}
                            class={[
                              "message-entry",
                              {
                                "message-entry-animated": animateEntrance,
                                "message-entry-user": message.author === "you",
                                "message-entry-bot": message.author === "bot",
                              },
                            ]}
                          >
                            <div class="message-shell">
                              <div
                                class={[
                                  message.author === "you" ? "user-bubble" : "bot-bubble",
                                  {
                                    "bot-bubble-streaming": message.streaming === true,
                                  },
                                ]}
                              >
                                <MessageBody
                                  message={message}
                                  referencedMessage={props.messages.find(
                                    (candidate) => candidate.id === message.replyToMessageId,
                                  )}
                                  bots={props.bots}
                                  onSelectAgent={props.onSelectAgent}
                                  onOpenLink={(url) => void openMessageLink(url)}
                                  onPreview={(attachment) => void previewAttachment(attachment)}
                                  onAttachmentAction={attachmentAction}
                                  onDownload={(attachment) => attachmentAction(attachment, "download")}
                                />
                              </div>
                              <Show when={message.author === "bot" && !message.streaming && message.body.trim()}>
                                <VoicePlayback
                                  messageId={message.id}
                                  text={message.body}
                                  enabled={voicePlaybackEnabled()}
                                />
                              </Show>
                              <MessageActions
                                message={message}
                                history={
                                  props.bot && window.openbot.messageActions
                                    ? {
                                        botId: props.bot.id,
                                        threadId: props.bot.threadId,
                                        turnRunning: Boolean(props.activeTurnId),
                                        busyMessages:
                                          props.queue?.deliveries.filter(
                                            (delivery) =>
                                              (!delivery.threadId || delivery.threadId === props.bot?.threadId) &&
                                              (delivery.status === "queued" ||
                                                delivery.status === "starting" ||
                                                delivery.status === "running"),
                                          ).length ?? 0,
                                        laterMessages:
                                          message.laterMessageCount ??
                                          props.messages.length -
                                            props.messages.findIndex((item) => item.id === message.id) -
                                            1,
                                      }
                                    : undefined
                                }
                                pickerOpen={openReactionMessageId() === message.id}
                                moreOpen={openMoreMessageId() === message.id}
                                expandedEmoji={expandedEmojiMessageId() === message.id}
                                copied={copiedMessageId() === message.id}
                                onTogglePicker={() => {
                                  setOpenReactionMessageId((current) => (current === message.id ? null : message.id));
                                  setOpenMoreMessageId(null);
                                  setExpandedEmojiMessageId(null);
                                }}
                                onToggleMore={() => {
                                  setOpenMoreMessageId((current) => (current === message.id ? null : message.id));
                                  setOpenReactionMessageId(null);
                                  setExpandedEmojiMessageId(null);
                                }}
                                onExpandEmoji={() =>
                                  setExpandedEmojiMessageId((current) => (current === message.id ? null : message.id))
                                }
                                onReact={(emoji) => void reactToMessage(message, emoji)}
                                onReply={() => replyToMessage(message)}
                                onCopy={() => void copyMessage(message)}
                                onBranch={
                                  window.openbot.threads && props.bot?.threadId
                                    ? () => {
                                        const bot = props.bot;
                                        const api = window.openbot.threads;
                                        if (!bot?.threadId || !api) return;
                                        void api
                                          .branch({ botId: bot.id, threadId: bot.threadId, fromMessageId: message.id })
                                          .then((list) => {
                                            setThreadActionError("");
                                            props.onThreadsChanged?.(list);
                                          })
                                          .catch((error) =>
                                            setThreadActionError(providerError(error, "Could not branch the thread.")),
                                          );
                                      }
                                    : undefined
                                }
                              />
                            </div>
                            <Show
                              when={
                                message.pinned || message.edited || (message.regeneration && message.author === "bot")
                              }
                            >
                              <div class="thread-work-message-marks">
                                <Show when={message.pinned}>
                                  <Text tone="secondary">{t("Pinned")}</Text>
                                </Show>
                                <Show when={message.edited}>
                                  <Text tone="secondary">{t("Edited")}</Text>
                                </Show>
                                <Show when={message.regeneration && message.author === "bot"}>
                                  <Text tone="secondary">{t("Regenerated answer")}</Text>
                                </Show>
                              </div>
                            </Show>
                            <Show when={message.reaction}>
                              {(reaction) => (
                                <Button
                                  type="button"
                                  class="message-reaction-pill"
                                  aria-label={t("Remove reaction {emoji}", { emoji: reaction() })}
                                  onClick={() => void reactToMessage(message, null)}
                                >
                                  {reaction()}
                                </Button>
                              )}
                            </Show>
                          </article>
                        }
                      >
                        <div
                          data-chat-search-message={message.id}
                          class={{ "thinking-entry-animated": animateEntrance }}
                        >
                          <ThinkingDisclosure message={message} />
                        </div>
                      </Show>
                    }
                  >
                    {(exchange) => (
                      <article
                        data-chat-search-message={message.id}
                        class={["exchange-message-entry", { "exchange-message-entry-animated": animateEntrance }]}
                      >
                        <ExchangeSystemRow message={message} bots={props.bots} onSelectAgent={props.onSelectAgent} />
                        <Show when={exchange().direction === "incoming" && (message.attachments?.length ?? 0) > 0}>
                          <div class="exchange-agent-attachments">
                            <AttachmentCards
                              attachments={message.attachments ?? []}
                              onPreview={(attachment) => void previewAttachment(attachment)}
                              onAction={attachmentAction}
                            />
                          </div>
                        </Show>
                      </article>
                    )}
                  </Show>
                </>
              );
            }}
          </For>
          <Show when={props.bot}>
            {(bot) => (
              <PlanPanel
                botId={bot().id}
                threadId={bot().threadId}
                activeRequestId={props.actionCard?.kind === "plan" ? props.actionCard.requestId : undefined}
              />
            )}
          </Show>
          <Show when={activeActionCard()}>
            {(card) => <ActionCard card={card()} onDraft={respondActionDraft} onTakeover={respondActionTakeover} />}
          </Show>
          <Show when={props.actionCard?.kind === "vault-request" ? props.actionCard.request : undefined} keyed>
            {(request) => <VaultRequestCard request={request} />}
          </Show>
          <AgentActivityIndicator bot={props.bot} state={visibleAgentActivity()} />
        </Show>
      </div>

      <StickyDecision
        prompt={props.prompt}
        approval={props.approval}
        onAnswerPrompt={props.onAnswerPrompt}
        onRespondToApproval={props.onRespondToApproval}
      />
      <Show when={props.actionCard?.kind === "plan" ? props.actionCard.plan : undefined}>
        {(plan) => (
          <section class="sticky-decision" aria-label={t("Decision")}>
            <PlanCard plan={plan()} />
          </section>
        )}
      </Show>
      <Show when={props.actionCard?.kind === "vault-request" ? props.actionCard.request : undefined} keyed>
        {(request) => (
          <section class="sticky-decision" aria-label={t("Decision")}>
            <div class="sticky-decision-kicker">{t("Decision · pinned")}</div>
            <VaultRequestCard request={request} />
          </section>
        )}
      </Show>
      <Show when={activeActionCard()}>
        {(card) => (
          <section class="sticky-decision" aria-label={t("Decision")}>
            <div class="sticky-decision-kicker">{t("Decision · pinned")}</div>
            <ActionCard card={card()} onDraft={respondActionDraft} onTakeover={respondActionTakeover} />
          </section>
        )}
      </Show>

      <Show when={!props.prompt && !props.approval}>
        <div class="composer-wrap">
          <details
            ref={(element) => (libraryDetails = element)}
            onToggle={(event) => {
              if (event.currentTarget.open) libraryOwner = props.bot?.id;
              setLibraryOpen(event.currentTarget.open);
            }}
          >
            {/* Opened from the + menu ("Choose from library"); no separate link above the composer. */}
            <summary class="sr-only">{t("Choose from library")}</summary>
            <Show when={libraryOpen()}>
              <LibraryPanel
                onAttach={(draft) => {
                  if (!libraryOwner) {
                    void window.openbot.agent.discardDraftAttachment(draft.id);
                    return;
                  }
                  addAttachments([draft], libraryOwner);
                  if (libraryDetails) libraryDetails.open = false;
                  setLibraryOpen(false);
                }}
              />
            </Show>
          </details>
          <For each={unreferencedDraftAttachments()}>
            {(attachment) => (
              <div class="composer-attachment">
                <span class={attachment.kind === "file" ? "file-type-badge" : "attachment-thumb"}>
                  <Show when={attachment.kind === "image"} fallback={fileBadge(attachment)}>
                    <img src={attachment.previewUrl ?? ""} alt="" />
                  </Show>
                </span>
                <span>
                  <strong>{attachment.name}</strong>
                  <small>{formatFileSize(attachment.size)}</small>
                </span>
                <Button
                  type="button"
                  aria-label={`Remove ${attachment.name}`}
                  onClick={() => removeAttachment(attachment.id)}
                >
                  <CloseIcon />
                </Button>
              </div>
            )}
          </For>
          <Show when={replyTarget()}>
            {(message) => (
              <div class="composer-reply-preview">
                <div>
                  <span>{message().author === "you" ? t("Replying to your message") : t("Replying to Agent")}</span>
                  <p>{message().body || t("Attachment")}</p>
                </div>
                <Button
                  type="button"
                  aria-label={t("Cancel reply")}
                  onClick={() => updateCurrentDraft({ replyToMessageId: null })}
                >
                  <CloseIcon />
                </Button>
              </div>
            )}
          </Show>
          <Show when={composerError()}>
            <div class="composer-error" role="alert">
              {composerError()}
            </div>
          </Show>
          <Show when={agentReady() && imageGenerationUnavailable()}>
            <aside class="image-generation-capability-note" role="note">
              <strong>{t("Image generation is currently available with Codex.")}</strong>
              <span>{t("Switch this agent to a Codex model in Settings to generate images.")}</span>
            </aside>
          </Show>
          <QueueHoldNotice queue={props.queue} onOpenBudget={props.onOpenBudget} />
          <Show when={queueBarVisible()}>
            <QueuePanel
              deliveries={props.queue?.deliveries ?? []}
              paused={Boolean(props.queue?.paused)}
              canSteer={Boolean(props.activeTurnId) && props.queue?.steer?.available !== false}
              steerReason={props.queue?.steer?.reason ?? null}
              onSteer={props.onSteerQueuedMessage}
              onCancel={props.onCancelQueuedMessage}
              onEdit={editQueuedMessage}
              onReorder={props.onReorderQueue}
              onResume={props.onResumeQueue}
            />
          </Show>
          <Show when={editingDeliveryId()}>
            {(deliveryId) => {
              const delivery = () => props.queue?.deliveries.find((item) => item.id === deliveryId());
              return (
                <div class="composer-queue-edit-preview">
                  <div>
                    <span>{t("Editing queued message")}</span>
                    <p>{delivery()?.text || t("Attachment")}</p>
                  </div>
                  <Button type="button" aria-label={t("Cancel queued message edit")} onClick={cancelQueuedMessageEdit}>
                    <CloseIcon />
                  </Button>
                </div>
              );
            }}
          </Show>
          <Show when={sideQuestionOpen() ? props.bot : undefined} keyed>
            {(bot) => <SideQuestionPanel botId={bot.id} onClose={() => setSideQuestionOpen(false)} />}
          </Show>
          <div class="composer">
            <Show when={props.bot?.id} keyed>
              {(botId) => (
                <VoiceRecorder
                  onTranscript={(text) =>
                    setDrafts((current) => {
                      const draft = current[botId] ?? EMPTY_DRAFT;
                      return { ...current, [botId]: { ...draft, text: [draft.text, text].filter(Boolean).join(" ") } };
                    })
                  }
                />
              )}
            </Show>
            <Popover.Root
              open={showAttachments()}
              placement="top-start"
              gutter={4}
              onOpenChange={(open) => {
                setShowAttachments(open);
                if (!open) setAttachMenuView("main");
              }}
            >
              <Popover.Trigger
                as={Button}
                type="button"
                class="composer-button"
                aria-label={t("Attach a file")}
                disabled={props.agentPickerOpen || attachmentBusy() || !agentReady() || onboardingModelRequired()}
              >
                <PlusIcon />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content class="attachment-menu">
                  <Popover.Title class="sr-only">{t("Attach file")}</Popover.Title>
                  <Show
                    when={attachMenuView() === "main"}
                    fallback={
                      <Show when={props.bot?.id} keyed>
                        {(botId) => (
                          <SkillQuickPick
                            botId={botId}
                            onPick={(command) => {
                              const draft = currentDraft();
                              updateCurrentDraft({
                                text: `${draft.text}${draft.text && !draft.text.endsWith(" ") ? " " : ""}/${command.name} `,
                              });
                              setAttachMenuView("main");
                              setShowAttachments(false);
                            }}
                          />
                        )}
                      </Show>
                    }
                  >
                    <Button type="button" disabled={attachmentBusy()} onClick={() => void chooseAttachments()}>
                      <Paperclip aria-hidden="true" />
                      {attachmentBusy() ? t("Importing…") : t("Attach files")}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        setShowAttachments(false);
                        if (!libraryDetails) return;
                        libraryOwner = props.bot?.id;
                        libraryDetails.open = true;
                        setLibraryOpen(true);
                      }}
                    >
                      <LibraryBig aria-hidden="true" />
                      {t("Choose from library")}
                    </Button>
                    <Button type="button" onClick={() => setAttachMenuView("skills")}>
                      <Sparkles aria-hidden="true" />
                      {t("Use a skill")}
                    </Button>
                    <Button
                      type="button"
                      disabled
                      title={t("Teach a task needs browser teach — not in this build yet.")}
                      aria-label={t("Teach a task")}
                    >
                      <Crosshair aria-hidden="true" />
                      {t("Teach a task")}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        setShowAttachments(false);
                        setSideQuestionOpen(true);
                      }}
                    >
                      <MessageCircleQuestion aria-hidden="true" />
                      {t("Side question")}
                    </Button>
                    <Button
                      type="button"
                      disabled
                      title={t("Voice side panel needs engine support — not in this build yet.")}
                      aria-label={t("Voice")}
                    >
                      <AudioLines aria-hidden="true" />
                      {t("Voice")}
                    </Button>
                  </Show>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            <div class="composer-input-label">
              <ComposerEditor
                botId={props.bot?.id}
                bots={props.bots}
                attachments={currentDraft().attachments}
                value={currentDraft().text}
                disabled={
                  props.agentPickerOpen ||
                  submitting() ||
                  selectionSending() ||
                  !agentReady() ||
                  onboardingModelRequired()
                }
                placeholder={
                  !agentReady()
                    ? t("Complete agent CLI setup to start")
                    : onboardingModelRequired()
                      ? t("Choose a model to continue")
                      : replyTarget()
                        ? t("Reply…")
                        : t("Message {name}", {
                            name: props.agentPickerOpen ? t("agent") : (props.bot?.name ?? t("agent")),
                          })
                }
                ariaLabel={t("Message {name}", {
                  name: props.agentPickerOpen ? t("agent") : (props.bot?.name ?? t("agent")),
                })}
                onValueChange={(text) => {
                  updateCurrentDraft({ text });
                  updateTeamTyping(text);
                }}
                onSubmit={() => void submitMessage()}
                onOpenAttachment={(attachment) =>
                  attachment.previewKind === "none"
                    ? attachmentAction(attachment, "open")
                    : void previewAttachment(attachment)
                }
              />
            </div>
            <Show
              when={props.activeTurnId && !editingDeliveryId()}
              fallback={
                <Button
                  type="button"
                  class="voice-button"
                  aria-label={editingDeliveryId() ? t("Save queued message") : t("Send message")}
                  disabled={submitting() || selectionSending() || !agentReady() || onboardingModelRequired()}
                  onClick={() => void submitMessage()}
                >
                  {submitting() ? "…" : "↑"}
                </Button>
              }
            >
              <Button
                type="button"
                class="voice-button voice-button-active"
                aria-label={t("Stop agent")}
                onClick={props.onStop}
              >
                <StopIcon />
              </Button>
            </Show>
          </div>
        </div>
      </Show>

      <Dialog.Root open={Boolean(mediaPreview())} onOpenChange={(open) => !open && setMediaPreview(null)}>
        <Show when={mediaPreview()}>
          {(preview) => (
            <Dialog.Portal>
              <Dialog.Overlay class="media-backdrop">
                <Dialog.Content as="section" class="media-modal">
                  <Dialog.Title class="sr-only">{preview().attachment.name}</Dialog.Title>
                  <Button
                    type="button"
                    class="media-close"
                    aria-label={t("Close media preview")}
                    onClick={() => setMediaPreview(null)}
                  >
                    <CloseIcon />
                  </Button>
                  <Show when={preview().attachment.previewKind === "image"}>
                    <img
                      class="media-image"
                      src={preview().attachment.previewUrl ?? ""}
                      alt={preview().attachment.name}
                    />
                  </Show>
                  <Show when={preview().attachment.previewKind === "pdf"}>
                    <iframe
                      class="media-document"
                      title={preview().attachment.name}
                      src={preview().attachment.previewUrl ?? ""}
                    />
                  </Show>
                  <Show when={preview().attachment.previewKind === "text"}>
                    <Show when={!preview().loading} fallback={<CosgralLoadingSkeleton label={t("Loading…")} />}>
                      <pre class="media-text">{preview().error ?? preview().text}</pre>
                    </Show>
                  </Show>
                  <div class="media-caption">
                    <span>{preview().attachment.name}</span>
                    <Button type="button" onClick={() => attachmentAction(preview().attachment, "open")}>
                      {t("Open")}
                    </Button>
                    <Button type="button" onClick={() => attachmentAction(preview().attachment, "download")}>
                      {t("Download")}
                    </Button>
                    <Button type="button" onClick={() => attachmentAction(preview().attachment, "reveal")}>
                      {navigator.userAgent.includes("Windows") ? t("Show in Explorer") : t("Show in Finder")}
                    </Button>
                  </div>
                </Dialog.Content>
              </Dialog.Overlay>
            </Dialog.Portal>
          )}
        </Show>
      </Dialog.Root>

      <Show when={screenOpen()}>
        <BrowserPanel
          tabs={browserTabs()}
          activeTabId={activeBrowserTab()?.id}
          controlled={Boolean(activeBrowserControl())}
          controlForTab={browserControlForTab}
          controllerNameForTab={(tab) => browserControllerForTab(tab)?.name}
          address={browserAddress()}
          width={browserPanelWidth()}
          availableWidth={() => conversationPanel?.clientWidth || window.innerWidth}
          onActivateTab={props.onActivateBrowserTab}
          onCloseTab={(tabId) => void closeBrowserTab(tabId)}
          onNewTab={() => {
            setBrowserAddress("https://www.google.com");
            void openBrowserAddress("https://www.google.com");
          }}
          onReload={() => void openBrowserAddress()}
          onAddressInput={setBrowserAddress}
          onAddressSubmit={() => void openBrowserAddress()}
          onResize={setBrowserPanelWidth}
          onResizeEnd={(value) => savePanelWidth(BROWSER_PANEL_STORAGE_KEY, value)}
          onOpenSidePanel={openChatSidePanel}
          surfaceRef={(element) => (browserSurface = element)}
        />
      </Show>

      <Show when={remoteDesktopOpen()}>
        <RemoteMacPanel
          server={props.server}
          session={props.remoteMacSession}
          width={remoteDesktopPanelWidth()}
          maxWidth={() => conversationPanel?.clientWidth || window.innerWidth}
          onResize={setRemoteDesktopPanelWidth}
          onResizeEnd={(value) => savePanelWidth(REMOTE_DESKTOP_PANEL_STORAGE_KEY, value)}
          onClose={() => setActiveRightPanel("none")}
          onConnect={props.onConnectRemoteMac}
          onDisconnect={props.onDisconnectRemoteMac}
        />
      </Show>

      <Show when={filesOpen() && props.bot}>
        <aside id="files-side-panel" class="chat-files-panel" aria-label={t("Files")}>
          <SidePanelResizer
            controls="files-side-panel"
            width={settingsPanelWidth()}
            sizes={SETTINGS_PANEL_SIZES}
            availableWidth={() => conversationPanel?.clientWidth || window.innerWidth}
            onResize={setSettingsPanelWidth}
            onResizeEnd={(value) => savePanelWidth(SETTINGS_PANEL_STORAGE_KEY, value)}
          />
          <ChatRightPanelTabs active="files" onSelect={openChatSidePanel} />
          <div class="chat-files-panel-body">
            <Show when={props.bot?.id} keyed>
              {(botId) => (
                <AgentCardDetail
                  botId={botId}
                  card="files"
                  title={t("Files")}
                  onClose={() => setActiveRightPanel("none")}
                />
              )}
            </Show>
          </div>
        </aside>
      </Show>

      <Show when={voiceOpen() && props.bot}>
        <aside id="voice-side-panel" class="chat-voice-panel" aria-label={t("Voice")}>
          <SidePanelResizer
            controls="voice-side-panel"
            width={settingsPanelWidth()}
            sizes={SETTINGS_PANEL_SIZES}
            availableWidth={() => conversationPanel?.clientWidth || window.innerWidth}
            onResize={setSettingsPanelWidth}
            onResizeEnd={(value) => savePanelWidth(SETTINGS_PANEL_STORAGE_KEY, value)}
          />
          <ChatRightPanelTabs active="voice" onSelect={openChatSidePanel} />
          <div class="chat-voice-panel-body">
            <p class="chat-voice-panel-note">
              {t("Record a short voice note for this agent. Full voice models stay in Settings → Voice.")}
            </p>
            <Show when={props.bot?.id} keyed>
              {(botId) => (
                <VoiceRecorder
                  onTranscript={(text) =>
                    setDrafts((current) => {
                      const draft = current[botId] ?? EMPTY_DRAFT;
                      return { ...current, [botId]: { ...draft, text: [draft.text, text].filter(Boolean).join(" ") } };
                    })
                  }
                />
              )}
            </Show>
          </div>
        </aside>
      </Show>

      <Show when={settingsOpen() && props.bot}>
        <aside id="settings-side-panel" class="agent-settings-panel" aria-label={t("Agent settings")}>
          <SidePanelResizer
            controls="settings-side-panel"
            width={settingsPanelWidth()}
            sizes={SETTINGS_PANEL_SIZES}
            availableWidth={() => conversationPanel?.clientWidth || window.innerWidth}
            onResize={setSettingsPanelWidth}
            onResizeEnd={(value) => savePanelWidth(SETTINGS_PANEL_STORAGE_KEY, value)}
          />
          <ChatRightPanelTabs active="settings" onSelect={openChatSidePanel} />
          <header class="agent-settings-header">
            <Button
              type="button"
              class="agent-settings-nav-button"
              aria-label={t("Back to details")}
              onClick={() => setActiveRightPanel("none")}
            >
              <BackIcon />
            </Button>
            <h2>{t("Agent settings")}</h2>
            <Button
              type="button"
              class="agent-settings-nav-button"
              aria-label={t("Close details")}
              onClick={() => setActiveRightPanel("none")}
            >
              <SettingsForwardIcon />
            </Button>
          </header>
          <div class="agent-settings-content">
            <AvatarEditor
              open={avatarPickerOpen()}
              onOpenChange={(open) => {
                if (open) {
                  setAvatarCandidateSeed(avatarSeed());
                  setAvatarBatch(0);
                }
                setAvatarPickerOpen(open);
              }}
              rootRef={(element) => (avatarPickerRoot = element)}
              fileInputRef={(element) => (avatarFileInput = element)}
              botId={props.bot?.id}
              seed={avatarSeed()}
              hue={avatarHue()}
              url={avatarUrl()}
              uploadBusy={avatarUploadBusy()}
              candidates={avatarCandidates()}
              onUploadFile={(file) => void uploadAgentAvatar(file)}
              onPickImage={() => avatarFileInput?.click()}
              onRemoveImage={() => void setCustomAvatar(null)}
              onResetToId={() => {
                const botId = props.bot?.id;
                if (!botId) return;
                setAvatarCandidateSeed(botId);
                setAvatarBatch(0);
                void selectGeneratedAvatar(botId);
              }}
              onNewSet={() => {
                setAvatarCandidateSeed(avatarSeed());
                setAvatarBatch((batch) => batch + 1);
              }}
              onSelectFace={(seed) => void selectGeneratedAvatar(seed)}
              onSelectHue={(hue) => {
                setAvatarHue(hue);
                void saveBotPatch({ avatarHue: hue });
              }}
            />
            <label class="agent-settings-field">
              <span>{t("Name")}</span>
              <Input
                ref={(element) => (settingsNameInput = element)}
                defaultValue={settingsName()}
                aria-label={t("Agent name")}
                maxlength={INPUT_LIMITS.agentName}
                onInput={(event) => {
                  setSettingsName(event.currentTarget.value);
                  settingsNameDirty = true;
                }}
                onBlur={saveSettingsName}
              />
            </label>
            <label class="agent-settings-field">
              <span>{t("Title")}</span>
              <Input
                ref={(element) => (settingsTitleInput = element)}
                defaultValue={settingsTitle()}
                aria-label={t("Agent title")}
                placeholder={t("Describe what your agent does")}
                maxlength={INPUT_LIMITS.agentTitle}
                onInput={(event) => {
                  setSettingsTitle(event.currentTarget.value);
                  settingsTitleDirty = true;
                }}
                onBlur={saveSettingsTitle}
              />
            </label>
            <label class="agent-settings-field agent-settings-description">
              <span>{t("Description")}</span>
              <Textarea
                ref={(element) => (settingsDescriptionInput = element)}
                rows="4"
                defaultValue={settingsDescription()}
                aria-label={t("Agent description")}
                placeholder={t("What this agent is for")}
                maxlength={INPUT_LIMITS.agentDescription}
                onInput={(event) => {
                  setSettingsDescription(event.currentTarget.value);
                  settingsDescriptionDirty = true;
                }}
                onBlur={saveSettingsDescription}
              />
            </label>
            <section class="agent-settings-model" aria-labelledby="agent-model-heading">
              <div class="agent-settings-section-heading">
                <strong id="agent-model-heading">{t("Runtime")}</strong>
                <span>{t("Choose how this agent runs")}</span>
              </div>
              <div class="agent-settings-model-controls">
                <div class="agent-settings-model-option">
                  <ProviderModelPicker
                    variant="field"
                    ariaLabel={t("Agent model")}
                    value={settingsModel()}
                    agentStatus={props.agentStatus}
                    modelOptions={props.modelOptions}
                    disabled={!agentReady() || agentActivity() === "Working"}
                    disabledReason={
                      agentActivity() === "Working"
                        ? t("Wait for the current work to finish before changing models.")
                        : t("Models are available after an agent CLI connects.")
                    }
                    onChange={(model) => void selectAndConfirmModel(model)}
                  />
                  <Show when={selectedModel()} keyed>
                    {(model) => <p class="agent-settings-model-description">{tData(model.description)}</p>}
                  </Show>
                </div>
                <label for="agent-settings-reasoning" class="agent-settings-model-row agent-settings-thinking-row">
                  <span>{t("Reasoning")}</span>
                  <ReasoningSelect
                    id="agent-settings-reasoning"
                    value={settingsReasoning()}
                    options={reasoningOptions()}
                    ariaLabel={t("Agent reasoning level")}
                    onChange={changeReasoning}
                  />
                </label>
              </div>
            </section>
            <Show when={settingsSaveError()}>
              {(message) => (
                <p class="agent-settings-save-error" role="alert">
                  {message()}
                </p>
              )}
            </Show>
            <Show when={props.bot?.id} keyed>
              {(botId) => (
                <>
                  <AgentCardsSection botId={botId} />
                  <AgentSettingsW3 botId={botId} />
                  <ApprovalRulesSettings botId={botId} />
                  <McpSettings botId={botId} />
                  <RoutinePanel botId={botId} bots={props.bots} />
                </>
              )}
            </Show>
            <div class="agent-settings-notifications">
              <div>
                <strong>{t("Notifications")}</strong>
                <span>{t("Get notified when this agent finishes or needs input")}</span>
              </div>
              <Switch
                size="sm"
                aria-label={t("Notifications")}
                checked={settingsNotifications()}
                onChange={(next) => {
                  setSettingsNotifications(next);
                  saveBotPatch({ notifications: next });
                }}
              />
            </div>
          </div>
        </aside>
      </Show>
    </main>
  );
}
