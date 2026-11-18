import type { ProviderCatalogItem, ProviderSupportLevel } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { Badge, type BadgeTone, Button, Input, Switch } from "./ui";

function supportView(level: ProviderSupportLevel): { label: string; tone: BadgeTone } {
  switch (level) {
    case "built-in":
      return { label: t("Built in"), tone: "success" };
    case "acp-preset":
      return { label: t("Starts from a preset"), tone: "accent" };
    case "needs-runtime":
      return { label: t("Not available yet"), tone: "neutral" };
    default:
      return { label: t("Your own command"), tone: "neutral" };
  }
}

function signInLabel(kind: ProviderCatalogItem["signIn"]): string {
  switch (kind) {
    case "account":
      return t("Sign in with an account");
    case "account-or-key":
      return t("Account or key");
    case "key":
      return t("API key");
    case "host":
      return t("Signs in in its own program");
    default:
      return t("You give the command");
  }
}

function untilLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

/** Codex and Claude use the accounts of this page as their pool; the others may have several API keys. */
function takesPool(item: ProviderCatalogItem): boolean {
  return item.key !== null && item.id !== "codex" && item.id !== "claude";
}

/**
 * The provider catalog (window.openbot.providerCatalog): the 18 providers in picker order with their support level, how they
 * sign in, whether their program was found, and for the ones that take keys a small pool (mask only, on/off, "limited until",
 * remove, add). A key is write-only: it never comes back from the engine.
 */
export function ProviderCatalogPanel() {
  const api = untrack(() => window.openbot?.providerCatalog);
  const [items, setItems] = createSignal<ProviderCatalogItem[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal<string | null>(null);
  const [keys, setKeys] = createSignal<Record<string, string>>({});
  const [labels, setLabels] = createSignal<Record<string, string>>({});

  const replace = (item: ProviderCatalogItem) =>
    setItems((list) => list.map((value) => (value.id === item.id ? item : value)));

  async function load() {
    if (!api) return;
    try {
      setItems(await api.list());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not load the providers."));
    } finally {
      setLoaded(true);
    }
  }

  onSettled(() => {
    void load();
    const off = window.openbot?.agent?.onEvent((event) => {
      if (event.type === "provider-catalog-changed") setItems(event.items);
    });
    return () => off?.();
  });

  async function run(item: ProviderCatalogItem, work: () => Promise<ProviderCatalogItem | undefined>, failure: string) {
    if (busy()) return;
    setBusy(item.id);
    setError("");
    try {
      const next = await work();
      if (next) replace(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : failure);
    } finally {
      setBusy(null);
    }
  }

  function addKey(item: ProviderCatalogItem) {
    const key = keys()[item.id]?.trim();
    if (!key) return;
    const label = labels()[item.id]?.trim();
    void run(
      item,
      async () => {
        const next = await api?.addKey({ providerId: item.id, key, ...(label ? { label } : {}) });
        setKeys({ ...keys(), [item.id]: "" });
        setLabels({ ...labels(), [item.id]: "" });
        return next;
      },
      t("Could not save the key."),
    );
  }

  return (
    <section class="provider-catalog" aria-label={t("Provider catalog")}>
      <h2>{t("Provider catalog")}</h2>
      <p class="provider-catalog-note">
        {t("Every provider the program knows, how it signs in, and the keys you gave it. Keys are never shown again.")}
      </p>
      <Show
        when={api}
        fallback={<p class="provider-catalog-note">{t("The catalog is not available in this version.")}</p>}
      >
        <Show when={error()}>
          <p class="provider-catalog-error" role="alert">
            {error()}
            <Button type="button" variant="ghost" onClick={() => void load()}>
              {t("Retry")}
            </Button>
          </p>
        </Show>
        <Show
          when={loaded()}
          fallback={<CosgralLoadingSkeleton label={t("Loading providers…")} />}
        >
          <ul class="provider-catalog-grid">
            <For each={items()}>
              {(item) => (
                <li class="provider-catalog-card" data-support={item.support}>
                  <header>
                    <strong>{item.name}</strong>
                    <Badge tone={supportView(item.support).tone} dot>
                      {supportView(item.support).label}
                    </Badge>
                  </header>
                  <p class="provider-catalog-note">{item.description}</p>
                  <p class="provider-catalog-meta">
                    {signInLabel(item.signIn)} · {item.cliName}
                    <Show when={item.state.commandDetected}> · {t("program found")}</Show>
                    <Show when={item.state.added}> · {t("added as an agent")}</Show>
                  </p>
                  <Show when={item.support === "needs-runtime"}>
                    <p class="provider-catalog-meta">{t("It needs a runtime this program does not have yet.")}</p>
                  </Show>

                  <Show when={takesPool(item)}>
                    <ul class="provider-key-list" aria-label={`${item.name}: ${t("Keys")}`}>
                      <For each={item.state.keys}>
                        {(slot) => (
                          <li data-enabled={slot.enabled ? "true" : "false"}>
                            <span class="provider-key-name">
                              {slot.label} <code>{slot.mask}</code>
                            </span>
                            <Show when={slot.limitedUntil}>
                              {(until) => (
                                <small class="provider-key-limit">
                                  {t("Limited until {time}", { time: untilLabel(until()) })}
                                </small>
                              )}
                            </Show>
                            <Switch
                              size="sm"
                              label={t("Use")}
                              aria-label={`${slot.label}: ${t("Use")}`}
                              checked={slot.enabled}
                              disabled={busy() !== null}
                              onChange={(enabled) =>
                                void run(
                                  item,
                                  async () => api?.setKeyEnabled({ providerId: item.id, keyId: slot.id, enabled }),
                                  t("Could not change the key."),
                                )
                              }
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={busy() !== null}
                              onClick={() =>
                                void run(
                                  item,
                                  async () => api?.removeKey({ providerId: item.id, keyId: slot.id }),
                                  t("Could not remove the key."),
                                )
                              }
                            >
                              {t("Remove")}
                            </Button>
                          </li>
                        )}
                      </For>
                    </ul>
                    <form
                      class="provider-key-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        addKey(item);
                      }}
                    >
                      <Input
                        aria-label={`${item.name}: ${t("Key name")}`}
                        placeholder={t("Key name (optional)")}
                        value={labels()[item.id] ?? ""}
                        onInput={(event) => setLabels({ ...labels(), [item.id]: event.currentTarget.value })}
                      />
                      <Input
                        type="password"
                        autocomplete="off"
                        aria-label={`${item.name}: ${t("API key")}`}
                        placeholder={t("API key")}
                        value={keys()[item.id] ?? ""}
                        onInput={(event) => setKeys({ ...keys(), [item.id]: event.currentTarget.value })}
                      />
                      <Button type="submit" disabled={busy() !== null || !(keys()[item.id] ?? "").trim()}>
                        {t("Add key")}
                      </Button>
                    </form>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </section>
  );
}
