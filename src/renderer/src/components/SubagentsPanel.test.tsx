import type { AgentEvent } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockSubagents, type MockSubagents } from "../../stories/mock-subagents";
import { SubagentsPanel } from "./SubagentsPanel";

let mock: MockSubagents;
let listeners: Array<(event: AgentEvent) => void> = [];

function install(withApi = true) {
  Object.assign(window, {
    openbot: {
      subagents: withApi ? mock : undefined,
      agent: {
        onEvent: (listener: (event: AgentEvent) => void) => {
          listeners.push(listener);
          return () => {
            listeners = listeners.filter((item) => item !== listener);
          };
        },
      },
    },
  });
}

beforeEach(() => {
  listeners = [];
  mock = createMockSubagents(
    (event) => {
      for (const listener of listeners) listener(event);
    },
    { activeThread: () => "thread-1" },
  );
  install();
});
afterEach(cleanup);

const seen = (title: string, text: string) =>
  waitFor(() => expect(within(cardEl(title)).getByText(text)).toBeInTheDocument());

const cardEl = (title: string): HTMLElement => {
  const row = screen.getByText(title, { selector: "strong" }).closest("li");
  if (!(row instanceof HTMLElement)) throw new Error("no card");
  return row;
};

const card = (title: string) => within(cardEl(title));

it("shows nothing while the thread has no subagent", async () => {
  render(() => <SubagentsPanel botId="bot-1" />);
  await waitFor(() => expect(screen.queryByText(/Subagents:/)).not.toBeInTheDocument());
});

it("lists a subagent when the agent starts one, with its task and state, and counts the working ones", async () => {
  render(() => <SubagentsPanel botId="bot-1" />);
  mock.spawn({ botId: "bot-1", threadId: "thread-1", task: "Summarise the report", title: "Summary" });
  expect(await screen.findByText("Subagents: 1 working of 1")).toBeInTheDocument();
  expect(card("Summary").getByText("Working")).toBeInTheDocument();
  expect(card("Summary").getByText("Summarise the report")).toBeInTheDocument();
});

it("shows what it wrote so far, then its answer when it is done (no Stop any more)", async () => {
  render(() => <SubagentsPanel botId="bot-1" />);
  const created = mock.spawn({ botId: "bot-1", threadId: "thread-1", task: "Check the numbers", title: "Numbers" });
  await screen.findByText("Numbers", { selector: "strong" });
  mock.write(created.id, "Row 3 looks wrong");
  expect(await screen.findByText("Row 3 looks wrong")).toBeInTheDocument();
  mock.complete(created.id, "All rows are fine.");
  await seen("Numbers", "Done");
  expect(card("Numbers").getByText("All rows are fine.")).toBeInTheDocument();
  expect(card("Numbers").queryByRole("button", { name: /Stop/ })).not.toBeInTheDocument();
});

it("a subagent that asks sends you to Needs you", async () => {
  render(() => <SubagentsPanel botId="bot-1" />);
  const created = mock.spawn({ botId: "bot-1", threadId: "thread-1", task: "Delete the old files", title: "Cleanup" });
  await screen.findByText("Cleanup", { selector: "strong" });
  mock.ask(created.id, ["request-1"]);
  await seen("Cleanup", "Waiting for you");
  expect(card("Cleanup").getByText("It asks you something: answer the card in Needs you.")).toBeInTheDocument();
});

it("Stop ends one at once and says why", async () => {
  const stop = vi.spyOn(mock, "stop");
  render(() => <SubagentsPanel botId="bot-1" />);
  const created = mock.spawn({ botId: "bot-1", threadId: "thread-1", task: "Long job", title: "Long" });
  await screen.findByText("Long", { selector: "strong" });
  await fireEvent.click(card("Long").getByRole("button", { name: "Stop Long" }));
  await waitFor(() => expect(stop).toHaveBeenCalledWith({ subagentId: created.id }));
  await seen("Long", "Stopped");
  expect(card("Long").getByText("Stopped by the user.")).toBeInTheDocument();
});

it("ignores other agents, shows an error with Retry, and nothing without the API", async () => {
  vi.spyOn(mock, "list").mockRejectedValueOnce(new Error("The list is locked."));
  render(() => <SubagentsPanel botId="bot-1" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("The list is locked.");
  mock.spawn({ botId: "bot-2", threadId: "thread-1", task: "Not mine", title: "Other" });
  await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(screen.queryByText("Other", { selector: "strong" })).not.toBeInTheDocument();
  cleanup();
  install(false);
  render(() => <SubagentsPanel botId="bot-1" />);
  expect(screen.queryByText(/Subagents:/)).not.toBeInTheDocument();
});
