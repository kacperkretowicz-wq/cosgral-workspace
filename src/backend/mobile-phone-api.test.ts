// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgentEvent,
  type AgentTemplate,
  type BotSummary,
  type ConversationMessage,
  type CreateAgentInput,
  MOBILE_API_PATHS,
  MOBILE_PHONE_LIMITS,
  MOBILE_PHONE_PATHS,
  type MobileStreamEvent,
  mobilePhonePath,
  type PendingAgentRequest,
  parseMobileStreamEvents,
  type RespondToApprovalInput,
  type RespondToDraftPreviewInput,
  type RespondToPromptInput,
  type SendMessageInput,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import { MobileConnect, mobileAgents, mobileNeedsYou } from "./mobile-connect";
import { MobilePhoneApi, type MobilePhoneHost } from "./mobile-phone-api";
import { MobileStore } from "./mobile-store";

const roots: string[] = [];
const running: MobileConnect[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((mobile) => mobile.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function bot(id: string, fields: Partial<BotSummary> = {}): BotSummary {
  return {
    id,
    name: id,
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
    avatarHue: 150,
    avatarUrl: null,
    ...fields,
  };
}

function message(id: string, text: string, author: ConversationMessage["author"] = "assistant"): ConversationMessage {
  return { id, author, text, createdAt: `2026-11-13T19:0${id.slice(1)}:00.000Z`, status: "completed" };
}

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
  createdAt: "2026-11-13T19:00:00.000Z",
};
const SECRET: PendingAgentRequest = {
  ...PROMPT,
  requestId: 8,
  questions: [{ id: "p", header: "Password", question: "Your bank password?", isSecret: true, options: null }],
};
function approval(requestId: number, kind: "command" | "permissions"): PendingAgentRequest {
  return {
    kind: "approval",
    createdAt: "2026-11-13T19:00:00.000Z",
    approval: {
      requestId,
      botId: "scout",
      threadId: "t",
      turnId: "u",
      kind,
      command: kind === "command" ? "npm test" : null,
      cwd: "C:\\work\\scout",
      reason: "Run the tests",
      grantRoot: null,
      permissions: null,
    },
  };
}
function card(requestId: string, variant: "draft" | "confirm"): PendingAgentRequest {
  return {
    kind: "draft-preview",
    card: {
      requestId,
      botId: "scout",
      threadId: "t",
      turnId: "u",
      variant,
      title: variant === "draft" ? "Send this e-mail to Anna?" : "Let the agent control this computer?",
      recipient: "anna@example.test",
      channel: "email",
      preview: "Hello Anna, the report is attached.",
      draftId: null,
      createdAt: "2026-11-13T19:00:00.000Z",
    },
  };
}
const TAKEOVER: PendingAgentRequest = {
  kind: "browser-takeover",
  phase: "requested",
  request: {
    requestId: "take-1",
    botId: "scout",
    threadId: "t",
    turnId: "u",
    tabId: "tab",
    url: "https://bank.test",
    reason: "Sign in to your bank",
    createdAt: "2026-11-13T19:00:00.000Z",
  },
};

const TEMPLATE: AgentTemplate = {
  id: "builtin:writer",
  origin: "built-in",
  name: "Writer",
  role: "Writing",
  summary: "Drafts posts.",
  description: "You write.",
  model: null,
  reasoningEffort: null,
  tools: {},
  skills: [],
  memories: [],
  avatarHue: 30,
  suggested: true,
  createdAt: null,
};

interface HostState {
  pending: PendingAgentRequest[];
  sent: SendMessageInput[];
  prompts: RespondToPromptInput[];
  approvals: RespondToApprovalInput[];
  drafts: RespondToDraftPreviewInput[];
  created: CreateAgentInput[];
  profiles: Array<{ botId: string; name?: string; role?: string; description?: string }>;
  hues: Array<{ botId: string; hue: number }>;
  listeners: Set<(event: AgentEvent) => void>;
}

function fakeHost() {
  const bots = new Map<string, BotSummary>([
    ["scout", bot("scout")],
    ["writer", bot("writer", { preview: "Draft ready" })],
  ]);
  const conversation = ["m1", "m2", "m3", "m4", "m5"].map((id, index) =>
    message(id, `Message ${index + 1}`, index % 2 ? "user" : "assistant"),
  );
  const state: HostState = {
    pending: [
      PROMPT,
      SECRET,
      approval(9, "command"),
      approval(10, "permissions"),
      card("card-1", "draft"),
      card("card-2", "confirm"),
      TAKEOVER,
    ],
    sent: [],
    prompts: [],
    approvals: [],
    drafts: [],
    created: [],
    profiles: [],
    hues: [],
    listeners: new Set(),
  };
  const host: MobilePhoneHost = {
    bots: () => [...bots.values()],
    // Like the database page: the newest `limit` messages before the cursor, oldest first; null for a bad cursor.
    messages: async (_botId, page) => {
      const end =
        page.before === null ? conversation.length : conversation.findIndex((item) => item.id === page.before);
      if (end < 0) return null;
      const start = Math.max(0, end - page.limit);
      return { messages: conversation.slice(start, end), hasMore: start > 0 };
    },
    sendMessage: async (input) => {
      state.sent.push(input);
      return { messageId: `sent-${state.sent.length}`, deliveries: [] };
    },
    pending: () => state.pending,
    respondToPrompt: async (input) => {
      state.prompts.push(input);
    },
    respondToApproval: async (input) => {
      state.approvals.push(input);
    },
    respondToDraftPreview: async (input) => {
      state.drafts.push(input);
    },
    templates: () => [TEMPLATE],
    createAgent: async (input) => {
      state.created.push(input);
      const created = bot("new-1", { name: input.name ?? "Writer", description: input.description ?? "You write." });
      bots.set(created.id, created);
      return { bot: created, warnings: ['Skill "weekly-report" is not in the skill library.'] };
    },
    updateProfile: async (input) => {
      state.profiles.push(input);
      const current = bots.get(input.botId);
      if (current) bots.set(input.botId, { ...current, ...input });
    },
    setAvatarHue: async (botId, hue) => {
      state.hues.push({ botId, hue });
      const current = bots.get(botId);
      if (current) bots.set(botId, { ...current, avatarHue: hue });
    },
    subscribe: (listener) => {
      state.listeners.add(listener);
      return () => state.listeners.delete(listener);
    },
  };
  const emit = (event: AgentEvent) => {
    for (const listener of state.listeners) listener(event);
  };
  return { host, state, emit };
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "mobile-phone-"));
  roots.push(root);
  const fake = fakeHost();
  const phone = new MobilePhoneApi({ host: fake.host, needsYouDelayMs: 5, conversationDelayMs: 5 });
  const mobile = new MobileConnect({
    store: new MobileStore(join(root, "mobile.json")),
    agents: () => mobileAgents(fake.host.bots()),
    needsYou: () => mobileNeedsYou(fake.host.pending()),
    confirm: async () => "send",
    canAsk: () => true,
    emit: () => undefined,
    phone,
  });
  running.push(mobile);
  const ticket = await mobile.startPairing({ port: 0 });
  const base = ticket.urls[0] ?? "";
  const paired = await request(base, MOBILE_API_PATHS.pair, "", {
    method: "POST",
    body: { ticket: ticket.ticket, deviceName: "Phone" },
  });
  const token = isString(paired.body.token) ? paired.body.token : "";
  return { base, token, mobile, ...fake };
}

