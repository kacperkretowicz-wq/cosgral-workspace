// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  applyKeepBackground,
  BackgroundMode,
  type BackgroundModeDeps,
  installBackgroundMode,
  shouldHideMainWindowOnClose,
  shouldHideOnClose,
  type TrayLike,
  type TrayMenuItem,
  trayMenuItems,
} from "./background-mode";

const noMenu: TrayMenuItem[] = [];

function fakeTray() {
  const listeners = new Map<string, () => void>();
  const tray = {
    tip: "",
    menu: noMenu,
    destroyed: 0,
    setToolTip(text: string) {
      tray.tip = text;
    },
    setContextMenu(menu: unknown) {
      tray.menu = Array.isArray(menu) ? menu : noMenu;
    },
    on(event: "click" | "double-click", listener: () => void) {
      listeners.set(event, listener);
    },
    destroy() {
      tray.destroyed += 1;
    },
  };
  return { tray: tray satisfies TrayLike, listeners };
}

function setup(overrides: Partial<BackgroundModeDeps> = {}) {
  const made: ReturnType<typeof fakeTray>[] = [];
  const shown = vi.fn();
  const quit = vi.fn();
  const deps: BackgroundModeDeps = {
    platform: "win32",
    createTray: () => {
      const next = fakeTray();
      made.push(next);
      return next.tray;
    },
    buildMenu: (items: TrayMenuItem[]) => items,
    showMainWindow: shown,
    quit,
    ...overrides,
  };
  return { mode: new BackgroundMode(deps), made, shown, quit };
}

describe("background mode (BE-W)", () => {
  it("hides the window on close only when the setting is on, the tray icon exists and the program is not quitting", () => {
    const base = { platform: "win32" as const, keepBackground: true, hasTray: true, isQuitting: false };
    expect(shouldHideOnClose(base)).toBe(true);
    expect(shouldHideOnClose({ ...base, keepBackground: false })).toBe(false);
    expect(shouldHideOnClose({ ...base, hasTray: false })).toBe(false);
    expect(shouldHideOnClose({ ...base, isQuitting: true })).toBe(false);
    // macOS has its own rule (it always hides); this one never answers for it.
    expect(shouldHideOnClose({ ...base, platform: "darwin" })).toBe(false);
    expect(shouldHideOnClose({ ...base, platform: "linux" })).toBe(true);
  });

  it("a close ends the program as before until the setting is on", () => {
    const { mode, made } = setup();
    expect(mode.active).toBe(false);
    expect(mode.shouldHideOnClose(false)).toBe(false);
    expect(made).toHaveLength(0);
  });

  it("makes one tray icon with a tooltip and a menu (Open, separator, Quit) and hides on close", () => {
    const { mode, made, shown, quit } = setup();
    expect(mode.apply(true, "en")).toBe(true);
    expect(mode.apply(true, "en")).toBe(true); // repeatable: no second icon
    expect(made).toHaveLength(1);
    expect(mode.active).toBe(true);
    expect(mode.shouldHideOnClose(false)).toBe(true);
    expect(mode.shouldHideOnClose(true)).toBe(false);
    const { tray, listeners } = made[0];
    expect(tray.tip).toMatch(/running in the background/);
    const items = tray.menu;
    expect(items.map((item) => item.label ?? item.type)).toEqual(["Open COSGRAL Workspace", "separator", "Quit"]);
    items[0].click?.();
    listeners.get("click")?.();
    listeners.get("double-click")?.();
    expect(shown).toHaveBeenCalledTimes(3);
    expect(quit).not.toHaveBeenCalled();
    items[2].click?.();
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it("removes the icon when the setting goes off and then lets a close end the program again", () => {
    const { mode, made } = setup();
    mode.apply(true, "en");
    expect(mode.apply(false, "en")).toBe(false);
    expect(made[0].tray.destroyed).toBe(1);
    expect(mode.active).toBe(false);
    expect(mode.shouldHideOnClose(false)).toBe(false);
    mode.apply(false, "en"); // nothing to remove: no error, no second destroy
    expect(made[0].tray.destroyed).toBe(1);
  });

  it("does not hide a window nobody can reach: a tray that cannot be made keeps the old behaviour", () => {
    const { mode } = setup({
      createTray: () => {
        throw new Error("no notification area");
      },
    });
    expect(mode.apply(true, "en")).toBe(false);
    expect(mode.active).toBe(false);
    expect(mode.shouldHideOnClose(false)).toBe(false);
  });

  it("rebuilds the menu in the new language and never leaves two icons", () => {
    const { mode, made } = setup();
    mode.apply(true, "en");
    mode.apply(true, "pl");
    expect(made).toHaveLength(2);
    expect(made[0].tray.destroyed).toBe(1);
    expect(made[1].tray.menu.map((item) => item.label ?? item.type)).toEqual([
      "Otwórz COSGRAL Workspace",
      "separator",
      "Zakończ",
    ]);
    expect(made[1].tray.tip).toMatch(/w tle/);
  });

  it("macOS never gets a tray from this mode (its window already hides on close)", () => {
    const { mode, made } = setup({ platform: "darwin" });
    expect(mode.apply(true, "en")).toBe(false);
    expect(made).toHaveLength(0);
    expect(mode.shouldHideOnClose(false)).toBe(false);
  });

  it("dispose removes the icon; menu items carry the actions", () => {
    const { mode, made } = setup();
    mode.apply(true, "en");
    mode.dispose();
    expect(made[0].tray.destroyed).toBe(1);
    const open = vi.fn();
    const quit = vi.fn();
    const items = trayMenuItems("pl", { open, quit });
    items[0].click?.();
    items[2].click?.();
    expect(open).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it("the functions used by the settings handlers and the close handler go through the installed mode, and do nothing without one", () => {
    expect(shouldHideMainWindowOnClose(false)).toBe(false);
    applyKeepBackground(true, "en"); // no mode installed yet: no error
    const { mode } = setup();
    installBackgroundMode(mode);
    applyKeepBackground(true, "en");
    expect(shouldHideMainWindowOnClose(false)).toBe(true);
    expect(shouldHideMainWindowOnClose(true)).toBe(false);
    applyKeepBackground(false, "en");
    expect(shouldHideMainWindowOnClose(false)).toBe(false);
  });
});
