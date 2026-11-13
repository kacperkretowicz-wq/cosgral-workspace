import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { createMockOpenBot } from "../../stories/mock-openbot";
import { RoutinePanel } from "./RoutinePanel";
import { TablesPanel } from "./TablesPanel";

describe("W2 panels with mock API", () => {
  it("creates a webhook and shows its one-time secret", async () => {
    const mock = createMockOpenBot();
    Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
    const view = render(() => <RoutinePanel bots={[{ id: "chief", name: "Chief" }]} />);
    await screen.findByText("Weekly review");
    const form = within(screen.getByRole("region", { name: "Create routine" }));
    await fireEvent.input(form.getByLabelText("Routine name"), { target: { value: "Webhook demo" } });
    await fireEvent.input(form.getByLabelText("Instructions"), { target: { value: "Review event" } });
    await fireEvent.change(form.getByLabelText("Trigger"), { target: { value: "webhook" } });
    await fireEvent.click(form.getByRole("button", { name: "Create routine" }));
    await screen.findByText("whsec_DEMO_ONLY");
    await fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("whsec_DEMO_ONLY")).not.toBeInTheDocument();
    view.unmount();
    mock.dispose();
  });
  it("exposes row conflicts without losing the current row", async () => {
    const mock = createMockOpenBot();
    Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
    const view = render(() => <TablesPanel />);
    await screen.findByRole("option", { name: "Projects" });
    await fireEvent.change(screen.getByLabelText("Table"), { target: { value: "table-demo" } });
    await screen.findByText(/Launch/);
    await fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Mine" } });
    await mock.api.tables?.updateRow({
      tableId: "table-demo",
      rowId: "row-demo",
      expectedVersion: 1,
      values: { Name: "Theirs" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Save row" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Theirs"));
    await fireEvent.click(screen.getByRole("button", { name: "Apply my changes" }));
    await screen.findByText(/Mine/);
    view.unmount();
    mock.dispose();
  });
});
