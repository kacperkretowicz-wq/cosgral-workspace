import type { AgentCardDetails, AgentPublishDetails } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentCardDetail } from "./AgentCardDetail";

const published: AgentPublishDetails = {
  card: "publish",
  template: { id: "t1", name: "Chief", summary: "", createdAt: "2026-11-18T09:00:00.000Z" },
  savedTemplates: 1,
  maxTemplates: 20,
};
const unpublished: AgentPublishDetails = { ...published, template: null, savedTemplates: 0 };

const api = {
  details: vi.fn(async (input: { card: string }): Promise<AgentCardDetails> => {
    if (input.card === "files")
      return {
        card: "files",
        total: 2,
        truncated: false,
        items: [
          { id: "f1", name: "brief.md", size: 2048, origin: "agent", createdAt: "2026-11-18T09:00:00.000Z" },
          { id: "f2", name: "plan.csv", size: 100, origin: "agent", createdAt: "2026-11-18T08:00:00.000Z" },
        ],
      };
    return unpublished;
  }),
  publishTemplate: vi.fn(async () => published),
  unpublishTemplate: vi.fn(async () => unpublished),
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(window, { openbot: { agentCards: api } });
});
afterEach(cleanup);

it("lists the files the agent saved", async () => {
  render(() => <AgentCardDetail botId="bot" card="files" title="Files" onClose={() => undefined} />);
  expect(await screen.findByText("brief.md")).toBeInTheDocument();
  expect(screen.getByText("plan.csv")).toBeInTheDocument();
  expect(screen.getByText("2 files")).toBeInTheDocument();
});

it("saves the agent as a template through the contract and says so", async () => {
  render(() => <AgentCardDetail botId="bot" card="publish" title="Publish" onClose={() => undefined} />);
  await fireEvent.click(await screen.findByRole("button", { name: "Save as template" }));
  await waitFor(() => expect(api.publishTemplate).toHaveBeenCalledWith({ botId: "bot" }));
  expect(await screen.findByText(/Saved as “Chief”/)).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Remove the template" }));
  await waitFor(() => expect(api.unpublishTemplate).toHaveBeenCalledWith({ botId: "bot" }));
});

it("says why it could not open", async () => {
  api.details.mockRejectedValueOnce(new Error("This card has no detail."));
  render(() => <AgentCardDetail botId="bot" card="usage" title="Usage" onClose={() => undefined} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("This card has no detail.");
});
