// COSGRAL W3: the desktop driver of Computer Use. The controller (computer-use.ts) decides: consent, Stop, order and
// safety. A driver only does the one step it is asked, in physical screen pixels of the virtual screen.

export interface DesktopRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DesktopWindow {
  /** Window handle as text (stable while the window lives). */
  handle: string;
  title: string;
  processId: number;
  processName: string;
  bounds: DesktopRect;
  minimized: boolean;
  foreground: boolean;
  /** True when the window runs as administrator (Windows ignores input sent to it), or when that is unknown. */
  elevated: boolean;
}

export interface DesktopState {
  /** Name of the desktop that gets input: "Default" normally; null or another name when locked or on a secure prompt. */
  inputDesktop: string | null;
  /** The screen is locked, or Windows shows its secure desktop. */
  locked: boolean;
  /** A UAC prompt (administrator approval) is open. */
  uacPrompt: boolean;
  /** The virtual screen (all monitors) in physical pixels. */
  screen: DesktopRect;
  foreground: DesktopWindow | null;
}

export interface DesktopScreenshot {
  /** PNG of the whole virtual screen, scaled so the long side is at most the requested size. */
  png: Buffer;
  width: number;
  height: number;
}

export type MouseButton = "left" | "right" | "middle";

export interface ComputerDriver {
  /** Why this computer cannot be controlled, or null when it can. */
  unavailableReason(): string | null;
  state(): Promise<DesktopState>;
  screenshot(maxDimension: number): Promise<DesktopScreenshot>;
  listWindows(): Promise<DesktopWindow[]>;
  /** The top-level window under a point, or null. */
  windowAt(x: number, y: number): Promise<DesktopWindow | null>;
  /** Restores and activates a window; true when it is in front afterwards. */
  focusWindow(handle: string): Promise<boolean>;
  click(x: number, y: number, button: MouseButton, count: 1 | 2): Promise<void>;
  /** Wheel notches: positive deltaY scrolls up, positive deltaX scrolls right. */
  scroll(x: number, y: number, deltaX: number, deltaY: number): Promise<void>;
  /** Types text into the window in front (one short chunk; the controller splits longer text). */
  typeText(text: string): Promise<void>;
  /** Presses keys together (in order) and releases them in reverse order. Names from KEY_NAMES. */
  pressKeys(keys: string[]): Promise<void>;
  /** Interrupts the step in progress at once (Stop). */
  cancel(): void;
  close(): Promise<void>;
}

/** Key names an agent may press. */
export const KEY_NAMES = [
  "ctrl",
  "shift",
  "alt",
  "win",
  "enter",
  "tab",
  "escape",
  "backspace",
  "delete",
  "insert",
  "home",
  "end",
  "pageup",
  "pagedown",
  "up",
  "down",
  "left",
  "right",
  "space",
  ...Array.from({ length: 12 }, (_, index) => `f${index + 1}`),
  ..."abcdefghijklmnopqrstuvwxyz".split(""),
  ..."0123456789".split(""),
] as const;

const KEY_ALIASES: Record<string, string> = {
  control: "ctrl",
  cmd: "win",
  meta: "win",
  windows: "win",
  super: "win",
  option: "alt",
  return: "enter",
  esc: "escape",
  del: "delete",
  ins: "insert",
  pgup: "pageup",
  pgdn: "pagedown",
  arrowup: "up",
  arrowdown: "down",
  arrowleft: "left",
  arrowright: "right",
  spacebar: "space",
};

/** Combinations that are never pressed: they lock the screen or call the Windows security screen. */
const BLOCKED_COMBINATIONS = ["win+l", "ctrl+alt+delete"];

/** "Ctrl+Shift+S" → ["ctrl", "shift", "s"]; throws for unknown keys and blocked combinations. */
export function parseKeyCombination(value: string, maxKeys: number): string[] {
  const keys = value
    .split("+")
    .map((key) => key.trim().toLowerCase())
    .filter(Boolean)
    .map((key) => KEY_ALIASES[key] ?? key);
  if (keys.length === 0) throw new Error('Give keys like "ctrl+s" or "enter".');
  if (keys.length > maxKeys) throw new Error(`Press at most ${maxKeys} keys together.`);
  const allowed = new Set<string>(KEY_NAMES);
  for (const key of keys) {
    if (!allowed.has(key))
      throw new Error(
        `Unknown key "${key}". Keys: ctrl, shift, alt, win, enter, tab, escape, arrows, f1–f12, letters and digits.`,
      );
  }
  if (new Set(keys).size !== keys.length) throw new Error("A key is listed twice.");
  const sorted = [...keys].sort().join("+");
  if (BLOCKED_COMBINATIONS.some((combination) => combination.split("+").sort().join("+") === sorted)) {
    throw new Error(`${keys.join("+")} is not allowed: it locks the screen or opens the Windows security screen.`);
  }
  return keys;
}
