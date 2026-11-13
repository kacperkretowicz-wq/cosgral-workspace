// COSGRAL W3: voice on this computer (parity row 34). Reading aloud goes through a speech driver (Windows voices);
// speech to text runs whisper.cpp from the voice folder with a model from the pinned catalog. Nothing is downloaded or
// run before the person approves it on a confirm card; every file is checked (size, SHA-256) and stays inside the
// voice folder. The helpers are separate processes: when one fails, the program and the window keep running.

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  type AgentEvent,
  checkVoiceWav,
  type DownloadVoiceModelResult,
  type DraftPreviewResolution,
  defaultVoiceSettings,
  isVoiceShortcut,
  type SpeakInput,
  type SpeakResult,
  type TranscribeInput,
  type TranscribeResult,
  type UpdateVoiceSettingsInput,
  VOICE_LANGUAGES,
  VOICE_LIMITS,
  VOICE_MODEL_IDS,
  type VoiceAssetState,
  type VoiceInfo,
  type VoiceLanguage,
  type VoiceModel,
  type VoiceModelId,
  type VoiceModelIdInput,
  type VoiceSettings,
  type VoiceState,
} from "@openbot/contracts/ipc";
import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "@openbot/contracts/runtime-values";
import { VOICE_CATALOG, type VoiceCatalog, type VoiceModelAsset } from "./voice-catalog";
import { type DownloadSource, downloadVerified } from "./voice-download";
import { extractZip } from "./voice-zip";

export interface SpeechDriver {
  /** Null when voices can be used. */
  unavailableReason: () => string | null;
  listVoices: () => Promise<VoiceInfo[]>;
  /** Resolves when the text was read; the signal stops it (then it may reject). */
  speak: (input: { text: string; voiceId: string | null; rate: number }, signal: AbortSignal) => Promise<void>;
}

export interface TranscriptionRunner {
  /** Runs whisper.cpp once and returns its text output. */
  run: (
    input: {
      executable: string;
      model: string;
      audioPath: string;
      language: VoiceLanguage;
      threads: number;
    },
    signal: AbortSignal,
  ) => Promise<string>;
}

export interface VoiceServiceOptions {
  /** The voice folder, e.g. <userData>/voice. Everything is written inside it. */
  root: string;
  speech: SpeechDriver | null;
  runner: TranscriptionRunner;
  source: DownloadSource;
  /** A confirm card in Needs you; rejects when no card can be shown. */
  confirm: (input: { title: string; preview: string }) => Promise<DraftPreviewResolution>;
  emit: (event: AgentEvent) => void;
  catalog?: VoiceCatalog;
  platform?: NodeJS.Platform;
  arch?: string;
  /** whisper.cpp threads (default: half the processors, 1–4). */
  threads?: number;
  /** Least time between progress events. */
  progressIntervalMs?: number;
}

type AssetKey = "runtime" | VoiceModelId;

interface DownloadJob {
  modelId: VoiceModelId;
  controller: AbortController;
  phase: "runtime" | "model";
  received: number;
  done: Promise<void>;
}

interface Installed {
  /** whisper-cli.exe of the installed runtime. */
  executable: string | null;
  models: Set<VoiceModelId>;
}

const SPECIAL_TOKENS = /\[[A-Z_ ]+\]/g;

export class VoiceService {
  readonly #options: VoiceServiceOptions;
  readonly #catalog: VoiceCatalog;
  readonly #root: string;
  readonly #platform: NodeJS.Platform;
  readonly #arch: string;
  readonly #threads: number;
  #ready: Promise<void> | null = null;
  #settings: VoiceSettings = defaultVoiceSettings();
  #consentAt: string | null = null;
  #installed: Installed = { executable: null, models: new Set() };
  readonly #errors = new Map<AssetKey, string>();
  #job: DownloadJob | null = null;
  #asking = false;
  #speech: { controller: AbortController; run: Promise<void> } | null = null;
  #transcriptions = 0;
  #transcribeQueue: Promise<unknown> = Promise.resolve();
  readonly #transcribeControllers = new Set<AbortController>();
  #lastProgressAt = 0;
  #voices: { at: number; voices: VoiceInfo[] } | null = null;

