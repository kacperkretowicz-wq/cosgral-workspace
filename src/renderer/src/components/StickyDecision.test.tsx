import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { StickyDecision } from "./StickyDecision";
import type { AgentApproval } from "@openbot/contracts/ipc";

const prompt = {
  type: "prompt" as const,
  requestId: "p1",
  botId: "research",
  threadId: "t1",
  turnId: "turn-1",
  questions: [
    {
      id: "q1",
      header: "",
      question: "Który wariant A+B+C wchodzi do W1?",
      isSecret: false,
      options: [
        { label: "Lepszy", description: "" },
        { label: "Później", description: "" },
      ],
    },
  ],
};

const approval: AgentApproval = {
  requestId: "a1",
  botId: "chief",
  threadId: "t2",
  turnId: "turn-2",
  kind: "command",
  command: "bun run build",
  cwd: "/tmp",
  reason: null,
  grantRoot: null,
  permissions: null,
};

describe("StickyDecision", () => {
  it("renders nothing without a pending decision", () => {
    const view = render(() => (
      <StickyDecision
        prompt={undefined}
        approval={undefined}
        onAnswerPrompt={async () => true}
        onRespondToApproval={async () => true}
      />
    ));
    expect(view.container.querySelector(".sticky-decision")).toBeNull();
  });

  it("pins the open question above the composer region", () => {
    render(() => (
      <StickyDecision
        prompt={prompt}
        approval={undefined}
        onAnswerPrompt={vi.fn(async () => true)}
        onRespondToApproval={vi.fn(async () => true)}
      />
    ));
    const region = screen.getByRole("region", { name: "Decyzja" });
    expect(region).toBeInTheDocument();
    expect(region.querySelector(".approval-question-prompt")).toHaveTextContent(
      "Który wariant A+B+C wchodzi do W1?",
    );
    expect(screen.getByText("Decyzja · przypięta")).toBeInTheDocument();
  });

  it("shows approval when there is no prompt", () => {
    render(() => (
      <StickyDecision
        prompt={undefined}
        approval={approval}
        onAnswerPrompt={vi.fn(async () => true)}
        onRespondToApproval={vi.fn(async () => true)}
      />
    ));
    expect(screen.getByRole("region", { name: "Decyzja" })).toHaveAttribute("data-kind", "approval");
  });
});
