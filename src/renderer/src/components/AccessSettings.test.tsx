import type { AgentEvent } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { createMockAccess } from "../../stories/mock-access";
import { AccessSettings } from "./AccessSettings";

function setup() {
  let listener: ((event: AgentEvent) => void) | undefined;
  const api = createMockAccess((event) => listener?.(event));
  render(() => (
    <AccessSettings
      botId="demo"
      api={api}
      onEvent={(handler) => {
        listener = handler;
        return () => {
          listener = undefined;
        };
      }}
    />
  ));
  return api;
}
describe("Agent access UI", () => {
  it("keeps the old level until a Needs you approval is granted", async () => {
    const api = setup();
    const select = await screen.findByLabelText("Access level");
    fireEvent.change(select, { target: { value: "full" } });
    await screen.findByText(/Approval requested in Needs you/);
    expect((await api.get({ botId: "demo" })).level).toBe("working-folder");
    expect(select).toHaveValue("working-folder");
    const request = api.pendingRaises()[0];
    if (!request) throw new Error("Expected a raise card");
    api.allowRaise(request.requestId);
    await waitFor(() => expect(select).toHaveValue("full"));
  });
  it("saves excluded folders and explains that Full does not override them", async () => {
    const api = setup();
    await screen.findByLabelText("Access level");
    fireEvent.input(screen.getByLabelText("Excluded folders"), { target: { value: "C:/Private" } });
    await waitFor(() => expect(screen.getByLabelText("Excluded folders")).toHaveValue("C:/Private"));
    fireEvent.submit(
      screen.getByRole("button", { name: "Save folder rules" }).closest("form") ??
        screen.getByLabelText("Excluded folders"),
    );
    await screen.findByText("Folder rules saved.");
    expect((await api.get({ botId: "demo" })).excludedFolders).toEqual(["C:/Private"]);
    expect(screen.getByText(/Computer Use and the camera ask/)).toBeTruthy();
  });
  it("shows access-denied with its readable reason", async () => {
    const api = setup();
    await screen.findByLabelText("Access level");
    api.deny({
      botId: "demo",
      threadId: null,
      kind: "file-change",
      reason: "excluded",
      path: null,
      message: "The folder is excluded.",
    });
    await screen.findByRole("alert");
    expect(screen.getByText("Access denied: The folder is excluded.")).toBeTruthy();
  });
});
