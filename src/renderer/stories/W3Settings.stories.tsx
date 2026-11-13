import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { AgentTemplateCreator } from "../src/components/AgentSettingsW3";
import { OnboardingW3 } from "../src/components/AppSettingsW3";
import { type StoryTheme, ThemeFrame } from "./theme-frame";

function Preview(props: { theme: StoryTheme }) {
  return (
    <ThemeFrame theme={props.theme} style="padding: 24px; min-height: 100vh">
      <AgentTemplateCreator
        templates={[]}
        create={async () => {
          throw new Error("Demo only");
        }}
      />
      <OnboardingW3
        state={{
          completed: false,
          language: "en",
          preferredProvider: "codex",
          firstAgentId: null,
          proposals: [],
          computerUse: { available: false, reason: "Not available in preview" },
        }}
        complete={async () => undefined}
      />
    </ThemeFrame>
  );
}
const meta = { title: "COSGRAL/W3 settings" } satisfies Meta;
export default meta;
type Story = StoryObj;
export const Dark: Story = { render: () => <Preview theme="dark" /> };
export const Light: Story = { render: () => <Preview theme="light" /> };
