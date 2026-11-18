import type { MicrophoneStatus, VoiceOverview, VoiceSection } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { Badge, type BadgeTone, Button, Card, Heading, Text } from "./ui";
import { VoiceSettings } from "./VoiceSettings";

const MICROPHONE_VIEW: Record<MicrophoneStatus, { label: string; tone: BadgeTone; hint: string }> = {
  granted: {
    label: "Allowed",
    tone: "success",
    hint: "The program may use the microphone for dictation.",
  },
  denied: {
    label: "Blocked",
    tone: "danger",
    hint: "The microphone is switched off for this program. Allow it in the system settings.",
  },
  "not-determined": {
    label: "Not asked yet",
    tone: "warning",
    hint: "The system has not asked yet. It asks the first time you dictate.",
  },
  restricted: {
    label: "Forbidden here",
    tone: "danger",
    hint: "A policy on this computer forbids the microphone.",
  },
  unknown: {
    label: "Unknown",
    tone: "neutral",
    hint: "This system does not say. Recording is simply tried.",
  },
};

const SECTION_LABELS: Record<VoiceSection, string> = {
  dictation: "Dictation",
  "spoken-replies": "Spoken replies",
  "live-voice": "Live voice",
};

/**
 * What the Voice page adds to the settings (window.openbot.voice.getOverview): the microphone permission of the system with a button
 * to the system page where it is changed, and what this version does NOT offer, with the reason (Parakeet, cloud dictation, the neural
 * reading model, live voice). Audio stays on this computer; that is the reason most of the list gives.
 */
export function VoiceOverviewPanel() {
  const api = untrack(() => window.openbot?.voice);
  const [overview, setOverview] = createSignal<VoiceOverview | null>(null);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal("");
  const [opening, setOpening] = createSignal(false);

  // The newest read wins: an older read that finishes late is dropped.
  let serial = 0;
  async function load() {
    if (!api) return;
    const mine = ++serial;
    try {
      const next = await api.getOverview();
      if (mine !== serial) return;
      setOverview(next);
      setError("");
    } catch (cause) {
      if (mine === serial) setError(cause instanceof Error ? cause.message : t("Could not load the voice overview."));
    } finally {
      setLoaded(true);
    }
  }

  onSettled(() => {
    void load();
    const off = window.openbot?.agent?.onEvent((event) => {
      if (event.type === "voice-changed") void load();
    });
    return () => off?.();
  });

  async function openMicrophoneSettings() {
    if (opening()) return;
    setOpening(true);
    setError("");
    try {
      await api?.openMicrophoneSettings();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not open the microphone settings."));
    } finally {
      setOpening(false);
    }
  }

  const sections = (view: VoiceOverview): VoiceSection[] =>
    (["dictation", "spoken-replies", "live-voice"] as const).filter((section) =>
      view.unavailable.some((item) => item.section === section),
    );

  return (
    <div class="voice-overview">
      <Show when={api}>
        <section class="settings-modal-group" aria-labelledby="settings-voice-microphone">
          <Heading id="settings-voice-microphone" as="h3" size="sm" tone="secondary">
            {t("Microphone")}
          </Heading>
          <Show when={error()}>
            <p class="updates-panel-error" role="alert">
              {error()}
              <Button type="button" variant="ghost" onClick={() => void load()}>
                {t("Retry")}
              </Button>
            </p>
          </Show>
          <Show when={loaded()} fallback={<CosgralLoadingSkeleton label={t("Loading…")} />}>
            <Show when={overview()}>
              {(view) => (
                <Card class="settings-modal-card">
                  <div class="settings-modal-row">
                    <div class="settings-modal-row-copy">
                      <span class="settings-modal-row-title">{t("Microphone permission")}</span>
                      <Text tone="muted" variant="caption">
                        {t(MICROPHONE_VIEW[view().microphone.status].hint)}
                      </Text>
                    </div>
                    <div class="updates-panel-actions">
                      <Badge tone={MICROPHONE_VIEW[view().microphone.status].tone} dot>
                        {t(MICROPHONE_VIEW[view().microphone.status].label)}
                      </Badge>
                      <Show when={view().microphone.canOpenSettings}>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={opening()}
                          onClick={() => void openMicrophoneSettings()}
                        >
                          {t("Open microphone settings")}
                        </Button>
                      </Show>
                    </div>
                  </div>
                </Card>
              )}
            </Show>
          </Show>
        </section>
      </Show>

      <VoiceSettings />

      <Show when={api && overview()}>
        {(view) => (
          <section class="settings-modal-group" aria-labelledby="settings-voice-unavailable">
            <Heading id="settings-voice-unavailable" as="h3" size="sm" tone="secondary">
              {t("Not available in this version")}
            </Heading>
            <Card class="settings-modal-card">
              <For each={sections(view())}>
                {(section) => (
                  <>
                    <div class="settings-modal-row voice-unavailable-section">
                      <span class="settings-modal-row-title">{t(SECTION_LABELS[section])}</span>
                    </div>
                    <For each={view().unavailable.filter((item) => item.section === section)}>
                      {(feature) => (
                        <div class="settings-modal-row updates-panel-unavailable" aria-disabled="true">
                          <div class="settings-modal-row-copy">
                            <span class="settings-modal-row-title">{t(feature.label)}</span>
                            <Text tone="muted" variant="caption">
                              {t(feature.reason)}
                            </Text>
                          </div>
                          <Badge tone="neutral">{t("Not available")}</Badge>
                        </div>
                      )}
                    </For>
                  </>
                )}
              </For>
            </Card>
          </section>
        )}
      </Show>
    </div>
  );
}
