// COSGRAL B1: the rules of the probe that need no browser, so they can be tested: what the probe may click, where it may write, how
// screens are named and how styles are grouped. Nothing in this folder contains text, graphics or code of the program that is
// looked at: the probe only reads what a running program shows, and writes it OUTSIDE the repository.

import { isAbsolute, relative, resolve } from "node:path";

/** What the page tells about one element that could be clicked. */
export interface ClickCandidate {
  tag: string;
  role: string | null;
  /** The accessible name (label, text, title). */
  name: string;
  /** The `href` attribute, when there is one. */
  href: string | null;
  disabled: boolean;
}

export interface Verdict {
  allowed: boolean;
  reason: string;
}

/**
 * Words (English and Polish, the two languages the probe meets) in the name of something that signs in, pays, sends, installs,
 * updates, deletes, shares or leaves the program. The probe never clicks such a thing: it runs on a copy with no account, and
 * the rule is that it must stay that way. A word counts when it starts a word of the name.
 */
export const DENIED_WORDS: readonly string[] = [
  // accounts and the outside world
  "sign in",
  "sign up",
  "log in",
  "login",
  "register",
  "create account",
  "continue with",
  "google",
  "github",
  "apple",
  "microsoft",
  "sso",
  "authorize",
  "connect",
  "link",
  "open in browser",
  "open link",
  "invite",
  "share",
  "publish",
  "send",
  "submit",
  "post",
  "zaloguj",
  "zarejestruj",
  "załóż konto",
  "kontynuuj z",
  "połącz",
  "autoryzuj",
  "otwórz w przeglądarce",
  "zaproś",
  "udostępnij",
  "opublikuj",
  "wyślij",
  // links that open a web page outside the program (terms, privacy, help, documentation, news)
  "terms",
  "privacy",
  "warunki",
  "polityka",
  "regulamin",
  "licen",
  "help",
  "pomoc",
  "documentation",
  "docs",
  "dokumentacj",
  "changelog",
  "what's new",
  "co nowego",
  "feedback",
  "report",
  "zgłoś",
  "support",
  "wsparcie",
  "website",
  "learn more",
  "dowiedz się",
  // choices that lead to another company's sign-in or to a paid plan
  "subscription",
  "subskrypcj",
  "my ai",
  "mojej",
  // the language wheel only cycles through the same screen
  "next language",
  "previous language",
  "następny język",
  "poprzedni język",
  "animate",
  // money
  "upgrade",
  "subscribe",
  "buy",
  "purchase",
  "pay",
  "checkout",
  "kup",
  "zapłać",
  "subskrybuj",
  "wykup",
  // changing or losing things
  "delete",
  "remove",
  "erase",
  "wipe",
  "reset",
  "clear",
  "revoke",
  "disconnect",
  "sign out",
  "log out",
  "logout",
  "uninstall",
  "usuń",
  "wyczyść",
  "zresetuj",
  "odłącz",
  "wyloguj",
  "odinstaluj",
  "cofnij zgodę",
  // installing and updating
  "install",
  "update",
  "download",
  "import",
  "export",
  "zainstaluj",
  "zaktualizuj",
  "aktualizuj",
  "pobierz",
  "importuj",
  "eksportuj",
  // leaving or agreeing for someone
  "quit",
  "exit",
  "close app",
  "accept",
  "agree",
  "allow",
  "grant",
  "zamknij aplikację",
  "wyjdź",
  "akceptuj",
  "zgadzam",
  "zezwól",
  // taking text out
  "copy",
  "skopiuj",
  "kopiuj",
];

const NAME_LIMIT = 120;

/** Words that move a wizard forward: tried first, because they open the screens that follow. */
export const FORWARD_WORDS: readonly string[] = [
  "next",
  "continue",
  "get started",
  "start",
  "skip",
  "dalej",
  "pomiń",
  "rozpocznij",
];

function normalize(text: string): string {
  return text.normalize("NFC").toLocaleLowerCase().replace(/\s+/g, " ").trim().slice(0, NAME_LIMIT);
}

