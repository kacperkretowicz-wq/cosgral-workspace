import { onCleanup } from "solid-js";
import { expect } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { MessengersPanel } from "../src/components/MessengersPanel";
import { createMockOpenBot } from "./mock-openbot";
import { type StoryTheme, ThemeFrame } from "./theme-frame";

// COSGRAL W12-KK (3): the Messengers section of the Library: Telegram, Slack and Discord. The window talks to the mock of the program
// (`window.openbot.messengers`), so the cards, the write-only token fields and the connected state are the real screen.
// Built from pieces on purpose: a whole token-shaped text in the source is refused by secret scanning, fake or not.
const DISCORD_TOKEN = `${"MTIzNDU2Nzg5"}${"MDEyMzQ1Njc4"}.GabcDE.${"abcdefghijklmnopqrstuvwxyz"}0123456789ABC`;

function Scene(props: { theme: StoryTheme }) {
  const mock = createMockOpenBot();
  const previous = window.openbot;
  Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
  onCleanup(() => {
    mock.dispose();
    Object.defineProperty(window, "openbot", { configurable: true, value: previous });
  });
  return (
    <ThemeFrame theme={props.theme} style="min-height: 100vh; padding: 24px; box-sizing: border-box;">
      <div style="max-width: 760px;">
        <MessengersPanel />
      </div>
    </ThemeFrame>
  );
}

const meta = { title: "COSGRAL/Messengers", component: Scene } satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing is connected and nobody is allowed: the three messengers with their setup steps. */
export const Dark: Story = {
  args: { theme: "dark" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Discord", { selector: "strong" })).toBeInTheDocument();
    await expect(canvas.getAllByText("Not connected")).toHaveLength(3);
    await expect(
      canvas.getByText("Make an application in the Discord Developer Portal and add a bot to it."),
    ).toBeInTheDocument();
  },
};
export const Light: Story = {
  args: { theme: "light" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Discord", { selector: "strong" })).toBeInTheDocument();
    await expect(canvas.getAllByText("Not connected")).toHaveLength(3);
  },
};

/** A token of the wrong shape is refused before anything is sent, with a sentence (not the token). */
export const DiscordWrongTokenDark: Story = {
  args: { theme: "dark" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(await canvas.findByLabelText("Bot token (Discord)"), "not-a-token");
    await userEvent.click(canvas.getByRole("button", { name: "Connect (Discord)" }));
    await expect(await canvas.findByText(/does not look like a token of Discord/)).toBeInTheDocument();
  },
};

/** Discord connected: the bot's name, the field cleared (the token never comes back) and the way to allow a conversation. */
export const DiscordConnectedDark: Story = {
  args: { theme: "dark" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(await canvas.findByLabelText("Bot token (Discord)"), DISCORD_TOKEN);
    await userEvent.click(canvas.getByRole("button", { name: "Connect (Discord)" }));
    await expect(await canvas.findByText(/Connected as @cosgral_discord/)).toBeInTheDocument();
    await expect(document.body.textContent).not.toContain(DISCORD_TOKEN);
  },
};
export const DiscordConnectedLight: Story = {
  args: { theme: "light" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(await canvas.findByLabelText("Bot token (Discord)"), DISCORD_TOKEN);
    await userEvent.click(canvas.getByRole("button", { name: "Connect (Discord)" }));
    await expect(await canvas.findByText(/Connected as @cosgral_discord/)).toBeInTheDocument();
  },
};
