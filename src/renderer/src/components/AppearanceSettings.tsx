import { type AppTheme, normalizeAppTheme } from "@openbot/contracts/ipc";
import { createSignal, onSettled } from "solid-js";
import { t } from "../i18n";
import { Field, NativeSelect, Text } from "./ui";
export function AppearanceSettings() {
  const [theme, setTheme] = createSignal<AppTheme>("system");
  const [ready, setReady] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  onSettled(() => {
    void window.openbot.appSettings
      ?.get()
      .then((s) => {
        setTheme(s.theme);
        setReady(true);
      })
      .catch(() => setError("Could not load appearance settings."));
  });
  async function save(value: string) {
    setBusy(true);
    try {
      const result = await window.openbot.appSettings?.update({ theme: normalizeAppTheme(value) });
      if (result) setTheme(result.theme);
      setError("");
    } catch {
      setError("Could not save theme. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section class="settings-modal-group" aria-label={t("Appearance")}>
      <Field
        label={t("Theme")}
        description={t("System follows your computer’s appearance. Changes are saved automatically.")}
      >
        <NativeSelect value={theme()} disabled={!ready() || busy()} onChange={(e) => void save(e.currentTarget.value)}>
          <option value="system">{t("System")}</option>
          <option value="light">{t("Light")}</option>
          <option value="dark">{t("Dark")}</option>
        </NativeSelect>
      </Field>
      {error() && (
        <Text role="alert" tone="danger">
          {t(error())}
        </Text>
      )}
    </section>
  );
}
