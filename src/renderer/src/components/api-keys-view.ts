import { API_KEY_PROVIDERS, type ApiKeyEntry, type ApiKeyProvider, type ApiKeyStatus } from "@openbot/contracts/ipc";
import { t } from "../i18n";
export function providerLabel(provider: ApiKeyProvider) {
  return provider === "codex" ? "OpenAI" : "Anthropic";
}
export function statusLabel(status: ApiKeyStatus) {
  if (status === "ok") return t("OK");
  if (status === "rejected") return t("Rejected");
  return t("Unchecked");
}

export function statusTone(status: ApiKeyStatus): "success" | "danger" | "warning" {
  if (status === "ok") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

export function emptyApiKeys(): ApiKeyEntry[] {
  return API_KEY_PROVIDERS.map((provider) => ({
    provider,
    maskedKey: null,
    status: "unchecked",
    message: null,
    checkedAt: null,
    updatedAt: null,
  }));
}
