import { fireEvent, screen, within } from "@solidjs/testing-library";

/** Opens the sidebar "Create new" menu and picks an entry, the way a pointer does. */
export async function createNew(item: "New agent" | "New channel" | "Browse channels" | "New folder"): Promise<void> {
  const trigger = await screen.findByRole("button", { name: "Create new" });
  await fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
  const menu = await screen.findByRole("menu", { name: "Create new" });
  await fireEvent.pointerUp(within(menu).getByRole("menuitem", { name: item }), { button: 0 });
}

/** Turns "Show hidden" on or off through the sidebar filter menu (it used to be a switch above the list). */
export async function toggleShowHidden(): Promise<void> {
  const trigger = await screen.findByRole("button", { name: "Filter" });
  await fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
  const menu = await screen.findByRole("menu", { name: "Filter" });
  await fireEvent.pointerUp(within(menu).getByRole("menuitemcheckbox", { name: "Show hidden" }), { button: 0 });
}
