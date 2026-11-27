import { expect, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ApiKeysSection } from "../src/components/ApiKeysSection";
import { createMockApiKeysApi } from "./mock-api-keys-api";
import { ThemeFrame } from "./theme-frame";

function Scene(props: { variant: "empty" | "saved" | "rejected" }) {
  const api = createMockApiKeysApi(0);
  const ready = (async () => {
    if (props.variant === "empty") return;
    await api.set({ provider: "codex", key: props.variant === "rejected" ? "bad-demo-bad0" : "test-key-ok12" });
    await api.check({ provider: "codex" });
  })();
  const client = {
    ...api,
    list: async () => {
      await ready;
      return api.list();
    },
  };
  return (
    <ThemeFrame theme="dark">
      <div class="w2-library providers-page">
        <ApiKeysSection api={client} />
      </div>
    </ThemeFrame>
  );
}

const meta = {
  title: "COSGRAL/API keys",
  component: Scene,
  args: { variant: "empty" },
} satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { variant: "empty" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("region", { name: "API keys" })).toBeInTheDocument();
    await expect(canvas.getAllByText("No key saved")).toHaveLength(2);
    const openai = within(canvas.getByRole("group", { name: "OpenAI key" }));
    await expect(openai.getByLabelText("OpenAI API key")).toHaveAttribute("type", "password");
  },
};

export const SaveAndCheck: Story = {
  args: { variant: "empty" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const openai = within(await canvas.findByRole("group", { name: "OpenAI key" }));
    const field = openai.getByLabelText("OpenAI API key");
    await userEvent.type(field, "sk-story-4242");
    await userEvent.click(openai.getByRole("button", { name: "Save key" }));
    await expect(await canvas.findByText(/Saved key: .*4242/)).toBeInTheDocument();
    const saved = within(canvas.getByRole("group", { name: "OpenAI key" }));
    await expect(saved.getByLabelText("OpenAI API key")).toHaveValue("");
    await userEvent.click(saved.getByRole("button", { name: "Check connection" }));
    await expect(await canvas.findByText("OK")).toBeInTheDocument();
  },
};

export const Rejected: Story = {
  args: { variant: "rejected" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Rejected")).toBeInTheDocument();
  },
};

export const SavedOk: Story = {
  args: { variant: "saved" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/••••ok12/)).toBeInTheDocument();
    await expect(await canvas.findByText("OK")).toBeInTheDocument();
  },
};