async function request(
  base: string,
  path: string,
  token: string,
  init: { method?: string; body?: DynamicRecord } = {},
): Promise<{ status: number; body: DynamicRecord }> {
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await response.json();
  return { status: response.status, body: isDynamicRecord(json) ? json : {} };
}

async function openStream(base: string, token: string, lastEventId?: string) {
  const controller = new AbortController();
  const response = await fetch(`${base}${MOBILE_PHONE_PATHS.events}`, {
    headers: { authorization: `Bearer ${token}`, ...(lastEventId ? { "last-event-id": lastEventId } : {}) },
    signal: controller.signal,
  });
  const events: MobileStreamEvent[] = [];
  const ids: string[] = [];
  let done = false;
  let buffer = "";
  const reading = (async () => {
    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const parsed = parseMobileStreamEvents(buffer + decoder.decode(chunk.value, { stream: true }));
        buffer = parsed.rest;
        events.push(...parsed.events);
        if (parsed.lastEventId) ids.push(parsed.lastEventId);
      }
    } catch {
      // Aborted by the test.
    }
    done = true;
  })();
  const next = async (type: MobileStreamEvent["type"], from: number): Promise<MobileStreamEvent> => {
    const until = Date.now() + 3_000;
    while (Date.now() < until) {
      const found = events.slice(from).find((event) => event.type === type);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`No ${type} event.`);
  };
  const ended = async () => {
    const until = Date.now() + 3_000;
    while (!done && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 10));
    return done;
  };
  return {
    status: response.status,
    events,
    ids,
    next,
    ended,
    close: () => controller.abort(),
    reading,
  };
}

