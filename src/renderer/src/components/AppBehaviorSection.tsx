import type { AppBehaviorSettings } from "@openbot/contracts/ipc";
import { createSignal, onSettled } from "solid-js";
import { t } from "../i18n";
import { Card, Heading, Switch } from "./ui";

type BehaviorKey = keyof AppBehaviorSettings;

/**
 * "App behavior": start with Windows and keep running in the tray (`window.openbot.appSettings`, the `behavior` part).
 * One component for both places that show app settings, so the two switches are never wired in one and missing in the other.
 * A change is shown at once and taken back when the program refuses it.
 */
export function AppBehaviorSection() {
  const [behavior, setBehavior] = createSignal<AppBehaviorSettings>({ launchAtLogin: false, keepBackground: false });
  const [busy, setBusy] = createSignal<BehaviorKey | null>(null);
  const [error, setError] = createSignal("");

  onSettled(() => {
    void window.openbot?.appSettings
      ?.get()
      .then((settings) => setBehavior(settings.behavior))
      .catch(() => {
        /* The switches stay off until the person can try again. */
      });
  });

  async function save(key: BehaviorKey, enabled: boolean): Promise<void> {
    if (busy()) return;
    const before = behavior();
    setBusy(key);
    setError("");
    setBehavior({ ...before, [key]: enabled });
    try {
      const next = await window.openbot?.appSettings?.update({ behavior: { [key]: enabled } });
      if (next) setBehavior(next.behavior);
    } catch (cause) {
      setBehavior(before);
      setError(cause instanceof Error ? cause.message : t("Could not save the setting."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section class="settings-modal-group" aria-labelledby="settings-app-behavior">
      <Heading id="settings-app-behavior" as="h3" size="sm" tone="secondary">
        {t("App behavior")}
      </Heading>
      <Card class="settings-modal-card">
        <Switch
          checked={behavior().launchAtLogin}
          disabled={busy() !== null}
          onChange={(checked) => void save("launchAtLogin", checked)}
          label={t("Launch COSGRAL Workspace at login")}
          description={t("Open the app when you sign in to this computer.")}
        />
        <Switch
          checked={behavior().keepBackground}
          disabled={busy() !== null}
          onChange={(checked) => void save("keepBackground", checked)}
          label={t("Keep COSGRAL Workspace running in the background")}
          description={t("Keep active tasks running after you close the window.")}
        />
      </Card>
      {error() ? (
        <p class="updates-panel-error" role="alert">
          {error()}
        </p>
      ) : null}
    </section>
  );
}