/** True when `word` starts a word of `text` (Unicode aware, so "zaloguj się" matches "zaloguj"). */
export function startsAWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}`, "u").test(text);
}

/** Whether the probe may click this. An address that leaves the program is never clicked (it would open the system browser). */
/** What only OUR OWN app lets the probe press: the first-run button of the stand-in CLI (no real account is involved). */
const OWN_APP_ALLOWED: readonly string[] = ["continue with codex"];

export function clickVerdict(candidate: ClickCandidate, target: "openbot" | "cosgral" = "openbot"): Verdict {
  const name = normalize(candidate.name);
  if (candidate.disabled) return { allowed: false, reason: "disabled" };
  if (!name) return { allowed: false, reason: "no name" };
  if (candidate.href && /^(https?:|mailto:|tel:|file:)/i.test(candidate.href))
    return { allowed: false, reason: "leaves the program" };
  const ownApp = target === "cosgral" && OWN_APP_ALLOWED.some((word) => name === word);
  const denied = ownApp ? undefined : DENIED_WORDS.find((word) => startsAWord(name, word));
  if (denied) return { allowed: false, reason: `denied word "${denied}"` };
  if (candidate.role === "switch" || candidate.role === "checkbox")
    return { allowed: false, reason: "a setting, not a screen" };
  return { allowed: true, reason: "ok" };
}

/** Lower is tried earlier: forward in a wizard, then navigation, then the rest. */
export function clickPriority(candidate: ClickCandidate & { inNav: boolean }): 0 | 1 | 2 | 3 {
  const name = normalize(candidate.name);
  if (FORWARD_WORDS.some((word) => startsAWord(name, word))) return 0;
  if (candidate.role === "tab" || candidate.role === "menuitem" || candidate.inNav) return 1;
  if (candidate.role === "radio" || candidate.role === "option") return 3;
  return 2;
}

/** The probe writes only outside the repository: the program it looks at is not ours to publish. */
export function isInsideRepo(outputFolder: string, repoRoot: string): boolean {
  const path = relative(resolve(repoRoot), resolve(outputFolder));
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

/** The name of what was clicked to reach a screen, from the probe's note ("button \"Settings\" on 03-x"), or null. */
export function clickedName(via: string | null): string | null {
  return via?.match(/"([^"]+)"/)?.[1] ?? null;
}

/** A folder name for a screen: its number and a short slug of its heading and of what was clicked to get there. */
export function screenFolder(index: number, heading: string, via: string | null = null): string {
  const clicked = clickedName(via);
  const slug = (clicked && heading !== clicked ? `${heading} ${clicked}` : heading || clicked || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${String(index).padStart(2, "0")}-${slug || "screen"}`;
}

/** The same screen again: numbers (counters, clocks) and spacing are ignored. */
export function screenSignature(url: string, ariaSnapshot: string): string {
  // Numbers, spacing and the state of a choice (checked, selected, pressed) are ignored: a wheel that only moves its mark is one screen.
  const normalized = ariaSnapshot
    .replace(/\[(checked|selected|pressed|expanded|disabled|active)[^\]]*\]/g, "")
    .replace(/[0-9]+/g, "#")
    .replace(/\s+/g, " ")
    .trim();
  let hash = 5381;
  for (const character of `${url}\n${normalized}`) hash = ((hash << 5) + hash + (character.codePointAt(0) ?? 0)) >>> 0;
  return hash.toString(16);
}

/** One element's look, as the page reports it. */
export interface StyleSample {
  /** `role/tag` of the element, e.g. "button" or "heading". */
  kind: string;
  /** A short name of the element (its text), for finding it again. */
  label: string;
  look: Record<string, string>;
}

export interface StyleGroup {
  kind: string;
  count: number;
  look: Record<string, string>;
  examples: string[];
}

/** Elements of the same kind with the same look become one group with a count: the design system, not the page. */
export function groupStyles(samples: readonly StyleSample[], limit = 300): StyleGroup[] {
  const groups = new Map<string, StyleGroup>();
  for (const sample of samples) {
    const key = `${sample.kind}|${JSON.stringify(sample.look)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (existing.examples.length < 3 && sample.label && !existing.examples.includes(sample.label))
        existing.examples.push(sample.label);
    } else {
      groups.set(key, { kind: sample.kind, count: 1, look: sample.look, examples: sample.label ? [sample.label] : [] });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}
