import {
  APP_EXTERNAL_LINKS,
  type AppBehaviorSettings,
  type AppExternalLinks,
  DEFAULT_APP_BEHAVIOR,
  DEFAULT_APP_WORKSPACE,
} from "@openbot/contracts/ipc";
import { createSignal, onSettled } from "solid-js";
import { t } from "../i18n";
import { Card, Heading, NativeSelect, Switch, Text } from "./ui";

const isExternalLinks = (value: string): value is AppExternalLinks => APP_EXTERNAL_LINKS.some((item) => item === value);

type Change =
  | { key: "launchAtLogin" | "keepBackground"; value: boolean }
  | { key: "externalLinks"; value: AppExternalLinks }
  | { key: "restore"; value: boolean };

/**
 * "App behavior": start with Windows, keep running in the tray, where links of a conversation open and whether the program opens where
 * you left it (`window.openbot.appSettings`, the `behavior` and `workspace` parts). One component for both places that show app settings,
 * so a switch is never wired in one and missing in the other. A change is shown at once and taken back when the program refuses it.
 */
export function AppBehaviorSection() {
  const [behavior, setBehavior] = createSignal<AppBehaviorSettings>({ ...DEFAULT_APP_BEHAVIOR });
  const [restore, setRestore] = createSignal(DEFAULT_APP_WORKSPACE.restore);
  const [busy, setBusy] = createSignal<Change["key"] | null>(null);
  const [error, setError] = createSignal("");

  onSettled(() => {
    void window.openbot?.appSettings
      ?.get()
      .then((settings) => {
        setBehavior(settings.behavior);
        setRestore(settings.workspace.restore);
      })
      .catch(() => {
        /* The controls keep their defaults until the person can try again. */
      });
  });

  async function save(change: Change): Promise<void> {
    if (busy()) return;
    const beforeBehavior = behavior();
    const beforeRestore = restore();
    setBusy(change.key);
    setError("");
    if (change.key === "restore") setRestore(change.value);
    else setBehavior({ ...beforeBehavior, [change.key]: change.value });
    try {
      const next = await window.openbot?.appSettings?.update(
        change.key === "restore"
          ? { workspace: { restore: change.value } }
          : { behavior: { [change.key]: change.value } },
      );
      if (next) {
        setBehavior(next.behavior);
        setRestore(next.workspace.restore);
      }
    } catch (cause) {
      setBehavior(beforeBehavior);
      setRestore(beforeRestore);
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
          onChange={(checked) => void save({ key: "launchAtLogin", value: checked })}
          label={t("Launch COSGRAL Workspace at login")}
          description={t("Open the app when you sign in to this computer.")}
        />
        <Switch
          checked={behavior().keepBackground}
          disabled={busy() !== null}
          onChange={(checked) => void save({ key: "keepBackground", value: checked })}
          label={t("Keep COSGRAL Workspace running in the background")}
          description={t("Keep active tasks running after you close the window.")}
        />
        <Switch
          checked={restore()}
          disabled={busy() !== null}
          onChange={(checked) => void save({ key: "restore", value: checked })}
          label={t("Restore the last workspace on launch")}
          description={t("Open the page and the agent from your previous session.")}
        />
        <div class="settings-modal-row">
          <div class="settings-modal-row-copy">
            <span class="settings-modal-row-title">{t("Open external links in")}</span>
            <Text tone="muted" variant="caption">
              {t("Choose where links from conversations open.")}
            </Text>
          </div>
          <NativeSelect
            class="settings-modal-select"
            size="sm"
            aria-label={t("Open external links in")}
            value={behavior().externalLinks}
            disabled={busy() !== null}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (isExternalLinks(value)) void save({ key: "externalLinks", value });
            }}
          >
            <option value="browser">{t("Default browser")}</option>
            <option value="app">COSGRAL</option>
          </NativeSelect>
        </div>
      </Card>
      {error() ? (
        <p class="updates-panel-error" role="alert">
          {error()}
        </p>
      ) : null}
    </section>
  );
}
