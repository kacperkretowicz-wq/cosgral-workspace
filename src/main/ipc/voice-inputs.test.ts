// @vitest-environment node
import { encodeVoiceWav, VOICE_LIMITS } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { parseSpeak, parseTranscribe, parseUpdateVoiceSettings, parseVoiceModelId } from "./voice-inputs";

describe("voice IPC inputs", () => {
  it("accepts speak, model ids and settings with the right types only", () => {
    expect(parseSpeak({ text: "Hi", voiceId: null, rate: 1.5 })).toEqual({ text: "Hi", voiceId: null, rate: 1.5 });
    expect(() => parseSpeak({ text: 5 })).toThrow("text");
    expect(() => parseSpeak({ text: "x".repeat(VOICE_LIMITS.speakText * 2 + 1) })).toThrow("too long");
    expect(parseVoiceModelId({ modelId: "base" })).toEqual({ modelId: "base" });
    expect(() => parseVoiceModelId({ modelId: "../../evil" })).toThrow("modelId");
    expect(parseUpdateVoiceSettings({ rate: 1.25, language: "pl", shortcut: null, extra: true })).toEqual({
      rate: 1.25,
      language: "pl",
      shortcut: null,
    });
    expect(() => parseUpdateVoiceSettings({ enabled: "yes" })).toThrow("enabled");
    expect(() => parseUpdateVoiceSettings({ modelId: "huge" })).toThrow("modelId");
  });

  it("accepts WAV bytes up to the size limit", () => {
    const audio = encodeVoiceWav(new Float32Array(1_600));
    expect(parseTranscribe({ audio, language: "en" })).toEqual({ audio, language: "en" });
    expect(() => parseTranscribe({ audio: [1, 2, 3] })).toThrow("WAV bytes");
    expect(() => parseTranscribe({ audio: new Uint8Array(VOICE_LIMITS.audioBytes + 1) })).toThrow("seconds");
    expect(() => parseTranscribe({ audio, language: "de" })).toThrow("language");
  });
});
