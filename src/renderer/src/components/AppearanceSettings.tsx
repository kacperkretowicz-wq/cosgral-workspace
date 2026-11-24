import {
  APP_AGENT_STEPS,
  APP_CHAT_ACCENTS,
  APP_FONT_WEIGHTS,
  APP_FONTS,
  APP_SEND_SHORTCUTS,
  APP_UI_SCALES,
  type AppAgentSteps,
  type AppChatAccent,
  type AppFont,
  type AppFontWeight,
  type AppSendShortcut,
  type AppTheme,
  type AppUiScale,
  DEFAULT_APP_APPEARANCE,
  normalizeAppTheme,
} from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { t } from "../i18n";
import { Field, NativeSelect, Switch, Text } from "./ui";

const FONT_LABELS: Record<AppFont, string> = {
  inter: "Program font",
  system: "System font",
  mono: "Fixed-width",
};

const WEIGHT_LABELS: Record<AppFontWeight, string> = {
  light: "Lighter",
  normal: "Normal",
  strong: "Stronger",
};

const SEND_LABELS: Record<AppSendShortcut, string> = {
  enter: "Enter",
  "mod-enter": "Ctrl+Enter",
};

const ACCENT_LABELS: Record<AppChatAccent, string> = {
  blue: "Blue",
  green: "Green",
  violet: "Violet",
  orange: "Orange",
  pink: "Pink",
  gray: "Gray",
};

const STEPS_LABELS: Record<AppAgentSteps, string> = {
  show: "Show open",
  collapse: "Collapsed",
};

function pickScale(value: string): AppUiScale {
  const n = Number(value);
  return APP_UI_SCALES.find((scale) => scale === n) ?? DEFAULT_APP_APPEARANCE.uiScale;
}

function pickFont(value: string): AppFont {
  return APP_FONTS.find((font) => font === value) ?? DEFAULT_APP_APPEARANCE.font;
}

function pickWeight(value: string): AppFontWeight {
  return APP_FONT_WEIGHTS.find((weight) => weight === value) ?? DEFAULT_APP_APPEARANCE.fontWeight;
}

function pickSend(value: string): AppSendShortcut {
  return APP_SEND_SHORTCUTS.find((shortcut) => shortcut === value) ?? DEFAULT_APP_APPEARANCE.sendShortcut;
}

function pickAccent(value: string): AppChatAccent {
  return APP_CHAT_ACCENTS.find((accent) => accent === value) ?? DEFAULT_APP_APPEARANCE.chatAccent;
}

function pickSteps(value: string): AppAgentSteps {
  return APP_AGENT_STEPS.find((steps) => steps === value) ?? DEFAULT_APP_APPEARANCE.agentSteps;
}

/**
 * Settings → Appearance: theme plus the look/send knobs from appSettings.appearance
 * (scale, font, accent, send shortcut, unread first, agent steps). Saved through appSettings.update.
 */
