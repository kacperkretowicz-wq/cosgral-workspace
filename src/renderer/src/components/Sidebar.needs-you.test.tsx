import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import type { CentralAuthUser } from "@openbot/contracts/ipc";
import { Sidebar } from "./Sidebar";
import {
  STORY_AGENT_STATUS,
  STORY_APP_INFO,
  STORY_BOTS,
  STORY_UPDATE_STATUS,
  STORY_USAGE,
} from "../../stories/fixtures";

const account: CentralAuthUser = {
  id: "user-1",
  email: "person@example.com",
  name: "Owner",
  avatarUrl: null,
};

describe("Sidebar Needs you", () => {
  it("lists waiting agents and opens the conversation on click", async () => {
    const onSelectNeedsYou = vi.fn();
    render(() => (
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
        agentStates={{ research: { kind: "needs-you" } }}
        needsYouItems={[
          {
            botId: "research",
            botName: "Research",
            kind: "question",
            summary: "Który wariant?",
          },
        ]}
        onSelectBot={vi.fn()}
        onSelectNeedsYou={onSelectNeedsYou}
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

    expect(screen.getByRole("heading", { name: "Needs you" })).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: /Research, czeka na Ciebie/ }));
    expect(onSelectNeedsYou).toHaveBeenCalledWith("research");
  });
});
