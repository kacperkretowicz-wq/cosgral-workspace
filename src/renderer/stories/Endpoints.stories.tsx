import type { EndpointsDesktopApi, ModelEndpoint } from "@openbot/contracts/ipc";
import { untrack } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EndpointsSection } from "../src/components/EndpointsSection";
import { createMockEndpointsApi } from "./mock-endpoints-api";
import { ThemeFrame } from "./theme-frame";

function Scene(props: { state: ModelEndpoint["state"]; remote?: boolean }) {
  const remote = untrack(() => props.remote);
  const api = createMockEndpointsApi(0);
  const ready = api.save({
    label: "Demo server",
    kind: "ollama",
    baseUrl: remote ? "https://example.org/v1" : "http://127.0.0.1:11434/v1",
    key: "test-key-4242",
  });
  const client: EndpointsDesktopApi = {
    ...api,
    list: async () => [{ ...(await ready), state: props.state, models: props.state === "ok" ? ["llama3:8b"] : [] }],
  };
  return (
    <ThemeFrame theme="dark">
      <div class="w2-library providers-page">
        <EndpointsSection api={client} />
      </div>
    </ThemeFrame>
  );
}
const meta = { title: "COSGRAL/Endpoints", component: Scene, args: { state: "unchecked" } } satisfies Meta<
  typeof Scene
>;
export default meta;
type Story = StoryObj<typeof meta>;
const status =
  (label: string) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await expect(await within(canvasElement).findByText(label)).toBeInTheDocument();
  };
export const Unchecked: Story = { play: status("Not checked") };
export const Checking: Story = { args: { state: "checking" }, play: status("Checking\u2026") };
export const Ok: Story = { args: { state: "ok" }, play: status("Reachable") };
export const Rejected: Story = { args: { state: "rejected" }, play: status("Key refused") };
export const Unreachable: Story = { args: { state: "unreachable" }, play: status("Unreachable") };
export const RemoteHost: Story = {
  args: { remote: true },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(await c.findByRole("note")).toHaveTextContent(/computer|host|server/i);
  },
};
export const Presets: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole("button", { name: "Add an endpoint" }));
    await userEvent.click(c.getByRole("button", { name: "Use Ollama" }));
    await expect(c.getByRole("textbox", { name: /^Address/ })).toHaveValue("http://127.0.0.1:11434/v1");
    await userEvent.click(c.getByRole("button", { name: "Use LM Studio" }));
    await expect(c.getByRole("textbox", { name: /^Address/ })).toHaveValue("http://127.0.0.1:1234/v1");
  },
};
export const MaskedKey: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(await c.findByText(/Key .*4242/)).toBeInTheDocument();
    await userEvent.click(c.getByRole("button", { name: "Edit Demo server" }));
    await expect(c.getByLabelText("Key (optional)")).toHaveAttribute("type", "password");
    await expect(c.getByLabelText("Key (optional)")).toHaveValue("");
    await expect(c.queryByDisplayValue("test-key-4242")).not.toBeInTheDocument();
  },
};