async function until(check: () => boolean): Promise<void> {
  const end = Date.now() + 3_000;
  while (!check() && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 10));
}

describe("phone chat (row 43)", () => {
  it("lists one thread per agent and pages messages oldest first", async () => {
    const { base, token } = await setup();
    const threads = await request(base, MOBILE_PHONE_PATHS.threads, token);
    expect(threads.body.threads).toEqual([
      {
        botId: "scout",
        threadId: "thread-scout",
        name: "scout",
        preview: "Last message",
        updatedAt: "2026-11-13T19:00:00.000Z",
      },
      {
        botId: "writer",
        threadId: "thread-writer",
        name: "writer",
        preview: "Draft ready",
        updatedAt: "2026-11-13T19:00:00.000Z",
      },
    ]);
    const last = await request(base, `${mobilePhonePath.messages("scout")}?limit=2`, token);
    const ids = (page: DynamicRecord) =>
      Array.isArray(page.messages) ? page.messages.filter(isDynamicRecord).map((m) => m.id) : [];
    expect(ids(last.body)).toEqual(["m4", "m5"]);
    expect(last.body.nextBefore).toBe("m4");
    const older = await request(base, `${mobilePhonePath.messages("scout")}?limit=2&before=m4`, token);
    expect(ids(older.body)).toEqual(["m2", "m3"]);
    const first = await request(base, `${mobilePhonePath.messages("scout")}?limit=2&before=m2`, token);
    expect(ids(first.body)).toEqual(["m1"]);
    expect(first.body.nextBefore).toBeNull();
    expect((await request(base, mobilePhonePath.messages("ghost"), token)).status).toBe(404);
    expect((await request(base, `${mobilePhonePath.messages("scout")}?before=nope`, token)).status).toBe(400);
    expect((await request(base, MOBILE_PHONE_PATHS.threads, "")).status).toBe(401);
  });

  it("sends a message to an agent and checks its length", async () => {
    const { base, token, state } = await setup();
    const sent = await request(base, mobilePhonePath.messages("scout"), token, {
      method: "POST",
      body: { text: "  Find three sources.  ", replyToMessageId: "m5" },
    });
    expect(sent.status).toBe(202);
    expect(sent.body).toEqual({ messageId: "sent-1" });
    expect(state.sent).toEqual([{ botId: "scout", text: "Find three sources.", replyToMessageId: "m5" }]);
    expect(
      (await request(base, mobilePhonePath.messages("scout"), token, { method: "POST", body: { text: " " } })).status,
    ).toBe(400);
    const long = await request(base, mobilePhonePath.messages("scout"), token, {
      method: "POST",
      body: { text: "x".repeat(MOBILE_PHONE_LIMITS.messageText + 1) },
    });
    expect(long.status).toBe(400);
    expect(String(long.body.error)).toContain(String(MOBILE_PHONE_LIMITS.messageText));
  });

  it("answers questions, command approvals and drafts from the phone", async () => {
    const { base, token, state } = await setup();
    const detail = await request(base, mobilePhonePath.needsYouItem("7"), token);
    expect(detail.body).toMatchObject({
      kind: "prompt",
      questions: [{ id: "q", header: "Budget", question: "How much can I spend?", options: ["100", "200"] }],
    });
    const prompt = await request(base, mobilePhonePath.answer("7"), token, {
      method: "POST",
      body: { kind: "prompt", answers: { q: ["150, if it is a good hotel"] } },
    });
    expect(prompt.status).toBe(200);
    expect(state.prompts).toEqual([{ requestId: 7, answers: { q: ["150, if it is a good hotel"] } }]);
    const command = await request(base, mobilePhonePath.needsYouItem("9"), token);
    expect(command.body).toMatchObject({
      kind: "approval",
      approvalKind: "command",
      command: "npm test",
      reason: "Run the tests",
    });
    expect(JSON.stringify(command.body)).not.toContain("C:\\\\work");
    await request(base, mobilePhonePath.answer("9"), token, {
      method: "POST",
      body: { kind: "approval", decision: "decline" },
    });
    expect(state.approvals).toEqual([{ requestId: 9, decision: "decline" }]);
    const draft = await request(base, mobilePhonePath.needsYouItem("card-1"), token);
    expect(draft.body).toMatchObject({
      kind: "draft-preview",
      variant: "draft",
      preview: "Hello Anna, the report is attached.",
    });
    await request(base, mobilePhonePath.answer("card-1"), token, {
      method: "POST",
      body: { kind: "draft-preview", decision: "edit", feedback: "Shorter, please." },
    });
    expect(state.drafts).toEqual([{ requestId: "card-1", decision: "edit", feedback: "Shorter, please." }]);
    const wrongKind = await request(base, mobilePhonePath.answer("9"), token, {
      method: "POST",
      body: { kind: "draft-preview", decision: "send" },
    });
    expect(wrongKind.status).toBe(409);
    expect(
      (
        await request(base, mobilePhonePath.answer("gone"), token, {
          method: "POST",
          body: { kind: "approval", decision: "accept" },
        })
      ).status,
    ).toBe(404);
    const unknownQuestion = await request(base, mobilePhonePath.answer("7"), token, {
      method: "POST",
      body: { kind: "prompt", answers: { nope: ["x"] } },
    });
    expect(unknownQuestion.status).toBe(400);
  });

  it("leaves secrets, permissions, confirmations, takeovers and the Vault to the computer", async () => {
    const { base, token, state } = await setup();
    const list = await request(base, MOBILE_API_PATHS.needsYou, token);
    const items = Array.isArray(list.body.items) ? list.body.items.filter(isDynamicRecord) : [];
    const place = Object.fromEntries(items.map((entry) => [String(entry.id), entry.answerOn]));
    expect(place).toEqual({
      "7": "phone",
      "8": "computer",
      "9": "phone",
      "10": "computer",
      "card-1": "phone",
      "card-2": "computer",
      "take-1": "computer",
    });
    for (const [id, body] of [
      ["8", { kind: "prompt", answers: { p: ["hunter2"] } }],
      ["10", { kind: "approval", decision: "accept" }],
      ["card-2", { kind: "draft-preview", decision: "send" }],
      ["take-1", { kind: "approval", decision: "accept" }],
    ] as const) {
      const refused = await request(base, mobilePhonePath.answer(id), token, { method: "POST", body });
      expect(refused.status, id).toBe(403);
      expect(String(refused.body.error), id).toContain("computer");
    }
    const confirm = await request(base, mobilePhonePath.needsYouItem("card-2"), token);
    expect(confirm.body).toMatchObject({ kind: "draft-preview", variant: "confirm", preview: "", recipient: null });
    expect(state.prompts).toEqual([]);
    expect(state.approvals).toEqual([]);
    expect(state.drafts).toEqual([]);
  });

  it("streams Needs you and conversation changes, and ends the stream at once when the phone is removed", async () => {
    const { base, token, mobile, state, emit } = await setup();
    const stream = await openStream(base, token);
    expect(stream.status).toBe(200);
    const initial = await stream.next("needs-you", 0);
    expect(initial.type === "needs-you" && initial.items.length).toBe(7);
    const from = stream.events.length;
    state.pending = [PROMPT];
    emit({ type: "prompt-resolved", requestId: 8, botId: "scout", resolution: "answered" });
    const changed = await stream.next("needs-you", from);
    expect(changed.type === "needs-you" && changed.items.map((entry) => entry.id)).toEqual(["7"]);
    emit({
      type: "conversation-delta",
      botId: "writer",
      threadId: "t",
      turnId: "u",
      messageId: "m9",
      delta: "secret text",
      createdAt: "2026-11-13T19:10:00.000Z",
      revision: 2,
    });
    expect(await stream.next("conversation", from)).toEqual({ type: "conversation", botId: "writer" });
    expect(JSON.stringify(stream.events)).not.toContain("secret text");
    const deviceId = (await mobile.getState()).devices[0]?.id ?? "";
    await mobile.revokeDevice({ deviceId });
    expect(await stream.ended()).toBe(true);
    // The program's events stay followed for the resume window, and stop when the server stops.
    await mobile.close();
    expect(state.listeners.size).toBe(0);
  });

  it("resumes after Last-Event-ID without losing or repeating events, and starts fresh after a too long gap", async () => {
    const { base, token, emit } = await setup();
    const delta = (botId: string): AgentEvent => ({
      type: "conversation-delta",
      botId,
      threadId: "t",
      turnId: "u",
      messageId: "m",
      delta: "x",
      createdAt: "2026-11-13T19:10:00.000Z",
      revision: 2,
    });
    const first = await openStream(base, token);
    await first.next("needs-you", 0);
    emit(delta("scout"));
    await first.next("conversation", 0);
    await until(() => first.ids.length >= 2);
    const seen = first.ids.at(-1) ?? "";
    first.close();
    await new Promise((resolve) => setTimeout(resolve, 30));
    emit(delta("writer"));
    await new Promise((resolve) => setTimeout(resolve, 30));

    const second = await openStream(base, token, seen);
    expect(await second.next("conversation", 0)).toEqual({ type: "conversation", botId: "writer" });
    expect(second.events.filter((event) => event.type === "conversation" && event.botId === "scout")).toEqual([]);
    expect(second.events.some((event) => event.type === "needs-you")).toBe(false);
    second.close();

    for (let index = 0; index <= MOBILE_PHONE_LIMITS.replayEvents; index += 1) emit(delta(`bot-${index}`));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const late = await openStream(base, token, seen);
    const snapshot = await late.next("needs-you", 0);
    expect(snapshot.type).toBe("needs-you");
    expect(late.events[0]?.type).toBe("needs-you");
    late.close();
  });
});

