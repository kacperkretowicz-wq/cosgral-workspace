import { describe, expect, it } from "vitest";
import { enterAction } from "./send-shortcut";

const key = (init: Partial<{ key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) => ({
  key: "Enter",
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  ...init,
});

describe("send shortcut of the composer (BE-Z2)", () => {
  it("default (Enter sends): Enter sends, Shift+Enter breaks the line, Ctrl/Cmd+Enter still sends as before", () => {
    for (const shortcut of ["enter", undefined, "something-else"]) {
      expect(enterAction(key(), shortcut)).toBe("send");
      expect(enterAction(key({ shiftKey: true }), shortcut)).toBe("newline");
      expect(enterAction(key({ ctrlKey: true }), shortcut)).toBe("send");
      expect(enterAction(key({ metaKey: true }), shortcut)).toBe("send");
    }
  });

  it("Ctrl/Cmd+Enter mode: only Ctrl or Cmd with Enter sends, Enter and Shift+Enter break the line", () => {
    expect(enterAction(key({ ctrlKey: true }), "mod-enter")).toBe("send");
    expect(enterAction(key({ metaKey: true }), "mod-enter")).toBe("send");
    expect(enterAction(key(), "mod-enter")).toBe("newline");
    expect(enterAction(key({ shiftKey: true }), "mod-enter")).toBe("newline");
    // Shift wins over Ctrl: a line break, never a send by accident.
    expect(enterAction(key({ shiftKey: true, ctrlKey: true }), "mod-enter")).toBe("newline");
  });

  it("any other key is not an Enter action", () => {
    expect(enterAction(key({ key: "a" }), "enter")).toBe("none");
    expect(enterAction(key({ key: "Tab" }), "mod-enter")).toBe("none");
  });
});
