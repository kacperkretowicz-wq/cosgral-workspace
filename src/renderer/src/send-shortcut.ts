// COSGRAL W12 (BE-Z2): what the Enter key does in the message field, by the person's setting `appearance.sendShortcut`.
//   "enter" (the default and what the program always did): Enter sends, Shift+Enter breaks the line; Ctrl/Cmd+Enter sends as well.
//   "mod-enter": only Ctrl/Cmd+Enter sends; Enter and Shift+Enter break the line (so a long message is easy to write).
// Shift always wins over Ctrl: it can only break the line, never send by accident. Pure, so it has its own test.

export type EnterAction = "send" | "newline" | "none";

export interface EnterKeyLike {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export function enterAction(event: EnterKeyLike, shortcut: string | undefined): EnterAction {
  if (event.key !== "Enter") return "none";
  if (event.shiftKey) return "newline";
  if (shortcut === "mod-enter") return event.ctrlKey || event.metaKey ? "send" : "newline";
  return "send";
}

/** The setting as `applyAppearanceDom` leaves it on `<html>`. */
export function currentSendShortcut(): string | undefined {
  return document.documentElement.dataset.sendShortcut;
}
