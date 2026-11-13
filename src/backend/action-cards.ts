// COSGRAL W1-BE3: chat cards that act in the user's name (spec W1-T1 §4–5, lead decisions 5 and 6).
//
// Draft preview / confirm card: one card type with two variants. The agent shows exactly what would go
// out and waits; "send" approves it once, "edit" sends it back for a new card, "keep-draft" keeps it
// unsent in the local database. Browser takeover: the agent asks a person to take over a browser tab
// (sign-in, CAPTCHA, payment) and waits; the person takes over, then returns the tab or declines, and
// the agent continues in the same tab and browser session. Both are open cards like questions and
// approvals: they count in Needs you and expire with their turn.

import { randomUUID } from "node:crypto";
import {
  ACTION_CARD_LIMITS,
  type AgentEvent,
  type BrowserTab,
  type BrowserTakeoverAction,
  type BrowserTakeoverPhase,
  type BrowserTakeoverRequest,
  DRAFT_PREVIEW_VARIANTS,
  type DraftPreviewCard,
  type DraftPreviewResolution,
  type KeptDraft,
  type PendingBrowserTakeover,
  type PendingDraftPreview,
  type RespondToBrowserTakeoverInput,
  type RespondToDraftPreviewInput,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isOneOf, isString } from "@openbot/contracts/runtime-values";
import { z } from "zod";
import type { KeptDraftStore } from "./draft-store";
import type { DynamicToolCallParams, DynamicToolResult } from "./protocol";

export const CARDS_NAMESPACE = "cosgral_cards";

const L = ACTION_CARD_LIMITS;
const ID_LIMIT = 200;

/** One schema for the Codex dynamic functions and the Claude in-process MCP server. */
export const CARDS_TOOL_SPECS: Array<{ name: string; description: string; schema: z.ZodRawShape }> = [
  {
    name: "confirm",
    description:
      'Before you send, post, delete or pay anything in the user\'s name, show exactly what would happen and wait for the user: "send" approves it once, exactly as shown, for these recipients; "edit" means revise and show a new card; "keep-draft" means nothing goes out and the draft is kept. Use variant "confirm" for actions that are not messages. Reopen a kept draft with draftId.',
    schema: {
      title: z.string().max(L.title).optional(),
      preview: z.string().max(L.preview).optional(),
      variant: z.enum(DRAFT_PREVIEW_VARIANTS).optional(),
      recipient: z.string().max(L.recipient).optional(),
      channel: z.string().max(L.channel).optional(),
      draftId: z.string().max(ID_LIMIT).optional(),
    },
  },
  {
    name: "request_takeover",
    description:
      "When a page in the built-in browser needs a person (sign-in, CAPTCHA, passkey, payment confirmation), ask the user to take over that tab and wait. When they give it back, continue in the same tab and browser session: take a fresh snapshot first.",
    schema: { tabId: z.string().min(1).max(ID_LIMIT), reason: z.string().min(1).max(L.reason) },
  },
  { name: "list_drafts", description: "List the drafts the user kept unsent from your earlier cards.", schema: {} },
];

export const CARDS_DYNAMIC_TOOLS = {
  type: "namespace",
  name: CARDS_NAMESPACE,
  description:
    "Ask the user before acting in their name, and hand a browser tab to the user when a page needs a person.",
  tools: CARDS_TOOL_SPECS.map((spec) => ({
    type: "function",
    name: spec.name,
    description: spec.description,
    inputSchema: z.toJSONSchema(z.object(spec.schema)),
  })),
};

/** Added to the developer instructions of direct and channel threads. */
export const CARDS_INSTRUCTIONS = `Before you send, post, delete or pay anything in the user's name, show exactly what would happen with ${CARDS_NAMESPACE}.confirm and act only after "send"; one approval covers that one action once, and "edit" or "keep-draft" means nothing goes out. When a page in the built-in browser needs a person (sign-in, CAPTCHA, passkey, payment), call ${CARDS_NAMESPACE}.request_takeover and wait; after the user returns the tab, continue in the same tab.`;

/** Who asks: the agent, the thread shown to the user, the provider thread and the turn. */
export interface CardContext {
  botId: string;
  /** The thread id the windows know (the agent's conversation, or a channel thread). */
  threadId: string;
  /** The provider thread of the turn; open cards expire with this thread's turn. */
  providerThreadId: string;
  turnId: string;
}

