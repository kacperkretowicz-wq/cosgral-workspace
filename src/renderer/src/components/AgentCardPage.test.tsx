import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentCardPage } from "./AgentCardPage";

const agentSettings = {
  get: vi.fn(async () => ({
    bot: {
      id: "bot",
      name: "Demo",
      role: "",
      description: "Be brief.",
      notifications: true,
      model: "gpt-5.6-sol",
      reasoningEffort: "medium",
      threadId: null,
      workspacePath: "/mock/bot",
      preview: "",
      updatedAt: null,
      avatarSeed: "x",
      avatarHue: null,
      avatarUrl: null,
    },
    provider: "openai",
    models: [],
    tools: [],
    memory: { maxMemories: 50, used: 0 },
    skills: [],
    mcp: [],
  })),
  update: vi.fn(async (input: { description?: string }) => ({
    ...(await agentSettings.get()),
    bot: { ...(await agentSettings.get()).bot, description: input.description ?? "" },
  })),
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(window, {
    openbot: {
      agentSettings,
      memory: {
        listAgentMemories: vi.fn(async () => []),
        searchAgentMemories: vi.fn(async () => []),
        getAgentSettings: vi.fn(async () => ({ maxMemories: 50, used: 0 })),
        saveAgentMemory: vi.fn(),
        deleteAgentMemory: vi.fn(),
        setAgentLimit: vi.fn(),
      },
      skills: {
        list: vi.fn(async () => []),
        listInstalls: vi.fn(async () => []),
        read: vi.fn(),
        listVersions: vi.fn(async () => []),
      },
      agent: { onEvent: () => () => undefined },
    },
  });
});
afterEach(cleanup);

it("loads instructions from the agent description and saves them", async () => {
  render(() => (
    <AgentCardPage
      botId="bot"
      botName="Demo"
      card="instructions"
      title="Instructions"
      chatColor="default"
      prefsBusy={false}
      onChatColor={() => undefined}
      onBack={() => undefined}
    />
  ));
  expect(await screen.findByDisplayValue("Be brief.")).toBeInTheDocument();
  expect(screen.getByText(/AGENTS\.md/)).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(agentSettings.update).toHaveBeenCalled());
});

it("calls onBack from the page header", async () => {
  const onBack = vi.fn();
  render(() => (
    <AgentCardPage
      botId="bot"
      botName="Demo"
      card="memory"
      title="Memories"
      chatColor="default"
      prefsBusy={false}
      onChatColor={() => undefined}
      onBack={onBack}
    />
  ));
  await fireEvent.click(screen.getByRole("button", { name: "Back to agent settings" }));
  expect(onBack).toHaveBeenCalled();
});