describe("phone agents (row 44)", () => {
  it("creates an agent with the creator and edits its profile, with the creator's warnings", async () => {
    const { base, token, state } = await setup();
    expect((await request(base, MOBILE_PHONE_PATHS.templates, token)).body.templates).toEqual([
      { id: "builtin:writer", name: "Writer", role: "Writing", summary: "Drafts posts." },
    ]);
    const created = await request(base, MOBILE_PHONE_PATHS.agents, token, {
      method: "POST",
      body: { templateId: "builtin:writer", name: "Ada", instructions: "You write my posts.", avatarHue: 280 },
    });
    expect(created.status).toBe(201);
    expect(state.created).toEqual([{ templateId: "builtin:writer", name: "Ada", description: "You write my posts." }]);
    expect(state.hues).toEqual([{ botId: "new-1", hue: 280 }]);
    expect(created.body).toMatchObject({
      agent: { id: "new-1", name: "Ada", instructions: "You write my posts.", avatarHue: 280 },
      warnings: ['Skill "weekly-report" is not in the skill library.'],
    });
    const edited = await request(base, mobilePhonePath.agent("new-1"), token, {
      method: "PATCH",
      body: { role: "Blog", instructions: "Short posts." },
    });
    expect(edited.status).toBe(200);
    expect(state.profiles).toEqual([{ botId: "new-1", role: "Blog", description: "Short posts." }]);
    expect(edited.body).toMatchObject({ agent: { role: "Blog", instructions: "Short posts." } });
    expect((await request(base, mobilePhonePath.agent("new-1"), token)).body).toMatchObject({ agent: { name: "Ada" } });
  });

  it("keeps tools, models, deletion and bad values off the phone", async () => {
    const { base, token, state } = await setup();
    const tools = await request(base, mobilePhonePath.agent("scout"), token, {
      method: "PATCH",
      body: { tools: { computer: true } },
    });
    expect(tools.status).toBe(403);
    expect(String(tools.body.error)).toContain("computer");
    expect(
      (await request(base, MOBILE_PHONE_PATHS.agents, token, { method: "POST", body: { model: "x" } })).status,
    ).toBe(403);
    expect(
      (await request(base, MOBILE_PHONE_PATHS.agents, token, { method: "POST", body: { avatarHue: 7 } })).status,
    ).toBe(400);
    expect(
      (await request(base, MOBILE_PHONE_PATHS.agents, token, { method: "POST", body: { templateId: "nope" } })).status,
    ).toBe(400);
    expect((await request(base, mobilePhonePath.agent("scout"), token, { method: "PATCH", body: {} })).status).toBe(
      400,
    );
    expect((await request(base, mobilePhonePath.agent("scout"), token, { method: "DELETE" })).status).toBe(403);
    expect(
      (await request(base, mobilePhonePath.agent("ghost"), token, { method: "PATCH", body: { name: "X" } })).status,
    ).toBe(404);
    expect(state.created).toEqual([]);
    expect(state.profiles).toEqual([]);
  });
});

