// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const palette = readFileSync(new URL("./styles/theme-light.css", import.meta.url), "utf8");
function token(name: string): string {
  const value = palette.match(new RegExp(`--openbot-${name}:\\s*([^;]+);`))?.[1];
  if (!value) throw new Error(name);
  return value;
}
function rgb(value: string, background = [255, 255, 255]): number[] {
  if (value.startsWith("#")) return [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16));
  const [r, g, b, a = 1] = value.match(/[\d.]+/g)?.map(Number) ?? [];
  return [r, g, b].map((c, i) => c * a + background[i] * (1 - a));
}
function luminance(color: number[]): number {
  return color
    .map((c) => {
      const v = c / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a: number[], b: number[]): number {
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
it("keeps light text AA and the focus ring at least 3:1 on neutral surfaces", () => {
  for (const surface of [
    "bg-canvas",
    "bg-sidebar",
    "bg-surface",
    "bg-control",
    "bg-control-hover",
    "bg-control-active",
  ]) {
    const bg = rgb(token(surface));
    for (const role of [
      "text-primary",
      "text-secondary",
      "text-muted",
      "text-readable",
      "text-dim",
      "text-placeholder",
    ]) {
      expect(contrast(rgb(token(role), bg), bg), `${role} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(rgb(token("border-focus")), bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(rgb(token("border-strong"), bg), bg), `control border on ${surface}`).toBeGreaterThanOrEqual(3);
  }
  for (const fill of ["accent", "danger", "success", "unread-surface"]) {
    expect(contrast(rgb(token(fill)), [255, 255, 255]), fill).toBeGreaterThanOrEqual(4.5);
  }
});
it("chooses the cached or OS theme before the application module, including blocked storage", () => {
  const source = readFileSync(new URL("../public/theme-init.js", import.meta.url), "utf8");
  for (const [cached, dark, expected] of [
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["system", false, "light"],
    ["invalid", true, "dark"],
    [null, false, "light"],
  ]) {
    const document = { documentElement: { dataset: {}, style: {} } };
    runInNewContext(source, {
      document,
      localStorage: { getItem: () => cached },
      matchMedia: () => ({ matches: dark }),
    });
    expect(document.documentElement.dataset).toEqual({ theme: expected });
    expect(document.documentElement.style).toEqual({ colorScheme: expected });
  }
  const document = { documentElement: { dataset: {}, style: {} } };
  runInNewContext(source, {
    document,
    localStorage: {
      getItem: () => {
        throw new Error("blocked");
      },
    },
    matchMedia: () => ({ matches: false }),
  });
  expect(document.documentElement.dataset).toEqual({ theme: "light" });
});
