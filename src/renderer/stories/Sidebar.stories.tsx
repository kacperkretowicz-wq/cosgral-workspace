import type { CentralAuthUser } from "@openbot/contracts/ipc";
import { expect, fireEvent, fn, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { SidebarAgentState } from "../src/components/Sidebar";
import { Sidebar } from "../src/components/Sidebar";
import { FolderDeleteDialog } from "../src/components/SidebarFolders";
import { contrastRatio } from "./contrast";
import {
  STORY_AGENT_STATUS,
  STORY_APP_INFO,
  STORY_BOTS,
  STORY_DIRECT_THREADS,
  STORY_PRESENCE,
  STORY_UPDATE_STATUS,
  STORY_USAGE,
} from "./fixtures";

const account: CentralAuthUser = {
  id: "user-1",
  email: "person@example.com",
  name: "Norbert",
  avatarUrl: null,
};

const agentStates: Record<string, SidebarAgentState> = {
  chief: { kind: "working" },
  research: { kind: "unread", count: 3 },
  sales: { kind: "responded" },
};

const args: Parameters<typeof Sidebar>[0] = {
  serverName: "Local",
  bots: STORY_BOTS,
  activeBotId: "chief",
  people: STORY_PRESENCE.members,
  directThreads: STORY_DIRECT_THREADS,
  activeDirectMemberId: null,
  account,
  appInfo: STORY_APP_INFO,
  agentStatus: STORY_AGENT_STATUS,
  accountUsage: STORY_USAGE,
  updateStatus: STORY_UPDATE_STATUS,
  agentStates,
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
};

const meta = {
  title: "Navigation/Sidebar",
  component: Sidebar,
  args,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};

export const AgentTiles: Story = {
  args: {
    people: [],
    directThreads: [],
    agentStates: {},
  },
  decorators: [(Story) => <div style={{ width: "280px", height: "100vh" }}>{Story()}</div>],
  play: async ({ canvas }) => {
    const tile = canvas.getByRole("button", { name: /Chief, Chief of staff/ });
    const avatar = tile.querySelector<HTMLElement>(".bot-row-avatar");
    const title = tile.querySelector<HTMLElement>(".bot-row-title strong");
    const preview = tile.querySelector<HTMLElement>(".bot-row-preview");
    const time = tile.querySelector<HTMLElement>(".bot-row-time");
    if (!avatar || !title || !preview || !time) throw new Error("Agent tile anatomy is incomplete.");
    await expect(tile.getBoundingClientRect().height).toBe(54);
    await expect(avatar.getBoundingClientRect().width).toBe(36);
    await expect(getComputedStyle(title).fontSize).toBe("14px");
    await expect(getComputedStyle(preview).fontSize).toBe("13px");
    await expect(getComputedStyle(time).fontSize).toBe("12px");
  },
};

export const AgentContextMenu: Story = {
  args: {
    people: [],
    directThreads: [],
    agentStates: {},
  },
  decorators: [(Story) => <div style={{ width: "280px", height: "100vh" }}>{Story()}</div>],
  play: async ({ canvas, canvasElement }) => {
    const tile = canvas.getByRole("button", { name: /Chief, Chief of staff/ });
    const tileRect = tile.getBoundingClientRect();
    fireEvent.contextMenu(tile, {
      clientX: tileRect.left + tileRect.width / 2,
      clientY: tileRect.top + tileRect.height / 2,
    });

    const menu = await within(canvasElement.ownerDocument.body).findByRole("menu", { name: "Agent actions" });
    const items = within(menu).getAllByRole("menuitem");
    const menuStyle = getComputedStyle(menu);
    const itemStyle = getComputedStyle(items[0]);

    await expect(menu.getBoundingClientRect().width).toBe(200);
    await expect(menuStyle.padding).toBe("4px");
    await expect(menuStyle.outlineStyle).toBe("none");
    await expect(items[0].getBoundingClientRect().height).toBe(26);
    await expect(itemStyle.padding).toBe("4px 8px");
    await expect(itemStyle.gap).toBe("8px");
    await expect(itemStyle.borderRadius).toBe("4px");
    await expect(itemStyle.fontSize).toBe("13px");
    await expect(itemStyle.lineHeight).toBe("18px");
  },
};

export const Compact: Story = {
  args: { compact: true },
};

export const LongServerName: Story = {
  args: { serverName: "Synthetify production workspace with a long name" },
  decorators: [(Story) => <div style={{ width: "240px", height: "100vh" }}>{Story()}</div>],
  play: async ({ canvas }) => {
    const name = canvas.getByText("Synthetify production workspace with a long name");
    const actions = canvas.getByRole("button", { name: "Collapse sidebar" }).parentElement;
    if (!actions) throw new Error("Sidebar header actions are missing.");
    await expect(getComputedStyle(name).textOverflow).toBe("ellipsis");
    await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
    await expect(name.getBoundingClientRect().right).toBeLessThanOrEqual(actions.getBoundingClientRect().left);
  },
};

export const Empty: Story = {
  args: {
    bots: [],
    people: [],
    directThreads: [],
    agentStates: {},
  },
};

export const AccountMenu: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Open account menu" }));
    await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Account" });
  },
};

