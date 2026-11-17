// @vitest-environment node
import {
  type AgentEvent,
  encodeVoiceWav,
  isVoiceOverview,
  isVoiceSettings,
  isVoiceState,
} from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockVoice } from "./mock-voice";

const setup = () => {
  const events: AgentEvent[] = [];
  return { mock: createMockVoice((event) => events.push(event)), events };
};

const audio = () => encodeVoiceWav(new Float32Array(16_000));

describe("mock voice (W12-KK)", () => {
  it("one query gives the whole page: models absent, voices, microphone, and what is not offered with reasons", async () => {
    const { mock } = setup();
    const overview = await mock.getOverview();
    expect(isVoiceOverview(overview)).toBe(true);
    expect(overview.state.transcription.models.map((model) => [model.id, model.state])).toEqual([
      ["tiny", "absent"],
      ["base", "absent"],
      ["small", "absent"],
    ]);
    expect(overview.state.transcription.available).toBe(false);
    expect(overview.state.transcription.unavailableReason).toMatch(/Download a model first/);
    expect(overview.voices).toHaveLength(2);
    expect(overview.microphone).toEqual({ status: "not-determined", canOpenSettings: true });
    expect(overview.unavailable).toHaveLength(4);
  });

  it("nothing downloads without approval: 'no' leaves everything as it was, 'yes' starts with progress events", async () => {
    const { mock, events } = setup();
    mock.simulate.declineNext();
    expect(await mock.downloadModel({ modelId: "base" })).toEqual({ status: "declined" });
    const declined = await mock.getState();
    expect(declined.transcription.consent).toBe(false);
    expect(declined.transcription.models.every((model) => model.state === "absent")).toBe(true);
    expect(events).toEqual([]);

    expect(await mock.downloadModel({ modelId: "base" })).toEqual({ status: "started" });
    mock.simulate.progress("base", 0.5);
    const half = (await mock.getState()).transcription.models.find((model) => model.id === "base");
    expect(half).toMatchObject({
      state: "downloading",
      progress: { receivedBytes: 71_000_000, totalBytes: 142_000_000 },
    });
    mock.simulate.progress("base", 1);
    const ready = await mock.getState();
    expect(isVoiceState(ready)).toBe(true);
    expect(ready.transcription).toMatchObject({ consent: true, available: true });
    expect(ready.transcription.runtime.state).toBe("ready");
    expect(events.every((event) => event.type === "voice-changed")).toBe(true);
    expect(await mock.downloadModel({ modelId: "base" })).toEqual({ status: "ready" });
  });

  it("a failed download is a fixed sentence and can be tried again; cancel and delete go back to absent", async () => {
    const { mock } = setup();
    await mock.downloadModel({ modelId: "tiny" });
    mock.simulate.failDownload("tiny");
    expect((await mock.getState()).transcription.models[0]).toMatchObject({
      state: "error",
      error: "The download could not be finished. Try again.",
    });
    expect(await mock.downloadModel({ modelId: "tiny" })).toEqual({ status: "started" });
    expect((await mock.cancelDownload({ modelId: "tiny" })).transcription.models[0]?.state).toBe("absent");
    await mock.downloadModel({ modelId: "small" });
    mock.simulate.progress("small", 1);
    expect((await mock.deleteModel({ modelId: "small" })).transcription.models[2]?.state).toBe("absent");
    await expect(mock.downloadModel(JSON.parse('{"modelId":"huge"}'))).rejects.toThrow(/modelId is one of/);
  });

  it("dictation needs the switch, the consent and a ready model; deleting the runtime takes the consent back", async () => {
    const { mock } = setup();
    await expect(mock.transcribe({ audio: audio() })).rejects.toThrow(/Download a model first/);
    await mock.downloadModel({ modelId: "base" });
    mock.simulate.progress("base", 1);
    const result = await mock.transcribe({ audio: audio() });
    expect(result).toMatchObject({ text: "This is a demo transcript.", modelId: "base", durationMs: 1000 });
    await mock.updateSettings({ enabled: false });
    await expect(mock.transcribe({ audio: audio() })).rejects.toThrow(/switched off/);
    await mock.updateSettings({ enabled: true });
    expect((await mock.deleteRuntime()).transcription).toMatchObject({ consent: false, available: false });
    await expect(mock.transcribe({ audio: new Uint8Array(10) })).rejects.toThrow();
  });

  it("settings are checked: speed, shortcut, language, model; a good change comes back and is announced", async () => {
    const { mock, events } = setup();
    await expect(mock.updateSettings({ rate: 3 })).rejects.toThrow(/between 0.5 and 2/);
    await expect(mock.updateSettings({ shortcut: "Space" })).rejects.toThrow(/modifier and a key/);
    const settings = await mock.updateSettings({
      rate: 1.5,
      autoRead: true,
      language: "pl",
      modelId: "small",
      shortcut: null,
    });
    expect(isVoiceSettings(settings)).toBe(true);
    expect(settings).toMatchObject({ rate: 1.5, autoRead: true, language: "pl", modelId: "small", shortcut: null });
    expect(events.at(-1)).toMatchObject({ type: "voice-changed" });
  });

  it("the microphone permission and the Windows voices follow the system", async () => {
    const { mock } = setup();
    mock.simulate.microphone("denied");
    expect((await mock.getOverview()).microphone.status).toBe("denied");
    expect(await mock.speak({ text: "Hello" })).toEqual({ status: "done" });
    mock.simulate.speechUnavailable("Windows voices are not available here.");
    const overview = await mock.getOverview();
    expect(overview.voices).toEqual([]);
    expect(overview.state.speech).toMatchObject({
      available: false,
      unavailableReason: "Windows voices are not available here.",
    });
    await expect(mock.speak({ text: "Hello" })).rejects.toThrow(/not available here/);
    await expect(mock.speak({ text: "  " })).rejects.toThrow();
    await mock.openMicrophoneSettings();
  });
});
