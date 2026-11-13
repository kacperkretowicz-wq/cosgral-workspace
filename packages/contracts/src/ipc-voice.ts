// COSGRAL W3: voice on this computer (parity row 34, spec W3 §3). Text to speech uses the voices installed in
// Windows; speech to text runs whisper.cpp with a model the person downloads on request. Audio never leaves the
// computer, and nothing is downloaded or run before the person approves it on a confirm card in Needs you. The speech
// and transcription helpers are separate processes, so a crash of one never takes the window down.

import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const VOICE_SAMPLE_RATE = 16_000;

export const VOICE_LIMITS = {
  /** Characters read aloud in one go. */
  speakText: 5_000,
  /** Longest recording for one transcription. */
  audioSeconds: 120,
  /** Shortest recording worth sending (0.1 s). */
  audioMinMs: 100,
  /** 16 kHz mono 16-bit for `audioSeconds`, plus a little room for WAV chunks. */
  audioBytes: VOICE_SAMPLE_RATE * 2 * 120 + 4_096,
  /** Characters of transcribed text returned at most. */
  transcriptText: 20_000,
  rateMin: 0.5,
  rateMax: 2,
  voiceId: 200,
  shortcut: 64,
} as const;

export const VOICE_LANGUAGES = ["auto", "en", "pl"] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

/** Downloadable whisper.cpp models (all multilingual, quantized; sizes in the state). */
export const VOICE_MODEL_IDS = ["tiny", "base", "small"] as const;
export type VoiceModelId = (typeof VOICE_MODEL_IDS)[number];

/** "absent": not on this computer; "downloading": see `progress`; "ready": checked and usable; "error": see `error`. */
export const VOICE_ASSET_STATES = ["absent", "downloading", "ready", "error"] as const;
export type VoiceAssetState = (typeof VOICE_ASSET_STATES)[number];

export interface VoiceDownloadProgress {
  receivedBytes: number;
  totalBytes: number;
}

export interface VoiceModel {
  id: VoiceModelId;
  label: string;
  description: string;
  sizeBytes: number;
  /** The default choice. */
  recommended: boolean;
  state: VoiceAssetState;
  progress: VoiceDownloadProgress | null;
  error: string | null;
}

/** whisper.cpp itself (the program that turns audio into text), downloaded together with the first model. */
export interface VoiceRuntime {
  name: string;
  version: string;
  license: string;
  /** Project page to show the person. */
  sourceUrl: string;
  sizeBytes: number;
  state: VoiceAssetState;
  progress: VoiceDownloadProgress | null;
  error: string | null;
}

export interface VoiceSettings {
  /** Off: no record button, no reading aloud. */
  enabled: boolean;
  /** A Windows voice id from `listVoices`, or null for the system default. */
  voiceId: string | null;
  /** Reading speed, 0.5–2 (1 = normal). */
  rate: number;
  /** Read new agent replies aloud. */
  autoRead: boolean;
  /** Language of recordings; "auto" lets whisper.cpp detect it. */
  language: VoiceLanguage;
  /** The model that transcribes. */
  modelId: VoiceModelId;
  /** Push-to-talk shortcut inside the program window (Electron accelerator), or null for none. */
  shortcut: string | null;
}

export interface VoiceState {
  speech: {
    /** Windows voices can be used (false outside Windows or without System.Speech). */
    available: boolean;
    unavailableReason: string | null;
    speaking: boolean;
  };
  transcription: {
    /** Voice is on, consent given, whisper.cpp and the chosen model are ready. */
    available: boolean;
    unavailableReason: string | null;
    /** The person approved downloading and running whisper.cpp on this computer. */
    consent: boolean;
    /** A recording is being transcribed. */
    busy: boolean;
    runtime: VoiceRuntime;
    models: VoiceModel[];
  };
  settings: VoiceSettings;
}

export interface VoiceInfo {
  /** Pass this to `speak` or the settings. */
  id: string;
  name: string;
  /** e.g. "pl-PL". */
  culture: string;
  gender: string;
}

export interface SpeakInput {
  text: string;
  /** The settings' voice when omitted. */
  voiceId?: string | null;
  /** The settings' speed when omitted. */
  rate?: number;
}

export interface SpeakResult {
  /** "stopped": `stop` or a newer `speak` ended it. */
  status: "done" | "stopped";
}

export interface VoiceModelIdInput {
  modelId: VoiceModelId;
}

