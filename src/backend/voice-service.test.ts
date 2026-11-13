// @vitest-environment node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  type AgentEvent,
  type DraftPreviewResolution,
  encodeVoiceWav,
  isVoiceState,
  VOICE_LIMITS,
  type VoiceState,
} from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { zip } from "./testing/zip-writer";
import type { VoiceCatalog } from "./voice-catalog";
import type { DownloadSource } from "./voice-download";
import { type SpeechDriver, type TranscriptionRunner, VoiceService } from "./voice-service";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const RUNTIME_URL = "https://github.com/ggml-org/whisper.cpp/releases/download/v9.9.9/whisper-bin-x64.zip";
const MODEL_URL = (file: string) => `https://huggingface.co/ggerganov/whisper.cpp/resolve/rev/${file}`;

function catalog(runtimeZip: Buffer, models: Record<string, Buffer>): VoiceCatalog {
  const asset = (id: "tiny" | "base" | "small", data: Buffer) => ({
    id,
    label: id[0]?.toUpperCase() + id.slice(1),
    description: `${id} model`,
    fileName: `ggml-${id}.bin`,
    url: MODEL_URL(`ggml-${id}.bin`),
    sha256: sha(data),
    sizeBytes: data.length,
    recommended: id === "base",
    license: "MIT",
    sourceUrl: "https://huggingface.co/ggerganov/whisper.cpp",
  });
  return {
    runtime: {
      name: "whisper.cpp",
      version: "9.9.9",
      url: RUNTIME_URL,
      sha256: sha(runtimeZip),
      sizeBytes: runtimeZip.length,
      fileName: "whisper-bin-x64.zip",
      license: "MIT",
      sourceUrl: "https://github.com/ggml-org/whisper.cpp",
      executable: "whisper-cli.exe",
    },
    models: (["tiny", "base", "small"] as const).map((id) => asset(id, models[id] ?? Buffer.alloc(10))),
  };
}

const RUNTIME_ZIP = zip([
  { name: "Release/whisper-cli.exe", content: "MZ fake whisper" },
  { name: "Release/whisper.dll", content: "MZ fake dll" },
  { name: "Release/whisper-server.exe", content: "MZ not needed" },
]);
const MODELS = { tiny: Buffer.alloc(3_000, 1), base: Buffer.alloc(5_000, 2), small: Buffer.alloc(7_000, 3) };

function fakeSource(files: Map<string, Buffer>, options: { slow?: boolean } = {}): DownloadSource & { urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    open: async (url, signal) => {
      urls.push(url);
      const data = files.get(url);
      if (!data) throw new Error(`No such file: ${url}`);
      return {
        totalBytes: data.length,
        body: (async function* () {
          for (let offset = 0; offset < data.length; offset += 1_000) {
            if (signal.aborted) throw new Error("aborted");
            if (options.slow) await new Promise((resolve) => setTimeout(resolve, 20));
            yield data.subarray(offset, offset + 1_000);
          }
        })(),
      };
    },
  };
}

