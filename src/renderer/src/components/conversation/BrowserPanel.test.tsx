import { fireEvent, render, screen } from "@solidjs/testing-library";
import { expect, it, vi } from "vitest";
import { BrowserPanel } from "./BrowserPanel";

const tab = (id: string, title: string, extra: Record<string, unknown> = {}) =>
  ({ id, title, url: `https://example.com/${id}`, loading: false, ...extra }) as never;

function setup(overrides: Partial<Parameters<typeof BrowserPanel>[0]> = {}) {
  const handlers = {
    onActivateTab: vi.fn(),
    onCloseTab: vi.fn(),
    onNewTab: vi.fn(),
    onReload: vi.fn(),
    onAddressInput: vi.fn(),
    onAddressSubmit: vi.fn(),
    onResize: vi.fn(),
    onResizeEnd: vi.fn(),
    onOpenSidePanel: vi.fn(),
  };
  render(() => (
    <BrowserPanel
      tabs={[tab("a", "Docs"), tab("b", "Pricing")]}
      activeTabId="a"
      controlled={false}
      controlForTab={() => undefined}
      controllerNameForTab={() => undefined}
      address="https://example.com/a"
      width={380}
      availableWidth={() => 1200}
      surfaceRef={() => {}}
      {...handlers}
      {...overrides}
    />
  ));
  return handlers;
}

it("shows the tabs and reports a new tab, a reload and a submitted address", () => {
  const handlers = setup();
  expect(screen.getByRole("tab", { name: "Docs" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Pricing" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "New browser tab" }));
  expect(handlers.onNewTab).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Reload page" }));
  expect(handlers.onReload).toHaveBeenCalledOnce();
  fireEvent.input(screen.getByLabelText("Browser address"), { target: { value: "https://example.org" } });
  expect(handlers.onAddressInput).toHaveBeenCalledWith("https://example.org");
  fireEvent.submit(screen.getByLabelText("Browser address").closest("form") as HTMLFormElement);
  expect(handlers.onAddressSubmit).toHaveBeenCalledOnce();
});

it("closes a tab with the Delete key", () => {
  const handlers = setup();
  fireEvent.keyDown(screen.getByRole("tab", { name: "Pricing" }), { key: "Delete" });
  expect(handlers.onCloseTab).toHaveBeenCalledWith("b");
});

it("says so when no page is open and names the agent that controls a tab", () => {
  setup({ tabs: [], activeTabId: undefined });
  expect(screen.getByText("Open a page")).toBeInTheDocument();
});

it("marks a tab controlled by an agent in its name", () => {
  setup({
    controlForTab: (item) => (item.id === "a" ? ({ phase: "acting", action: "click" } as never) : undefined),
    controllerNameForTab: () => "Chief",
    controlled: true,
  });
  expect(screen.getByRole("tab", { name: "Docs, controlled by Chief" })).toBeInTheDocument();
});
