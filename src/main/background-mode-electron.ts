// COSGRAL W12 (BE-W): the Electron side of the background mode: the tray icon and its menu. The decisions are in background-mode.ts
// (unit-tested without Electron); this file only adapts the real Tray to them. Not run by the unit tests.

import { app, Menu, nativeImage, Tray } from "electron";
import { BackgroundMode, type TrayLike } from "./background-mode";

function electronTray(iconPath: string): TrayLike {
  const tray = new Tray(nativeImage.createFromPath(iconPath));
  return {
    setToolTip: (text) => tray.setToolTip(text),
    setContextMenu: (menu) => tray.setContextMenu(menu instanceof Menu ? menu : null),
    on: (event, listener) => {
      if (event === "click") tray.on("click", () => listener());
      else tray.on("double-click", () => listener());
    },
    destroy: () => tray.destroy(),
  };
}

export function createElectronBackgroundMode(iconPath: string, showMainWindow: () => void): BackgroundMode {
  return new BackgroundMode({
    platform: process.platform,
    createTray: () => electronTray(iconPath),
    buildMenu: (items) => Menu.buildFromTemplate(items),
    showMainWindow,
    quit: () => app.quit(),
  });
}
