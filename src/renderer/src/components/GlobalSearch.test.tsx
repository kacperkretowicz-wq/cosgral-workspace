import type { SearchHit } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GlobalSearch } from "./GlobalSearch";

const channelHit: SearchHit = {
  kind: "channels",
  id: "ch-1",
  title: "Launch room",
  snippet: "Plan the launch",
  channelId: "ch-1",
};
const fileHit: SearchHit = { kind: "files", id: "f-1", title: "launch-plan.pdf", snippet: "" };
const query = vi.fn(async () => ({ q: "launch", hits: [channelHit, fileHit], truncated: false }));

beforeEach(() => {
  query.mockClear();
  Object.assign(window, { openbot: { search: { query } } });
});
afterEach(cleanup);

function mount(onSelectHit = vi.fn()) {
  render(() => (
    <GlobalSearch
      open={true}
      bots={[]}
      messagesByBot={{}}
      onOpenChange={vi.fn()}
      onSelectBot={vi.fn()}
      onSelectMessage={vi.fn()}
      onSelectHit={onSelectHit}
    />
  ));
  return onSelectHit;
}

it("offers a tab for each kind and asks the search API only for channels, files and routines", async () => {
  mount();
  for (const name of ["All", "Agents", "Channels", "Messages", "Files", "Routines"]) {
    expect(screen.getByRole("tab", { name })).toBeInTheDocument();
  }
  await fireEvent.input(screen.getByRole("combobox", { name: "Search COSGRAL" }), { target: { value: "launch" } });
  await waitFor(() =>
    expect(query).toHaveBeenCalledWith({ q: "launch", kinds: ["channels", "files", "routines"], limit: 10 }),
  );
});

it("filters hits by tab and opens a channel hit", async () => {
  const onSelectHit = mount();
  await fireEvent.input(screen.getByRole("combobox", { name: "Search COSGRAL" }), { target: { value: "launch" } });
  await waitFor(() => expect(query).toHaveBeenCalled());
  await fireEvent.click(screen.getByRole("tab", { name: "Channels" }));
  const option = await screen.findByRole("option", { name: /Launch room/ });
  expect(screen.queryByRole("option", { name: /launch-plan/ })).not.toBeInTheDocument();
  await fireEvent.click(option);
  expect(onSelectHit).toHaveBeenCalledWith(channelHit);
});

it("closes the whole search window with one Escape, even while the results are listed (seen in the real window)", async () => {
  const onOpenChange = vi.fn();
  render(() => (
    <GlobalSearch
      open={true}
      bots={[]}
      messagesByBot={{}}
      onOpenChange={onOpenChange}
      onSelectBot={vi.fn()}
      onSelectMessage={vi.fn()}
      onSelectHit={vi.fn()}
    />
  ));
  const input = screen.getByRole("combobox", { name: "Search COSGRAL" });
  await fireEvent.input(input, { target: { value: "launch" } });
  await waitFor(() => expect(query).toHaveBeenCalled());
  await fireEvent.keyDown(input, { key: "Escape" });
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it("closes with Escape while the focus is on a filter tab (Tab from the field; seen in the real window)", async () => {
  const onOpenChange = vi.fn();
  render(() => (
    <GlobalSearch
      open={true}
      bots={[]}
      messagesByBot={{}}
      onOpenChange={onOpenChange}
      onSelectBot={vi.fn()}
      onSelectMessage={vi.fn()}
      onSelectHit={vi.fn()}
    />
  ));
  const tab = screen.getByRole("tab", { name: "All" });
  tab.focus();
  await fireEvent.keyDown(tab, { key: "Escape" });
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
});

it("Tab from the filter tab goes back to the field instead of staying on the tab (seen in the real window)", async () => {
  mount();
  const input = screen.getByRole("combobox", { name: "Search COSGRAL" });
  const tab = screen.getByRole("tab", { name: "All" });
  tab.focus();
  await fireEvent.keyDown(tab, { key: "Tab" });
  await waitFor(() => expect(document.activeElement).toBe(input));
});
