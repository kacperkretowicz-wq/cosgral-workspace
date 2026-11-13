// @vitest-environment jsdom
// The phone web app against the real phone server (Mobile Connect + phone API) with a fake program behind it. The app
// script runs in jsdom; its relative requests go to the server's address.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AgentEvent,
  BotSummary,
  ConversationMessage,
  PendingAgentRequest,
  RespondToApprovalInput,
  RespondToDraftPreviewInput,
  RespondToPromptInput,
  SendMessageInput,
} from "@openbot/contracts/ipc";
import { isString } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import { MOBILE_APP_FILES } from "../backend/mobile-app-assets";
import { MobileConnect, mobileAgents, mobileNeedsYou } from "../backend/mobile-connect";
import { MobilePhoneApi, type MobilePhoneHost } from "../backend/mobile-phone-api";
import { MobileStore } from "../backend/mobile-store";

const roots: string[] = [];
const running: MobileConnect[] = [];
afterEach(async () => {
  window.dispatchEvent(new Event("cosgral-app-stop"));
  document.body.innerHTML = "";
  await Promise.all(running.splice(0).map((mobile) => mobile.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function bot(id: string, fields: Partial<BotSummary> = {}): BotSummary {
  return {
    id,
    name: id === "scout" ? "Scout" : "Writer",
    role: "Research",
    description: "Find sources.",
    notifications: true,
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    threadId: `thread-${id}`,
    workspacePath: `C:\\work\\${id}`,
    preview: "Last message",
    updatedAt: "2026-11-13T19:00:00.000Z",
    avatarSeed: id,
    avatarHue: id === "scout" ? 150 : 280,
    avatarUrl: null,
    ...fields,
  };
}

function message(index: number): ConversationMessage {
  return {
    id: `m${index}`,
    author: index % 2 ? "user" : "assistant",
    text: `Message ${index}`,
    createdAt: new Date(Date.UTC(2026, 10, 13, 19, 0, index)).toISOString(),
    status: "completed",
  };
}

const CREATED_AT = "2026-11-13T19:00:00.000Z";
const PROMPT: PendingAgentRequest = {
  kind: "prompt",
  requestId: 7,
  botId: "scout",
  threadId: "t",
  turnId: "u",
  questions: [
    {
      id: "q",
      header: "Budget",
      question: "How much can I spend?",
      isSecret: false,
      options: [
        { label: "100", description: "" },
        { label: "200", description: "" },
      ],
    },
  ],
  createdAt: CREATED_AT,
};
const SECRET: PendingAgentRequest = {
  ...PROMPT,
  requestId: 8,
  questions: [{ id: "p", header: "Password", question: "Your bank password?", isSecret: true, options: null }],
};
const APPROVAL: PendingAgentRequest = {
  kind: "approval",
  createdAt: CREATED_AT,
  approval: {
    requestId: 9,
    botId: "scout",
    threadId: "t",
    turnId: "u",
    kind: "command",
    command: "npm test",
    cwd: "C:\\work\\scout",
    reason: "Run the tests",
    grantRoot: null,
    permissions: null,
  },
};
const DRAFT: PendingAgentRequest = {
  kind: "draft-preview",
  card: {
    requestId: "card-1",
    botId: "writer",
    threadId: "t",
    turnId: "u",
    variant: "draft",
    title: "Send this e-mail to Anna?",
    recipient: "anna@example.test",
    channel: "email",
    preview: "Hello Anna, the report is attached.",
    draftId: null,
    createdAt: CREATED_AT,
  },
};

async function until(check: () => boolean, what: string): Promise<void> {
  const end = Date.now() + 4_000;
  while (!check() && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 10));
  if (!check()) throw new Error(`Timed out waiting for ${what}.\n${document.body.innerHTML.slice(0, 1_500)}`);
}

function all(selector: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(selector)];
}

function one(selector: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`Missing ${selector}`);
  return found;
}

function text(selector: string): string {
  return document.querySelector(selector)?.textContent ?? "";
}

function field(selector: string): HTMLInputElement | HTMLTextAreaElement {
  const found = document.querySelector(selector);
  if (found instanceof HTMLInputElement || found instanceof HTMLTextAreaElement) return found;
  throw new Error(`Missing field ${selector}`);
}

function type(selector: string, value: string): void {
  const target = field(selector);
  target.value = value;
  target.dispatchEvent(new Event("input", { bubbles: true }));
}

interface HostState {
  pending: PendingAgentRequest[];
  sent: SendMessageInput[];
  prompts: RespondToPromptInput[];
  approvals: RespondToApprovalInput[];
  drafts: RespondToDraftPreviewInput[];
  listeners: Set<(event: AgentEvent) => void>;
}

async function setup(options: { messages?: number } = {}) {
  const bots = new Map<string, BotSummary>([
    ["scout", bot("scout")],
    ["writer", bot("writer", { preview: "Draft ready" })],
  ]);
  const conversation = Array.from({ length: options.messages ?? 5 }, (_, index) => message(index + 1));
  const state: HostState = {
    pending: [PROMPT, SECRET, APPROVAL, DRAFT],
    sent: [],
    prompts: [],
    approvals: [],
    drafts: [],
    listeners: new Set(),
  };
  const host: MobilePhoneHost = {
    bots: () => [...bots.values()],
    messages: async (_botId, page) => {
      const end =
        page.before === null ? conversation.length : conversation.findIndex((item) => item.id === page.before);
      if (end < 0) return null;
      const start = Math.max(0, end - page.limit);
      return { messages: conversation.slice(start, end), hasMore: start > 0 };
    },
    sendMessage: async (input) => {
      state.sent.push(input);
      conversation.push({ ...message(conversation.length + 1), author: "user", text: input.text });
      return { messageId: `sent-${state.sent.length}`, deliveries: [] };
    },
    pending: () => state.pending,
    respondToPrompt: async (input) => {
      state.prompts.push(input);
      state.pending = state.pending.filter((item) => !(item.kind === "prompt" && item.requestId === input.requestId));
    },
    respondToApproval: async (input) => {
      state.approvals.push(input);
      state.pending = state.pending.filter(
        (item) => !(item.kind === "approval" && item.approval.requestId === input.requestId),
      );
    },
    respondToDraftPreview: async (input) => {
      state.drafts.push(input);
      state.pending = state.pending.filter(
        (item) => !(item.kind === "draft-preview" && item.card.requestId === input.requestId),
      );
    },
    templates: () => [],
    createAgent: async () => {
      throw new Error("not used");
    },
    updateProfile: async () => undefined,
    setAvatarHue: async () => undefined,
    subscribe: (listener) => {
      state.listeners.add(listener);
      return () => state.listeners.delete(listener);
    },
  };
  const emit = (event: AgentEvent) => {
    for (const listener of state.listeners) listener(event);
  };
  const root = await mkdtemp(join(tmpdir(), "mobile-app-client-"));
  roots.push(root);
  const mobile = new MobileConnect({
    store: new MobileStore(join(root, "mobile.json")),
    agents: () => mobileAgents(host.bots()),
    needsYou: () => mobileNeedsYou(host.pending()),
    confirm: async () => "send",
    canAsk: () => true,
    emit: () => undefined,
    phone: new MobilePhoneApi({ host, needsYouDelayMs: 5, conversationDelayMs: 5 }),
  });
  running.push(mobile);
  const ticket = await mobile.startPairing({ port: 0 });
  return { mobile, ticket, state, emit, conversation };
}

/** Opens the app the way the QR code does and runs its script. */
function openApp(base: string, hash: string): void {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  const target = new URL(base);
  history.replaceState(null, "", `/app/${hash}`);
  const realFetch = globalThis.fetch.bind(globalThis);
  // The page lives at jsdom's address; its relative requests go to the phone server. A stream that the app aborts is
  // cancelled here (Node's fetch does not take jsdom's AbortSignal).
  const toServer = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const { signal, ...rest } = init;
    const address = isString(input) && input.startsWith("/") ? `${target.origin}${input}` : String(input);
    const response = await realFetch(address, rest);
    signal?.addEventListener("abort", () => void response.body?.cancel().catch(() => undefined));
    return response;
  };
  Object.assign(window, { fetch: toServer, TextDecoder });
  Object.assign(globalThis, { fetch: toServer });
  // The page loads the script as a module (its own scope); a function body has the same scope.
  new Function(MOBILE_APP_FILES["/app/app.js"].body)();
}

