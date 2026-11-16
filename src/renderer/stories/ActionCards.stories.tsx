import type { BrowserTakeoverRequest, DraftPreviewCard } from "@openbot/contracts/ipc";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ActionCard } from "../src/components/ActionCard";
import type { PendingCard } from "../src/pending-cards";
import { type StoryTheme, ThemeFrame } from "./theme-frame";

type DraftAction = Extract<PendingCard, { kind: "draft-preview" }>;
type TakeoverAction = Extract<PendingCard, { kind: "browser-takeover" }>;

function draftCard(card: DraftPreviewCard): DraftAction {
  return { kind: "draft-preview", requestId: card.requestId, botId: card.botId, createdAt: card.createdAt, card };
}
function takeoverCard(request: BrowserTakeoverRequest): TakeoverAction {
  return {
    kind: "browser-takeover",
    requestId: request.requestId,
    botId: request.botId,
    createdAt: request.createdAt,
    request,
    phase: "requested",
  };
}

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
      <ActionCard card={draft} onDraft={async () => {}} onTakeover={async () => {}} />
      <ActionCard card={takeover} onDraft={async () => {}} onTakeover={async () => {}} />
      <ActionCard card={confirm} onDraft={async () => {}} onTakeover={async () => {}} />
    </ThemeFrame>
  );
}
const meta = { title: "COSGRAL/Action cards", component: Scene } satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = { args: { theme: "dark" } };
export const Light: Story = { args: { theme: "light" } };

export const CliDownloadApproval: Story = {
  args: { theme: "dark" },
  render: () => (
    <ThemeFrame theme="dark">
      <ActionCard
        card={draftCard({
          requestId: "cli-install",
          botId: "chief",
          threadId: "thread",
          turnId: "turn",
          variant: "confirm",
          title: "Pobrać Codex 1.0.0?",
          recipient: null,
          channel: null,
          draftId: null,
          preview:
            "COSGRAL pobierze Codex 1.0.0 (25 MB) z oficjalnego wydania OpenAI w GitHub. Sprawdzi SHA-256. Kolejne aktualizacje zależą od Twoich ustawień.",
          createdAt: "2026-11-16T00:00:00Z",
        })}
        onDraft={async () => {}}
        onTakeover={async () => {}}
      />
    </ThemeFrame>
  ),
};
