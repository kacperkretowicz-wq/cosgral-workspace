import { describe, expect, it, vi } from "vitest";
import { captureAgentRowTops, playAgentRowFlip, prefersReducedMotion } from "./sidebar-row-flip";

function row(id: string, top: number): HTMLElement {
  const el = document.createElement("button");
  el.className = "bot-row agent-row";
  el.dataset.agentId = id;
  Object.defineProperty(el, "getBoundingClientRect", {
    value: () => ({
      top,
      left: 0,
      right: 0,
      bottom: top + 68,
      width: 200,
      height: 68,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }),
  });
  return el;
}

describe("sidebar-row-flip", () => {
  it("reads reduced motion from matchMedia", () => {
    expect(prefersReducedMotion(() => ({ matches: true }))).toBe(true);
    expect(prefersReducedMotion(() => ({ matches: false }))).toBe(false);
  });

  it("captures tops by data-agent-id", () => {
    const root = document.createElement("nav");
    root.append(row("a", 10), row("b", 80));
    expect(Object.fromEntries(captureAgentRowTops(root))).toEqual({ a: 10, b: 80 });
  });

  it("sets an inverted translateY then clears it on the next frame", () => {
    const root = document.createElement("nav");
    const a = row("a", 80);
    const b = row("b", 10);
    root.append(a, b);
    const before = new Map([
      ["a", 10],
      ["b", 80],
    ]);
    const schedule = vi.fn((run: () => void) => run());
    expect(playAgentRowFlip(root, before, { reducedMotion: false, schedule })).toBe(2);
    expect(a.style.transform).toBe("");
    expect(b.style.transform).toBe("");
    expect(schedule).toHaveBeenCalledOnce();
  });

  it("skips when reduced motion is on or the snapshot is empty", () => {
    const root = document.createElement("nav");
    root.append(row("a", 80));
    expect(playAgentRowFlip(root, new Map([["a", 10]]), { reducedMotion: true })).toBe(0);
    expect(playAgentRowFlip(root, new Map(), { reducedMotion: false })).toBe(0);
  });

  it("records the invert transform before the scheduled clear", () => {
    const root = document.createElement("nav");
    const a = row("a", 80);
    root.append(a);
    let during = "";
    playAgentRowFlip(root, new Map([["a", 10]]), {
      reducedMotion: false,
      schedule: (run) => {
        during = a.style.transform;
        run();
      },
    });
    expect(during).toBe("translateY(-70px)");
    expect(a.style.transform).toBe("");
  });
});
