/**
 * W5-UI3 view model for provider API keys (mock until W5-BE3 lands).
 * Lead brief: provider, maskedKey (last 4), status ok|rejected|unchecked, set/remove/check.
 * Spec draft still ties keys to accountId — that shape is not used here; see report.
 */

export type ApiKeyProvider = "openai" | "anthropic";

export type ApiKeyStatus = "ok" | "rejected" | "unchecked";

export interface ApiKeyRecord {
  provider: ApiKeyProvider;
  /** Last four characters only; never the full secret. Null when no key is stored. */
  maskedKey: string | null;
  status: ApiKeyStatus;
}

export const API_KEY_PROVIDERS: readonly ApiKeyProvider[] = ["openai", "anthropic"];

export function providerLabel(provider: ApiKeyProvider): string {
  return provider === "openai" ? "OpenAI" : "Anthropic";
}

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length < 4) return "····";
  return `····${trimmed.slice(-4)}`;
}

export function statusLabel(status: ApiKeyStatus): string {
  if (status === "ok") return "OK";
  if (status === "rejected") return "Rejected";
  return "Unchecked";
}

export function statusTone(status: ApiKeyStatus): "success" | "danger" | "warning" {
  if (status === "ok") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

export function emptyApiKeys(): ApiKeyRecord[] {
  return API_KEY_PROVIDERS.map((provider) => ({
    provider,
    maskedKey: null,
    status: "unchecked",
  }));
}
