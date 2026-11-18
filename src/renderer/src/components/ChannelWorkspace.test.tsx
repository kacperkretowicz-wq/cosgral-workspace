import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockOpenBot } from "../../stories/mock-openbot";
import { ChannelWorkspace } from "./ChannelWorkspace";

describe("channel workspace", () => {
  const mock = createMockOpenBot();
  afterEach(() => mock.dispose());
  it("loads messages, sends to the lead, resumes and reassigns tasks", async () => {
    Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
    render(() => (
      <ChannelWorkspace
        bots={[
          { id: "chief", name: "Chief" },
          { id: "research", name: "Research" },
        ]}
      />
    ));
    await fireEvent.click(await screen.findByRole("button", { name: "# Project" }));
    await screen.findByText("Prepare the release plan.");
    await fireEvent.click(screen.getByRole("button", { name: "Reply to Prepare the release plan." }));
    await fireEvent.input(screen.getByLabelText("New message to channel lead"), { target: { value: "Reply text" } });
    await fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(
      (await mock.api.channels?.listMessages?.({ channelId: "demo-channel" }))?.find(
        (item) => item.text === "Reply text",
      )?.replyToMessageId,
    ).toBe("demo-message");
    mock.emitAgentEvent({
      type: "channel-message-changed",
      message: {
        id: "demo-note",
        channelId: "demo-channel",
        taskId: "demo-task",
        authorBotId: "chief",
        kind: "note",
        text: "Reviewing the requirements.",
        replyToMessageId: "demo-message",
        resultVersion: null,
        superseded: true,
        createdAt: "2026-11-13T00:01:00Z",
      },
    });
    await screen.findByText(/Superseded/);
    await fireEvent.input(screen.getByLabelText("New message to channel lead"), {
      target: { value: "Check the dates" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Check the dates");
    await fireEvent.click(screen.getByRole("tab", { name: "Tasks" }));
    const task = screen.getByText("Review the plan").closest("article");
    if (!task) throw new Error("Task row not found");
    await fireEvent.click(within(task).getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(screen.getByText("Review the plan").closest("article")).toHaveTextContent("Queued"));
    await fireEvent.change(screen.getByLabelText("Reassign Review the plan"), { target: { value: "research" } });
    await waitFor(() =>
      expect(screen.getByText("Review the plan").closest("article")?.querySelector("p")).toHaveTextContent("Research"),
    );
  });

  it("clears the history of a channel after the question, and shows the refusal while a task is going", async () => {
    Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
    render(() => (
      <ChannelWorkspace
        bots={[
          { id: "chief", name: "Chief" },
          { id: "research", name: "Research" },
        ]}
      />
    ));
    await fireEvent.click(await screen.findByRole("button", { name: "# Project" }));
    await screen.findByText("Prepare the release plan.");
    const open = async () => {
      const summary = screen.getByText("Channel history");
      const details = summary.closest("details");
      if (details && !details.open) await fireEvent.click(summary);
    };
    await open();
    await fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    await fireEvent.click(await screen.findByRole("button", { name: "Yes, clear" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/in progress or paused/));
    expect(screen.getByText("Prepare the release plan.")).toBeInTheDocument();

    // The demo has no way to stop a task, so the success path answers like the program does once nothing runs.
    const channels = mock.api.channels;
    if (!channels?.clearHistory) throw new Error("the mock has no clearHistory");
    vi.spyOn(channels, "clearHistory").mockImplementationOnce(async ({ channelId }) => {
      mock.emitAgentEvent({ type: "channel-history-cleared", channelId });
      return { channelId, removedMessages: 2, removedTasks: 3 };
    });
    await fireEvent.click(await screen.findByRole("button", { name: "Clear history" }));
    await fireEvent.click(await screen.findByRole("button", { name: "Yes, clear" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Removed 2 messages and 3 tasks."));
    await waitFor(() => expect(screen.queryByText("Prepare the release plan.")).not.toBeInTheDocument());
  });

  it("saves the history window of a channel through channels.update and keeps it after a reload of the list", async () => {
    Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
    const channels = mock.api.channels;
    if (!channels) throw new Error("the mock has no channels");
    const update = vi.spyOn(channels, "update");
    render(() => <ChannelWorkspace bots={[{ id: "chief", name: "Chief" }]} />);
    await fireEvent.click(await screen.findByRole("button", { name: "# Project" }));
    await screen.findByText("Prepare the release plan.");
    await fireEvent.click(screen.getByText("Channel history"));
    expect(await screen.findByRole("combobox", { name: "History window" })).toHaveValue("200");
    await fireEvent.change(screen.getByRole("combobox", { name: "History window" }), { target: { value: "50" } });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("History window saved."));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ historyWindow: 50 }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "History window" })).toHaveValue("50"));
    const saved = (await channels.list()).find((item) => item.title === "Project" || item.name === "project");
    expect(saved?.historyWindow).toBe(50);
  });

  it("creates through the contract and opens the new channel", async () => {
    const api = createMockOpenBot();
    const channels = api.api.channels;
    if (!channels) throw new Error("Missing mock channels");
    const template = (await channels.list())[0];
    const create = vi
      .spyOn(channels, "create")
      .mockResolvedValue({ ...template, id: "new-channel", name: "launch", title: "Launch" });
    Object.defineProperty(window, "openbot", { configurable: true, value: api.api });
    render(() => <ChannelWorkspace bots={[{ id: "chief", name: "Chief" }]} />);
    await fireEvent.click(screen.getByRole("button", { name: "New channel" }));
    await fireEvent.input(screen.getByLabelText("Channel name"), { target: { value: "launch" } });
    await fireEvent.input(screen.getByLabelText("Display title"), { target: { value: "Launch" } });
    await fireEvent.click(screen.getByRole("button", { name: "Chief" }));
    await fireEvent.change(screen.getByLabelText("Lead agent"), { target: { value: "chief" } });
    await fireEvent.click(screen.getByRole("button", { name: "Create channel" }));
    await screen.findByRole("heading", { name: "Launch" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "launch", leadBotId: "chief", memberBotIds: ["chief"] }),
    );
    api.dispose();
  });
  it("adds a replacement lead before removing the previous lead", async () => {
    const api = createMockOpenBot();
    const channels = api.api.channels;
    if (!channels) throw new Error("Missing mock channels");
    const channel = (await channels.list())[0];
    const calls: string[] = [];
    vi.spyOn(channels, "addMember").mockImplementation(async () => {
      calls.push("add");
      return channel;
    });
    vi.spyOn(channels, "setLead").mockImplementation(async () => {
      calls.push("lead");
      return channel;
    });
    vi.spyOn(channels, "removeMember").mockImplementation(async () => {
      calls.push("remove");
      return channel;
    });
    vi.spyOn(channels, "update").mockImplementation(async (input) => {
      calls.push("update");
      return { ...channel, title: input.title ?? channel.title };
    });
    Object.defineProperty(window, "openbot", { configurable: true, value: api.api });
    render(() => (
      <ChannelWorkspace
        bots={[
          { id: "chief", name: "Chief" },
          { id: "research", name: "Research" },
          { id: "new", name: "New lead" },
        ]}
      />
    ));
    await fireEvent.click(await screen.findByRole("button", { name: "# Project" }));
    await fireEvent.click(screen.getByRole("button", { name: "Edit channel" }));
    expect(screen.getByLabelText("Channel name")).toBeDisabled();
    await fireEvent.click(screen.getByRole("button", { name: "New lead" }));
    await fireEvent.change(screen.getByLabelText("Lead agent"), { target: { value: "new" } });
    await fireEvent.click(screen.getByRole("button", { name: "Chief" }));
    await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls).toEqual(["add", "lead", "remove", "update"]));
    api.dispose();
  });

  it("opens the editor for a sidebar creation request", async () => {
    Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
    const handled = vi.fn();
    render(() => <ChannelWorkspace bots={[]} createRequested onCreateHandled={handled} />);
    await screen.findByRole("dialog");
    expect(handled).toHaveBeenCalledOnce();
  });
});
