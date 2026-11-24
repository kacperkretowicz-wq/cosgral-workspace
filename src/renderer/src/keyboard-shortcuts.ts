// COSGRAL: the keyboard shortcuts of the window in one place, so the list the person sees and the handlers cannot drift apart.
// Alt+Up/Down moves between agents only when the focus is not in a text field: there (on macOS) Option+arrows move by word or
// paragraph, and that must keep working.

export interface KeyboardShortcut {
  /** Keys as shown; "Mod" is Ctrl, or Cmd on a Mac. */
  keys: string[];
  /** What it does (an English key of the dictionary). */
  action: string;
}

export const KEYBOARD_SHORTCUTS: readonly KeyboardShortcut[] = [
  { keys: ["Mod", "K"], action: "Search conversations, agents and pages" },
  { keys: ["Mod", "F"], action: "Find in this conversation" },
  { keys: ["Alt", "↑"], action: "Previous agent in the list (outside a text field)" },
  { keys: ["Alt", "↓"], action: "Next agent in the list (outside a text field)" },
  { keys: ["Enter"], action: "Send the message (or Ctrl+Enter, as set in Appearance)" },
  { keys: ["Shift", "Enter"], action: "New line in the message" },
  { keys: ["Mod", "W"], action: "Close the browser tab of the agent" },
  { keys: ["Esc"], action: "Close the open panel, menu or dialog" },
  { keys: ["Mod", "/"], action: "Show these keyboard shortcuts" },
];

/** "Mod" on this computer. */
export function modKeyLabel(platform: string = navigator.platform): "⌘" | "Ctrl" {
  return /mac/i.test(platform) ? "⌘" : "Ctrl";
}

/** True when the key goes to something the person types into (where Alt+arrows have their own meaning). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  // The message field is contenteditable; the attribute check also covers places where isContentEditable is not computed.
  if (target.isContentEditable || target.closest("[contenteditable]:not([contenteditable='false'])")) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (target.getAttribute("type") ?? "text").toLowerCase();
  return !["button", "checkbox", "radio", "range", "submit", "reset", "color", "file", "image"].includes(type);
}

/** -1 for Alt+Up, 1 for Alt+Down (no other modifier), otherwise null. */
export function agentStep(
  event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">,
): -1 | 1 | null {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  if (event.key === "ArrowUp") return -1;
  if (event.key === "ArrowDown") return 1;
  return null;
}

/** The agent before or after the active one in the order the list shows; null at either end or when there is none. */
export function neighbourAgent(ids: readonly string[], activeId: string, step: -1 | 1): string | null {
  if (ids.length === 0) return null;
  const index = ids.indexOf(activeId);
  if (index === -1) return step === 1 ? (ids[0] ?? null) : (ids[ids.length - 1] ?? null);
  return ids[index + step] ?? null;
}

/** Mod+/ (Ctrl+/ or Cmd+/). */
export function isShortcutListKey(event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey">): boolean {
  return event.key === "/" && (event.ctrlKey || event.metaKey) && !event.altKey;
}
