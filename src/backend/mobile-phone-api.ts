// COSGRAL W3: the phone API (parity rows 43–44) on the Mobile Connect server. Same device token, same per-address
// limits; on top: writes per device and minute, and a few open event streams per device. The phone reads and writes
// the chat with agents, answers the cards it may answer (see mobile-policy.ts), follows an event stream, and creates or
// edits agents' profiles through the agent creator. Permissions, Computer Use, the Vault, remote desktop, MCP, voice,
// devices and settings stay on the computer (403). Message texts go to the phone because they are the chat; cards
// carry only what is needed to decide, and the stream carries no message text at all.

import type { IncomingMessage, ServerResponse } from "node:http";
import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import {
  type AgentEvent,
  type AgentTemplate,
  BOT_AVATAR_HUES,
  type BotAvatarHue,
  type BotSummary,
  type ConversationMessage,
  type ConversationSnapshot,
  type CreateAgentInput,
  type CreateAgentResult,
  formatMobileStreamEvent,
  MOBILE_COMPUTER_ONLY,
  MOBILE_PHONE_LIMITS,
  type MobileAgentDetail,
  type MobileDevice,
  type MobileMessage,
  type MobileNeedsYouDetail,
  type MobileStreamEvent,
  type PendingAgentRequest,
  type QueuedMessageReceipt,
  type RespondToApprovalInput,
  type RespondToDraftPreviewInput,
  type RespondToPromptInput,
  type SendMessageInput,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isNumber, isOneOf, isString } from "@openbot/contracts/runtime-values";
import { mobileAgents, mobileNeedsYou } from "./mobile-connect";
import { HttpError, readJson, sendJson } from "./mobile-http";
import { phoneAnswerPolicy } from "./mobile-policy";

/** What the phone API needs from the program (AgentService in the app). */
export interface MobilePhoneHost {
  bots: () => BotSummary[];
  readConversation: (botId: string) => Promise<ConversationSnapshot>;
  sendMessage: (input: SendMessageInput) => Promise<QueuedMessageReceipt>;
  pending: () => PendingAgentRequest[];
  respondToPrompt: (input: RespondToPromptInput) => Promise<void>;
  respondToApproval: (input: RespondToApprovalInput) => Promise<void>;
  respondToDraftPreview: (input: RespondToDraftPreviewInput) => Promise<void>;
  templates: () => AgentTemplate[];
  /** The agent creator (W3-BE2). */
  createAgent: (input: CreateAgentInput) => Promise<CreateAgentResult>;
  /** Agent settings (W3-BE2): name, role and description only. */
  updateProfile: (input: { botId: string; name?: string; role?: string; description?: string }) => Promise<void>;
  setAvatarHue: (botId: string, hue: BotAvatarHue) => Promise<void>;
  /** Program events; returns the unsubscribe. */
  subscribe: (listener: (event: AgentEvent) => void) => () => void;
}

export interface MobilePhoneApiOptions {
  host: MobilePhoneHost;
  now?: () => Date;
  /** Coalescing of Needs you changes before a stream event. */
  needsYouDelayMs?: number;
  /** Coalescing of conversation changes per agent. */
  conversationDelayMs?: number;
}

export interface PhoneRequest {
  request: IncomingMessage;
  response: ServerResponse;
  path: string;
  query: URLSearchParams;
  device: MobileDevice;
}

interface Stream {
  deviceId: string;
  response: ServerResponse;
  heartbeat: NodeJS.Timeout;
}

const NEEDS_YOU_EVENTS = new Set<AgentEvent["type"]>([
  "prompt",
  "approval",
  "draft-preview",
  "browser-takeover",
  "vault-request",
  "prompt-resolved",
  "approval-resolved",
  "draft-preview-resolved",
  "browser-takeover-changed",
  "vault-request-resolved",
]);
const CONVERSATION_EVENTS = new Set<AgentEvent["type"]>([
  "conversation",
  "conversation-delta",
  "turn-started",
  "turn-completed",
]);
/** Agent fields that stay on the computer. */
const COMPUTER_FIELDS = [
  "tools",
  "model",
  "reasoningEffort",
  "skills",
  "memories",
  "mcp",
  "notifications",
  "permissions",
  "fallbackModels",
];
const PROFILE_FIELDS = new Set(["name", "role", "instructions", "avatarHue"]);
const COMPUTER_LABELS: Record<(typeof MOBILE_COMPUTER_ONLY)[number], string> = {
  "computer-use": "Computer Use",
  vault: "The Vault",
  "remote-desktop": "Remote desktop",
  devices: "Paired devices",
  settings: "Settings",
  permissions: "Permissions",
  mcp: "MCP servers",
  voice: "Voice",
  mobile: "Mobile Connect",
};