function fakeSpeech(): SpeechDriver & {
  spoken: Array<{ text: string; voiceId: string | null; rate: number }>;
  finish: () => void;
} {
  let release: (() => void) | null = null;
  const spoken: Array<{ text: string; voiceId: string | null; rate: number }> = [];
  return {
    spoken,
    finish: () => release?.(),
    unavailableReason: () => null,
    listVoices: async () => [{ id: "Voice A", name: "Voice A", culture: "pl-PL", gender: "Female" }],
    speak: (input, signal) =>
      new Promise<void>((resolve, reject) => {
        spoken.push(input);
        release = resolve;
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
  };
}

type RunnerCall = Parameters<TranscriptionRunner["run"]>[0] & { audioExisted: boolean };

function fakeRunner(text = " Hello there. "): TranscriptionRunner & { calls: RunnerCall[] } {
  const calls: RunnerCall[] = [];
  return {
    calls,
    run: async (input) => {
      calls.push({ ...input, audioExisted: existsSync(input.audioPath) });
      return text;
    },
  };
}

async function setup(
  options: {
    decision?: DraftPreviewResolution;
    platform?: NodeJS.Platform;
    files?: Map<string, Buffer>;
    slow?: boolean;
    runnerText?: string;
    root?: string;
  } = {},
) {
  const root = options.root ?? (await mkdtemp(join(tmpdir(), "voice-service-")));
  if (!options.root) roots.push(root);
  const files =
    options.files ??
    new Map<string, Buffer>([
      [RUNTIME_URL, RUNTIME_ZIP],
      ...Object.entries(MODELS).map(([id, data]): [string, Buffer] => [MODEL_URL(`ggml-${id}.bin`), data]),
    ]);
  const events: AgentEvent[] = [];
  const cards: Array<{ title: string; preview: string }> = [];
  const decision = { value: options.decision ?? ("send" satisfies DraftPreviewResolution) };
  const speech = fakeSpeech();
  const runner = fakeRunner(options.runnerText);
  const source = fakeSource(files, { slow: options.slow });
  const voice = new VoiceService({
    root,
    speech,
    runner,
    source,
    catalog: catalog(RUNTIME_ZIP, MODELS),
    platform: options.platform ?? "win32",
    arch: "x64",
    threads: 2,
    confirm: async (input) => {
      cards.push(input);
      return decision.value;
    },
    emit: (event) => events.push(event),
    progressIntervalMs: 0,
  });
  await voice.init();
  return { root, voice, events, cards, decision, speech, runner, source };
}

const states = (events: AgentEvent[]): VoiceState[] =>
  events.flatMap((event) => (event.type === "voice-changed" ? [event.state] : []));
const modelState = (state: VoiceState, id: string) => state.transcription.models.find((model) => model.id === id);

async function filesUnder(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => relative(root, join(entry.parentPath, entry.name)));
}

describe("voice state and settings", () => {
  it("starts with Windows voices and no speech-to-text until a model is downloaded", async () => {
    const { voice } = await setup();
    const state = await voice.getState();
    expect(isVoiceState(state)).toBe(true);
    expect(state.speech).toEqual({ available: true, unavailableReason: null, speaking: false });
    expect(state.transcription).toMatchObject({ available: false, consent: false, busy: false });
    expect(state.transcription.unavailableReason).toContain("Download");
    expect(state.transcription.runtime).toMatchObject({ state: "absent", version: "9.9.9", license: "MIT" });
    expect(state.transcription.models.map((model) => [model.id, model.state])).toEqual([
      ["tiny", "absent"],
      ["base", "absent"],
      ["small", "absent"],
    ]);
  });

  it("saves settings, checks every value and keeps them after a restart", async () => {
    const first = await setup();
    const saved = await first.voice.updateSettings({ rate: 1.5, language: "pl", voiceId: "Voice A", autoRead: true });
    expect(saved).toMatchObject({ rate: 1.5, language: "pl", voiceId: "Voice A", autoRead: true });
    expect(states(first.events).at(-1)?.settings.rate).toBe(1.5);
    for (const bad of [
      { rate: 3 },
      { language: "de" },
      { shortcut: "Space" },
      { modelId: "huge" },
      { voiceId: "x".repeat(VOICE_LIMITS.voiceId + 1) },
      { enabled: "yes" },
    ]) {
      // Values arrive from a window as JSON; the engine checks them again.
      await expect(first.voice.updateSettings(JSON.parse(JSON.stringify(bad))), JSON.stringify(bad)).rejects.toThrow();
    }
    const again = await setup({ root: first.root });
    expect((await again.voice.getState()).settings).toMatchObject({ rate: 1.5, language: "pl", voiceId: "Voice A" });
  });
});

describe("model download", () => {
  it("asks on a card before the first download; a refusal downloads nothing", async () => {
    const { voice, cards, source, root } = await setup({ decision: "keep-draft" });
    expect(await voice.downloadModel({ modelId: "base" })).toEqual({ status: "declined" });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.preview).toContain("github.com/ggml-org/whisper.cpp");
    expect(cards[0]?.preview).toContain("huggingface.co/ggerganov/whisper.cpp");
    expect(cards[0]?.preview).toContain("never leaves this computer");
    expect(source.urls).toEqual([]);
    expect((await voice.getState()).transcription.consent).toBe(false);
    expect(await filesUnder(root)).toEqual([]);
  });

  it("downloads whisper.cpp and the model after approval, checks them and keeps only the needed files", async () => {
    const { voice, cards, events, root, source } = await setup();
    expect(await voice.downloadModel({ modelId: "base" })).toEqual({ status: "started" });
    await voice.whenIdle();
    const state = await voice.getState();
    expect(state.transcription.consent).toBe(true);
    expect(state.transcription.runtime.state).toBe("ready");
    expect(modelState(state, "base")?.state).toBe("ready");
    expect(state.transcription.available).toBe(true);
    expect(states(events).some((item) => modelState(item, "base")?.state === "downloading")).toBe(true);
    expect(states(events).some((item) => (modelState(item, "base")?.progress?.receivedBytes ?? 0) > 0)).toBe(true);
    const files = (await filesUnder(root)).map((file) => file.replaceAll("\\", "/")).sort();
    expect(files).toEqual([
      "models/ggml-base.bin",
      "models/ggml-base.bin.json",
      "runtime/9.9.9/Release/whisper-cli.exe",
      "runtime/9.9.9/Release/whisper.dll",
      "runtime/9.9.9/installed.json",
      "settings.json",
    ]);
    // A second model needs no new card and no second runtime download.
    expect(await voice.downloadModel({ modelId: "tiny" })).toEqual({ status: "started" });
    await voice.whenIdle();
    expect(cards).toHaveLength(1);
    expect(source.urls.filter((url) => url === RUNTIME_URL)).toHaveLength(1);
    expect(await voice.downloadModel({ modelId: "tiny" })).toEqual({ status: "ready" });
  });

  it("marks a file that fails the check as an error and leaves nothing behind", async () => {
    const files = new Map<string, Buffer>([
      [RUNTIME_URL, RUNTIME_ZIP],
      [MODEL_URL("ggml-base.bin"), Buffer.alloc(5_000, 9)],
    ]);
    const { voice, root } = await setup({ files });
    await voice.downloadModel({ modelId: "base" });
    await voice.whenIdle();
    const state = await voice.getState();
    expect(modelState(state, "base")).toMatchObject({ state: "error", progress: null });
    expect(modelState(state, "base")?.error).toContain("SHA-256");
    expect(state.transcription.available).toBe(false);
    expect((await filesUnder(root)).some((file) => file.includes("ggml-base") || file.endsWith(".part"))).toBe(false);
  });

  it("refuses a package without whisper-cli.exe", async () => {
    const empty = zip([{ name: "Release/other.dll", content: "x" }]);
    const files = new Map<string, Buffer>([[RUNTIME_URL, empty]]);
    const root = await mkdtemp(join(tmpdir(), "voice-service-"));
    roots.push(root);
    const voice = new VoiceService({
      root,
      speech: null,
      runner: fakeRunner(),
      source: fakeSource(files),
      catalog: catalog(empty, MODELS),
      platform: "win32",
      arch: "x64",
      confirm: async () => "send",
      emit: () => undefined,
      progressIntervalMs: 0,
    });
    await voice.init();
    await voice.downloadModel({ modelId: "base" });
    await voice.whenIdle();
    const state = await voice.getState();
    expect(state.transcription.runtime.state).toBe("error");
    expect(state.transcription.runtime.error).toContain("whisper-cli.exe");
    expect(existsSync(join(root, "runtime", "9.9.9"))).toBe(false);
  });

  it("cancels a download, deletes a model, and deleting whisper.cpp takes the consent back", async () => {
    const { voice, root } = await setup({ slow: true });
    await voice.downloadModel({ modelId: "base" });
    await voice.cancelDownload({ modelId: "base" });
    await voice.whenIdle();
    let state = await voice.getState();
    expect(modelState(state, "base")?.state).toBe("absent");
    expect((await filesUnder(root)).some((file) => file.endsWith(".part"))).toBe(false);

    await voice.downloadModel({ modelId: "base" });
    await voice.whenIdle();
    state = await voice.deleteModel({ modelId: "base" });
    expect(modelState(state, "base")?.state).toBe("absent");
    expect(existsSync(join(root, "models", "ggml-base.bin"))).toBe(false);
    state = await voice.deleteRuntime();
    expect(state.transcription.runtime.state).toBe("absent");
    expect(state.transcription.consent).toBe(false);
    expect(existsSync(join(root, "runtime"))).toBe(false);
  });

  it("works only on Windows x64 in this version", async () => {
    const { voice, cards } = await setup({ platform: "linux" });
    await expect(voice.downloadModel({ modelId: "base" })).rejects.toThrow("Windows");
    expect(cards).toEqual([]);
    expect((await voice.getState()).transcription.unavailableReason).toContain("Windows");
  });
});

