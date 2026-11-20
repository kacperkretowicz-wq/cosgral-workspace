import type {
  AccountUsage,
  AgentActivity,
  AgentModelOption,
  AgentStatus,
  AppInfo,
  AvatarImageInput,
  CentralAuthUser,
  DirectThreadSummary,
  ExternalDestination,
  SidebarLayout,
  TeamPresenceMember,
  ThreadList,
  UpdateStatus,
  WorkspaceChannel,
} from "@openbot/contracts/ipc";
import type { BotProfile } from "../../data";
import type { SidebarAgentState } from "../../row-activity";
import type { SidebarFolderActions } from "../SidebarFolders";

/** What the sidebar needs from the app shell. */

export interface NeedsYouSidebarItem {
  threadId?: string;
  threadTitle?: string;
  botId: string;
  botName: string;
  kind: "question" | "approval" | "takeover" | "vault" | "plan";
  summary: string;
}

export interface SidebarProps {
  serverName: string;
  bots: BotProfile[];
  activeBotId: string;
  people: TeamPresenceMember[];
  directThreads: DirectThreadSummary[];
  activeDirectMemberId: string | null;
  account: CentralAuthUser;
  appInfo: AppInfo | null;
  agentStatus: AgentStatus;
  accountUsage: AccountUsage | null;
  updateStatus: UpdateStatus;
  agentStates: Record<string, SidebarAgentState>;
  needsYouItems?: NeedsYouSidebarItem[];
  threadLists?: Record<string, ThreadList>;
  activities?: Record<string, AgentActivity>;
  /** COSGRAL: agents that are looking at a window, screen or camera right now. */
  lookingBotIds?: string[];
  computerUsingBotIds?: string[];
  onStopComputerUse?: (botId: string) => void;
  /** COSGRAL: local owner profile: no account service, so no email and no sign out. */
  localProfile?: boolean;
  /** COSGRAL W1: user folders. Without a layout the agent list stays flat. */
  layout?: SidebarLayout;
  /** COSGRAL W1: folder changes. Without them the folders can be read but not changed. */
  folderActions?: SidebarFolderActions;
  onSelectBot: (botId: string) => void;
  onSetBotHidden?: (botId: string, hidden: boolean) => Promise<void>;
  onDuplicateBot?: (botId: string) => Promise<void>;
  copyNotice?: string;
  onDismissCopyNotice?: () => void;
  modelOptions?: AgentModelOption[];
  onMarkBotRead?: (botId: string) => Promise<void>;
  onSelectChannels?: (create?: boolean) => void;
  /** Channels shown on the list (archived ones are left out); a row opens its channel. */
  channels?: ReadonlyArray<WorkspaceChannel>;
  activeChannelId?: string | null;
  onOpenChannel?: (channelId: string) => void;
  onSelectNeedsYou?: (botId: string, threadId?: string) => void;
  onSelectPerson: (memberId: string) => void;
  onCreateBot: () => void;
  onEditBot: (botId: string, focus?: "name") => void;
  /** Inline rename on the sidebar row (UI-AF); settings Rename path stays via onEditBot(..., "name") if needed. */
  onRenameBot?: (botId: string, name: string) => Promise<void>;
  onDeleteBot: (botId: string) => Promise<void>;
  onRefreshUsage: () => Promise<AccountUsage>;
  onUpdateAction: () => Promise<void>;
  onUpdateAccountAvatar: (image: AvatarImageInput | null) => Promise<void>;
  onLogout: () => Promise<void>;
  onOpenExternal: (destination: ExternalDestination) => Promise<void>;
  onOpenPermissions: () => void;
  compact: boolean;
  onCollapse: () => void;
  onExpand: () => void;
}
