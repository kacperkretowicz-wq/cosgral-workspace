// @vitest-environment node
import type { AgentEvent, BrowserTab, KeptDraft } from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord } from "@openbot/contracts/runtime-values";
import { describe, expect, it } from "vitest";
import { ActionCards, type CardContext } from "./action-cards";
import type { KeptDraftStore } from "./draft-store";
import type { DynamicToolCallParams, DynamicToolResult } from "./protocol";

class MemoryDrafts implements KeptDraftStore {
  readonly rows = new Map<string, KeptDraft>();
  list(): KeptDraft[] {
    return [...this.rows.values()];
  }
  get(id: string): KeptDraft | null {
    return this.rows.get(id) ?? null;
  }
  save(draft: KeptDraft): void {
    this.rows.set(draft.id, draft);
  }
  delete(id: string): boolean {
    return this.rows.delete(id);
  }
}

const context: CardContext = {
  botId: "chief",
  threadId: "public-thread",
  providerThreadId: "raw-thread",
  turnId: "turn",
};

function setup(tabs: BrowserTab[] = []) {
  const events: AgentEvent[] = [];
  const shown: string[] = [];
  const drafts = new MemoryDrafts();
  let sequence = 0;
  const cards = new ActionCards({
    emit: (event) => events.push(event),
    order: () => ({ createdAt: `2026-11-13T00:00:0${sequence}Z`, sequence: ++sequence }),
    drafts,
    tabs: () => tabs,
    showTab: (tabId) => {
      shown.push(tabId);
    },
  });
  return { cards, events, shown, drafts };
}

function call(tool: string, args: unknown, turnId = "turn"): DynamicToolCallParams {
  return { threadId: "raw-thread", turnId, callId: `${tool}-call`, namespace: "cosgral_cards", tool, arguments: args };
}

