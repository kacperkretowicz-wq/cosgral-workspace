import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { ChatRightPanelTabs, ChatSidePanelLauncher } from "./ChatSidePanelLauncher";

afterEach(cleanup);

it("offers Browser, Files and Agent settings openers, and no Voice", async () => {
  const onOpen = vi.fn();
  render(() => <ChatSidePanelLauncher onOpen={onOpen} />);
  expect(screen.getByRole("navigation", { name: "Chat side panels" })).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Open Browser" }));
  await fireEvent.click(screen.getByRole("button", { name: "Open Files" }));
  await fireEvent.click(screen.getByRole("button", { name: "Open Agent settings" }));
  expect(screen.queryByRole("button", { name: "Open Voice" })).toBeNull();
  expect(onOpen.mock.calls.map((call) => call[0])).toEqual(["browser", "files", "settings"]);
});

it("marks the active panel tab and has no Voice tab", async () => {
  const onSelect = vi.fn();
  render(() => <ChatRightPanelTabs active="settings" onSelect={onSelect} />);
  expect(screen.getByRole("button", { name: "Agent settings" })).toHaveAttribute("aria-current", "page");
  expect(screen.queryByRole("button", { name: "Voice" })).toBeNull();
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

it("in the header shows compact icon buttons for Files and Agent settings (Browser has its own header button)", async () => {
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
  expect(onOpen.mock.calls.map((call) => call[0])).toEqual(["files", "settings"]);
});
