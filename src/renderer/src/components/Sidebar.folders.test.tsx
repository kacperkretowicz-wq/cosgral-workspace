import type { CentralAuthUser, SidebarFolder, SidebarLayout } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import {
  STORY_AGENT_STATUS,
  STORY_APP_INFO,
  STORY_BOTS,
  STORY_UPDATE_STATUS,
  STORY_USAGE,
} from "../../stories/fixtures";
import { Sidebar } from "./Sidebar";
import type { SidebarFolderActions } from "./SidebarFolders";

const account: CentralAuthUser = { id: "user-1", email: "person@example.com", name: "Owner", avatarUrl: null };
const AT = "2026-11-12T10:00:00.000Z";

function folder(id: string, name: string, parentId: string | null, position = 0, collapsed = false): SidebarFolder {
  return { id, name, parentId, position, collapsed, createdAt: AT, updatedAt: AT };
}

function actionsMock(): SidebarFolderActions {
  return {
    createFolder: vi.fn(async () => undefined),
    renameFolder: vi.fn(async () => undefined),
    setFolderCollapsed: vi.fn(async () => undefined),
    duplicateFolder: vi.fn(async () => undefined),
    deleteFolder: vi.fn(async () => undefined),
    moveFolder: vi.fn(async () => undefined),
    moveAgent: vi.fn(async () => undefined),
  };
}

const layout: SidebarLayout = {
  folders: [folder("work", "Work", null, 0), folder("clients", "Clients", "work", 0), folder("home", "Home", null, 1)],
  placements: [
    { itemKind: "agent", itemId: "research", folderId: "work", position: 0 },
    { itemKind: "agent", itemId: "sales", folderId: "clients", position: 0 },
  ],
};

function renderSidebar(props: { layout?: SidebarLayout; actions?: SidebarFolderActions; compact?: boolean } = {}) {
  return render(() => (
    <Sidebar
      serverName="Local"
      bots={STORY_BOTS}
      activeBotId="chief"
      people={[]}
      directThreads={[]}
      activeDirectMemberId={null}
      account={account}
      appInfo={STORY_APP_INFO}
      agentStatus={STORY_AGENT_STATUS}
      accountUsage={STORY_USAGE}
      updateStatus={STORY_UPDATE_STATUS}
      agentStates={{}}
      layout={props.layout}
      folderActions={props.actions}
      onSelectBot={vi.fn()}
      onSelectPerson={vi.fn()}
      onCreateBot={vi.fn()}
      onEditBot={vi.fn()}
      onDeleteBot={async () => undefined}
      onRefreshUsage={async () => STORY_USAGE}
      onUpdateAction={async () => undefined}
      onUpdateAccountAvatar={async () => undefined}
      onLogout={async () => undefined}
      onOpenExternal={async () => undefined}
      onOpenPermissions={vi.fn()}
      compact={props.compact ?? false}
      onCollapse={vi.fn()}
      onExpand={vi.fn()}
    />
  ));
}

/** Names of the list rows from top to bottom: folders by name, agents by their accessible name's first words. */
function listOrder(): string[] {
  const list = screen.getByRole("navigation", { name: "Chat list" });
  return [...list.querySelectorAll<HTMLElement>(".folder-row, .agent-row")].map((row) =>
    row.classList.contains("folder-row")
      ? `folder:${row.querySelector(".folder-row-name")?.textContent}`
      : `agent:${row.querySelector("strong")?.textContent}`,
  );
}

/** The pointer-up shortcut used in these tests leaves the menu open, so dismiss leftovers first. */
function closeOpenMenus() {
  for (const menu of document.querySelectorAll<HTMLElement>("[role=menu][data-expanded]")) {
    fireEvent.keyDown(menu, { key: "Escape" });
  }
}

function openMenu(element: HTMLElement) {
  closeOpenMenus();
  const rect = element.getBoundingClientRect();
  fireEvent.contextMenu(element, { clientX: rect.left + 4, clientY: rect.top + 4 });
}

/** Kobalte leaves closed menus mounted in jsdom (no animation end), so only take an open one. */
async function latestMenu(name: string): Promise<HTMLElement> {
  return waitFor(() => {
    const menus = [...document.querySelectorAll<HTMLElement>("[role=menu][data-expanded]")].filter(
      (menu) => menu.getAttribute("aria-label") === name,
    );
    const menu = menus.at(-1);
    if (!menu) throw new Error(`No ${name} menu`);
    return menu;
  });
}

async function chooseFolderAction(folderName: string, action: string) {
  openMenu(screen.getByRole("button", { name: new RegExp(`^${folderName}, folder`) }));
  const menu = await latestMenu("Folder actions");
  await fireEvent.pointerUp(within(menu).getByRole("menuitem", { name: action }), { button: 0 });
}

