import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { ChannelView } from "./ChannelView";

describe("channel view", () => {
  it("labels a superseded note and a versioned result", () => {
    const base = {
      channelId: "c",
      taskId: "t",
      authorBotId: "a",
      replyToMessageId: null,
      createdAt: "2026-11-13T00:00:00Z",
    };
    render(() => (
      <ChannelView
        channel={{
          id: "c",
          name: "team",
          title: "Team",
          instructions: "",
          leadBotId: "a",
          memberBotIds: ["a"],
          isolated: true,
          archived: false,
          createdAt: "",
          updatedAt: "",
        }}
        bots={[{ id: "a", name: "Alex" }]}
        messages={[
          { ...base, id: "n", kind: "note", text: "Earlier plan", resultVersion: null, superseded: true },
          { ...base, id: "r", kind: "result", text: "Finished", resultVersion: 2, superseded: false },
        ]}
        tasks={[]}
        onSend={vi.fn()}
        onResume={vi.fn()}
        onReassign={vi.fn()}
      />
    ));
    expect(screen.getByText(/Superseded/)).toBeInTheDocument();
    expect(screen.getByText(/version 2/)).toBeInTheDocument();
  });
  it("shows a paused task and resumes it through the supplied action", async () => {
    const resume = vi.fn();
    render(() => (
      <ChannelView
        channel={{
          id: "c",
          name: "team",
          title: "Team",
          instructions: "Work together",
          leadBotId: "a",
          memberBotIds: ["a"],
          isolated: true,
          archived: false,
          createdAt: "",
          updatedAt: "",
        }}
        bots={[{ id: "a", name: "Alex" }]}
        messages={[]}
        tasks={[
          {
            id: "t",
            channelId: "c",
            title: "Review",
            state: "paused",
            ownerBotId: "a",
            requestMessageId: "m",
            resultMessageId: null,
            parentTaskId: null,
            dependencyTaskIds: [],
            resourceKey: null,
            assignmentCount: 1,
            archivedAt: null,
            createdAt: "",
            updatedAt: "",
          },
        ]}
        onSend={vi.fn()}
        onResume={resume}
        onReassign={vi.fn()}
      />
    ));
    await fireEvent.click(screen.getByRole("tab", { name: "Tasks" }));
    expect(screen.getByText("Paused")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(resume).toHaveBeenCalledWith("t");
  });
});