export interface ActionCardsOptions {
  emit: (event: AgentEvent) => void;
  /** Creation time and order shared with question and approval cards. */
  order: () => { createdAt: string; sequence: number };
  drafts: KeptDraftStore;
  /** Tabs of the built-in browser; without it no takeover can be asked. */
  tabs?: () => BrowserTab[];
  /** Shows the tab to the person who takes over. */
  showTab?: (tabId: string) => Promise<void> | void;
  now?: () => string;
  newId?: () => string;
}

export type PendingActionCard = PendingDraftPreview | PendingBrowserTakeover;

interface OpenDraft {
  card: DraftPreviewCard;
  sequence: number;
  providerThreadId: string;
  resolve: (result: DynamicToolResult) => void;
}

interface OpenTakeover {
  request: BrowserTakeoverRequest;
  phase: "requested" | "taken-over";
  sequence: number;
  providerThreadId: string;
  resolve: (result: DynamicToolResult) => void;
}

const DRAFT_INSTRUCTIONS: Record<DraftPreviewResolution, string> = {
  send: "The user approved exactly this text for these recipients, once. Do it now without changes and do not reuse this approval for anything else.",
  edit: "Do not send. Revise the draft with the user's feedback, or use their text, then show a new confirm card before anything goes out.",
  "keep-draft":
    "Do not send. The user kept this as a draft (draftId). Reopen it with confirm and draftId only when the user asks.",
  expired: "The card closed before the user decided. Nothing is approved; do not send.",
};

const TAKEOVER_INSTRUCTIONS: Record<Exclude<BrowserTakeoverPhase, "requested" | "taken-over">, string> = {
  returned:
    "The user gave the tab back. Continue in the same tab and browser session; take a fresh snapshot before acting.",
  declined: "The user will not take over. Continue without it, or tell the user what is blocked.",
  expired: "The request closed with your turn. Do not act on this tab until the user asks again.",
};

export class ActionCards {
  readonly #options: ActionCardsOptions;
  readonly #drafts = new Map<string, OpenDraft>();
  readonly #takeovers = new Map<string, OpenTakeover>();

  constructor(options: ActionCardsOptions) {
    this.#options = options;
  }

