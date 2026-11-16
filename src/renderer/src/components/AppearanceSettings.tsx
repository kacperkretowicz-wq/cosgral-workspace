import { type AppTheme, normalizeAppTheme } from "@openbot/contracts/ipc";
import { createSignal, onSettled } from "solid-js";
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
    <section class="settings-modal-group" aria-label="Appearance">
      <Field label="Theme" description="System follows your computer’s appearance. Changes are saved automatically.">
        <NativeSelect value={theme()} disabled={!ready() || busy()} onChange={(e) => void save(e.currentTarget.value)}>
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </NativeSelect>
      </Field>
      {error() && (
        <Text role="alert" tone="danger">
          {error()}
        </Text>
      )}
    </section>
  );
}
