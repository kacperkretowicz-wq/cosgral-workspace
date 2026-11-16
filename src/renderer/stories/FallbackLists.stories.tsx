import { expect, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ProvidersPage } from "../src/components/ProvidersPage";
import { createMockFallbackModelsApi } from "./mock-fallback-models-api";
import { createMockOpenBot } from "./mock-openbot";
import { ThemeFrame } from "./theme-frame";

function Scene() {
  return (
    <ThemeFrame theme="dark">
      <ProvidersPage />
    </ThemeFrame>
  );
}
const meta = {
  title: "COSGRAL/Fallback lists",
  component: Scene,
  beforeEach: async () => {
    const previous = window.openbot;
    const mock = createMockOpenBot();
    const fallback = createMockFallbackModelsApi(["acp:removed"]);
    Object.assign(mock.api.providers ?? {}, fallback);
    await fallback.setFallbackModels({ botId: "*", fallbackModels: ["gpt-5.6-luna", "acp:removed"] });
    window.openbot = mock.api;
    return () => {
      mock.dispose();
      window.openbot = previous;
    };
  },
} satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;
export const GeneralList: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const r = within(await c.findByRole("region", { name: "All providers fallback list" }));
    await expect(await r.findByText("Unavailable")).toBeInTheDocument();
    await userEvent.click(r.getByRole("button", { name: "Move acp:removed up" }));
    await userEvent.click(r.getByRole("button", { name: "Save order" }));
    await expect(await r.findByText("Fallback order saved.")).toBeInTheDocument();
  },
};
export const Inherited: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const r = within(await c.findByRole("group", { name: "Agent fallback settings" }));
    const select = r.getByLabelText("Agent");
    if (!(select instanceof HTMLSelectElement)) throw new Error("Expected an agent select.");
    await userEvent.selectOptions(select, select.options[0].value);
    await expect(await r.findByText("Using provider and all-provider lists")).toBeInTheDocument();
    await expect(r.getByRole("button", { name: "Reset to provider list" })).toBeDisabled();
  },
};
