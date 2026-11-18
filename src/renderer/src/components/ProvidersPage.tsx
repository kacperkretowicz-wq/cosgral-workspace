import { AcpAgentLogin, AcpPresets } from "./AcpLogin";
import { type FallbackModelOption, FallbackOrder } from "./fallback-order";
import { providerError } from "./provider-error";

export type { FallbackModelOption } from "./fallback-order";
export { FallbackOrder, moveItem } from "./fallback-order";

import type {
  AcpAgentConfig,
  AgentModelId,
  AgentModelOption,
  BotSummary,
  FallbackModelsInfo,
  ModelEndpoint,
  ProviderUsage,
  SaveAcpAgentInput,
} from "@openbot/contracts/ipc";
import {
  acpModelId,
  endpointModelId,
  fallbackModelsProblem,
  GENERAL_FALLBACK_SCOPE,
  isAcpAgentId,
  PROVIDER_LIMITS,
} from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { t } from "../i18n";
import { ApiKeysSection } from "./ApiKeysSection";
import { EndpointsSection } from "./EndpointsSection";
import { ManagedCliSection } from "./ManagedCliSection";
import { ProviderAccounts } from "./ProviderAccounts";
import { ProviderCatalogPanel } from "./ProviderCatalogPanel";
import { FallbackChainView, ProviderFallbackLists } from "./ProviderFallbackLists";
import { Badge, Button, Card, Field, Heading, Input, NativeSelect, Text, Textarea } from "./ui";

// ---------------------------------------------------------------------------------------------------------------
// Pure helpers (tested without a window)

/** A new list with the item at `from` moved to `to`; the same list when either index is outside it. */
export interface AcpAgentDraft {
  id: string;
  name: string;
  command: string;
  /** One argument per line. */
  args: string;
}

export interface AcpAgentErrors {
  id?: string;
  name?: string;
  command?: string;
  args?: string;
}

