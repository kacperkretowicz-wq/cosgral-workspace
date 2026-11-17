import type {
  AgentModelId,
  AgentModelOption,
  AgentReasoningEffort,
  AgentStatus,
  AgentTemplate,
  BotAvatarHue,
} from "@openbot/contracts/ipc";
import { AGENT_REASONING_EFFORTS } from "@openbot/contracts/ipc";
import { createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { AVATAR_HUE_OPTIONS, avatarCandidateSeeds, avatarHueSwatch } from "../blobatar";
import { t } from "../i18n";
import { AgentAvatar } from "./AgentAvatar";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { Button, Input, NativeSelect, Shuffle, Textarea } from "./ui";

export interface NewAgentInput {
  name: string;
  description: string;
  model: AgentModelId;
  reasoningEffort: AgentReasoningEffort;
  avatarSeed: string;
  avatarHue: BotAvatarHue | null;
}

interface NewAgentPageProps {
  modelOptions: AgentModelOption[];
  agentStatus: AgentStatus;
  defaultModel: AgentModelId;
  /** Templates offered as suggestions; the page shows at most three. Empty hides the section. */
  loadSuggestions?: () => Promise<AgentTemplate[]>;
  onCreate: (input: NewAgentInput) => Promise<void>;
  onCancel: () => void;
}

const EFFORT_LABELS: Record<AgentReasoningEffort, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

function hueOf(value: number | null): BotAvatarHue | null {
  return AVATAR_HUE_OPTIONS.find((option) => option.hue === value)?.hue ?? null;
}

function effortOf(value: string): AgentReasoningEffort {
  return AGENT_REASONING_EFFORTS.find((effort) => effort === value) ?? "medium";
}

const NAME_LIMIT = 80;
const DESCRIPTION_LIMIT = 2_000;

/** One page, one decision: who the agent is and what it is for. Creating needs only a name. */
export function NewAgentPage(props: NewAgentPageProps) {
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [model, setModel] = createSignal<AgentModelId>(props.defaultModel);
  const [effort, setEffort] = createSignal<AgentReasoningEffort>("medium");
  const [hue, setHue] = createSignal<BotAvatarHue | null>(null);
  const [seed, setSeed] = createSignal(`new-agent:${Date.now().toString(36)}`);
  const [batch, setBatch] = createSignal(0);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [suggestions, setSuggestions] = createSignal<AgentTemplate[]>([]);
  const faces = createMemo(() => avatarCandidateSeeds("new-agent", seed(), batch()));
  const canCreate = () => name().trim().length > 0 && !busy();

  onSettled(() => {
    void props
      .loadSuggestions?.()
      .then((templates) => setSuggestions(templates.slice(0, 3)))
      .catch(() => setSuggestions([]));
  });

  async function submit(event: Event) {
    event.preventDefault();
    if (!canCreate()) return;
    setBusy(true);
    setError("");
    try {
      await props.onCreate({
        name: name().trim(),
        description: description().trim(),
        model: model(),
        reasoningEffort: effort(),
        avatarSeed: seed(),
        avatarHue: hue(),
      });
    } catch {
      setError(t("Could not create the agent. Check the fields and try again."));
      setBusy(false);
    }
  }

  function useSuggestion(template: AgentTemplate) {
    setName(template.name);
    setDescription(template.description);
    if (template.model) setModel(template.model);
    if (template.reasoningEffort) setEffort(template.reasoningEffort);
    setHue(hueOf(template.avatarHue));
  }

  return (
    <main class="new-agent-page" aria-label={t("New agent")}>
      <header class="new-agent-header">
        <h1>{t("New agent")}</h1>
      </header>
      <div class="new-agent-scroll">
        <form class="new-agent-form" onSubmit={submit}>
          <AgentAvatar seed={seed()} hue={hue()} motion="always" class="new-agent-preview" />
          <fieldset class="new-agent-colors" aria-label={t("Agent color")}>
            <For each={AVATAR_HUE_OPTIONS}>
              {(option) => (
                <Button
                  type="button"
                  class={["new-agent-swatch", { "new-agent-choice-selected": hue() === option.hue }]}
                  aria-label={t(option.label)}
                  aria-pressed={hue() === option.hue ? "true" : "false"}
                  onClick={() => setHue(hue() === option.hue ? null : option.hue)}
                >
                  <span class="new-agent-swatch-fill" style={{ background: avatarHueSwatch(option.hue) }} />
                </Button>
              )}
            </For>
          </fieldset>
          <fieldset class="new-agent-faces" aria-label={t("Agent face")}>
            <For each={faces()}>
              {(candidate) => (
                <Button
                  type="button"
                  class={["new-agent-face", { "new-agent-choice-selected": seed() === candidate }]}
                  aria-label={t("Choose this face")}
                  aria-pressed={seed() === candidate ? "true" : "false"}
                  onClick={() => setSeed(candidate)}
                >
                  <AgentAvatar seed={candidate} hue={hue()} />
                </Button>
              )}
            </For>
            <Button
              type="button"
              variant="ghost"
              class="new-agent-more-faces"
              aria-label={t("More faces")}
              title={t("More faces")}
              onClick={() => {
                setBatch((value) => value + 1);
                setSeed(faces()[0] ?? seed());
              }}
            >
              <Shuffle aria-hidden="true" />
            </Button>
          </fieldset>

          <label class="new-agent-field">
            <span>
              {t("Name")} <b aria-hidden="true">*</b>
            </span>
            <Input
              value={name()}
              required
              maxlength={NAME_LIMIT}
              aria-label={t("Agent name")}
              onInput={(event) => setName(event.currentTarget.value)}
            />
          </label>
          <label class="new-agent-field">
            <span>{t("What should this agent help with?")}</span>
            <Textarea
              class="new-agent-textarea"
              value={description()}
              maxlength={DESCRIPTION_LIMIT}
              rows={3}
              onInput={(event) => setDescription(event.currentTarget.value)}
            />
          </label>
          <div class="new-agent-model-row">
            <ProviderModelPicker
              variant="field"
              ariaLabel={t("Agent model")}
              value={model()}
              modelOptions={props.modelOptions}
              agentStatus={props.agentStatus}
              onChange={setModel}
            />
            <label class="new-agent-effort">
              <span class="sr-only">{t("Effort")}</span>
              <NativeSelect
                value={effort()}
                aria-label={t("Effort")}
                onChange={(event) => setEffort(effortOf(event.currentTarget.value))}
              >
                <For each={AGENT_REASONING_EFFORTS}>
                  {(value) => <option value={value}>{t(EFFORT_LABELS[value])}</option>}
                </For>
              </NativeSelect>
            </label>
          </div>
          <Show when={error()}>
            <p class="new-agent-error" role="alert">
              {error()}
            </p>
          </Show>
          <div class="new-agent-actions">
            <Button type="button" variant="ghost" onClick={props.onCancel}>
              {t("Cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={!canCreate()}>
              {busy() ? t("Creating…") : t("Create agent")}
            </Button>
          </div>
        </form>

        <Show when={suggestions().length > 0}>
          <section class="new-agent-suggestions" aria-label={t("Suggestions")}>
            <h2>{t("Suggestions")}</h2>
            <div class="new-agent-suggestion-grid">
              <For each={suggestions()}>
                {(template) => (
                  <Button
                    type="button"
                    variant="ghost"
                    class="new-agent-suggestion"
                    onClick={() => useSuggestion(template)}
                  >
                    <AgentAvatar seed={`template:${template.id}`} hue={hueOf(template.avatarHue)} />
                    <span>
                      <strong>{template.name}</strong>
                      <small>{template.summary}</small>
                    </span>
                  </Button>
                )}
              </For>
            </div>
          </section>
        </Show>
      </div>
    </main>
  );
}
