import type {
  AcpAgentConfig,
  AgentModelId,
  AgentModelOption,
  BotSummary,
  ProviderUsage,
  SaveAcpAgentInput,
} from "@openbot/contracts/ipc";
import { acpModelId, isAcpAgentId, PROVIDER_LIMITS } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { Badge, Button, Card, Field, Heading, Input, NativeSelect, Text, Textarea } from "./ui";

// ---------------------------------------------------------------------------------------------------------------
// Pure helpers (tested without a window)

/** A new list with the item at `from` moved to `to`; the same list when either index is outside it. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const copy = [...items];
  if (from === to || from < 0 || to < 0 || from >= copy.length || to >= copy.length) return copy;
  copy.splice(to, 0, ...copy.splice(from, 1));
  return copy;
}

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
  if (!id) errors.id = "Choose an id.";
  else if (!isAcpAgentId(id))
    errors.id = `Start with a lowercase letter, then lowercase letters, digits and dashes (up to ${PROVIDER_LIMITS.acpId}).`;
  else if (existingIds.includes(id)) errors.id = "An agent with this id already exists.";
  const name = draft.name.trim();
  if (!name) errors.name = "Give the agent a name.";
  else if (name.length > PROVIDER_LIMITS.acpName) errors.name = `Use at most ${PROVIDER_LIMITS.acpName} characters.`;
  const command = draft.command.trim();
  if (!command) errors.command = "Enter the program to run.";
  else if (command.length > PROVIDER_LIMITS.command)
    errors.command = `Use at most ${PROVIDER_LIMITS.command} characters.`;
  const args = acpArgsFromText(draft.args);
  if (args.length > PROVIDER_LIMITS.args) errors.args = `Use at most ${PROVIDER_LIMITS.args} arguments.`;
  else if (args.some((arg) => arg.length > PROVIDER_LIMITS.arg))
    errors.args = `Each argument can have at most ${PROVIDER_LIMITS.arg} characters.`;
  return errors;
}

export function providerLabel(usage: Pick<ProviderUsage, "provider" | "model">, acpAgents: readonly AcpAgentConfig[]) {
  if (usage.provider === "codex") return "Codex";
  if (usage.provider === "claude") return "Claude";
  const id = usage.model?.startsWith("acp:") ? usage.model.slice(4) : null;
  const agent = id ? acpAgents.find((item) => item.id === id) : undefined;
  return agent ? `${agent.name} (ACP)` : usage.model ? `${usage.model}` : "ACP agent";
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
    <Card class="providers-section" role="region" aria-label="Provider usage">
      <div class="providers-heading">
        <Heading as="h2" size="md">
          Usage and limits
        </Heading>
        <Show when={props.onRefresh}>
          <Button type="button" size="sm" loading={props.refreshing} onClick={() => props.onRefresh?.()}>
            Refresh
          </Button>
        </Show>
      </div>
      <Show
        when={props.usage.length}
        fallback={
          <Text as="p" tone="muted">
            No usage information yet.
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
                        {item.state === "limited" ? "Resets at" : "Back at"} {reset()}
                      </Text>
                    </Show>
                    <Show when={item.state !== "ok" && !reset()}>
                      <Text as="p" tone="muted">
                        No reset time was given.
                      </Text>
                    </Show>
                  </div>
                  <div class="providers-state">
                    <Show when={item.usedPercent !== null}>
                      <Text tone="secondary">{Math.round(item.usedPercent ?? 0)}% used</Text>
                    </Show>
                    <Badge tone={view().tone} dot>
                      {view().label}
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
      setError(e instanceof Error ? e.message : "Could not add the agent.");
    } finally {
      setSaving(false);
    }
  }
  async function remove(id: string) {
    try {
      await props.onRemove(id);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the agent.");
    } finally {
      setRemoving(null);
    }
  }
  return (
    <Card class="providers-section" role="region" aria-label="ACP agents">
      <Heading as="h2" size="md">
        ACP agents
      </Heading>
      <Text as="p" tone="secondary">
        Any program that speaks the Agent Client Protocol over stdio can be a provider. It appears as one model next to
        the others.
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
            No ACP agent is added.
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
                </div>
                <Show
                  when={removing() === agent.id}
                  fallback={
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      aria-label={`Remove ${agent.name}`}
                      onClick={() => setRemoving(agent.id)}
                    >
                      Remove
                    </Button>
                  }
                >
                  <div class="providers-confirm" role="alertdialog" aria-label={`Confirm removing ${agent.name}`}>
                    <Text tone="danger">
                      Agents set to {acpModelId(agent.id)} can no longer use it. Remove {agent.name}?
                    </Text>
                    <Button type="button" variant="danger" size="sm" onClick={() => void remove(agent.id)}>
                      Yes, remove
                    </Button>
                    <Button type="button" size="sm" onClick={() => setRemoving(null)}>
                      Keep
                    </Button>
                  </div>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <form class="providers-form" aria-label="Add ACP agent" onSubmit={(event) => void save(event)} novalidate>
        <Heading as="h3" size="sm" tone="secondary">
          Add an ACP agent
        </Heading>
        <Field
          label="Id"
          required
          description="Becomes part of its model id, for example acp:my-agent."
          error={shown("id")}
        >
          <Input value={draft().id} onInput={(e) => set({ id: e.currentTarget.value })} autocomplete="off" />
        </Field>
        <Field label="Name" required error={shown("name")}>
          <Input value={draft().name} onInput={(e) => set({ name: e.currentTarget.value })} />
        </Field>
        <Field
          label="Command"
          required
          description="The program to start, as you would type it."
          error={shown("command")}
        >
          <Input value={draft().command} onInput={(e) => set({ command: e.currentTarget.value })} autocomplete="off" />
        </Field>
        <Field label="Arguments" description="One per line." error={shown("args")}>
          <Textarea value={draft().args} rows={3} onInput={(e) => set({ args: e.currentTarget.value })} />
        </Field>
        <Show when={atLimit()}>
          <Text as="p" tone="warning">
            You can add up to {PROVIDER_LIMITS.acpAgents} ACP agents.
          </Text>
        </Show>
        <Button type="submit" variant="primary" disabled={atLimit()} loading={saving()} loadingLabel="Adding…">
          Add agent
        </Button>
      </form>
    </Card>
  );
}

export interface FallbackModelOption {
  id: AgentModelId;
  name: string;
}

/**
 * The order of one agent's fallback models. Drag a row, or focus it and press Alt+Up or Alt+Down; the buttons do the
 * same. The agent's own model is tried first and is not in this list.
 */
