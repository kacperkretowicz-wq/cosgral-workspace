import type { AgentCardsOverview, AgentPreferences } from "@openbot/contracts/ipc";
import { AGENT_CARD_IDS } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentCardsSection } from "./AgentCardsSection";

const overview: AgentCardsOverview = {
  botId: "bot",
  cards: AGENT_CARD_IDS.map((id) => ({
    id,
    available: id !== "publish",
    count: id === "memory" ? 3 : null,
    summary: id === "publish" ? "No engine yet" : id === "memory" ? "3 saved" : "",
  })),
};
const preferences: AgentPreferences = {
  botId: "bot",
  chatColor: "default",
  busyMessage: "app-default",
  steerSupported: false,
  quickAcknowledgement: false,
  notificationLevel: "all",
  agentStartsNewChats: false,
  localScripts: false,
};
const api = {
  overview: vi.fn(async () => overview),
  getPreferences: vi.fn(async () => preferences),
  updatePreferences: vi.fn(async (input: { chatColor?: AgentPreferences["chatColor"] }) => ({
    ...preferences,
    ...input,
  })),
  resetSession: vi.fn(async () => overview),
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(window, { openbot: { agentCards: api, agent: { onEvent: () => () => undefined } } });
});
afterEach(cleanup);

it("lists all 14 cards with counts and marks the ones without an engine as unavailable", async () => {
  render(() => <AgentCardsSection botId="bot" />);
  expect(await screen.findByText("Memories")).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(14);
  expect(screen.getByText("3")).toBeInTheDocument();
  expect(screen.getByText(/Unavailable in this version: No engine yet/)).toBeInTheDocument();
});

it("saves a changed preference through agentCards.updatePreferences", async () => {
  render(() => <AgentCardsSection botId="bot" />);
  const color = await screen.findByRole("combobox", { name: "Chat color" });
  await fireEvent.change(color, { target: { value: "blue" } });
  await waitFor(() => expect(api.updatePreferences).toHaveBeenCalledWith({ botId: "bot", chatColor: "blue" }));
});

it("asks before resetting the session and then resets it", async () => {
  render(() => <AgentCardsSection botId="bot" />);
  await fireEvent.click(await screen.findByRole("button", { name: "Reset session…" }));
  expect(api.resetSession).not.toHaveBeenCalled();
  await fireEvent.click(screen.getByRole("button", { name: "Reset session" }));
  await waitFor(() => expect(api.resetSession).toHaveBeenCalledWith({ botId: "bot" }));
  expect(await screen.findByText(/fresh context/)).toBeInTheDocument();
});

it("shows an error with Retry when the cards cannot be read", async () => {
  api.overview.mockRejectedValueOnce(new Error("disk busy"));
  render(() => <AgentCardsSection botId="bot" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("disk busy");
  await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Memories")).toBeInTheDocument();
});

it("says so without the contract", () => {
  Object.assign(window, { openbot: {} });
  render(() => <AgentCardsSection botId="bot" />);
  expect(screen.getByText("Agent cards are not available in this version.")).toBeInTheDocument();
});

it("draws every card as a tile with its own icon", async () => {
  const { container } = render(() => <AgentCardsSection botId="bot" />);
  await screen.findByText("Memories");
  expect(container.querySelectorAll(".agent-card-icon svg")).toHaveLength(14);
  expect(container.querySelector('[data-card="memory"]')).not.toBeNull();
});
