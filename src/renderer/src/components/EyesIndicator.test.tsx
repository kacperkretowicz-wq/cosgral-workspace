import type { AgentEyesSession } from "@openbot/contracts/ipc";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { EyesBadge, EyesBar, eyesSessionSummary } from "./EyesIndicator";

const bots = [
  { id: "research", name: "Research" },
  { id: "chief", name: "Chief" },
];

function session(overrides: Partial<AgentEyesSession> = {}): AgentEyesSession {
  return {
    id: "eyes-1",
    botId: "research",
    threadId: "thread-research",
    turnId: "turn-1",
    source: "screen",
    targetLabel: "Screen 1",
    phase: "watching",
    framesCaptured: 2,
    framesPlanned: 5,
    startedAt: "2026-11-12T18:00:00.000Z",
    endsAt: "2026-11-12T18:05:00.000Z",
    ...overrides,
  };
}

describe("EyesBar", () => {
  it("renders nothing while nobody is looking", () => {
    const view = render(() => <EyesBar sessions={[]} bots={bots} onStop={vi.fn()} />);
    expect(view.container.querySelector(".eyes-bar")).toBeNull();
    expect(screen.queryByRole("status", { name: "Agent eyes" })).toBeNull();
  });

  it("shows who is looking, at what, the frames and when it ends", () => {
    render(() => <EyesBar sessions={[session()]} bots={bots} onStop={vi.fn()} />);
    const bar = screen.getByRole("status", { name: "Agent eyes" });
    expect(bar).toHaveTextContent("Research");
    expect(bar).toHaveTextContent("Screen 1");
    expect(bar).toHaveTextContent("Live");
    expect(bar).toHaveTextContent("2 / 5 frames");
    expect(bar).toHaveTextContent(/until \d{1,2}[:.]\d{2}/);
  });

  it("shows a capture without an end time", () => {
    render(() => (
      <EyesBar
        sessions={[
          session({
            phase: "capturing",
            framesCaptured: 0,
            framesPlanned: 1,
            endsAt: null,
            source: "camera",
            targetLabel: "Camera",
          }),
        ]}
        bots={bots}
        onStop={vi.fn()}
      />
    ));
    const bar = screen.getByRole("status", { name: "Agent eyes" });
    expect(bar).toHaveTextContent("Capturing");
    expect(bar).toHaveTextContent("0 / 1 frame");
    expect(bar).not.toHaveTextContent("until");
  });

  it("stops the agent that is looking", async () => {
    const onStop = vi.fn();
    render(() => (
      <EyesBar
        sessions={[session(), session({ id: "eyes-2", botId: "chief", targetLabel: "Camera", source: "camera" })]}
        bots={bots}
        onStop={onStop}
      />
    ));
    await fireEvent.click(screen.getByRole("button", { name: "Stop Chief looking" }));
    expect(onStop).toHaveBeenCalledWith({ botId: "chief" });
    await fireEvent.click(screen.getByRole("button", { name: "Stop Research looking" }));
    expect(onStop).toHaveBeenLastCalledWith({ botId: "research" });
  });

  it("falls back to a generic name for an unknown agent", () => {
    render(() => <EyesBar sessions={[session({ botId: "ghost" })]} bots={bots} onStop={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Stop An agent looking" })).toBeInTheDocument();
  });
});

describe("eyesSessionSummary", () => {
  it("describes a live preview and a single capture", () => {
    expect(eyesSessionSummary(session())).toBe("Live · 2 / 5 frames");
    expect(eyesSessionSummary(session({ phase: "capturing", framesPlanned: 1, framesCaptured: 0, endsAt: null }))).toBe(
      "Capturing · 0 / 1 frame",
    );
  });
});

describe("EyesBadge", () => {
  it("is announced to screen readers", () => {
    render(() => <EyesBadge />);
    expect(screen.getByText("Looking")).toHaveClass("sr-only");
  });
});
