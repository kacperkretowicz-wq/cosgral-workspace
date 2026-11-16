import type { AgentModelId } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { createMockFallbackModelsApi } from "../../stories/mock-fallback-models-api";
import { createMockOpenBot } from "../../stories/mock-openbot";
import { ProvidersPage } from "./ProvidersPage";

let dispose = () => {};
afterEach(() => dispose());
async function setup() {
  const mock = createMockOpenBot();
  dispose = mock.dispose;
  const fallback = createMockFallbackModelsApi(["acp:removed"]);
  Object.assign(mock.api.providers ?? {}, fallback);
  window.openbot = mock.api;
  await fallback.setFallbackModels({ botId: "*", fallbackModels: ["gpt-5.6-luna", "acp:removed"] });
  render(() => <ProvidersPage />);
  const region = within(screen.getByRole("region", { name: "All providers fallback list" }));
  await waitFor(() => expect(region.getByText("Unavailable")).toBeInTheDocument());
  return { region, fallback, mock };
}
describe("W5 fallback lists", () => {
  it("shows the general list including unavailable models", async () => {
    const { region } = await setup();
    expect(region.getByRole("heading", { name: "All providers" })).toBeInTheDocument();
  });
  it("saves the whole general list after reordering", async () => {
    const { region, fallback } = await setup();
    await fireEvent.click(region.getByRole("button", { name: "Move acp:removed up" }));
    await fireEvent.click(region.getByRole("button", { name: "Save order" }));
    await waitFor(async () =>
      expect((await fallback.getFallbackInfo("*")).own).toEqual(["acp:removed", "gpt-5.6-luna"]),
    );
  });
  it("rejects duplicate and ninth model without changing a stored list", async () => {
    const { fallback } = await setup();
    await expect(
      fallback.setFallbackModels({ botId: "*", fallbackModels: ["gpt-5.6-luna", "gpt-5.6-luna"] }),
    ).rejects.toThrow();
    await expect(
      fallback.setFallbackModels({
        botId: "*",
        fallbackModels: Array.from({ length: 9 }, (_, i): AgentModelId => `acp:item${i}`),
      }),
    ).rejects.toThrow();
    expect((await fallback.getFallbackInfo("*")).own).toHaveLength(2);
  });
  it("shows inherited list and resets an agent override", async () => {
    const { fallback, mock } = await setup();
    const bot = (await mock.api.agent.listBots())[0];
    const region = within(screen.getByRole("group", { name: "Agent fallback settings" }));
    await fireEvent.change(region.getByLabelText("Agent"), { target: { value: bot.id } });
    await region.findByText("Using provider and all-provider lists");
    await fireEvent.change(region.getByLabelText("Add fallback model"), { target: { value: "claude-opus-5" } });
    await fireEvent.click(region.getByRole("button", { name: "Save order" }));
    await waitFor(() => expect(region.getByRole("button", { name: "Reset to provider list" })).toBeEnabled());
    await fireEvent.click(region.getByRole("button", { name: "Reset to provider list" }));
    await waitFor(async () => expect((await fallback.getFallbackInfo(bot.id)).own).toBeNull());
  });
  it("reorders with Alt+ArrowUp and saves all positions", async () => {
    const { region, fallback } = await setup();
    const row = region.getByRole("listitem", { name: /2. acp:removed/ });
    await fireEvent.keyDown(row, { key: "ArrowUp", altKey: true });
    await fireEvent.click(region.getByRole("button", { name: "Save order" }));
    await waitFor(async () =>
      expect((await fallback.getFallbackInfo("*")).own).toEqual(["acp:removed", "gpt-5.6-luna"]),
    );
  });

  it("blocks adding a ninth entry with a visible limit message", async () => {
    const mock = createMockOpenBot();
    dispose = mock.dispose;
    window.openbot = mock.api;
    const fallback = createMockFallbackModelsApi();
    Object.assign(mock.api.providers ?? {}, fallback);
    await fallback.setFallbackModels({
      botId: "*",
      fallbackModels: Array.from({ length: 8 }, (_, i): AgentModelId => `acp:demo${i}`),
    });
    render(() => <ProvidersPage />);
    const region = within(screen.getByRole("region", { name: "All providers fallback list" }));
    await waitFor(() => expect(region.getByLabelText("Add fallback model")).toBeDisabled());
    expect(region.getByText("At most 8 models. Duplicate models cannot be added.")).toBeInTheDocument();
  });
});

it("keeps the All providers group mounted while provider discovery completes", async () => {
  const mock = createMockOpenBot();
  dispose = mock.dispose;
  window.openbot = mock.api;
  const fallback = createMockFallbackModelsApi(["acp:removed"]);
  Object.assign(mock.api.providers ?? {}, fallback);
  await fallback.setFallbackModels({ botId: "*", fallbackModels: ["gpt-5.6-luna", "acp:removed"] });
  render(() => <ProvidersPage />);
  const initial = screen.getByRole("region", { name: "All providers fallback list" });
  await waitFor(() =>
    expect(
      within(screen.getByRole("region", { name: "All providers fallback list" })).getByText("Unavailable"),
    ).toBeInTheDocument(),
  );
  expect(screen.getByRole("region", { name: "All providers fallback list" })).toBe(initial);
  const region = within(initial);
  await fireEvent.change(region.getByLabelText("Add fallback model"), { target: { value: "claude-opus-5" } });
  mock.emitAgentEvent({ type: "endpoints-changed", endpoints: [] });
  await waitFor(() =>
    expect(region.getByRole("button", { name: "Remove Claude Opus 5 from fallbacks" })).toBeInTheDocument(),
  );
  expect(region.getByRole("button", { name: "Save order" })).toBeEnabled();
});
