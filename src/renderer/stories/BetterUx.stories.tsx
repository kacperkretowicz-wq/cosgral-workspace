import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { MOCK_CHANNEL_TASKS } from "../src/channel-tasks";
import { ChannelTasksPanel } from "../src/components/ChannelTasksPanel";
import { ChatTasksSwitch } from "../src/components/ChatTasksSwitch";
import { StickyDecision } from "../src/components/StickyDecision";
import type { NeedsYouSidebarItem } from "../src/components/Sidebar";
import { Sidebar } from "../src/components/Sidebar";
import {
  STORY_AGENT_STATUS,
  STORY_APP_INFO,
  STORY_BOTS,
  STORY_DIRECT_THREADS,
  STORY_UPDATE_STATUS,
  STORY_USAGE,
} from "./fixtures";
import type { CentralAuthUser } from "@openbot/contracts/ipc";
import { fn } from "storybook/test";

const account: CentralAuthUser = {
  id: "user-1",
  email: "person@example.com",
  name: "Owner",
  avatarUrl: null,
};

const needsYouItems: NeedsYouSidebarItem[] = [
  {
    botId: "research",
    botName: "Research",
    kind: "question",
    summary: "Który wariant A+B+C wchodzi do W1?",
  },
  {
    botId: "sales",
    botName: "Sales",
    kind: "approval",
    summary: "bun run build",
  },
];

const prompt = {
  type: "prompt" as const,
  requestId: "p1",
  botId: "research",
  threadId: "t1",
  turnId: "turn-1",
  questions: [
    {
      id: "q1",
      header: "",
      question: "Który wariant A+B+C wchodzi do W1?",
      isSecret: false,
      options: [
        { label: "Lepszy", description: "" },
        { label: "Później", description: "" },
      ],
    },
  ],
};

function ChannelShell() {
  const [mode, setMode] = createSignal<"chat" | "tasks">("chat");
  return (
    <div style={{ display: "flex", "flex-direction": "column", height: "100%", background: "var(--openbot-bg-app)" }}>
      <ChatTasksSwitch mode={mode()} onChange={setMode} channelLabel="# projekt-cosgral · Lider + 3" />
      {mode() === "tasks" ? (
        <ChannelTasksPanel tasks={MOCK_CHANNEL_TASKS} />
      ) : (
        <div style={{ padding: "16px", color: "var(--openbot-text-secondary)" }}>Oś czatu kanału (atrapa).</div>
      )}
    </div>
  );
}

const meta = {
  title: "Better/Lepszy A+B+C",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const NeedsYouSidebar: Story = {
  name: "A · Needs you",
  render: () => (
    <div style={{ width: "280px", height: "100vh" }}>
      <Sidebar
        serverName="Local"
        bots={STORY_BOTS}
        activeBotId="research"
        people={[]}
        directThreads={STORY_DIRECT_THREADS}
        activeDirectMemberId={null}
        account={account}
        appInfo={STORY_APP_INFO}
        agentStatus={STORY_AGENT_STATUS}
        accountUsage={STORY_USAGE}
        updateStatus={STORY_UPDATE_STATUS}
        agentStates={{
          research: { kind: "needs-you" },
          sales: { kind: "needs-you" },
          chief: { kind: "working" },
        }}
        needsYouItems={needsYouItems}
        onSelectBot={fn()}
        onSelectNeedsYou={fn()}
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
    </div>
  ),
};

export const StickyDecisionCard: Story = {
  name: "B · Sticky Decyzja",
  render: () => (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100vh",
        "max-width": "720px",
        margin: "0 auto",
        background: "var(--openbot-bg-app)",
      }}
    >
      <div style={{ flex: 1, overflow: "auto", padding: "16px", color: "var(--openbot-text-secondary)" }}>
        {Array.from({ length: 24 }, (_, index) => (
          <p>Wiadomość historii #{index + 1} — przewiń, Decyzja zostaje.</p>
        ))}
      </div>
      <StickyDecision
        prompt={prompt}
        approval={undefined}
        onAnswerPrompt={async () => true}
        onRespondToApproval={async () => true}
      />
    </div>
  ),
};

export const ChatTasks: Story = {
  name: "C · Chat | Zadania",
  render: () => <ChannelShell />,
};

export const ChatTasksDark: Story = {
  name: "C · Chat | Zadania (ciemny)",
  parameters: { backgrounds: { default: "dark" } },
  globals: { theme: "dark" },
  render: () => (
    <div data-theme="dark" style={{ height: "100vh", background: "#0b0c10" }}>
      <ChannelShell />
    </div>
  ),
};
