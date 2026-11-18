import { UPDATE_TRACKS, type UpdateStatus, type UpdatesOverview, updateTrackChange } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { LoadingPlaceholder } from "./LoadingPlaceholder";
import { Badge, type BadgeTone, Button, Card, Heading, NativeSelect, Switch, Text } from "./ui";

const CHECK_HOURS = [1, 4, 12, 24, 72, 168] as const;

const PHASE_VIEW: Record<UpdateStatus["phase"], { label: string; tone: BadgeTone }> = {
  idle: { label: "Not checked yet", tone: "neutral" },
  checking: { label: "Checking…", tone: "accent" },
  available: { label: "Update available", tone: "warning" },
  downloading: { label: "Downloading…", tone: "accent" },
  ready: { label: "Ready to install", tone: "success" },
  installing: { label: "Installing…", tone: "accent" },
  "up-to-date": { label: "Up to date", tone: "success" },
  error: { label: "Problem", tone: "danger" },
  unsupported: { label: "Not available here", tone: "neutral" },
};

function trackLabel(id: string): string {
  return id === "preview" ? t("Preview") : t("Stable");
}

function hoursLabel(hours: number): string {
  if (hours === 1) return t("Every hour");
  if (hours % 24 === 0) return hours === 24 ? t("Every day") : t("Every {count} days", { count: hours / 24 });
  return t("Every {count} hours", { count: hours });
}

/**
 * The program's updates (window.openbot.updatePreferences + window.openbot.updates): the version and what the program found,
 * the Stable/Preview track, the automatic checks, download and install-on-quit, and "Restart when idle" (restart into a downloaded
 * update once no agent is working). What this version does not offer is listed with its reason.
 */
