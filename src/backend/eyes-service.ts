import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AgentEyesGrant,
  AgentEyesRequest,
  AgentEyesSession,
  AgentEyesSource,
  AgentEyesState,
  StopAgentEyesInput,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import type { DynamicToolCallParams, DynamicToolResult } from "./protocol";

/**
 * COSGRAL "agent eyes": an agent looks at a window, a screen or the camera after the user
 * approves it. Windows and screens are approved once per conversation, the camera for every
 * photo. Frames stay on this computer under `storageRoot` and expire.
 */
export const EYES_NAMESPACE = "cosgral_eyes";

export const EYES_TOOL_DESCRIPTIONS = {
  list_sources:
    "List the open windows and screens on the user's computer that you can look at. The user approves screen access once per conversation.",
  look_at_window:
    "Take one picture of an open window (by windowId from list_sources, or by part of its title) and see it. Needs the user's screen approval.",
  look_at_screen:
    "Take one picture of a whole screen (the first screen by default) and see it. Needs the user's screen approval.",
  take_photo: "Take one photo with the computer's camera and see it. The user approves every photo separately.",
  watch:
    "Watch a window or screen live: 2–6 frames, 1–10 seconds apart (at most one minute). Use it to follow something that changes. The user can stop it at any time.",
} as const;

export const EYES_LIMITS = {
  minFrames: 2,
  maxFrames: 6,
  defaultFrames: 3,
  minIntervalSeconds: 1,
  maxIntervalSeconds: 10,
  defaultIntervalSeconds: 2,
  maxDimension: 1600,
  retentionMs: 24 * 60 * 60 * 1_000,
  maxStoredFrames: 200,
} as const;

const SOURCE_ID = { type: "string", maxLength: 128 } as const;
const TITLE_PART = { type: "string", maxLength: 200 } as const;

