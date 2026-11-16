// COSGRAL W5-BE3: the bridge between the key store and the code that starts a provider process.
// A process gets its key only through `apiKeyEnv(provider)` in the `env` of its own spawn; the key is never put into
// `process.env` of the program, into arguments, events or logs. `redactApiKeys` cleans any text that may echo a key.

import type { ApiKeyProvider } from "@openbot/contracts/ipc";

export interface ApiKeySource {
  /** `{ OPENAI_API_KEY }` or `{ ANTHROPIC_API_KEY }` when a key is saved; `{}` otherwise. */
  env(provider: ApiKeyProvider): NodeJS.ProcessEnv;
  /** Every saved key, decrypted (only to find it in a text). */
  values(): string[];
}

let source: ApiKeySource | null = null;

export function setApiKeySource(next: ApiKeySource | null): void {
  source = next;
}

/** The environment variables to add to the one provider process that is about to start. */
export function apiKeyEnv(provider: ApiKeyProvider): NodeJS.ProcessEnv {
  try {
    return source?.env(provider) ?? {};
  } catch {
    return {};
  }
}

/** Replaces every saved key in `text` with "[redacted]". */
export function redactApiKeys(text: string): string {
  if (!source) return text;
  let clean = text;
  try {
    for (const value of source.values()) if (value) clean = clean.split(value).join("[redacted]");
  } catch {
    // A text is never blocked because a key cannot be read.
  }
  return clean;
}
