import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { ChatRightPanelTabs, ChatSidePanelLauncher } from "./ChatSidePanelLauncher";

afterEach(cleanup);

it("offers Browser, Files, Agent settings and Voice openers", async () => {
  const onOpen = vi.fn();
  render(() => <ChatSidePanelLauncher onOpen={onOpen} />);
  expect(screen.getByRole("navigation", { name: "Chat side panels" })).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Open Browser" }));
  await fireEvent.click(screen.getByRole("button", { name: "Open Files" }));
  await fireEvent.click(screen.getByRole("button", { name: "Open Agent settings" }));
  await fireEvent.click(screen.getByRole("button", { name: "Open Voice" }));
  expect(onOpen.mock.calls.map((call) => call[0])).toEqual(["browser", "files", "settings", "voice"]);
});

it("disables Voice when a reason is given", async () => {
  const onOpen = vi.fn();
  render(() => (
    <ChatSidePanelLauncher
      onOpen={onOpen}
      voiceDisabledReason="Voice side panel needs engine support — not in this build yet."
    />
  ));
  const voice = screen.getByRole("button", { name: "Open Voice" });
  expect(voice).toBeDisabled();
  await fireEvent.click(voice);
  expect(onOpen).not.toHaveBeenCalled();
});

it("marks the active panel tab", async () => {
  const onSelect = vi.fn();
  render(() => <ChatRightPanelTabs active="settings" onSelect={onSelect} />);
  expect(screen.getByRole("button", { name: "Agent settings" })).toHaveAttribute("aria-current", "page");
  await fireEvent.click(screen.getByRole("button", { name: "Files" }));
  expect(onSelect).toHaveBeenCalledWith("files");
});

it("keeps launcher openers keyboard-focusable", () => {
  render(() => <ChatSidePanelLauncher onOpen={() => undefined} />);
  const browser = screen.getByRole("button", { name: "Open Browser" });
  browser.focus();
  expect(browser).toHaveFocus();
  expect(browser.tabIndex).toBeGreaterThanOrEqual(0);
});

it("in the header shows compact icon buttons for Files, Agent settings and Voice (Browser has its own header button)", async () => {
  const onOpen = vi.fn();
  render(() => <ChatSidePanelLauncher variant="header" onOpen={onOpen} />);
  const nav = screen.getByRole("navigation", { name: "Chat side panels" });
  expect(nav).toHaveClass("chat-header-panels");
  expect(screen.queryByRole("button", { name: "Open Browser" })).toBeNull();
  const files = screen.getByRole("button", { name: "Open Files" });
  expect(files).toHaveAttribute("title", "Open Files");
  expect(files.textContent?.trim()).toBe("");
  await fireEvent.click(files);
  await fireEvent.click(screen.getByRole("button", { name: "Open Agent settings" }));
  await fireEvent.click(screen.getByRole("button", { name: "Open Voice" }));
  expect(onOpen.mock.calls.map((call) => call[0])).toEqual(["files", "settings", "voice"]);
});
