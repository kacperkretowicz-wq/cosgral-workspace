// COSGRAL W3: the agent dock and the Dynamic Island in the main process. Keeps the settings (DockStore), the island
// state (IslandTracker), and tells the host which windows to show. No Electron here: `dock-windows.ts` is the host.
//
// Lifetime: with the dock shown, closing the main window keeps the program running in the dock ("Open COSGRAL"
// brings the main window back). With the dock hidden, closing the main window quits as before. The island never
// keeps the program running on its own.

import {
  type AgentActivity,
  type AgentEvent,
  DOCK_LIMITS,
  type DockAgentInput,
  type DockState,
  type IslandState,
  type OpenDockChatInput,
  type PendingAgentRequest,
  type PinDockAgentInput,
  type ReorderDockInput,
  type SetDockPinHiddenInput,
  type SetDockSizeInput,
  type SetDockVisibleInput,
  type SetIslandEnabledInput,
  type ShowMainWindowInput,
} from "@openbot/contracts/ipc";
import { DockStore } from "../backend/dock-store";
import { IslandTracker } from "../backend/island-tracker";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the controller needs from Electron. */
export interface DockHost {
  showDockWindow: (bounds: Rect) => void;
  hideDockWindow: () => void;
  setIslandVisible: (visible: boolean) => void;
  /** Work area of the display with the dock (without the taskbar). */
  workArea: () => Rect;
  /** Shows (or creates) the main window; with a `botId`, then sends it `island-open-request`. */
  showMainWindow: (target?: ShowMainWindowInput) => void;
  mainWindowOpen: () => boolean;
  mainWindowFocused: () => boolean;
  /** To every window: the main window, the dock and the island. */
  emit: (event: AgentEvent) => void;
  quit: () => void;
}

export interface DockControllerOptions {
  host: DockHost;
  filePath: string;
  listBots: () => ReadonlyArray<{ id: string; name: string }>;
  listPending: () => PendingAgentRequest[];
  listActivity: () => AgentActivity[];
}

/** Space between the dock and the edge of the work area. */
const EDGE_GAP = 12;

export class DockController {
  readonly #host: DockHost;
  readonly #store: DockStore;
  readonly #island: IslandTracker;

  constructor(options: DockControllerOptions) {
    this.#host = options.host;
    this.#store = new DockStore({
      filePath: options.filePath,
      botExists: (botId) => options.listBots().some((bot) => bot.id === botId),
    });
    this.#island = new IslandTracker({
      listBots: options.listBots,
      listPending: options.listPending,
      listActivity: options.listActivity,
      mainWindowFocused: () => this.#host.mainWindowFocused(),
      enabled: () => this.#store.settings().islandEnabled,
      emit: (state) => this.#islandChanged(state),
    });
  }

  /** After the main window loaded: open the dock and the island as they were. */
  start(): void {
    this.#island.refresh();
    this.#applyDock();
    this.#applyIsland(this.#island.state());
  }

  getState(): DockState {
    const { visible, size, pins, openBotId } = this.#store.settings();
    return { visible, size, pins, openBotId, mainWindowOpen: this.#host.mainWindowOpen() };
  }

  getIslandState(): IslandState {
    return this.#island.state();
  }

  pin(input: PinDockAgentInput): DockState {
    this.#store.pin(input);
    return this.#dockChanged();
  }

  unpin(input: DockAgentInput): DockState {
    this.#store.unpin(input);
    return this.#dockChanged();
  }

  reorder(input: ReorderDockInput): DockState {
    this.#store.reorder(input);
    return this.#dockChanged();
  }

  setPinHidden(input: SetDockPinHiddenInput): DockState {
    this.#store.setPinHidden(input);
    return this.#dockChanged();
  }

  setSize(input: SetDockSizeInput): DockState {
    this.#store.setSize(input);
    this.#applyDock();
    return this.#dockChanged();
  }

  setVisible(input: SetDockVisibleInput): DockState {
    this.#store.setVisible(input);
    this.#applyDock();
    return this.#dockChanged();
  }

  openChat(input: OpenDockChatInput): DockState {
    this.#store.openChat(input);
    return this.#dockChanged();
  }

  /** The host sends `island-open-request` to the main window once it is ready (also when it had to be created). */
  showMainWindow(input?: ShowMainWindowInput): void {
    this.#host.showMainWindow(input);
    this.#dockChanged();
  }

  setIslandEnabled(input: SetIslandEnabledInput): IslandState {
    this.#store.setIslandEnabled(input);
    this.#island.refresh();
    return this.#island.state();
  }

  /** The click on the island. */
  activateIsland(): IslandState {
    const target = this.#island.activate();
    if (target) this.showMainWindow({ botId: target.botId, ...(target.request ? { request: target.request } : {}) });
    return this.#island.state();
  }

  dismissIsland(): IslandState {
    this.#island.dismiss();
    return this.#island.state();
  }

  /** Every agent event of this computer. */
  observe(event: AgentEvent): void {
    if (event.type === "dock-changed" || event.type === "island-changed" || event.type === "island-open-request") {
      return;
    }
    if (event.type === "bots-changed" && event.bots.length > 0) {
      if (this.#store.forgetMissingBots(new Set(event.bots.map((bot) => bot.id)))) this.#dockChanged();
    }
    this.#island.observe(event);
  }

  mainWindowFocused(): void {
    this.#island.mainWindowFocused();
  }

  /** The main window is gone: quit unless the dock keeps the program. */
  mainWindowClosed(): void {
    if (!this.#store.settings().visible) {
      this.#host.quit();
      return;
    }
    this.#dockChanged();
  }

  /** The person closed the dock window itself. */
  dockWindowClosed(): void {
    if (this.#store.settings().visible) this.#store.setVisible({ visible: false });
    if (!this.#host.mainWindowOpen()) {
      this.#host.quit();
      return;
    }
    this.#dockChanged();
  }

  /** The dock window was moved or resized by the person. */
  dockMoved(bounds: Rect): void {
    this.#store.setBounds({ x: bounds.x, y: bounds.y, height: bounds.height });
  }

  #dockBounds(): Rect {
    const area = this.#host.workArea();
    const settings = this.#store.settings();
    const width = DOCK_LIMITS.widths[settings.size];
    const saved = settings.bounds;
    if (!saved) {
      return {
        x: area.x + area.width - width - EDGE_GAP,
        y: area.y + EDGE_GAP,
        width,
        height: area.height - 2 * EDGE_GAP,
      };
    }
    const height = Math.min(saved.height, area.height);
    return {
      x: clamp(saved.x, area.x, area.x + area.width - width),
      y: clamp(saved.y, area.y, area.y + area.height - height),
      width,
      height,
    };
  }

  #applyDock(): void {
    if (this.#store.settings().visible) this.#host.showDockWindow(this.#dockBounds());
    else this.#host.hideDockWindow();
  }

  #applyIsland(state: IslandState): void {
    this.#host.setIslandVisible(state.enabled && state.status !== null);
  }

  #islandChanged(state: IslandState): void {
    this.#applyIsland(state);
    this.#host.emit({ type: "island-changed", state });
  }

  #dockChanged(): DockState {
    const state = this.getState();
    this.#host.emit({ type: "dock-changed", state });
    return state;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