describe("Sidebar folders", () => {
  it("draws folders above agents at every level and indents what is inside", () => {
    renderSidebar({ layout, actions: actionsMock() });
    expect(listOrder()).toEqual([
      "folder:Work",
      "folder:Clients",
      "agent:Sales Outbound",
      "agent:Research",
      "folder:Home",
      "agent:Chief",
    ]);
    const research = screen.getByRole("button", { name: /^Research, Research partner/ });
    const sales = screen.getByRole("button", { name: /^Sales Outbound, Outbound specialist/ });
    const chief = screen.getByRole("button", { name: /^Chief, Chief of staff/ });
    expect(research.style.getPropertyValue("--folder-level")).toBe("1");
    expect(sales.style.getPropertyValue("--folder-level")).toBe("2");
    expect(chief.style.getPropertyValue("--folder-level")).toBe("");
  });

  it("keeps the list flat without a layout, and in compact mode", () => {
    const flat = renderSidebar();
    expect(listOrder()).toEqual(["agent:Chief", "agent:Research", "agent:Sales Outbound"]);
    expect(screen.queryByRole("button", { name: "New folder" })).not.toBeInTheDocument();
    flat.unmount();

    renderSidebar({ layout, actions: actionsMock(), compact: true });
    expect(listOrder()).toEqual(["agent:Chief", "agent:Research", "agent:Sales Outbound"]);
  });

  it("shows how many agents each folder holds and whether it is open", () => {
    renderSidebar({ layout, actions: actionsMock() });
    const work = screen.getByRole("button", { name: "Work, folder, 2 agents" });
    expect(work).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Home, folder, 0 agents" })).toBeInTheDocument();
  });

  it("hides what is inside a collapsed folder", () => {
    const collapsed: SidebarLayout = {
      ...layout,
      folders: layout.folders.map((item) => (item.id === "work" ? { ...item, collapsed: true } : item)),
    };
    renderSidebar({ layout: collapsed, actions: actionsMock() });
    expect(listOrder()).toEqual(["folder:Work", "folder:Home", "agent:Chief"]);
    expect(screen.getByRole("button", { name: "Work, folder, 2 agents" })).toHaveAttribute("aria-expanded", "false");
  });

  it("collapses and expands from the chevron row", async () => {
    const actions = actionsMock();
    renderSidebar({ layout, actions });
    await fireEvent.click(screen.getByRole("button", { name: "Work, folder, 2 agents" }));
    expect(actions.setFolderCollapsed).toHaveBeenCalledWith("work", true);
  });

  it("opens every folder that holds a match while searching, and drops the others", async () => {
    const collapsed: SidebarLayout = {
      ...layout,
      folders: layout.folders.map((item) => (item.id === "work" ? { ...item, collapsed: true } : item)),
    };
    renderSidebar({ layout: collapsed, actions: actionsMock() });
    await fireEvent.input(screen.getByRole("searchbox", { name: "Search chats" }), { target: { value: "sales" } });
    expect(listOrder()).toEqual(["folder:Work", "folder:Clients", "agent:Sales Outbound"]);
  });

  it("creates a folder at the top level from the header button", async () => {
    const actions = actionsMock();
    renderSidebar({ layout, actions });
    await fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    const dialog = await screen.findByRole("dialog", { name: "New folder" });
    await fireEvent.input(within(dialog).getByRole("textbox", { name: "Folder name" }), {
      target: { value: "Ops" },
    });
    await fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(actions.createFolder).toHaveBeenCalledWith("Ops", null));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New folder" })).not.toBeInTheDocument());
  });

  it("creates a subfolder from the folder menu", async () => {
    const actions = actionsMock();
    renderSidebar({ layout, actions });
    await chooseFolderAction("Work", "New subfolder");
    const dialog = await screen.findByRole("dialog", { name: "New folder" });
    expect(dialog).toHaveTextContent("Inside Work.");
    await fireEvent.input(within(dialog).getByRole("textbox", { name: "Folder name" }), { target: { value: "Ops" } });
    await fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(actions.createFolder).toHaveBeenCalledWith("Ops", "work"));
  });

  it("renames a folder from the folder menu, starting from its current name", async () => {
    const actions = actionsMock();
    renderSidebar({ layout, actions });
    await chooseFolderAction("Home", "Rename");
    const dialog = await screen.findByRole("dialog", { name: "Rename folder" });
    const input = within(dialog).getByRole("textbox", { name: "Folder name" });
    expect(input).toHaveValue("Home");
    await fireEvent.input(input, { target: { value: "Personal" } });
    await fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(actions.renameFolder).toHaveBeenCalledWith("home", "Personal"));
  });

  it("duplicates a folder from the folder menu", async () => {
    const actions = actionsMock();
    renderSidebar({ layout, actions });
    await chooseFolderAction("Work", "Duplicate");
    await waitFor(() => expect(actions.duplicateFolder).toHaveBeenCalledWith("work"));
  });

  it("deletes a folder only after confirming, and says what happens to its contents", async () => {
    const actions = actionsMock();
    renderSidebar({ layout, actions });
    await chooseFolderAction("Home", "Delete folder");
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Only the folder is removed. Its agents and subfolders move up one level.");
    expect(actions.deleteFolder).not.toHaveBeenCalled();
    await fireEvent.click(within(dialog).getByRole("button", { name: "Delete folder" }));
    await waitFor(() => expect(actions.deleteFolder).toHaveBeenCalledWith("home"));
  });
  it("shows why a change failed and keeps the dialog open", async () => {
    const actions = actionsMock();
    actions.createFolder = vi.fn(async () => {
      throw new Error("Folders nest at most 5 levels.");
    });
    renderSidebar({ layout, actions });
    await fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    const dialog = await screen.findByRole("dialog", { name: "New folder" });
    await fireEvent.input(within(dialog).getByRole("textbox", { name: "Folder name" }), { target: { value: "Ops" } });
    await fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Folders nest at most 5 levels.");
    expect(screen.getByRole("dialog", { name: "New folder" })).toBeInTheDocument();
  });

  it("shows a failed collapse above the list", async () => {
    const actions = actionsMock();
    actions.setFolderCollapsed = vi.fn(async () => {
      throw new Error("This folder no longer exists.");
    });
    renderSidebar({ layout, actions });
    await fireEvent.click(screen.getByRole("button", { name: "Work, folder, 2 agents" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This folder no longer exists.");
  });

  it("does not offer a subfolder below the fifth level", async () => {
    const chain: SidebarLayout = {
      folders: [
        folder("l1", "L1", null),
        folder("l2", "L2", "l1"),
        folder("l3", "L3", "l2"),
        folder("l4", "L4", "l3"),
        folder("l5", "L5", "l4"),
      ],
      placements: [],
    };
    renderSidebar({ layout: chain, actions: actionsMock() });
    openMenu(screen.getByRole("button", { name: /^L5, folder/ }));
    const menu = await latestMenu("Folder actions");
    expect(within(menu).getByRole("menuitem", { name: "New subfolder" })).toHaveAttribute("aria-disabled", "true");
  });

  it("moves an agent from its menu into a folder", async () => {
    const actions = actionsMock();
    renderSidebar({ layout, actions });
    openMenu(screen.getByRole("button", { name: /^Chief, Chief of staff/ }));
    const menu = await latestMenu("Agent actions");
    await fireEvent.pointerUp(within(menu).getByRole("menuitem", { name: "Move to…" }), { button: 0 });
    const dialog = await screen.findByRole("dialog", { name: "Move Chief to…" });
    expect(within(dialog).getByRole("button", { name: /Top level/ })).toBeDisabled();
    await fireEvent.click(within(dialog).getByRole("button", { name: "Clients" }));
    await waitFor(() => expect(actions.moveAgent).toHaveBeenCalledWith("chief", "clients"));
  });

  it("moves an agent back to the top level", async () => {
    const actions = actionsMock();
    renderSidebar({ layout, actions });
    openMenu(screen.getByRole("button", { name: /^Research, Research partner/ }));
    const menu = await latestMenu("Agent actions");
    await fireEvent.pointerUp(within(menu).getByRole("menuitem", { name: "Move to…" }), { button: 0 });
    const dialog = await screen.findByRole("dialog", { name: "Move Research to…" });
    expect(within(dialog).getByRole("button", { name: /^Work/ })).toBeDisabled();
    await fireEvent.click(within(dialog).getByRole("button", { name: /Top level/ }));
    await waitFor(() => expect(actions.moveAgent).toHaveBeenCalledWith("research", null));
  });
  it("moves a folder into another folder, but not into its own subfolders", async () => {
    const actions = actionsMock();
    renderSidebar({ layout, actions });
    await chooseFolderAction("Work", "Move to…");
    const dialog = await screen.findByRole("dialog", { name: "Move Work to…" });
    expect(within(dialog).queryByRole("button", { name: "Clients" })).not.toBeInTheDocument();
    await fireEvent.click(within(dialog).getByRole("button", { name: "Home" }));
    await waitFor(() => expect(actions.moveFolder).toHaveBeenCalledWith("work", "home"));
  });

  it("has no Move to… and no folder menu without actions", async () => {
    renderSidebar({ layout });
    expect(screen.queryByRole("button", { name: "New folder" })).not.toBeInTheDocument();
    openMenu(screen.getByRole("button", { name: /^Chief, Chief of staff/ }));
    const menu = await latestMenu("Agent actions");
    expect(within(menu).queryByRole("menuitem", { name: "Move to…" })).not.toBeInTheDocument();
  });
});
