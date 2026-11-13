// COSGRAL W2: agent tools for the local Vault (`cosgral_vault`), the same path as `cosgral_eyes`:
// Codex dynamic functions and a Claude in-process MCP server, also in channel turns.
//
// The agent sees summaries only. Fill tools type values straight into the built-in browser and return which
// fields were typed, never the values. A login is typed only into a page of its own site; several matches go to
// the person to choose; a payment card is typed only after the person confirms it. Missing items are asked for
// with a Needs you card (`vault-request`); the program never makes one up.

import { randomUUID } from "node:crypto";
import {
  type AgentEvent,
  type BrowserTab,
  type DraftPreviewResolution,
  isVaultItemKind,
  type PendingVaultRequest,
  type RespondToVaultRequestInput,
  VAULT_ITEM_KINDS,
  VAULT_LIMITS,
  type VaultItemKind,
  type VaultItemSummary,
  type VaultRequest,
  type VaultRequestMode,
  type VaultRequestResolution,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { z } from "zod";
import type { CardContext } from "./action-cards";
import type { DynamicToolCallParams, DynamicToolResult } from "./protocol";
import type { VaultStore } from "./vault-store";

export const VAULT_NAMESPACE = "cosgral_vault";

const tabId = z.string().min(1).max(200);
const revision = z.number().int().min(0);
const ref = z.string().min(1).max(64);
const itemId = z.string().min(1).max(200);

/** One schema for Codex dynamic functions and the Claude in-process MCP server. */
export const VAULT_TOOL_SPECS: Array<{ name: string; description: string; schema: z.ZodRawShape }> = [
  {
    name: "list_vault_items",
    description:
      "List the items in this computer's Vault (logins, cards, contacts, API keys, authenticator keys). You get labels, sites, user names and the last card digits, never a password, number or key.",
    schema: { kind: z.enum(VAULT_ITEM_KINDS).optional(), query: z.string().max(120).optional() },
  },
  {
    name: "request_vault_item",
    description:
      "Ask the person to add an item the Vault does not have (a login, card, contact, API key or authenticator key) and wait. Never ask them to paste a secret into the chat.",
    schema: {
      kind: z.enum(VAULT_ITEM_KINDS),
      reason: z.string().min(1).max(VAULT_LIMITS.reason),
      url: z.string().max(VAULT_LIMITS.url).optional(),
      name: z.string().max(VAULT_LIMITS.label).optional(),
    },
  },
  {
    name: "fill_login",
    description:
      "Type the Vault login for the tab's site into the page: give the element refs from openbot_browser.snapshot. You never see the values. A login is typed only into a page of its own site; when several match, the person chooses.",
    schema: { tabId, revision, usernameRef: ref.optional(), passwordRef: ref.optional(), itemId: itemId.optional() },
  },
  {
    name: "fill_totp",
    description:
      "Type the current two-step (authenticator) code for the tab's site into the page element ref. The program makes the code; you never see it.",
    schema: { tabId, revision, ref, itemId: itemId.optional() },
  },
  {
    name: "fill_contact",
    description: "Type a Vault contact (name, e-mail, phone, address) into the page element refs you give.",
    schema: {
      tabId,
      revision,
      itemId,
      nameRef: ref.optional(),
      emailRef: ref.optional(),
      phoneRef: ref.optional(),
      addressRef: ref.optional(),
    },
  },
  {
    name: "fill_card",
    description:
      "Type a Vault payment card into the page. The person must confirm this card on this page first; if they do not, nothing is typed.",
    schema: {
      tabId,
      revision,
      itemId,
      numberRef: ref,
      expiryRef: ref.optional(),
      cvcRef: ref.optional(),
      holderRef: ref.optional(),
    },
  },
  {
    name: "save_api_key",
    description:
      "Save an API key the person gave you in the Vault under a variable name like OPENAI_API_KEY, for tools of this program. Do not repeat the value afterwards.",
    schema: {
      name: z.string().min(1).max(VAULT_LIMITS.apiKeyName),
      value: z.string().min(1).max(VAULT_LIMITS.apiKeyValue),
      label: z.string().max(VAULT_LIMITS.label).optional(),
    },
  },
  {
    name: "save_login",
    description:
      "Save a login the person gave you (site address, user name, password) in the Vault, or change the password of the same site and user. Do not repeat the password afterwards.",
    schema: {
      url: z.string().min(1).max(VAULT_LIMITS.url),
      username: z.string().min(1).max(VAULT_LIMITS.username),
      password: z.string().min(1).max(VAULT_LIMITS.password),
      label: z.string().max(VAULT_LIMITS.label).optional(),
    },
  },
  {
    name: "save_two_step_key",
    description:
      "When you turn on two-step sign-in for a site, choose the authenticator-app method and save the setup key the site shows (or its otpauth:// link) on that site's Vault login. Then use fill_totp for the code.",
    schema: { itemId, setupKey: z.string().min(1).max(VAULT_LIMITS.totpSecret) },
  },
];

export const VAULT_DYNAMIC_TOOLS = {
  type: "namespace",
  name: VAULT_NAMESPACE,
  description:
    "Use logins, cards, contacts, API keys and two-step codes from this computer's Vault without seeing them.",
  tools: VAULT_TOOL_SPECS.map((spec) => ({
    type: "function",
    name: spec.name,
    description: spec.description,
    inputSchema: z.toJSONSchema(z.object(spec.schema)),
  })),
};

/** Added to the developer instructions of direct and channel threads. */
export const VAULT_INSTRUCTIONS = `For sign-ins, payment cards, contact details, API keys and two-step codes use ${VAULT_NAMESPACE}: list items (you never see secret values), type them into the built-in browser with the fill tools, and never ask the person to paste a password, card number or key into the chat. When the Vault lacks an item, ask with request_vault_item. A payment card is typed only after the person confirms it.`;

export interface VaultBrowser {
  tabs(): BrowserTab[];
  /** Types a value into the element `ref` without returning anything about the page. */
  typeSecret(tabId: string, revision: number, ref: string, value: string): Promise<void>;
}

interface OpenRequest {
  request: VaultRequest;
  sequence: number;
  providerThreadId: string;
  resolve: (answer: { resolution: VaultRequestResolution; itemId: string | null }) => void;
}

export interface VaultRequestsOptions {
  emit: (event: AgentEvent) => void;
  /** Creation time and order shared with the other Needs you cards. */
  order: () => { createdAt: string; sequence: number };
  store: () => VaultStore | null;
  newId?: () => string;
}

/** Needs you cards for the Vault: add a missing item, or choose between matching ones. */
export class VaultRequests {
  readonly #options: VaultRequestsOptions;
  readonly #open = new Map<string, OpenRequest>();

  constructor(options: VaultRequestsOptions) {
    this.#options = options;
  }

  open(
    context: CardContext,
    input: {
      mode: VaultRequestMode;
      kind: VaultItemKind;
      reason: string;
      origin: string | null;
      label: string | null;
      candidateIds: string[];
    },
  ): Promise<{ resolution: VaultRequestResolution; itemId: string | null }> {
    const { createdAt, sequence } = this.#options.order();
    const request: VaultRequest = {
      requestId: this.#options.newId?.() ?? `vault-${randomUUID()}`,
      botId: context.botId,
      threadId: context.threadId,
      turnId: context.turnId,
      ...input,
      createdAt,
    };
    return new Promise((resolve) => {
      this.#open.set(request.requestId, { request, sequence, providerThreadId: context.providerThreadId, resolve });
      this.#options.emit({ type: "vault-request", request: structuredClone(request) });
    });
  }

  respond(input: RespondToVaultRequestInput): void {
    const open = this.#open.get(input.requestId);
    if (!open) throw new Error("This Vault request is no longer open.");
    if (input.decline === true) {
      this.#finish(open, "declined", null);
      return;
    }
    if (!input.itemId) throw new Error("Choose or save the item to use, or decline the request.");
    const store = this.#options.store();
    if (!store) throw new Error("The Vault is not available.");
    const item = store.get(input.itemId);
    if (item.kind !== open.request.kind)
      throw new Error(`The agent asked for a ${open.request.kind}, not a ${item.kind}.`);
    if (open.request.mode === "choose" && !open.request.candidateIds.includes(item.id)) {
      throw new Error("Choose one of the matching items.");
    }
    this.#finish(open, "provided", item.id);
  }

  listPending(): Array<{ sequence: number; request: PendingVaultRequest }> {
    return [...this.#open.values()]
      .map((open) => ({
        sequence: open.sequence,
        request: { kind: "vault-request" as const, request: structuredClone(open.request) },
      }))
      .sort((left, right) => left.sequence - right.sequence);
  }

  pendingCount(botId: string): number {
    return [...this.#open.values()].filter((open) => open.request.botId === botId).length;
  }

  expireTurn(providerThreadId: string, turnId: string): void {
    for (const open of [...this.#open.values()]) {
      if (open.providerThreadId === providerThreadId && open.request.turnId === turnId) {
        this.#finish(open, "expired", null);
      }
    }
  }

  expireAll(): void {
    for (const open of [...this.#open.values()]) this.#finish(open, "expired", null);
  }

  #finish(open: OpenRequest, resolution: VaultRequestResolution, itemId: string | null): void {
    this.#open.delete(open.request.requestId);
    open.resolve({ resolution, itemId });
    this.#options.emit({
      type: "vault-request-resolved",
      requestId: open.request.requestId,
      botId: open.request.botId,
      resolution,
    });
  }
}

export interface VaultToolsOptions {
  store: () => VaultStore | null;
  requests: VaultRequests;
  browser: VaultBrowser | null;
  /** A confirm card the person decides (Confirm / Edit / Cancel); only "send" approves. */
  confirm: (
    context: CardContext,
    input: { title: string; preview: string; recipient?: string; channel?: string },
  ) => Promise<DraftPreviewResolution>;
  now?: () => number;
}

const TYPED_NOTE = "Typed from the Vault; you never see the values. Take a fresh snapshot before your next action.";

export class VaultTools {
  readonly #options: VaultToolsOptions;

  constructor(options: VaultToolsOptions) {
    this.#options = options;
  }

  async handleDynamicTool(params: DynamicToolCallParams, context: CardContext): Promise<DynamicToolResult> {
    try {
      const store = this.#options.store();
      if (!store) throw new Error("The Vault is not available.");
      const args = isDynamicRecord(params.arguments) ? params.arguments : {};
      switch (params.tool) {
        case "list_vault_items":
          return textResult({ items: store.list({ kind: optionalKind(args.kind), query: optionalText(args.query) }) });
        case "request_vault_item":
          return textResult(await this.#request(store, args, context));
        case "fill_login":
          return textResult(await this.#fillLogin(store, args, context));
        case "fill_totp":
          return textResult(await this.#fillTotp(store, args, context));
        case "fill_contact":
          return textResult(await this.#fillContact(store, args));
        case "fill_card":
          return textResult(await this.#fillCard(store, args, context));
        case "save_api_key":
          return textResult(this.#saveApiKey(store, args));
        case "save_login":
          return textResult(this.#saveLogin(store, args));
        case "save_two_step_key":
          return textResult(this.#saveTwoStepKey(store, args));
        default:
          throw new Error(`Unknown Vault tool: ${params.tool}`);
      }
    } catch (error) {
      return { success: false, contentItems: [{ type: "inputText", text: errorText(error) }] };
    }
  }

  async #request(store: VaultStore, args: DynamicRecord, context: CardContext) {
    const kind = optionalKind(args.kind);
    if (!kind) throw new Error("kind is required: login, card, contact, apiKey or totp.");
    const reason = requiredText(args.reason, "reason");
    const url = optionalText(args.url);
    const answer = await this.#options.requests.open(context, {
      mode: "add",
      kind,
      reason: reason.slice(0, VAULT_LIMITS.reason),
      origin: url ? originOf(url) : null,
      label: optionalText(args.name)?.slice(0, VAULT_LIMITS.label) ?? null,
      candidateIds: [],
    });
    if (answer.resolution !== "provided" || !answer.itemId) {
      return { outcome: answer.resolution, instruction: "Nothing was added. Do not guess or make up the item." };
    }
    return { outcome: "provided", item: store.get(answer.itemId) };
  }

  async #fillLogin(store: VaultStore, args: DynamicRecord, context: CardContext) {
    const { tab, revision } = this.#tab(args);
    const usernameRef = optionalText(args.usernameRef);
    const passwordRef = optionalText(args.passwordRef);
    if (!usernameRef && !passwordRef) throw new Error("Give usernameRef, passwordRef or both.");
    const item = await this.#login(store, context, tab, optionalText(args.itemId), false, "Sign in");
    if ("outcome" in item) return item;
    const secrets = store.secrets(item.id);
    if (secrets.kind !== "login") throw new Error("This Vault item is not a login.");
    const filled: string[] = [];
    if (usernameRef) {
      await this.#type(tab.id, revision, usernameRef, secrets.username);
      filled.push("username");
    }
    if (passwordRef) {
      await this.#type(tab.id, revision, passwordRef, secrets.password);
      filled.push("password");
    }
    return {
      outcome: "filled",
      filled,
      item: { id: item.id, label: item.label, origin: item.origin, username: item.username },
      instruction: TYPED_NOTE,
    };
  }

  async #fillTotp(store: VaultStore, args: DynamicRecord, context: CardContext) {
    const { tab, revision } = this.#tab(args);
    const elementRef = requiredText(args.ref, "ref");
    const requested = optionalText(args.itemId);
    const item =
      requested && store.get(requested).kind === "totp"
        ? store.get(requested)
        : await this.#login(store, context, tab, requested, true, "Two-step sign-in");
    if ("outcome" in item) return item;
    const code = store.totpCode(item.id, this.#options.now?.() ?? Date.now());
    await this.#type(tab.id, revision, elementRef, code);
    return { outcome: "filled", filled: ["totp"], item: { id: item.id, label: item.label }, instruction: TYPED_NOTE };
  }

  async #fillContact(store: VaultStore, args: DynamicRecord) {
    const { tab, revision } = this.#tab(args);
    const item = store.get(requiredText(args.itemId, "itemId"));
    const secrets = store.secrets(item.id);
    if (secrets.kind !== "contact") throw new Error("This Vault item is not a contact.");
    const filled: string[] = [];
    const missing: string[] = [];
    for (const [field, value] of [
      ["name", secrets.name],
      ["email", secrets.email],
      ["phone", secrets.phone],
      ["address", secrets.address],
    ] as const) {
      const elementRef = optionalText(args[`${field}Ref`]);
      if (!elementRef) continue;
      if (!value) {
        missing.push(field);
        continue;
      }
      await this.#type(tab.id, revision, elementRef, value);
      filled.push(field);
    }
    if (!filled.length && !missing.length)
      throw new Error("Give at least one of nameRef, emailRef, phoneRef, addressRef.");
    return { outcome: "filled", filled, missing, item: { id: item.id, label: item.label }, instruction: TYPED_NOTE };
  }

  async #fillCard(store: VaultStore, args: DynamicRecord, context: CardContext) {
    const { tab, revision } = this.#tab(args);
    const item = store.get(requiredText(args.itemId, "itemId"));
    const secrets = store.secrets(item.id);
    if (secrets.kind !== "card") throw new Error("This Vault item is not a payment card.");
    const numberRef = requiredText(args.numberRef, "numberRef");
    const site = originOf(tab.url) ?? tab.url;
    const decision = await this.#options.confirm(context, {
      title: `Use card •••• ${item.cardLast4} on ${hostOf(tab.url)}?`,
      preview: `Card •••• ${item.cardLast4}, expires ${item.cardExpiry}, holder ${secrets.holderName}\nPage: ${site}`,
      recipient: site,
      channel: "payment card",
    });
    if (decision !== "send") {
      return {
        outcome: "not-confirmed",
        decision,
        instruction: "The person did not confirm this card on this page; nothing was typed.",
      };
    }
    const filled: string[] = [];
    await this.#type(tab.id, revision, numberRef, secrets.number);
    filled.push("number");
    const expiryRef = optionalText(args.expiryRef);
    if (expiryRef && item.cardExpiry) {
      await this.#type(tab.id, revision, expiryRef, item.cardExpiry);
      filled.push("expiry");
    }
    const cvcRef = optionalText(args.cvcRef);
    if (cvcRef && secrets.cvc) {
      await this.#type(tab.id, revision, cvcRef, secrets.cvc);
      filled.push("cvc");
    }
    const holderRef = optionalText(args.holderRef);
    if (holderRef) {
      await this.#type(tab.id, revision, holderRef, secrets.holderName);
      filled.push("holder");
    }
    return { outcome: "filled", filled, item: { id: item.id, label: item.label }, instruction: TYPED_NOTE };
  }

  #saveApiKey(store: VaultStore, args: DynamicRecord) {
    const name = requiredText(args.name, "name");
    const existing = store.list({ kind: "apiKey" }).find((item) => item.name === name);
    const saved = store.save({
      kind: "apiKey",
      id: existing?.id,
      name,
      value: requiredText(args.value, "value"),
      label: optionalText(args.label),
    });
    return { saved, instruction: "Saved in the Vault. Do not repeat the value in the chat." };
  }

  #saveLogin(store: VaultStore, args: DynamicRecord) {
    const url = requiredText(args.url, "url");
    const username = requiredText(args.username, "username");
    const origin = originOf(url);
    const existing = store
      .list({ kind: "login" })
      .find((item) => item.origin === origin && item.username === username.trim());
    const saved = store.save({
      kind: "login",
      id: existing?.id,
      url,
      username,
      password: requiredText(args.password, "password"),
      label: optionalText(args.label),
    });
    return { saved, instruction: "Saved in the Vault. Do not repeat the password in the chat." };
  }

  #saveTwoStepKey(store: VaultStore, args: DynamicRecord) {
    const item = store.get(requiredText(args.itemId, "itemId"));
    const secrets = store.secrets(item.id);
    if (secrets.kind !== "login") throw new Error("Save a two-step key on the site's login.");
    const saved = store.save({
      kind: "login",
      id: item.id,
      url: secrets.url,
      username: secrets.username,
      twoStepKey: requiredText(args.setupKey, "setupKey"),
    });
    return { saved, instruction: "Saved. Use fill_totp to type the current code; do not repeat the setup key." };
  }

  /** The login for the tab's site: the given one (same site only), the only match, or the person's choice. */
  async #login(
    store: VaultStore,
    context: CardContext,
    tab: BrowserTab,
    requested: string | undefined,
    twoStep: boolean,
    reason: string,
  ): Promise<VaultItemSummary | { outcome: VaultRequestResolution; instruction: string }> {
    const site = originOf(tab.url) ?? tab.url;
    const matches = store.matchLogins(tab.url).filter((item) => !twoStep || item.hasTwoStepKey);
    if (requested) {
      const item = store.get(requested);
      if (item.kind !== "login") throw new Error("This Vault item is not a login.");
      if (!matches.some((match) => match.id === item.id)) {
        throw new Error(`This login is for another site (${item.origin}); it is never typed into ${site}.`);
      }
      return item;
    }
    if (!matches.length) {
      throw new Error(
        `The Vault has no ${twoStep ? "two-step key" : "login"} for ${site}. Ask the person with request_vault_item.`,
      );
    }
    if (matches.length === 1 && matches[0]) return matches[0];
    const answer = await this.#options.requests.open(context, {
      mode: "choose",
      kind: "login",
      reason: `${reason} on ${site}`,
      origin: site,
      label: null,
      candidateIds: matches.map((match) => match.id),
    });
    if (answer.resolution !== "provided" || !answer.itemId) {
      return { outcome: answer.resolution, instruction: "The person did not choose a login; nothing was typed." };
    }
    return store.get(answer.itemId);
  }

  #tab(args: DynamicRecord): { tab: BrowserTab; revision: number } {
    const browser = this.#options.browser;
    if (!browser) throw new Error("The built-in browser is not available.");
    const id = requiredText(args.tabId, "tabId");
    const tab = browser.tabs().find((candidate) => candidate.id === id);
    if (!tab) throw new Error("Unknown browser tab. List the tabs with openbot_browser.list_tabs first.");
    if (!isNumber(args.revision) || !Number.isInteger(args.revision) || args.revision < 0) {
      throw new Error("revision is required: the revision of your latest snapshot.");
    }
    return { tab, revision: args.revision };
  }

  async #type(tabId: string, pageRevision: number, elementRef: string, value: string): Promise<void> {
    const browser = this.#options.browser;
    if (!browser) throw new Error("The built-in browser is not available.");
    await browser.typeSecret(tabId, pageRevision, elementRef, value);
  }
}

function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function optionalKind(value: unknown): VaultItemKind | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isVaultItemKind(value)) throw new Error("kind must be login, card, contact, apiKey or totp.");
  return value;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isString(value)) throw new Error("Expected text.");
  return value.trim() ? value : undefined;
}

function requiredText(value: unknown, field: string): string {
  const text = optionalText(value);
  if (!text) throw new Error(`${field} is required.`);
  return text;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function textResult(value: unknown): DynamicToolResult {
  return { success: true, contentItems: [{ type: "inputText", text: JSON.stringify(value) }] };
}
