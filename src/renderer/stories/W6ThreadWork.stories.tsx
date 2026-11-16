import type { AgentPlan } from "@openbot/contracts/ipc";
import type { JSX } from "@solidjs/web";
import { onCleanup } from "solid-js";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { MessageHistoryActions } from "../src/components/MessageHistoryActions";
import { PlanCard } from "../src/components/PlanPanel";
import { createMockMessageActions } from "./mock-message-actions";
import type { StoryTheme } from "./theme-frame";
import { planFixture } from "./w6-ui-fixtures";

const meta = { title: "COSGRAL/W6 thread work", parameters: { a11y: { test: "error" } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function RootTheme(props: { theme: StoryTheme; children: JSX.Element }) {
  const root = document.documentElement;
  const previous = root.dataset.theme;
  const scheme = root.style.colorScheme;
  root.dataset.theme = props.theme;
  root.style.colorScheme = props.theme;
  onCleanup(() => {
    if (previous) root.dataset.theme = previous;
    else delete root.dataset.theme;
    root.style.colorScheme = scheme;
  });
  return <main class="foundation-story">{props.children}</main>;
}
function PlanScene(props: { theme: StoryTheme; phase: AgentPlan["phase"] }) {
  const plan = planFixture({ phase: props.phase });
  if (props.phase === "approved") {
    plan.steps[0].status = "done";
    plan.steps[1].status = "in-progress";
  }
  return (
    <RootTheme theme={props.theme}>
      <PlanCard
        plan={plan}
        api={{
          list: async () => [plan],
          respond: async (input) => ({ ...plan, phase: input.decision === "approve" ? "approved" : "rejected" }),
        }}
      />
    </RootTheme>
  );
}
export const PlanWaitingDark: Story = { render: () => <PlanScene theme="dark" phase="proposed" /> };
export const PlanWaitingLight: Story = { render: () => <PlanScene theme="light" phase="proposed" /> };
export const PlanApprovedDark: Story = { render: () => <PlanScene theme="dark" phase="approved" /> };
export const PlanApprovedLight: Story = { render: () => <PlanScene theme="light" phase="approved" /> };
export const PlanRejectedDark: Story = { render: () => <PlanScene theme="dark" phase="rejected" /> };
export const PlanRejectedLight: Story = { render: () => <PlanScene theme="light" phase="rejected" /> };
export const PlanAfterRestartDark: Story = { render: () => <PlanScene theme="dark" phase="stopped" /> };
export const PlanAfterRestartLight: Story = { render: () => <PlanScene theme="light" phase="stopped" /> };

function HistoryScene(props: { theme: StoryTheme; busy?: boolean }) {
  const api = createMockMessageActions(() => {});
  api.seed("chief", "thread-chief", [
    {
      id: "m1",
      author: "user",
      text: "Review the release notes",
      status: "completed",
      createdAt: "2026-11-16T12:00:00Z",
    },
    { id: "m2", author: "assistant", text: "Initial review", status: "completed", createdAt: "2026-11-16T12:00:01Z" },
    { id: "m3", author: "assistant", text: "Follow-up review", status: "completed", createdAt: "2026-11-16T12:00:02Z" },
  ]);
  api.setBusy("chief", "thread-chief", { turnRunning: Boolean(props.busy), busyMessages: 0 });
  return (
    <RootTheme theme={props.theme}>
      <div class="message-actions message-actions-open">
        <MessageHistoryActions
          botId="chief"
          threadId="thread-chief"
          message={{ id: "m1", author: "you", body: "Review the release notes", time: "now" }}
          laterMessages={2}
          turnRunning={Boolean(props.busy)}
          busyMessages={0}
          api={api}
        />
      </div>
    </RootTheme>
  );
}
export const DeleteConfirmationDark: Story = {
  render: () => <HistoryScene theme="dark" />,
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole("button", { name: "More message actions" }));
    await userEvent.click(await page.findByRole("menuitem", { name: "Delete message" }));
    await expect(page.getByRole("dialog", { name: "Delete message?" })).toBeVisible();
  },
};
export const DeleteConfirmationLight: Story = {
  ...DeleteConfirmationDark,
  render: () => <HistoryScene theme="light" />,
};
export const EditConfirmationDark: Story = {
  render: () => <HistoryScene theme="dark" />,
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole("button", { name: "More message actions" }));
    await userEvent.click(await page.findByRole("menuitem", { name: "Edit message" }));
    await expect(page.getByRole("dialog", { name: "Edit message" })).toHaveTextContent("remove 2 later messages");
  },
};
export const EditConfirmationLight: Story = { ...EditConfirmationDark, render: () => <HistoryScene theme="light" /> };
export const BusyHistoryDark: Story = {
  render: () => <HistoryScene theme="dark" busy />,
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole("button", { name: "More message actions" }));
    await expect(await page.findByRole("menuitem", { name: /Retry.*This thread is busy/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(page.getByRole("menuitem", { name: "Pin message" })).not.toHaveAttribute("aria-disabled", "true");
  },
};
export const BusyHistoryLight: Story = { ...BusyHistoryDark, render: () => <HistoryScene theme="light" busy /> };
