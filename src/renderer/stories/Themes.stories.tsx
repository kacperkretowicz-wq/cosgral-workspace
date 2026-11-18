import { onCleanup } from "solid-js";
import { expect } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { App } from "../src/App";
import { InitialSetup } from "../src/components/InitialSetup";
import { STORY_AGENT_STATUS } from "./fixtures";
import { createMockOpenBot } from "./mock-openbot";

function Scene(props: { theme: "dark" | "light"; settings?: boolean; needs?: boolean }) {
  const previous = window.openbot;
  const oldTheme = document.documentElement.dataset.theme;
  const mock = createMockOpenBot({
    pendingRequests: props.needs
      ? [
          {
            kind: "prompt",
            requestId: "theme-prompt",
            botId: "research",
            threadId: "thread-research",
            turnId: "theme-turn",
            questions: [
              {
                id: "choice",
                header: "",
                question: "Which option should I use?",
                isSecret: false,
                options: [{ label: "Continue", description: "Use the proposed option" }],
              },
            ],
            createdAt: "2026-11-16T12:00:00Z",
          },
          {
            kind: "approval",
            approval: {
              requestId: "theme-approval",
              botId: "chief",
              threadId: "thread-chief",
              turnId: "theme-turn",
              kind: "command",
              command: "Review the proposed change",
              cwd: null,
              reason: null,
              grantRoot: null,
              permissions: null,
            },
            createdAt: "2026-11-16T12:00:01Z",
          },
        ]
      : [],
  });
  window.openbot = mock.api;
  document.documentElement.dataset.theme = props.theme;
  onCleanup(() => {
    mock.dispose();
    window.openbot = previous;
    if (oldTheme) document.documentElement.dataset.theme = oldTheme;
    else delete document.documentElement.dataset.theme;
  });
  return props.settings ? (
    <InitialSetup
      reviewing
      state={{ completed: true, preferredProvider: "codex" }}
      agentStatus={STORY_AGENT_STATUS}
      platform="win32"
      accountEmail="person@example.com"
      onSave={async () => undefined}
      onJoinRemote={async () => undefined}
      onLogout={async () => undefined}
      onClose={() => undefined}
    />
  ) : (
    <App />
  );
}
const meta = { title: "COSGRAL/Themes", parameters: { a11y: { test: "error" } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const ConversationDark: Story = {
  render: () => <Scene theme="dark" />,
  play: async ({ canvas }) => {
    await expect(canvas.findByRole("navigation", { name: "Chat list" })).resolves.toBeInTheDocument();
  },
};
export const ConversationLight: Story = { ...ConversationDark, render: () => <Scene theme="light" /> };
export const SettingsDark: Story = {
  render: () => <Scene theme="dark" settings />,
  play: async ({ canvasElement, userEvent }) => {
    const { within } = await import("storybook/test");
    const page = within(canvasElement.ownerDocument.body);
    void userEvent;
    await expect(page.findByLabelText("Theme")).resolves.toBeInTheDocument();
  },
};
export const SettingsLight: Story = { ...SettingsDark, render: () => <Scene theme="light" settings /> };
export const NeedsYouDark: Story = {
  render: () => <Scene theme="dark" needs />,
  play: async ({ canvas }) => {
    await expect(canvas.findByRole("region", { name: /Needs you/ })).resolves.toHaveTextContent(
      "Which option should I use?",
    );
    await expect(canvas.findByRole("region", { name: "Decision" })).resolves.toHaveTextContent(
      "Review the proposed change",
    );
  },
};
export const NeedsYouLight: Story = { ...NeedsYouDark, render: () => <Scene theme="light" needs /> };
