import type { AgentApproval } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { collectNeedsYouItems, stickyDecisionForBot } from "./needs-you";

const bots = [
  { id: "research", name: "Research" },
  { id: "chief", name: "Lead" },
];

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
      question: "Which variant?",
      isSecret: false,
      options: [{ label: "Better", description: "" }],
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
  cwd: null,
  reason: null,
  grantRoot: null,
  permissions: null,
};

describe("collectNeedsYouItems", () => {
  it("lists agents waiting on questions or approvals with count order", () => {
    const items = collectNeedsYouItems({
      bots,
      prompts: { research: prompt },
      approvals: { chief: approval },
    });
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.botId)).toEqual(["chief", "research"]);
    expect(items[0]?.kind).toBe("approval");
    expect(items[1]?.summary).toBe("Which variant?");
  });

  it("ignores bots without pending decisions", () => {
    expect(
      collectNeedsYouItems({
        bots,
        prompts: {},
        approvals: {},
      }),
    ).toEqual([]);
  });
});

describe("collectNeedsYouItems summaries (English)", () => {
  const summaryFor = (next: Partial<AgentApproval>) =>
    collectNeedsYouItems({
      bots,
      prompts: {},
      approvals: { chief: { ...approval, command: null, ...next } },
    })[0]?.summary;
  const eyes = { source: "screen" as const, targetLabel: "Screen 1", live: false, frames: 1, intervalSeconds: null };

  it("falls back to English labels", () => {
    expect(summaryFor({ kind: "file-change" })).toBe("File changes");
    expect(summaryFor({ kind: "permissions" })).toBe("Permissions");
    expect(summaryFor({ kind: "command" })).toBe("Approval");
  });

  it("falls back to an English question label", () => {
    const empty = { ...prompt, questions: [] };
    expect(collectNeedsYouItems({ bots, prompts: { research: empty }, approvals: {} })[0]?.summary).toBe(
      "Agent question",
    );
  });

  it("describes screen and camera requests", () => {
    expect(summaryFor({ kind: "screen", eyes })).toBe("Screen access: Screen 1");
    expect(summaryFor({ kind: "screen" })).toBe("Screen access");
    expect(summaryFor({ kind: "screen", reason: "Check the build window" })).toBe("Check the build window");
    expect(summaryFor({ kind: "camera", eyes: { ...eyes, source: "camera", targetLabel: "Camera" } })).toBe(
      "Camera photo",
    );
    expect(summaryFor({ kind: "camera", eyes: { ...eyes, source: "camera", live: true } })).toBe("Camera live preview");
    expect(summaryFor({ kind: "camera" })).toBe("Camera");
  });
});

describe("stickyDecisionForBot", () => {
  it("prefers the open prompt over approval in the same conversation", () => {
    expect(stickyDecisionForBot({ prompt, approval })).toEqual({ kind: "question", prompt });
  });

  it("returns null when nothing is pending", () => {
    expect(stickyDecisionForBot({ prompt: undefined, approval: undefined })).toBeNull();
  });
});