export const Linux: Story = {
  args: {
    appInfo: { ...STORY_APP_INFO, platform: "linux" },
  },
};

export const Channels: Story = {
  args: { onSelectChannels: fn() },
  decorators: [(Story) => <div style={{ width: "280px", height: "100vh" }}>{Story()}</div>],
  play: async ({ canvas, args, userEvent }) => {
    const browse = canvas.getByRole("button", { name: "Browse channels" });
    const create = canvas.getByRole("button", { name: "New channel" });
    await expect(browse.querySelector("svg")).not.toBeNull();
    await expect(create.querySelector("svg")).not.toBeNull();
    await expect(getComputedStyle(browse).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    browse.focus();
    await expect(browse).toHaveFocus();
    await expect(getComputedStyle(browse).boxShadow).not.toBe("none");
    await userEvent.keyboard("{Enter}");
    await expect(args.onSelectChannels).toHaveBeenCalledWith();
    await userEvent.tab();
    await expect(create).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onSelectChannels).toHaveBeenCalledWith(true);
  },
};

export const AgentDeleteContrast: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const tile = canvas.getByRole("button", { name: /Chief, Chief of staff/ });
    const rect = tile.getBoundingClientRect();
    fireEvent.contextMenu(tile, { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
    const body = within(canvasElement.ownerDocument.body);
    const menu = await body.findByRole("menu", { name: "Agent actions" });
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Delete agent" }));
    const dialog = await body.findByRole("alertdialog", { name: "Delete Chief?" });
    const button = within(dialog).getByRole("button", { name: "Delete" });
    const style = getComputedStyle(button);
    await expect(contrastRatio(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  },
};
export const FolderDeleteContrast: Story = {
  render: () => <FolderDeleteDialog name="Demo folder" onConfirm={async () => {}} onClose={() => {}} />,
  play: async ({ canvasElement }) => {
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("alertdialog", {
      name: "Delete Demo folder?",
    });
    const button = within(dialog).getByRole("button", { name: "Delete folder" });
    const style = getComputedStyle(button);
    await expect(contrastRatio(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  },
};

export const MarkAsRead: Story = {
  args: { onMarkBotRead: fn(async () => {}) },
  play: async ({ canvas, canvasElement, args, userEvent }) => {
    const row = canvas.getByRole("button", { name: /^Research,/ });
    const rect = row.getBoundingClientRect();
    fireEvent.contextMenu(row, { clientX: rect.left + 8, clientY: rect.top + 8 });
    const menu = await within(canvasElement.ownerDocument.body).findByRole("menu", { name: "Agent actions" });
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Mark as read" }));
    await expect(args.onMarkBotRead).toHaveBeenCalledWith("research");
  },
};
export const ReadSaveError: Story = {
  args: {
    onMarkBotRead: async () => {
      throw new Error("Could not save the read state. Try again.");
    },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const row = canvas.getByRole("button", { name: /^Research,/ });
    const rect = row.getBoundingClientRect();
    fireEvent.contextMenu(row, { clientX: rect.left + 8, clientY: rect.top + 8 });
    const menu = await within(canvasElement.ownerDocument.body).findByRole("menu", { name: "Agent actions" });
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Mark as read" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Could not save the read state");
  },
};

export const HiddenAgents: Story = {
  args: {
    bots: STORY_BOTS.map((bot, index) => ({ ...bot, hidden: index === 1 })),
    people: [],
    directThreads: [],
    onSetBotHidden: fn(),
    onDuplicateBot: fn(),
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.queryByRole("button", { name: /^Research,/ })).not.toBeInTheDocument();
    await fireEvent.click(c.getByRole("switch", { name: "Show hidden" }));
    await expect(c.getByRole("button", { name: /^Research,/ })).toHaveClass("bot-row-hidden");
  },
};
export const FallbackModel: Story = {
  args: {
    people: [],
    directThreads: [],
    bots: STORY_BOTS.map((bot, index) => (index === 0 ? { ...bot, activeModel: "gpt-5.6-terra" } : bot)),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/^model zapasowy:/)).toBeVisible();
  },
};
export const CopyWarning: Story = {
  args: {
    copyNotice: "Kopia gotowa. Historia i pamięć nie są kopiowane. Nie udało się skopiować jednego skilla.",
    onDismissCopyNotice: fn(),
  },
};
