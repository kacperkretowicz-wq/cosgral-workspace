import type { CentralAuthUser } from "@openbot/contracts/ipc";
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

const account: CentralAuthUser = {
  id: "local-owner",
  email: "owner@cosgral.local",
  name: "Owner",
  avatarUrl: null,
};

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

describe("Sidebar agent eyes", () => {
  it("marks only the agent that is looking", () => {
    renderSidebar({ lookingBotIds: ["research"] });
    const researchRow = screen.getByRole("button", { name: /^Research.*Looking\./ });
    expect(researchRow).toHaveTextContent("Looking");
    const rows = screen.getAllByRole("button", { name: /Looking\./ });
    expect(rows).toHaveLength(1);
  });

  it("shows no indicator when nobody is looking", () => {
    renderSidebar({ lookingBotIds: [] });
    expect(screen.queryByText("Looking")).not.toBeInTheDocument();
  });
});

describe("Sidebar local profile", () => {
  it("shows the email and Sign out for a normal account", async () => {
    renderSidebar();
    await fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByText("owner@cosgral.local")).toBeInTheDocument();
  });

  it("hides Sign out and the technical email for the local profile", async () => {
    renderSidebar({ localProfile: true });
    await fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    expect(await screen.findByRole("button", { name: /Weekly usage/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    expect(screen.queryByText("owner@cosgral.local")).not.toBeInTheDocument();
    // The display name stays: the local owner is still a person.
    expect(screen.getAllByText("Owner").length).toBeGreaterThan(0);
  });
});