export function acpArgsFromText(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Field errors for the add-agent form; an empty object means the form can be saved. */
export function validateAcpAgentDraft(draft: AcpAgentDraft, existingIds: readonly string[]): AcpAgentErrors {
  const errors: AcpAgentErrors = {};
  const id = draft.id.trim();
  if (!id) errors.id = t("Choose an id.");
  else if (!isAcpAgentId(id))
    errors.id = t("Start with a lowercase letter, then lowercase letters, digits and dashes (up to {limit}).", {
      limit: PROVIDER_LIMITS.acpId,
    });
  else if (existingIds.includes(id)) errors.id = t("An agent with this id already exists.");
  const name = draft.name.trim();
  if (!name) errors.name = t("Give the agent a name.");
  else if (name.length > PROVIDER_LIMITS.acpName)
    errors.name = t("Use at most {n} characters.", { n: PROVIDER_LIMITS.acpName });
  const command = draft.command.trim();
  if (!command) errors.command = t("Enter the program to run.");
  else if (command.length > PROVIDER_LIMITS.command)
    errors.command = t("Use at most {n} characters.", { n: PROVIDER_LIMITS.command });
  const args = acpArgsFromText(draft.args);
  if (args.length > PROVIDER_LIMITS.args) errors.args = t("Use at most {n} arguments.", { n: PROVIDER_LIMITS.args });
  else if (args.some((arg) => arg.length > PROVIDER_LIMITS.arg))
    errors.args = t("Each argument can have at most {n} characters.", { n: PROVIDER_LIMITS.arg });
  return errors;
}

export function providerLabel(usage: Pick<ProviderUsage, "provider" | "model">, acpAgents: readonly AcpAgentConfig[]) {
  if (usage.provider === "codex") return "Codex";
  if (usage.provider === "claude") return "Claude";
  const id = usage.model?.startsWith("acp:") ? usage.model.slice(4) : null;
  const agent = id ? acpAgents.find((item) => item.id === id) : undefined;
  return agent ? `${agent.name} (ACP)` : usage.model ? `${usage.model}` : t("ACP agent");
}

/** "14:30" today, otherwise with the date; empty for no time. `resetsAt` is Unix seconds. */
export function formatResetTime(resetsAt: number | null, nowMs: number): string {
  if (resetsAt === null) return "";
  const date = new Date(resetsAt * 1000);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === new Date(nowMs).toDateString() ? time : `${date.toLocaleDateString()} ${time}`;
}

const STATE_VIEW = {
  ok: { tone: "success", label: "Available" },
  limited: { tone: "warning", label: "Limit reached" },
  unavailable: { tone: "danger", label: "Unavailable" },
} as const;

// ---------------------------------------------------------------------------------------------------------------
// Views

export function ProviderUsageList(props: {
  usage: ProviderUsage[];
  acpAgents: AcpAgentConfig[];
  now: number;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <Card class="providers-section" role="region" aria-label={t("Provider usage")}>
      <div class="providers-heading">
        <Heading as="h2" size="md">
          {t("Usage and limits")}
        </Heading>
        <Show when={props.onRefresh}>
          <Button type="button" size="sm" loading={props.refreshing} onClick={() => props.onRefresh?.()}>
            {t("Refresh")}
          </Button>
        </Show>
      </div>
      <Show
        when={props.usage.length}
        fallback={
          <Text as="p" tone="muted">
            {t("No usage information yet.")}
          </Text>
        }
      >
        <ul class="providers-list">
          <For each={props.usage}>
            {(item) => {
              const view = () => STATE_VIEW[item.state];
              const reset = () => formatResetTime(item.resetsAt, props.now);
              return (
                <li class="providers-row">
                  <div>
                    <Text as="strong">{providerLabel(item, props.acpAgents)}</Text>
                    <Show when={item.reason}>
                      <Text as="p" tone="muted">
                        {item.reason}
                      </Text>
                    </Show>
                    <Show when={item.state !== "ok" && reset()}>
                      <Text as="p" tone="secondary">
                        {item.state === "limited" ? t("Resets at") : t("Back at")} {reset()}
                      </Text>
                    </Show>
                    <Show when={item.state !== "ok" && !reset()}>
                      <Text as="p" tone="muted">
                        {t("No reset time was given.")}
                      </Text>
                    </Show>
                  </div>
                  <div class="providers-state">
                    <Show when={item.usedPercent !== null}>
                      <Text tone="secondary">
                        {t("{percent}% used", { percent: Math.round(item.usedPercent ?? 0) })}
                      </Text>
                    </Show>
                    <Badge tone={view().tone} dot>
                      {t(view().label)}
                    </Badge>
                  </div>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>
    </Card>
  );
}

export function AcpAgentsSection(props: {
  agents: AcpAgentConfig[];
  onSave: (input: SaveAcpAgentInput) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const empty: AcpAgentDraft = { id: "", name: "", command: "", args: "" };
  const [draft, setDraft] = createSignal<AcpAgentDraft>(empty);
  const [submitted, setSubmitted] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [removing, setRemoving] = createSignal<string | null>(null);
  const [error, setError] = createSignal("");
  const errors = () =>
    validateAcpAgentDraft(
      draft(),
      props.agents.map((agent) => agent.id),
    );
  const shown = (field: keyof AcpAgentErrors) => (submitted() ? errors()[field] : undefined);
  const atLimit = () => props.agents.length >= PROVIDER_LIMITS.acpAgents;
  const set = (patch: Partial<AcpAgentDraft>) => setDraft((current) => ({ ...current, ...patch }));
  async function save(event: SubmitEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors()).length) return;
    const value = draft();
    setSaving(true);
    try {
      await props.onSave({
        id: value.id.trim(),
        name: value.name.trim(),
        command: value.command.trim(),
        args: acpArgsFromText(value.args),
      });
      setDraft(empty);
      setSubmitted(false);
      setError("");
    } catch (e) {
      setError(providerError(e, t("Could not add the agent.")));
    } finally {
      setSaving(false);
    }
  }
  async function remove(id: string) {
    try {
      await props.onRemove(id);
      setError("");
    } catch (e) {
      setError(providerError(e, t("Could not remove the agent.")));
    } finally {
      setRemoving(null);
    }
  }
  return (
    <Card class="providers-section" role="region" aria-label={t("ACP agents")}>
      <Heading as="h2" size="md">
        {t("ACP agents")}
      </Heading>
      <Text as="p" tone="secondary">
        {t(
          "Any program that speaks the Agent Client Protocol over stdio can be a provider. It appears as one model next to the others.",
        )}
      </Text>
      <Show when={error()}>
        <Text as="p" tone="danger" role="alert">
          {error()}
        </Text>
      </Show>
      <Show
        when={props.agents.length}
        fallback={
          <Text as="p" tone="muted">
            {t("No ACP agent is added.")}
          </Text>
        }
      >
        <ul class="providers-list">
          <For each={props.agents}>
            {(agent) => (
              <li class="providers-row">
                <div>
                  <Text as="strong">{agent.name}</Text> <Badge size="sm">{acpModelId(agent.id)}</Badge>
                  <Text as="p" tone="muted">
                    <code>{[agent.command, ...agent.args].join(" ")}</code>
                  </Text>
                  <AcpAgentLogin id={agent.id} name={agent.name} />
                </div>
                <Show
                  when={removing() === agent.id}
                  fallback={
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      aria-label={t("Remove {name}", { name: agent.name })}
                      onClick={() => setRemoving(agent.id)}
                    >
                      {t("Remove")}
                    </Button>
                  }
                >
                  <fieldset class="providers-confirm" aria-label={t("Confirm removing {name}", { name: agent.name })}>
                    <Text tone="danger">
                      {t("Agents set to {model} can no longer use it. Remove {name}?", {
                        model: acpModelId(agent.id),
                        name: agent.name,
                      })}
                    </Text>
                    <Button type="button" variant="danger" size="sm" onClick={() => void remove(agent.id)}>
                      {t("Yes, remove")}
                    </Button>
                    <Button type="button" size="sm" onClick={() => setRemoving(null)}>
                      {t("Keep")}
                    </Button>
                  </fieldset>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <form class="providers-form" aria-label={t("Add ACP agent")} onSubmit={(event) => void save(event)} novalidate>
        <Heading as="h3" size="sm" tone="secondary">
          {t("Add an ACP agent")}
        </Heading>
        <Field
          label={t("Id")}
          required
          description={t("Becomes part of its model id, for example acp:my-agent.")}
          error={shown("id")}
        >
          <Input value={draft().id} onInput={(e) => set({ id: e.currentTarget.value })} autocomplete="off" />
        </Field>
        <Field label={t("Name")} required error={shown("name")}>
          <Input value={draft().name} onInput={(e) => set({ name: e.currentTarget.value })} />
        </Field>
        <Field
          label={t("Command")}
          required
          description={t("The program to start, as you would type it.")}
          error={shown("command")}
        >
          <Input value={draft().command} onInput={(e) => set({ command: e.currentTarget.value })} autocomplete="off" />
        </Field>
        <Field label={t("Arguments")} description={t("One per line.")} error={shown("args")}>
          <Textarea value={draft().args} rows={3} onInput={(e) => set({ args: e.currentTarget.value })} />
        </Field>
        <Show when={atLimit()}>
          <Text as="p" tone="warning">
            {t("You can add up to {count} ACP agents.", { count: PROVIDER_LIMITS.acpAgents })}
          </Text>
        </Show>
        <Button type="submit" variant="primary" disabled={atLimit()} loading={saving()} loadingLabel={t("Adding...")}>
          {t("Add agent")}
        </Button>
      </form>
    </Card>
  );
}

/** One line per agent that now runs on a fallback model. */
export function FallbackInUse(props: { bots: BotSummary[]; options: FallbackModelOption[] }) {
  const nameOf = (id: AgentModelId) => props.options.find((option) => option.id === id)?.name ?? id;
  const active = () =>
    props.bots.flatMap((bot) =>
      bot.activeModel && bot.activeModel !== bot.model ? [{ bot, active: bot.activeModel }] : [],
    );
  return (
    <Show when={active().length}>
      <ul class="providers-list" aria-label={t("Agents using a fallback model")}>
        <For each={active()}>
          {(entry) => (
            <li class="providers-row">
              <Text>
                {t("{name} is using {active} instead of {own}.", {
                  name: entry.bot.name,
                  active: nameOf(entry.active),
                  own: nameOf(entry.bot.model),
                })}
              </Text>
              <Badge tone="warning" dot>
                {t("Fallback")}
              </Badge>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The page

export function ProvidersPage(props: { fallbackNotices?: string[] } = {}) {
  const [usage, setUsage] = createSignal<ProviderUsage[]>([]);
  const [acpAgents, setAcpAgents] = createSignal<AcpAgentConfig[]>([]);
  const [bots, setBots] = createSignal<BotSummary[]>([]);
  const [models, setModels] = createSignal<AgentModelOption[]>([]);
  const [endpoints, setEndpoints] = createSignal<ModelEndpoint[]>([]);
  const [botId, setBotId] = createSignal<string>("");
  // For keys items by identity: unrelated discovery updates must not remount editors or discard drafts.
  const groupCache = new Map<string, { scope: string; label: string }>();
  const group = (scope: string, label: string) => {
    const existing = groupCache.get(scope);
    if (existing?.label === label) return existing;
    const next = { scope, label };
    groupCache.set(scope, next);
    return next;
  };
  const groups = () => [
    group("provider:codex", "Codex"),
    group("provider:claude", "Claude"),
    ...acpAgents().map((agent) => group(`provider:acp:${agent.id}`, agent.name)),
    ...endpoints().map((endpoint) => group(`provider:endpoint:${endpoint.id}`, endpoint.label)),
    group(GENERAL_FALLBACK_SCOPE, t("All providers")),
  ];
  const [loadingFallbacks, setLoadingFallbacks] = createSignal(false);
  const [info, setInfo] = createSignal<FallbackModelsInfo | null>(null);
  const [saved, setSaved] = createSignal<AgentModelId[]>([]);
  const [items, setItems] = createSignal<AgentModelId[]>([]);
  const [now, setNow] = createSignal(Date.now());
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);

  let loadSerial = 0;
  const bot = () => bots().find((candidate) => candidate.id === botId());
  const options = (): FallbackModelOption[] => [
    ...models().map((model) => ({ id: model.id, name: model.name })),
    ...acpAgents()
      .filter((agent) => !models().some((model) => model.id === acpModelId(agent.id)))
      .map((agent) => ({ id: acpModelId(agent.id), name: `${agent.name} (ACP)` })),
  ];
  const modelOptions = () => [
    ...options(),
    ...endpoints()
      .flatMap((endpoint) =>
        endpoint.models.map((model) => ({
          id: endpointModelId(endpoint.id, model),
          name: `${endpoint.label}: ${model}`,
        })),
      )
      .filter((option) => !options().some((existing) => existing.id === option.id)),
  ];
  const dirty = () => JSON.stringify(items()) !== JSON.stringify(saved());
  const fail = (e: unknown, fallback: string) => setError(providerError(e, fallback));

  async function loadFallbacks(id: string) {
    const api = window.openbot.providers;
    const serial = ++loadSerial;
    if (!api || !id) {
      setSaved([]);
      setItems([]);
      return;
    }
    setLoadingFallbacks(true);
    try {
      const detail = await api.getFallbackInfo?.(id);
      const list = detail ? (detail.own ?? []) : await api.getFallbackModels(id);
      if (serial !== loadSerial) return;
      setInfo(detail ?? null);
      setSaved(list);
      setItems(list);
    } catch (e) {
      if (serial === loadSerial) fail(e, t("Could not load fallback models."));
    } finally {
      if (serial === loadSerial) setLoadingFallbacks(false);
    }
  }
  async function refreshUsage() {
    const api = window.openbot.providers;
    if (!api) return;
    setRefreshing(true);
    try {
      setUsage(await api.listUsage());
      setError("");
    } catch (e) {
      fail(e, t("Could not load usage."));
    } finally {
      setRefreshing(false);
    }
  }
  function chooseBot(id: string) {
    setBotId(id);
    setNotice("");
    void loadFallbacks(id);
  }
  async function saveOrder() {
    const api = window.openbot.providers;
    if (!api || !botId() || saving() || loadingFallbacks()) return;
    const problem = fallbackModelsProblem(items());
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      const result = await api.setFallbackModels({ botId: botId(), fallbackModels: items() });
      setSaved(result);
      setItems(result);
      await loadFallbacks(botId());
      setNotice(t("Fallback order saved."));
      setError("");
    } catch (e) {
      fail(e, t("Could not save the order."));
    } finally {
      setSaving(false);
    }
  }
  onSettled(() => {
    const api = window.openbot.providers;
    if (!api) {
      setError(t("Providers are unavailable."));
      return;
    }
    void window.openbot.endpoints
      ?.list()
      .then(setEndpoints)
      .catch((e) => fail(e, t("Could not load endpoint groups.")));
    void refreshUsage();
    void api
      .listAcpAgents()
      .then(setAcpAgents)
      .catch((e) => fail(e, t("Could not load ACP agents.")));
    void window.openbot.agent
      .listModels()
      .then(setModels)
      .catch(() => undefined);
    void window.openbot.agent
      .listBots()
      .then((list) => {
        setBots(list);
        if (!botId() && list[0]) chooseBot(list[0].id);
      })
      .catch((e) => fail(e, t("Could not load agents.")));
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    const off = window.openbot.agent.onEvent((event) => {
      if (event.type === "provider-usage-changed") setUsage(event.usage);
      if (event.type === "acp-agents-changed") setAcpAgents(event.agents);
      if (event.type === "bots-changed") setBots(event.bots);
      if (event.type === "endpoints-changed") setEndpoints(event.endpoints);
    });
    return () => {
      clearInterval(timer);
      off();
    };
  });
  return (
    <main class="w2-library providers-page">
      <header>
        <Heading as="h1" size="lg">
          {t("Providers")}
        </Heading>
        <Text as="p" tone="secondary">
          {t("See which providers are available, add your own ACP agents, and choose what an agent falls back to.")}
        </Text>
      </header>
      <Show when={error()}>
        <Text as="p" tone="danger" role="alert">
          {error()}
        </Text>
      </Show>
      <ProviderAccounts />
      <ManagedCliSection />
      <ProviderCatalogPanel />
      <ApiKeysSection />
      <EndpointsSection />
      <ProviderUsageList
        usage={usage()}
        acpAgents={acpAgents()}
        now={now()}
        refreshing={refreshing()}
        onRefresh={() => void refreshUsage()}
      />
      <AcpPresets />
      <AcpAgentsSection
        agents={acpAgents()}
        onSave={async (input) => {
          const api = window.openbot.providers;
          if (!api) throw new Error(t("Providers are unavailable."));
          await api.saveAcpAgent(input);
          setAcpAgents(await api.listAcpAgents());
        }}
        onRemove={async (id) => {
          const api = window.openbot.providers;
          if (!api) throw new Error(t("Providers are unavailable."));
          await api.removeAcpAgent({ id });
          setAcpAgents(await api.listAcpAgents());
        }}
      />
      <Card class="providers-section" role="region" aria-label={t("Fallback models")}>
        <Heading as="h2" size="md">
          {t("Fallback models")}
        </Heading>
        <ProviderFallbackLists
          groups={groups()}
          options={modelOptions()}
          onSaved={() => {
            const id = botId();
            if (!id) return;
            void window.openbot.providers
              ?.getFallbackInfo?.(id)
              .then((detail) => {
                if (botId() === id) setInfo(detail);
              })
              .catch((e) => fail(e, t("Could not refresh the chain.")));
          }}
        />
        <FallbackInUse bots={bots()} options={modelOptions()} />
        <Show when={props.fallbackNotices?.length}>
          <ul class="providers-list" aria-label={t("Recent switches")}>
            <For each={props.fallbackNotices ?? []}>
              {(line) => (
                <li class="providers-row">
                  <Text tone="secondary">{line}</Text>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <fieldset aria-label={t("Agent fallback settings")} style="border: 0; padding: 0; margin: 0; min-width: 0">
          <Field label={t("Agent")}>
            <NativeSelect
              value={botId()}
              disabled={saving()}
              onChange={(event) => chooseBot(event.currentTarget.value)}
            >
              <For each={bots()}>{(item) => <option value={item.id}>{item.name}</option>}</For>
            </NativeSelect>
          </Field>
          <Show when={bot()}>
            {(current) => (
              <FallbackOrder
                botName={current().name}
                ownModel={current().model}
                unavailable={info()?.unavailable}
                items={items()}
                options={modelOptions()}
                dirty={dirty()}
                saving={saving() || loadingFallbacks()}
                onChange={(next) => {
                  const problem = fallbackModelsProblem(next);
                  if (problem) setError(problem);
                  else {
                    setItems(next);
                    setError("");
                  }
                }}
                onSave={() => void saveOrder()}
              />
            )}
          </Show>
          <Show when={bot()}>
            <Text as="p" role="status">
              {info()?.own === null ? t("Using provider and all-provider lists") : t("Agent's own list")}
            </Text>
            <Show when={window.openbot.providers?.resetFallbackModels}>
              <Button
                disabled={saving() || loadingFallbacks() || info()?.own === null}
                onClick={async () => {
                  const api = window.openbot.providers;
                  if (!api?.resetFallbackModels) return;
                  setSaving(true);
                  try {
                    await api.resetFallbackModels(botId());
                    await loadFallbacks(botId());
                    setError("");
                  } catch (e) {
                    fail(e, t("Could not reset the list."));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {t("Reset to provider list")}
              </Button>
            </Show>
          </Show>
          <Show when={bot()}>
            <FallbackChainView info={info()} options={modelOptions()} />
          </Show>
          <Show when={notice()}>
            <Text as="p" tone="success" role="status">
              {notice()}
            </Text>
          </Show>
        </fieldset>
      </Card>
    </main>
  );
}