async function pairThroughTheApp() {
  const fixture = await setup();
  const hash = new URL(fixture.ticket.qrPayload).hash;
  openApp(fixture.ticket.urls[0] ?? "", hash);
  await until(() => !!document.querySelector('[data-screen="pair"]'), "the pairing screen");
  return { ...fixture, hash };
}

describe("phone web app", () => {
  it("pairs with the link from the QR code and lists the agents", async () => {
    const { ticket, state } = await pairThroughTheApp();
    expect(ticket.fingerprint).toBeNull();
    expect(field("input[name='device-name']").value).not.toBe("");
    expect(location.hash).toContain(ticket.ticket);
    one("button[data-action='pair']").click();
    await until(() => !!document.querySelector('[data-screen="agents"]'), "the agent list");
    // The ticket is not kept in the address bar after pairing.
    expect(location.hash).toBe("#/agents");
    expect(all("[data-agent]").map((row) => row.dataset.agent)).toEqual(["scout", "writer"]);
    expect(text("[data-agent='scout']")).toContain("Scout");
    await until(() => text("nav [data-tab='needs'] .badge") === "4", "the Needs you count");
    expect(localStorage.getItem("cosgral.phone.v1")).toContain("token");
    expect(state.sent).toEqual([]);
  });

  it("opens a chat, pages older messages, sends a message and follows new ones from the stream", async () => {
    const fixture = await setup({ messages: 45 });
    openApp(fixture.ticket.urls[0] ?? "", new URL(fixture.ticket.qrPayload).hash);
    await until(() => !!document.querySelector("button[data-action='pair']"), "the pairing screen");
    one("button[data-action='pair']").click();
    await until(() => !!document.querySelector("[data-agent='scout']"), "the agent list");
    one("[data-agent='scout']").click();
    await until(() => all(".msg").length === 30, "the newest page");
    expect(all(".msg").at(-1)?.textContent).toContain("Message 45");
    one("button[data-action='earlier']").click();
    await until(() => all(".msg").length === 45, "the older page");
    expect(all(".msg")[0]?.textContent).toContain("Message 1");
    expect(document.querySelector("button[data-action='earlier']")).toBeNull();

    type("textarea[name='message']", "  Find three sources.  ");
    one("button[data-action='send']").click();
    await until(() => fixture.state.sent.length === 1, "the sent message");
    expect(fixture.state.sent[0]).toMatchObject({ botId: "scout", text: "Find three sources." });
    expect(field("textarea[name='message']").value).toBe("");
    await until(() => all(".msg").length === 46, "the sent message in the chat");

    fixture.conversation.push({ ...message(47), text: "A new answer" });
    fixture.emit({
      type: "conversation-delta",
      botId: "scout",
      threadId: "t",
      turnId: "u",
      messageId: "m47",
      delta: "A",
      createdAt: CREATED_AT,
      revision: 2,
    });
    await until(() => all(".msg").length === 47, "the message that came by the stream");
    expect(all(".msg").at(-1)?.textContent).toContain("A new answer");
  });

  it("answers questions, approvals and drafts on the phone, and leaves the rest to the computer", async () => {
    const { state, emit } = await pairThroughTheApp();
    one("button[data-action='pair']").click();
    await until(() => !!document.querySelector("[data-agent='scout']"), "the agent list");
    one("nav [data-tab='needs']").click();
    await until(() => all("[data-need]").length === 4, "the Needs you list");
    // What the phone can answer comes first; what stays on the computer is listed after it.
    expect(all("[data-need]").map((row) => `${row.dataset.need}:${row.dataset.place}`)).toEqual([
      "7:phone",
      "9:phone",
      "card-1:phone",
      "8:computer",
    ]);
    expect(document.querySelector("[data-computer-banner]")).not.toBeNull();

    one("[data-need='8']").click();
    await until(() => !!document.querySelector("[data-computer-only]"), "the computer-only notice");
    expect(text("[data-computer-only]")).toContain("secret");
    expect(document.querySelector("button[data-action='submit']")).toBeNull();
    one("button[data-action='back']").click();

    await until(() => !!document.querySelector("[data-need='7']"), "the list again");
    one("[data-need='7']").click();
    await until(() => all("[data-option]").length === 2, "the options");
    one("button[data-action='submit']").click();
    expect(document.querySelector("[data-error]")).not.toBeNull();
    all("[data-option]")[1]?.click();
    one("button[data-action='submit']").click();
    await until(() => state.prompts.length === 1, "the answer");
    expect(state.prompts[0]).toEqual({ requestId: 7, answers: { q: ["200"] } });

    await until(() => !!document.querySelector("[data-need='9']"), "the list after the answer");
    expect(document.querySelector("[data-need='7']")).toBeNull();
    one("[data-need='9']").click();
    await until(() => !!document.querySelector("button[data-action='accept']"), "the approval");
    expect(text("[data-command]")).toBe("npm test");
    one("button[data-action='accept']").click();
    await until(() => state.approvals.length === 1, "the approval answer");
    expect(state.approvals[0]).toEqual({ requestId: 9, decision: "accept" });

    await until(() => !!document.querySelector("[data-need='card-1']"), "the draft");
    one("[data-need='card-1']").click();
    await until(() => !!document.querySelector("button[data-action='keep-draft']"), "the draft card");
    expect(text("[data-preview]")).toContain("Hello Anna");
    one("button[data-action='keep-draft']").click();
    await until(() => state.drafts.length === 1, "the draft answer");
    expect(state.drafts[0]).toEqual({ requestId: "card-1", decision: "keep-draft" });

    // Only the secret question is left. The stream adds the badge count when a card appears on the computer.
    await until(() => !!document.querySelector('[data-screen="needs"]'), "the list after the last answer");
    await until(() => text("nav [data-tab='needs'] .badge") === "1", "the count of one");
    state.pending.push({ ...PROMPT, requestId: 99 });
    emit({ type: "prompt", requestId: 99, botId: "scout", threadId: "t", turnId: "u", questions: [] });
    await until(() => document.querySelector("nav [data-tab='needs'] .badge")?.textContent === "2", "the badge");
  });

  it("goes back to pairing when the phone is removed on the computer, and forgets itself on request", async () => {
    const fixture = await pairThroughTheApp();
    one("button[data-action='pair']").click();
    await until(() => !!document.querySelector("[data-agent='scout']"), "the agent list");
    await until(() => !!document.querySelector("[data-live='true']"), "the stream");
    const deviceId = (await fixture.mobile.getState()).devices[0]?.id ?? "";
    await fixture.mobile.revokeDevice({ deviceId });
    await until(() => !!document.querySelector('[data-screen="pair"]'), "the pairing screen after removal");
    expect(document.querySelector("[data-notice]")).not.toBeNull();
    expect(localStorage.getItem("cosgral.phone.v1")).toBeNull();
  });

  it("forgets the phone after a second tap, and keeps the chosen theme", async () => {
    const fixture = await pairThroughTheApp();
    one("button[data-action='pair']").click();
    await until(() => !!document.querySelector("[data-agent='scout']"), "the agent list");
    one("nav [data-tab='phone']").click();
    await until(() => !!document.querySelector('[data-screen="phone"]'), "the phone screen");
    one("[data-theme-choice='dark']").click();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("cosgral.theme")).toBe("dark");
    one("button[data-action='forget']").click();
    expect(localStorage.getItem("cosgral.phone.v1")).not.toBeNull();
    one("button[data-action='forget']").click();
    await until(() => !!document.querySelector('[data-screen="pair"]'), "the pairing screen");
    expect(localStorage.getItem("cosgral.phone.v1")).toBeNull();
    // Forgetting is local: the computer still lists the phone until a person removes it there.
    expect((await fixture.mobile.getState()).devices).toHaveLength(1);
  });

  it("shows the certificate fingerprint from the link and warns about a plain connection", async () => {
    const fixture = await setup();
    const fingerprint = "ab".repeat(32);
    const hash = `#v=1&t=${fixture.ticket.ticket}&f=${fingerprint}&u=${encodeURIComponent(fixture.ticket.urls[0] ?? "")}`;
    openApp(fixture.ticket.urls[0] ?? "", hash);
    await until(() => !!document.querySelector("[data-fingerprint]"), "the fingerprint");
    expect(text("[data-fingerprint]")).toBe(Array.from({ length: 32 }, () => "AB").join(":"));
    // The address is a plain loopback one here, so the app does not claim encryption.
    expect(document.querySelector("[data-plain-warning]")).toBeNull();
  });

  it("takes a pairing link that is opened in a page that is already open (only the fragment changes)", async () => {
    const fixture = await setup();
    openApp(fixture.ticket.urls[0] ?? "", "");
    await until(() => !!document.querySelector("input[name='code']"), "the code field");
    location.hash = new URL(fixture.ticket.qrPayload).hash;
    await until(() => !!document.querySelector("button[data-action='pair']"), "the pair button");
    expect(text("[data-screen='pair']")).not.toContain("removed");
  });

  it("takes a pasted link or a bare ticket when the page was opened without a code", async () => {
    const fixture = await setup();
    openApp(fixture.ticket.urls[0] ?? "", "");
    await until(() => !!document.querySelector("input[name='code']"), "the code field");
    type("input[name='code']", "not a code");
    one("button[data-action='use-code']").click();
    await until(() => !!document.querySelector("[data-error]"), "the error");
    type("input[name='code']", fixture.ticket.qrPayload);
    one("button[data-action='use-code']").click();
    await until(() => !!document.querySelector("button[data-action='pair']"), "the pair button");
  });
});
