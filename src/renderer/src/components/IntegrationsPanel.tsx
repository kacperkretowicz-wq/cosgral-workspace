import {
  INTEGRATION_INFO,
  INTEGRATION_LIMITS,
  INTEGRATION_SERVICES,
  type IntegrationDescription,
  type IntegrationPhase,
  type IntegrationService,
  type IntegrationStatus,
  integrationCallbackExample,
} from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { Badge, type BadgeTone, Button, Input, Switch } from "./ui";

const PHASE_VIEW: Record<IntegrationPhase, { label: string; tone: BadgeTone }> = {
  "not-configured": { label: "App not set up", tone: "neutral" },
  disconnected: { label: "Not connected", tone: "neutral" },
  "waiting-for-browser": { label: "Waiting for the browser", tone: "accent" },
  connected: { label: "Connected", tone: "success" },
  failed: { label: "Sign-in failed", tone: "danger" },
  "needs-login": { label: "Sign in again", tone: "warning" },
};

interface Draft {
  clientId: string;
  clientSecret: string;
  redirectPort: string;
}

const EMPTY_DRAFT: Draft = { clientId: "", clientSecret: "", redirectPort: "" };

/**
 * Account integrations (window.openbot.integrations): GitHub, Google Workspace, Notion and Meta, each its own MCP server. The owner
 * registers the app with the service and enters its client id here (the secret is write-only and never comes back); "Connect" opens
 * the system browser and the end comes as an event. No token, code or secret is ever shown.
 */