/** Codex dynamic tool namespace; Claude gets the same tools from its in-process MCP server. */
export const EYES_DYNAMIC_TOOLS = {
  type: "namespace",
  name: EYES_NAMESPACE,
  description: "Look at the user's windows, screens or camera on this computer, only with the user's approval.",
  tools: [
    {
      type: "function",
      name: "list_sources",
      description: EYES_TOOL_DESCRIPTIONS.list_sources,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "look_at_window",
      description: EYES_TOOL_DESCRIPTIONS.look_at_window,
      inputSchema: {
        type: "object",
        properties: { windowId: SOURCE_ID, titleContains: TITLE_PART },
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "look_at_screen",
      description: EYES_TOOL_DESCRIPTIONS.look_at_screen,
      inputSchema: { type: "object", properties: { screenId: SOURCE_ID }, additionalProperties: false },
    },
    {
      type: "function",
      name: "take_photo",
      description: EYES_TOOL_DESCRIPTIONS.take_photo,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "watch",
      description: EYES_TOOL_DESCRIPTIONS.watch,
      inputSchema: {
        type: "object",
        properties: {
          target: { type: "string", enum: ["window", "screen"] },
          windowId: SOURCE_ID,
          titleContains: TITLE_PART,
          screenId: SOURCE_ID,
          frames: { type: "integer", minimum: EYES_LIMITS.minFrames, maximum: EYES_LIMITS.maxFrames },
          intervalSeconds: {
            type: "number",
            minimum: EYES_LIMITS.minIntervalSeconds,
            maximum: EYES_LIMITS.maxIntervalSeconds,
          },
        },
        required: ["target"],
        additionalProperties: false,
      },
    },
  ],
} as const;

export interface EyesSourceInfo {
  id: string;
  kind: "window" | "screen";
  title: string;
  displayId: string | null;
}

export interface EyesFrame {
  mimeType: "image/jpeg" | "image/png";
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** Platform capture (Electron desktopCapturer and getUserMedia in the app, fakes in tests). */
export interface EyesCapture {
  listSources(): Promise<EyesSourceInfo[]>;
  capture(source: EyesSourceInfo, maxDimension: number): Promise<EyesFrame>;
  takePhoto(maxDimension: number): Promise<EyesFrame>;
}

export interface EyesCallContext {
  botId: string;
  /** Public COSGRAL thread id of the conversation. */
  threadId: string;
  turnId: string;
  /** Shows the approval card and resolves with the user's decision. */
  requestConsent: (request: AgentEyesRequest) => Promise<boolean>;
}

export interface EyesServiceOptions {
  capture: EyesCapture;
  storageRoot: string;
  now?: () => Date;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  retentionMs?: number;
  maxStoredFrames?: number;
}

interface ActiveSession {
  session: AgentEyesSession;
  controller: AbortController;
}

interface SavedFrame {
  path: string;
  capturedAt: string;
  frame: EyesFrame;
}

class EyesToolError extends Error {}

export class EyesService extends EventEmitter<{ changed: [state: AgentEyesState] }> {
  readonly #capture: EyesCapture;
  readonly #storageRoot: string;
  readonly #now: () => Date;
  readonly #sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  readonly #retentionMs: number;
  readonly #maxStoredFrames: number;
  readonly #sessions = new Map<string, ActiveSession>();
  readonly #grants = new Map<string, AgentEyesGrant>();
  #sequence = 0;

  constructor(options: EyesServiceOptions) {
    super();
    this.#capture = options.capture;
    this.#storageRoot = options.storageRoot;
    this.#now = options.now ?? (() => new Date());
    this.#sleep = options.sleep ?? abortableSleep;
    this.#retentionMs = options.retentionMs ?? EYES_LIMITS.retentionMs;
    this.#maxStoredFrames = options.maxStoredFrames ?? EYES_LIMITS.maxStoredFrames;
  }

  getState(): AgentEyesState {
    return {
      sessions: [...this.#sessions.values()].map((active) => ({ ...active.session })),
      grants: [...this.#grants.values()].map((grant) => ({ ...grant })),
    };
  }

  stop(input: StopAgentEyesInput): AgentEyesState {
    for (const [id, active] of this.#sessions) {
      const matches = input.sessionId
        ? id === input.sessionId
        : input.botId
          ? active.session.botId === input.botId
          : true;
      if (!matches) continue;
      active.controller.abort();
      this.#sessions.delete(id);
    }
    if (!input.sessionId) {
      for (const [key, grant] of this.#grants) {
        if (!input.botId || grant.botId === input.botId) this.#grants.delete(key);
      }
    }
    return this.#changed();
  }

  async handleDynamicTool(params: DynamicToolCallParams, context: EyesCallContext): Promise<DynamicToolResult> {
    const args: DynamicRecord = isDynamicRecord(params.arguments) ? params.arguments : {};
    try {
      switch (params.tool) {
        case "list_sources":
          return await this.#listSources(context);
        case "look_at_window":
          return await this.#lookOnce(context, await this.#findWindow(args));
        case "look_at_screen":
          return await this.#lookOnce(context, await this.#findScreen(args));
        case "take_photo":
          return await this.#takePhoto(context);
        case "watch":
          return await this.#watch(context, args);
        default:
          return failure(`Unknown ${EYES_NAMESPACE} tool: ${params.tool}.`);
      }
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  /** Removes expired frames and keeps at most `maxStoredFrames`. Returns how many files it removed. */
  async cleanup(): Promise<number> {
    const files: Array<{ path: string; modifiedAt: number; name: string }> = [];
    for (const directory of await readdir(this.#storageRoot, { withFileTypes: true }).catch(() => [])) {
      if (!directory.isDirectory()) continue;
      const folder = join(this.#storageRoot, directory.name);
      for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
        if (!entry.isFile()) continue;
        const path = join(folder, entry.name);
        const info = await stat(path).catch(() => null);
        if (info) files.push({ path, modifiedAt: info.mtimeMs, name: entry.name });
      }
    }
    const expiresBefore = this.#now().getTime() - this.#retentionMs;
    const expired = files.filter((file) => file.modifiedAt < expiresBefore);
    const fresh = files
      .filter((file) => file.modifiedAt >= expiresBefore)
      .sort((left, right) => right.modifiedAt - left.modifiedAt || right.name.localeCompare(left.name));
    const removable = [...expired, ...fresh.slice(this.#maxStoredFrames)];
    for (const file of removable) await rm(file.path, { force: true });
    return removable.length;
  }

  async #listSources(context: EyesCallContext): Promise<DynamicToolResult> {
    await this.#requireScreenGrant(context, {
      source: "screen",
      targetLabel: "Open windows and screens",
      live: false,
      frames: 0,
      intervalSeconds: null,
    });
    const sources = await this.#capture.listSources();
    return {
      success: true,
      contentItems: [
        {
          type: "inputText",
          text: JSON.stringify(sources.map(({ id, kind, title }) => ({ id, kind, title }))),
        },
      ],
    };
  }

  async #lookOnce(context: EyesCallContext, source: EyesSourceInfo): Promise<DynamicToolResult> {
    await this.#requireScreenGrant(context, {
      source: source.kind,
      targetLabel: source.title,
      live: false,
      frames: 1,
      intervalSeconds: null,
    });
    const active = this.#begin(context, source.kind, source.title, "capturing", 1, null);
    try {
      const frame = await this.#capture.capture(source, EYES_LIMITS.maxDimension);
      if (active.controller.signal.aborted) return failure("Stopped by the user before the picture was taken.");
      const saved = await this.#save(context.botId, source.kind, frame);
      return framesResult(`${describe(source)}`, [saved], null);
    } finally {
      this.#end(active.session.id);
    }
  }

  async #takePhoto(context: EyesCallContext): Promise<DynamicToolResult> {
    const allowed = await context.requestConsent({
      source: "camera",
      targetLabel: "Camera",
      live: false,
      frames: 1,
      intervalSeconds: null,
    });
    if (!allowed) throw new EyesToolError("The user did not allow a camera photo.");
    const active = this.#begin(context, "camera", "Camera", "capturing", 1, null);
    try {
      const frame = await this.#capture.takePhoto(EYES_LIMITS.maxDimension);
      if (active.controller.signal.aborted) return failure("Stopped by the user before the photo was taken.");
      const saved = await this.#save(context.botId, "camera", frame);
      return framesResult("Camera photo", [saved], null);
    } finally {
      this.#end(active.session.id);
    }
  }

  async #watch(context: EyesCallContext, args: DynamicRecord): Promise<DynamicToolResult> {
    const frames = optionalNumber(args, "frames") ?? EYES_LIMITS.defaultFrames;
    const intervalSeconds = optionalNumber(args, "intervalSeconds") ?? EYES_LIMITS.defaultIntervalSeconds;
    if (!Number.isInteger(frames) || frames < EYES_LIMITS.minFrames || frames > EYES_LIMITS.maxFrames) {
      throw new EyesToolError(`A live preview takes ${EYES_LIMITS.minFrames}–${EYES_LIMITS.maxFrames} frames.`);
    }
    if (intervalSeconds < EYES_LIMITS.minIntervalSeconds || intervalSeconds > EYES_LIMITS.maxIntervalSeconds) {
      throw new EyesToolError(
        `Frames of a live preview are ${EYES_LIMITS.minIntervalSeconds}–${EYES_LIMITS.maxIntervalSeconds} seconds apart.`,
      );
    }
    const target = optionalString(args, "target");
    if (target !== "window" && target !== "screen") throw new EyesToolError('Set target to "window" or "screen".');
    const source = target === "window" ? await this.#findWindow(args) : await this.#findScreen(args);
    await this.#requireScreenGrant(context, {
      source: source.kind,
      targetLabel: source.title,
      live: true,
      frames,
      intervalSeconds,
    });
    const intervalMs = Math.round(intervalSeconds * 1_000);
    const endsAt = new Date(this.#now().getTime() + intervalMs * (frames - 1)).toISOString();
    const active = this.#begin(context, source.kind, source.title, "watching", frames, endsAt);
    const saved: SavedFrame[] = [];
    try {
      for (let index = 0; index < frames; index += 1) {
        if (index > 0) {
          try {
            await this.#sleep(intervalMs, active.controller.signal);
          } catch {
            break;
          }
        }
        if (active.controller.signal.aborted) break;
        const frame = await this.#capture.capture(source, EYES_LIMITS.maxDimension);
        if (active.controller.signal.aborted) break;
        saved.push(await this.#save(context.botId, source.kind, frame));
        if (this.#sessions.has(active.session.id)) {
          active.session.framesCaptured = saved.length;
          this.#changed();
        }
      }
    } finally {
      this.#end(active.session.id);
    }
    const stopped = saved.length < frames ? `Stopped by the user after ${saved.length} of ${frames} frames.` : null;
    if (saved.length === 0) return failure(stopped ?? "No frames were captured.");
    return framesResult(`Live preview of ${describe(source)}`, saved, stopped);
  }

  async #requireScreenGrant(context: EyesCallContext, request: AgentEyesRequest): Promise<void> {
    const key = grantKey(context.botId, context.threadId);
    if (this.#grants.has(key)) return;
    if (!(await context.requestConsent(request))) {
      throw new EyesToolError("The user did not allow looking at the screen.");
    }
    this.#grants.set(key, {
      botId: context.botId,
      threadId: context.threadId,
      source: "screen",
      grantedAt: this.#now().toISOString(),
    });
    this.#changed();
  }

  async #findWindow(args: DynamicRecord): Promise<EyesSourceInfo> {
    const windowId = optionalString(args, "windowId");
    const titleContains = optionalString(args, "titleContains")?.toLocaleLowerCase();
    const windows = (await this.#capture.listSources()).filter((source) => source.kind === "window");
    const match = windowId
      ? windows.find((source) => source.id === windowId)
      : titleContains
        ? windows.find((source) => source.title.toLocaleLowerCase().includes(titleContains))
        : undefined;
    if (!match) {
      throw new EyesToolError(
        windowId || titleContains
          ? "No open window matches. Call list_sources to see the windows you can look at."
          : "Pass windowId or titleContains. Call list_sources to see the windows you can look at.",
      );
    }
    return match;
  }

  async #findScreen(args: DynamicRecord): Promise<EyesSourceInfo> {
    const screenId = optionalString(args, "screenId");
    const screens = (await this.#capture.listSources()).filter((source) => source.kind === "screen");
    const match = screenId ? screens.find((source) => source.id === screenId) : screens[0];
    if (!match) throw new EyesToolError("No screen is available. Call list_sources to see the screens.");
    return match;
  }

  #begin(
    context: EyesCallContext,
    source: AgentEyesSource,
    targetLabel: string,
    phase: AgentEyesSession["phase"],
    framesPlanned: number,
    endsAt: string | null,
  ): ActiveSession {
    const active: ActiveSession = {
      controller: new AbortController(),
      session: {
        id: `eyes-${randomUUID()}`,
        botId: context.botId,
        threadId: context.threadId,
        turnId: context.turnId,
        source,
        targetLabel,
        phase,
        framesCaptured: 0,
        framesPlanned,
        startedAt: this.#now().toISOString(),
        endsAt,
      },
    };
    this.#sessions.set(active.session.id, active);
    this.#changed();
    return active;
  }

  #end(sessionId: string): void {
    if (this.#sessions.delete(sessionId)) this.#changed();
  }

  async #save(botId: string, source: AgentEyesSource, frame: EyesFrame): Promise<SavedFrame> {
    const capturedAt = this.#now().toISOString();
    const folder = join(this.#storageRoot, safeSegment(botId));
    await mkdir(folder, { recursive: true });
    this.#sequence += 1;
    const extension = frame.mimeType === "image/png" ? "png" : "jpg";
    const name = `${capturedAt.replace(/[:.]/g, "-")}-${String(this.#sequence).padStart(6, "0")}-${source}.${extension}`;
    const path = join(folder, name);
    await writeFile(path, frame.bytes);
    await this.cleanup();
    return { path, capturedAt, frame };
  }

  #changed(): AgentEyesState {
    const state = this.getState();
    this.emit("changed", state);
    return state;
  }
}

