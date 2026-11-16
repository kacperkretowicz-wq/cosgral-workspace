// COSGRAL W5-BE3: API keys of the providers (OpenAI for Codex, Anthropic for Claude) instead of a subscription login.
// The key is only an input: the answer carries a mask (the last 4 characters) and a state, never the key. The program
// keeps the key encrypted (safeStorage) and passes it only as an environment variable of the one provider process.

import { type DynamicRecord, isDynamicRecord, isOneOf, isString } from "./runtime-values";

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

export const API_KEY_PROVIDERS = ["codex", "claude"] as const;
export type ApiKeyProvider = (typeof API_KEY_PROVIDERS)[number];

/** ok = the provider accepted the key; rejected = it said no (401/403); unchecked = never checked or no answer. */
export const API_KEY_STATUSES = ["ok", "rejected", "unchecked"] as const;
export type ApiKeyStatus = (typeof API_KEY_STATUSES)[number];

export const API_KEY_LIMITS = { min: 8, max: 512 } as const;

export interface ApiKeyEntry {
  provider: ApiKeyProvider;
  /** "••••1234" (the last 4 characters; just "••••" for a short key); null = no key saved. */
  maskedKey: string | null;
  status: ApiKeyStatus;
  /** Readable result of the last check ("The provider rejected this key."); never contains the key. */
  message: string | null;
  /** When the connection was last checked (ISO); null when never. */
  checkedAt: string | null;
  /** When the key was saved (ISO); null when no key. */
  updatedAt: string | null;
}

export interface SetApiKeyInput {
  provider: ApiKeyProvider;
  /** Input only. Never stored in clear text, logged, or sent back. */
  key: string;
}

export interface ApiKeyProviderInput {
  provider: ApiKeyProvider;
}

/** COSGRAL W5-BE3 window API. Optional in the window until every mock has it. */
export interface ApiKeysDesktopApi {
  /** One entry per provider (Codex, Claude), with or without a key. */
  list: () => Promise<ApiKeyEntry[]>;
  /** Saves the key encrypted; the status starts as "unchecked". A key is never checked by itself. */
  set: (input: SetApiKeyInput) => Promise<ApiKeyEntry>;
  remove: (input: ApiKeyProviderInput) => Promise<ApiKeyEntry>;
  /** Connection test with the provider's endpoint; only when the person clicks. Never throws for a rejected key. */
  check: (input: ApiKeyProviderInput) => Promise<ApiKeyEntry>;
}

export function isApiKeyProvider(value: unknown): value is ApiKeyProvider {
  return isOneOf(API_KEY_PROVIDERS, value);
}

export function isApiKeyEntry(value: unknown): value is ApiKeyEntry {
  return (
    isDynamicRecord(value) &&
    isApiKeyProvider(value.provider) &&
    isNullableString(value.maskedKey) &&
    isOneOf(API_KEY_STATUSES, value.status) &&
    isNullableString(value.message) &&
    isNullableString(value.checkedAt) &&
    isNullableString(value.updatedAt)
  );
}

export function isApiKeyEntryList(value: unknown): value is ApiKeyEntry[] {
  return Array.isArray(value) && value.every(isApiKeyEntry);
}

function record(value: unknown): DynamicRecord {
  if (!isDynamicRecord(value)) throw new Error("Expected an object.");
  return value;
}

function provider(value: unknown): ApiKeyProvider {
  if (!isApiKeyProvider(value)) throw new Error("Choose Codex or Claude.");
  return value;
}

export function parseApiKeyProviderInput(value: unknown): ApiKeyProviderInput {
  return { provider: provider(record(value).provider) };
}

/** A pasted key: trimmed, one printable ASCII token. The error text never repeats the key. */
export function parseSetApiKeyInput(value: unknown): SetApiKeyInput {
  const input = record(value);
  const key = isString(input.key) ? input.key.trim() : "";
  if (key.length < API_KEY_LIMITS.min || key.length > API_KEY_LIMITS.max || !/^[\x21-\x7e]+$/.test(key))
    throw new Error(`Paste the API key as one piece of ${API_KEY_LIMITS.min} to ${API_KEY_LIMITS.max} characters.`);
  return { provider: provider(input.provider), key };
}
