import {
  checkEndpointUrl,
  ENDPOINT_CLOUD_PRESETS,
  ENDPOINT_LIMITS,
  ENDPOINT_PRESETS,
  type EndpointKind,
  type EndpointsDesktopApi,
  endpointModelId,
  type ModelEndpoint,
} from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { t } from "../i18n";
import { Badge, Button, Card, Field, Heading, Input, NativeSelect, Switch, Text } from "./ui";
import { Server } from "./ui/icons";

function kindLabel(kind: EndpointKind): string {
  if (kind === "ollama") return t("Ollama");
  if (kind === "lmstudio") return t("LM Studio");
  return t("OpenAI-compatible");
}

function stateView(state: ModelEndpoint["state"] | "checking") {
  if (state === "checking") return { tone: "accent" as const, label: t("Checking…") };
  if (state === "ok") return { tone: "success" as const, label: t("Reachable") };
  if (state === "rejected") return { tone: "danger" as const, label: t("Key refused") };
  if (state === "unreachable") return { tone: "danger" as const, label: t("Unreachable") };
  return { tone: "neutral" as const, label: t("Not checked") };
}

interface Draft {
  id: string | null;
  label: string;
  kind: EndpointKind;
  baseUrl: string;
  key: string;
  clearKey: boolean;
}

const EMPTY: Draft = { id: null, label: "", kind: "openai-compatible", baseUrl: "", key: "", clearKey: false };
const SHOWN_MODELS = 6;

function errorText(error: unknown, fallback: string): string {
  // The program's own messages never contain a key; the IPC prefix is not for the person.
  const message = error instanceof Error ? error.message : fallback;
  return message.replace(/^Error invoking remote method '[^']*': (Error: )?/, "") || fallback;
}

