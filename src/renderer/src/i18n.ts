import type { AppLanguage, AppSettings } from "@openbot/contracts/ipc";
import { createSignal } from "solid-js";
import { pl } from "./locales/pl";

export { en } from "./locales/en";

const polish = new Map<string, string>(Object.entries(pl));
export const [language, setLanguage] = createSignal<AppLanguage>("en");
const warned = new Set<string>();

export function systemLanguage(languages: readonly string[]): AppLanguage {
  return languages[0]?.toLowerCase().split("-")[0] === "pl" ? "pl" : "en";
}

export function t(key: string): string {
  const locale = language();
  const translated = polish.get(key);
  if (translated !== undefined) return locale === "pl" ? translated : key;
  if (!warned.has(key)) {
    warned.add(key);
    console.warn("[i18n] Missing UI translation", key);
  }
  return key;
}

/** One subscription per renderer, shared by the shell and all settings surfaces. */
export function startI18n(): () => void {
  let revision = 0;
  let disposed = false;
  const accept = (settings?: AppSettings) => {
    const next = settings?.languageChosen ? settings.language : systemLanguage(navigator.languages);
    setLanguage(next);
    document.documentElement.lang = next;
  };
  accept();
  const off = window.openbot.agent.onEvent((event) => {
    if (event.type === "app-settings-changed") {
      revision++;
      accept(event.settings);
    }
  });
  const initialRevision = revision;
  void window.openbot.appSettings
    ?.get()
    .then((settings) => {
      if (!disposed && revision === initialRevision) accept(settings);
    })
    .catch(() => {
      /* Keep the system language while settings are unavailable. */
    });
  return () => {
    disposed = true;
    off();
  };
}
