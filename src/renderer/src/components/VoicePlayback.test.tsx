import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoicePlayback } from "./VoicePlayback";

afterEach(() => vi.unstubAllGlobals());

describe("read aloud", () => {
  it("is one message action that turns into Stop reading while this reply is read", async () => {
    let finish: (value: { status: "done" | "stopped" }) => void = () => undefined;
    const speak = vi.fn(() => new Promise<{ status: "done" | "stopped" }>((resolve) => (finish = resolve)));
    const stop = vi.fn(async () => {
      finish({ status: "stopped" });
      return {};
    });
    vi.stubGlobal("openbot", { voice: { speak, stop } });
    render(() => <VoicePlayback messageId="m1" text="Hello there" enabled />);

    const read = screen.getByRole("button", { name: "Read aloud" });
    expect(read).toHaveClass("message-action-button");
    expect(screen.queryByRole("button", { name: "Stop reading" })).not.toBeInTheDocument();

    await fireEvent.click(read);
    expect(speak).toHaveBeenCalledWith({ text: "Hello there" });
    await fireEvent.click(await screen.findByRole("button", { name: "Stop reading" }));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Read aloud" })).toBeInTheDocument();
  });

  it("shows why reading failed", async () => {
    vi.stubGlobal("openbot", { voice: { speak: vi.fn().mockRejectedValue(new Error("Voice is off")), stop: vi.fn() } });
    render(() => <VoicePlayback messageId="m2" text="Hi" enabled />);
    await fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Voice is off");
  });

  it("renders nothing while voice is off", () => {
    vi.stubGlobal("openbot", { voice: { speak: vi.fn(), stop: vi.fn() } });
    render(() => <VoicePlayback messageId="m3" text="Hi" enabled={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