/** Own model endpoints: OpenAI-compatible servers, Ollama and LM Studio (W5-K2). Nothing is contacted until you ask. */
export function EndpointsSection(props: { api?: EndpointsDesktopApi } = {}) {
  const api = props.api ?? window.openbot.endpoints;
  const [endpoints, setEndpoints] = createSignal<ModelEndpoint[]>([]);
  const [draft, setDraft] = createSignal<Draft | null>(null);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [checking, setChecking] = createSignal<Set<string>>(new Set());
  const [removing, setRemoving] = createSignal<string | null>(null);

  onSettled(() => {
    if (!api) return;
    void api
      .list()
      .then(setEndpoints)
      .catch((e: unknown) => setError(errorText(e, t("Could not load the endpoints."))));
    const off = window.openbot?.agent?.onEvent((event) => {
      if (event.type === "endpoints-changed") setEndpoints(event.endpoints);
    });
    return () => off?.();
  });

  const urlCheck = () => {
    const current = draft();
    return current?.baseUrl.trim() ? checkEndpointUrl(current.baseUrl) : null;
  };
  const atLimit = () => !draft()?.id && endpoints().length >= ENDPOINT_LIMITS.endpoints;
  const patch = (next: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...next } : current));
  const replace = (next: ModelEndpoint) =>
    setEndpoints((list) =>
      list.some((item) => item.id === next.id)
        ? list.map((item) => (item.id === next.id ? next : item))
        : [...list, next],
    );

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const current = draft();
    if (!api || !current) return;
    setBusy(true);
    setError("");
    try {
      const saved = await api.save({
        ...(current.id ? { id: current.id } : {}),
        label: current.label,
        kind: current.kind,
        baseUrl: current.baseUrl,
        ...(current.key ? { key: current.key } : {}),
        ...(current.clearKey ? { clearKey: true } : {}),
      });
      replace(saved);
      setNotice(saved.message && saved.state === "unchecked" ? saved.message : "");
      // The key is not shown again: the field is emptied with the form.
      setDraft(null);
    } catch (e) {
      setError(errorText(e, t("Could not save the endpoint.")));
    } finally {
      setBusy(false);
    }
  }

  async function check(id: string) {
    if (!api) return;
    setChecking((set) => new Set(set).add(id));
    setError("");
    try {
      replace(await api.check({ id }));
    } catch (e) {
      setError(errorText(e, t("Could not check the endpoint.")));
    } finally {
      setChecking((set) => {
        const next = new Set(set);
        next.delete(id);
        return next;
      });
    }
  }

  async function remove(id: string) {
    if (!api) return;
    try {
      await api.remove({ id });
      setEndpoints((list) => list.filter((item) => item.id !== id));
      setError("");
    } catch (e) {
      setError(errorText(e, t("Could not remove the endpoint.")));
    } finally {
      setRemoving(null);
    }
  }

  async function detect() {
    if (!api) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const found = await api.detectLocal();
      setEndpoints(await api.list());
      setNotice(
        found.length === 0
          ? t("Nothing found on this computer (Ollama on port 11434, LM Studio on port 1234).")
          : t("Found: {list}.", { list: found.map((item) => item.label).join(", ") }),
      );
    } catch (e) {
      setError(errorText(e, t("Could not look for local servers.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Show when={api}>
      <Card class="providers-section" role="region" aria-label={t("Own model endpoints")}>
        <Heading as="h2" size="md">
          {t("Own model endpoints")}
        </Heading>
        <Text as="p" tone="secondary">
          {t(
            "Connect a server you run yourself (Ollama, LM Studio) or any OpenAI-compatible server. Its models appear in the model choice of every agent. Agents talk to them in chat only: no program tools.",
          )}
        </Text>
        <Show when={error()}>
          <Text as="p" tone="danger" role="alert">
            {error()}
          </Text>
        </Show>
        <Show when={notice()}>
          <Text as="p" tone="secondary" role="status">
            {notice()}
          </Text>
        </Show>
        <Show
          when={endpoints().length}
          fallback={
            <Text as="p" tone="muted">
              {t("No endpoint is added.")}
            </Text>
          }
        >
          <ul class="providers-list" aria-label={t("Endpoints")}>
            <For each={endpoints()}>
              {(item) => {
                const state = () => stateView(checking().has(item.id) ? "checking" : item.state);
                const more =
                  item.models.length > SHOWN_MODELS
                    ? t(" and {count} more", { count: item.models.length - SHOWN_MODELS })
                    : "";
                return (
                  <li class="providers-row endpoint-row" data-state={item.state}>
                    <span class="provider-key-icon" aria-hidden="true">
                      <Server size={18} stroke-width={1.75} />
                    </span>
                    <div class="endpoint-row-copy">
                      <Text as="strong">{item.label}</Text> <Badge size="sm">{kindLabel(item.kind)}</Badge>{" "}
                      <Badge size="sm" tone={state().tone}>
                        {state().label}
                      </Badge>
                      <Text as="p" tone="muted">
                        <code>{item.baseUrl}</code>
                        <Show when={item.hasKey}> · {t("Key {masked}", { masked: item.maskedKey ?? "" })}</Show>
                      </Text>
                      <Show when={item.warning}>
                        <Text as="p" tone="warning" role="note">
                          {item.warning}
                        </Text>
                      </Show>
                      <Show when={item.message}>
                        <Text as="p" tone={item.state === "ok" ? "secondary" : "danger"}>
                          {item.message}
                        </Text>
                      </Show>
                      <Show when={item.models.length}>
                        <Text as="p" tone="muted">
                          {t("Models: {list}{more}.", {
                            list: item.models.slice(0, SHOWN_MODELS).join(", "),
                            more,
                          })}{" "}
                          {t("Agent model id:")} <code>{endpointModelId(item.id, item.models[0] ?? "model")}</code>
                        </Text>
                      </Show>
                    </div>
                    <Show
                      when={removing() === item.id}
                      fallback={
                        <div class="providers-actions">
                          <Button
                            type="button"
                            size="sm"
                            disabled={checking().has(item.id)}
                            aria-label={t("Check connection to {label}", { label: item.label })}
                            onClick={() => void check(item.id)}
                          >
                            {t("Check connection")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            aria-label={t("Edit {label}", { label: item.label })}
                            onClick={() =>
                              setDraft({
                                id: item.id,
                                label: item.label,
                                kind: item.kind,
                                baseUrl: item.baseUrl,
                                key: "",
                                clearKey: false,
                              })
                            }
                          >
                            {t("Edit")}
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            aria-label={t("Remove {label}", { label: item.label })}
                            onClick={() => setRemoving(item.id)}
                          >
                            {t("Remove")}
                          </Button>
                        </div>
                      }
                    >
                      <fieldset
                        class="providers-confirm"
                        aria-label={t("Confirm removing {label}", { label: item.label })}
                      >
                        <Text tone="danger">
                          {t(
                            "Its models disappear from the choice, its key is deleted, and agents set to one of its models get an error until you pick another model. Remove {label}?",
                            { label: item.label },
                          )}
                        </Text>
                        <Button type="button" variant="danger" size="sm" onClick={() => void remove(item.id)}>
                          {t("Yes, remove")}
                        </Button>
                        <Button type="button" size="sm" onClick={() => setRemoving(null)}>
                          {t("Keep")}
                        </Button>
                      </fieldset>
                    </Show>
                  </li>
                );
              }}
            </For>
          </ul>
        </Show>
        <div class="providers-actions">
          <Button type="button" disabled={busy()} onClick={() => void detect()}>
            {t("Detect local servers")}
          </Button>
          <Show when={!draft()}>
            <Button type="button" variant="primary" disabled={atLimit()} onClick={() => setDraft({ ...EMPTY })}>
              {t("Add an endpoint")}
            </Button>
          </Show>
        </div>
        <Show when={draft()}>
          {(current) => (
            <form class="providers-form" aria-label={t("Endpoint")} onSubmit={(event) => void save(event)}>
              <Heading as="h3" size="sm" tone="secondary">
                {current().id ? t("Edit the endpoint") : t("Add an endpoint")}
              </Heading>
              <Show when={!current().id}>
                <fieldset class="providers-actions" aria-label={t("Ready settings")}>
                  <For each={ENDPOINT_PRESETS}>
                    {(preset) => (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => patch({ label: preset.label, kind: preset.kind, baseUrl: preset.baseUrl })}
                      >
                        {t("Use {label}", { label: preset.label })}
                      </Button>
                    )}
                  </For>
                </fieldset>
                <fieldset class="providers-actions" aria-label={t("Hosted services")}>
                  <For each={ENDPOINT_CLOUD_PRESETS}>
                    {(preset) => (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => patch({ label: preset.label, kind: preset.kind, baseUrl: preset.baseUrl })}
                      >
                        {t("Use {label}", { label: preset.label })}
                      </Button>
                    )}
                  </For>
                </fieldset>
                <Text as="p" tone="muted">
                  {t("Hosted services need an API key.")}
                </Text>
              </Show>
              <Field label={t("Name")} required>
                <Input
                  value={current().label}
                  maxlength={ENDPOINT_LIMITS.label}
                  onInput={(e) => patch({ label: e.currentTarget.value })}
                />
              </Field>
              <Field label={t("Kind")}>
                <NativeSelect
                  value={current().kind}
                  onChange={(e) => {
                    const kind = KIND_OPTIONS.find((option) => option === e.currentTarget.value);
                    if (kind) patch({ kind });
                  }}
                >
                  <For each={KIND_OPTIONS}>{(kind) => <option value={kind}>{kindLabel(kind)}</option>}</For>
                </NativeSelect>
              </Field>
              <Field
                label={t("Address")}
                required
                description={t(
                  "Including the version, for example http://127.0.0.1:11434/v1. Only http:// and https://.",
                )}
                error={(() => {
                  const result = urlCheck();
                  return result && !result.ok ? result.reason : undefined;
                })()}
              >
                <Input
                  value={current().baseUrl}
                  autocomplete="off"
                  inputmode="url"
                  onInput={(e) => patch({ baseUrl: e.currentTarget.value })}
                />
              </Field>
              <Show
                when={(() => {
                  const result = urlCheck();
                  return result?.ok ? result.warning : null;
                })()}
              >
                {(warning) => (
                  <Text as="p" tone="warning" role="note">
                    {warning()}
                  </Text>
                )}
              </Show>
              <Field
                label={t("Key (optional)")}
                description={
                  current().id
                    ? t("Leave empty to keep the saved key. A key is for one host: it is removed if the host changes.")
                    : t("Only if the server asks for one. It is stored encrypted and sent only to this address.")
                }
              >
                <Input
                  type="password"
                  autocomplete="off"
                  value={current().key}
                  maxlength={ENDPOINT_LIMITS.key.max}
                  onInput={(e) => patch({ key: e.currentTarget.value })}
                />
              </Field>
              <Show when={current().id && endpoints().find((item) => item.id === current().id)?.hasKey}>
                <Switch
                  checked={current().clearKey}
                  onChange={(checked) => patch({ clearKey: checked })}
                  label={t("Remove the saved key")}
                />
              </Show>
              <div class="providers-actions">
                <Button type="submit" variant="primary" loading={busy()} loadingLabel={t("Saving…")}>
                  {t("Save")}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    setError("");
                  }}
                >
                  {t("Cancel")}
                </Button>
              </div>
              <Text as="p" tone="muted">
                {t("Saving does not contact the server. Use “Check connection” to fetch its models.")}
              </Text>
            </form>
          )}
        </Show>
      </Card>
    </Show>
  );
}

const KIND_OPTIONS: readonly EndpointKind[] = ["openai-compatible", "ollama", "lmstudio"];
