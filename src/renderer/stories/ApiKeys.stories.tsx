import { expect, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { ApiKeyRecord } from "../src/components/api-keys-view";
import { ApiKeysSection, createMockApiKeys } from "../src/components/ApiKeysSection";
import { ThemeFrame } from "./theme-frame";

function seed(variant: "empty" | "saved" | "rejected" | "light"): ApiKeyRecord[] | undefined {
  if (variant === "empty") return undefined;
  if (variant === "rejected") {
    return [
      { provider: "openai", maskedKey: "····bad0", status: "rejected" },
      { provider: "anthropic", maskedKey: null, status: "unchecked" },
    ];
  }
  return [
    { provider: "openai", maskedKey: "····ok12", status: "ok" },
    { provider: "anthropic", maskedKey: null, status: "unchecked" },
  ];
}

function Scene(props: { variant: "empty" | "saved" | "rejected" | "light" }) {
  const api = createMockApiKeys(seed(props.variant));
  return (
    <ThemeFrame theme={props.variant === "light" ? "light" : "dark"}>
      <div class="w2-library providers-page">
        <ApiKeysSection api={api} />
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
    await expect(await openai.findByText(/Saved key ending in ····4242/)).toBeInTheDocument();
    await expect(field).toHaveValue("");
    await userEvent.click(openai.getByRole("button", { name: "Check connection" }));
    await expect(await openai.findByText("OK")).toBeInTheDocument();
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
    await expect(await canvas.findByText(/····ok12/)).toBeInTheDocument();
    await expect(await canvas.findByText("OK")).toBeInTheDocument();
  },
};

export const Light: Story = {
  args: { variant: "light" },
};
