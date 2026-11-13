// COSGRAL W2: the local Vault (spec W2 §3, parity row 26; lead decision W2-3: local only, on safeStorage).
//
// Logins, payment cards, contacts, API keys and authenticator (TOTP) keys of this computer. Every value of an item
// is encrypted with the operating system (Electron safeStorage, DPAPI on Windows). Lists, events, logs and the
// text an agent sees carry only a summary without secret values. Agents use items through tools that type them
// into the built-in browser; a payment card needs the person's confirmation first.

import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const VAULT_ITEM_KINDS = ["login", "card", "contact", "apiKey", "totp"] as const;
export type VaultItemKind = (typeof VAULT_ITEM_KINDS)[number];

/** Every limit of the Vault in one place. */
export const VAULT_LIMITS = {
  label: 120,
  url: 2_048,
  username: 320,
  password: 1_024,
  cardholder: 120,
  cardNumberDigits: 19,
  cvc: 4,
  contactField: 300,
  address: 600,
  apiKeyName: 64,
  apiKeyValue: 8_192,
  totpSecret: 1_024,
  reason: 300,
  items: 2_000,
} as const;

/** What lists, events and agents see about an item: never a secret value. */
export interface VaultItemSummary {
  id: string;
  kind: VaultItemKind;
  label: string;
  /** login: the site's origin, e.g. "https://example.com". */
  origin: string | null;
  /** login: the user name (not a secret). */
  username: string | null;
  /** login: a two-step (TOTP) setup key is stored with it. */
  hasTwoStepKey: boolean;
  /** card: last four digits. */
  cardLast4: string | null;
  /** card: expiry as "MM/YY". */
  cardExpiry: string | null;
  /** contact: display name; apiKey: variable name, e.g. "OPENAI_API_KEY"; totp: issuer. */
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A new item (no `id`) or a change (`id`). A change keeps every secret field that is left out;
 * `twoStepKey: null` removes the two-step key of a login.
 */
export type SaveVaultItemInput =
  | {
      kind: "login";
      id?: string;
      label?: string;
      url: string;
      username: string;
      password?: string;
      twoStepKey?: string | null;
    }
  | {
      kind: "card";
      id?: string;
      label?: string;
      holderName: string;
      number?: string;
      expiryMonth: number;
      expiryYear: number;
      cvc?: string;
    }
  | {
      kind: "contact";
      id?: string;
      label?: string;
      name: string;
      email?: string;
      phone?: string;
      address?: string;
    }
  | { kind: "apiKey"; id?: string; label?: string; name: string; value?: string }
  | { kind: "totp"; id?: string; label?: string; issuer: string; account?: string; secret?: string };

export interface DeleteVaultItemInput {
  itemId: string;
}

export interface VaultStatus {
  /** False when the operating system cannot encrypt: then nothing can be saved. */
  encryptionAvailable: boolean;
  items: number;
}

/**
 * An agent's request to the person: "add" a missing item, or "choose" between several matching items
 * (the program never guesses). It waits in Needs you until the person answers or the turn ends.
 */
export const VAULT_REQUEST_MODES = ["add", "choose"] as const;
export type VaultRequestMode = (typeof VAULT_REQUEST_MODES)[number];

export interface VaultRequest {
  requestId: string;
  botId: string;
  threadId: string;
  turnId: string;
  mode: VaultRequestMode;
  kind: VaultItemKind;
  /** Why the agent needs it, in one line, e.g. "Sign in to the test bank". */
  reason: string;
  /** add: the site or service the item is for, when known. */
  origin: string | null;
  /** add: a suggested label, or the variable name of an API key. */
  label: string | null;
  /** choose: the matching items the person picks from. */
  candidateIds: string[];
  createdAt: string;
}

export const VAULT_REQUEST_RESOLUTIONS = ["provided", "declined", "expired"] as const;
export type VaultRequestResolution = (typeof VAULT_REQUEST_RESOLUTIONS)[number];

/** The person's answer: the item to use (saved now or chosen), or `decline: true`. */
export interface RespondToVaultRequestInput {
  requestId: string;
  itemId?: string;
  decline?: boolean;
}

const SUMMARY_KEYS = new Set([
  "id",
  "kind",
  "label",
  "origin",
  "username",
  "hasTwoStepKey",
  "cardLast4",
  "cardExpiry",
  "name",
  "createdAt",
  "updatedAt",
]);

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

export function isVaultItemKind(value: unknown): value is VaultItemKind {
  return isOneOf(VAULT_ITEM_KINDS, value);
}

/** Also refuses any extra key, so a secret can never ride along in a summary. */
export function isVaultItemSummary(value: unknown): value is VaultItemSummary {
  return (
    isDynamicRecord(value) &&
    Object.keys(value).every((key) => SUMMARY_KEYS.has(key)) &&
    isString(value.id) &&
    isVaultItemKind(value.kind) &&
    isString(value.label) &&
    isNullableString(value.origin) &&
    isNullableString(value.username) &&
    isBoolean(value.hasTwoStepKey) &&
    isNullableString(value.cardLast4) &&
    isNullableString(value.cardExpiry) &&
    isNullableString(value.name) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

export function isVaultRequest(value: unknown): value is VaultRequest {
  return (
    isDynamicRecord(value) &&
    isString(value.requestId) &&
    isString(value.botId) &&
    isString(value.threadId) &&
    isString(value.turnId) &&
    isOneOf(VAULT_REQUEST_MODES, value.mode) &&
    isVaultItemKind(value.kind) &&
    isString(value.reason) &&
    isNullableString(value.origin) &&
    isNullableString(value.label) &&
    Array.isArray(value.candidateIds) &&
    value.candidateIds.every(isString) &&
    isString(value.createdAt)
  );
}

export function isVaultRequestResolution(value: unknown): value is VaultRequestResolution {
  return isOneOf(VAULT_REQUEST_RESOLUTIONS, value);
}

export function isVaultStatus(value: unknown): value is VaultStatus {
  return isDynamicRecord(value) && isBoolean(value.encryptionAvailable) && isNumber(value.items);
}
