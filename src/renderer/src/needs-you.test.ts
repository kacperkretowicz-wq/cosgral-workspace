import { describe, expect, it } from "vitest";
import { collectNeedsYouItems, stickyDecisionForBot } from "./needs-you";
import type { AgentApproval } from "@openbot/contracts/ipc";

const bots = [
  { id: "research", name: "Research" },
  { id: "chief", name: "Lider" },
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
      question: "Który wariant?",
      isSecret: false,
      options: [{ label: "Lepszy", description: "" }],
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
    expect(items[1]?.summary).toBe("Który wariant?");
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

describe("stickyDecisionForBot", () => {
  it("prefers the open prompt over approval in the same conversation", () => {
    expect(stickyDecisionForBot({ prompt, approval })).toEqual({ kind: "question", prompt });
  });

  it("returns null when nothing is pending", () => {
    expect(stickyDecisionForBot({ prompt: undefined, approval: undefined })).toBeNull();
  });
});
