import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { BrowserProfileSettings } from "../src/components/BrowserProfileSettings";
import { IsolationSettings } from "../src/components/IsolationSettings";
import { createMockBrowserProfiles } from "./mock-browser-profiles";
import { createMockIsolation, demoAvailability } from "./mock-isolation";
import { ThemeFrame } from "./theme-frame";

function Scene(props: { state: "active" | "shared-process" | "unavailable" | "off"; theme: "dark" }) {
  const api = createMockIsolation(() => {}, { demo: { name: "Demo", ownProcesses: props.state !== "shared-process" } });
  if (props.state === "unavailable")
    api.setAvailability({ ...demoAvailability(), jobObject: { ok: false, reason: "Process host could not start." } });
  if (props.state === "off") {
    void api.setEnabled({ botId: "demo", enabled: false }).then(() => {
      const card = api.pendingOffs()[0];
      if (card) api.allowOff(card.requestId);
    });
  }
  const browser = createMockBrowserProfiles(() => {});
  return (
    <ThemeFrame theme={props.theme}>
      <div class="providers-form">
        <IsolationSettings botId="demo" api={api} onEvent={() => () => {}} />
        <BrowserProfileSettings botId="demo" api={browser} onEvent={() => () => {}} />
      </div>
    </ThemeFrame>
  );
}
const meta = {
  title: "COSGRAL/Isolation and browser profiles",
  component: Scene,
  args: { state: "active", theme: "dark" },
  parameters: { a11y: { test: "error" } },
} satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Active: Story = {};
export const SharedProcess: Story = { args: { state: "shared-process" } };
export const Unavailable: Story = { args: { state: "unavailable" } };
export const Off: Story = { args: { state: "off" } };
