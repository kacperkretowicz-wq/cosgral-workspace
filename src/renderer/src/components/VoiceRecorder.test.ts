import { checkVoiceWav } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { samplesToVoiceWav } from "./VoiceRecorder";

describe("voice recording", () => {
  it("converts 48 kHz input into 16 kHz mono WAV", () => {
    const wav = samplesToVoiceWav([new Float32Array(4800).fill(0.25)], 48000);
    const info = checkVoiceWav(wav);
    expect(info.sampleRate).toBe(16000);
    expect(info.channels).toBe(1);
    expect(info.durationMs).toBe(100);
  });
});
