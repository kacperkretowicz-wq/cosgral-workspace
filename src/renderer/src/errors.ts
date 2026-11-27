import { withoutIpcPrefix } from "./components/provider-error";
import { language, tDataParts } from "./i18n";
import { plErrorPatterns, plErrors } from "./locales/pl-errors";

/** The Polish sentence for an engine error, or null when we do not know it. */
export function translateErrorMessage(message: string): string | null {
  const known = plErrors[message];
  if (known !== undefined) return known;
  const translated = tDataParts(message);
  if (translated !== message) return translated;
  for (const [pattern, polish] of plErrorPatterns) {
    const match = pattern.exec(message);
    if (match) return polish.replace(/\$(\d)/g, (_all, index: string) => match[Number(index)] ?? "");
  }
  return null;
}

/** Text that has Polish letters was most likely written for the window already; plain ASCII words are the engine's English. */
function looksEnglish(message: string): boolean {
  return !/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(message) && /[A-Za-z]{3,}/.test(message);
}

/**
 * What a failed call says, in the window language and without Electron's "Error invoking remote method" in front.
 * In Polish an engine sentence we have no translation for does not stand alone: it follows the (translated) `fallback`
 * as a detail, so the window never shows a bare English sentence as the whole message.
 */
export function errorText(cause: unknown, fallback: string): string {
  if (!(cause instanceof Error)) return fallback;
  const message = withoutIpcPrefix(cause.message).trim();
  if (message === "") return fallback;
  if (language() !== "pl") return message;
  const translated = translateErrorMessage(message);
  if (translated !== null) return translated;
  return looksEnglish(message) ? `${fallback} (szczegóły: ${message})` : message;
}
