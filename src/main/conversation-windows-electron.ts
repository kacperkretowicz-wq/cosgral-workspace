// COSGRAL W6-KK3: the Electron side of the separate conversation windows. Each window loads the same renderer as the
// main window (`#conversation/<agent>/<thread>`) with the same preload and the same trust settings: sandboxed, no node,
// no other page may be opened or navigated to. It gets the agent events of this computer like the dock does.

import { type AgentEvent, IPC_CHANNELS } from "@openbot/contracts/ipc";
import { BrowserWindow } from "electron";
import type { ConversationWindowHandle, ConversationWindowHost } from "./conversation-windows";
import { isTrustedRendererUrl } from "./trusted-renderer";

export interface ElectronConversationWindowsOptions {
  preloadPath: string;
  iconPath: string;
}

export class ElectronConversationWindowHost implements ConversationWindowHost {
  readonly #options: ElectronConversationWindowsOptions;
  readonly #windows = new Set<BrowserWindow>();

  constructor(options: ElectronConversationWindowsOptions) {
    this.#options = options;
  }

  create(hash: string, title: string): ConversationWindowHandle {
    const window = new BrowserWindow({
      show: false,
      width: 960,
      height: 760,
      minWidth: 480,
      minHeight: 400,
      title,
      icon: this.#options.iconPath,
      backgroundColor: "#0b0d0e",
      webPreferences: {
        preload: this.#options.preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });
    this.#windows.add(window);
    window.once("ready-to-show", () => window.show());
    window.on("closed", () => this.#windows.delete(window));
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, targetUrl) => {
      if (!isTrustedRendererUrl(targetUrl)) event.preventDefault();
    });
    // The title of the window is the program's, not the page's: a page cannot rename it.
    window.on("page-title-updated", (event) => event.preventDefault());
    const base = process.env.ELECTRON_RENDERER_URL ?? "openbot-app://app/index.html";
    window.loadURL(`${base}${hash}`).catch((error: unknown) => {
      console.error("Unable to load a conversation window:", error);
    });
    return {
      focus: () => {
        if (window.isDestroyed()) return;
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
      },
      close: () => {
        if (!window.isDestroyed()) window.close();
      },
      setTitle: (next) => {
        if (!window.isDestroyed()) window.setTitle(next);
      },
      onClosed: (listener) => {
        window.on("closed", listener);
      },
      onFocusChanged: (listener) => {
        window.on("focus", () => listener(true));
        window.on("blur", () => listener(false));
      },
    };
  }

  /** Every agent event of a server; only this computer feeds the conversation windows. */
  forward(serverId: string, event: AgentEvent): void {
    if (serverId !== "local") return;
    for (const window of this.#windows) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.agentEvent, { serverId, event });
    }
  }
}
