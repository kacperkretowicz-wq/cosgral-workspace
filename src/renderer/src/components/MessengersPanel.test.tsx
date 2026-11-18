import type { AgentEvent } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { STORY_BOT_SUMMARIES } from "../../stories/fixtures";
import { createMockMessengers } from "../../stories/mock-messengers";
import { MessengersPanel } from "./MessengersPanel";

const TELEGRAM_TOKEN = `123456789:${"A".repeat(35)}`;
const SLACK_BOT = `xoxb-${"1".repeat(30)}`;
const SLACK_APP = `xapp-${"2".repeat(30)}`;
const FIRST_BOT = STORY_BOT_SUMMARIES[0]?.id ?? "chief";

let mock = createMockMessengers(() => undefined);
let emit: (event: AgentEvent) => void = () => undefined;

function install(withApi = true) {
  Object.assign(window, {
    openbot: {
      messengers: withApi ? mock : undefined,
      agent: {
        listBots: async () => STORY_BOT_SUMMARIES,
        onEvent: (listener: (event: AgentEvent) => void) => {
          emit = listener;
          return () => undefined;
        },
      },
    },
  });
}

beforeEach(() => {
  mock = createMockMessengers((event) => emit(event));
  install();
});
afterEach(cleanup);

/** The card is drawn again when its status changes, so look it up each time. */
const card = (name: string) => {
  const row = screen.getByText(name, { selector: "strong" }).closest("li");
  if (!(row instanceof HTMLElement)) throw new Error("no messenger card");
  return within(row);
};
const type = async (label: string, value: string) =>
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
const ready = (name: string, label: string) =>
  waitFor(() => expect(card(name).getByRole("button", { name: label })).toBeEnabled());
const loaded = () => screen.findByText("Telegram", { selector: "strong" });

it("lists Telegram and Slack, not connected, with nobody allowed and the setup steps", async () => {
  render(() => <MessengersPanel />);
  await loaded();
  expect(screen.getAllByText("Not connected")).toHaveLength(2);
  expect(screen.getAllByText("Nobody is allowed yet.")).toHaveLength(2);
  expect(screen.getByText("Open BotFather in Telegram and make a bot.")).toBeInTheDocument();
  expect(screen.getByText("Make a Slack app and turn on Socket Mode.")).toBeInTheDocument();
  expect(screen.getByText(/Only private conversations are answered/)).toBeInTheDocument();
});

it("refuses a token of the wrong shape without sending it", async () => {
  const spy = vi.spyOn(mock, "connect");
  render(() => <MessengersPanel />);
  await loaded();
  await type("Bot token (Telegram)", "not-a-token");
  await fireEvent.click(screen.getByRole("button", { name: "Connect (Telegram)" }));
  expect(
    await screen.findByText("That does not look like a token of Telegram. Check it and paste it again."),
  ).toBeInTheDocument();
  expect(spy).not.toHaveBeenCalled();
});

it("connects Telegram: the token is write-only (the field is cleared) and the bot name is shown", async () => {
  const spy = vi.spyOn(mock, "connect");
  render(() => <MessengersPanel />);
  await loaded();
  await type("Bot token (Telegram)", TELEGRAM_TOKEN);
  await fireEvent.click(screen.getByRole("button", { name: "Connect (Telegram)" }));
  await waitFor(() => expect(spy).toHaveBeenCalledWith({ kind: "telegram", token: TELEGRAM_TOKEN }));
  await waitFor(() => expect(card("Telegram").getByText(/Connected as @demo_helper_bot/)).toBeInTheDocument());
  expect(document.body.textContent).not.toContain(TELEGRAM_TOKEN);
  expect(card("Telegram").queryByLabelText("Bot token (Telegram)")).not.toBeInTheDocument();
  expect(card("Telegram").getByRole("button", { name: "Disconnect (Telegram)" })).toBeInTheDocument();
});

it("Slack needs both tokens and sends both", async () => {
  const spy = vi.spyOn(mock, "connect");
  render(() => <MessengersPanel />);
  await loaded();
  await type("Bot token (Slack)", SLACK_BOT);
  await fireEvent.click(screen.getByRole("button", { name: "Connect (Slack)" }));
  expect(await screen.findByText(/does not look like a token of Slack/)).toBeInTheDocument();
  expect(spy).not.toHaveBeenCalled();
  await type("App-level token (Slack)", SLACK_APP);
  await fireEvent.click(screen.getByRole("button", { name: "Connect (Slack)" }));
  await waitFor(() => expect(spy).toHaveBeenCalledWith({ kind: "slack", token: SLACK_BOT, appToken: SLACK_APP }));
  await waitFor(() => expect(card("Slack").getByText(/Connected as/)).toBeInTheDocument());
});

