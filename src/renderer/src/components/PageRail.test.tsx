import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { ComingSoon } from "./ComingSoon";
import { PAGE_RAIL_ITEMS, PageRail } from "./PageRail";

describe("PageRail", () => {
  it("lists every page in order and Settings last", () => {
    render(() => <PageRail active="agents" onSelect={vi.fn()} onOpenSettings={vi.fn()} />);
    const rail = screen.getByRole("navigation", { name: "Pages" });
    const names = within(rail)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["Agents", "Schedule", "Tasks", "Workflows", "Usage", "Library", "Marketplace", "Settings"]);
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
});

describe("ComingSoon", () => {
  it("names the page and says it is coming soon", () => {
    render(() => <ComingSoon title="Workflows" />);
    const region = screen.getByRole("region", { name: "Workflows" });
    expect(within(region).getByRole("heading", { name: "Workflows" })).toBeInTheDocument();
    expect(within(region).getByText("Coming soon")).toBeInTheDocument();
  });
});