  /** An agent's `cosgral_cards` call. Waits until the user decides or the turn ends. */
  async handleDynamicTool(params: DynamicToolCallParams, context: CardContext): Promise<DynamicToolResult> {
    try {
      const args = isDynamicRecord(params.arguments) ? params.arguments : {};
      switch (params.tool) {
        case "confirm":
          return await this.#confirm(context, args);
        case "request_takeover":
          return await this.#requestTakeover(context, args);
        case "list_drafts":
          return textResult({ drafts: this.listDrafts().filter((draft) => draft.botId === context.botId) });
        default:
          throw new Error(`Unknown card tool: ${params.tool}`);
      }
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  respondToDraftPreview(input: RespondToDraftPreviewInput): void {
    const open = this.#drafts.get(input.requestId);
    if (!open) throw new Error("This card is already decided or no longer open.");
    const { card } = open;
    if (input.text !== undefined && (!input.text.trim() || input.text.length > L.preview)) {
      throw new Error(`The edited text has 1–${L.preview} characters.`);
    }
    let draftId = card.draftId;
    let draftsChanged = false;
    if (input.decision === "keep-draft") {
      draftId = draftId ?? card.requestId;
      // Saved before the card closes: when the store refuses, the card stays open.
      this.#options.drafts.save({
        id: draftId,
        botId: card.botId,
        threadId: card.threadId,
        variant: card.variant,
        title: card.title,
        recipient: card.recipient,
        channel: card.channel,
        preview: card.preview,
        keptAt: this.#now(),
      });
      draftsChanged = true;
    }
    this.#drafts.delete(input.requestId);
    if (input.decision === "send" && card.draftId && this.#options.drafts.delete(card.draftId)) draftsChanged = true;
    if (draftsChanged) this.#emitDrafts();
    open.resolve(
      textResult({
        decision: input.decision,
        text: input.decision === "edit" ? (input.text ?? card.preview) : card.preview,
        ...(input.decision === "edit" && input.feedback ? { feedback: input.feedback } : {}),
        ...(input.decision === "keep-draft" ? { draftId } : {}),
        instruction: DRAFT_INSTRUCTIONS[input.decision],
      }),
    );
    this.#options.emit({
      type: "draft-preview-resolved",
      requestId: card.requestId,
      botId: card.botId,
      resolution: input.decision,
    });
  }

  async respondToBrowserTakeover(input: RespondToBrowserTakeoverInput): Promise<void> {
    const open = this.#takeovers.get(input.requestId);
    if (!open) throw new Error("This takeover request is no longer open.");
    if (input.action === "take-over") {
      if (open.phase === "taken-over") return;
      open.phase = "taken-over";
      try {
        await this.#options.showTab?.(open.request.tabId);
      } catch {
        // The tab may be gone; the person still sees the card and can decline.
      }
      this.#emitTakeover(open, "taken-over");
      return;
    }
    this.#finishTakeover(input.requestId, open, takeoverEnd(input.action));
  }

  /** Error text when a browser tool would touch a tab that a person controls right now. */
  blockedBrowserTool(params: DynamicToolCallParams): string | null {
    if (params.tool === "list_tabs" || params.tool === "open") return null;
    const tabId = isDynamicRecord(params.arguments) && isString(params.arguments.tabId) ? params.arguments.tabId : null;
    if (!tabId) return null;
    for (const open of this.#takeovers.values()) {
      if (open.phase === "taken-over" && open.request.tabId === tabId) {
        return "A person controls this browser tab right now. Wait until they give it back.";
      }
    }
    return null;
  }

  /** Open cards with their shared creation order. */
  listPending(): Array<{ sequence: number; request: PendingActionCard }> {
    const drafts = [...this.#drafts.values()].map((open) => ({
      sequence: open.sequence,
      request: { kind: "draft-preview" as const, card: structuredClone(open.card) },
    }));
    const takeovers = [...this.#takeovers.values()].map((open) => ({
      sequence: open.sequence,
      request: { kind: "browser-takeover" as const, request: structuredClone(open.request), phase: open.phase },
    }));
    return [...drafts, ...takeovers].sort((left, right) => left.sequence - right.sequence);
  }

  pendingCount(botId: string): number {
    let count = 0;
    for (const open of this.#drafts.values()) if (open.card.botId === botId) count += 1;
    for (const open of this.#takeovers.values()) if (open.request.botId === botId) count += 1;
    return count;
  }

  listDrafts(): KeptDraft[] {
    return this.#options.drafts.list();
  }

  deleteDraft(draftId: string): void {
    if (!this.#options.drafts.delete(draftId)) throw new Error("This draft no longer exists.");
    this.#emitDrafts();
  }

  /** The turn ended or stopped: its open cards close and nothing counts as approved. */
  expireTurn(providerThreadId: string, turnId: string): void {
    for (const [requestId, open] of this.#drafts) {
      if (open.providerThreadId === providerThreadId && open.card.turnId === turnId) this.#expireDraft(requestId, open);
    }
    for (const [requestId, open] of this.#takeovers) {
      if (open.providerThreadId === providerThreadId && open.request.turnId === turnId) {
        this.#finishTakeover(requestId, open, "expired");
      }
    }
  }

  expireAll(): void {
    for (const [requestId, open] of this.#drafts) this.#expireDraft(requestId, open);
    for (const [requestId, open] of this.#takeovers) this.#finishTakeover(requestId, open, "expired");
  }

  #confirm(context: CardContext, args: DynamicRecord): Promise<DynamicToolResult> {
    const draftId = optionalText(args, "draftId", ID_LIMIT);
    const kept = draftId === null ? null : this.#options.drafts.get(draftId);
    if (draftId !== null && (!kept || kept.botId !== context.botId)) {
      throw new Error("This kept draft does not exist or belongs to another agent.");
    }
    if (kept && [...this.#drafts.values()].some((open) => open.card.draftId === kept.id)) {
      throw new Error("This kept draft already has an open card.");
    }
    const variant = args.variant ?? kept?.variant ?? "draft";
    if (!isOneOf(DRAFT_PREVIEW_VARIANTS, variant)) throw new Error('variant must be "draft" or "confirm".');
    const preview = optionalText(args, "preview", L.preview) ?? kept?.preview ?? null;
    if (!preview) throw new Error("preview is required: the exact text or action the user approves.");
    const { createdAt, sequence } = this.#options.order();
    const card: DraftPreviewCard = {
      requestId: `card-${this.#newId()}`,
      botId: context.botId,
      threadId: context.threadId,
      turnId: context.turnId,
      variant,
      title:
        optionalText(args, "title", L.title) ??
        kept?.title ??
        (variant === "draft" ? "Send this draft?" : "Confirm this action?"),
      recipient: optionalText(args, "recipient", L.recipient) ?? kept?.recipient ?? null,
      channel: optionalText(args, "channel", L.channel) ?? kept?.channel ?? null,
      preview,
      draftId: kept?.id ?? null,
      createdAt,
    };
    return new Promise((resolve) => {
      this.#drafts.set(card.requestId, { card, sequence, providerThreadId: context.providerThreadId, resolve });
      this.#options.emit({ type: "draft-preview", card: structuredClone(card) });
    });
  }

  #requestTakeover(context: CardContext, args: DynamicRecord): Promise<DynamicToolResult> {
    const tabId = optionalText(args, "tabId", ID_LIMIT);
    const reason = optionalText(args, "reason", L.reason);
    if (!tabId || !reason) throw new Error("tabId and reason are required.");
    const tab = this.#options.tabs?.().find((candidate) => candidate.id === tabId);
    if (!tab) throw new Error("Unknown browser tab. List the tabs with openbot_browser.list_tabs first.");
    if ([...this.#takeovers.values()].some((open) => open.request.tabId === tabId)) {
      throw new Error("This tab already waits for a person.");
    }
    const { createdAt, sequence } = this.#options.order();
    const request: BrowserTakeoverRequest = {
      requestId: `takeover-${this.#newId()}`,
      botId: context.botId,
      threadId: context.threadId,
      turnId: context.turnId,
      tabId,
      url: tab.url,
      reason,
      createdAt,
    };
    return new Promise((resolve) => {
      this.#takeovers.set(request.requestId, {
        request,
        phase: "requested",
        sequence,
        providerThreadId: context.providerThreadId,
        resolve,
      });
      this.#options.emit({ type: "browser-takeover", request: structuredClone(request) });
    });
  }

  #expireDraft(requestId: string, open: OpenDraft): void {
    this.#drafts.delete(requestId);
    open.resolve(textResult({ decision: "expired", instruction: DRAFT_INSTRUCTIONS.expired }));
    this.#options.emit({
      type: "draft-preview-resolved",
      requestId: open.card.requestId,
      botId: open.card.botId,
      resolution: "expired",
    });
  }

  #finishTakeover(requestId: string, open: OpenTakeover, phase: "returned" | "declined" | "expired"): void {
    this.#takeovers.delete(requestId);
    const tab = this.#options.tabs?.().find((candidate) => candidate.id === open.request.tabId);
    this.#emitTakeover(open, phase);
    open.resolve(
      textResult({
        outcome: phase,
        tabId: open.request.tabId,
        url: tab?.url ?? open.request.url,
        instruction: TAKEOVER_INSTRUCTIONS[phase],
      }),
    );
  }

  #emitTakeover(open: OpenTakeover, phase: BrowserTakeoverPhase): void {
    this.#options.emit({
      type: "browser-takeover-changed",
      requestId: open.request.requestId,
      botId: open.request.botId,
      phase,
    });
  }

  #emitDrafts(): void {
    this.#options.emit({ type: "drafts-changed", drafts: this.listDrafts() });
  }

  #now(): string {
    return this.#options.now?.() ?? new Date().toISOString();
  }

  #newId(): string {
    return this.#options.newId?.() ?? randomUUID();
  }
}

function takeoverEnd(action: Exclude<BrowserTakeoverAction, "take-over">): "returned" | "declined" {
  return action === "return" ? "returned" : "declined";
}

/** A trimmed string argument, or null when it is missing or blank. */
function optionalText(args: DynamicRecord, key: string, limit: number): string | null {
  const value = args[key];
  if (value === undefined || value === null) return null;
  if (!isString(value)) throw new Error(`${key} must be text.`);
  if (value.length > limit) throw new Error(`${key} has at most ${limit} characters.`);
  return value.trim() ? value : null;
}

function textResult(value: unknown): DynamicToolResult {
  return { success: true, contentItems: [{ type: "inputText", text: JSON.stringify(value) }] };
}

function failure(message: string): DynamicToolResult {
  return { success: false, contentItems: [{ type: "inputText", text: message }] };
}
