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
import { AVATAR_HUE_OPTIONS, type AvatarMood, avatarCandidateSeeds, avatarHueSwatch } from "../blobatar";
import { t } from "../i18n";
import { AgentAvatar } from "./AgentAvatar";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { Button, Input, NativeSelect, Shuffle, Textarea } from "./ui";
import { WorkPage } from "./WorkPage";

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

/** The faces a creature makes for its agent's state, previewed before the agent exists. */
const MOODS: ReadonlyArray<{ mood: AvatarMood; label: string }> = [
  { mood: "idle", label: "Resting" },
  { mood: "working", label: "Working" },
  { mood: "needs-you", label: "Waits for you" },
  { mood: "happy", label: "Replied" },
  { mood: "error", label: "Error" },
  { mood: "limited", label: "Limit" },
];

function hueLabel(value: BotAvatarHue | null): string {
  return AVATAR_HUE_OPTIONS.find((option) => option.hue === value)?.label ?? "";
}

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
  const [mood, setMood] = createSignal<AvatarMood>("idle");
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
    <WorkPage
      page="agents"
      class="new-agent-page"
      title={t("New agent")}
      description={t("Give the agent a face, a name and a job. Everything else can change later.")}
    >
      <form class="new-agent-layout" onSubmit={submit}>
        <section class="new-agent-studio" aria-label={t("Creature")}>
          <div class="new-agent-stage">
            <AgentAvatar seed={seed()} hue={hue()} motion="always" mood={mood()} class="new-agent-preview" />
            <fieldset class="new-agent-moods">
              <legend class="sr-only">{t("Preview a mood")}</legend>
              <For each={MOODS}>
                {(entry) => (
                  <label class="new-agent-mood" title={t(entry.label)}>
                    <Input
                      unstyled
                      type="radio"
                      class="sr-only"
                      name="new-agent-mood"
                      checked={mood() === entry.mood}
                      onChange={() => setMood(entry.mood)}
                    />
                    <AgentAvatar seed={seed()} hue={hue()} mood={entry.mood} class="new-agent-mood-avatar" />
                    <span>{t(entry.label)}</span>
                  </label>
                )}
              </For>
            </fieldset>
          </div>
          <div class="new-agent-studio-group">
            <div class="new-agent-studio-label">
              <span>{t("Shape")}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="new-agent-more-faces"
                aria-label={t("More faces")}
                title={t("More faces")}
                onClick={() => {
                  setBatch((value) => value + 1);
                  setSeed(faces()[0] ?? seed());
                }}
              >
                <Shuffle aria-hidden="true" size={14} stroke-width={1.75} />
                <span>{t("Shuffle")}</span>
              </Button>
            </div>
            <fieldset class="new-agent-faces" aria-label={t("Agent face")}>
              <For each={faces()}>
                {(candidate) => (
                  <Button
                    type="button"
                    unstyled
                    class={["new-agent-face", { "new-agent-choice-selected": seed() === candidate }]}
                    aria-label={t("Choose this face")}
                    aria-pressed={seed() === candidate ? "true" : "false"}
                    onClick={() => setSeed(candidate)}
                  >
                    <AgentAvatar seed={candidate} hue={hue()} />
                  </Button>
                )}
              </For>
            </fieldset>
          </div>
          <div class="new-agent-studio-group">
            <div class="new-agent-studio-label">
              <span>{t("Color")}</span>
              <small>{hue() === null ? t("Its own color") : t(hueLabel(hue()))}</small>
            </div>
            <fieldset class="new-agent-colors" aria-label={t("Agent color")}>
              <For each={AVATAR_HUE_OPTIONS}>
                {(option) => (
                  <Button
                    type="button"
                    unstyled
                    class={["new-agent-swatch", { "new-agent-choice-selected": hue() === option.hue }]}
                    aria-label={t(option.label)}
                    title={t(option.label)}
                    aria-pressed={hue() === option.hue ? "true" : "false"}
                    onClick={() => setHue(hue() === option.hue ? null : option.hue)}
                  >
                    <span class="new-agent-swatch-fill" style={{ background: avatarHueSwatch(option.hue) }} />
                  </Button>
                )}
              </For>
            </fieldset>
          </div>
        </section>

        <section class="new-agent-details" aria-label={t("Details")}>
          <label class="new-agent-field">
            <span>
              {t("Name")} <b aria-hidden="true">*</b>
            </span>
            <Input
              value={name()}
              required
              maxlength={NAME_LIMIT}
              placeholder={t("e.g. Research")}
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
              rows={4}
              placeholder={t("e.g. Finds sources, compares them and writes a short summary.")}
              onInput={(event) => setDescription(event.currentTarget.value)}
            />
          </label>
          <div class="new-agent-field">
            <span>{t("Model and effort")}</span>
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
          </div>
          <Show when={error()}>
            <p class="new-agent-error" role="alert">
              {error()}
            </p>
          </Show>
          <div class="new-agent-actions">
            <Show when={!name().trim() && !busy()}>
              <small id="new-agent-create-reason" class="new-agent-reason">
                {t("Give the agent a name to create it.")}
              </small>
            </Show>
            <Button type="button" variant="ghost" onClick={props.onCancel}>
              {t("Cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!canCreate()}
              aria-describedby={!name().trim() ? "new-agent-create-reason" : undefined}
            >
              {busy() ? t("Creating…") : t("Create agent")}
            </Button>
          </div>

          <Show when={suggestions().length > 0}>
            <section class="new-agent-suggestions" aria-label={t("Suggestions")}>
              <h2>{t("Start from a suggestion")}</h2>
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
        </section>
      </form>
    </WorkPage>
  );
}
