// COSGRAL W5-K2: own model endpoints for Storybook and the preview. Demo data only: nothing is contacted or saved.
// Rules for the demo: an address with "unreachable" in it cannot be reached; a key that starts with "bad" is rejected;
// the Ollama preset address answers with two models.

import {
  checkEndpointUrl,
  type EndpointsDesktopApi,
  type ModelEndpoint,
  type SaveEndpointInput,
} from "@openbot/contracts/ipc";

const DEMO_MODELS = ["llama3:8b", "qwen2.5-coder:7b"];

export function createMockEndpointsApi(delayMs = 150): EndpointsDesktopApi {
  const endpoints = new Map<string, ModelEndpoint>();
  // The demo keeps a flag per key, not the key itself.
  const badKeys = new Set<string>();
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  const get = (id: string): ModelEndpoint => {
    const found = endpoints.get(id);
    if (!found) throw new Error("This endpoint no longer exists.");
    return found;
  };
  const mask = (key: string) => (key.length >= 12 ? `••••${key.slice(-4)}` : "••••");
  return {
    list: async () => {
      await wait();
      return [...endpoints.values()].map((item) => ({ ...item }));
    },
    save: async (input: SaveEndpointInput) => {
      await wait();
      const url = checkEndpointUrl(input.baseUrl);
      if (!url.ok) throw new Error(url.reason);
      const existing = input.id ? get(input.id) : null;
      const id =
        existing?.id ??
        `${
          input.label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "endpoint"
        }-demo`;
      const moved = existing && new URL(existing.baseUrl).origin !== new URL(url.baseUrl).origin;
      let maskedKey = existing?.maskedKey ?? null;
      if (input.key) {
        maskedKey = mask(input.key);
        if (input.key.startsWith("bad")) badKeys.add(id);
        else badKeys.delete(id);
      } else if (input.clearKey || moved) {
        maskedKey = null;
        badKeys.delete(id);
      }
      const changed = !existing || existing.baseUrl !== url.baseUrl;
      const next: ModelEndpoint = {
        id,
        label: input.label,
        kind: input.kind,
        baseUrl: url.baseUrl,
        hasKey: maskedKey !== null,
        maskedKey,
        models: changed ? [] : (existing?.models ?? []),
        state: changed ? "unchecked" : (existing?.state ?? "unchecked"),
        message:
          moved && existing?.maskedKey
            ? "The address now points to another host, so the saved key was removed."
            : changed
              ? null
              : (existing?.message ?? null),
        checkedAt: changed ? null : (existing?.checkedAt ?? null),
        warning: url.warning,
        chatOnly: true,
      };
      endpoints.set(id, next);
      return { ...next };
    },
    remove: async ({ id }) => {
      await wait();
      endpoints.delete(id);
      badKeys.delete(id);
    },
    check: async ({ id }) => {
      await wait();
      const current = get(id);
      let next: ModelEndpoint;
      if (current.baseUrl.includes("unreachable")) {
        next = {
          ...current,
          state: "unreachable",
          models: [],
          message: "Could not reach the server. Check the address and that it is running.",
        };
      } else if (badKeys.has(id)) {
        next = {
          ...current,
          state: "rejected",
          models: [],
          message: "The server did not accept the key. Check it or enter a new one.",
        };
      } else {
        next = { ...current, state: "ok", models: DEMO_MODELS, message: `${DEMO_MODELS.length} models found.` };
      }
      next.checkedAt = new Date().toISOString();
      endpoints.set(id, next);
      return { ...next };
    },
    detectLocal: async () => {
      await wait();
      const found = endpoints.get("ollama") ?? {
        id: "ollama",
        label: "Ollama",
        kind: "ollama" as const,
        baseUrl: "http://127.0.0.1:11434/v1",
        hasKey: false,
        maskedKey: null,
        models: DEMO_MODELS,
        state: "ok" as const,
        message: `${DEMO_MODELS.length} models found.`,
        checkedAt: new Date().toISOString(),
        warning: null,
        chatOnly: true,
      };
      endpoints.set("ollama", found);
      return [{ ...found }];
    },
  };
}
