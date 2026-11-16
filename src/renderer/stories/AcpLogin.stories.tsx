import type { AcpLoginState } from "@openbot/contracts/ipc";
import { onSettled } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { AcpLoginCard, AcpPresetCard } from "../src/components/AcpLogin";

const state: AcpLoginState = {
  agentId: "gemini",
  phase: "code-required",
  signedIn: false,
  message: null,
  url: "https://example.com/login",
  methodId: null,
  methods: [],
};
const meta = {
  title: "Providers/ACP Login",
  component: AcpLoginCard,
  args: { name: "Gemini CLI", state, onStart: async () => {}, onCancel: async () => {}, onCode: async () => {} },
  decorators: [
    (Story, context) => {
      onSettled(() => {
        const previous = document.documentElement.dataset.theme;
        document.documentElement.dataset.theme = context.parameters.theme ?? "dark";
        return () => {
          if (previous) document.documentElement.dataset.theme = previous;
          else delete document.documentElement.dataset.theme;
        };
      });
      return (
        <main class="providers-page">
          <Story />
        </main>
      );
    },
  ],
} satisfies Meta<typeof AcpLoginCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Waiting: Story = {};
export const Starting: Story = { args: { state: { ...state, phase: "starting", url: null } } };
export const Success: Story = { args: { state: { ...state, phase: "success", signedIn: true, url: null } } };
export const Rejected: Story = { args: { state: { ...state, message: "invalid_grant" } } };
export const Cancelled: Story = { args: { state: { ...state, phase: "cancelled", url: null } } };
export const LoginError: Story = {
  args: {
    state: { ...state, phase: "error", url: null, message: "This agent offers no sign-in that the program can run." },
  },
};
export const MissingCommand: Story = {
  render: () => (
    <AcpPresetCard
      preset={{
        id: "gemini",
        name: "Gemini CLI",
        command: "gemini",
        args: ["--acp"],
        installUrl: "https://google-gemini.github.io/gemini-cli",
        added: false,
        detectedCommand: null,
      }}
      onAdded={() => {}}
    />
  ),
};
export const WaitingLight: Story = { parameters: { theme: "light" } };
export const RejectedLight: Story = { ...Rejected, parameters: { theme: "light" } };
export const SuccessLight: Story = { ...Success, parameters: { theme: "light" } };
export const CancelledLight: Story = { ...Cancelled, parameters: { theme: "light" } };
export const ErrorLight: Story = { ...LoginError, parameters: { theme: "light" } };
export const MissingCommandLight: Story = { ...MissingCommand, parameters: { theme: "light" } };