  constructor(options: VoiceServiceOptions) {
    this.#options = options;
    this.#catalog = options.catalog ?? VOICE_CATALOG;
    this.#root = resolve(options.root);
    this.#platform = options.platform ?? process.platform;
    this.#arch = options.arch ?? process.arch;
    this.#threads = options.threads ?? Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));
  }

  /** Reads the settings and what is installed; removes leftovers of an interrupted download or transcription. */
  init(): Promise<void> {
    this.#ready ??= (async () => {
      try {
        const saved = JSON.parse(await readFile(this.#path("settings.json"), "utf8"));
        if (isDynamicRecord(saved)) {
          this.#settings = mergeSaved(saved.settings);
          this.#consentAt = isString(saved.consentAt) ? saved.consentAt : null;
        }
      } catch {
        // No settings yet (or unreadable): defaults.
      }
      await Promise.all([
        rm(this.#path("downloads"), { recursive: true, force: true }),
        rm(this.#path("tmp"), { recursive: true, force: true }),
      ]);
      this.#scan();
    })();
    return this.#ready;
  }

  async getState(): Promise<VoiceState> {
    await this.init();
    return this.#state();
  }

  /** Waits for the running download (tests and shutdown). */
  async whenIdle(): Promise<void> {
    await this.#job?.done;
  }

  async listVoices(): Promise<VoiceInfo[]> {
    await this.init();
    const driver = this.#options.speech;
    if (!driver || driver.unavailableReason()) return [];
    if (this.#voices && Date.now() - this.#voices.at < 60_000) return this.#voices.voices;
    const voices = await driver.listVoices();
    this.#voices = { at: Date.now(), voices };
    return voices;
  }

  async speak(input: SpeakInput): Promise<SpeakResult> {
    await this.init();
    if (!this.#settings.enabled) throw new Error("Voice is switched off in Settings → Voice.");
    const driver = this.#options.speech;
    const unavailable = this.#speechUnavailable();
    if (!driver || unavailable) throw new Error(unavailable ?? "Reading aloud is not available.");
    const text = isString(input.text) ? input.text.trim() : "";
    if (!text) throw new Error("There is no text to read.");
    if (text.length > VOICE_LIMITS.speakText) {
      throw new Error(`Read at most ${VOICE_LIMITS.speakText} characters at a time.`);
    }
    const rate = input.rate ?? this.#settings.rate;
    if (!isRate(rate))
      throw new Error(`The speed must be between ${VOICE_LIMITS.rateMin} and ${VOICE_LIMITS.rateMax}.`);
    const voiceId = input.voiceId === undefined ? this.#settings.voiceId : input.voiceId;
    if (voiceId !== null && (!isString(voiceId) || voiceId.length > VOICE_LIMITS.voiceId)) {
      throw new Error("Choose a voice from the list.");
    }
    const previous = this.#speech;
    previous?.controller.abort();
    await previous?.run.catch(() => undefined);
    const controller = new AbortController();
    const run = driver.speak({ text, voiceId, rate }, controller.signal);
    const current = { controller, run };
    this.#speech = current;
    this.#emit();
    try {
      await run;
      return { status: controller.signal.aborted ? "stopped" : "done" };
    } catch (error) {
      if (controller.signal.aborted) return { status: "stopped" };
      throw error;
    } finally {
      if (this.#speech === current) {
        this.#speech = null;
        this.#emit();
      }
    }
  }

  async stop(): Promise<VoiceState> {
    await this.init();
    const current = this.#speech;
    current?.controller.abort();
    await current?.run.catch(() => undefined);
    return this.#state();
  }

  /** Starts the download of whisper.cpp (when missing) and the model; the first one asks on a card. */
  async downloadModel(input: VoiceModelIdInput): Promise<DownloadVoiceModelResult> {
    await this.init();
    const model = this.#model(input.modelId);
    const unsupported = this.#platformUnsupported();
    if (unsupported) throw new Error(unsupported);
    if (this.#installed.executable && this.#installed.models.has(model.id)) return { status: "ready" };
    if (this.#job) {
      if (this.#job.modelId === model.id) return { status: "started" };
      throw new Error("Another voice download is running; wait for it or cancel it.");
    }
    if (!this.#consentAt) {
      if (this.#asking) throw new Error("Answer the open card in Needs you first.");
      this.#asking = true;
      let decision: DraftPreviewResolution;
      try {
        decision = await this.#options.confirm(this.#consentCard(model));
      } finally {
        this.#asking = false;
      }
      if (decision !== "send") return { status: "declined" };
      this.#consentAt = new Date().toISOString();
      await this.#save();
    }
    if (this.#job) return { status: "started" };
    this.#startJob(model);
    return { status: "started" };
  }

  async cancelDownload(input: VoiceModelIdInput): Promise<VoiceState> {
    await this.init();
    this.#model(input.modelId);
    const job = this.#job;
    if (job && job.modelId === input.modelId) {
      job.controller.abort();
      await job.done;
    }
    return this.#state();
  }

  async deleteModel(input: VoiceModelIdInput): Promise<VoiceState> {
    await this.init();
    const model = this.#model(input.modelId);
    if (this.#job?.modelId === model.id) throw new Error("Cancel the download first.");
    if (this.#transcriptions > 0) throw new Error("Wait until the recording is transcribed.");
    await rm(this.#path("models", model.fileName), { force: true });
    await rm(this.#path("models", `${model.fileName}.json`), { force: true });
    this.#errors.delete(model.id);
    this.#scan();
    this.#emit();
    return this.#state();
  }

  /** Removes whisper.cpp and takes the consent back; models stay until deleted. */
  async deleteRuntime(): Promise<VoiceState> {
    await this.init();
    if (this.#job) throw new Error("Cancel the download first.");
    if (this.#transcriptions > 0) throw new Error("Wait until the recording is transcribed.");
    await rm(this.#path("runtime"), { recursive: true, force: true });
    this.#errors.delete("runtime");
    this.#consentAt = null;
    await this.#save();
    this.#scan();
    this.#emit();
    return this.#state();
  }

  async transcribe(input: TranscribeInput): Promise<TranscribeResult> {
    await this.init();
    const blocked = this.#transcriptionUnavailable();
    if (blocked) throw new Error(blocked);
    if (!(input.audio instanceof Uint8Array)) throw new Error("The recording must be WAV bytes.");
    const info = checkVoiceWav(input.audio);
    const language = input.language ?? this.#settings.language;
    if (!isOneOf(VOICE_LANGUAGES, language)) throw new Error("Unknown language.");
    const model = this.#model(this.#settings.modelId);
    const run = async (): Promise<TranscribeResult> => {
      const executable = this.#installed.executable;
      if (!executable || !this.#installed.models.has(model.id)) {
        throw new Error(this.#transcriptionUnavailable() ?? "Speech to text is not ready.");
      }
      const audioPath = this.#path("tmp", `${randomUUID()}.wav`);
      const controller = new AbortController();
      const timeoutMs = Math.max(60_000, info.durationMs * 4);
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      this.#transcribeControllers.add(controller);
      this.#transcriptions += 1;
      this.#emit();
      try {
        await mkdir(dirname(audioPath), { recursive: true });
        await writeFile(audioPath, input.audio);
        let output: string;
        try {
          output = await this.#options.runner.run(
            {
              executable,
              model: this.#path("models", model.fileName),
              audioPath,
              language,
              threads: this.#threads,
            },
            controller.signal,
          );
        } catch (error) {
          if (controller.signal.aborted) throw new Error("The transcription took too long and was stopped.");
          throw error;
        }
        const text = output.replace(SPECIAL_TOKENS, " ").replace(/\s+/g, " ").trim();
        return {
          text: text.slice(0, VOICE_LIMITS.transcriptText),
          durationMs: info.durationMs,
          language,
          modelId: model.id,
        };
      } finally {
        clearTimeout(timer);
        this.#transcribeControllers.delete(controller);
        this.#transcriptions -= 1;
        await rm(audioPath, { force: true });
        this.#emit();
      }
    };
    const result = this.#transcribeQueue.then(run, run);
    this.#transcribeQueue = result.catch(() => undefined);
    return result;
  }

  async updateSettings(input: UpdateVoiceSettingsInput): Promise<VoiceSettings> {
    await this.init();
    if (!isDynamicRecord(input)) throw new Error("Expected voice settings.");
    const next = { ...this.#settings };
    if (input.enabled !== undefined) {
      if (!isBoolean(input.enabled)) throw new Error("enabled must be true or false.");
      next.enabled = input.enabled;
    }
    if (input.autoRead !== undefined) {
      if (!isBoolean(input.autoRead)) throw new Error("autoRead must be true or false.");
      next.autoRead = input.autoRead;
    }
    if (input.voiceId !== undefined) {
      if (input.voiceId !== null && (!isString(input.voiceId) || !input.voiceId.trim())) {
        throw new Error("Choose a voice from the list.");
      }
      if (isString(input.voiceId) && input.voiceId.length > VOICE_LIMITS.voiceId)
        throw new Error("The voice id is too long.");
      next.voiceId = input.voiceId;
    }
    if (input.rate !== undefined) {
      if (!isRate(input.rate)) {
        throw new Error(`The speed must be between ${VOICE_LIMITS.rateMin} and ${VOICE_LIMITS.rateMax}.`);
      }
      next.rate = input.rate;
    }
    if (input.language !== undefined) {
      if (!isOneOf(VOICE_LANGUAGES, input.language))
        throw new Error(`The language is one of: ${VOICE_LANGUAGES.join(", ")}.`);
      next.language = input.language;
    }
    if (input.modelId !== undefined) {
      if (!isOneOf(VOICE_MODEL_IDS, input.modelId))
        throw new Error(`The model is one of: ${VOICE_MODEL_IDS.join(", ")}.`);
      next.modelId = input.modelId;
    }
    if (input.shortcut !== undefined) {
      if (input.shortcut !== null && !isVoiceShortcut(input.shortcut)) {
        throw new Error('The shortcut needs a modifier and one key, e.g. "CommandOrControl+Shift+Space".');
      }
      next.shortcut = input.shortcut;
    }
    this.#settings = next;
    if (!next.enabled) this.#speech?.controller.abort();
    await this.#save();
    this.#emit();
    return { ...next };
  }

  /** Program shutdown: stop reading, the download and transcriptions. */
  async close(): Promise<void> {
    this.#speech?.controller.abort();
    this.#job?.controller.abort();
    for (const controller of this.#transcribeControllers) controller.abort();
    await this.#job?.done;
  }

  #startJob(model: VoiceModelAsset): void {
    const controller = new AbortController();
    const job: DownloadJob = {
      modelId: model.id,
      controller,
      phase: this.#installed.executable ? "model" : "runtime",
      received: 0,
      done: Promise.resolve(),
    };
    this.#job = job;
    this.#errors.delete(model.id);
    if (job.phase === "runtime") this.#errors.delete("runtime");
    this.#emit();
    job.done = (async () => {
      let failed: AssetKey = job.phase === "runtime" ? "runtime" : model.id;
      try {
        if (job.phase === "runtime") {
          await this.#installRuntime(job);
          job.phase = "model";
          job.received = 0;
          this.#emit();
        }
        failed = model.id;
        await downloadVerified({
          source: this.#options.source,
          url: model.url,
          sha256: model.sha256,
          sizeBytes: model.sizeBytes,
          destination: this.#path("models", model.fileName),
          signal: controller.signal,
          onProgress: (received) => this.#progress(job, received, model.sizeBytes),
        });
        await writeFile(
          this.#path("models", `${model.fileName}.json`),
          JSON.stringify({ sha256: model.sha256, sizeBytes: model.sizeBytes }),
        );
      } catch (error) {
        if (!controller.signal.aborted) this.#errors.set(failed, errorText(error));
      } finally {
        this.#job = null;
        this.#scan();
        this.#emit();
      }
    })();
  }

  async #installRuntime(job: DownloadJob): Promise<void> {
    const runtime = this.#catalog.runtime;
    const archive = this.#path("downloads", runtime.fileName);
    const target = this.#path("runtime", runtime.version);
    const staging = this.#path("runtime", `.staging-${randomUUID()}`);
    try {
      await downloadVerified({
        source: this.#options.source,
        url: runtime.url,
        sha256: runtime.sha256,
        sizeBytes: runtime.sizeBytes,
        destination: archive,
        signal: job.controller.signal,
        onProgress: (received) => this.#progress(job, received, runtime.sizeBytes),
      });
      const executable = runtime.executable.toLowerCase();
      const files = await extractZip(await readFile(archive), staging, {
        allow: (path) => {
          const name = basename(path).toLowerCase();
          return name === executable || name.endsWith(".dll") || name.startsWith("license");
        },
      });
      const found = files.find((path) => basename(path).toLowerCase() === executable);
      if (!found) throw new Error(`The whisper.cpp package has no ${runtime.executable}.`);
      await writeFile(
        join(staging, "installed.json"),
        JSON.stringify({ version: runtime.version, sha256: runtime.sha256, executable: found }),
      );
      if (job.controller.signal.aborted) throw new Error("The download was cancelled.");
      await rm(target, { recursive: true, force: true });
      await rename(staging, target);
    } finally {
      await rm(staging, { recursive: true, force: true });
      await rm(archive, { force: true });
    }
  }

  #progress(job: DownloadJob, received: number, total: number): void {
    job.received = received;
    const now = Date.now();
    const interval = this.#options.progressIntervalMs ?? 250;
    if (received === total || now - this.#lastProgressAt >= interval) {
      this.#lastProgressAt = now;
      this.#emit();
    }
  }

  /** What is installed and verified (marker files written after the SHA-256 check). */
  #scan(): void {
    const runtime = this.#catalog.runtime;
    let executable: string | null = null;
    try {
      const folder = this.#path("runtime", runtime.version);
      const marker = JSON.parse(readTextSync(join(folder, "installed.json")));
      if (isDynamicRecord(marker) && marker.sha256 === runtime.sha256 && isString(marker.executable)) {
        const path = this.#inside(folder, ...marker.executable.split("/"));
        if (existsSync(path)) executable = path;
      }
    } catch {
      executable = null;
    }
    const models = new Set<VoiceModelId>();
    for (const model of this.#catalog.models) {
      try {
        const file = this.#path("models", model.fileName);
        const marker = JSON.parse(readTextSync(`${file}.json`));
        if (isDynamicRecord(marker) && marker.sha256 === model.sha256 && statSync(file).size === model.sizeBytes) {
          models.add(model.id);
        }
      } catch {
        // Not installed.
      }
    }
    this.#installed = { executable, models };
  }

  #state(): VoiceState {
    const runtime = this.#catalog.runtime;
    const job = this.#job;
    const runtimeState: VoiceAssetState =
      job?.phase === "runtime"
        ? "downloading"
        : this.#errors.has("runtime")
          ? "error"
          : this.#installed.executable
            ? "ready"
            : "absent";
    const models = this.#catalog.models.map((model): VoiceModel => {
      const downloading = job?.modelId === model.id;
      return {
        id: model.id,
        label: model.label,
        description: model.description,
        sizeBytes: model.sizeBytes,
        recommended: model.recommended,
        state: downloading
          ? "downloading"
          : this.#errors.has(model.id)
            ? "error"
            : this.#installed.models.has(model.id)
              ? "ready"
              : "absent",
        progress: downloading
          ? { receivedBytes: job.phase === "model" ? job.received : 0, totalBytes: model.sizeBytes }
          : null,
        error: downloading ? null : (this.#errors.get(model.id) ?? null),
      };
    });
    const speechUnavailable = this.#speechUnavailable();
    const transcriptionUnavailable = this.#transcriptionUnavailable();
    return {
      speech: {
        available: speechUnavailable === null,
        unavailableReason: speechUnavailable,
        speaking: this.#speech !== null,
      },
      transcription: {
        available: transcriptionUnavailable === null,
        unavailableReason: transcriptionUnavailable,
        consent: this.#consentAt !== null,
        busy: this.#transcriptions > 0,
        runtime: {
          name: runtime.name,
          version: runtime.version,
          license: runtime.license,
          sourceUrl: runtime.sourceUrl,
          sizeBytes: runtime.sizeBytes,
          state: runtimeState,
          progress: job?.phase === "runtime" ? { receivedBytes: job.received, totalBytes: runtime.sizeBytes } : null,
          error: runtimeState === "error" ? (this.#errors.get("runtime") ?? null) : null,
        },
        models,
      },
      settings: { ...this.#settings },
    };
  }

  #speechUnavailable(): string | null {
    const driver = this.#options.speech;
    if (!driver) {
      return this.#platform === "win32"
        ? "Reading aloud is not available on this computer."
        : "Reading aloud uses Windows voices; it works on Windows in this version.";
    }
    return driver.unavailableReason() ?? (this.#settings.enabled ? null : "Voice is switched off in Settings → Voice.");
  }

  #platformUnsupported(): string | null {
    return this.#platform === "win32" && this.#arch === "x64"
      ? null
      : "Speech to text works on Windows (x64) in this version.";
  }

  #transcriptionUnavailable(): string | null {
    const unsupported = this.#platformUnsupported();
    if (unsupported) return unsupported;
    if (!this.#settings.enabled) return "Voice is switched off in Settings → Voice.";
    if (!this.#consentAt)
      return "Download a speech-to-text model first; the program asks before it downloads anything.";
    if (!this.#installed.executable) return "whisper.cpp is not downloaded yet; download a model.";
    const model = this.#model(this.#settings.modelId);
    if (!this.#installed.models.has(model.id)) return `The ${model.label} model is not downloaded yet.`;
    return null;
  }

  #consentCard(model: VoiceModelAsset): { title: string; preview: string } {
    const runtime = this.#catalog.runtime;
    const lines = ["To turn your recordings into text on this computer, COSGRAL Workspace downloads:"];
    if (!this.#installed.executable) {
      lines.push(
        `- ${runtime.name} ${runtime.version} (${size(runtime.sizeBytes)}, ${runtime.license}) from ${bare(runtime.sourceUrl)}`,
      );
    }
    lines.push(`- the ${model.label} model (${size(model.sizeBytes)}, ${model.license}) from ${bare(model.sourceUrl)}`);
    lines.push(
      "Each file is checked against a fixed SHA-256 before use.",
      `${runtime.name} then runs on this computer only when you record; your audio never leaves this computer.`,
      "You can delete both at any time in Settings → Voice.",
    );
    return { title: "Download speech to text?", preview: lines.join("\n") };
  }

  #model(id: unknown): VoiceModelAsset {
    const model = this.#catalog.models.find((candidate) => candidate.id === id);
    if (!model) throw new Error(`The model is one of: ${this.#catalog.models.map((item) => item.id).join(", ")}.`);
    return model;
  }

  async #save(): Promise<void> {
    const file = this.#path("settings.json");
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ settings: this.#settings, consentAt: this.#consentAt }, null, 2));
    await rename(temporary, file);
  }

  #emit(): void {
    this.#options.emit({ type: "voice-changed", state: this.#state() });
  }

  #path(...parts: string[]): string {
    return this.#inside(this.#root, ...parts);
  }

  /** A path inside `base`; anything that would leave it is refused. */
  #inside(base: string, ...parts: string[]): string {
    const path = resolve(base, ...parts);
    const between = relative(this.#root, path);
    if (between === ".." || between.startsWith(`..${sep}`) || isAbsolute(between)) {
      throw new Error("Refusing to use a path outside the voice folder.");
    }
    return path;
  }
}

function mergeSaved(value: unknown): VoiceSettings {
  const settings = defaultVoiceSettings();
  if (!isDynamicRecord(value)) return settings;
  if (isBoolean(value.enabled)) settings.enabled = value.enabled;
  if (isBoolean(value.autoRead)) settings.autoRead = value.autoRead;
  if (value.voiceId === null || (isString(value.voiceId) && value.voiceId.length <= VOICE_LIMITS.voiceId)) {
    settings.voiceId = value.voiceId;
  }
  if (isRate(value.rate)) settings.rate = value.rate;
  if (isOneOf(VOICE_LANGUAGES, value.language)) settings.language = value.language;
  if (isOneOf(VOICE_MODEL_IDS, value.modelId)) settings.modelId = value.modelId;
  if (value.shortcut === null || isVoiceShortcut(value.shortcut)) settings.shortcut = value.shortcut;
  return settings;
}

function isRate(value: unknown): value is number {
  return isNumber(value) && Number.isFinite(value) && value >= VOICE_LIMITS.rateMin && value <= VOICE_LIMITS.rateMax;
}

/** Small marker files only. */
function readTextSync(path: string): string {
  return readFileSync(path, "utf8");
}

function size(bytes: number): string {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1_000))} KB`;
}

function bare(url: string): string {
  return url.replace(/^https:\/\//, "");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
