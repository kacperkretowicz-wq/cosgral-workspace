import type { AgentApproval, AgentEyesSession } from "@openbot/contracts/ipc";
import { onCleanup } from "solid-js";
import { expect, fn } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { App } from "../src/App";
import { ApprovalCard } from "../src/components/ConversationPrompts";
import { EyesBar } from "../src/components/EyesIndicator";
import { Sidebar } from "../src/components/Sidebar";
import { STORY_AGENT_STATUS, STORY_APP_INFO, STORY_BOTS, STORY_UPDATE_STATUS, STORY_USAGE } from "./fixtures";
import { createMockOpenBot } from "./mock-openbot";
import { type StoryTheme, ThemeFrame } from "./theme-frame";

const BOTS = STORY_BOTS.map((bot) => ({ id: bot.id, name: bot.name }));

const WATCHING: AgentEyesSession = {
  id: "eyes-1",
  botId: "research",
  threadId: "thread-research",
  turnId: "turn-1",
  source: "screen",
  targetLabel: "Screen 1",
  phase: "watching",
  framesCaptured: 2,
  framesPlanned: 6,
  startedAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 5 * 60_000).toISOString(),
};

const CAPTURING_CAMERA: AgentEyesSession = {
  ...WATCHING,
  id: "eyes-2",
  botId: "chief",
  threadId: "thread-chief",
  source: "camera",
  targetLabel: "Camera",
  phase: "capturing",
  framesCaptured: 0,
  framesPlanned: 1,
  endsAt: null,
};

const SCREEN_APPROVAL: AgentApproval = {
  requestId: "eyes-approval-1",
  botId: "research",
  threadId: "thread-research",
  turnId: "turn-1",
  kind: "screen",
  command: null,
  cwd: null,
  reason: "I want to read the error in your build window.",
  grantRoot: null,
  permissions: null,
  eyes: { source: "window", targetLabel: "Build output - bun run build", live: true, frames: 4, intervalSeconds: 2 },
};

const CAMERA_APPROVAL: AgentApproval = {
  ...SCREEN_APPROVAL,
  requestId: "eyes-approval-2",
  kind: "camera",
  reason: "Show me the whiteboard.",
  eyes: { source: "camera", targetLabel: "Camera", live: false, frames: 1, intervalSeconds: null },
};

const account = { id: "user-1", email: "person@example.com", name: "Owner", avatarUrl: null };

function BarFrame(props: { theme: StoryTheme; sessions: AgentEyesSession[] }) {
  return (
    <ThemeFrame theme={props.theme} style="min-height: 100vh;">
      <div style="max-width: 760px; margin: 0 auto;">
        <div style="height: 38px; display: flex; align-items: center; padding: 0 12px; font-weight: 600;">Research</div>
        <EyesBar sessions={props.sessions} bots={BOTS} onStop={fn()} />
        <p style="padding: 16px 12px; color: var(--openbot-text-secondary);">
          The conversation continues below the bar.
        </p>
      </div>
    </ThemeFrame>
  );
}

function CardFrame(props: { theme: StoryTheme; approval: AgentApproval }) {
  return (
    <ThemeFrame theme={props.theme} style="min-height: 100vh; padding: 24px;">
      <div style="max-width: 520px; margin: 0 auto;">
        <ApprovalCard
          variant="approval"
          approval={props.approval}
          onApprove={fn(async () => true)}
          onReject={fn(async () => true)}
        />
      </div>
    </ThemeFrame>
  );
}

function SidebarFrame(props: { theme: StoryTheme }) {
  return (
    <ThemeFrame theme={props.theme} style="width: 300px; height: 100vh; --left-header-height: 38px;">
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
        agentStates={{ chief: { kind: "working" } }}
        lookingBotIds={["research"]}
        computerUsingBotIds={["sales"]}
        onStopComputerUse={fn()}
        localProfile
        onSelectBot={fn()}
        onSelectPerson={fn()}
        onCreateBot={fn()}
        onEditBot={fn()}
        onDeleteBot={async () => undefined}
        onRefreshUsage={async () => STORY_USAGE}
        onUpdateAction={async () => undefined}
        onUpdateAccountAvatar={async () => undefined}
        onLogout={async () => undefined}
        onOpenExternal={async () => undefined}
        onOpenPermissions={fn()}
        compact={false}
        onCollapse={fn()}
        onExpand={fn()}
      />
    </ThemeFrame>
  );
}

function LookingApp() {
  const previousApi = window.openbot;
  const mock = createMockOpenBot({ eyesState: { sessions: [WATCHING], grants: [] } });
  window.openbot = mock.api;
  onCleanup(() => {
    mock.dispose();
    window.openbot = previousApi;
  });
  return <App />;
}

const meta = {
  title: "Better/Agent eyes",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const BarDark: Story = {
  name: "Bar · dark",
  render: () => <BarFrame theme="dark" sessions={[WATCHING, CAPTURING_CAMERA]} />,
};

export const BarLight: Story = {
  name: "Bar · light",
  render: () => <BarFrame theme="light" sessions={[WATCHING, CAPTURING_CAMERA]} />,
};

export const ScreenRequestDark: Story = {
  name: "Approval · screen (window, live) · dark",
  render: () => <CardFrame theme="dark" approval={SCREEN_APPROVAL} />,
};

export const ScreenRequestLight: Story = {
  name: "Approval · screen (window, live) · light",
  render: () => <CardFrame theme="light" approval={SCREEN_APPROVAL} />,
};

export const CameraRequestDark: Story = {
  name: "Approval · camera · dark",
  render: () => <CardFrame theme="dark" approval={CAMERA_APPROVAL} />,
};

export const CameraRequestLight: Story = {
  name: "Approval · camera · light",
  render: () => <CardFrame theme="light" approval={CAMERA_APPROVAL} />,
};

export const SidebarLookingDark: Story = {
  name: "Sidebar row · dark",
  render: () => <SidebarFrame theme="dark" />,
};

export const SidebarLookingLight: Story = {
  name: "Sidebar row · light",
  render: () => <SidebarFrame theme="light" />,
};

export const InTheApp: Story = {
  name: "In the app (Stop clears the bar)",
  render: () => <LookingApp />,
  play: async ({ canvas, userEvent }) => {
    const bar = await canvas.findByRole("status", { name: "Agent eyes" });
    await expect(bar).toHaveTextContent("Research");
    await userEvent.click(canvas.getByRole("button", { name: "Stop Research looking" }));
    await expect(canvas.queryByRole("status", { name: "Agent eyes" })).toBeNull();
  },
};