export interface DownloadVoiceModelResult {
  /** "started": follow `voice-changed`; "ready": nothing to download; "declined": the person said no on the card. */
  status: "started" | "ready" | "declined";
}

export interface TranscribeInput {
  /** 16 kHz mono 16-bit PCM WAV (see `encodeVoiceWav`), at most `VOICE_LIMITS.audioSeconds`. */
  audio: Uint8Array;
  /** The settings' language when omitted. */
  language?: VoiceLanguage;
}

export interface TranscribeResult {
  /** Empty when nothing was said. Goes into the composer draft; sending stays a separate step. */
  text: string;
  durationMs: number;
  language: VoiceLanguage;
  modelId: VoiceModelId;
}

export type UpdateVoiceSettingsInput = Partial<VoiceSettings>;

export function defaultVoiceSettings(): VoiceSettings {
  return {
    enabled: true,
    voiceId: null,
    rate: 1,
    autoRead: false,
    language: "auto",
    modelId: "base",
    shortcut: "CommandOrControl+Shift+Space",
  };
}

const MODIFIERS = new Set([
  "CommandOrControl",
  "CmdOrCtrl",
  "Control",
  "Ctrl",
  "Alt",
  "Option",
  "Shift",
  "Super",
  "Meta",
]);
const KEY =
  /^([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|Space|Enter|Tab|Backspace|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right)$/;

/** A modifier or two (or three) and one key, e.g. "CommandOrControl+Shift+Space". */
export function isVoiceShortcut(value: unknown): value is string {
  if (!isString(value) || value.length > VOICE_LIMITS.shortcut) return false;
  const parts = value.split("+");
  const key = parts.pop() ?? "";
  if (parts.length < 1 || parts.length > 3 || !KEY.test(key)) return false;
  return parts.every((part) => MODIFIERS.has(part)) && new Set(parts).size === parts.length;
}

export interface VoiceWavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** Byte offset of the samples. */
  dataOffset: number;
  dataBytes: number;
  durationMs: number;
}

/** 16 kHz mono 16-bit PCM WAV from samples in -1..1 (values outside are clipped). */
export function encodeVoiceWav(samples: Float32Array, sampleRate: number = VOICE_SAMPLE_RATE): Uint8Array {
  const dataBytes = samples.length * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) bytes[offset + index] = text.charCodeAt(index);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(44 + index * 2, sample < 0 ? Math.round(sample * 32_768) : Math.round(sample * 32_767), true);
  }
  return bytes;
}

