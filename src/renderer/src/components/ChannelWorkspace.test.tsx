import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
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
    await fireEvent.input(screen.getByLabelText("New message to channel lead"), {
      target: { value: "Check the dates" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Check the dates");
    await fireEvent.click(screen.getByRole("tab", { name: "Tasks" }));
    const task = screen.getByText("Review the plan").closest("article")!;
    await fireEvent.click(within(task).getByRole("button", { name: "Resume" }));
    await waitFor(() =>
      expect(within(screen.getByText("Review the plan").closest("article")!).getByText("Queued")).toBeInTheDocument(),
    );
    await fireEvent.change(screen.getByLabelText("Reassign Review the plan"), { target: { value: "research" } });
    await waitFor(() =>
      expect(screen.getByText("Review the plan").closest("article")?.querySelector("p")).toHaveTextContent("Research"),
    );
  });
});
