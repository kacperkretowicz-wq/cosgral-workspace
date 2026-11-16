import type { AgentEvent, SpaceList } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockSpaces } from "../../stories/mock-spaces";
import { SpacesManager, SpacesRail } from "./Spaces";

afterEach(() => vi.unstubAllGlobals());

async function setup() {
  const api = createMockSpaces(() => {});
  const initial = await api.create({ name: "Client A" });
  const switchSpace = vi.spyOn(api, "switch");
  const remove = vi.spyOn(api, "delete");
  render(() => {
    const [list, setList] = createSignal<SpaceList>(initial);
    return <SpacesManager api={api} list={list()} onChange={setList} />;
  });
  return { api, switchSpace, remove };
}
describe("Client spaces UI", () => {
  it("shows the running space in the rail until a restart completes", async () => {
    let listener: ((event: AgentEvent) => void) | undefined;
    const api = createMockSpaces((event) => listener?.(event));
    const created = await api.create({ name: "Client A" });
    const id = created.spaces.find((space) => !space.main)?.id ?? "";
    vi.stubGlobal("openbot", {
      spaces: api,
      agent: {
        onEvent: (handler: (event: AgentEvent) => void) => {
          listener = handler;
          return () => {
            listener = undefined;
          };
        },
      },
    });
    render(() => <SpacesRail />);
    await screen.findByRole("button", { name: "Client space: Main. Manage spaces" });
    await api.switch({ id, confirm: true });
    expect(screen.getByRole("button", { name: "Client space: Main. Manage spaces" })).toBeTruthy();
    api.simulate.restarted();
    await screen.findByRole("button", { name: "Client space: Client A. Manage spaces" });
  });
  it("requires a restart confirmation before switching", async () => {
    const { switchSpace } = await setup();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Client A" }));
    expect(switchSpace).not.toHaveBeenCalled();
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Restart and switch" }));
    await waitFor(() => expect(switchSpace).toHaveBeenCalledWith({ id: expect.any(String), confirm: true }));
  });
  it("protects Main and allows cancelling deletion", async () => {
    const { remove } = await setup();
    expect(screen.queryByRole("button", { name: "Delete Main" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rename Main" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete Client A" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete Client A" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(remove).toHaveBeenCalledOnce());
  });
  it("creates, renames, archives and restores without a restart", async () => {
    const { api, switchSpace } = await setup();
    fireEvent.input(screen.getByLabelText("Space name"), { target: { value: "Client B" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Create space" })).not.toBeDisabled());
    fireEvent.submit(screen.getByRole("form", { name: "Create space" }));
    await screen.findByRole("heading", { name: "Client B" });
    fireEvent.click(screen.getByRole("button", { name: "Rename Client B" }));
    fireEvent.input(await screen.findByLabelText("New space name"), { target: { value: "Client C" } });
    await waitFor(() => expect(screen.getByLabelText("New space name")).toHaveValue("Client C"));
    fireEvent.submit(screen.getByRole("form", { name: "Rename space" }));
    await screen.findByRole("heading", { name: "Client C" });
    fireEvent.click(screen.getByRole("button", { name: "Archive Client C" }));
    await screen.findByRole("button", { name: "Restore Client C" });
    expect(screen.queryByRole("button", { name: "Switch to Client C" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Restore Client C" }));
    await screen.findByRole("button", { name: "Switch to Client C" });
    expect(switchSpace).not.toHaveBeenCalled();
    expect((await api.list()).runningId).toBe("main");
  });
  it("rejects reserved and duplicate names", async () => {
    await setup();
    fireEvent.input(screen.getByLabelText("Space name"), { target: { value: "Fresh client" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Create space" })).not.toBeDisabled());
    fireEvent.input(screen.getByLabelText("Space name"), { target: { value: "Main" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Create space" })).toBeDisabled());
    fireEvent.input(screen.getByLabelText("Space name"), { target: { value: "client a" } });
    expect(screen.getByRole("button", { name: "Create space" })).toBeDisabled();
  });
  it("keeps the confirmation open when deletion is refused", async () => {
    const { api, remove } = await setup();
    remove.mockRejectedValueOnce(new Error("Space is busy."));
    fireEvent.click(screen.getByRole("button", { name: "Delete Client A" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(screen.getAllByText("Space is busy.").length).toBeGreaterThan(0));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect((await api.list()).spaces.length).toBe(2);
  });
  it("loads the selected space description", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "Details for Client A" }));
    await screen.findByRole("region", { name: "Space details" });
    expect(screen.getByText(/Separate data folder/)).toBeTruthy();
  });
});