describe("transcription", () => {
  const wav = encodeVoiceWav(new Float32Array(16_000));

  it("refuses before consent, without a model, when switched off, and for audio it cannot read", async () => {
    const { voice } = await setup();
    await expect(voice.transcribe({ audio: wav })).rejects.toThrow("Download");
    await voice.downloadModel({ modelId: "tiny" });
    await voice.whenIdle();
    await expect(voice.transcribe({ audio: wav })).rejects.toThrow("Base");
    await voice.updateSettings({ modelId: "tiny" });
    await expect(voice.transcribe({ audio: new Uint8Array([1, 2, 3]) })).rejects.toThrow("WAV");
    await voice.updateSettings({ enabled: false });
    await expect(voice.transcribe({ audio: wav })).rejects.toThrow("switched off");
  });

  it("runs whisper.cpp on a temporary file inside the voice folder and deletes it afterwards", async () => {
    const { voice, runner, root } = await setup({ runnerText: " [BLANK_AUDIO]\n Hello   there. \n" });
    await voice.downloadModel({ modelId: "base" });
    await voice.whenIdle();
    const result = await voice.transcribe({ audio: wav, language: "pl" });
    expect(result).toEqual({ text: "Hello there.", durationMs: 1_000, language: "pl", modelId: "base" });
    const call = runner.calls[0];
    expect(call?.audioExisted).toBe(true);
    expect(call?.audioPath.startsWith(join(root, "tmp"))).toBe(true);
    expect(call?.model).toBe(join(root, "models", "ggml-base.bin"));
    expect(call?.executable).toBe(join(root, "runtime", "9.9.9", "Release", "whisper-cli.exe"));
    expect(call).toMatchObject({ language: "pl", threads: 2 });
    expect(existsSync(call?.audioPath ?? "")).toBe(false);
    expect((await voice.getState()).transcription.busy).toBe(false);
  });
});

