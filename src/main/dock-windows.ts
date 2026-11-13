// COSGRAL W3: the Electron windows of the dock and the Dynamic Island. Both load the same renderer as the main
// window (`#dock`, `#island`) with the same preload, and get every agent event of this computer.

import { join } from "node:path";
import {
  type AgentActivity,
  type AgentEvent,
  DOCK_LIMITS,
  IPC_CHANNELS,
  type PendingAgentRequest,
  type ShowMainWindowInput,
} from "@openbot/contracts/ipc";
import { BrowserWindow, screen } from "electron";
import { DockController, type DockHost, type Rect } from "./dock-controller";
import { isTrustedRendererUrl } from "./trusted-renderer";

export type DockView = "dock" | "island";

export const ISLAND_SIZE = { width: 380, height: 64 } as const;

export interface DockWindowsOptions {
  preloadPath: string;
  iconPath: string;
  mainWindow: () => BrowserWindow | null;
  /** Shows the main window, or creates and loads it when it was closed. */
  openMainWindow: () => Promise<BrowserWindow>;
  /** To every window (the main window, then back here through `forward`). */
  emit: (event: AgentEvent) => void;
  quit: () => void;
}

/** The agents seen by the dock and the island. */
export interface DockAgentSource {
  listBots: () => ReadonlyArray<{ id: string; name: string }>;
  listPendingRequests: () => PendingAgentRequest[];
  listActivity: () => AgentActivity[];
}

/** Creates the dock windows with their controller; settings in `<userData>/dock.json`. */
export function createDockWindows(
  options: DockWindowsOptions & { userDataPath: string; agents: () => DockAgentSource | null },
): DockWindows {
  const windows = new DockWindows(options);
  windows.attach(
    new DockController({
      host: windows,
      filePath: join(options.userDataPath, "dock.json"),
      listBots: () => options.agents()?.listBots() ?? [],
      listPending: () => options.agents()?.listPendingRequests() ?? [],
      listActivity: () => options.agents()?.listActivity() ?? [],
    }),
  );
  return windows;
}

export class DockWindows implements DockHost {
  readonly #options: DockWindowsOptions;
  #controller: DockController | null = null;
  #dock: BrowserWindow | null = null;
  #island: BrowserWindow | null = null;
  #moveTimer: NodeJS.Timeout | null = null;
  #destroyed = false;

  constructor(options: DockWindowsOptions) {
    this.#options = options;
  }

  attach(controller: DockController): void {
    this.#controller = controller;
  }

  get controller(): DockController | null {
    return this.#controller;
  }

  /** Every agent event of a server; only this computer feeds the dock and the island. */
  forward(serverId: string, event: AgentEvent): void {
    if (serverId !== "local" || this.#destroyed) return;
    for (const window of [this.#dock, this.#island]) {
      if (window && !window.isDestroyed()) window.webContents.send(IPC_CHANNELS.agentEvent, { serverId, event });
    }
    this.#controller?.observe(event);
  }

  showDockWindow(bounds: Rect): void {
    const window = this.#dock && !this.#dock.isDestroyed() ? this.#dock : this.#createDock();
    window.setMinimumSize(bounds.width, 320);
    window.setMaximumSize(bounds.width, 10_000);
    window.setBounds(bounds);
    if (!window.isVisible()) window.showInactive();
  }

  hideDockWindow(): void {
    if (this.#dock && !this.#dock.isDestroyed()) this.#dock.hide();
  }

  setIslandVisible(visible: boolean): void {
    if (!visible) {
      if (this.#island && !this.#island.isDestroyed()) this.#island.hide();
      return;
    }
    const window = this.#island && !this.#island.isDestroyed() ? this.#island : this.#createIsland();
    const area = screen.getPrimaryDisplay().workArea;
    window.setBounds({
      x: Math.round(area.x + (area.width - ISLAND_SIZE.width) / 2),
      y: area.y + 8,
      ...ISLAND_SIZE,
    });
    if (!window.isVisible()) window.showInactive();
  }

  workArea(): Rect {
    const dock = this.#dock && !this.#dock.isDestroyed() ? this.#dock.getBounds() : null;
    return (dock ? screen.getDisplayMatching(dock) : screen.getPrimaryDisplay()).workArea;
  }

  showMainWindow(target?: ShowMainWindowInput): void {
    void this.#options
      .openMainWindow()
      .then((window) => {
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
        if (!target?.botId) return;
        const event: AgentEvent = { type: "island-open-request", botId: target.botId, request: target.request ?? null };
        window.webContents.send(IPC_CHANNELS.agentEvent, { serverId: "local", event });
      })
      .catch((error) => console.error("Unable to open the main window from the dock:", error));
  }

  mainWindowOpen(): boolean {
    const window = this.#options.mainWindow();
    return Boolean(window && !window.isDestroyed());
  }

  mainWindowFocused(): boolean {
    const window = this.#options.mainWindow();
    return Boolean(window && !window.isDestroyed() && window.isVisible() && window.isFocused());
  }

  emit(event: AgentEvent): void {
    this.#options.emit(event);
  }

  quit(): void {
    this.#options.quit();
  }

  /** Program shutdown: close both windows without treating it as the person closing the dock. */
  destroy(): void {
    this.#destroyed = true;
    if (this.#moveTimer) clearTimeout(this.#moveTimer);
    for (const window of [this.#dock, this.#island]) {
      if (window && !window.isDestroyed()) window.destroy();
    }
    this.#dock = null;
    this.#island = null;
  }

  #createDock(): BrowserWindow {
    const window = new BrowserWindow({
      ...this.#common(),
      width: DOCK_LIMITS.widths.medium,
      height: 640,
      title: "COSGRAL Dock",
      frame: false,
      resizable: true,
      minimizable: true,
      maximizable: false,
      fullscreenable: false,
      backgroundColor: "#0b0d0e",
    });
    const remember = () => {
      if (this.#moveTimer) clearTimeout(this.#moveTimer);
      this.#moveTimer = setTimeout(() => {
        if (!window.isDestroyed()) this.#controller?.dockMoved(window.getBounds());
      }, 300);
    };
    window.on("moved", remember);
    window.on("resized", remember);
    window.on("closed", () => {
      if (this.#dock === window) this.#dock = null;
      if (!this.#destroyed) this.#controller?.dockWindowClosed();
    });
    this.#dock = window;
    void this.#load(window, "dock");
    return window;
  }

  #createIsland(): BrowserWindow {
    const window = new BrowserWindow({
      ...this.#common(),
      ...ISLAND_SIZE,
      title: "COSGRAL Island",
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
    });
    window.setAlwaysOnTop(true, "screen-saver");
    window.on("closed", () => {
      if (this.#island === window) this.#island = null;
    });
    this.#island = window;
    void this.#load(window, "island");
    return window;
  }

  #common() {
    return {
      show: false,
      icon: this.#options.iconPath,
      webPreferences: {
        preload: this.#options.preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    };
  }

  async #load(window: BrowserWindow, view: DockView): Promise<void> {
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, targetUrl) => {
      if (!isTrustedRendererUrl(targetUrl)) event.preventDefault();
    });
    const developmentUrl = process.env.ELECTRON_RENDERER_URL;
    const base = developmentUrl ?? "openbot-app://app/index.html";
    try {
      await window.loadURL(`${base}#${view}`);
    } catch (error) {
      console.error(`Unable to load the ${view} window:`, error);
    }
  }
}
