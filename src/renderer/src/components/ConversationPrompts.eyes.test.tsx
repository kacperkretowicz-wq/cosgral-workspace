import type { AgentApproval } from "@openbot/contracts/ipc";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { ApprovalCard } from "./ConversationPrompts";

function eyesApproval(overrides: Partial<AgentApproval>): AgentApproval {
  return {
    requestId: "eyes-approval-1",
    botId: "research",
    threadId: "thread-research",
    turnId: "turn-1",
    kind: "screen",
    command: null,
    cwd: null,
    reason: null,
    grantRoot: null,
    permissions: null,
    eyes: { source: "screen", targetLabel: "Screen 1", live: false, frames: 1, intervalSeconds: null },
    ...overrides,
  };
}

describe("ApprovalCard for agent eyes", () => {
  it("titles a screen request and shows what it looks at", () => {
    render(() => <ApprovalCard variant="approval" approval={eyesApproval({})} />);
    expect(screen.getByText("Allow screen access?")).toBeInTheDocument();
    expect(screen.queryByText("Grant permissions?")).not.toBeInTheDocument();
    const details = screen.getByRole("region", { name: "Requested view" });
    expect(details).toHaveTextContent("Screen 1");
    expect(details).toHaveTextContent("Single capture");
  });

  it("titles a window request differently from a full screen", () => {
    render(() => (
      <ApprovalCard
        variant="approval"
        approval={eyesApproval({
          eyes: { source: "window", targetLabel: "Build output", live: false, frames: 1, intervalSeconds: null },
        })}
      />
    ));
    expect(screen.getByText("Allow window access?")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Requested view" })).toHaveTextContent("Build output");
  });

  it("titles a camera request and describes the live preview", () => {
    render(() => (
      <ApprovalCard
        variant="approval"
        approval={eyesApproval({
          kind: "camera",
          reason: "Show me the whiteboard.",
          eyes: { source: "camera", targetLabel: "Camera", live: true, frames: 3, intervalSeconds: 2 },
        })}
      />
    ));
    expect(screen.getByText("Allow camera?")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Requested view" })).toHaveTextContent(
      "Live preview · 3 frames every 2s",
    );
    expect(screen.getByText("Show me the whiteboard.")).toBeInTheDocument();
  });

  it("keeps a clear title when the eyes details are missing", () => {
    render(() => <ApprovalCard variant="approval" approval={eyesApproval({ kind: "camera", eyes: null })} />);
    expect(screen.getByText("Allow camera?")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Requested view" })).not.toBeInTheDocument();
  });

  it("approves and rejects like any other approval", async () => {
    const onApprove = vi.fn(async () => true);
    const onReject = vi.fn(async () => true);
    render(() => (
      <ApprovalCard variant="approval" approval={eyesApproval({})} onApprove={onApprove} onReject={onReject} />
    ));
    await fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });
});
