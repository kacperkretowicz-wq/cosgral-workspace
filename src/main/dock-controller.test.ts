import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentActivity, AgentEvent, BotSummary, PendingAgentRequest } from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DockController, type DockHost, type Rect } from "./dock-controller";

function botSummary(id: string, name: string): BotSummary {
  return {
    id,
    name,
    role: "",
    description: "",
    notifications: true,
    model: "gpt-5.6-terra",
    reasoningEffort: "medium",
    threadId: null,
    workspacePath: "",
    preview: "",
    updatedAt: null,
    avatarSeed: id,
    avatarHue: null,
    avatarUrl: null,
  };
}

class FakeHost implements DockHost {
  dock: Rect | null = null;
  islandShown = false;
  mainOpen = true;
  mainFocused = false;
  shownMain: Array<{ botId?: string } | undefined> = [];
  events: AgentEvent[] = [];
  quits = 0;
  showDockWindow(bounds: Rect) {
    this.dock = bounds;
  }
  hideDockWindow() {
    this.dock = null;
  }
  setIslandVisible(visible: boolean) {
    this.islandShown = visible;
  }
  workArea(): Rect {
    return { x: 0, y: 0, width: 1920, height: 1040 };
  }
  showMainWindow(target?: { botId?: string }) {
    this.mainOpen = true;
    this.shownMain.push(target);
  }
  mainWindowOpen() {
    return this.mainOpen;
  }
  mainWindowFocused() {
    return this.mainFocused;
  }
  emit(event: AgentEvent) {
    this.events.push(event);
  }
  quit() {
    this.quits += 1;
  }
}

describe("DockController", () => {
  let dir: string;
  let host: FakeHost;
  let pending: PendingAgentRequest[];
  let bots: Array<{ id: string; name: string }>;
  const activities: AgentActivity[] = [];
  const create = () =>
    new DockController({
      host,
      filePath: join(dir, "dock.json"),
      listBots: () => bots,
      listPending: () => pending,
      listActivity: () => activities,
    });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dock-controller-"));
    host = new FakeHost();
    pending = [];
    bots = [
      { id: "a", name: "Ada" },
      { id: "b", name: "Bob" },
    ];
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("opens the dock at the right edge with the width of its size, and saves the change", () => {
    const dock = create();
    dock.start();
    expect(host.dock).toBeNull();
    const state = dock.setVisible({ visible: true });
    expect(state.visible).toBe(true);
    expect(host.dock).toEqual({ x: 1920 - 360 - 12, y: 12, width: 360, height: 1040 - 24 });
    dock.setSize({ size: "small" });
    expect(host.dock?.width).toBe(280);
    expect(host.events.at(-1)).toMatchObject({ type: "dock-changed", state: { size: "small", visible: true } });
    expect(create().getState().size).toBe("small");
  });

  it("opens the dock again after a restart where it was, kept on screen", () => {
    const dock = create();
    dock.setVisible({ visible: true });
    dock.dockMoved({ x: 5000, y: 100, width: 360, height: 600 });
    const again = create();
    again.start();
    expect(host.dock).toEqual({ x: 1920 - 360, y: 100, width: 360, height: 600 });
  });

  it("keeps running in the dock when the main window closes, and quits when the dock is hidden", () => {
    const dock = create();
    dock.setVisible({ visible: true });
    host.mainOpen = false;
    dock.mainWindowClosed();
    expect(host.quits).toBe(0);
    expect(dock.getState().mainWindowOpen).toBe(false);
    dock.dockWindowClosed();
    expect(host.quits).toBe(1);
  });

  it("quits with the main window when the dock is hidden", () => {
    const dock = create();
    host.mainOpen = false;
    dock.mainWindowClosed();
    expect(host.quits).toBe(1);
  });

  it("closing the dock window by hand hides it while the main window stays", () => {
    const dock = create();
    dock.setVisible({ visible: true });
    dock.dockWindowClosed();
    expect(host.quits).toBe(0);
    expect(dock.getState().visible).toBe(false);
  });

  it("shows the island only when it is enabled and has something to show", () => {
    const dock = create();
    dock.start();
    expect(host.islandShown).toBe(false);
    pending = [
      {
        kind: "browser-takeover",
        phase: "requested",
        request: {
          requestId: "tk",
          botId: "b",
          threadId: "t",
          turnId: "u",
          tabId: "x",
          url: "https://example.com",
          reason: "Sign in",
          createdAt: "2026-11-13T10:00:00Z",
        },
      },
    ];
    dock.observe({ type: "browser-takeover-changed", requestId: "tk", botId: "b", phase: "requested" });
    expect(host.islandShown).toBe(true);
    expect(host.events.at(-1)).toMatchObject({ type: "island-changed", state: { status: { kind: "takeover" } } });
    dock.setIslandEnabled({ enabled: false });
    expect(host.islandShown).toBe(false);
    expect(dock.getIslandState().enabled).toBe(false);
  });

  it("a click on the island opens the main window at the card", () => {
    const dock = create();
    pending = [
      {
        kind: "prompt",
        requestId: 3,
        botId: "a",
        threadId: "t",
        turnId: "u",
        questions: [],
        createdAt: "2026-11-13T10:00:00Z",
      },
    ];
    dock.observe({ type: "prompt-resolved", requestId: 0, botId: "a", resolution: "answered" });
    dock.activateIsland();
    expect(host.shownMain).toEqual([{ botId: "a", request: { kind: "prompt", requestId: 3 } }]);
  });

  it("drops pins of deleted agents when the agent list changes", () => {
    const dock = create();
    dock.pin({ botId: "a" });
    dock.pin({ botId: "b" });
    bots = [{ id: "a", name: "Ada" }];
    // An empty list (agents not loaded yet) never wipes the dock.
    dock.observe({ type: "bots-changed", bots: [] });
    expect(dock.getState().pins).toHaveLength(2);
    dock.observe({ type: "bots-changed", bots: [botSummary("a", "Ada")] });
    expect(dock.getState().pins.map((pin) => pin.botId)).toEqual(["a"]);
  });

  it("does not forward its own events back into the tracker as changes", () => {
    const dock = create();
    const before = host.events.length;
    dock.observe({ type: "dock-changed", state: dock.getState() });
    expect(host.events.length).toBe(before);
  });
});
