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

// Alt+Up/Down moves between agents in the order the list shows, but never while the person types (Option+arrows move by word there).
const account: CentralAuthUser = { id: "owner", email: "owner@cosgral.local", name: "Owner", avatarUrl: null };

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

describe("Sidebar: Alt+Up/Down between agents", () => {
  it("selects the next and previous agent of the list", async () => {
    const onSelectBot = vi.fn();
    const second = STORY_BOTS[1]?.id ?? "";
    renderSidebar({ onSelectBot, activeBotId: second });
    await screen.findAllByRole("button");
    await fireEvent.keyDown(window, { key: "ArrowDown", altKey: true });
    expect(onSelectBot).toHaveBeenLastCalledWith(STORY_BOTS[2]?.id);
    await fireEvent.keyDown(window, { key: "ArrowUp", altKey: true });
    expect(onSelectBot).toHaveBeenLastCalledWith(STORY_BOTS[0]?.id);
  });

  it("does nothing while the focus is in a text field", async () => {
    const onSelectBot = vi.fn();
    renderSidebar({ onSelectBot });
    const field = document.createElement("textarea");
    document.body.append(field);
    await fireEvent.keyDown(field, { key: "ArrowDown", altKey: true });
    expect(onSelectBot).not.toHaveBeenCalled();
    field.remove();
  });
});
