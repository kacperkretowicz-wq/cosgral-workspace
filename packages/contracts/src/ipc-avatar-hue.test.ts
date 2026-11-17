import { describe, expect, it } from "vitest";
import { BOT_AVATAR_HUES, isAvatarHue, normalizeAvatarHue } from "./ipc-conversation";

const ORIGINAL_HUES = [0, 30, 55, 100, 150, 185, 215, 245, 280, 320];

describe("avatar hue wheel", () => {
  it("has 17 hues and keeps every original value valid", () => {
    expect(BOT_AVATAR_HUES).toHaveLength(17);
    for (const hue of ORIGINAL_HUES) expect(isAvatarHue(hue)).toBe(true);
    expect(new Set(BOT_AVATAR_HUES).size).toBe(17);
  });

  it("snaps any number to the nearest hue, around the circle", () => {
    expect(normalizeAvatarHue(30)).toBe(30);
    expect(normalizeAvatarHue(22)).toBe(18);
    expect(normalizeAvatarHue("246")).toBe(245);
    expect(normalizeAvatarHue(359)).toBe(0);
    expect(normalizeAvatarHue(-10)).toBe(0);
    expect(normalizeAvatarHue(400)).toBe(45);
  });

  it("rejects values that are not numbers", () => {
    for (const value of [null, undefined, "", "red", Number.NaN, Number.POSITIVE_INFINITY, {}]) {
      expect(normalizeAvatarHue(value)).toBeNull();
    }
  });
});
