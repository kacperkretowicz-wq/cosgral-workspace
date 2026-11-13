import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceRecorder } from "./VoiceRecorder";

afterEach(() => vi.unstubAllGlobals());
describe("voice recorder", () => {
  it("shows microphone refusal and does not produce a transcript", async () => {
    const transcript = vi.fn();
    vi.stubGlobal("openbot", {
      voice: { getState: async () => ({ settings: { enabled: true } }) },
      agent: { onEvent: () => () => undefined },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error("Permission denied")) },
    });
    render(() => <VoiceRecorder onTranscript={transcript} />);
    await fireEvent.click(await screen.findByRole("button", { name: "Record voice" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Permission denied");
    expect(transcript).not.toHaveBeenCalled();
  });
});