export function FallbackOrder(props: {
  botName: string;
  ownModel: AgentModelId;
  items: AgentModelId[];
  options: FallbackModelOption[];
  dirty: boolean;
  saving: boolean;
  onChange: (items: AgentModelId[]) => void;
  onSave: () => void;
}) {
  const [dragFrom, setDragFrom] = createSignal<number | null>(null);
  const [announce, setAnnounce] = createSignal("");
  const nameOf = (id: AgentModelId) => props.options.find((option) => option.id === id)?.name ?? id;
  const full = () => props.items.length >= PROVIDER_LIMITS.fallbackModels;
  const addable = () => props.options.filter((o) => o.id !== props.ownModel && !props.items.includes(o.id));
  function move(from: number, to: number) {
    if (to < 0 || to >= props.items.length || from === to) return;
    const id = props.items[from];
    props.onChange(moveItem(props.items, from, to));
    if (id !== undefined) setAnnounce(`${nameOf(id)} moved to position ${to + 1} of ${props.items.length}.`);
  }
  return (
    <section class="providers-fallback" aria-label={`Fallback models for ${props.botName}`}>
      <Text as="p" tone="secondary">
        When {nameOf(props.ownModel)}'s provider reaches a limit or is unavailable, {props.botName} tries these in
        order. Each is tried at most once per message.
      </Text>
      <Show
        when={props.items.length}
        fallback={
          <Text as="p" tone="muted">
            No fallback models. {props.botName} stops when its own provider does.
          </Text>
        }
      >
        <ol class="providers-order" aria-label="Fallback order">
          <For each={props.items}>
            {(model, index) => (
              <li
                class="providers-order-item"
                data-dragging={dragFrom() === index() ? "" : undefined}
                draggable="true"
                tabindex="0"
                aria-label={`${index() + 1}. ${nameOf(model)}. Press Alt and Up or Down arrow to reorder.`}
                onDragStart={(event) => {
                  setDragFrom(index());
                  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = dragFrom();
                  setDragFrom(null);
                  if (from !== null) move(from, index());
                }}
                onDragEnd={() => setDragFrom(null)}
                onKeyDown={(event) => {
                  if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                  event.preventDefault();
                  move(index(), index() + (event.key === "ArrowUp" ? -1 : 1));
                }}
              >
                <span class="providers-order-number" aria-hidden="true">
                  {index() + 1}
                </span>
                <span class="providers-order-name">{nameOf(model)}</span>
                <Button
                  type="button"
                  size="xs"
                  aria-label={`Move ${nameOf(model)} up`}
                  disabled={index() === 0}
                  onClick={() => move(index(), index() - 1)}
                >
                  Up
                </Button>
                <Button
                  type="button"
                  size="xs"
                  aria-label={`Move ${nameOf(model)} down`}
                  disabled={index() === props.items.length - 1}
                  onClick={() => move(index(), index() + 1)}
                >
                  Down
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="danger"
                  aria-label={`Remove ${nameOf(model)} from fallbacks`}
                  onClick={() => props.onChange(props.items.filter((_, i) => i !== index()))}
                >
                  Remove
                </Button>
              </li>
            )}
          </For>
        </ol>
      </Show>
      <span class="providers-sr-only" role="status" aria-live="polite">
        {announce()}
      </span>
      <div class="providers-add">
        <NativeSelect
          aria-label="Add fallback model"
          value=""
          disabled={full() || !addable().length}
          onChange={(event) => {
            const chosen = addable().find((option) => option.id === event.currentTarget.value);
            event.currentTarget.value = "";
            if (chosen && !full()) props.onChange([...props.items, chosen.id]);
          }}
        >
          <option value="">
            {full() ? `At most ${PROVIDER_LIMITS.fallbackModels} models` : "Add a fallback model…"}
          </option>
          <For each={addable()}>{(option) => <option value={option.id}>{option.name}</option>}</For>
        </NativeSelect>
        <Button type="button" variant="primary" disabled={!props.dirty} loading={props.saving} onClick={props.onSave}>
          Save order
        </Button>
      </div>
    </section>
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
      <ul class="providers-list" aria-label="Agents using a fallback model">
        <For each={active()}>
          {(entry) => (
            <li class="providers-row">
              <Text>
                <Text as="strong">{entry.bot.name}</Text> is using {nameOf(entry.active)} instead of{" "}
                {nameOf(entry.bot.model)}.
              </Text>
              <Badge tone="warning" dot>
                Fallback
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

export function ProvidersPage() {
  const [usage, setUsage] = createSignal<ProviderUsage[]>([]);
  const [acpAgents, setAcpAgents] = createSignal<AcpAgentConfig[]>([]);
  const [bots, setBots] = createSignal<BotSummary[]>([]);
  const [models, setModels] = createSignal<AgentModelOption[]>([]);
  const [botId, setBotId] = createSignal("");
  const [saved, setSaved] = createSignal<AgentModelId[]>([]);
  const [items, setItems] = createSignal<AgentModelId[]>([]);
  const [now, setNow] = createSignal(Date.now());
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  const [switches, setSwitches] = createSignal<string[]>([]);
  let loadSerial = 0;
  const bot = () => bots().find((candidate) => candidate.id === botId());
  const options = (): FallbackModelOption[] => [
    ...models().map((model) => ({ id: model.id, name: model.name })),
    ...acpAgents()
      .filter((agent) => !models().some((model) => model.id === acpModelId(agent.id)))
      .map((agent) => ({ id: acpModelId(agent.id), name: `${agent.name} (ACP)` })),
  ];
  const dirty = () => JSON.stringify(items()) !== JSON.stringify(saved());
  const fail = (e: unknown, fallback: string) => setError(e instanceof Error ? e.message : fallback);

  async function loadFallbacks(id: string) {
    const api = window.openbot.providers;
    const serial = ++loadSerial;
    if (!api || !id) {
      setSaved([]);
      setItems([]);
      return;
    }
    try {
      const list = await api.getFallbackModels(id);
      if (serial !== loadSerial) return;
      setSaved(list);
      setItems(list);
    } catch (e) {
      if (serial === loadSerial) fail(e, "Could not load fallback models.");
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
      fail(e, "Could not load usage.");
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
    if (!api || !botId() || saving()) return;
    setSaving(true);
    try {
      const result = await api.setFallbackModels({ botId: botId(), fallbackModels: items() });
      setSaved(result);
      setItems(result);
      setNotice("Fallback order saved.");
      setError("");
    } catch (e) {
      fail(e, "Could not save the order.");
    } finally {
      setSaving(false);
    }
  }
  onSettled(() => {
    const api = window.openbot.providers;
    if (!api) {
      setError("Providers are unavailable.");
      return;
    }
    void refreshUsage();
    void api
      .listAcpAgents()
      .then(setAcpAgents)
      .catch((e) => fail(e, "Could not load ACP agents."));
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
      .catch((e) => fail(e, "Could not load agents."));
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    const off = window.openbot.agent.onEvent((event) => {
      if (event.type === "provider-usage-changed") setUsage(event.usage);
      if (event.type === "acp-agents-changed") setAcpAgents(event.agents);
      if (event.type === "bots-changed") setBots(event.bots);
      if (event.type === "model-fallback") {
        const name = bots().find((candidate) => candidate.id === event.botId)?.name ?? "An agent";
        setSwitches((list) =>
          [`${name} switched from ${event.fromModel} to ${event.toModel}: ${event.reason}`, ...list].slice(0, 5),
        );
      }
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
          Providers
        </Heading>
        <Text as="p" tone="secondary">
          See which providers are available, add your own ACP agents, and choose what an agent falls back to.
        </Text>
      </header>
      <Show when={error()}>
        <Text as="p" tone="danger" role="alert">
          {error()}
        </Text>
      </Show>
      <ProviderUsageList
        usage={usage()}
        acpAgents={acpAgents()}
        now={now()}
        refreshing={refreshing()}
        onRefresh={() => void refreshUsage()}
      />
      <AcpAgentsSection
        agents={acpAgents()}
        onSave={async (input) => {
          const api = window.openbot.providers;
          if (!api) throw new Error("Providers are unavailable.");
          await api.saveAcpAgent(input);
          setAcpAgents(await api.listAcpAgents());
        }}
        onRemove={async (id) => {
          const api = window.openbot.providers;
          if (!api) throw new Error("Providers are unavailable.");
          await api.removeAcpAgent({ id });
          setAcpAgents(await api.listAcpAgents());
        }}
      />
      <Card class="providers-section" role="region" aria-label="Fallback models">
        <Heading as="h2" size="md">
          Fallback models
        </Heading>
        <FallbackInUse bots={bots()} options={options()} />
        <Show when={switches().length}>
          <ul class="providers-list" aria-label="Recent switches">
            <For each={switches()}>
              {(line) => (
                <li class="providers-row">
                  <Text tone="secondary">{line}</Text>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show
          when={bots().length}
          fallback={
            <Text as="p" tone="muted">
              Create an agent to set its fallback models.
            </Text>
          }
        >
          <Field label="Agent">
            <NativeSelect value={botId()} onChange={(event) => chooseBot(event.currentTarget.value)}>
              <For each={bots()}>{(item) => <option value={item.id}>{item.name}</option>}</For>
            </NativeSelect>
          </Field>
          <Show when={bot()}>
            {(current) => (
              <FallbackOrder
                botName={current().name}
                ownModel={current().model}
                items={items()}
                options={options()}
                dirty={dirty()}
                saving={saving()}
                onChange={setItems}
                onSave={() => void saveOrder()}
              />
            )}
          </Show>
          <Show when={notice()}>
            <Text as="p" tone="success" role="status">
              {notice()}
            </Text>
          </Show>
        </Show>
      </Card>
    </main>
  );
}
