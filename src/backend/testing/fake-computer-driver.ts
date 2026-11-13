// A Computer Use driver for tests: a pretend desktop with windows, no real mouse or keyboard.

import type {
  ComputerDriver,
  DesktopRect,
  DesktopScreenshot,
  DesktopState,
  DesktopWindow,
  MouseButton,
} from "../computer-driver";

export type FakeDriverStep =
  | { kind: "click"; x: number; y: number; button: MouseButton; count: 1 | 2 }
  | { kind: "scroll"; x: number; y: number; deltaX: number; deltaY: number }
  | { kind: "type"; text: string }
  | { kind: "keys"; keys: string[] }
  | { kind: "focus"; handle: string }
  | { kind: "screenshot"; maxDimension: number };

/** A 1×1 PNG; the size reported to the agent comes from the screen and the scale. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export class FakeComputerDriver implements ComputerDriver {
  readonly steps: FakeDriverStep[] = [];
  screen: DesktopRect = { x: 0, y: 0, width: 3200, height: 1800 };
  windows: DesktopWindow[] = [];
  locked = false;
  uacPrompt = false;
  unavailable: string | null = null;
  /** Milliseconds every typing step takes, to stop a long action in the middle. */
  typingDelayMs = 0;
  cancels = 0;
  #inFlight: Array<(error: Error) => void> = [];

  constructor(windows: DesktopWindow[] = []) {
    this.windows = windows;
  }

  unavailableReason(): string | null {
    return this.unavailable;
  }

  async state(): Promise<DesktopState> {
    return {
      inputDesktop: this.locked ? null : "Default",
      locked: this.locked,
      uacPrompt: this.uacPrompt,
      screen: { ...this.screen },
      foreground: this.windows.find((window) => window.foreground) ?? null,
    };
  }

  async screenshot(maxDimension: number): Promise<DesktopScreenshot> {
    this.steps.push({ kind: "screenshot", maxDimension });
    const scale = Math.min(1, maxDimension / Math.max(this.screen.width, this.screen.height));
    return {
      png: PIXEL,
      width: Math.round(this.screen.width * scale),
      height: Math.round(this.screen.height * scale),
    };
  }

  async listWindows(): Promise<DesktopWindow[]> {
    return this.windows.map((window) => ({ ...window, bounds: { ...window.bounds } }));
  }

  async windowAt(x: number, y: number): Promise<DesktopWindow | null> {
    const window = this.windows.find(
      (candidate) =>
        !candidate.minimized &&
        x >= candidate.bounds.x &&
        y >= candidate.bounds.y &&
        x < candidate.bounds.x + candidate.bounds.width &&
        y < candidate.bounds.y + candidate.bounds.height,
    );
    return window ? { ...window } : null;
  }

  async focusWindow(handle: string): Promise<boolean> {
    this.steps.push({ kind: "focus", handle });
    const target = this.windows.find((window) => window.handle === handle);
    if (!target) throw new Error("This window no longer exists.");
    for (const window of this.windows) window.foreground = window.handle === handle;
    target.minimized = false;
    // The window in front is checked first by windowAt.
    this.windows = [target, ...this.windows.filter((window) => window !== target)];
    return true;
  }

  async click(x: number, y: number, button: MouseButton, count: 1 | 2): Promise<void> {
    this.steps.push({ kind: "click", x, y, button, count });
  }

  async scroll(x: number, y: number, deltaX: number, deltaY: number): Promise<void> {
    this.steps.push({ kind: "scroll", x, y, deltaX, deltaY });
  }

  async typeText(text: string): Promise<void> {
    if (this.typingDelayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.#inFlight = this.#inFlight.filter((entry) => entry !== fail);
          resolve();
        }, this.typingDelayMs);
        const fail = (error: Error) => {
          clearTimeout(timer);
          reject(error);
        };
        this.#inFlight.push(fail);
      });
    }
    this.steps.push({ kind: "type", text });
  }

  async pressKeys(keys: string[]): Promise<void> {
    this.steps.push({ kind: "keys", keys: [...keys] });
  }

  cancel(): void {
    this.cancels += 1;
    for (const fail of this.#inFlight.splice(0)) fail(new Error("The driver step was interrupted."));
  }

  async close(): Promise<void> {
    this.cancel();
  }

  typed(): string {
    return this.steps.map((step) => (step.kind === "type" ? step.text : "")).join("");
  }
}

export function fakeWindow(overrides: Partial<DesktopWindow> & Pick<DesktopWindow, "handle" | "title">): DesktopWindow {
  return {
    processId: 4242,
    processName: "notepad",
    bounds: { x: 100, y: 100, width: 800, height: 600 },
    minimized: false,
    foreground: false,
    elevated: false,
    ...overrides,
  };
}
