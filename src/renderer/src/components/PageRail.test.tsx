import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComingSoon } from "./ComingSoon";
import { PAGE_RAIL_ITEMS, PageRail } from "./PageRail";

describe("PageRail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it("lists every page in order and Settings last", () => {
    render(() => <PageRail active="agents" onSelect={vi.fn()} onOpenSettings={vi.fn()} />);
    const rail = screen.getByRole("navigation", { name: "Pages" });
    const names = within(rail)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual([
      "Agents",
      "Schedule",
      "Tasks",
      "Workflows",
      "Usage",
      "Library",
      "Marketplace",
      "Remote desktop",
      "Providers",
      "Phone",
      "Server settings",
      "Settings",
    ]);
    expect(PAGE_RAIL_ITEMS.map((item) => item.label)).toEqual(names.slice(0, -1));
  });

  it("marks the active page and selects another one", async () => {
    const onSelect = vi.fn();
    render(() => <PageRail active="agents" onSelect={onSelect} onOpenSettings={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Agents" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Schedule" })).not.toHaveAttribute("aria-current");
    await fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
    expect(onSelect).toHaveBeenCalledWith("schedule");
  });

  it("opens Settings without selecting a page", async () => {
    const onSelect = vi.fn();
    const onOpenSettings = vi.fn();
    render(() => <PageRail active="usage" onSelect={onSelect} onOpenSettings={onOpenSettings} />);
    await fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Settings" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Usage" })).toHaveAttribute("aria-current", "page");
  });
  it("moves overflow pages into More, keeps Settings visible and restores them on resize", async () => {
    let height = 240;
    const callbacks: Array<() => void> = [];
    const disconnect = vi.fn();
    vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
      return this.getAttribute("aria-label") === "Pages" ? height : 0;
    });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return new DOMRect(0, 0, 40, this.classList.contains("page-rail-tools") ? 51 : 40);
    });
    vi.stubGlobal(
      "ResizeObserver",
      class implements ResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(() => callback([], this));
        }
        observe() {}
        unobserve() {}
        disconnect() {
          disconnect();
        }
      },
    );
    const select = vi.fn();
    const view = render(() => <PageRail active="phone" onSelect={select} onOpenSettings={vi.fn()} />);
    const more = await screen.findByRole("button", { name: "More pages (current: Phone)" });
    expect(more).toHaveClass("page-rail-button-active");
    expect(screen.getByRole("button", { name: "Settings" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Phone" })).not.toBeInTheDocument();
    await fireEvent.pointerDown(more, { button: 0, pointerType: "mouse" });
    const menu = await screen.findByRole("menu", { name: "More pages" });
    await fireEvent.pointerUp(within(menu).getByRole("menuitem", { name: "Phone" }), { button: 0 });
    expect(select).toHaveBeenCalledWith("phone");
    height = 900;
    for (const resized of callbacks) resized();
    await waitFor(() => expect(screen.getByRole("button", { name: "Phone" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /^More pages/ })).not.toBeInTheDocument();
    view.unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});

describe("PageRail in a short window", () => {
  it("shows More pages at 400 px with 36 px buttons and keeps Settings", async () => {
    vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
      return this.getAttribute("aria-label") === "Pages" ? 400 : 0;
    });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.classList.contains("page-rail-tools")) return new DOMRect(0, 0, 36, 46);
      return new DOMRect(0, 0, 36, this.classList.contains("page-rail-button") ? 36 : 0);
    });
    vi.stubGlobal(
      "ResizeObserver",
      class implements ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    render(() => <PageRail active="agents" onSelect={vi.fn()} onOpenSettings={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "More pages" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeVisible();
  });
});

describe("ComingSoon", () => {
  it("names the page and says it is coming soon", () => {
    render(() => <ComingSoon title="Workflows" />);
    const region = screen.getByRole("region", { name: "Workflows" });
    expect(within(region).getByRole("heading", { name: "Workflows" })).toBeInTheDocument();
    expect(within(region).getByText("Coming soon")).toBeInTheDocument();
  });
});
