import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "ui-recent-a11y.css"), "utf8");

describe("ui-recent-a11y.css", () => {
  it("defines focus-visible rings for recent screens", () => {
    expect(css).toContain(".chat-side-panel-launcher-item:focus-visible");
    expect(css).toContain(".agent-cards .agent-card-row:focus-visible");
    expect(css).toContain(".workflow-prompt-text:focus-visible");
    expect(css).toContain(".cosgral-panel-state .ui-button:focus-visible");
    expect(css).toContain(".tasks-scopes .ui-button:focus-visible");
    expect(css).toContain(".appearance-settings .ui-switch-input:focus-visible");
    expect(css).toContain(".page-rail-button:focus-visible");
    expect(css).toContain(".sidebar .bot-row:focus-visible");
    expect(css).toContain(".mk-gallery .mk-card:focus-visible");
  });

  it("respects reduced motion, high contrast, and forced colors", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (prefers-contrast: more)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("animation: none");
    expect(css).toContain(".tasks-screen-note");
    expect(css).toContain(".sidebar .bot-row-preview");
  });
});
