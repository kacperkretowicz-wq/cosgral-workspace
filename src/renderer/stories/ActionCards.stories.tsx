import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ActionCard } from "../src/components/ActionCard";
import { draftCard, takeoverCard } from "../src/pending-cards";
import { ThemeFrame, type StoryTheme } from "./theme-frame";

const draft = draftCard({
  requestId: "draft",
  botId: "chief",
  threadId: "thread",
  turnId: "turn",
  variant: "draft",
  title: "Send this message?",
  recipient: "Alex",
  channel: "Email",
  preview: "Hello Alex,\nThe report is ready for your review.",
  draftId: null,
  createdAt: "2026-11-13T00:00:00Z",
});
const takeover = takeoverCard({
  requestId: "browser",
  botId: "chief",
  threadId: "thread",
  turnId: "turn",
  tabId: "tab",
  url: "https://example.com",
  reason: "Sign in to continue",
  createdAt: "2026-11-13T00:00:00Z",
});
const confirm = draftCard({
  requestId: "confirm",
  botId: "chief",
  threadId: "thread",
  turnId: "turn",
  variant: "confirm",
  title: "Confirm this action?",
  recipient: null,
  channel: null,
  preview: "Publish the report",
  draftId: null,
  createdAt: "2026-11-13T00:00:00Z",
});
function Scene(props: { theme: StoryTheme }) {
  return (
    <ThemeFrame theme={props.theme} style="padding: 24px; width: 520px; display: grid; gap: 20px;">
      <ActionCard
        card={draft as Extract<typeof draft, { kind: "draft-preview" }>}
        onDraft={async () => {}}
        onTakeover={async () => {}}
      />
      <ActionCard
        card={takeover as Extract<typeof takeover, { kind: "browser-takeover" }>}
        onDraft={async () => {}}
        onTakeover={async () => {}}
      />
      <ActionCard
        card={confirm as Extract<typeof confirm, { kind: "draft-preview" }>}
        onDraft={async () => {}}
        onTakeover={async () => {}}
      />
    </ThemeFrame>
  );
}
const meta = { title: "COSGRAL/Action cards", component: Scene } satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = { args: { theme: "dark" } };
export const Light: Story = { args: { theme: "light" } };
