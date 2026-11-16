import type { AgentModelId } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STORY_BOT_SUMMARIES, STORY_MODELS } from "../../stories/fixtures";
import { createMockFallbackModelsApi } from "../../stories/mock-fallback-models-api";
import { createMockOpenBot } from "../../stories/mock-openbot";
import { AgentSettingsW3 } from "./AgentSettingsW3";
import { FallbackChainView, ProviderFallbackLists } from "./ProviderFallbackLists";
import { ProvidersPage } from "./ProvidersPage";

const groups = [
  { scope: "provider:codex", label: "Codex" },
  { scope: "provider:claude", label: "Claude" },
  { scope: "provider:acp:demo", label: "ACP demo" },
  { scope: "provider:endpoint:local", label: "Local server" },
  { scope: "*", label: "All providers" },
];
let dispose = () => {};
afterEach(() => {
  dispose();
  vi.unstubAllGlobals();
});
async function fixture() {
  const mock = createMockOpenBot();
  dispose = mock.dispose;
  const fallback = createMockFallbackModelsApi(["acp:removed"], { agentModels: { chief: "gpt-5.6-luna" } });
  const api = {
    ...mock.api.providers,
    ...fallback,
    listAcpAgents: async () => [
      { id: "demo", name: "ACP demo", command: "demo", args: [], createdAt: "", updatedAt: "" },
    ],
    listUsage: async () => [],
    saveAcpAgent: async () => {
      throw new Error("Not used");
    },
    removeAcpAgent: async () => {},
  };
  await fallback.setFallbackModels({ botId: "*", fallbackModels: ["claude-opus-5"] });
  await fallback.setFallbackModels({ botId: "provider:codex", fallbackModels: ["claude-sonnet-5", "acp:removed"] });
  vi.stubGlobal("openbot", { ...mock.api, providers: api });
  return { mock, api, fallback };
}
describe("provider fallback UI6", () => {
  it("renders a separate editor for each provider with All last", async () => {
    const { api } = await fixture();
    render(() => <ProviderFallbackLists groups={groups} options={STORY_MODELS} api={api} />);
    expect(screen.getAllByRole("heading").map((el) => el.textContent)).toEqual(groups.map((group) => group.label));
    await screen.findByText("Unavailable");
  });
  it("saves reordered provider list with Alt+Up without changing All", async () => {
    const { api, fallback } = await fixture();
    render(() => <ProviderFallbackLists groups={groups} options={STORY_MODELS} api={api} />);
    const c = within(screen.getByRole("region", { name: "Codex fallback list" }));
    await c.findByText("Unavailable");
    await fireEvent.keyDown(c.getByRole("listitem", { name: /2. acp:removed/ }), { key: "ArrowUp", altKey: true });
    await fireEvent.click(c.getByRole("button", { name: "Save order" }));
    await c.findByText("Fallback order saved.");
    expect(await fallback.getFallbackModels("provider:codex")).toEqual(["acp:removed", "claude-sonnet-5"]);
    expect(await fallback.getFallbackModels("*")).toEqual(["claude-opus-5"]);
  });
  it("blocks a ninth entry with a visible limit and rejects duplicates", async () => {
    const { api, fallback } = await fixture();
    await fallback.setFallbackModels({
      botId: "provider:codex",
      fallbackModels: Array.from({ length: 8 }, (_, i): AgentModelId => `acp:item${i}`),
    });
    render(() => <ProviderFallbackLists groups={[groups[0]]} options={STORY_MODELS} api={api} />);
    await waitFor(() => expect(screen.getByLabelText("Add fallback model")).toBeDisabled());
    expect(screen.getByText("At most 8 models. Duplicate models cannot be added.")).toBeInTheDocument();
    await expect(
      fallback.setFallbackModels({ botId: "provider:codex", fallbackModels: ["claude-opus-5", "claude-opus-5"] }),
    ).rejects.toThrow();
  });
  it("shows deduplicated Agent Provider All sources and unavailable", async () => {
    const { fallback } = await fixture();
    await fallback.setFallbackModels({ botId: "chief", fallbackModels: ["gpt-5.6-terra", "claude-sonnet-5"] });
    const info = await fallback.getFallbackInfo("chief");
    render(() => <FallbackChainView info={info} options={STORY_MODELS} />);
    expect(screen.getAllByText("Agent")).toHaveLength(2);
    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });
  it("agent panel shows chain and resets its own list to provider", async () => {
    const { mock, api, fallback } = await fixture();
    await fallback.setFallbackModels({ botId: "chief", fallbackModels: ["gpt-5.6-terra"] });
    vi.stubGlobal("openbot", {
      ...mock.api,
      providers: api,
      agentSettings: {
        get: async () => ({ bot: STORY_BOT_SUMMARIES[0], provider: "codex", models: STORY_MODELS, tools: [] }),
        listTemplates: async () => [],
      },
    });
    render(() => <AgentSettingsW3 botId="chief" />);
    const chain = within(await screen.findByRole("region", { name: "Effective fallback chain" }));
    await chain.findByText("Agent");
    await fireEvent.click(screen.getByRole("button", { name: "Reset to provider list" }));
    await waitFor(() => expect(chain.queryByText("Agent")).not.toBeInTheDocument());
    expect(await chain.findByText("All")).toBeInTheDocument();
    expect((await fallback.getFallbackInfo("chief")).own).toBeNull();
  });
  it("Providers page discovers ACP and endpoints even without published models", async () => {
    const { mock } = await fixture();
    await mock.api.endpoints?.save({
      label: "Local server",
      kind: "ollama",
      baseUrl: "http://127.0.0.1:11434/v1",
    });
    render(() => <ProvidersPage />);
    await screen.findByRole("region", { name: "ACP demo fallback list" });
    await screen.findByRole("region", { name: "Local server fallback list" });
  });
  it("keeps edits locked after failed loading and supports reload", async () => {
    const { api } = await fixture();
    vi.spyOn(api, "getFallbackInfo").mockRejectedValueOnce(new Error("Demo offline"));
    render(() => <ProviderFallbackLists groups={[groups[0]]} options={STORY_MODELS} api={api} />);
    await screen.findByText("Demo offline");
    expect(screen.getByLabelText("Add fallback model")).toBeDisabled();
    await fireEvent.click(screen.getByRole("button", { name: "Reload list" }));
    await waitFor(() => expect(screen.getByLabelText("Add fallback model")).toBeEnabled());
  });
});