describe("phone limits", () => {
  it("refuses the parts of the program that stay on the computer", async () => {
    const { base, token } = await setup();
    for (const [method, path] of [
      ["GET", "/v1/vault/items"],
      ["POST", "/v1/computer-use/stop"],
      ["GET", "/v1/devices"],
      ["POST", "/v1/remote-desktop/enable"],
      ["POST", "/v1/mobile/devices/revoke"],
    ] as const) {
      const refused = await request(base, path, token, { method });
      expect(refused.status, path).toBe(403);
      expect(String(refused.body.error), path).toContain("computer");
    }
    expect((await request(base, "/v1/unknown", token)).status).toBe(404);
  });

  it("limits writes per minute and open streams per phone", async () => {
    const { base, token } = await setup();
    const statuses: number[] = [];
    for (let index = 0; index <= MOBILE_PHONE_LIMITS.writesPerMinute; index += 1) {
      statuses.push(
        (
          await request(base, mobilePhonePath.messages("scout"), token, {
            method: "POST",
            body: { text: `Hi ${index}` },
          })
        ).status,
      );
    }
    expect(statuses.slice(0, MOBILE_PHONE_LIMITS.writesPerMinute).every((status) => status === 202)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    const streams = [];
    for (let index = 0; index < MOBILE_PHONE_LIMITS.streamsPerDevice; index += 1)
      streams.push(await openStream(base, token));
    expect(streams.every((stream) => stream.status === 200)).toBe(true);
    const extra = await fetch(`${base}${MOBILE_PHONE_PATHS.events}`, { headers: { authorization: `Bearer ${token}` } });
    expect(extra.status).toBe(429);
    for (const stream of streams) stream.close();
  });
});
