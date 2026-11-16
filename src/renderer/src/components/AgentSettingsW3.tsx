import type {
  AgentModelId,
  AgentSettings,
  AgentTemplate,
  CreateAgentInput,
  CreateAgentResult,
  FallbackModelsInfo,
} from "@openbot/contracts/ipc";
import { fallbackModelsProblem, isAgentModel } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { AccessSettings } from "./AccessSettings";
import { AgentAccountPicker } from "./AgentAccountPicker";
import { type SaveStage, saveAgentSettingsStages } from "./agent-settings-save";
import { BrowserProfileSettings } from "./BrowserProfileSettings";
import { BudgetSettings } from "./BudgetSettings";
import { FallbackOrder } from "./fallback-order";
import { IsolationSettings } from "./IsolationSettings";
import { FallbackChainView } from "./ProviderFallbackLists";
import { Button, Input, NativeSelect, Textarea } from "./ui";

export function AgentTemplateCreator(props: {
  templates: AgentTemplate[];
  create: (input: CreateAgentInput) => Promise<CreateAgentResult>;
}) {
  const [name, setName] = createSignal("");
  const [template, setTemplate] = createSignal("");
  const [warnings, setWarnings] = createSignal<string[]>([]);
  const [message, setMessage] = createSignal("");
  async function create() {
    try {
      const result = await props.create({
        ...(name().trim() ? { name: name().trim() } : {}),
        ...(template() ? { templateId: template() } : {}),
      });
      setWarnings(result.warnings);
      setMessage("Agent created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create agent.");
    }
  }
  return (
    <section aria-label="Create agent">
      <h3>Create agent</h3>
      <label>
        Template{" "}
        <NativeSelect unstyled value={template()} onChange={(e) => setTemplate(e.currentTarget.value)}>
          <option value="">Start from scratch</option>
          <For each={props.templates}>{(item) => <option value={item.id}>{item.name}</option>}</For>
        </NativeSelect>
      </label>
      <label>
        Agent name <Input unstyled value={name()} onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <Button unstyled type="button" disabled={!name().trim() && !template()} onClick={() => void create()}>
        Create agent
      </Button>
      <Show when={message()}>
        <p role="status">{message()}</p>
      </Show>
      <For each={warnings()}>{(warning) => <p role="alert">{warning}</p>}</For>
    </section>
  );
}