describe("reading aloud", () => {
  it("reads with the settings' voice and speed, shows speaking, and a new text stops the old one", async () => {
    const { voice, speech, events } = await setup();
    await voice.updateSettings({ voiceId: "Voice A", rate: 1.25 });
    const first = voice.speak({ text: "First answer." });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await voice.getState()).speech.speaking).toBe(true);
    const second = voice.speak({ text: "Second answer.", rate: 0.75 });
    expect(await first).toEqual({ status: "stopped" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    speech.finish();
    expect(await second).toEqual({ status: "done" });
    expect(speech.spoken).toEqual([
      { text: "First answer.", voiceId: "Voice A", rate: 1.25 },
      { text: "Second answer.", voiceId: "Voice A", rate: 0.75 },
    ]);
    expect((await voice.getState()).speech.speaking).toBe(false);
    expect(states(events).some((state) => state.speech.speaking)).toBe(true);
  });

  it("stops at once, and refuses empty, too long or switched-off reading", async () => {
    const { voice } = await setup();
    const running = voice.speak({ text: "Long answer." });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await voice.stop();
    expect(await running).toEqual({ status: "stopped" });
    await expect(voice.speak({ text: "   " })).rejects.toThrow("text");
    await expect(voice.speak({ text: "x".repeat(VOICE_LIMITS.speakText + 1) })).rejects.toThrow(
      String(VOICE_LIMITS.speakText),
    );
    await expect(voice.speak({ text: "Hi", rate: 5 })).rejects.toThrow("0.5");
    await voice.updateSettings({ enabled: false });
    await expect(voice.speak({ text: "Hi" })).rejects.toThrow("switched off");
    expect(await voice.listVoices()).toEqual([{ id: "Voice A", name: "Voice A", culture: "pl-PL", gender: "Female" }]);
  });

  it("explains when this computer has no Windows voices", async () => {
    const root = await mkdtemp(join(tmpdir(), "voice-service-"));
    roots.push(root);
    const voice = new VoiceService({
      root,
      speech: null,
      runner: fakeRunner(),
      source: fakeSource(new Map()),
      platform: "linux",
      arch: "x64",
      confirm: async () => "send",
      emit: () => undefined,
    });
    await voice.init();
    const state = await voice.getState();
    expect(state.speech.available).toBe(false);
    expect(state.speech.unavailableReason).toContain("Windows");
    await expect(voice.speak({ text: "Hi" })).rejects.toThrow("Windows");
    expect(await voice.listVoices()).toEqual([]);
  });
});
