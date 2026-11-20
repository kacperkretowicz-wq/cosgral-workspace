import type { AppLanguage, AppSettings } from "@openbot/contracts/ipc";
import { createSignal } from "solid-js";
import { pl } from "./locales/pl";
import { plMany } from "./locales/pl-plural";

export { en } from "./locales/en";

const polish = new Map<string, string>(Object.entries(pl));
export const [language, setLanguage] = createSignal<AppLanguage>("en");
const warned = new Set<string>();

/** The locale for dates and numbers: it follows the app language, not the system (owner: Polish dates in Polish). */
export function appLocale(): "pl-PL" | "en-US" {
  return language() === "pl" ? "pl-PL" : "en-US";
}

export function systemLanguage(languages: readonly string[]): AppLanguage {
  return languages[0]?.toLowerCase().split("-")[0] === "pl" ? "pl" : "en";
}

export function t(key: string, values: Record<string, string | number> = {}): string {
  const locale = language();
  const translated = polish.get(key);
  if (translated !== undefined) {
    const message = locale === "pl" ? translated : key;
    return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
      Object.hasOwn(values, name) ? String(values[name]) : placeholder,
    );
  }
  if (!warned.has(key)) {
    warned.add(key);
    console.warn("[i18n] Missing UI translation", key);
  }
  return key;
}

/**
 * A count with its noun: `one` for 1, `other` otherwise in English; Polish also has the "many" form (5 plików), kept
 * beside the translations in `plMany` under the same key as `other`.
 */
export function tn(count: number, one: string, other: string, values: Record<string, string | number> = {}): string {
  const all: Record<string, string | number> = { count: count.toLocaleString(appLocale()), ...values };
  if (language() !== "pl") return t(count === 1 ? one : other, all);
  const form = new Intl.PluralRules("pl-PL").select(count);
  if (form === "one") return t(one, all);
  if (form === "few") return t(other, all);
  const many = plMany[other];
  return many === undefined
    ? t(other, all)
    : many.replace(/\{(\w+)\}/g, (match, name: string) => String(all[name] ?? match));
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