export class MobilePhoneApi {
  readonly #host: MobilePhoneHost;
  readonly #options: MobilePhoneApiOptions;
  readonly #streams = new Set<Stream>();
  readonly #writes = new Map<string, number[]>();
  #unsubscribe: (() => void) | null = null;
  #needsYouTimer: NodeJS.Timeout | null = null;
  readonly #conversationTimers = new Map<string, NodeJS.Timeout>();

  constructor(options: MobilePhoneApiOptions) {
    this.#host = options.host;
    this.#options = options;
  }

  /** False when the path is not part of the phone API (the server answers 404). */
  async handle(input: PhoneRequest): Promise<boolean> {
    const parts = segments(input.path);
    if (parts[0] !== "v1" || parts.length < 2) return false;
    const area = parts[1] ?? "";
    const method = input.request.method ?? "GET";
    if (isOneOf(MOBILE_COMPUTER_ONLY, area)) {
      throw new HttpError(403, `${COMPUTER_LABELS[area]} is changed on the computer, not on the phone.`);
    }
    if (area === "threads" && parts.length === 2) return this.#only(method, "GET", () => this.#threads(input));
    if (area === "events" && parts.length === 2) return this.#only(method, "GET", () => this.#stream(input));
    if (area === "templates" && parts.length === 2) return this.#only(method, "GET", () => this.#templates(input));
    if (area === "agents") {
      if (parts.length === 2) return this.#only(method, "POST", () => this.#createAgent(input));
      const botId = parts[2] ?? "";
      if (parts.length === 3) {
        if (method === "GET") return this.#run(() => this.#agent(input, botId));
        if (method === "PATCH") return this.#run(() => this.#updateAgent(input, botId));
        if (method === "DELETE") throw new HttpError(403, "Agents are deleted on the computer, not on the phone.");
        throw new HttpError(405, "Use GET or PATCH.");
      }
      if (parts.length === 4 && parts[3] === "messages") {
        if (method === "GET") return this.#run(() => this.#messages(input, botId));
        if (method === "POST") return this.#run(() => this.#send(input, botId));
        throw new HttpError(405, "Use GET or POST.");
      }
      return false;
    }
    if (area === "needs-you") {
      const id = parts[2] ?? "";
      if (parts.length === 3) return this.#only(method, "GET", () => this.#detail(input, id));
      if (parts.length === 4 && parts[3] === "answer") return this.#only(method, "POST", () => this.#answer(input, id));
      return false;
    }
    return false;
  }

