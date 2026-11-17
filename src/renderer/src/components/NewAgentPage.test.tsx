import type { AgentStatus, AgentTemplate } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { NewAgentPage } from "./NewAgentPage";

afterEach(cleanup);

const status = { connected: true } as unknown as AgentStatus;
const template = {
  id: "inbox",
  origin: "built-in",
  name: "Inbox Helper",
  role: "Mail",
  summary: "Drafts replies.",
  description: "Drafts replies and keeps follow-ups from slipping.",
  model: null,
  reasoningEffort: "high",
  tools: {},
  skills: [],
  memories: [],
  avatarHue: 215,
  suggested: true,
  createdAt: null,
} as unknown as AgentTemplate;

function page(onCreate = vi.fn().mockResolvedValue(undefined), loadSuggestions?: () => Promise<AgentTemplate[]>) {
  render(() => (
    <NewAgentPage
      modelOptions={[]}
      agentStatus={status}
      defaultModel="gpt-5.6-luna"
      loadSuggestions={loadSuggestions}
      onCreate={onCreate}
      onCancel={vi.fn()}
    />
  ));
  return onCreate;
}

it("needs a name, then creates with the chosen colour, effort and description", async () => {
  const onCreate = page();
  const create = screen.getByRole("button", { name: "Create agent" });
  expect(create).toBeDisabled();
  await fireEvent.input(screen.getByRole("textbox", { name: "Agent name" }), { target: { value: "  Research " } });
  await fireEvent.click(screen.getByRole("button", { name: "Blue" }));
  await fireEvent.change(screen.getByRole("combobox", { name: "Effort" }), { target: { value: "high" } });
  await fireEvent.click(create);
  await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({ name: "Research", avatarHue: 215, reasoningEffort: "high", model: "gpt-5.6-luna" }),
  );
});

it("keeps the typed fields and shows an error when creating fails", async () => {
  const onCreate = vi.fn().mockRejectedValue(new Error("boom"));
  page(onCreate);
  await fireEvent.input(screen.getByRole("textbox", { name: "Agent name" }), { target: { value: "Research" } });
  await fireEvent.click(screen.getByRole("button", { name: "Create agent" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not create the agent");
  expect(screen.getByRole("textbox", { name: "Agent name" })).toHaveValue("Research");
  expect(screen.getByRole("button", { name: "Create agent" })).toBeEnabled();
});

it("fills the form from a suggestion", async () => {
  page(undefined, () => Promise.resolve([template]));
  await fireEvent.click(await screen.findByRole("button", { name: /Inbox Helper/ }));
  expect(screen.getByRole("textbox", { name: "Agent name" })).toHaveValue("Inbox Helper");
  expect(screen.getByRole("combobox", { name: "Effort" })).toHaveValue("high");
});
