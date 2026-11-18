// COSGRAL W12 (BE-W): "Keep COSGRAL Workspace running in the background". With the setting on, closing the window of the program hides it
// to a tray icon instead of ending the program, so tasks go on; "Open" in the tray menu (or a click on the icon, or starting the program a
// second time) brings the window back, "Quit" ends the program for real. The decisions live here without Electron (the tray, the menu and the
// window are passed in), so they have unit tests; src/main/index.ts only passes the Electron parts and asks one question on close.
//
// The one rule that keeps the person from being locked out: the window is hidden only while the tray icon exists. If the icon cannot be made
// (no notification area), the setting is not applied and a close ends the program as before.

export interface TrayLike {
  setToolTip(text: string): void;
  setContextMenu(menu: unknown): void;
  on(event: "click" | "double-click", listener: () => void): void;
  destroy(): void;
}

export interface TrayMenuItem {
  label?: string;
  type?: "separator";
  click?: () => void;
}

export type BackgroundLanguage = "en" | "pl";

const LABELS: Record<BackgroundLanguage, { open: string; quit: string; tooltip: string }> = {
  en: { open: "Open COSGRAL Workspace", quit: "Quit", tooltip: "COSGRAL Workspace (running in the background)" },
  pl: { open: "Otwórz COSGRAL Workspace", quit: "Zakończ", tooltip: "COSGRAL Workspace (działa w tle)" },
};

export function trayLabels(language: BackgroundLanguage): { open: string; quit: string; tooltip: string } {
  return LABELS[language] ?? LABELS.en;
}

export function trayMenuItems(
  language: BackgroundLanguage,
  actions: { open: () => void; quit: () => void },
): TrayMenuItem[] {
  const labels = trayLabels(language);
  return [
    { label: labels.open, click: actions.open },
    { type: "separator" },
    { label: labels.quit, click: actions.quit },
  ];
}

/** macOS already hides the window on close (its own rule in index.ts); here only Windows and Linux. */
export function shouldHideOnClose(input: {
  platform: NodeJS.Platform;
  keepBackground: boolean;
  hasTray: boolean;
  isQuitting: boolean;
}): boolean {
  return input.platform !== "darwin" && input.keepBackground && input.hasTray && !input.isQuitting;
}

export interface BackgroundModeDeps {
  platform: NodeJS.Platform;
  createTray: () => TrayLike;
  buildMenu: (items: TrayMenuItem[]) => unknown;
  showMainWindow: () => void;
  quit: () => void;
}

export class BackgroundMode {
  readonly #deps: BackgroundModeDeps;
  #keep = false;
  #language: BackgroundLanguage = "en";
  #tray: TrayLike | null = null;

  constructor(deps: BackgroundModeDeps) {
    this.#deps = deps;
  }

  /** True while a close should hide the window (the setting is on and the tray icon exists). */
  get active(): boolean {
    return this.#keep && this.#tray !== null;
  }

  /**
   * Applies the setting. Returns whether the mode is on afterwards: false when the tray icon could not be made (nothing is hidden then).
   * Called on every read and save of the app settings, so it is cheap and repeatable.
   */
  apply(enabled: boolean, language: BackgroundLanguage): boolean {
    this.#keep = enabled;
    if (!enabled || this.#deps.platform === "darwin") {
      this.#removeTray();
      return false;
    }
    if (this.#tray && this.#language !== language) this.#removeTray();
    this.#language = language;
    if (!this.#tray) {
      try {
        const tray = this.#deps.createTray();
        const labels = trayLabels(language);
        const open = () => this.#deps.showMainWindow();
        tray.setToolTip(labels.tooltip);
        tray.setContextMenu(this.#deps.buildMenu(trayMenuItems(language, { open, quit: () => this.#deps.quit() })));
        tray.on("click", open);
        tray.on("double-click", open);
        this.#tray = tray;
      } catch {
        // No notification area or no icon: keep the old behaviour (a close ends the program) rather than hide a window nobody can reach.
        this.#tray = null;
        return false;
      }
    }
    return true;
  }

  /** The one question of the close handler: hide instead of closing? */
  shouldHideOnClose(isQuitting: boolean): boolean {
    return shouldHideOnClose({
      platform: this.#deps.platform,
      keepBackground: this.#keep,
      hasTray: this.#tray !== null,
      isQuitting,
    });
  }

  dispose(): void {
    this.#removeTray();
  }

  #removeTray(): void {
    const tray = this.#tray;
    this.#tray = null;
    if (!tray) return;
    try {
      tray.destroy();
    } catch {
      /* Already gone with the application. */
    }
  }
}

let current: BackgroundMode | null = null;

/** index.ts calls this once with the Electron parts; the settings handlers and the close handler then use the functions below. */
export function installBackgroundMode(mode: BackgroundMode): void {
  current?.dispose();
  current = mode;
}

export function applyKeepBackground(enabled: boolean, language: BackgroundLanguage): void {
  current?.apply(enabled, language);
}

export function shouldHideMainWindowOnClose(isQuitting: boolean): boolean {
  return current?.shouldHideOnClose(isQuitting) ?? false;
}

export function disposeBackgroundMode(): void {
  current?.dispose();
}
