import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockLibraryView } from "../../stories/mock-insights";
import { LibraryFilesView } from "./LibraryFilesView";

let view = createMockLibraryView();
const open = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  view = createMockLibraryView();
  open.mockClear();
  Object.assign(window, {
    openbot: {
      libraryView: view,
      library: { open, choose: vi.fn().mockResolvedValue([]) },
      agent: { onEvent: () => () => {} },
    },
  });
});
afterEach(cleanup);

it("lists files with counts and filters by origin", async () => {
  render(() => <LibraryFilesView />);
  const all = await screen.findByRole("button", { name: /All files/ });
  expect(all).toHaveAttribute("aria-current", "page");
  const page = await view.page({});
  expect(all).toHaveTextContent(String(page.counts.all));
  await fireEvent.click(screen.getByRole("button", { name: /Made by agents/ }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Made by agents/ })).toHaveAttribute("aria-current", "page"),
  );
});

it("picks files, deletes them and tells how much was freed", async () => {
  const spy = vi.spyOn(view, "deleteMany");
  render(() => <LibraryFilesView />);
  const picks = await screen.findAllByRole("button", { name: /^Select / });
  const enabled = picks.find((button) => !(button instanceof HTMLButtonElement && button.disabled));
  if (!enabled) throw new Error("no selectable file");
  await fireEvent.click(enabled);
  expect(await screen.findByText(/1 selected/)).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
  await waitFor(() => expect(spy).toHaveBeenCalledOnce());
  expect(await screen.findByText(/Deleted 1 files, freed/)).toBeInTheDocument();
});

it("shows what a clean-up would remove before removing it", async () => {
  const spy = vi.spyOn(view, "cleanup");
  render(() => <LibraryFilesView />);
  await screen.findByRole("button", { name: /All files/ });
  await fireEvent.click(screen.getByRole("button", { name: "Check what would go" }));
  await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true })));
  expect(spy).toHaveBeenCalledTimes(1);
});

it("opens a file through the single-file library API", async () => {
  render(() => <LibraryFilesView />);
  const buttons = await screen.findAllByRole("button", { name: "Open" });
  const first = buttons[0];
  if (!first) throw new Error("no file row");
  await fireEvent.click(first);
  await waitFor(() => expect(open).toHaveBeenCalledWith(expect.objectContaining({ action: "open" })));
});

it("says so without the contract", () => {
  Object.assign(window, { openbot: {} });
  render(() => <LibraryFilesView />);
  expect(screen.getByText("The file library is not available in this version.")).toBeInTheDocument();
});