  /** The device was removed: its streams end at once. */
  disconnect(deviceId: string): void {
    for (const stream of [...this.#streams]) if (stream.deviceId === deviceId) this.#end(stream);
  }

  /** Server stop: every stream ends. */
  closeAll(): void {
    for (const stream of [...this.#streams]) this.#end(stream);
    if (this.#needsYouTimer) clearTimeout(this.#needsYouTimer);
    this.#needsYouTimer = null;
    for (const timer of this.#conversationTimers.values()) clearTimeout(timer);
    this.#conversationTimers.clear();
  }

  // -- chat (row 43) --------------------------------------------------------------------------------------------

  async #threads(input: PhoneRequest): Promise<void> {
    sendJson(input.response, 200, {
      threads: this.#host.bots().map((bot) => ({
        botId: bot.id,
        threadId: bot.threadId,
        name: bot.name,
        preview: bot.preview,
        updatedAt: bot.updatedAt,
      })),
    });
  }

  async #messages(input: PhoneRequest, botId: string): Promise<void> {
    this.#bot(botId);
    const limitText = input.query.get("limit");
    const limit = limitText === null ? MOBILE_PHONE_LIMITS.messagesPage : Number(limitText);
    if (!Number.isInteger(limit) || limit < 1 || limit > MOBILE_PHONE_LIMITS.messagesPageMax) {
      throw new HttpError(400, `limit is from 1 to ${MOBILE_PHONE_LIMITS.messagesPageMax}.`);
    }
    const snapshot = await this.#host.readConversation(botId);
    const messages = snapshot.messages.filter((message) => message.text.trim() || message.attachments?.length);
    const before = input.query.get("before");
    let end = messages.length;
    if (before !== null) {
      end = messages.findIndex((message) => message.id === before);
      if (end < 0) throw new HttpError(400, "before is not a message of this conversation.");
    }
    const start = Math.max(0, end - limit);
    sendJson(input.response, 200, {
      botId,
      messages: messages.slice(start, end).map(phoneMessage),
      nextBefore: start > 0 ? (messages[start]?.id ?? null) : null,
    });
  }

  async #send(input: PhoneRequest, botId: string): Promise<void> {
    this.#bot(botId);
    this.#write(input.device.id);
    const body = await readJson(input.request, MOBILE_PHONE_LIMITS.messageBodyBytes);
    const text = isString(body.text) ? body.text.trim() : "";
    if (!text) throw new HttpError(400, "text is required.");
    if (text.length > MOBILE_PHONE_LIMITS.messageText) {
      throw new HttpError(400, `A message from the phone has at most ${MOBILE_PHONE_LIMITS.messageText} characters.`);
    }
    const reply = body.replyToMessageId;
    if (reply !== undefined && reply !== null && (!isString(reply) || reply.length > INPUT_LIMITS.identifier)) {
      throw new HttpError(400, "replyToMessageId must be a message id or null.");
    }
    const message: SendMessageInput = { botId, text };
    if (reply !== undefined) message.replyToMessageId = reply;
    const receipt = await hostCall(() => this.#host.sendMessage(message));
    sendJson(input.response, 202, { messageId: receipt.messageId });
  }

  // -- Needs you (row 43) ---------------------------------------------------------------------------------------

  async #detail(input: PhoneRequest, id: string): Promise<void> {
    sendJson(input.response, 200, needsYouDetail(this.#pending(id)));
  }

  async #answer(input: PhoneRequest, id: string): Promise<void> {
    this.#write(input.device.id);
    const pending = this.#pending(id);
    const refused = phoneAnswerPolicy(pending);
    if (refused) throw new HttpError(403, refused);
    const body = await readJson(input.request, MOBILE_PHONE_LIMITS.messageBodyBytes);
    if (body.kind !== pending.kind) throw new HttpError(409, `This card is a ${pending.kind}; answer it as one.`);
    if (pending.kind === "prompt") {
      const answers = promptAnswers(body.answers, pending);
      await hostCall(() => this.#host.respondToPrompt({ requestId: pending.requestId, answers }));
    } else if (pending.kind === "approval") {
      if (body.decision !== "accept" && body.decision !== "decline") {
        throw new HttpError(400, 'decision is "accept" or "decline".');
      }
      const decision = body.decision;
      await hostCall(() => this.#host.respondToApproval({ requestId: pending.approval.requestId, decision }));
    } else if (pending.kind === "draft-preview") {
      if (body.decision !== "send" && body.decision !== "edit" && body.decision !== "keep-draft") {
        throw new HttpError(400, 'decision is "send", "edit" or "keep-draft".');
      }
      const answer: RespondToDraftPreviewInput = { requestId: pending.card.requestId, decision: body.decision };
      const feedback = optionalText(body.feedback, "feedback", MOBILE_PHONE_LIMITS.messageText);
      const text = optionalText(body.text, "text", MOBILE_PHONE_LIMITS.messageText);
      if (feedback !== undefined) answer.feedback = feedback;
      if (text !== undefined) answer.text = text;
      await hostCall(() => this.#host.respondToDraftPreview(answer));
    }
    sendJson(input.response, 200, { ok: true });
  }

  #pending(id: string): PendingAgentRequest {
    const pending = this.#host.pending().find((request) => pendingId(request) === id);
    if (!pending) throw new HttpError(404, "This card is no longer open.");
    return pending;
  }

  // -- event stream ---------------------------------------------------------------------------------------------

  async #stream(input: PhoneRequest): Promise<void> {
    const own = [...this.#streams].filter((stream) => stream.deviceId === input.device.id).length;
    if (own >= MOBILE_PHONE_LIMITS.streamsPerDevice || this.#streams.size >= MOBILE_PHONE_LIMITS.streams) {
      throw new HttpError(429, "Too many open event streams; close one first.");
    }
    const response = input.response;
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      connection: "keep-alive",
    });
    const heartbeat = setInterval(() => response.write(": ping\n\n"), MOBILE_PHONE_LIMITS.heartbeatMs);
    heartbeat.unref();
    const stream: Stream = { deviceId: input.device.id, response, heartbeat };
    this.#streams.add(stream);
    response.once("close", () => this.#end(stream));
    this.#unsubscribe ??= this.#host.subscribe((event) => this.#onEvent(event));
    response.write(formatMobileStreamEvent({ type: "needs-you", items: mobileNeedsYou(this.#host.pending()) }));
  }

  #onEvent(event: AgentEvent): void {
    if (NEEDS_YOU_EVENTS.has(event.type)) {
      this.#needsYouTimer ??= setTimeout(() => {
        this.#needsYouTimer = null;
        this.#broadcast({ type: "needs-you", items: mobileNeedsYou(this.#host.pending()) });
      }, this.#options.needsYouDelayMs ?? 200);
      return;
    }
    if (CONVERSATION_EVENTS.has(event.type)) {
      const botId = eventBotId(event);
      if (!botId || this.#conversationTimers.has(botId)) return;
      const timer = setTimeout(() => {
        this.#conversationTimers.delete(botId);
        this.#broadcast({ type: "conversation", botId });
      }, this.#options.conversationDelayMs ?? 500);
      this.#conversationTimers.set(botId, timer);
      return;
    }
    if (event.type === "bots-changed") this.#broadcast({ type: "agents", agents: mobileAgents(event.bots) });
  }

  #broadcast(event: MobileStreamEvent): void {
    const text = formatMobileStreamEvent(event);
    for (const stream of this.#streams) stream.response.write(text);
  }

  #end(stream: Stream): void {
    if (!this.#streams.delete(stream)) return;
    clearInterval(stream.heartbeat);
    if (!stream.response.writableEnded) stream.response.end();
    stream.response.socket?.destroy();
    if (this.#streams.size === 0) {
      this.#unsubscribe?.();
      this.#unsubscribe = null;
    }
  }

  // -- agents (row 44) ------------------------------------------------------------------------------------------

  async #templates(input: PhoneRequest): Promise<void> {
    sendJson(input.response, 200, {
      templates: this.#host.templates().map((template) => ({
        id: template.id,
        name: template.name,
        role: template.role,
        summary: template.summary,
      })),
    });
  }

  async #agent(input: PhoneRequest, botId: string): Promise<void> {
    sendJson(input.response, 200, { agent: agentDetail(this.#bot(botId)) });
  }

  async #createAgent(input: PhoneRequest): Promise<void> {
    this.#write(input.device.id);
    const body = await readJson(input.request, MOBILE_PHONE_LIMITS.messageBodyBytes);
    const profile = agentProfile(body, true);
    if (profile.templateId !== undefined && !this.#host.templates().some((item) => item.id === profile.templateId)) {
      throw new HttpError(400, "This template does not exist.");
    }
    const request: CreateAgentInput = {};
    if (profile.templateId !== undefined) request.templateId = profile.templateId;
    if (profile.name !== undefined) request.name = profile.name;
    if (profile.role !== undefined) request.role = profile.role;
    if (profile.instructions !== undefined) request.description = profile.instructions;
    const result = await hostCall(() => this.#host.createAgent(request));
    const warnings = [...result.warnings];
    if (profile.avatarHue !== undefined) {
      const hue = profile.avatarHue;
      try {
        await this.#host.setAvatarHue(result.bot.id, hue);
      } catch (error) {
        warnings.push(`The color could not be set: ${errorText(error)}`);
      }
    }
    const bot = this.#host.bots().find((candidate) => candidate.id === result.bot.id) ?? result.bot;
    sendJson(input.response, 201, { agent: agentDetail(bot), warnings });
  }

  async #updateAgent(input: PhoneRequest, botId: string): Promise<void> {
    this.#write(input.device.id);
    const body = await readJson(input.request, MOBILE_PHONE_LIMITS.messageBodyBytes);
    const profile = agentProfile(body, false);
    this.#bot(botId);
    const change: { botId: string; name?: string; role?: string; description?: string } = { botId };
    if (profile.name !== undefined) change.name = profile.name;
    if (profile.role !== undefined) change.role = profile.role;
    if (profile.instructions !== undefined) change.description = profile.instructions;
    if (Object.keys(change).length === 1 && profile.avatarHue === undefined) {
      throw new HttpError(400, "Nothing to change: send name, role, instructions or avatarHue.");
    }
    if (Object.keys(change).length > 1) await hostCall(() => this.#host.updateProfile(change));
    const hue = profile.avatarHue;
    if (hue !== undefined) await hostCall(() => this.#host.setAvatarHue(botId, hue));
    sendJson(input.response, 200, { agent: agentDetail(this.#bot(botId)) });
  }

  // -- helpers --------------------------------------------------------------------------------------------------

  #bot(botId: string): BotSummary {
    const bot = this.#host.bots().find((candidate) => candidate.id === botId);
    if (!bot) throw new HttpError(404, "This agent does not exist.");
    return bot;
  }

  #write(deviceId: string): void {
    const now = (this.#options.now?.() ?? new Date()).getTime();
    const recent = (this.#writes.get(deviceId) ?? []).filter((at) => now - at < 60_000);
    if (recent.length >= MOBILE_PHONE_LIMITS.writesPerMinute) {
      this.#writes.set(deviceId, recent);
      throw new HttpError(429, "Too many changes from this phone; wait a minute.");
    }
    recent.push(now);
    this.#writes.set(deviceId, recent);
  }

  async #only(method: string, allowed: string, work: () => Promise<void>): Promise<boolean> {
    if (method !== allowed) throw new HttpError(405, `Use ${allowed}.`);
    return this.#run(work);
  }

  async #run(work: () => Promise<void>): Promise<boolean> {
    await work();
    return true;
  }
}

function segments(path: string): string[] {
  try {
    return path.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    throw new HttpError(400, "The address is not valid.");
  }
}

function phoneMessage(message: ConversationMessage): MobileMessage {
  const text = message.text.length > 50_000 ? `${message.text.slice(0, 50_000)}…` : message.text;
  return {
    id: message.id,
    author: message.author,
    text,
    createdAt: message.createdAt,
    status: message.status,
    itemType: message.itemType ?? null,
    attachments: message.attachments?.length ?? 0,
  };
}

function pendingId(request: PendingAgentRequest): string {
  switch (request.kind) {
    case "prompt":
      return String(request.requestId);
    case "approval":
      return String(request.approval.requestId);
    case "draft-preview":
      return request.card.requestId;
    case "browser-takeover":
    case "vault-request":
      return request.request.requestId;
  }
}

function needsYouDetail(request: PendingAgentRequest): MobileNeedsYouDetail {
  const item = mobileNeedsYou([request])[0];
  if (!item) throw new HttpError(404, "This card is no longer open.");
  switch (request.kind) {
    case "prompt":
      return {
        kind: "prompt",
        item,
        questions: request.questions.map((question) => ({
          id: question.id,
          header: question.header,
          question: question.question,
          options: question.options?.map((option) => option.label) ?? null,
        })),
      };
    case "approval": {
      const command = request.approval.command;
      return {
        kind: "approval",
        item,
        approvalKind: request.approval.kind,
        command: command ? cut(command, MOBILE_PHONE_LIMITS.command) : null,
        reason: request.approval.reason,
      };
    }
    case "draft-preview": {
      const answerable = phoneAnswerPolicy(request) === null;
      return {
        kind: "draft-preview",
        item,
        variant: request.card.variant,
        recipient: answerable ? request.card.recipient : null,
        channel: request.card.channel,
        preview: answerable ? cut(request.card.preview, MOBILE_PHONE_LIMITS.draftPreview) : "",
      };
    }
    case "browser-takeover":
      return { kind: "browser-takeover", item };
    case "vault-request":
      return { kind: "vault-request", item };
  }
}

function promptAnswers(
  value: unknown,
  request: Extract<PendingAgentRequest, { kind: "prompt" }>,
): Record<string, string[]> {
  if (!isDynamicRecord(value)) throw new HttpError(400, "answers is an object: question id → list of answers.");
  const questions = new Set(request.questions.map((question) => question.id));
  const answers: Record<string, string[]> = {};
  for (const [id, list] of Object.entries(value)) {
    if (!questions.has(id)) throw new HttpError(400, `There is no question ${id.slice(0, 40)} on this card.`);
    if (!Array.isArray(list) || list.length > MOBILE_PHONE_LIMITS.promptAnswers) {
      throw new HttpError(400, `Each question has at most ${MOBILE_PHONE_LIMITS.promptAnswers} answers.`);
    }
    answers[id] = list.map((answer) => {
      if (!isString(answer) || !answer.trim() || answer.length > MOBILE_PHONE_LIMITS.promptAnswerText) {
        throw new HttpError(400, `Each answer has 1–${MOBILE_PHONE_LIMITS.promptAnswerText} characters.`);
      }
      return answer.trim();
    });
  }
  return answers;
}

function agentProfile(
  body: DynamicRecord,
  creating: boolean,
): { templateId?: string; name?: string; role?: string; instructions?: string; avatarHue?: BotAvatarHue } {
  const blocked = Object.keys(body).filter((key) => COMPUTER_FIELDS.includes(key));
  if (blocked.length) {
    throw new HttpError(
      403,
      `${blocked.join(", ")}: tool switches, models, skills, memory and notifications are changed on the computer.`,
    );
  }
  const unknown = Object.keys(body).filter((key) => !PROFILE_FIELDS.has(key) && !(creating && key === "templateId"));
  if (unknown.length) throw new HttpError(400, `Unknown fields: ${unknown.join(", ").slice(0, 120)}.`);
  const profile: {
    templateId?: string;
    name?: string;
    role?: string;
    instructions?: string;
    avatarHue?: BotAvatarHue;
  } = {};
  const templateId = optionalText(body.templateId, "templateId", INPUT_LIMITS.identifier);
  const name = optionalText(body.name, "name", INPUT_LIMITS.agentName);
  const role = optionalText(body.role, "role", INPUT_LIMITS.agentTitle);
  const instructions = optionalText(body.instructions, "instructions", INPUT_LIMITS.agentDescription);
  if (templateId !== undefined) profile.templateId = templateId;
  if (name !== undefined) profile.name = name;
  if (role !== undefined) profile.role = role;
  if (instructions !== undefined) profile.instructions = instructions;
  if (body.avatarHue !== undefined) {
    if (!isNumber(body.avatarHue) || !isOneOf(BOT_AVATAR_HUES, body.avatarHue)) {
      throw new HttpError(400, `avatarHue is one of ${BOT_AVATAR_HUES.join(", ")}.`);
    }
    profile.avatarHue = body.avatarHue;
  }
  return profile;
}

function agentDetail(bot: BotSummary): MobileAgentDetail {
  return {
    ...(mobileAgents([bot])[0] ?? {
      id: bot.id,
      name: bot.name,
      role: bot.role,
      avatarHue: bot.avatarHue,
      model: bot.model,
    }),
    instructions: bot.description,
  };
}

function eventBotId(event: AgentEvent): string | null {
  if (event.type === "conversation") return event.snapshot.botId;
  if (event.type === "conversation-delta" || event.type === "turn-started" || event.type === "turn-completed") {
    return event.botId;
  }
  return null;
}

function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isString(value)) throw new HttpError(400, `${field} must be text.`);
  const text = value.trim();
  if (text.length > max) throw new HttpError(400, `${field} has at most ${max} characters.`);
  return text;
}

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** A program error becomes 409 with its own message (it says what to do; no secrets are in it). */
async function hostCall<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(409, cut(errorText(error), 300));
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
