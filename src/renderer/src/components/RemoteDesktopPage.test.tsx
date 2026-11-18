import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockOpenBot } from "../../stories/mock-openbot";
import { setLanguage } from "../i18n";
import { RemoteDesktopPage, RemoteDesktopSafetyBanner, RemoteDesktopToken } from "./RemoteDesktopPage";

afterEach(() => {
  cleanup();
  setLanguage("en");
});

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

describe("remote desktop in Polish", () => {
  it("speaks Polish on the token card, the banner and the whole page", async () => {
    setLanguage("pl");
    render(() => <RemoteDesktopToken token="demo-token" onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Zapisz ten token" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zapisałem token" })).toBeInTheDocument();
    cleanup();
    render(() => <RemoteDesktopSafetyBanner count={1} onStop={vi.fn()} />);
    expect(screen.getByText("Zdalny widz jest połączony")).toBeInTheDocument();
    cleanup();

    const mock = createMockOpenBot();
    Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
    render(() => <RemoteDesktopPage />);
    expect(await screen.findByRole("heading", { name: "Zdalny pulpit" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Udostępnij ten komputer" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Połącz z innym komputerem" })).toBeInTheDocument();
    expect(screen.getByText("Stan: bezczynne")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Włącz udostępnianie" })).toBeInTheDocument();
    mock.dispose();
  });
});
