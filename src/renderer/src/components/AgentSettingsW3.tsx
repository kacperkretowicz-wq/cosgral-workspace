import type {
  AgentModelId,
  AgentSettings,
  AgentTemplate,
  CreateAgentInput,
  CreateAgentResult,
} from "@openbot/contracts/ipc";
import { isAgentModel } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { type SaveStage, saveAgentSettingsStages } from "./agent-settings-save";

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
        <select value={template()} onChange={(e) => setTemplate(e.currentTarget.value)}>
          <option value="">Start from scratch</option>
          <For each={props.templates}>{(item) => <option value={item.id}>{item.name}</option>}</For>
        </select>
      </label>
      <label>
        Agent name <input value={name()} onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <button type="button" disabled={!name().trim() && !template()} onClick={() => void create()}>
        Create agent
      </button>
      <Show when={message()}>
        <p role="status">{message()}</p>
      </Show>
      <For each={warnings()}>{(warning) => <p role="alert">{warning}</p>}</For>
    </section>
  );
}

export function AgentSettingsW3(props: { botId: string }) {
  const [settings, setSettings] = createSignal<AgentSettings>();
  const [templates, setTemplates] = createSignal<AgentTemplate[]>([]);
  const [fallbacks, setFallbacks] = createSignal<AgentModelId[]>([]);
  const [chosen, setChosen] = createSignal("");
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
      setTemplates(list);
      setFallbacks(models);
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
        api.update({
          botId: props.botId,
          name: value.bot.name,
          role: value.bot.role,
          description: value.bot.description,
          model: value.bot.model,
          tools: Object.fromEntries(value.tools.map((tool) => [tool.group, tool.enabled])),
        }),
      () => {
        const providers = window.openbot.providers;
        if (!providers) return Promise.reject(new Error("Fallback model service is unavailable."));
        return providers.setFallbackModels({ botId: props.botId, fallbackModels: fallbacks() });
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
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <Show when={failedStage()}>
        {(stage) => (
          <button type="button" disabled={saving()} onClick={() => void save(stage())}>
            {stage() === "fallback" ? "Retry fallback models" : "Retry profile and fallback models"}
          </button>
        )}
      </Show>
      <Show when={notice()}>
        <p role="status">{notice()}</p>
      </Show>
      <Show when={settings()}>
        {(value) => (
          <>
            <p>Provider: {value().provider}</p>
            <label>
              Name{" "}
              <input
                value={value().bot.name}
                onInput={(e) => setSettings((s) => s && { ...s, bot: { ...s.bot, name: e.currentTarget.value } })}
              />
            </label>
            <label>
              Role{" "}
              <input
                value={value().bot.role}
                onInput={(e) => setSettings((s) => s && { ...s, bot: { ...s.bot, role: e.currentTarget.value } })}
              />
            </label>
            <label>
              Description{" "}
              <textarea
                value={value().bot.description}
                onInput={(e) =>
                  setSettings((s) => s && { ...s, bot: { ...s.bot, description: e.currentTarget.value } })
                }
              />
            </label>
            <label>
              Model{" "}
              <select
                value={value().bot.model}
                onChange={(e) => {
                  const model = e.currentTarget.value;
                  if (isAgentModel(model)) setSettings((s) => s && { ...s, bot: { ...s.bot, model } });
                }}
              >
                <For each={value().models}>{(model) => <option value={model.id}>{model.name}</option>}</For>
              </select>
            </label>
            <fieldset>
              <legend>Tools</legend>
              <For each={value().tools}>
                {(tool) => (
                  <label>
                    <input
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
            <fieldset>
              <legend>Fallback models (in order)</legend>
              <ol>
                <For each={fallbacks()}>
                  {(model, index) => (
                    <li>
                      {model}{" "}
                      <button
                        type="button"
                        disabled={index() === 0}
                        onClick={() =>
                          setFallbacks((items) => {
                            const copy = [...items];
                            [copy[index() - 1], copy[index()]] = [copy[index()], copy[index() - 1]];
                            return copy;
                          })
                        }
                      >
                        Move up
                      </button>{" "}
                      <button
                        type="button"
                        onClick={() => setFallbacks((items) => items.filter((_, i) => i !== index()))}
                      >
                        Remove
                      </button>
                    </li>
                  )}
                </For>
              </ol>
              <select
                aria-label="Add fallback model"
                value={chosen()}
                onChange={(e) => setChosen(e.currentTarget.value)}
              >
                <option value="">Choose model</option>
                <For
                  each={value().models.filter(
                    (model) => !fallbacks().includes(model.id) && model.id !== value().bot.model,
                  )}
                >
                  {(model) => <option value={model.id}>{model.name}</option>}
                </For>
              </select>
              <button
                type="button"
                disabled={!chosen() || fallbacks().length >= 4}
                onClick={() => {
                  const model = chosen();
                  if (isAgentModel(model)) setFallbacks((items) => [...items, model]);
                  setChosen("");
                }}
              >
                Add fallback
              </button>
            </fieldset>
            <button type="button" disabled={saving()} onClick={() => void save()}>
              Save settings
            </button>
          </>
        )}
      </Show>
      <h3>Templates</h3>
      <button
        type="button"
        onClick={() =>
          void window.openbot.agentSettings
            ?.saveTemplate({ botId: props.botId })
            .then(refresh)
            .catch((e) => setError(String(e)))
        }
      >
        Save agent as template
      </button>
      <ul>
        <For each={templates()}>
          {(item) => (
            <li>
              {item.name} — {item.summary}{" "}
              <Show when={item.origin === "saved"}>
                <button
                  type="button"
                  onClick={() =>
                    void window.openbot.agentSettings
                      ?.deleteTemplate({ templateId: item.id })
                      .then(refresh)
                      .catch((e) => setError(String(e)))
                  }
                >
                  Delete
                </button>
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
