import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockInstanceTransfer, type MockInstanceTransfer } from "../../stories/mock-instance-transfer";
import { InstanceTransferPanel } from "./InstanceTransferPanel";

let mock: MockInstanceTransfer;

function install(withApi = true) {
  Object.assign(window, { openbot: { instanceTransfer: withApi ? mock.transfer : undefined } });
}

beforeEach(() => {
  mock = createMockInstanceTransfer(() => undefined);
  install();
});
afterEach(cleanup);

const card = (title: string) => {
  const row = screen.getByText(title, { selector: "strong" }).closest("li");
  if (!(row instanceof HTMLElement)) throw new Error("no card");
  return within(row);
};

it("Import shows the three cards: a zip, Hermes (not available, with the reason) and another computer (go to Transfer)", async () => {
  const open = vi.fn();
  render(() => <InstanceTransferPanel mode="import" onOpenTransfer={open} />);
  expect(await screen.findByText("An agent export (.zip)", { selector: "strong" })).toBeInTheDocument();
  expect(card("Hermes Agent").getByText("Not available")).toBeInTheDocument();
  expect(
    card("Hermes Agent").getByText("Reading a Hermes folder is not supported in this version."),
  ).toBeInTheDocument();
  expect(card("An agent export (.zip)").getByRole("button", { name: "Choose a .zip file" })).toBeInTheDocument();
  await fireEvent.click(card("Another COSGRAL computer").getByRole("button", { name: "Open Transfer" }));
  expect(open).toHaveBeenCalledTimes(1);
});

it("a chosen file is only shown: agents to pick, a taken name is said to get a numbered copy, nothing changes until Import", async () => {
  mock.simulate.existingNames(["Chief"]);
  const apply = vi.spyOn(mock.transfer, "apply");
  render(() => <InstanceTransferPanel mode="import" />);
  await fireEvent.click(await screen.findByRole("button", { name: "Choose a .zip file" }));
  const preview = await screen.findByRole("group", { name: "What is in the file" });
  expect(within(preview).getByText(/From COSGRAL Workspace \(demo\)/)).toBeInTheDocument();
  expect(within(preview).getByText(/Nothing changes until you import/)).toBeInTheDocument();
  expect(
    within(preview).getByText(/This name exists here: a numbered copy is made, nothing is overwritten\./),
  ).toBeInTheDocument();
  expect(within(preview).getByText("Files of the Library are not moved by this version.")).toBeInTheDocument();
  expect(apply).not.toHaveBeenCalled();
});

it("imports only the chosen agents as new ones and reports what was made (routines paused)", async () => {
  mock.simulate.existingNames(["Chief"]);
  render(() => <InstanceTransferPanel mode="import" />);
  await fireEvent.click(await screen.findByRole("button", { name: "Choose a .zip file" }));
  await screen.findByRole("group", { name: "What is in the file" });
  await fireEvent.click(screen.getByRole("checkbox", { name: /Analyst/ }));
  await fireEvent.click(screen.getByRole("button", { name: "Import" }));
  const done = await screen.findByRole("status");
  expect(within(done).getByText("Imported 1 agents as new ones:")).toBeInTheDocument();
  expect(within(done).getByText("Chief (imported 2)")).toBeInTheDocument();
  expect(within(done).getByText(/The server settings were imported\./)).toBeInTheDocument();
  expect(within(done).getByText(/created paused/)).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "What is in the file" })).not.toBeInTheDocument();
});

it("Cancel drops the staged file and changes nothing; Import is off when nothing is chosen", async () => {
  const discard = vi.spyOn(mock.transfer, "discard");
  render(() => <InstanceTransferPanel mode="import" />);
  await fireEvent.click(await screen.findByRole("button", { name: "Choose a .zip file" }));
  await screen.findByRole("group", { name: "What is in the file" });
  await fireEvent.click(screen.getByRole("checkbox", { name: /Chief/ }));
  await fireEvent.click(screen.getByRole("checkbox", { name: /Analyst/ }));
  await fireEvent.click(screen.getByRole("checkbox", { name: /Also import the server settings/ }));
  expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(discard).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole("button", { name: "Choose a .zip file" })).toBeInTheDocument();
});

it("a closed file dialog leaves the page as it was", async () => {
  mock.simulate.nextFile(null);
  render(() => <InstanceTransferPanel mode="import" />);
  await fireEvent.click(await screen.findByRole("button", { name: "Choose a .zip file" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Choose a .zip file" })).toBeEnabled());
  expect(screen.queryByRole("group", { name: "What is in the file" })).not.toBeInTheDocument();
});

it("Transfer shows the three steps, the agents to export, and what is never moved", async () => {
  render(() => <InstanceTransferPanel mode="transfer" />);
  expect(await screen.findByText("Export from the old server")).toBeInTheDocument();
  expect(screen.getByText("Copy the .zip file")).toBeInTheDocument();
  expect(screen.getByText("Import into the new server")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /Chief/ })).toBeChecked();
  expect(screen.getByText(/2 skills, 3 memories, 1 routines/)).toBeInTheDocument();
  for (const item of ["API keys", "The Vault", "Chat history", "Files of the Library"]) {
    expect(screen.getByText(item)).toBeInTheDocument();
  }
});

it("exports the chosen agents and says what was saved; a closed save dialog says nothing was saved", async () => {
  const exportAgents = vi.spyOn(mock.transfer, "exportAgents");
  render(() => <InstanceTransferPanel mode="transfer" />);
  await screen.findByText("Export from the old server");
  await fireEvent.click(screen.getByRole("checkbox", { name: /Scout/ }));
  await fireEvent.click(screen.getByRole("button", { name: "Export to a .zip file" }));
  await waitFor(() =>
    expect(exportAgents).toHaveBeenCalledWith({ agentIds: ["demo-chief", "demo-writer"], includeSettings: true }),
  );
  expect(await screen.findByText(/Saved cosgral-transfer-demo\.zip \(3\.0 KB\), 2 agents\./)).toBeInTheDocument();

  mock.simulate.cancelNextExport();
  await waitFor(() => expect(screen.getByRole("button", { name: "Export to a .zip file" })).toBeEnabled());
  await fireEvent.click(screen.getByRole("button", { name: "Export to a .zip file" }));
  expect(await screen.findByText("Nothing was saved.")).toBeInTheDocument();
});

it("Export is off when no agent and no settings are chosen", async () => {
  render(() => <InstanceTransferPanel mode="transfer" />);
  await screen.findByText("Export from the old server");
  for (const name of [/Chief/, /Writer/, /Scout/, /Also export the server settings/]) {
    await fireEvent.click(screen.getByRole("checkbox", { name }));
  }
  expect(screen.getByRole("button", { name: "Export to a .zip file" })).toBeDisabled();
});

it("shows an error with Retry when the page cannot be read, and a note without the API", async () => {
  const spy = vi.spyOn(mock.transfer, "summary").mockRejectedValueOnce(new Error("The summary is locked."));
  render(() => <InstanceTransferPanel mode="transfer" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("The summary is locked.");
  await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Export from the old server")).toBeInTheDocument();
  expect(spy).toHaveBeenCalledTimes(2);
  cleanup();
  install(false);
  render(() => <InstanceTransferPanel mode="import" />);
  expect(screen.getByText("Import and Transfer are not available in this version.")).toBeInTheDocument();
});
