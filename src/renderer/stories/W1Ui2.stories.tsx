import type {
  AgentActivity,
  AgentApproval,
  CentralAuthUser,
  PendingAgentRequest,
  SidebarFolder,
  SidebarLayout,
} from "@openbot/contracts/ipc";
import { createSignal, onCleanup } from "solid-js";
import { expect, fn } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { App } from "../src/App";
import { Sidebar, type SidebarAgentState } from "../src/components/Sidebar";
import type { SidebarFolderActions } from "../src/components/SidebarFolders";
import { rowStateFor } from "../src/row-activity";
import { STORY_AGENT_STATUS, STORY_APP_INFO, STORY_BOTS, STORY_UPDATE_STATUS, STORY_USAGE } from "./fixtures";
import { createMockOpenBot, type MockOpenBotOptions } from "./mock-openbot";
import { createMockSidebar } from "./mock-sidebar";
import { type StoryTheme, ThemeFrame } from "./theme-frame";

// COSGRAL W1-UI2: durable Needs you / Decision, agent row activity states, sidebar folders.
// Every scene has a dark and a light story. Light only previews contrast; the app ships one theme.

const account: CentralAuthUser = { id: "user-1", email: "person@example.com", name: "Owner", avatarUrl: null };
const AT = "2026-11-12T10:00:00.000Z";

function sidebarProps(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}): Parameters<typeof Sidebar>[0] {
  return {
    serverName: "Local",
    bots: STORY_BOTS,
    activeBotId: "chief",
    people: [],
    directThreads: [],
    activeDirectMemberId: null,
    account,
    appInfo: STORY_APP_INFO,
    agentStatus: STORY_AGENT_STATUS,
    accountUsage: STORY_USAGE,
    updateStatus: STORY_UPDATE_STATUS,
    agentStates: {},
    onSelectBot: fn(),
    onSelectPerson: fn(),
    onCreateBot: fn(),
    onEditBot: fn(),
    onDeleteBot: async () => undefined,
    onRefreshUsage: async () => STORY_USAGE,
    onUpdateAction: async () => undefined,
    onUpdateAccountAvatar: async () => undefined,
    onLogout: async () => undefined,
    onOpenExternal: async () => undefined,
    onOpenPermissions: fn(),
    compact: false,
    onCollapse: fn(),
    onExpand: fn(),
    ...overrides,
  };
}

function Column(props: { theme: StoryTheme; children: Parameters<typeof ThemeFrame>[0]["children"] }) {
  return (
    <ThemeFrame theme={props.theme} style="width: 300px; height: 100vh;">
      {props.children}
    </ThemeFrame>
  );
}

// ---- Agent row activity states ----------------------------------------------------------------

function activity(botId: string, overrides: Partial<AgentActivity>): AgentActivity {
  return { botId, kind: "idle", pendingRequests: 0, limit: null, error: null, updatedAt: AT, ...overrides };
}

/** One row per state the backend reports: needs you, thinking, limit with a reset time, error. */
function activityStates(): Record<string, SidebarAgentState> {
  // Two hours from now, so the row always reads "Limit · resumes HH:MM" in local time.
  const resetsAt = Math.floor(Date.now() / 1000) + 2 * 3600;
  const states: Record<string, SidebarAgentState | undefined> = {
    chief: rowStateFor({
      activity: activity("chief", { kind: "waiting", pendingRequests: 1 }),
      localNeedsYou: false,
      localWorking: false,
      unread: 0,
      responded: false,
    }),
    research: rowStateFor({
      activity: activity("research", { kind: "working" }),
      localNeedsYou: false,
      localWorking: false,
      unread: 0,
      responded: false,
    }),
    sales: rowStateFor({
      activity: activity("sales", {
        kind: "limited",
        limit: { provider: "codex", limitId: "codex", resetsAt },
      }),
      localNeedsYou: false,
      localWorking: false,
      unread: 0,
      responded: false,
    }),
  };
  return Object.fromEntries(
    Object.entries(states).filter((entry): entry is [string, SidebarAgentState] => entry[1] !== undefined),
  );
}

function ActivityScene(props: { theme: StoryTheme }) {
  const errorBot = { ...STORY_BOTS[0], id: "ops", name: "Ops", role: "Operations", preview: "Last run failed" };
  return (
    <Column theme={props.theme}>
      <Sidebar
        {...sidebarProps({
          bots: [...STORY_BOTS, errorBot],
          agentStates: {
            ...activityStates(),
            ops: rowStateFor({
              activity: activity("ops", {
                kind: "error",
                error: { code: "agent_error", message: "Codex stopped unexpectedly.", at: AT },
              }),
              localNeedsYou: false,
              localWorking: false,
              unread: 0,
              responded: false,
            }) ?? { kind: "responded" },
          },
        })}
      />
    </Column>
  );
}

// ---- Folders tree ------------------------------------------------------------------------------

function folder(id: string, name: string, parentId: string | null, position = 0, collapsed = false): SidebarFolder {
  return { id, name, parentId, position, collapsed, createdAt: AT, updatedAt: AT };
}

