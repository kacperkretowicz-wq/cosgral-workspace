import type { AgentChatColor, AgentModelId, FallbackModelsInfo } from "@openbot/contracts/ipc";
import { AGENT_CHAT_COLORS, fallbackModelsProblem } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import { errorText } from "../errors";
import { t } from "../i18n";
import { type FallbackModelOption, FallbackOrder } from "./fallback-order";
import { AgentMemorySettingsView } from "./MemorySettings";
import { SkillsSettings } from "./SkillsSettings";
import { Button, NativeSelect, Textarea } from "./ui";
import { ArrowLeft } from "./ui/icons";

const COLOR_LABELS: Record<AgentChatColor, string> = {
  default: "None",
  blue: "Blue",
  green: "Green",
  amber: "Amber",
  red: "Red",
  violet: "Violet",
  pink: "Pink",
  teal: "Teal",
};

/** Cards that open a full settings page (Back + body) instead of a compact detail strip. */
export const AGENT_PAGE_CARD_IDS = ["instructions", "memory", "skills", "backup-models", "chat-color"] as const;
export type AgentPageCardId = (typeof AGENT_PAGE_CARD_IDS)[number];

export function isAgentPageCard(id: string): id is AgentPageCardId {
  return AGENT_PAGE_CARD_IDS.some((card) => card === id);
}

