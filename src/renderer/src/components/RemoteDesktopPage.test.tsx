import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { RemoteDesktopToken } from "./RemoteDesktopPage";

describe("remote desktop token", () => {
  it("shows the one-time warning and lets the person dismiss it", async () => {
    const close = vi.fn();
    render(() => <RemoteDesktopToken token="demo-token" onClose={close} />);
    expect(screen.getByText(/shown only once/i)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "I saved the token" }));
    expect(close).toHaveBeenCalledOnce();
  });
});
