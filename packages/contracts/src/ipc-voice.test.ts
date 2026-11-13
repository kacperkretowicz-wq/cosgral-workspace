import { describe, expect, it } from "vitest";
import {
  checkVoiceWav,
  defaultVoiceSettings,
  encodeVoiceWav,
  IPC_CHANNELS,
  isAgentEvent,
  isTranscribeResult,
  isVoiceInfo,
  isVoiceSettings,
  isVoiceShortcut,
  isVoiceState,
  readVoiceWav,
  VOICE_LIMITS,
  VOICE_SAMPLE_RATE,
} from "./ipc";

const model = {
  id: "base",
  label: "Base",
  description: "Good balance.",
  sizeBytes: 59_707_625,
  recommended: true,
  state: "downloading",
  progress: { receivedBytes: 1_000, totalBytes: 59_707_625 },
  error: null,
};
const state = {
  speech: { available: true, unavailableReason: null, speaking: false },
  transcription: {
    available: false,
    unavailableReason: "Download a speech-to-text model first.",
    consent: false,
    busy: false,
    runtime: {
      name: "whisper.cpp",
      version: "1.9.2",
      license: "MIT",
      sourceUrl: "https://github.com/ggml-org/whisper.cpp",
      sizeBytes: 8_194_445,
      state: "absent",
      progress: null,
      error: null,
    },
    models: [model],
  },
  settings: defaultVoiceSettings(),
};

describe("W3 voice contract", () => {
  it("accepts the voice state, settings, voices and transcription results", () => {
    expect(isVoiceState(state)).toBe(true);
    expect(isVoiceState({ ...state, speech: { ...state.speech, speaking: "no" } })).toBe(false);
    expect(
      isVoiceState({ ...state, transcription: { ...state.transcription, models: [{ ...model, state: "half" }] } }),
    ).toBe(false);
    expect(isVoiceSettings(defaultVoiceSettings())).toBe(true);
    expect(isVoiceSettings({ ...defaultVoiceSettings(), rate: 3 })).toBe(false);
    expect(isVoiceSettings({ ...defaultVoiceSettings(), language: "de" })).toBe(false);
    expect(
      isVoiceInfo({
        id: "Microsoft Paulina Desktop",
        name: "Microsoft Paulina Desktop",
        culture: "pl-PL",
        gender: "Female",
      }),
    ).toBe(true);
    expect(isVoiceInfo({ id: 1 })).toBe(false);
    expect(isTranscribeResult({ text: "Hello", durationMs: 1_200, language: "en", modelId: "base" })).toBe(true);
    expect(isTranscribeResult({ text: "Hello", durationMs: "1", language: "en", modelId: "base" })).toBe(false);
  });

  it("starts switched on with the system voice, normal speed, automatic language and the base model", () => {
    expect(defaultVoiceSettings()).toEqual({
      enabled: true,
      voiceId: null,
      rate: 1,
      autoRead: false,
      language: "auto",
      modelId: "base",
      shortcut: "CommandOrControl+Shift+Space",
    });
  });

  it("encodes 16 kHz mono 16-bit WAV and reads it back", () => {
    const samples = new Float32Array(VOICE_SAMPLE_RATE).map((_, index) => Math.sin(index / 10) * 2);
    const wav = encodeVoiceWav(samples);
    expect(wav.byteLength).toBe(44 + VOICE_SAMPLE_RATE * 2);
    const info = readVoiceWav(wav);
    expect(info).toMatchObject({
      sampleRate: 16_000,
      channels: 1,
      bitsPerSample: 16,
      dataOffset: 44,
      dataBytes: 32_000,
    });
    expect(info.durationMs).toBe(1_000);
    expect(checkVoiceWav(wav).durationMs).toBe(1_000);
    // Samples outside -1..1 are clipped, not wrapped.
    const clipped = encodeVoiceWav(new Float32Array([2, -2, 0.5]));
    const view = new DataView(clipped.buffer);
    expect([0, 1, 2].map((index) => view.getInt16(44 + index * 2, true))).toEqual([32_767, -32_768, 16_384]);
  });

  it("refuses audio that is not short 16 kHz mono 16-bit PCM WAV", () => {
    expect(() => readVoiceWav(new Uint8Array([1, 2, 3]))).toThrow("not a WAV file");
    const stereo = encodeVoiceWav(new Float32Array(1_600));
    new DataView(stereo.buffer).setUint16(22, 2, true);
    expect(() => checkVoiceWav(stereo)).toThrow("16 kHz mono");
    const tooLong = encodeVoiceWav(new Float32Array(VOICE_SAMPLE_RATE * (VOICE_LIMITS.audioSeconds + 1)));
    expect(() => checkVoiceWav(tooLong)).toThrow(`${VOICE_LIMITS.audioSeconds} seconds`);
    expect(() => checkVoiceWav(encodeVoiceWav(new Float32Array(10)))).toThrow("too short");
  });

  it("accepts window shortcuts with a modifier and one key", () => {
    expect(isVoiceShortcut("CommandOrControl+Shift+Space")).toBe(true);
    expect(isVoiceShortcut("Alt+F9")).toBe(true);
    expect(isVoiceShortcut("Space")).toBe(false);
    expect(isVoiceShortcut("Ctrl+Alt+Delete")).toBe(false);
    expect(isVoiceShortcut("Ctrl+Shift+")).toBe(false);
  });

  it("adds IPC channels and the voice-changed event", () => {
    expect(IPC_CHANNELS.voiceGetState).toBe("voice:get-state");
    expect(IPC_CHANNELS.voiceTranscribe).toBe("voice:transcribe");
    expect(IPC_CHANNELS.voiceDownloadModel).toBe("voice:download-model");
    expect(isAgentEvent({ type: "voice-changed", state })).toBe(true);
    expect(isAgentEvent({ type: "voice-changed", state: { speech: null } })).toBe(false);
  });
});
