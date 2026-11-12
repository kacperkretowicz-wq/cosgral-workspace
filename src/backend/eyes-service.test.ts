// @vitest-environment node

import { mkdtemp, readdir, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { AgentEyesRequest, AgentEyesState } from "@openbot/contracts/ipc";
import type { DynamicRecord } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import {
  type EyesCallContext,
  type EyesCapture,
  type EyesFrame,
  EyesService,
  type EyesSourceInfo,
} from "./eyes-service";
import type { DynamicToolResult } from "./protocol";

const roots: string[] = [];
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

class FakeCapture implements EyesCapture {
  readonly captured: string[] = [];
  photos = 0;
  hold: Promise<void> | null = null;
  readonly sources: EyesSourceInfo[] = [
    { id: "window:1", kind: "window", title: "Notepad - notes.txt", displayId: null },
    { id: "window:2", kind: "window", title: "Calculator", displayId: null },
    { id: "screen:1", kind: "screen", title: "Screen 1", displayId: "1" },
  ];

  async listSources(): Promise<EyesSourceInfo[]> {
    return this.sources.map((source) => ({ ...source }));
  }

  async capture(source: EyesSourceInfo): Promise<EyesFrame> {
    this.captured.push(source.id);
    if (this.hold) await this.hold;
    return frame();
  }

  async takePhoto(): Promise<EyesFrame> {
    this.photos += 1;
    return frame();
  }
}

function frame(): EyesFrame {
  return { mimeType: "image/jpeg", bytes: JPEG, width: 640, height: 480 };
}

async function setup(options: { now?: () => Date; retentionMs?: number; maxStoredFrames?: number } = {}) {
  const root = await mkdtemp(join(tmpdir(), "cosgral-eyes-"));
  roots.push(root);
  const capture = new FakeCapture();
  const sleeps: number[] = [];
  const service = new EyesService({
    capture,
    storageRoot: join(root, "eyes"),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...options,
  });
  const states: AgentEyesState[] = [];
  service.on("changed", (state) => states.push(state));
  return { root, capture, service, sleeps, states };
}

function context(answers: boolean[] = [true], overrides: Partial<EyesCallContext> = {}) {
  const requests: AgentEyesRequest[] = [];
  const value: EyesCallContext = {
    botId: "chief",
    threadId: "thread-1",
    turnId: "turn-1",
    requestConsent: async (request) => {
      requests.push(request);
      return answers.shift() ?? false;
    },
    ...overrides,
  };
  return { value, requests };
}

function call(tool: string, args: DynamicRecord = {}) {
  return {
    threadId: "external-1",
    turnId: "turn-1",
    callId: `call-${tool}`,
    namespace: "cosgral_eyes",
    tool,
    arguments: args,
  };
}

function images(result: DynamicToolResult): string[] {
  return result.contentItems.flatMap((item) => (item.type === "inputImage" ? [item.imageUrl] : []));
}

function text(result: DynamicToolResult): string {
  return result.contentItems.flatMap((item) => (item.type === "inputText" ? [item.text] : [])).join("\n");
}

async function storedFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else found.push(relative(root, path));
    }
  };
  await walk(root);
  return found;
}

