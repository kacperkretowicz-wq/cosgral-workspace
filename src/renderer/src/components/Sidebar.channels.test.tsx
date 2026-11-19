import type { CentralAuthUser, WorkspaceChannel } from "@openbot/contracts/ipc";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import {
  STORY_AGENT_STATUS,
  STORY_APP_INFO,
  STORY_BOTS,
  STORY_UPDATE_STATUS,
  STORY_USAGE,
} from "../../stories/fixtures";
import { Sidebar } from "./Sidebar";

const account: CentralAuthUser = { id: "owner", email: "owner@cosgral.local", name: "Owner", avatarUrl: null };

function channel(id: string, overrides: Partial<WorkspaceChannel> = {}): WorkspaceChannel {
  return {
    id,
    name: id,
    title: "",
    instructions: "",
    leadBotId: "chief",
    memberBotIds: ["chief", "research"],
    isolated: false,
    archived: false,
    createdAt: "2026-11-19T10:00:00.000Z",
    updatedAt: "2026-11-19T10:00:00.000Z",
    ...overrides,
  };
}

function renderSidebar(extra: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  return render(() => (
    <Sidebar
      serverName="Local"
      bots={STORY_BOTS}
      activeBotId="chief"
      people={[]}
      directThreads={[]}
      activeDirectMemberId={null}
      account={account}
      appInfo={STORY_APP_INFO}
      agentStatus={STORY_AGENT_STATUS}
      accountUsage={STORY_USAGE}
      updateStatus={STORY_UPDATE_STATUS}
      agentStates={{}}
      onSelectBot={vi.fn()}
      onSelectPerson={vi.fn()}
      onCreateBot={vi.fn()}
      onEditBot={vi.fn()}
      onDeleteBot={async () => undefined}
      onRefreshUsage={async () => STORY_USAGE}
      onUpdateAction={async () => undefined}
      onUpdateAccountAvatar={async () => undefined}
      onLogout={async () => undefined}
      onOpenExternal={async () => undefined}
      onOpenPermissions={vi.fn()}
      compact={false}
      onCollapse={vi.fn()}
      onExpand={vi.fn()}
      {...extra}
    />
  ));
}

describe("Sidebar channels", () => {
  it("lists channels above the agents with their members and opens one on click", async () => {
    const open = vi.fn();
    const { container } = renderSidebar({
      channels: [channel("launch", { title: "Launch plan" }), channel("old", { archived: true })],
      onOpenChannel: open,
    });
    expect(screen.getByRole("heading", { name: "Channels" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Agents" })).toBeInTheDocument();
    const row = screen.getByRole("button", { name: "Channel Launch plan. 2 members" });
    expect(row.querySelectorAll(".channel-row-member")).toHaveLength(2);
    expect(row).toHaveTextContent("#launch");
    expect(row).toHaveTextContent("led by Chief");
    expect(container.querySelector('[data-channel-id="old"]')).toBeNull();
    await fireEvent.click(row);
    expect(open).toHaveBeenCalledWith("launch");
  });

  it("marks the open channel and draws nothing without a handler", () => {
    renderSidebar({ channels: [channel("launch")], onOpenChannel: vi.fn(), activeChannelId: "launch" });
    expect(screen.getByRole("button", { name: "Channel launch. 2 members" })).toHaveAttribute("aria-pressed", "true");
  });

  it("hides the section when the window cannot open channels", () => {
    renderSidebar({ channels: [channel("launch")] });
    expect(screen.queryByRole("heading", { name: "Channels" })).toBeNull();
  });
});
