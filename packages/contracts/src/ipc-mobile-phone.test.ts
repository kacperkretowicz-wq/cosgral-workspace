import { describe, expect, it } from "vitest";
import {
  formatMobileStreamEvent,
  isMobileAgentDetail,
  isMobileMessagePage,
  isMobileNeedsYouDetail,
  isMobileNeedsYouItem,
  isMobileStreamEvent,
  MOBILE_COMPUTER_ONLY,
  MOBILE_PHONE_LIMITS,
  MOBILE_PHONE_PATHS,
  type MobileNeedsYouItem,
  mobilePhonePath,
  parseMobileStreamEvents,
} from "./ipc";

const item: MobileNeedsYouItem = {
  id: "7",
  botId: "scout",
  kind: "prompt",
  title: "Budget: How much?",
  createdAt: null,
  answerOn: "phone",
  computerReason: null,
};

describe("W3 phone API contract", () => {
  it("builds the phone paths with encoded ids", () => {
    expect(MOBILE_PHONE_PATHS.events).toBe("/v1/events");
    expect(mobilePhonePath.messages("a b/c")).toBe("/v1/agents/a%20b%2Fc/messages");
    expect(mobilePhonePath.answer("card-1")).toBe("/v1/needs-you/card-1/answer");
    expect(mobilePhonePath.agent("scout")).toBe("/v1/agents/scout");
    expect(MOBILE_COMPUTER_ONLY).toEqual(
      expect.arrayContaining(["vault", "computer-use", "remote-desktop", "devices"]),
    );
    expect(MOBILE_PHONE_LIMITS.messagesPage).toBeLessThanOrEqual(MOBILE_PHONE_LIMITS.messagesPageMax);
  });

  it("writes and reads stream events, keeping a cut-off event for the next chunk", () => {
    const first = formatMobileStreamEvent({ type: "needs-you", items: [item] });
    const second = formatMobileStreamEvent({ type: "conversation", botId: "scout" });
    expect(first.startsWith("event: needs-you\ndata: ")).toBe(true);
    const chunk = `: ping\n\n${first}${second.slice(0, 12)}`;
    const parsed = parseMobileStreamEvents(chunk);
    expect(parsed.events).toEqual([{ type: "needs-you", items: [item] }]);
    const rest = parseMobileStreamEvents(parsed.rest + second.slice(12));
    expect(rest.events).toEqual([{ type: "conversation", botId: "scout" }]);
    expect(rest.rest).toBe("");
    expect(parseMobileStreamEvents("event: x\ndata: {nope\n\n").events).toEqual([]);
  });

  it("checks pages, details, agents and stream events", () => {
    expect(isMobileNeedsYouItem(item)).toBe(true);
    expect(isMobileNeedsYouItem({ ...item, answerOn: "watch" })).toBe(false);
    expect(
      isMobileMessagePage({
        botId: "scout",
        messages: [
          {
            id: "m1",
            author: "assistant",
            text: "Hi",
            createdAt: "2026-11-13T19:00:00.000Z",
            status: "completed",
            itemType: null,
            attachments: 0,
          },
        ],
        nextBefore: null,
      }),
    ).toBe(true);
    expect(isMobileMessagePage({ botId: "scout", messages: [{ id: 1 }], nextBefore: null })).toBe(false);
    expect(
      isMobileNeedsYouDetail({
        kind: "prompt",
        item,
        questions: [{ id: "q", header: "Budget", question: "How much?", options: ["100", "200"] }],
      }),
    ).toBe(true);
    expect(
      isMobileNeedsYouDetail({
        kind: "draft-preview",
        item: { ...item, kind: "draft-preview" },
        variant: "draft",
        recipient: null,
        channel: "email",
        preview: "Hello Anna",
      }),
    ).toBe(true);
    expect(isMobileNeedsYouDetail({ kind: "approval", item })).toBe(false);
    expect(
      isMobileAgentDetail({ id: "a", name: "A", role: "", avatarHue: null, model: "m", instructions: "Do it." }),
    ).toBe(true);
    expect(isMobileStreamEvent({ type: "agents", agents: [] })).toBe(true);
    expect(isMobileStreamEvent({ type: "conversation" })).toBe(false);
  });
});
