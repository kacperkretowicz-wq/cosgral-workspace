import type { CentralAuthUser } from "@openbot/contracts/ipc";
import { render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STORY_AGENT_STATUS,
  STORY_APP_INFO,
  STORY_BOTS,
  STORY_UPDATE_STATUS,
  STORY_USAGE,
} from "../../stories/fixtures";
import type { SidebarAgentState } from "../row-activity";
import { Sidebar } from "./Sidebar";

const account: CentralAuthUser = { id: "user-1", email: "person@example.com", name: "Owner", avatarUrl: null };

function renderSidebar(agentStates: Record<string, SidebarAgentState>) {
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
      agentStates={agentStates}
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
    />
  ));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 12, 14, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Sidebar agent row activity", () => {
  it("shows the limit with its local reset time in the row and its accessible name", () => {
    const resetsAt = new Date(2026, 10, 12, 15, 40).getTime() / 1000;
    renderSidebar({ sales: { kind: "limited", resetsAt } });
    const row = screen.getByRole("button", { name: /^Sales Outbound,/ });
    expect(row).toHaveAccessibleName(/Limit · resumes 15:40\./);
    expect(row.querySelector(".bot-row-note")).toHaveTextContent("Limit · resumes 15:40");
    expect(row.querySelector(".bot-row-agent-status-limited")).not.toBeNull();
  });

  it("shows a short error in place of the message preview", () => {
    renderSidebar({ research: { kind: "error", message: "The last turn failed." } });
    const row = screen.getByRole("button", { name: /^Research,/ });
    expect(row.querySelector(".bot-row-note")).toHaveTextContent("Error · The last turn failed.");
    expect(row.querySelector(".bot-row-agent-status-error")).not.toBeNull();
  });

  it("keeps the normal preview for working, needs-you, unread and responded rows", () => {
    renderSidebar({
      chief: { kind: "working" },
      research: { kind: "needs-you" },
      sales: { kind: "unread", count: 2 },
    });
    for (const name of [/^Chief,/, /^Research,/, /^Sales Outbound,/]) {
      const row = screen.getByRole("button", { name });
      expect(row.querySelector(".bot-row-note")).toBeNull();
    }
    expect(screen.getByRole("button", { name: /^Chief,/ })).toHaveAccessibleName(/Thinking\./);
    expect(screen.getByRole("button", { name: /^Research,/ })).toHaveAccessibleName(/Needs you\./);
    expect(screen.getByRole("button", { name: /^Sales Outbound,/ })).toHaveAccessibleName(/2 new replies\./);
  });

  it("shows no badge for an idle agent", () => {
    renderSidebar({});
    expect(document.querySelector(".bot-row-agent-status")).toBeNull();
  });
});
