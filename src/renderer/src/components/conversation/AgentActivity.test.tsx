import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import type { BotMessage, BotProfile } from "../../data";
import { AgentActivityIndicator, ThinkingDisclosure } from "./AgentActivity";

const bot: BotProfile = {
  id: "chief",
  name: "Chief",
  role: "Coordinator",
  description: "",
  notifications: true,
  model: "gpt-5.6-luna",
  reasoningEffort: "medium",
  threadId: "thread-chief",
  avatarSeed: "chief",
  avatarHue: 185,
  avatarUrl: null,
  time: "",
  preview: "",
};

describe("AgentActivityIndicator", () => {
  it("does not show an avatar while working", () => {
    const view = render(() => <AgentActivityIndicator bot={bot} state="Working" />);

    expect(screen.getByRole("status", { name: "Chief is working" })).toBeInTheDocument();
    expect(view.container.querySelector(".agent-activity-avatar")).toBeNull();
  });

  it("tells what the agent does right now instead of the plain word", () => {
    const view = render(() => (
      <AgentActivityIndicator
        bot={bot}
        state="Working"
        liveStatus={{ turnId: "t1", kind: "reading", detail: "plan.md" }}
      />
    ));

    expect(view.container.querySelector(".agent-activity-text")).toHaveTextContent("Reading plan.md…");
    expect(view.container.querySelector(".agent-activity-text")).toHaveAttribute("data-live-kind", "reading");
    expect(screen.getByRole("status", { name: "Chief is working" })).toHaveAttribute("title");
  });

  it("falls back to the plain word while nothing is known", () => {
    const view = render(() => <AgentActivityIndicator bot={bot} state="Working" liveStatus={null} />);

    expect(view.container.querySelector(".agent-activity-text")).toHaveTextContent("Working");
  });

  it("keeps the avatar for queued work", () => {
    const view = render(() => <AgentActivityIndicator bot={bot} state="Queued" />);

    expect(view.container.querySelector(".agent-activity-avatar")).toBeInTheDocument();
  });

  it("renders no activity bubble when idle", () => {
    const view = render(() => <AgentActivityIndicator bot={bot} state={null} />);

    expect(view.container.querySelector(".agent-activity-entry")).toBeNull();
  });
});

describe("ThinkingDisclosure", () => {
  const message = (streaming: boolean, items: string[]): BotMessage => ({
    id: "m1",
    author: "bot",
    kind: "thinking",
    body: "",
    time: "",
    items,
    streaming,
  });

  it("says Thinking while it streams and N steps once it is done", () => {
    const live = render(() => <ThinkingDisclosure message={message(true, ["a"])} />);
    expect(screen.getByText("Thinking")).toBeInTheDocument();
    live.unmount();
    render(() => <ThinkingDisclosure message={message(false, ["a"])} />);
    expect(screen.getByText("1 step")).toBeInTheDocument();
  });

  it("follows the setting of the agent steps: folded by default, open when the person chose to show them (BE-Z2)", () => {
    const folded = render(() => <ThinkingDisclosure message={message(false, ["a", "b"])} />);
    expect(folded.container.querySelector("details")?.open).toBe(false);
    folded.unmount();
    document.documentElement.dataset.agentSteps = "show";
    try {
      const open = render(() => <ThinkingDisclosure message={message(false, ["a", "b"])} />);
      expect(open.container.querySelector("details")?.open).toBe(true);
    } finally {
      delete document.documentElement.dataset.agentSteps;
    }
  });
});