function framesResult(label: string, frames: SavedFrame[], note: string | null): DynamicToolResult {
  const lines = frames.map(
    (saved, index) =>
      `${frames.length > 1 ? `Frame ${index + 1}: ` : ""}${label} at ${saved.capturedAt} (${saved.frame.width}×${saved.frame.height}). Kept only on this computer: ${saved.path}`,
  );
  if (note) lines.push(note);
  return {
    success: true,
    contentItems: [
      { type: "inputText", text: lines.join("\n") },
      ...frames.map((saved) => ({
        type: "inputImage" as const,
        imageUrl: `data:${saved.frame.mimeType};base64,${Buffer.from(saved.frame.bytes).toString("base64")}`,
      })),
    ],
  };
}

function failure(message: string): DynamicToolResult {
  return { success: false, contentItems: [{ type: "inputText", text: message }] };
}

function describe(source: EyesSourceInfo): string {
  return source.kind === "window" ? `Window "${source.title}"` : source.title;
}

function grantKey(botId: string, threadId: string): string {
  return `${botId}\u0000${threadId}`;
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "agent";
}

function optionalString(args: DynamicRecord, key: string): string | undefined {
  const value = args[key];
  return isString(value) && value.trim() ? value.trim().slice(0, 200) : undefined;
}

function optionalNumber(args: DynamicRecord, key: string): number | undefined {
  const value = args[key];
  return isNumber(value) && Number.isFinite(value) ? value : undefined;
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Stopped."));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Stopped."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