it("allows a conversation for an agent, shows it, and removes it; a wrong id is refused with the hint", async () => {
  const allow = vi.spyOn(mock, "allowChat");
  render(() => <MessengersPanel />);
  await loaded();
  await type("Conversation id (Telegram)", "not digits");
  await fireEvent.click(screen.getByRole("button", { name: "Allow this conversation (Telegram)" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/^A number, like 123456789\./);
  expect(allow).not.toHaveBeenCalled();

  await type("Conversation id (Telegram)", "424242");
  await type("Name (optional) (Telegram)", "Ann");
  await fireEvent.click(screen.getByRole("button", { name: "Allow this conversation (Telegram)" }));
  await waitFor(() =>
    expect(allow).toHaveBeenCalledWith({ kind: "telegram", chatId: "424242", botId: FIRST_BOT, label: "Ann" }),
  );
  await waitFor(() => expect(card("Telegram").getByText(/Ann ·/)).toBeInTheDocument());

  await ready("Telegram", "Remove Ann");
  await fireEvent.click(card("Telegram").getByRole("button", { name: "Remove Ann" }));
  await waitFor(() => expect(card("Telegram").getByText("Nobody is allowed yet.")).toBeInTheDocument());
});

it("an unknown conversation that wrote is listed (never what it wrote) and can be allowed with one click", async () => {
  render(() => <MessengersPanel />);
  await loaded();
  await type("Bot token (Telegram)", TELEGRAM_TOKEN);
  await fireEvent.click(screen.getByRole("button", { name: "Connect (Telegram)" }));
  await waitFor(() => expect(card("Telegram").getByText(/Connected as/)).toBeInTheDocument());
  expect(mock.simulate.incoming({ chatId: "777", label: "Stranger", text: "secret words" })).toBe("ignored");
  await waitFor(() => expect(card("Telegram").getByText("Stranger")).toBeInTheDocument());
  expect(document.body.textContent).not.toContain("secret words");
  await fireEvent.click(card("Telegram").getByRole("button", { name: "Allow Stranger" }));
  expect(screen.getByLabelText("Conversation id (Telegram)")).toHaveValue("777");
  expect(screen.getByLabelText("Name (optional) (Telegram)")).toHaveValue("Stranger");
});

it("shows the fixed sentence when the token is refused, and offers the form again", async () => {
  render(() => <MessengersPanel />);
  await loaded();
  await type("Bot token (Telegram)", TELEGRAM_TOKEN);
  await fireEvent.click(screen.getByRole("button", { name: "Connect (Telegram)" }));
  await waitFor(() => expect(card("Telegram").getByText(/Connected as/)).toBeInTheDocument());
  mock.simulate.tokenRefused("telegram");
  await waitFor(() =>
    expect(card("Telegram").getByRole("alert")).toHaveTextContent(/Telegram does not accept the token/),
  );
  expect(card("Telegram").getByLabelText("Bot token (Telegram)")).toBeInTheDocument();
});

it("disconnects and keeps the allow list", async () => {
  render(() => <MessengersPanel />);
  await loaded();
  await mock.connect({ kind: "telegram", token: TELEGRAM_TOKEN });
  await mock.allowChat({ kind: "telegram", chatId: "11", botId: FIRST_BOT, label: "Bo" });
  await waitFor(() =>
    expect(card("Telegram").getByRole("button", { name: "Disconnect (Telegram)" })).toBeInTheDocument(),
  );
  await ready("Telegram", "Disconnect (Telegram)");
  await fireEvent.click(card("Telegram").getByRole("button", { name: "Disconnect (Telegram)" }));
  await waitFor(() => expect(card("Telegram").getByText("Not connected")).toBeInTheDocument());
  expect(card("Telegram").getByText(/Bo ·/)).toBeInTheDocument();
});

it("shows an error with Retry when the list cannot be read, and a note without the API", async () => {
  const spy = vi.spyOn(mock, "list").mockRejectedValueOnce(new Error("The messengers are locked."));
  render(() => <MessengersPanel />);
  expect(await screen.findByRole("alert")).toHaveTextContent("The messengers are locked.");
  await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await loaded()).toBeInTheDocument();
  expect(spy).toHaveBeenCalledTimes(2);
  cleanup();
  install(false);
  render(() => <MessengersPanel />);
  expect(screen.getByText("Messengers are not available in this version.")).toBeInTheDocument();
});
