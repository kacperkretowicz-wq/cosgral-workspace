import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { RemoteDesktopSafetyBanner, RemoteDesktopToken } from "./RemoteDesktopPage";

describe("remote desktop token", () => {
  it("shows the one-time warning and lets the person dismiss it", async () => {
    const close = vi.fn();
    render(() => <RemoteDesktopToken token="demo-token" onClose={close} />);
    expect(screen.getByText(/shown only once/i)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "I saved the token" }));
    expect(close).toHaveBeenCalledOnce();
  });
  it("offers a local stop while a viewer is connected", async () => {
    const stop = vi.fn();
    render(() => <RemoteDesktopSafetyBanner count={1} onStop={stop} />);
    await fireEvent.click(screen.getByRole("button", { name: "Stop all remote sessions" }));
    expect(stop).toHaveBeenCalledOnce();
  });
});