const FOLDER_LAYOUT: SidebarLayout = {
  folders: [
    folder("work", "Work", null, 0),
    folder("clients", "Clients", "work", 0),
    folder("archive", "Archive", null, 1, true),
  ],
  placements: [
    { itemKind: "agent", itemId: "research", folderId: "work", position: 0 },
    { itemKind: "agent", itemId: "sales", folderId: "clients", position: 0 },
  ],
};

/** A working tree: the in-memory mock applies the same rules as the backend. */
function FoldersScene(props: { theme: StoryTheme }) {
  const store = createMockSidebar(FOLDER_LAYOUT);
  const [layout, setLayout] = createSignal<SidebarLayout>(store.layout());
  const apply = <T extends SidebarLayout | { layout: SidebarLayout }>(result: T): void => {
    setLayout("layout" in result ? result.layout : result);
  };
  const LAST = 1_000_000;
  const actions: SidebarFolderActions = {
    createFolder: async (name, parentId) => apply(store.createFolder({ name, parentId })),
    renameFolder: async (folderId, name) => apply(store.updateFolder({ folderId, name })),
    setFolderCollapsed: async (folderId, collapsed) => apply(store.updateFolder({ folderId, collapsed })),
    duplicateFolder: async (folderId) => apply(store.duplicateFolder(folderId)),
    deleteFolder: async (folderId) => apply(store.deleteFolder(folderId)),
    moveFolder: async (folderId, parentId) => apply(store.moveFolder({ folderId, parentId, position: LAST })),
    moveAgent: async (botId, folderId) =>
      apply(store.moveItem({ itemKind: "agent", itemId: botId, folderId, position: LAST })),
  };
  return (
    <Column theme={props.theme}>
      <Sidebar {...sidebarProps({ layout: layout(), folderActions: actions })} />
    </Column>
  );
}

// ---- Durable Needs you -------------------------------------------------------------------------

function approval(requestId: string, botId: string, command: string): AgentApproval {
  return {
    requestId,
    botId,
    threadId: `thread-${botId}`,
    turnId: "turn-1",
    kind: "command",
    command,
    cwd: null,
    reason: null,
    grantRoot: null,
    permissions: null,
  };
}

/** What the backend still holds after the window reloaded: a question and two approvals for Chief. */
const OPEN_CARDS: PendingAgentRequest[] = [
  {
    kind: "prompt",
    requestId: "p1",
    botId: "research",
    threadId: "thread-research",
    turnId: "turn-1",
    questions: [
      {
        id: "q1",
        header: "",
        question: "Which variant should I ship?",
        isSecret: false,
        options: [{ label: "Better", description: "" }],
      },
    ],
    createdAt: "2026-11-12T10:00:01.000Z",
  },
  { kind: "approval", approval: approval("a1", "chief", "bun run build"), createdAt: "2026-11-12T10:00:02.000Z" },
  { kind: "approval", approval: approval("a2", "chief", "bun run test"), createdAt: "2026-11-12T10:00:03.000Z" },
];

function MockedApp(props: { theme: StoryTheme; options: MockOpenBotOptions }) {
  const previousApi = window.openbot;
  const mock = createMockOpenBot(props.options);
  window.openbot = mock.api;
  onCleanup(() => {
    mock.dispose();
    window.openbot = previousApi;
  });
  return (
    <ThemeFrame theme={props.theme} style="height: 100vh;">
      <App />
    </ThemeFrame>
  );
}

const DURABLE: MockOpenBotOptions = {
  pendingRequests: OPEN_CARDS,
  activity: [
    activity("chief", { kind: "waiting", pendingRequests: 2 }),
    activity("research", { kind: "waiting", pendingRequests: 1 }),
  ],
};

// ---- Stories -----------------------------------------------------------------------------------

const meta = {
  title: "COSGRAL/W1 UI2",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const ActivityStatesDark: Story = {
  name: "Agent row states · dark",
  render: () => <ActivityScene theme="dark" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /^Chief, Chief of staff\. Needs you\./ })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /^Research, Research partner\. Thinking\./ })).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: /^Sales Outbound, Outbound specialist\. Limit · resumes/ }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /^Ops, Operations\. Error · Codex stopped/ })).toBeInTheDocument();
  },
};

export const ActivityStatesLight: Story = {
  name: "Agent row states · light",
  render: () => <ActivityScene theme="light" />,
};

export const FoldersTreeDark: Story = {
  name: "Folders tree · dark",
  render: () => <FoldersScene theme="dark" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Work, folder, 2 agents" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(canvas.getByRole("button", { name: "Archive, folder, 0 agents" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  },
};

export const FoldersTreeLight: Story = {
  name: "Folders tree · light",
  render: () => <FoldersScene theme="light" />,
};

export const DurableNeedsYouDark: Story = {
  name: "Durable Needs you after reload · dark",
  render: () => <MockedApp theme="dark" options={DURABLE} />,
  play: async ({ canvas }) => {
    const section = await canvas.findByRole("region", { name: /Needs you/ });
    await expect(section).toHaveTextContent("Which variant should I ship?");
    await expect(await canvas.findByRole("region", { name: "Decision" })).toHaveTextContent("bun run build");
  },
};

export const DurableNeedsYouLight: Story = {
  name: "Durable Needs you after reload · light",
  render: () => <MockedApp theme="light" options={DURABLE} />,
};