/** The format of a PCM WAV file; throws when it is not one. */
export function readVoiceWav(bytes: Uint8Array): VoiceWavInfo {
  const text = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.byteLength < 44 || text(0) !== "RIFF" || text(8) !== "WAVE") {
    throw new Error("The recording is not a WAV file.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let format: { channels: number; sampleRate: number; bitsPerSample: number; code: number } | null = null;
  while (offset + 8 <= bytes.byteLength) {
    const id = text(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt " && size >= 16 && body + 16 <= bytes.byteLength) {
      format = {
        code: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!format) break;
      if (format.code !== 1) throw new Error("The recording must be PCM WAV.");
      const dataBytes = Math.min(size, bytes.byteLength - body);
      const frameBytes = Math.max(1, (format.channels * format.bitsPerSample) / 8);
      const durationMs = Math.round(((dataBytes / frameBytes) * 1_000) / Math.max(1, format.sampleRate));
      return {
        sampleRate: format.sampleRate,
        channels: format.channels,
        bitsPerSample: format.bitsPerSample,
        dataOffset: body,
        dataBytes,
        durationMs,
      };
    }
    offset = body + size + (size % 2);
  }
  throw new Error("The recording is not a WAV file with audio data.");
}

/** What `transcribe` accepts: 16 kHz mono 16-bit PCM, 0.1 s to `VOICE_LIMITS.audioSeconds`. */
export function checkVoiceWav(bytes: Uint8Array): VoiceWavInfo {
  if (bytes.byteLength > VOICE_LIMITS.audioBytes) {
    throw new Error(`The recording is longer than ${VOICE_LIMITS.audioSeconds} seconds.`);
  }
  const info = readVoiceWav(bytes);
  if (info.sampleRate !== VOICE_SAMPLE_RATE || info.channels !== 1 || info.bitsPerSample !== 16) {
    throw new Error("The recording must be 16 kHz mono 16-bit WAV (see encodeVoiceWav).");
  }
  if (info.durationMs > VOICE_LIMITS.audioSeconds * 1_000) {
    throw new Error(`The recording is longer than ${VOICE_LIMITS.audioSeconds} seconds.`);
  }
  if (info.durationMs < VOICE_LIMITS.audioMinMs) throw new Error("The recording is too short.");
  return info;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isProgress(value: unknown): value is VoiceDownloadProgress | null {
  return value === null || (isDynamicRecord(value) && isNumber(value.receivedBytes) && isNumber(value.totalBytes));
}

function isAsset(value: unknown): boolean {
  return (
    isDynamicRecord(value) &&
    isNumber(value.sizeBytes) &&
    isOneOf(VOICE_ASSET_STATES, value.state) &&
    isProgress(value.progress) &&
    isNullableString(value.error)
  );
}

export function isVoiceSettings(value: unknown): value is VoiceSettings {
  return (
    isDynamicRecord(value) &&
    isBoolean(value.enabled) &&
    (value.voiceId === null || (isString(value.voiceId) && value.voiceId.length <= VOICE_LIMITS.voiceId)) &&
    isNumber(value.rate) &&
    value.rate >= VOICE_LIMITS.rateMin &&
    value.rate <= VOICE_LIMITS.rateMax &&
    isBoolean(value.autoRead) &&
    isOneOf(VOICE_LANGUAGES, value.language) &&
    isOneOf(VOICE_MODEL_IDS, value.modelId) &&
    (value.shortcut === null || isVoiceShortcut(value.shortcut))
  );
}

export function isVoiceState(value: unknown): value is VoiceState {
  if (!isDynamicRecord(value) || !isDynamicRecord(value.speech) || !isDynamicRecord(value.transcription)) return false;
  const { speech, transcription } = value;
  return (
    isBoolean(speech.available) &&
    isNullableString(speech.unavailableReason) &&
    isBoolean(speech.speaking) &&
    isBoolean(transcription.available) &&
    isNullableString(transcription.unavailableReason) &&
    isBoolean(transcription.consent) &&
    isBoolean(transcription.busy) &&
    isAsset(transcription.runtime) &&
    isDynamicRecord(transcription.runtime) &&
    isString(transcription.runtime.version) &&
    Array.isArray(transcription.models) &&
    transcription.models.every(
      (model) =>
        isAsset(model) && isDynamicRecord(model) && isOneOf(VOICE_MODEL_IDS, model.id) && isString(model.label),
    ) &&
    isVoiceSettings(value.settings)
  );
}

export function isVoiceInfo(value: unknown): value is VoiceInfo {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.culture) &&
    isString(value.gender)
  );
}

export function isTranscribeResult(value: unknown): value is TranscribeResult {
  return (
    isDynamicRecord(value) &&
    isString(value.text) &&
    isNumber(value.durationMs) &&
    isOneOf(VOICE_LANGUAGES, value.language) &&
    isOneOf(VOICE_MODEL_IDS, value.modelId)
  );
}

/**
 * COSGRAL W3: the window API (`window.openbot.voice`). This computer only. Every change comes as `voice-changed`
 * (the whole state, also download progress). The first download asks on a confirm card in Needs you.
 */
export interface VoiceDesktopApi {
  getState: () => Promise<VoiceState>;
  /** Windows voices (enabled ones). */
  listVoices: () => Promise<VoiceInfo[]>;
  /** Resolves when reading ends; a new `speak` stops the previous one. */
  speak: (input: SpeakInput) => Promise<SpeakResult>;
  stop: () => Promise<VoiceState>;
  /** Downloads whisper.cpp (if needed) and the model, checks their SHA-256; progress comes as `voice-changed`. */
  downloadModel: (input: VoiceModelIdInput) => Promise<DownloadVoiceModelResult>;
  cancelDownload: (input: VoiceModelIdInput) => Promise<VoiceState>;
  deleteModel: (input: VoiceModelIdInput) => Promise<VoiceState>;
  /** Removes whisper.cpp and takes the consent back (the next download asks again). */
  deleteRuntime: () => Promise<VoiceState>;
  transcribe: (input: TranscribeInput) => Promise<TranscribeResult>;
  updateSettings: (input: UpdateVoiceSettingsInput) => Promise<VoiceSettings>;
}