export function UpdatesPanel() {
  const preferencesApi = untrack(() => window.openbot?.updatePreferences);
  const updatesApi = untrack(() => window.openbot?.update);
  const [overview, setOverview] = createSignal<UpdatesOverview | null>(null);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  // The newest read wins: an older read that finishes late is dropped.
  let serial = 0;
  async function load() {
    if (!preferencesApi) return;
    const mine = ++serial;
    try {
      const next = await preferencesApi.getOverview();
      if (mine !== serial) return;
      setOverview(next);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not load the update settings."));
    } finally {
      setLoaded(true);
    }
  }

  onSettled(() => {
    void load();
    const off = window.openbot?.agent?.onEvent((event) => {
      if (event.type === "update-preferences-changed") void load();
    });
    const offStatus = updatesApi?.onEvent(() => void load());
    return () => {
      off?.();
      offStatus?.();
    };
  });

  async function run(work: () => Promise<unknown>, failure: string) {
    if (busy()) return;
    setBusy(true);
    setError("");
    try {
      await work();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : failure);
    } finally {
      setBusy(false);
    }
  }

  const change = (input: Parameters<NonNullable<typeof preferencesApi>["set"]>[0]) =>
    run(async () => preferencesApi?.set(input), t("Could not save the update settings."));

  function phaseMessage(status: UpdateStatus): string {
    if (status.phase === "available" && status.availableVersion) {
      return t("Version {version} is available.", { version: status.availableVersion });
    }
    if (status.phase === "downloading") {
      return status.progress === null
        ? t("Downloading the update…")
        : t("Downloading the update: {percent}%", { percent: Math.round(status.progress) });
    }
    if (status.phase === "ready" && status.availableVersion) {
      return t("Version {version} is downloaded and ready.", { version: status.availableVersion });
    }
    return status.message ?? "";
  }

  return (
    <section class="settings-modal-group updates-panel" aria-labelledby="settings-updates">
      <Heading id="settings-updates" as="h3" size="sm" tone="secondary">
        {t("Updates")}
      </Heading>
      <Show
        when={preferencesApi}
        fallback={<Text tone="muted">{t("Update settings are not available in this version.")}</Text>}
      >
        <Show when={error()}>
          <p class="updates-panel-error" role="alert">
            {error()}
            <Button type="button" variant="ghost" onClick={() => void load()}>
              {t("Retry")}
            </Button>
          </p>
        </Show>
        <Show when={loaded()} fallback={<LoadingPlaceholder />}>
          <Show when={overview()}>
            {(view) => (
              <Card class="settings-modal-card">
                <div class="settings-modal-row">
                  <div class="settings-modal-row-copy">
                    <span class="settings-modal-row-title">{t("COSGRAL Workspace version")}</span>
                    <div class="settings-modal-version">
                      <Text tone="muted" variant="caption">
                        {t("Installed version")}
                      </Text>
                      <Badge tone={PHASE_VIEW[view().status.phase].tone} dot>
                        {view().status.currentVersion}
                      </Badge>
                      <Badge tone={PHASE_VIEW[view().status.phase].tone}>
                        {t(PHASE_VIEW[view().status.phase].label)}
                      </Badge>
                    </div>
                    <Show when={phaseMessage(view().status)}>
                      <Text tone="muted" variant="caption">
                        {phaseMessage(view().status)}
                      </Text>
                    </Show>
                  </div>
                  <div class="updates-panel-actions">
                    <Show when={view().canUpdate}>
                      <Show when={view().status.phase === "available"}>
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy()}
                          onClick={() =>
                            void run(async () => updatesApi?.download(), t("Could not download the update."))
                          }
                        >
                          {t("Download")}
                        </Button>
                      </Show>
                      <Show when={view().status.phase === "ready"}>
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy()}
                          onClick={() =>
                            void run(async () => updatesApi?.install(), t("Could not install the update."))
                          }
                        >
                          {t("Restart and install")}
                        </Button>
                      </Show>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={
                          busy() ||
                          !updatesApi ||
                          view().status.phase === "checking" ||
                          view().status.phase === "downloading"
                        }
                        onClick={() => void run(async () => updatesApi?.check(), t("Could not check for updates."))}
                      >
                        {t("Check for updates")}
                      </Button>
                    </Show>
                  </div>
                </div>

                <Show when={view().canUpdate}>
                  <div class="settings-modal-row">
                    <div class="settings-modal-row-copy">
                      <span class="settings-modal-row-title">{t("Update track")}</span>
                      <Text tone="muted" variant="caption">
                        {t(UPDATE_TRACKS.find((entry) => entry.id === view().track)?.description ?? "")}
                      </Text>
                    </div>
                    <NativeSelect
                      class="settings-modal-select"
                      size="sm"
                      aria-label={t("Update track")}
                      value={view().track}
                      disabled={busy()}
                      onChange={(event) => {
                        const track = UPDATE_TRACKS.find((entry) => entry.id === event.currentTarget.value);
                        if (track) void change(updateTrackChange(track.id));
                      }}
                    >
                      <For each={UPDATE_TRACKS}>
                        {(entry) => <option value={entry.id}>{trackLabel(entry.id)}</option>}
                      </For>
                    </NativeSelect>
                  </div>

                  <Switch
                    checked={view().preferences.automaticChecks}
                    disabled={busy()}
                    onChange={(checked) => void change({ automaticChecks: checked })}
                    label={t("Check for updates automatically")}
                    description={t("Without it the program makes no network request about updates by itself.")}
                  />
                  <div class="settings-modal-row">
                    <div class="settings-modal-row-copy">
                      <span class="settings-modal-row-title">{t("How often")}</span>
                    </div>
                    <NativeSelect
                      class="settings-modal-select"
                      size="sm"
                      aria-label={t("How often")}
                      value={String(view().preferences.checkEveryHours)}
                      disabled={busy() || !view().preferences.automaticChecks}
                      onChange={(event) => void change({ checkEveryHours: Number(event.currentTarget.value) })}
                    >
                      <For each={CHECK_HOURS}>
                        {(hours) => <option value={String(hours)}>{hoursLabel(hours)}</option>}
                      </For>
                    </NativeSelect>
                  </div>
                  <Switch
                    checked={view().preferences.automaticDownload}
                    disabled={busy() || !view().preferences.automaticChecks}
                    onChange={(checked) => void change({ automaticDownload: checked })}
                    label={t("Automatically download updates")}
                    description={t("Download new versions when they become available.")}
                  />
                  <Switch
                    checked={view().preferences.installOnQuit}
                    disabled={busy()}
                    onChange={(checked) => void change({ installOnQuit: checked })}
                    label={t("Install a downloaded update when the program closes")}
                    description={t("Otherwise it waits until you restart yourself.")}
                  />
                  <div class="settings-modal-row">
                    <div class="settings-modal-row-copy">
                      <span class="settings-modal-row-title">{t("Restart when idle")}</span>
                      <Text tone="muted" variant="caption">
                        {view().restartWhenIdle.pending
                          ? t("Waiting for the agents to finish, then the program restarts.")
                          : view().restartWhenIdle.reason
                            ? t(view().restartWhenIdle.reason ?? "")
                            : t("Restarts into the downloaded update once no agent is working.")}
                      </Text>
                    </div>
                    <Show
                      when={view().restartWhenIdle.pending}
                      fallback={
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy() || !view().restartWhenIdle.available}
                          onClick={() =>
                            void run(
                              async () => preferencesApi?.restartWhenIdle(),
                              t("Could not schedule the restart."),
                            )
                          }
                        >
                          {t("Restart when idle")}
                        </Button>
                      }
                    >
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy()}
                        onClick={() =>
                          void run(
                            async () => preferencesApi?.cancelRestartWhenIdle(),
                            t("Could not cancel the restart."),
                          )
                        }
                      >
                        {t("Stop waiting")}
                      </Button>
                    </Show>
                  </div>
                </Show>

                <For each={view().unavailable}>
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
              </Card>
            )}
          </Show>
        </Show>
      </Show>
    </section>
  );
}