function payload(result: DynamicToolResult): DynamicRecord {
  const item = result.contentItems[0];
  if (item?.type !== "inputText") throw new Error("Expected a text result.");
  const value = JSON.parse(item.text);
  if (!isDynamicRecord(value)) throw new Error("Expected a JSON object.");
  return value;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("draft preview and confirm card", () => {
  it("shows the draft, counts it as waiting for the user and approves exactly one send", async () => {
    const { cards, events } = setup();
    const pending = cards.handleDynamicTool(
      call("confirm", { title: "Send this e-mail to Anna?", preview: "Hi Anna", recipient: "Anna", channel: "email" }),
      context,
    );
    await tick();
    expect(events).toEqual([
      {
        type: "draft-preview",
        card: expect.objectContaining({
          botId: "chief",
          threadId: "public-thread",
          turnId: "turn",
          variant: "draft",
          title: "Send this e-mail to Anna?",
          recipient: "Anna",
          channel: "email",
          preview: "Hi Anna",
          draftId: null,
        }),
      },
    ]);
    const [open] = cards.listPending();
    expect(open?.request).toMatchObject({ kind: "draft-preview" });
    expect(cards.pendingCount("chief")).toBe(1);
    const requestId = events[0]?.type === "draft-preview" ? events[0].card.requestId : "";

    cards.respondToDraftPreview({ requestId, decision: "send" });
    const result = await pending;
    expect(result.success).toBe(true);
    expect(payload(result)).toMatchObject({ decision: "send", text: "Hi Anna" });
    expect(events.at(-1)).toEqual({
      type: "draft-preview-resolved",
      requestId,
      botId: "chief",
      resolution: "send",
    });
    expect(cards.listPending()).toEqual([]);
    expect(() => cards.respondToDraftPreview({ requestId, decision: "send" })).toThrow(/no longer open|decided/);
  });

  it("returns Edit with the user's own text and feedback, and never treats it as approval", async () => {
    const { cards, events } = setup();
    const pending = cards.handleDynamicTool(call("confirm", { preview: "Hi Anna" }), context);
    await tick();
    const requestId = events[0]?.type === "draft-preview" ? events[0].card.requestId : "";
    cards.respondToDraftPreview({ requestId, decision: "edit", feedback: "Warmer", text: "Dear Anna" });
    expect(payload(await pending)).toMatchObject({ decision: "edit", feedback: "Warmer", text: "Dear Anna" });
    expect(String(payload(await pending).instruction)).toMatch(/do not send/i);
  });

  it("keeps a draft durably, lets the agent reopen it by id and forgets it after Send", async () => {
    const { cards, events, drafts } = setup();
    const first = cards.handleDynamicTool(
      call("confirm", { title: "Post this?", preview: "Launch post", variant: "confirm", channel: "x" }),
      context,
    );
    await tick();
    const firstId = events[0]?.type === "draft-preview" ? events[0].card.requestId : "";
    expect(events[0]).toMatchObject({ card: { variant: "confirm" } });
    cards.respondToDraftPreview({ requestId: firstId, decision: "keep-draft" });
    const kept = payload(await first);
    expect(kept).toMatchObject({ decision: "keep-draft" });
    const draftId = String(kept.draftId);
    expect(drafts.get(draftId)).toMatchObject({ botId: "chief", preview: "Launch post", variant: "confirm" });
    expect(events.some((event) => event.type === "drafts-changed" && event.drafts.length === 1)).toBe(true);
    expect(payload(await cards.handleDynamicTool(call("list_drafts", {}), context))).toMatchObject({
      drafts: [expect.objectContaining({ id: draftId, preview: "Launch post" })],
    });

    const reopened = cards.handleDynamicTool(call("confirm", { draftId }), context);
    await tick();
    const card = events.findLast((event) => event.type === "draft-preview");
    expect(card).toMatchObject({ card: { draftId, preview: "Launch post", title: "Post this?" } });
    cards.respondToDraftPreview({
      requestId: card?.type === "draft-preview" ? card.card.requestId : "",
      decision: "send",
    });
    expect(payload(await reopened)).toMatchObject({ decision: "send", text: "Launch post" });
    expect(drafts.get(draftId)).toBeNull();
    expect(cards.listDrafts()).toEqual([]);
  });

  it("refuses another agent's draft and a card without a preview", async () => {
    const { cards, drafts } = setup();
    drafts.save({
      id: "draft-1",
      botId: "other",
      threadId: "t",
      variant: "draft",
      title: "Old",
      recipient: null,
      channel: null,
      preview: "Secret",
      keptAt: "2026-11-13T00:00:00Z",
    });
    expect((await cards.handleDynamicTool(call("confirm", { draftId: "draft-1" }), context)).success).toBe(false);
    expect((await cards.handleDynamicTool(call("confirm", { title: "Empty" }), context)).success).toBe(false);
    expect((await cards.handleDynamicTool(call("confirm", { preview: "x", variant: "pay" }), context)).success).toBe(
      false,
    );
    expect(cards.listPending()).toEqual([]);
  });

  it("expires an open card with its turn, so nothing counts as approved", async () => {
    const { cards, events } = setup();
    const pending = cards.handleDynamicTool(call("confirm", { preview: "Hi" }), context);
    await tick();
    cards.expireTurn("raw-thread", "other-turn");
    expect(cards.listPending()).toHaveLength(1);
    cards.expireTurn("raw-thread", "turn");
    expect(payload(await pending)).toMatchObject({ decision: "expired" });
    expect(events.at(-1)).toMatchObject({ type: "draft-preview-resolved", resolution: "expired" });
    expect(cards.pendingCount("chief")).toBe(0);
  });
});

describe("browser takeover", () => {
  const tab: BrowserTab = {
    id: "tab-1",
    url: "https://bank.example/login",
    title: "Bank",
    loading: false,
    ownerThreadId: null,
    ownerBotId: null,
  };
  const lastTakeoverId = (events: AgentEvent[]) => {
    const event = events.findLast((item) => item.type === "browser-takeover");
    return event?.type === "browser-takeover" ? event.request.requestId : "";
  };

  it("asks, lets the person take over the same tab, blocks the agent there and resumes it on return", async () => {
    const tabs = [{ ...tab }];
    const { cards, events, shown } = setup(tabs);
    const pending = cards.handleDynamicTool(call("request_takeover", { tabId: "tab-1", reason: "Sign in" }), context);
    await tick();
    expect(events).toEqual([
      {
        type: "browser-takeover",
        request: expect.objectContaining({ botId: "chief", tabId: "tab-1", url: tab.url, reason: "Sign in" }),
      },
    ]);
    const requestId = lastTakeoverId(events);
    expect(cards.listPending()[0]?.request).toMatchObject({ kind: "browser-takeover", phase: "requested" });
    expect(cards.pendingCount("chief")).toBe(1);

    await cards.respondToBrowserTakeover({ requestId, action: "take-over" });
    expect(shown).toEqual(["tab-1"]);
    expect(events.at(-1)).toEqual({ type: "browser-takeover-changed", requestId, botId: "chief", phase: "taken-over" });
    expect(cards.listPending()[0]?.request).toMatchObject({ phase: "taken-over" });
    const act = {
      ...call("act", { tabId: "tab-1", revision: 1, action: { type: "click" } }),
      namespace: "openbot_browser",
    };
    expect(cards.blockedBrowserTool(act)).toMatch(/person/i);
    expect(cards.blockedBrowserTool({ ...act, arguments: { tabId: "tab-2" } })).toBeNull();
    expect(cards.blockedBrowserTool({ ...act, tool: "list_tabs", arguments: {} })).toBeNull();

    tabs[0] = { ...tab, url: "https://bank.example/home" };
    await cards.respondToBrowserTakeover({ requestId, action: "return" });
    expect(payload(await pending)).toMatchObject({
      outcome: "returned",
      tabId: "tab-1",
      url: "https://bank.example/home",
    });
    expect(events.at(-1)).toEqual({ type: "browser-takeover-changed", requestId, botId: "chief", phase: "returned" });
    expect(cards.blockedBrowserTool(act)).toBeNull();
    expect(cards.listPending()).toEqual([]);
    await expect(cards.respondToBrowserTakeover({ requestId, action: "return" })).rejects.toThrow(/no longer open/);
  });

  it("lets the person decline and expires an open request with its turn", async () => {
    const { cards, events } = setup([{ ...tab }]);
    const declined = cards.handleDynamicTool(call("request_takeover", { tabId: "tab-1", reason: "CAPTCHA" }), context);
    await tick();
    await cards.respondToBrowserTakeover({ requestId: lastTakeoverId(events), action: "decline" });
    expect(payload(await declined)).toMatchObject({ outcome: "declined" });

    const expired = cards.handleDynamicTool(call("request_takeover", { tabId: "tab-1", reason: "Pay" }), context);
    await tick();
    await cards.respondToBrowserTakeover({ requestId: lastTakeoverId(events), action: "take-over" });
    cards.expireTurn("raw-thread", "turn");
    expect(payload(await expired)).toMatchObject({ outcome: "expired" });
    expect(events.at(-1)).toMatchObject({ type: "browser-takeover-changed", phase: "expired" });
    expect(cards.blockedBrowserTool({ ...call("act", { tabId: "tab-1" }), namespace: "openbot_browser" })).toBeNull();
  });

  it("refuses an unknown tab and a second open request for the same tab", async () => {
    const { cards } = setup([{ ...tab }]);
    expect(
      (await cards.handleDynamicTool(call("request_takeover", { tabId: "nope", reason: "x" }), context)).success,
    ).toBe(false);
    void cards.handleDynamicTool(call("request_takeover", { tabId: "tab-1", reason: "Sign in" }), context);
    await tick();
    expect(
      (await cards.handleDynamicTool(call("request_takeover", { tabId: "tab-1", reason: "Again" }), context)).success,
    ).toBe(false);
    cards.expireAll();
    expect(cards.listPending()).toEqual([]);
  });
});
