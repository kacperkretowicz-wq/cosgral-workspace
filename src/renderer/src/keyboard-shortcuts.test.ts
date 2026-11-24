import { describe, expect, it } from "vitest";
import {
  agentStep,
  isShortcutListKey,
  isTypingTarget,
  KEYBOARD_SHORTCUTS,
  modKeyLabel,
  neighbourAgent,
} from "./keyboard-shortcuts";
import { en } from "./locales/en";
import { pl } from "./locales/pl";

const key = (patch: Partial<KeyboardEvent>) => ({
  key: "",
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...patch,
});

describe("keyboard shortcuts", () => {
  it("Alt+Up/Down step through agents only with Alt alone", () => {
    expect(agentStep(key({ key: "ArrowUp", altKey: true }))).toBe(-1);
    expect(agentStep(key({ key: "ArrowDown", altKey: true }))).toBe(1);
    expect(agentStep(key({ key: "ArrowDown" }))).toBeNull();
    expect(agentStep(key({ key: "ArrowDown", altKey: true, shiftKey: true }))).toBeNull();
    expect(agentStep(key({ key: "ArrowDown", altKey: true, metaKey: true }))).toBeNull();
  });

  it("finds the neighbour in the shown order and stops at the ends", () => {
    const ids = ["a", "b", "c"];
    expect(neighbourAgent(ids, "b", 1)).toBe("c");
    expect(neighbourAgent(ids, "b", -1)).toBe("a");
    expect(neighbourAgent(ids, "c", 1)).toBeNull();
    expect(neighbourAgent(ids, "a", -1)).toBeNull();
    expect(neighbourAgent(ids, "gone", 1)).toBe("a");
    expect(neighbourAgent([], "a", 1)).toBeNull();
  });

  it("treats text fields as typing targets (Option+arrows move by word there) and buttons as not", () => {
    const field = document.createElement("textarea");
    const input = document.createElement("input");
    const box = document.createElement("input");
    box.type = "checkbox";
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const button = document.createElement("button");
    expect([field, input, editor].map(isTypingTarget)).toEqual([true, true, true]);
    expect([box, button, null].map(isTypingTarget)).toEqual([false, false, false]);
  });

  it("opens the list with Ctrl+/ or Cmd+/ and names the modifier of the computer", () => {
    expect(isShortcutListKey(key({ key: "/", ctrlKey: true }))).toBe(true);
    expect(isShortcutListKey(key({ key: "/", metaKey: true }))).toBe(true);
    expect(isShortcutListKey(key({ key: "/" }))).toBe(false);
    expect(modKeyLabel("MacIntel")).toBe("⌘");
    expect(modKeyLabel("Win32")).toBe("Ctrl");
  });

  it("every shortcut has a Polish and an English text", () => {
    const polish = new Map(Object.entries(pl));
    const english = new Map(Object.entries(en));
    for (const shortcut of KEYBOARD_SHORTCUTS) {
      expect(polish.get(shortcut.action), shortcut.action).toBeTruthy();
      expect(english.get(shortcut.action), shortcut.action).toBeTruthy();
    }
  });
});
