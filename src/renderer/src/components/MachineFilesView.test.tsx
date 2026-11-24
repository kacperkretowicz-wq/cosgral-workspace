import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockLibraryView } from "../../stories/mock-insights";
import { createMockMachineFiles } from "../../stories/mock-machine-files";
import { LibraryFilesView } from "./LibraryFilesView";
import { MachineFilesView } from "./MachineFilesView";

let machine = createMockMachineFiles();

beforeEach(() => {
  machine = createMockMachineFiles();
  Object.assign(window, {
    openbot: {
      machineFiles: machine,
      libraryView: createMockLibraryView(),
      library: { open: vi.fn().mockResolvedValue(undefined), choose: vi.fn().mockResolvedValue([]) },
      agent: { onEvent: () => () => {} },
    },
  });
});
afterEach(cleanup);

/** The button, once the first load is over (it is disabled while the view is busy). */
async function shareButton(): Promise<HTMLElement> {
  const button = screen.getByRole("button", { name: /Share a folder/ });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

it("is a tab of the Files view next to the library sources", async () => {
  render(() => <LibraryFilesView />);
  const tab = await screen.findByRole("button", { name: /This computer/ });
  await fireEvent.click(tab);
  expect(tab).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("button", { name: /All files/ })).not.toHaveAttribute("aria-current");
  expect(await screen.findByText("notatki.md")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Check what would go" })).not.toBeInTheDocument();
});

it("without a shared folder explains what sharing does", async () => {
  Object.assign(window.openbot, { machineFiles: createMockMachineFiles({ empty: true }) });
  render(() => <MachineFilesView />);
  expect(await screen.findByText("No shared folders.")).toBeInTheDocument();
  expect(screen.getByText(/files with keys or passwords stay hidden/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Stop sharing/ })).not.toBeInTheDocument();
});

it("goes into a folder, shows the path and goes back up", async () => {
  render(() => <MachineFilesView />);
  await fireEvent.click(await screen.findByRole("button", { name: "Open folder Faktury" }));
  expect(await screen.findByText("2026-10.pdf")).toBeInTheDocument();
  const path = screen.getByRole("navigation", { name: "Folder path" });
  expect(path).toHaveTextContent("Dokumenty");
  expect(path).toHaveTextContent("Faktury");
  await fireEvent.click(screen.getByRole("button", { name: /Up one folder/ }));
  expect(await screen.findByText("notatki.md")).toBeInTheDocument();
});

it("opens a file with its app and shows it in its folder", async () => {
  const open = vi.spyOn(machine, "open");
  render(() => <MachineFilesView />);
  await screen.findByText("notatki.md");
  const [first] = screen.getAllByRole("button", { name: "Open" });
  if (!first) throw new Error("no file row");
  await fireEvent.click(first);
  await waitFor(() =>
    expect(open).toHaveBeenCalledWith({ grantId: "grant-docs", relativePath: "brief-kampania.pdf", action: "open" }),
  );
  const [reveal] = screen.getAllByRole("button", { name: "Show in folder" });
  if (!reveal) throw new Error("no file row");
  await fireEvent.click(reveal);
  await waitFor(() => expect(open).toHaveBeenLastCalledWith(expect.objectContaining({ action: "reveal" })));
});

it("copies picked files to the library and says how many; folders cannot be picked", async () => {
  const copy = vi.spyOn(machine, "copyToLibrary");
  const onCopied = vi.fn();
  render(() => <MachineFilesView onCopied={onCopied} />);
  await screen.findByText("notatki.md");
  expect(screen.getByRole("button", { name: "Select Faktury" })).toBeDisabled();
  await fireEvent.click(screen.getByRole("button", { name: "Select notatki.md" }));
  await fireEvent.click(screen.getByRole("button", { name: "Select brief-kampania.pdf" }));
  expect(screen.getByText(/2 selected/)).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: /Copy to library/ }));
  await waitFor(() =>
    expect(copy).toHaveBeenCalledWith({ grantId: "grant-docs", relativePaths: ["notatki.md", "brief-kampania.pdf"] }),
  );
  expect(await screen.findByText("2 files copied to the library.")).toBeInTheDocument();
  expect(onCopied).toHaveBeenCalledOnce();
});

it("shares another folder and stops sharing it", async () => {
  render(() => <MachineFilesView />);
  await screen.findByText("notatki.md");
  await fireEvent.click(await shareButton());
  const select = await screen.findByRole("combobox", { name: "Shared folder" });
  await waitFor(() => expect(select).toHaveDisplayValue("Projekty"));
  const stop = screen.getByRole("button", { name: /Stop sharing/ });
  await waitFor(() => expect(stop).toBeEnabled());
  await fireEvent.click(stop);
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Shared folder" })).toHaveDisplayValue("Dokumenty"));
  expect(await machine.grants()).toHaveLength(1);
});

it("a sentence from the engine is shown when sharing is refused", async () => {
  vi.spyOn(machine, "grant").mockRejectedValue(new Error("That folder is too broad. Choose a folder inside it."));
  render(() => <MachineFilesView />);
  await screen.findByText("notatki.md");
  await fireEvent.click(await shareButton());
  expect(await screen.findByText("That folder is too broad. Choose a folder inside it.")).toBeInTheDocument();
});