export function AgentSettingsW3(props: { botId: string }) {
  const [savedModel, setSavedModel] = createSignal<AgentModelId>();
  const [settings, setSettings] = createSignal<AgentSettings>();
  const [templates, setTemplates] = createSignal<AgentTemplate[]>([]);
  const [fallbacks, setFallbacks] = createSignal<AgentModelId[]>([]);
  const [fallbackInfo, setFallbackInfo] = createSignal<FallbackModelsInfo | null>(null);
  const [savedFallbacks, setSavedFallbacks] = createSignal<AgentModelId[]>([]);
  const fallbackDirty = () => JSON.stringify(fallbacks()) !== JSON.stringify(savedFallbacks());
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [failedStage, setFailedStage] = createSignal<SaveStage | null>(null);
  const [saving, setSaving] = createSignal(false);
  async function refresh() {
    const api = window.openbot.agentSettings;
    if (!api) {
      setError("Agent settings are unavailable.");
      return;
    }
    try {
      const [value, list, models] = await Promise.all([
        api.get(props.botId),
        api.listTemplates(),
        window.openbot.providers?.getFallbackModels(props.botId) ?? Promise.resolve([]),
      ]);
      setSettings(value);
      setSavedModel(value.bot.model);
      setTemplates(list);
      const info = await window.openbot.providers?.getFallbackInfo?.(props.botId);
      const visible = info ? (info.own ?? []) : models;
      setFallbackInfo(info ?? null);
      setFallbacks(visible);
      setSavedFallbacks(visible);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load settings.");
    }
  }
  onSettled(() => {
    void refresh();
  });
  async function save(start: SaveStage = "profile") {
    const value = settings();
    const api = window.openbot.agentSettings;
    if (!value || !api || saving()) return;
    setSaving(true);
    setError("");
    setNotice("");
    const result = await saveAgentSettingsStages(
      () =>
        api
          .update({
            botId: props.botId,
            name: value.bot.name,
            role: value.bot.role,
            description: value.bot.description,
            model: value.bot.model,
            tools: Object.fromEntries(value.tools.map((tool) => [tool.group, tool.enabled])),
          })
          .then((updated) => {
            setSavedModel(updated.bot.model);
            setSettings(updated);
            return updated;
          }),
      async () => {
        if (!fallbackDirty() && fallbackInfo()?.own === null) return;
        const problem = fallbackModelsProblem(fallbacks());
        if (problem) throw new Error(problem);
        const providers = window.openbot.providers;
        if (!providers) return Promise.reject(new Error("Fallback model service is unavailable."));
        const saved = await providers.setFallbackModels({ botId: props.botId, fallbackModels: fallbacks() });
        setSavedFallbacks(saved);
        setFallbackInfo((await providers.getFallbackInfo?.(props.botId)) ?? null);
      },
      start,
    );
    setSaving(false);
    setFailedStage(result.failed);
    if (result.failed === null) {
      setNotice("Settings saved.");
      setError("");
    } else
      setError(
        result.failed === "profile"
          ? `Profile save failed; fallback models were not saved. ${result.message}`
          : `Profile saved, but fallback models were not saved. ${result.message}`,
      );
  }
  return (
    <section aria-label="Advanced agent settings">
      <h3>Agent profile and tools</h3>
      <Show when={props.botId} keyed>
        {(id) => (
          <>
            <AccessSettings botId={id} />
            <IsolationSettings botId={id} />
            <BrowserProfileSettings botId={id} />
            <BudgetSettings botId={id} />
          </>
        )}
      </Show>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <Show when={failedStage()}>
        {(stage) => (
          <Button unstyled type="button" disabled={saving()} onClick={() => void save(stage())}>
            {stage() === "fallback" ? "Retry fallback models" : "Retry profile and fallback models"}
          </Button>
        )}
      </Show>
      <Show when={notice()}>
        <p role="status">{notice()}</p>
      </Show>
      <Show when={settings()}>
        {(value) => (
          <>
            <p>Provider: {value().provider}</p>
            <AgentAccountPicker
              botId={props.botId}
              provider={value().provider}
              disabled={saving() || savedModel() !== value().bot.model}
            />
            <label>
              Name{" "}
              <Input
                unstyled
                value={value().bot.name}
                onInput={(e) => setSettings((s) => s && { ...s, bot: { ...s.bot, name: e.currentTarget.value } })}
              />
            </label>
            <label>
              Role{" "}
              <Input
                unstyled
                value={value().bot.role}
                onInput={(e) => setSettings((s) => s && { ...s, bot: { ...s.bot, role: e.currentTarget.value } })}
              />
            </label>
            <label>
              Description{" "}
              <Textarea
                unstyled
                value={value().bot.description}
                onInput={(e) =>
                  setSettings((s) => s && { ...s, bot: { ...s.bot, description: e.currentTarget.value } })
                }
              />
            </label>
            <label>
              Model{" "}
              <NativeSelect
                unstyled
                value={value().bot.model}
                onChange={(e) => {
                  const model = e.currentTarget.value;
                  if (isAgentModel(model)) setSettings((s) => s && { ...s, bot: { ...s.bot, model } });
                }}
              >
                <For each={value().models}>{(model) => <option value={model.id}>{model.name}</option>}</For>
              </NativeSelect>
            </label>
            <fieldset>
              <legend>Tools</legend>
              <For each={value().tools}>
                {(tool) => (
                  <label>
                    <Input
                      unstyled
                      type="checkbox"
                      checked={tool.enabled}
                      disabled={!tool.available}
                      onChange={(e) =>
                        setSettings(
                          (s) =>
                            s && {
                              ...s,
                              tools: s.tools.map((item) =>
                                item.group === tool.group ? { ...item, enabled: e.currentTarget.checked } : item,
                              ),
                            },
                        )
                      }
                    />{" "}
                    {tool.group}
                    {!tool.available ? " (unavailable)" : ""}
                  </label>
                )}
              </For>
            </fieldset>
            <FallbackOrder
              botName={value().bot.name}
              ownModel={value().bot.model}
              options={value().models}
              items={fallbacks()}
              unavailable={fallbackInfo()?.unavailable}
              dirty={fallbackDirty()}
              saving={saving()}
              confirmAdd
              onChange={(next) => {
                const problem = fallbackModelsProblem(next);
                if (problem) setError(problem);
                else {
                  setFallbacks(next);
                  setError("");
                }
              }}
              onSave={() => void save("fallback")}
            />
            <FallbackChainView info={fallbackInfo()} options={value().models} />
            <Show when={fallbackInfo()}>
              <p role="status">
                {fallbackInfo()?.own === null ? "Using provider and all-provider lists" : "Agent's own list"}
              </p>
              <Show when={window.openbot.providers?.resetFallbackModels}>
                <Button
                  type="button"
                  disabled={saving() || fallbackInfo()?.own === null}
                  onClick={async () => {
                    const api = window.openbot.providers;
                    if (!api?.resetFallbackModels) return;
                    setSaving(true);
                    try {
                      const info = await api.resetFallbackModels(props.botId);
                      const list = info.own ?? [];
                      setFallbackInfo(info);
                      setFallbacks(list);
                      setSavedFallbacks(list);
                      setError("");
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Could not reset the list.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Reset to provider list
                </Button>
              </Show>
            </Show>
            <Button unstyled type="button" disabled={saving()} onClick={() => void save()}>
              Save settings
            </Button>
          </>
        )}
      </Show>
      <h3>Templates</h3>
      <Button
        unstyled
        type="button"
        onClick={() =>
          void window.openbot.agentSettings
            ?.saveTemplate({ botId: props.botId })
            .then(refresh)
            .catch((e) => setError(String(e)))
        }
      >
        Save agent as template
      </Button>
      <ul>
        <For each={templates()}>
          {(item) => (
            <li>
              {item.name} — {item.summary}{" "}
              <Show when={item.origin === "saved"}>
                <Button
                  unstyled
                  type="button"
                  onClick={() =>
                    void window.openbot.agentSettings
                      ?.deleteTemplate({ templateId: item.id })
                      .then(refresh)
                      .catch((e) => setError(String(e)))
                  }
                >
                  Delete
                </Button>
              </Show>
            </li>
          )}
        </For>
      </ul>
      <Show when={window.openbot.agentSettings}>
        {(api) => <AgentTemplateCreator templates={templates()} create={api().createAgent} />}
      </Show>
    </section>
  );
}
