import type { VoiceInfo, VoiceState } from "@openbot/contracts/ipc";
import { render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceSettings } from "./VoiceSettings";

afterEach(() => vi.unstubAllGlobals());

function state(): VoiceState {
  return {
    speech: { available: true, unavailableReason: null, speaking: false },
    transcription: {
      available: false,
      unavailableReason: "Download a model first.",
      consent: false,
      busy: false,
      runtime: {
        name: "whisper.cpp",
        version: "1.0.0",
        license: "MIT",
        sourceUrl: "https://example.com",
        sizeBytes: 0,
        state: "absent",
        progress: null,
        error: null,
      },
      models: [],
    },
    settings: {
      enabled: true,
      voiceId: null,
      rate: 1,
      autoRead: false,
      language: "auto",
      modelId: "base",
      shortcut: null,
    },
  };
}

describe("voice settings", () => {
  it("shows the settings at once and fills the voice list when Windows answers", async () => {
    let answer: (voices: VoiceInfo[]) => void = () => undefined;
    vi.stubGlobal("openbot", {
      voice: {
        getState: vi.fn().mockResolvedValue(state()),
        listVoices: vi.fn(() => new Promise<VoiceInfo[]>((resolve) => (answer = resolve))),
      },
      agent: { onEvent: () => () => undefined },
    });
    render(() => <VoiceSettings />);
    expect(await screen.findByRole("region", { name: "Voice settings" })).toBeInTheDocument();
    answer([{ id: "zira", name: "Zira", culture: "en-US", gender: "female" }]);
    expect(await screen.findByRole("option", { name: "Zira (en-US)" })).toBeInTheDocument();
  });
});
