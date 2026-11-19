import { type RemoteDesktopBadge, type RemoteDesktopHostState, remoteDesktopSummary } from "@openbot/contracts/ipc";
import { createMemo, createSignal, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { PanelHeading } from "./PanelHeading";
import { Badge, type BadgeTone, Button, Card, Switch, Text } from "./ui";
import { Users } from "./ui/icons";

const BADGE_VIEW: Record<RemoteDesktopBadge, { label: string; tone: BadgeTone }> = {
  ready: { label: "Ready", tone: "success" },
  off: { label: "Off", tone: "neutral" },
  unavailable: { label: "Not available", tone: "danger" },
};

/**
 * Who may come in and how (window.openbot.remoteDesktop.host): the state of sharing at a glance, the sessions and the cards that wait,
 * the "Ask on this computer" switch (ask for EVERY session, also for a viewer allowed before) and the "unattended" line, which is
 * not offered in this version, with its reason. Sharing itself, the token and the viewers stay in the page below.
 */
export function RemoteDesktopAccessPanel() {
  const api = untrack(() => window.openbot?.remoteDesktop);
  const [host, setHost] = createSignal<RemoteDesktopHostState | null>(null);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const summary = createMemo(() => {
    const state = host();
    return state ? remoteDesktopSummary(state) : null;
  });

  // The newest read wins: an older read that finishes late is dropped.
  let serial = 0;
  async function load() {
    if (!api) return;
    const mine = ++serial;
    try {
      const next = await api.host.getState();
      if (mine !== serial) return;
      setHost(next);
      setError("");
    } catch (cause) {
      if (mine === serial)
        setError(cause instanceof Error ? cause.message : t("Could not load the remote desktop settings."));
    } finally {
      setLoaded(true);
    }
  }

  onSettled(() => {
    void load();
    const off = window.openbot?.agent?.onEvent((event) => {
      if (event.type === "remote-desktop-host-changed") {
        serial++;
        setHost(event.state);
        setError("");
        setLoaded(true);
      }
    });
    return () => off?.();
  });

  async function setAskEverySession(enabled: boolean) {
    if (!api || busy()) return;
    setBusy(true);
    setError("");
    try {
      const next = await api.host.setAskEverySession({ enabled });
      serial++;
      setHost(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not change the setting."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Show when={api}>
      <section class="settings-modal-group remote-access" aria-labelledby="remote-access-title">
        <PanelHeading id="remote-access-title" icon={Users} tint="green">
          {t("Who may come in")}
        </PanelHeading>
        <Show when={error()}>
          <p class="updates-panel-error" role="alert">
            {error()}
            <Button type="button" variant="ghost" onClick={() => void load()}>
              {t("Retry")}
            </Button>
          </p>
        </Show>
        <Show when={loaded()} fallback={<CosgralLoadingSkeleton label={t("Loading…")} />}>
          <Show when={summary()}>
            {(view) => (
              <Card class="settings-modal-card">
                <div class="settings-modal-row">
                  <div class="settings-modal-row-copy">
                    <span class="settings-modal-row-title">{t("Sharing this computer")}</span>
                    <Text tone="muted" variant="caption">
                      {view().unavailableReason
                        ? t(view().unavailableReason ?? "")
                        : t("{active} of {max} sessions open · {pending} waiting for your answer", {
                            active: view().activeSessions,
                            max: view().maxSessions,
                            pending: view().pendingCards,
                          })}
                    </Text>
                  </div>
                  <Badge tone={BADGE_VIEW[view().badge].tone} dot>
                    {t(BADGE_VIEW[view().badge].label)}
                  </Badge>
                </div>

                <Switch
                  checked={host()?.askEverySession ?? false}
                  disabled={busy() || view().badge === "unavailable"}
                  onChange={(checked) => void setAskEverySession(checked)}
                  label={t("Ask on this computer every time")}
                  description={t(
                    "Also for a viewer you allowed before. You have {seconds} seconds to answer; after that the viewer is refused.",
                    { seconds: view().answerSeconds },
                  )}
                />

                <div class="settings-modal-row updates-panel-unavailable" aria-disabled="true">
                  <div class="settings-modal-row-copy">
                    <span class="settings-modal-row-title">{t("Unattended access")}</span>
                    <Text tone="muted" variant="caption">
                      {t(view().unattended.reason)}
                    </Text>
                  </div>
                  <Badge tone="neutral">{t("Not available")}</Badge>
                </div>
              </Card>
            )}
          </Show>
        </Show>
      </section>
    </Show>
  );
}
