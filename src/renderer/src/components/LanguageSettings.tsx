import { createSignal, onSettled } from "solid-js";
import { language, setLanguage, t } from "../i18n";
import { Field, NativeSelect, Text } from "./ui";

export function LanguageSettings() {
  const [busy, setBusy] = createSignal(false);
  const [ready, setReady] = createSignal(false);
  const [error, setError] = createSignal("");
  onSettled(() => {
    void window.openbot.appSettings
      ?.get()
      .then(() => setReady(true))
      .catch(() => setError("Could not load language settings."));
  });
  async function save(value: string) {
    if (value !== "pl" && value !== "en") return;
    setBusy(true);
    try {
      const result = await window.openbot.appSettings?.update({ language: value });
      if (!result) throw new Error("Language settings unavailable");
      setLanguage(result.language);
      document.documentElement.lang = result.language;
      setError("");
    } catch {
      setError("Could not save language. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section class="settings-modal-group" aria-label={t("Language")}>
      <Field label={t("Language")} description={t("Changes apply immediately and are saved on this computer.")}>
        <NativeSelect
          value={language()}
          disabled={!ready() || busy()}
          onChange={(event) => void save(event.currentTarget.value)}
        >
          <option value="en">English</option>
          <option value="pl">Polski</option>
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
