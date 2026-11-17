// @vitest-environment node
import { defaultVoiceSettings, isVoiceOverview, type VoiceInfo, type VoiceState } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { buildVoiceOverview, microphoneInfo, normalizeMicrophoneStatus } from "./voice-overview";

const RUNTIME = {
  name: "whisper.cpp",
  version: "1.0.0",
  license: "MIT",
  sourceUrl: "https://example.test",
  sizeBytes: 1,
  state: "absent",
  progress: null,
  error: null,
} as const;

function state(speechAvailable: boolean): VoiceState {
  return {
    speech: {
      available: speechAvailable,
      unavailableReason: speechAvailable ? null : "Windows voices are not available here.",
      speaking: false,
    },
    transcription: {
      available: false,
      unavailableReason: "Download a model first.",
      consent: false,
      busy: false,
      runtime: { ...RUNTIME },
      models: [
        {
          id: "base",
          label: "Base",
          description: "d",
          sizeBytes: 142_000_000,
          recommended: true,
          state: "absent",
          progress: null,
          error: null,
        },
      ],
    },
    settings: defaultVoiceSettings(),
  };
}

const VOICE: VoiceInfo = { id: "v1", name: "Demo voice", culture: "pl-PL", gender: "Female" };

describe("voice overview (W12-KK)", () => {
  it("one answer: state, voices, microphone, and what this version does not offer, each with its reason", async () => {
    const overview = await buildVoiceOverview(
      { getState: async () => state(true), listVoices: async () => [VOICE] },
      microphoneInfo("granted", "win32"),
    );
    expect(isVoiceOverview(overview)).toBe(true);
    expect(overview.voices).toEqual([VOICE]);
    expect(overview.microphone).toEqual({ status: "granted", canOpenSettings: true });
    expect(overview.unavailable.map((item) => item.id)).toEqual([
      "dictation-parakeet",
      "dictation-cloud",
      "spoken-replies-neural",
      "live-voice-cloud",
    ]);
    expect(overview.unavailable.every((item) => item.reason.length > 20)).toBe(true);
    expect(overview.unavailable.find((item) => item.id === "live-voice-cloud")?.reason).toMatch(
      /keeps audio on this computer/,
    );
  });

  it("no voices are asked for where reading aloud is unavailable, and a failing list does not hide the page", async () => {
    let asked = 0;
    const off = await buildVoiceOverview(
      {
        getState: async () => state(false),
        listVoices: async () => {
          asked += 1;
          return [VOICE];
        },
      },
      microphoneInfo("unknown", "linux"),
    );
    expect(off.voices).toEqual([]);
    expect(asked).toBe(0);
    expect(off.microphone).toEqual({ status: "unknown", canOpenSettings: false });
    const failing = await buildVoiceOverview(
      {
        getState: async () => state(true),
        listVoices: async () => {
          throw new Error("no");
        },
      },
      microphoneInfo("denied", "darwin"),
    );
    expect(failing.voices).toEqual([]);
    expect(failing.microphone.canOpenSettings).toBe(true);
    expect(isVoiceOverview(failing)).toBe(true);
  });

  it("the system's word about the microphone becomes one of ours", () => {
    expect(normalizeMicrophoneStatus("granted")).toBe("granted");
    expect(normalizeMicrophoneStatus("not-determined")).toBe("not-determined");
    expect(normalizeMicrophoneStatus("something-else")).toBe("unknown");
  });

  it("the list of what is not offered is a copy: emptying one answer does not empty the next one", async () => {
    const source = { getState: async () => state(true), listVoices: async () => [] };
    const first = await buildVoiceOverview(source, microphoneInfo("granted", "win32"));
    first.unavailable.splice(0, 1);
    const second = await buildVoiceOverview(source, microphoneInfo("granted", "win32"));
    expect(second.unavailable).toHaveLength(4);
  });
});