describe("EyesService", () => {
  it("asks once per conversation before looking at windows and screens", async () => {
    const { service, capture } = await setup();
    const first = context([true]);

    const listed = await service.handleDynamicTool(call("list_sources"), first.value);
    const looked = await service.handleDynamicTool(call("look_at_window", { titleContains: "notepad" }), first.value);
    const screen = await service.handleDynamicTool(call("look_at_screen"), first.value);

    expect(first.requests).toEqual([
      expect.objectContaining({ source: "screen", live: false, frames: 0, intervalSeconds: null }),
    ]);
    expect(listed.success).toBe(true);
    expect(text(listed)).toContain("Notepad - notes.txt");
    expect(looked.success).toBe(true);
    expect(images(looked)).toEqual([expect.stringMatching(/^data:image\/jpeg;base64,/)]);
    expect(text(looked)).toContain("Notepad - notes.txt");
    expect(images(screen)).toHaveLength(1);
    expect(capture.captured).toEqual(["window:1", "screen:1"]);
    expect(service.getState().grants).toEqual([
      expect.objectContaining({ botId: "chief", threadId: "thread-1", source: "screen" }),
    ]);

    const other = context([true], { threadId: "thread-2" });
    await service.handleDynamicTool(call("look_at_screen"), other.value);
    expect(other.requests).toHaveLength(1);
  });

  it("does not look when the user declines", async () => {
    const { service, capture } = await setup();
    const declined = context([false]);

    const result = await service.handleDynamicTool(call("look_at_window", { windowId: "window:2" }), declined.value);

    expect(result.success).toBe(false);
    expect(text(result)).toMatch(/did not allow/i);
    expect(images(result)).toEqual([]);
    expect(capture.captured).toEqual([]);
    expect(service.getState().grants).toEqual([]);
  });

  it("asks for the camera every time, separately from the screen", async () => {
    const { service, capture } = await setup();
    const conversation = context([true, true, true]);

    await service.handleDynamicTool(call("look_at_screen"), conversation.value);
    const first = await service.handleDynamicTool(call("take_photo"), conversation.value);
    const second = await service.handleDynamicTool(call("take_photo"), conversation.value);

    expect(conversation.requests.map((request) => request.source)).toEqual(["screen", "camera", "camera"]);
    expect(images(first)).toHaveLength(1);
    expect(images(second)).toHaveLength(1);
    expect(capture.photos).toBe(2);
    expect(service.getState().grants.map((grant) => grant.source)).toEqual(["screen"]);
  });

  it("shows who is looking while a capture runs", async () => {
    const { service, capture, states } = await setup();
    let release: () => void = () => undefined;
    capture.hold = new Promise((resolve) => {
      release = resolve;
    });
    const pending = service.handleDynamicTool(call("look_at_window", { windowId: "window:2" }), context([true]).value);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.getState().sessions).toEqual([
      expect.objectContaining({
        botId: "chief",
        threadId: "thread-1",
        source: "window",
        targetLabel: "Calculator",
        phase: "capturing",
      }),
    ]);
    release();
    await pending;

    expect(service.getState().sessions).toEqual([]);
    expect(states.some((state) => state.sessions.length === 1)).toBe(true);
    expect(states.at(-1)?.sessions).toEqual([]);
  });

  it("watches several frames at an interval and reports progress", async () => {
    const { service, sleeps, states } = await setup();

    const result = await service.handleDynamicTool(
      call("watch", { target: "window", titleContains: "Calculator", frames: 3, intervalSeconds: 2 }),
      context([true]).value,
    );

    expect(result.success).toBe(true);
    expect(images(result)).toHaveLength(3);
    expect(sleeps).toEqual([2_000, 2_000]);
    expect(states.flatMap((state) => state.sessions.map((session) => session.framesCaptured))).toEqual(
      expect.arrayContaining([0, 1, 2]),
    );
    expect(states.flatMap((state) => state.sessions)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: "watching", framesPlanned: 3, endsAt: expect.any(String) }),
      ]),
    );
    expect(service.getState().sessions).toEqual([]);
  });

  it("stops a live preview early and asks again after a stop", async () => {
    const root = await mkdtemp(join(tmpdir(), "cosgral-eyes-"));
    roots.push(root);
    const capture = new FakeCapture();
    let service: EyesService | null = null;
    service = new EyesService({
      capture,
      storageRoot: join(root, "eyes"),
      sleep: (_ms, signal) =>
        new Promise((resolve, reject) => {
          service?.stop({ botId: "chief" });
          if (signal.aborted) reject(new Error("aborted"));
          else resolve();
        }),
    });
    const conversation = context([true, true]);

    const result = await service.handleDynamicTool(
      call("watch", { target: "screen", frames: 5, intervalSeconds: 1 }),
      conversation.value,
    );

    expect(images(result)).toHaveLength(1);
    expect(text(result)).toMatch(/stopped by the user/i);
    expect(service.getState()).toEqual({ sessions: [], grants: [] });
    await service.handleDynamicTool(call("look_at_screen"), conversation.value);
    expect(conversation.requests).toHaveLength(2);
  });

  it("rejects live previews outside the limits", async () => {
    const { service, capture } = await setup();
    const conversation = context([true]);

    const tooMany = await service.handleDynamicTool(
      call("watch", { target: "screen", frames: 20 }),
      conversation.value,
    );
    const tooFast = await service.handleDynamicTool(
      call("watch", { target: "screen", frames: 3, intervalSeconds: 0.2 }),
      conversation.value,
    );

    expect(tooMany.success).toBe(false);
    expect(text(tooMany)).toMatch(/2.+6 frames/i);
    expect(tooFast.success).toBe(false);
    expect(text(tooFast)).toMatch(/1.+10 seconds/i);
    expect(capture.captured).toEqual([]);
  });

  it("explains when no window matches", async () => {
    const { service, capture } = await setup();

    const result = await service.handleDynamicTool(
      call("look_at_window", { titleContains: "Spreadsheet" }),
      context([true]).value,
    );

    expect(result.success).toBe(false);
    expect(text(result)).toMatch(/list_sources/);
    expect(capture.captured).toEqual([]);
  });

  it("keeps frames only in its own folder and removes expired ones", async () => {
    let now = new Date("2026-11-12T10:00:00.000Z");
    const { root, service } = await setup({ now: () => now, retentionMs: 60_000, maxStoredFrames: 2 });
    const conversation = context([true]);

    await service.handleDynamicTool(call("look_at_screen"), conversation.value);
    await service.handleDynamicTool(call("look_at_screen"), conversation.value);
    await service.handleDynamicTool(call("look_at_screen"), conversation.value);
    const kept = await storedFiles(join(root, "eyes"));

    expect(kept).toHaveLength(2);
    expect(kept.every((path) => path.startsWith("chief") && path.endsWith(".jpg"))).toBe(true);

    for (const path of kept) {
      const old = new Date("2026-11-12T09:00:00.000Z");
      await utimes(join(root, "eyes", path), old, old);
    }
    now = new Date("2026-11-12T10:30:00.000Z");
    expect(await service.cleanup()).toBe(2);
    expect(await storedFiles(join(root, "eyes"))).toEqual([]);
    await expect(stat(join(root, "eyes"))).resolves.toBeTruthy();
  });

  it("stops everything and forgets approvals on stop()", async () => {
    const { service } = await setup();
    await service.handleDynamicTool(call("look_at_screen"), context([true]).value);
    await service.handleDynamicTool(
      call("look_at_screen"),
      context([true], { botId: "sales", threadId: "thread-9" }).value,
    );

    expect(service.getState().grants).toHaveLength(2);
    expect(service.stop({ botId: "sales" }).grants.map((grant) => grant.botId)).toEqual(["chief"]);
    expect(service.stop({})).toEqual({ sessions: [], grants: [] });
  });
});