export function IntegrationsPanel() {
  const api = untrack(() => window.openbot?.integrations);
  const [statuses, setStatuses] = createSignal<IntegrationStatus[]>([]);
  const [described, setDescribed] = createSignal<Partial<Record<IntegrationService, IntegrationDescription>>>({});
  const [drafts, setDrafts] = createSignal<Partial<Record<IntegrationService, Draft>>>({});
  const [forget, setForget] = createSignal<Partial<Record<IntegrationService, boolean>>>({});
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal<IntegrationService | null>(null);

  // An event is newer than any read that started before it, so such a read is dropped.
  let serial = 0;
  async function load() {
    if (!api) return;
    const mine = ++serial;
    try {
      const [list, ...details] = await Promise.all([
        api.list(),
        ...INTEGRATION_SERVICES.map((service) => api.describe({ service })),
      ]);
      if (mine !== serial) return;
      setStatuses(list.services);
      setDescribed(Object.fromEntries(details.map((detail) => [detail.service, detail])));
      setError("");
    } catch (cause) {
      if (mine === serial) setError(cause instanceof Error ? cause.message : t("Could not load the integrations."));
    } finally {
      setLoaded(true);
    }
  }

  onSettled(() => {
    void load();
    const off = window.openbot?.agent?.onEvent((event) => {
      if (event.type === "integrations-changed") {
        serial += 1;
        setStatuses(event.services);
      }
    });
    return () => off?.();
  });

  const draftOf = (service: IntegrationService): Draft => drafts()[service] ?? EMPTY_DRAFT;
  const patchDraft = (service: IntegrationService, patch: Partial<Draft>) =>
    setDrafts({ ...drafts(), [service]: { ...draftOf(service), ...patch } });

  async function act(service: IntegrationService, work: () => Promise<unknown>, failure: string) {
    if (busy()) return;
    setBusy(service);
    setError("");
    try {
      await work();
      // The answer of the call can be older than an event that arrived meanwhile, so read the list again.
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : failure);
    } finally {
      setBusy(null);
    }
  }

  function saveApp(service: IntegrationService) {
    const draft = draftOf(service);
    const port = draft.redirectPort.trim();
    const clientId = draft.clientId.trim();
    void act(
      service,
      async () => {
        await api?.configure({
          service,
          ...(clientId ? { clientId } : {}),
          ...(draft.clientSecret ? { clientSecret: draft.clientSecret } : {}),
          ...(port ? { redirectPort: Number(port) } : {}),
        });
        // The secret leaves the page as soon as it is sent.
        patchDraft(service, { clientId: "", clientSecret: "" });
      },
      t("Could not save the app."),
    );
  }

  const canSave = (service: IntegrationService) => {
    const draft = draftOf(service);
    return draft.clientId.trim() !== "" || draft.clientSecret !== "" || draft.redirectPort.trim() !== "";
  };

  return (
    <Show when={api}>
      <section class="vault-connectors integrations" aria-label={t("Connect accounts")}>
        <h2>{t("Connect accounts")}</h2>
        <p class="vault-connectors-note">
          {t(
            "Let agents use GitHub, Google Workspace, Notion or Meta with your account. The program opens your browser and keeps the sign-in encrypted on this computer; agents never see it.",
          )}
        </p>
        <Show when={error()}>
          <p class="vault-connectors-error" role="alert">
            {error()}
            <Button type="button" variant="ghost" onClick={() => void load()}>
              {t("Retry")}
            </Button>
          </p>
        </Show>
        <Show when={loaded()} fallback={<CosgralLoadingSkeleton label={t("Loading…")} />}>
          <ul class="vault-connector-list">
            <For each={statuses()}>
              {(status) => {
                const info = INTEGRATION_INFO[status.service];
                const detail = () => described()[status.service];
                const callback = () =>
                  detail()?.callbackExample ?? integrationCallbackExample(detail()?.redirectPort ?? null);
                return (
                  <li class="vault-connector-card" data-state={status.phase}>
                    <header>
                      <strong>{status.label}</strong>
                      <Badge tone={PHASE_VIEW[status.phase].tone} dot>
                        {t(PHASE_VIEW[status.phase].label)}
                      </Badge>
                    </header>

                    <Show when={status.phase === "waiting-for-browser"}>
                      <p class="vault-connectors-note" role="status">
                        {t("Finish the sign-in in the browser. The program waits {minutes} minutes.", {
                          minutes: Math.round(INTEGRATION_LIMITS.waitSeconds / 60),
                        })}
                      </p>
                      <Show when={status.signInUrl}>
                        {(url) => (
                          <p class="vault-connectors-note">
                            {t("The browser did not open? Open this address:")} <code>{url()}</code>
                          </p>
                        )}
                      </Show>
                    </Show>
                    <Show when={status.phase === "connected"}>
                      <p class="vault-connectors-note">
                        {t("Agents can use it as the MCP server “{name}”. Switch it on per agent.", {
                          name: status.mcpServerName ?? "",
                        })}
                      </p>
                    </Show>
                    <Show when={status.reason && status.phase !== "waiting-for-browser"}>
                      <p
                        class={status.phase === "failed" ? "vault-connectors-error" : "vault-connectors-note"}
                        role={status.phase === "failed" ? "alert" : undefined}
                      >
                        {t(status.reason ?? "")}
                      </p>
                    </Show>

                    <details class="messenger-steps">
                      <summary>{t("Set up the app")}</summary>
                      <ol>
                        <For each={info.ownerSteps}>{(step) => <li>{t(step)}</li>}</For>
                      </ol>
                      <p>
                        {t("Callback address")}: <code>{callback()}</code>
                      </p>
                    </details>

                    <div class="messenger-form">
                      <label class="messenger-field">
                        <span>{t("Client id")}</span>
                        <Input
                          autocomplete="off"
                          aria-label={`${t("Client id")} (${status.label})`}
                          placeholder={detail()?.clientIdSet ? t("Saved") : ""}
                          value={draftOf(status.service).clientId}
                          onInput={(event) => patchDraft(status.service, { clientId: event.currentTarget.value })}
                        />
                      </label>
                      <Show when={info.needsClientSecret}>
                        <label class="messenger-field">
                          <span>{t("Client secret")}</span>
                          <Input
                            type="password"
                            autocomplete="off"
                            aria-label={`${t("Client secret")} (${status.label})`}
                            placeholder={detail()?.clientSecretSet ? t("Saved") : ""}
                            value={draftOf(status.service).clientSecret}
                            onInput={(event) => patchDraft(status.service, { clientSecret: event.currentTarget.value })}
                          />
                          <small>{t("It is kept encrypted and never shown again.")}</small>
                        </label>
                      </Show>
                      <label class="messenger-field">
                        <span>{t("Callback port (optional)")}</span>
                        <Input
                          type="number"
                          min={INTEGRATION_LIMITS.minPort}
                          max="65535"
                          aria-label={`${t("Callback port (optional)")} (${status.label})`}
                          placeholder={detail()?.redirectPort ? String(detail()?.redirectPort) : ""}
                          value={draftOf(status.service).redirectPort}
                          onInput={(event) => patchDraft(status.service, { redirectPort: event.currentTarget.value })}
                        />
                      </label>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy() !== null || !canSave(status.service)}
                        onClick={() => saveApp(status.service)}
                      >
                        {t("Save the app")}
                      </Button>
                    </div>

                    <div class="vault-connector-actions">
                      <Show
                        when={status.phase === "waiting-for-browser"}
                        fallback={
                          <Button
                            type="button"
                            disabled={busy() !== null || status.phase === "not-configured"}
                            onClick={() =>
                              void act(
                                status.service,
                                async () => api?.connect({ service: status.service }),
                                t("Could not start the sign-in."),
                              )
                            }
                          >
                            {status.phase === "connected"
                              ? t("Sign in again")
                              : status.phase === "failed" || status.phase === "needs-login"
                                ? t("Try again")
                                : t("Connect account")}
                          </Button>
                        }
                      >
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy() !== null}
                          onClick={() =>
                            void act(
                              status.service,
                              async () => api?.cancel({ service: status.service }),
                              t("Could not cancel the sign-in."),
                            )
                          }
                        >
                          {t("Cancel")}
                        </Button>
                      </Show>
                      <Show when={status.phase === "connected" || status.phase === "needs-login"}>
                        <Switch
                          checked={forget()[status.service] ?? false}
                          onChange={(checked) => setForget({ ...forget(), [status.service]: checked })}
                          label={t("Also forget the app's client id")}
                        />
                        <Button
                          type="button"
                          variant="danger"
                          disabled={busy() !== null}
                          onClick={() =>
                            void act(
                              status.service,
                              async () =>
                                api?.disconnect({
                                  service: status.service,
                                  forgetClient: forget()[status.service] ?? false,
                                }),
                              t("Could not disconnect."),
                            )
                          }
                        >
                          {t("Disconnect")}
                        </Button>
                      </Show>
                    </div>
                  </li>
                );
              }}
            </For>
          </ul>
        </Show>
      </section>
    </Show>
  );
}
