import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { CosgralPanelState } from "./CosgralPanelState";

describe("CosgralPanelState", () => {
  it("renders an empty status with the shared panel class", () => {
    const { container } = render(() => (
      <CosgralPanelState kind="empty" title="No files found." detail="Try another filter." />
    ));
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("No files found.")).toBeInTheDocument();
    expect(container.querySelector(".cosgral-panel-state")?.getAttribute("data-kind")).toBe("empty");
    expect(screen.getByText("Try another filter.")).toBeInTheDocument();
  });

  it("renders an error alert with Retry", async () => {
    const onAction = vi.fn();
    render(() => <CosgralPanelState kind="error" title="counter locked" actionLabel="Retry" onAction={onAction} />);
    expect(screen.getByRole("alert")).toHaveTextContent("counter locked");
    await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onAction).toHaveBeenCalledOnce();
  });
});
