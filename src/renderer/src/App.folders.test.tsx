import type { SidebarFolder, SidebarLayout } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMockOpenBot, type MockOpenBotControls, type MockOpenBotOptions } from "../stories/mock-openbot";
import { App } from "./App";

let mock: MockOpenBotControls | undefined;

function controls(): MockOpenBotControls {
  if (!mock) throw new Error("Mount the app first.");
  return mock;
}

function mountApp(options: MockOpenBotOptions = {}) {
  mock = createMockOpenBot(options);
  Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
  return render(() => <App />);
}

const AT = "2026-11-12T10:00:00.000Z";

function folder(id: string, name: string, parentId: string | null, position = 0, collapsed = false): SidebarFolder {
  return { id, name, parentId, position, collapsed, createdAt: AT, updatedAt: AT };
}

const layout: SidebarLayout = {
  folders: [folder("work", "Work", null)],
  placements: [{ itemKind: "agent", itemId: "research", folderId: "work", position: 0 }],
};

function folderNames(): string[] {
  return [...document.querySelectorAll(".folder-row-name")].map((name) => name.textContent ?? "");
}

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
});

afterEach(() => {
  mock?.dispose();
  mock = undefined;
});

describe("App sidebar folders", () => {
  it("loads the saved folders when the window starts", async () => {
    mountApp({ sidebarLayout: layout });
    expect(await screen.findByRole("button", { name: "Work, folder, 1 agent" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: /^Research, Research partner/ })).toBeInTheDocument();
  });

  it("keeps the list flat when there are no folders yet", async () => {
    mountApp();
    await screen.findByRole("heading", { name: "Chief" });
    expect(folderNames()).toEqual([]);
    expect(await screen.findByRole("button", { name: "New folder" })).toBeInTheDocument();
  });

  it("follows sidebar-layout-changed events from another window", async () => {
    mountApp({ sidebarLayout: layout });
    await screen.findByRole("button", { name: "Work, folder, 1 agent" });
    controls().emitSidebarLayout({
      folders: [folder("work", "Work", null), folder("home", "Home", null, 1)],
      placements: [],
    });
    await waitFor(() => expect(folderNames()).toEqual(["Work", "Home"]));
    controls().emitSidebarLayout({ folders: [], placements: [] });
    await waitFor(() => expect(folderNames()).toEqual([]));
  });

  it("creates a folder through the backend and shows it", async () => {
    mountApp();
    await fireEvent.click(await screen.findByRole("button", { name: "New folder" }));
    const dialog = await screen.findByRole("dialog", { name: "New folder" });
    await fireEvent.input(within(dialog).getByRole("textbox", { name: "Folder name" }), {
      target: { value: "Clients" },
    });
    await fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(folderNames()).toEqual(["Clients"]));
  });

  it("collapses a folder and keeps it collapsed after the window reloads", async () => {
    const first = mountApp({ sidebarLayout: layout });
    await fireEvent.click(await screen.findByRole("button", { name: "Work, folder, 1 agent" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Work, folder, 1 agent" })).toHaveAttribute("aria-expanded", "false"),
    );
    expect(screen.queryByRole("button", { name: /^Research, Research partner/ })).not.toBeInTheDocument();

    // The same backend, a new window.
    first.unmount();
    render(() => <App />);
    expect(await screen.findByRole("button", { name: "Work, folder, 1 agent" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("button", { name: /^Research, Research partner/ })).not.toBeInTheDocument();
  });

  it("works without the optional sidebar API", async () => {
    mock = createMockOpenBot({ sidebarLayout: layout });
    Reflect.deleteProperty(mock.api, "sidebar");
    Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
    render(() => <App />);
    await screen.findByRole("heading", { name: "Chief" });
    expect(folderNames()).toEqual([]);
    expect(screen.queryByRole("button", { name: "New folder" })).not.toBeInTheDocument();
  });
});