export function AppearanceSettings() {
  const [theme, setTheme] = createSignal<AppTheme>("dark");
  const [uiScale, setUiScale] = createSignal<AppUiScale>(DEFAULT_APP_APPEARANCE.uiScale);
  const [font, setFont] = createSignal<AppFont>(DEFAULT_APP_APPEARANCE.font);
  const [fontWeight, setFontWeight] = createSignal<AppFontWeight>(DEFAULT_APP_APPEARANCE.fontWeight);
  const [sendShortcut, setSendShortcut] = createSignal<AppSendShortcut>(DEFAULT_APP_APPEARANCE.sendShortcut);
  const [unreadFirst, setUnreadFirst] = createSignal(DEFAULT_APP_APPEARANCE.unreadFirst);
  const [chatAccent, setChatAccent] = createSignal<AppChatAccent>(DEFAULT_APP_APPEARANCE.chatAccent);
  const [agentSteps, setAgentSteps] = createSignal<AppAgentSteps>(DEFAULT_APP_APPEARANCE.agentSteps);
  const [ready, setReady] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  function applyFromSettings(s: {
    theme: AppTheme;
    appearance: {
      uiScale: AppUiScale;
      font: AppFont;
      fontWeight: AppFontWeight;
      sendShortcut: AppSendShortcut;
      unreadFirst: boolean;
      chatAccent: AppChatAccent;
      agentSteps: AppAgentSteps;
    };
  }) {
    setTheme(s.theme);
    setUiScale(s.appearance.uiScale);
    setFont(s.appearance.font);
    setFontWeight(s.appearance.fontWeight);
    setSendShortcut(s.appearance.sendShortcut);
    setUnreadFirst(s.appearance.unreadFirst);
    setChatAccent(s.appearance.chatAccent);
    setAgentSteps(s.appearance.agentSteps);
  }

  onSettled(() => {
    void window.openbot.appSettings
      ?.get()
      .then((s) => {
        applyFromSettings(s);
        setReady(true);
      })
      .catch(() => setError(t("Could not load appearance settings.")));
  });

  async function save(patch: { theme?: AppTheme; appearance?: Record<string, string | number | boolean> }) {
    setBusy(true);
    try {
      const result = await window.openbot.appSettings?.update(patch);
      if (result) applyFromSettings(result);
      setError("");
    } catch {
      setError(t("Could not save appearance. Try again."));
      try {
        const current = await window.openbot.appSettings?.get();
        if (current) applyFromSettings(current);
      } catch {
        /* keep last UI values */
      }
    } finally {
      setBusy(false);
    }
  }

  const disabled = () => !ready() || busy();

  return (
    <section class="settings-modal-group appearance-settings" aria-label={t("Appearance")}>
      <Field
        label={t("Theme")}
        description={t("System follows your computer’s appearance. Changes are saved automatically.")}
      >
        <NativeSelect
          value={theme()}
          disabled={disabled()}
          aria-label={t("Theme")}
          onChange={(e) => void save({ theme: normalizeAppTheme(e.currentTarget.value) })}
        >
          <option value="system">{t("System")}</option>
          <option value="light">{t("Light")}</option>
          <option value="dark">{t("Dark")}</option>
        </NativeSelect>
      </Field>

      <Field label={t("Interface scale")} description={t("Size of the whole window relative to normal.")}>
        <NativeSelect
          value={String(uiScale())}
          disabled={disabled()}
          aria-label={t("Interface scale")}
          onChange={(e) => void save({ appearance: { uiScale: pickScale(e.currentTarget.value) } })}
        >
          <For each={APP_UI_SCALES}>{(scale) => <option value={scale}>{scale}%</option>}</For>
        </NativeSelect>
      </Field>

      <Field label={t("Font")} description={t("Text font for the whole program.")}>
        <NativeSelect
          value={font()}
          disabled={disabled()}
          aria-label={t("Font")}
          onChange={(e) => void save({ appearance: { font: pickFont(e.currentTarget.value) } })}
        >
          <For each={APP_FONTS}>{(item) => <option value={item}>{t(FONT_LABELS[item])}</option>}</For>
        </NativeSelect>
      </Field>

      <Field label={t("Text weight")} description={t("How heavy the text looks. Applies at once.")}>
        <NativeSelect
          value={fontWeight()}
          disabled={disabled()}
          aria-label={t("Text weight")}
          onChange={(e) => void save({ appearance: { fontWeight: pickWeight(e.currentTarget.value) } })}
        >
          <For each={APP_FONT_WEIGHTS}>{(item) => <option value={item}>{t(WEIGHT_LABELS[item])}</option>}</For>
        </NativeSelect>
      </Field>

      <Field label={t("Accent")} description={t("Colour accent for your own chat bubbles.")}>
        <NativeSelect
          value={chatAccent()}
          disabled={disabled()}
          aria-label={t("Accent")}
          onChange={(e) => void save({ appearance: { chatAccent: pickAccent(e.currentTarget.value) } })}
        >
          <For each={APP_CHAT_ACCENTS}>{(item) => <option value={item}>{t(ACCENT_LABELS[item])}</option>}</For>
        </NativeSelect>
      </Field>

      <Field
        label={t("Send message with")}
        description={t("Enter sends by default. Ctrl+Enter keeps Enter for a new line.")}
      >
        <NativeSelect
          value={sendShortcut()}
          disabled={disabled()}
          aria-label={t("Send message with")}
          onChange={(e) => void save({ appearance: { sendShortcut: pickSend(e.currentTarget.value) } })}
        >
          <For each={APP_SEND_SHORTCUTS}>{(item) => <option value={item}>{t(SEND_LABELS[item])}</option>}</For>
        </NativeSelect>
      </Field>

      <Switch
        checked={unreadFirst()}
        disabled={disabled()}
        label={t("Unread first")}
        description={t("Agents with new replies rise to the top of their group in the sidebar.")}
        onChange={(checked) => void save({ appearance: { unreadFirst: checked } })}
      />

      <Field label={t("Agent steps")} description={t("Whether thinking and tool steps start open or folded.")}>
        <NativeSelect
          value={agentSteps()}
          disabled={disabled()}
          aria-label={t("Agent steps")}
          onChange={(e) => void save({ appearance: { agentSteps: pickSteps(e.currentTarget.value) } })}
        >
          <For each={APP_AGENT_STEPS}>{(item) => <option value={item}>{t(STEPS_LABELS[item])}</option>}</For>
        </NativeSelect>
      </Field>

      <Show when={error()}>
        <Text role="alert" tone="danger">
          {t(error())}
        </Text>
      </Show>
    </section>
  );
}