function InstructionsPage(props: { botId: string }) {
  const [text, setText] = createSignal("");
  const [path, setPath] = createSignal("");
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  let serial = 0;

  async function load() {
    const api = window.openbot?.agentSettings;
    if (!api) {
      setError(t("Agent settings are unavailable."));
      return;
    }
    const n = ++serial;
    try {
      const settings = await api.get(props.botId);
      if (n !== serial) return;
      setText(settings.bot.description);
      setPath(settings.bot.workspacePath ? `${settings.bot.workspacePath}/AGENTS.md` : "");
      setError("");
    } catch (cause) {
      if (n === serial) setError(errorText(cause, t("Could not load instructions.")));
    }
  }

  onSettled(() => {
    void load();
    return () => {
      serial++;
    };
  });

  async function save() {
    const api = window.openbot?.agentSettings;
    if (!api || busy()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const settings = await api.get(props.botId);
      await api.update({
        botId: props.botId,
        name: settings.bot.name,
        role: settings.bot.role,
        description: text(),
        model: settings.bot.model,
        tools: Object.fromEntries(settings.tools.map((tool) => [tool.group, tool.enabled])),
      });
      setNotice(t("Instructions saved."));
    } catch (cause) {
      setError(errorText(cause, t("Could not save instructions.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="agent-card-page-body" data-page="instructions">
      <Show when={path()}>
        <p class="agent-cards-note agent-card-page-path">
          <code>{path()}</code>
        </p>
      </Show>
      <p class="agent-cards-note">{t("Rules this agent always follows.")}</p>
      <Show when={error()}>
        <p class="agent-cards-error" role="alert">
          {error()}
        </p>
      </Show>
      <Show when={notice()}>
        <p role="status">{notice()}</p>
      </Show>
      <label class="agent-cards-field">
        <span class="sr-only">{t("Instructions")}</span>
        <Textarea
          value={text()}
          rows={12}
          disabled={busy()}
          aria-label={t("Instructions")}
          onInput={(event) => setText(event.currentTarget.value)}
        />
      </label>
      <div class="agent-card-detail-actions">
        <Button type="button" variant="primary" disabled={busy()} onClick={() => void save()}>
          {t("Save")}
        </Button>
      </div>
    </div>
  );
}

function ChatColorPage(props: { value: AgentChatColor; busy: boolean; onChange: (color: AgentChatColor) => void }) {
  return (
    <div class="agent-card-page-body" data-page="chat-color">
      <p class="agent-cards-note">{t("Colour of this agent’s messages in the chat.")}</p>
      <label class="agent-cards-field">
        <span>{t("Chat color")}</span>
        <NativeSelect
          value={props.value}
          disabled={props.busy}
          aria-label={t("Chat color")}
          onChange={(event) => {
            const next = AGENT_CHAT_COLORS.find((color) => color === event.currentTarget.value) ?? "default";
            props.onChange(next);
          }}
        >
          <For each={AGENT_CHAT_COLORS}>{(color) => <option value={color}>{t(COLOR_LABELS[color])}</option>}</For>
        </NativeSelect>
      </label>
    </div>
  );
}

function BackupModelsPage(props: { botId: string; botName: string }) {
  const api = untrack(() => window.openbot?.providers);
  const [info, setInfo] = createSignal<FallbackModelsInfo | null>(null);
  const [items, setItems] = createSignal<AgentModelId[]>([]);
  const [saved, setSaved] = createSignal<AgentModelId[]>([]);
  const [options, setOptions] = createSignal<FallbackModelOption[]>([]);
  const [name, setName] = createSignal(props.botName);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  let serial = 0;

  async function load() {
    if (!api) {
      setError(t("Backup models are not available in this version."));
      return;
    }
    const n = ++serial;
    setBusy(true);
    try {
      const settings = await window.openbot?.agentSettings?.get(props.botId);
      const detail = (await api.getFallbackInfo?.(props.botId)) ?? null;
      if (n !== serial) return;
      const list = detail?.own ?? (await api.getFallbackModels(props.botId));
      setInfo(detail);
      setItems(list);
      setSaved(list);
      setOptions((settings?.models ?? []).map((model) => ({ id: model.id, name: model.name })));
      if (settings?.bot.name) setName(settings.bot.name);
      setError("");
    } catch (cause) {
      if (n === serial) setError(errorText(cause, t("Could not load backup models.")));
    } finally {
      if (n === serial) setBusy(false);
    }
  }

  onSettled(() => {
    void load();
    return () => {
      serial++;
    };
  });

  async function save() {
    if (!api || busy()) return;
    const problem = fallbackModelsProblem(items());
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await api.setFallbackModels({ botId: props.botId, fallbackModels: items() });
      setItems(next);
      setSaved(next);
      setInfo((await api.getFallbackInfo?.(props.botId)) ?? null);
      setNotice(t("Backup models saved."));
    } catch (cause) {
      setError(errorText(cause, t("Could not save backup models.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="agent-card-page-body" data-page="backup-models">
      <p class="agent-cards-note">
        {t("When the main model hits a usage limit, {name} asks which model to use next.", { name: name() })}
      </p>
      <Show when={error()}>
        <p class="agent-cards-error" role="alert">
          {error()}
        </p>
      </Show>
      <Show when={notice()}>
        <p role="status">{notice()}</p>
      </Show>
      <Show
        when={api}
        fallback={<p class="agent-cards-note">{t("Backup models are not available in this version.")}</p>}
      >
        <FallbackOrder
          botName={name()}
          items={items()}
          options={options()}
          unavailable={info()?.unavailable}
          dirty={JSON.stringify(items()) !== JSON.stringify(saved())}
          saving={busy()}
          onChange={(next) => {
            const problem = fallbackModelsProblem(next);
            if (problem) setError(problem);
            else {
              setItems(next);
              setError("");
            }
          }}
          onSave={() => void save()}
        />
      </Show>
    </div>
  );
}

/**
 * Full-page card body for Knows (instructions, memories, skills) and richer Brain (backup models, chat colour).
 * Layout matches OpenBot 0.71 screens 060–064: Back + title, then the editor.
 */
export function AgentCardPage(props: {
  botId: string;
  botName: string;
  card: AgentPageCardId;
  title: string;
  chatColor: AgentChatColor;
  prefsBusy: boolean;
  onChatColor: (color: AgentChatColor) => void;
  onBack: () => void;
}) {
  return (
    <section class="agent-card-page" aria-label={props.title} data-card-page={props.card}>
      <header class="agent-card-page-header">
        <Button
          type="button"
          variant="ghost"
          class="agent-card-page-back"
          aria-label={t("Back to agent settings")}
          onClick={props.onBack}
        >
          <ArrowLeft size={18} stroke-width={1.5} aria-hidden="true" />
        </Button>
        <h4>{props.title}</h4>
      </header>
      <Show when={props.card === "instructions"}>
        <InstructionsPage botId={props.botId} />
      </Show>
      <Show when={props.card === "memory"}>
        <div class="agent-card-page-body" data-page="memory">
          <AgentMemorySettingsView botId={props.botId} />
        </div>
      </Show>
      <Show when={props.card === "skills"}>
        <div class="agent-card-page-body" data-page="skills">
          <SkillsSettings botId={props.botId} />
        </div>
      </Show>
      <Show when={props.card === "backup-models"}>
        <BackupModelsPage botId={props.botId} botName={props.botName} />
      </Show>
      <Show when={props.card === "chat-color"}>
        <ChatColorPage value={props.chatColor} busy={props.prefsBusy} onChange={props.onChatColor} />
      </Show>
    </section>
  );
}
