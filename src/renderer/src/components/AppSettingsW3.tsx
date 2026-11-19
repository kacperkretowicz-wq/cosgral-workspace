import type {
  AppLanguage,
  AppSettings,
  CompleteOnboardingInput,
  NotificationChannel,
  NotificationEvent,
  OnboardingState,
} from "@openbot/contracts/ipc";
import { NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { language, setLanguage, t } from "../i18n";
import { Button, Card, Field, Heading, Input, NativeSelect, Text } from "./ui";

export function AppSettingsW3() {
  const [settings, setSettings] = createSignal<AppSettings>();
  const [error, setError] = createSignal("");
  onSettled(() => {
    void window.openbot.appSettings
      ?.get()
      .then((value) => setSettings({ ...value, language: value.languageChosen ? value.language : language() }))
      .catch((e) => setError(String(e)));
  });
  async function save() {
    const value = settings();
    if (!value || !window.openbot.appSettings) return;
    try {
      setSettings(
        await window.openbot.appSettings.update({ language: value.language, notifications: value.notifications }),
      );
      setLanguage(value.language);
      document.documentElement.lang = value.language;
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not save settings."));
    }
  }
  return (
    <Card class="cosgral-settings-block" role="region" aria-labelledby="app-settings-title">
      <Heading as="h2" size="sm" id="app-settings-title">
        {t("Application settings")}
      </Heading>
      <Show when={error()}>
        <Text as="p" tone="danger" role="alert">
          {error()}
        </Text>
      </Show>
      <Show when={settings()}>
        {(value) => (
          <>
            <Field label={t("Language")} class="cosgral-settings-field">
              <NativeSelect
                value={value().language}
                onChange={(e) => {
                  const language = e.currentTarget.value;
                  if (language === "en" || language === "pl") setSettings((s) => s && { ...s, language });
                }}
              >
                <option value="en">English</option>
                <option value="pl">Polski</option>
              </NativeSelect>
            </Field>
            <table class="cosgral-settings-table">
              <caption>{t("Notifications")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("Event")}</th>
                  <For each={NOTIFICATION_CHANNELS}>
                    {(channel) => <th scope="col">{t(CHANNEL_LABELS[channel])}</th>}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For each={NOTIFICATION_EVENTS}>
                  {(event) => (
                    <tr>
                      <th scope="row">{t(EVENT_LABELS[event])}</th>
                      <For each={NOTIFICATION_CHANNELS}>
                        {(channel) => (
                          <td>
                            <Input
                              unstyled
                              aria-label={`${t(EVENT_LABELS[event])}: ${t(CHANNEL_LABELS[channel])}`}
                              type="checkbox"
                              checked={value().notifications.matrix[event][channel]}
                              onChange={(e) =>
                                setSettings(
                                  (s) =>
                                    s && {
                                      ...s,
                                      notifications: {
                                        ...s.notifications,
                                        matrix: {
                                          ...s.notifications.matrix,
                                          [event]: {
                                            ...s.notifications.matrix[event],
                                            [channel]: e.currentTarget.checked,
                                          },
                                        },
                                      },
                                    },
                                )
                              }
                            />
                          </td>
                        )}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            <label class="cosgral-settings-check">
              <Input
                unstyled
                type="checkbox"
                checked={value().notifications.onlyWhenUnfocused}
                onChange={(e) =>
                  setSettings(
                    (s) =>
                      s && { ...s, notifications: { ...s.notifications, onlyWhenUnfocused: e.currentTarget.checked } },
                  )
                }
              />
              {t("Only notify while COSGRAL is in the background")}
            </label>
            <div class="cosgral-settings-actions">
              <Button type="button" onClick={() => void save()}>
                {t("Save application settings")}
              </Button>
            </div>
          </>
        )}
      </Show>
    </Card>
  );
}

const EVENT_LABELS: Record<NotificationEvent, string> = {
  finished: "Agent finished",
  failed: "Agent failed",
  "needs-input": "Needs your answer",
  "needs-approval": "Needs your approval",
  takeover: "Needs you to take over",
  "channel-result": "Channel result",
};

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  desktop: "Notification",
  sound: "Sound",
};

/** What the first run adds to choosing a provider: the language, the first agent and what Computer Use can do. */
export interface OnboardingChoice {
  language: AppLanguage;
  firstAgent: CompleteOnboardingInput["firstAgent"];
}

/**
 * The onboarding questions as fields of the first-run "Set up this computer" step, so the provider is asked
 * once (by the provider picker above them, which also shows whether each provider is signed in).
 */
export function OnboardingFields(props: {
  state: OnboardingState;
  value: OnboardingChoice;
  disabled?: boolean;
  onChange: (value: OnboardingChoice) => void;
}) {
  return (
    <div class="onboarding-fields">
      <Field label={t("Language")}>
        <NativeSelect
          value={props.value.language}
          disabled={props.disabled}
          onChange={(e) => {
            const language = e.currentTarget.value;
            if (language === "en" || language === "pl") props.onChange({ ...props.value, language });
          }}
        >
          <option value="en">English</option>
          <option value="pl">Polski</option>
        </NativeSelect>
      </Field>
      <Field
        label={t("First agent")}
        description={t("Made from a template right after setup. You can add more agents later.")}
      >
        <NativeSelect
          value={props.value.firstAgent?.templateId ?? ""}
          disabled={props.disabled}
          onChange={(e) => {
            const templateId = e.currentTarget.value;
            props.onChange({ ...props.value, firstAgent: templateId ? { templateId } : null });
          }}
        >
          <option value="">{t("Choose later")}</option>
          <For each={props.state.proposals}>
            {(proposal) => (
              <option value={proposal.id}>
                {proposal.name}: {proposal.summary}
              </option>
            )}
          </For>
        </NativeSelect>
      </Field>
      <div class="onboarding-computer-use">
        <Text as="strong" variant="label-sm">
          {t("Computer Use")}
        </Text>
        <Text as="p" tone="muted">
          {props.state.computerUse.available
            ? t("Available; every action asks for your approval first.")
            : (props.state.computerUse.reason ?? t("Not available on this computer."))}
        </Text>
      </div>
    </div>
  );
}
