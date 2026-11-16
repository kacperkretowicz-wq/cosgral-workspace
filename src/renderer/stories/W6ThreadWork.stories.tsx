import type { AgentPlan } from "@openbot/contracts/ipc";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { PlanCard } from "../src/components/PlanPanel";
import { type StoryTheme, ThemeFrame } from "./theme-frame";
import { planFixture } from "./w6-ui-fixtures";

const meta = { title: "COSGRAL/W6 thread work", parameters: { a11y: { test: "error" } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function PlanScene(props: { theme: StoryTheme; phase: AgentPlan["phase"] }) {
  const plan = planFixture({ phase: props.phase });
  if (props.phase === "approved") {
    plan.steps[0].status = "done";
    plan.steps[1].status = "in-progress";
  }
  return (
    <ThemeFrame theme={props.theme}>
      <main class="foundation-story">
        <PlanCard
          plan={plan}
          api={{
            list: async () => [plan],
            respond: async (input) => ({ ...plan, phase: input.decision === "approve" ? "approved" : "rejected" }),
          }}
        />
      </main>
    </ThemeFrame>
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
