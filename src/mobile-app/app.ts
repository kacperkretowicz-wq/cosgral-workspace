// COSGRAL phone app (PWA). One script, no framework, no dependency, no outside address: it talks only to the computer
// that served it (relative /v1/… requests). It pairs with the ticket from the QR code, lists the agents, chats, answers
// the Needs you cards a phone may answer (the rest it shows as "on the computer"), and follows the event stream with
// Last-Event-ID so a lost connection loses nothing. Texts reach the page only through textContent.
//
// Source of src/backend/mobile-app-assets.ts: run `bun run build:mobile-app` after editing. The build puts the small
// runtime checks from @openbot/contracts/runtime-values into this script (see scripts/build-mobile-app.ts).

import {
  type DynamicRecord,
  isBoolean,
  isDynamicRecord,
  isFunction,
  isNumber,
  isString,
} from "@openbot/contracts/runtime-values";

// -- texts -----------------------------------------------------------------------------------------------------------

const en = {
  tabAgents: "Agents",
  tabNeeds: "Needs you",
  tabPhone: "Phone",
  live: "Live",
  offline: "Reconnecting…",
  back: "Back",
  loading: "Loading…",
  retry: "Try again",
  couldNotLoad: "Could not load this. {error}",
  pairTitle: "Pair this phone",
  pairIntro: "Press Pair, then approve this phone on your computer. A card appears in Needs you.",
  pairNoCode: "Open the link from the QR code on your computer, or paste it here.",
  codeLabel: "Pairing link or code",
  useCode: "Use code",
  badCode: "This is not a pairing link or code from COSGRAL.",
  deviceName: "Name of this phone",
  deviceNameMissing: "Give this phone a name.",
  defaultDevice: "My phone",
  computer: "Computer",
  fingerprint: "Certificate fingerprint",
  fingerprintHelp:
    "If your browser warned that the certificate is not trusted, open the certificate details and check that its SHA-256 fingerprint is this one. If it differs, close this page and do not pair.",
  plainWarning: "This connection is not encrypted. Pair only through a tunnel you trust.",
  pair: "Pair",
  pairWaiting: "Waiting for you to approve this phone on the computer…",
  errCodeWrong: "The pairing code is wrong. Show a new QR code on the computer.",
  errExpired: "The pairing code expired or was already used. Show a new QR code on the computer.",
  errDeclined: "The pairing was declined on the computer.",
  errBusy: "Too many attempts. Wait a minute and try again.",
  errOffline: "The computer does not answer. Check that it is on and on the same network.",
  unpaired: "This phone was removed on the computer. Pair it again with a new QR code.",
  badAnswer: "The computer sent an answer this app does not understand. Update COSGRAL on the computer.",
  agentsEmpty: "No agents yet. Create one on the computer.",
  needsEmpty: "Nothing is waiting for you.",
  needsPhone: "You can answer here",
  needsComputer: "Answer on the computer",
  computerBanner: "{n} waiting for the computer. This phone cannot answer them.",
  computerOnly: "Answer this on the computer",
  kindPrompt: "Question",
  kindApproval: "Approval",
  kindDraft: "Draft",
  kindTakeover: "Browser",
  kindVault: "Vault",
  kindPlan: "Plan",
  cardGone: "This card is no longer open.",
  answered: "Answer sent.",
  answerAll: "Answer every question first.",
  yourOwn: "Or write your own answer",
  sendAnswer: "Send answer",
  command: "Command",
  reason: "Reason",
  approve: "Approve",
  deny: "Deny",
  to: "To",
  via: "Via",
  keepDraft: "Keep draft",
  askChanges: "Ask for changes",
  changesLabel: "What should change?",
  changesMissing: "Write what should change.",
  sendChanges: "Send request",
  sendDraft: "Send",
  fileChange: "Changes to files",
  message: "Message",
  send: "Send",
  chatEmpty: "No messages yet. Say hello.",
  today: "Today",
  loadEarlier: "Load earlier messages",
  writing: "writing…",
  failed: "failed",
  interrupted: "interrupted",
  attachments: "{n} attachment(s) stay on the computer",
  sendFailed: "The message was not sent. {error}",
  phoneTitle: "This phone",
  connection: "Connection",
  encrypted: "Encrypted (HTTPS)",
  notEncrypted: "Not encrypted",
  deviceLabel: "Phone",
  theme: "Theme",
  themeSystem: "System",
  themeLight: "Light",
  themeDark: "Dark",
  forget: "Forget this phone",
  forgetSure: "Tap again to forget",
  forgetHelp:
    "Removes the saved key from this browser. To block this phone completely, also remove it on the computer (Settings → Mobile Connect).",
  onlyOnComputer: "Permissions, Computer Use, the Vault, settings and removing agents stay on the computer.",
  lockTitle: "Locked",
  lockIntro: "Enter your PIN to open COSGRAL.",
  pinLabel: "PIN",
  unlock: "Unlock",
  unlocking: "Checking…",
  wrongPin: "Wrong PIN. {n} tries left.",
  removedPhone: "Too many wrong PINs. This phone was removed. Pair it again from the computer.",
  pinBad: "The PIN is 4 to 8 digits.",
  pinTitle: "PIN lock",
  pinHelp:
    "Locks the app after 5 minutes without use and when you leave it. Five wrong PINs remove this phone: pair it again from the computer.",
  pinSet: "Set PIN",
  pinNew: "New PIN",
  pinCurrent: "Current PIN",
  pinChange: "Change PIN",
  pinRemove: "Remove PIN",
  pinIsOn: "The PIN lock is on.",
  pinSaved: "PIN saved.",
  pinRemoved: "PIN removed.",
  pushTitle: "Notifications",
  pushNotice:
    "Notifications go through your phone's system (Google or Apple), encrypted for this phone. They only say that an agent is waiting.",
  pushOn: "Turn on notifications",
  pushOff: "Turn off notifications",
  pushIsOn: "Notifications are on.",
  pushNeedsComputer: "Turn on notifications on the computer first (Settings → Mobile Connect).",
  pushUnsupported:
    "This browser cannot show notifications. On an iPhone, add this page to the home screen and open it from there.",
  pushDenied: "Notifications are blocked for this page in the phone's settings.",
  pushFailed: "Could not change notifications. {error}",
};

const pl: Record<keyof typeof en, string> = {
  tabAgents: "Agenci",
  tabNeeds: "Czeka na Ciebie",
  tabPhone: "Telefon",
  live: "Na żywo",
  offline: "Łączenie…",
  back: "Wstecz",
  loading: "Wczytywanie…",
  retry: "Spróbuj ponownie",
  couldNotLoad: "Nie udało się wczytać. {error}",
  pairTitle: "Sparuj ten telefon",
  pairIntro: "Naciśnij Sparuj, potem zatwierdź ten telefon na komputerze. Karta pojawi się w „Czeka na Ciebie”.",
  pairNoCode: "Otwórz link z kodu QR na komputerze albo wklej go tutaj.",
  codeLabel: "Link lub kod parowania",
  useCode: "Użyj kodu",
  badCode: "To nie jest link ani kod parowania z COSGRAL.",
  deviceName: "Nazwa tego telefonu",
  deviceNameMissing: "Nadaj telefonowi nazwę.",
  defaultDevice: "Mój telefon",
  computer: "Komputer",
  fingerprint: "Odcisk certyfikatu",
  fingerprintHelp:
    "Jeśli przeglądarka ostrzegła, że certyfikat nie jest zaufany, otwórz jego szczegóły i sprawdź, czy odcisk SHA-256 jest taki sam. Jeśli się różni, zamknij tę stronę i nie paruj.",
  plainWarning: "To połączenie nie jest szyfrowane. Paruj tylko przez tunel, któremu ufasz.",
  pair: "Sparuj",
  pairWaiting: "Czekam, aż zatwierdzisz ten telefon na komputerze…",
  errCodeWrong: "Kod parowania jest błędny. Pokaż nowy kod QR na komputerze.",
  errExpired: "Kod parowania wygasł albo został już użyty. Pokaż nowy kod QR na komputerze.",
  errDeclined: "Parowanie odrzucono na komputerze.",
  errBusy: "Za dużo prób. Poczekaj minutę i spróbuj ponownie.",
  errOffline: "Komputer nie odpowiada. Sprawdź, czy jest włączony i w tej samej sieci.",
  unpaired: "Ten telefon został usunięty na komputerze. Sparuj go ponownie nowym kodem QR.",
  badAnswer: "Komputer wysłał odpowiedź, której ta aplikacja nie rozumie. Zaktualizuj COSGRAL na komputerze.",
  agentsEmpty: "Brak agentów. Utwórz agenta na komputerze.",
  needsEmpty: "Nic na Ciebie nie czeka.",
  needsPhone: "Możesz odpowiedzieć tutaj",
  needsComputer: "Odpowiedz na komputerze",
  computerBanner: "{n} czeka na komputer. Ten telefon nie może na nie odpowiedzieć.",
  computerOnly: "Odpowiedz na to na komputerze",
  kindPrompt: "Pytanie",
  kindApproval: "Zatwierdzenie",
  kindDraft: "Szkic",
  kindTakeover: "Przeglądarka",
  kindVault: "Vault",
  kindPlan: "Plan",
  cardGone: "Ta karta jest już zamknięta.",
  answered: "Odpowiedź wysłana.",
  answerAll: "Najpierw odpowiedz na każde pytanie.",
  yourOwn: "Albo napisz własną odpowiedź",
  sendAnswer: "Wyślij odpowiedź",
  command: "Polecenie",
  reason: "Powód",
  approve: "Zatwierdź",
  deny: "Odrzuć",
  to: "Do",
  via: "Kanał",
  keepDraft: "Zachowaj szkic",
  askChanges: "Poproś o zmiany",
  changesLabel: "Co zmienić?",
  changesMissing: "Napisz, co zmienić.",
  sendChanges: "Wyślij prośbę",
  sendDraft: "Wyślij",
  fileChange: "Zmiany w plikach",
  message: "Wiadomość",
  send: "Wyślij",
  chatEmpty: "Brak wiadomości. Napisz pierwszą.",
  today: "Dziś",
  loadEarlier: "Wczytaj wcześniejsze wiadomości",
  writing: "pisze…",
  failed: "nie udało się",
  interrupted: "przerwane",
  attachments: "Załączniki ({n}) zostają na komputerze",
  sendFailed: "Nie wysłano wiadomości. {error}",
  phoneTitle: "Ten telefon",
  connection: "Połączenie",
  encrypted: "Szyfrowane (HTTPS)",
  notEncrypted: "Bez szyfrowania",
  deviceLabel: "Telefon",
  theme: "Motyw",
  themeSystem: "Systemowy",
  themeLight: "Jasny",
  themeDark: "Ciemny",
  forget: "Zapomnij ten telefon",
  forgetSure: "Dotknij ponownie, by zapomnieć",
  forgetHelp:
    "Usuwa zapisany klucz z tej przeglądarki. Aby całkiem zablokować ten telefon, usuń go też na komputerze (Ustawienia → Mobile Connect).",
  onlyOnComputer: "Uprawnienia, Computer Use, Vault, ustawienia i usuwanie agentów zostają na komputerze.",
  lockTitle: "Zablokowane",
  lockIntro: "Podaj PIN, aby otworzyć COSGRAL.",
  pinLabel: "PIN",
  unlock: "Odblokuj",
  unlocking: "Sprawdzanie…",
  wrongPin: "Zły PIN. Zostało prób: {n}.",
  removedPhone: "Za dużo błędnych PIN-ów. Ten telefon został usunięty. Sparuj go ponownie z komputera.",
  pinBad: "PIN ma od 4 do 8 cyfr.",
  pinTitle: "Blokada PIN-em",
  pinHelp:
    "Blokuje aplikację po 5 minutach bez użycia i gdy z niej wyjdziesz. Pięć błędnych PIN-ów usuwa ten telefon: sparuj go ponownie z komputera.",
  pinSet: "Ustaw PIN",
  pinNew: "Nowy PIN",
  pinCurrent: "Obecny PIN",
  pinChange: "Zmień PIN",
  pinRemove: "Usuń PIN",
  pinIsOn: "Blokada PIN-em jest włączona.",
  pinSaved: "PIN zapisany.",
  pinRemoved: "PIN usunięty.",
  pushTitle: "Powiadomienia",
  pushNotice:
    "Powiadomienia idą przez system telefonu (Google lub Apple), zaszyfrowane dla tego telefonu. Mówią tylko, że agent czeka.",
  pushOn: "Włącz powiadomienia",
  pushOff: "Wyłącz powiadomienia",
  pushIsOn: "Powiadomienia są włączone.",
  pushNeedsComputer: "Najpierw włącz powiadomienia na komputerze (Ustawienia → Mobile Connect).",
  pushUnsupported:
    "Ta przeglądarka nie pokaże powiadomień. Na iPhonie dodaj tę stronę do ekranu głównego i otwórz ją stamtąd.",
  pushDenied: "Powiadomienia dla tej strony są zablokowane w ustawieniach telefonu.",
  pushFailed: "Nie udało się zmienić powiadomień. {error}",
};

type Key = keyof typeof en;
const lang = (navigator.language || "en").toLowerCase().startsWith("pl") ? "pl" : "en";
document.documentElement.lang = lang;

function t(key: Key, vars: Record<string, string | number> = {}): string {
  const text = (lang === "pl" ? pl : en)[key];
  return text.replace(/\{(\w+)\}/g, (_match, name: string) => String(vars[name] ?? ""));
}

// -- types of the phone API (see packages/contracts/src/ipc-mobile.ts) -----------------------------------------------

interface Agent {
  id: string;
  name: string;
  role: string;
  avatarHue: number | null;
}

interface Thread {
  botId: string;
  preview: string;
  updatedAt: string | null;
}

interface Message {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  status: string;
  itemType: string | null;
  attachments: number;
}

interface Need {
  id: string;
  botId: string;
  kind: string;
  title: string;
  createdAt: string | null;
  answerOn?: string;
  computerReason?: string | null;
}

type Detail =
  | { kind: "prompt"; questions: Array<{ id: string; header: string; question: string; options: string[] | null }> }
  | { kind: "approval"; approvalKind: string; command: string | null; reason: string | null }
  | { kind: "draft-preview"; variant: string; recipient: string | null; channel: string | null; preview: string }
  | { kind: "browser-takeover" | "vault-request" | "plan" };

type StreamEvent =
  | { type: "needs-you"; items: Need[] }
  | { type: "conversation"; botId: string }
  | { type: "agents"; agents: Agent[] };

interface Session {
  token: string;
  deviceName: string;
  fingerprint: string | null;
}

/** GET /v1/session (see PhoneSessionState in the contract). */
interface Access {
  pinSet: boolean;
  locked: boolean;
  attemptsLeft: number | null;
  idleLockSeconds: number;
  push: { available: boolean; subscribed: boolean };
}

interface PairingCode {
  ticket: string;
  fingerprint: string | null;
}

interface MessagePage {
  messages: Message[];
  nextBefore: string | null;
}

/** What an answer of the computer must look like; anything else is refused where it enters (see `api`). */
type Guard<T> = (value: unknown) => value is T;

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isListOf<T>(value: unknown, guard: Guard<T>): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

function isAgent(value: unknown): value is Agent {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.role) &&
    (value.avatarHue === null || isNumber(value.avatarHue))
  );
}

function isThread(value: unknown): value is Thread {
  return (
    isDynamicRecord(value) && isString(value.botId) && isString(value.preview) && isNullableString(value.updatedAt)
  );
}

function isMessage(value: unknown): value is Message {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.author) &&
    isString(value.text) &&
    isString(value.createdAt) &&
    isString(value.status) &&
    isNullableString(value.itemType) &&
    isNumber(value.attachments)
  );
}

function isNeed(value: unknown): value is Need {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.botId) &&
    isString(value.kind) &&
    isString(value.title) &&
    isNullableString(value.createdAt) &&
    (value.answerOn === undefined || isString(value.answerOn)) &&
    (value.computerReason === undefined || isNullableString(value.computerReason))
  );
}

function isQuestion(value: unknown): value is Extract<Detail, { kind: "prompt" }>["questions"][number] {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.header) &&
    isString(value.question) &&
    (value.options === null || isListOf(value.options, isString))
  );
}

function isDetail(value: unknown): value is Detail {
  if (!isDynamicRecord(value)) return false;
  switch (value.kind) {
    case "prompt":
      return isListOf(value.questions, isQuestion);
    case "approval":
      return isString(value.approvalKind) && isNullableString(value.command) && isNullableString(value.reason);
    case "draft-preview":
      return (
        isString(value.variant) &&
        isNullableString(value.recipient) &&
        isNullableString(value.channel) &&
        isString(value.preview)
      );
    case "browser-takeover":
    case "vault-request":
    case "plan":
      return true;
    default:
      return false;
  }
}

function isStreamEvent(value: unknown): value is StreamEvent {
  if (!isDynamicRecord(value)) return false;
  if (value.type === "needs-you") return isListOf(value.items, isNeed);
  if (value.type === "agents") return isListOf(value.agents, isAgent);
  return value.type === "conversation" && isString(value.botId);
}

function isMessagePage(value: unknown): value is MessagePage {
  return isDynamicRecord(value) && isListOf(value.messages, isMessage) && isNullableString(value.nextBefore);
}

function isAgentsAnswer(value: unknown): value is { agents: Agent[] } {
  return isDynamicRecord(value) && isListOf(value.agents, isAgent);
}

function isThreadsAnswer(value: unknown): value is { threads: Thread[] } {
  return isDynamicRecord(value) && isListOf(value.threads, isThread);
}

function isNeedsAnswer(value: unknown): value is { items: Need[] } {
  return isDynamicRecord(value) && isListOf(value.items, isNeed);
}

function isAccess(value: unknown): value is Access {
  return (
    isDynamicRecord(value) &&
    isBoolean(value.pinSet) &&
    isBoolean(value.locked) &&
    (value.attemptsLeft === null || isNumber(value.attemptsLeft)) &&
    isNumber(value.idleLockSeconds) &&
    isDynamicRecord(value.push) &&
    isBoolean(value.push.available) &&
    isBoolean(value.push.subscribed)
  );
}

function isPushKeyAnswer(value: unknown): value is { publicKey: string } {
  return isDynamicRecord(value) && isString(value.publicKey) && /^[A-Za-z0-9_-]{20,200}$/.test(value.publicKey);
}

function isAnyAnswer(value: unknown): value is DynamicRecord {
  return isDynamicRecord(value);
}

function isPairAnswer(value: unknown): value is { token: string } {
  return isDynamicRecord(value) && isString(value.token);
}

// -- small helpers ---------------------------------------------------------------------------------------------------

const lifecycle = new AbortController();
window.addEventListener("cosgral-app-stop", () => lifecycle.abort(), { once: true });
const listen = { signal: lifecycle.signal } as const;

const rootElement = document.getElementById("app");
if (!rootElement) throw new Error("The page has no #app.");
const root: HTMLElement = rootElement;

type Child = Node | string | number | null | false | undefined;
type Props = Record<string, string | number | boolean | null | undefined | ((event: Event) => void)>;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (isFunction(value)) element.addEventListener(name.slice(2), value);
    else if (name === "class") element.className = String(value);
    else element.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of children) {
    if (child === null || child === false || child === undefined) continue;
    element.append(isNumber(child) ? String(child) : child);
  }
  return element;
}

const SVG = "http://www.w3.org/2000/svg";
const ICONS = {
  back: "M15 5l-7 7 7 7",
  send: "M12 19V5M5 12l7-7 7 7",
  agents:
    "M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-3A3.5 3.5 0 0 0 6 17.5V19M11 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 19v-1a3 3 0 0 0-2-2.8M15 5.2a3 3 0 0 1 0 5.6",
  bell: "M6 17h12l-1.5-2V11a4.5 4.5 0 0 0-9 0v4L6 17zM10 20a2 2 0 0 0 4 0",
  phone: "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2",
  monitor: "M4 5h16v11H4zM9 20h6M12 16v4",
  question: "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01",
  shield: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3zM9 12l2 2 4-4",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  alert: "M12 4l9 16H3zM12 10v4M12 17h.01",
} as const;

function icon(name: keyof typeof ICONS): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", ICONS[name]);
  svg.append(path);
  return svg;
}

function mark(): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("class", "mark");
  svg.setAttribute("aria-hidden", "true");
  const square = document.createElementNS(SVG, "rect");
  for (const [name, value] of Object.entries({ width: "64", height: "64", rx: "14", fill: "#6960f1" })) {
    square.setAttribute(name, value);
  }
  const letter = document.createElementNS(SVG, "path");
  for (const [name, value] of Object.entries({
    d: "M44 22.5A15.5 15.5 0 1 0 44 41.5",
    fill: "none",
    stroke: "#ffffff",
    "stroke-width": "7",
    "stroke-linecap": "round",
  })) {
    letter.setAttribute(name, value);
  }
  svg.append(square, letter);
  return svg;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });

function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function shortTime(iso: string | null): string {
  const date = parseDate(iso);
  if (!date) return "";
  return sameDay(date, new Date()) ? timeFormat.format(date) : dayFormat.format(date);
}

function formatFingerprint(hex: string): string {
  return (hex.toUpperCase().match(/../g) ?? []).join(":");
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

function toast(message: string): void {
  document.querySelector(".toast")?.remove();
  const element = h("div", { class: "toast", role: "status" }, message);
  document.body.append(element);
  setTimeout(() => element.remove(), 3_500);
}

// -- state -----------------------------------------------------------------------------------------------------------

const SESSION_KEY = "cosgral.phone.v1";
const THEME_KEY = "cosgral.theme";
const TICKET = /^[A-Za-z0-9_-]{22,64}$/;
const PIN_FORMAT = /^[0-9]{4,8}$/;

function loadSession(): Session | null {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
    if (isDynamicRecord(value) && isString(value.token) && isString(value.deviceName)) {
      return {
        token: value.token,
        deviceName: value.deviceName,
        fingerprint: isString(value.fingerprint) ? value.fingerprint : null,
      };
    }
  } catch {
    // A broken saved value is the same as none.
  }
  return null;
}

interface AppState {
  session: Session | null;
  code: PairingCode | null;
  notice: string | null;
  agents: Agent[];
  threads: Map<string, Thread>;
  needs: Need[];
  unread: Set<string>;
  live: boolean;
  agentsLoaded: boolean;
  /** The PIN lock and push of this phone, as the computer last said (null: an older computer without them). */
  access: Access | null;
  /** The lock screen is up: no data of the computer is kept or shown. */
  locked: boolean;
}

const state: AppState = {
  session: loadSession(),
  code: null,
  notice: null,
  agents: [],
  threads: new Map(),
  needs: [],
  unread: new Set(),
  live: false,
  agentsLoaded: false,
  access: null,
  locked: false,
};

interface Screen {
  element: HTMLElement;
  tab?: "agents" | "needs" | "phone";
  /** The agent whose chat is open. */
  chatBotId?: string;
  onNeeds?: () => void;
  onAgents?: () => void;
  onConversation?: (botId: string) => void;
  dispose?: () => void;
}

let current: Screen | null = null;

// -- the phone API ---------------------------------------------------------------------------------------------------

class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly attemptsLeft: number | null;
  constructor(status: number, message: string, code: string | null = null, attemptsLeft: number | null = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.attemptsLeft = attemptsLeft;
  }
}

interface ApiInit {
  method?: string;
  body?: Answer | SendBody | PairBody | PinBody | PushBody;
  auth?: boolean;
}

interface PinBody {
  pin?: string;
  currentPin?: string;
}

interface PushBody {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
}

interface SendBody {
  text: string;
}

interface PairBody {
  ticket: string;
  deviceName: string;
  platform: string;
}

/** An answer to a Needs you card (see MobileAnswerRequest in the contract). */
type Answer =
  | { kind: "prompt"; answers: Record<string, string[]> }
  | { kind: "approval"; decision: "accept" | "decline" }
  | { kind: "draft-preview"; decision: "send" | "keep-draft" }
  | { kind: "draft-preview"; decision: "edit"; feedback: string };

async function api<T>(path: string, guard: Guard<T>, init: ApiInit = {}): Promise<T> {
  const session = init.auth === false ? null : state.session;
  const response = await fetch(path, {
    method: init.method ?? "GET",
    headers: {
      ...(session ? { authorization: `Bearer ${session.token}` } : {}),
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // No JSON body.
  }
  if (!response.ok) {
    const code = isDynamicRecord(json) && isString(json.code) ? json.code : null;
    const left = isDynamicRecord(json) && isNumber(json.attemptsLeft) ? json.attemptsLeft : null;
    // The computer says the PIN is needed (locked after a while, or this page was not told): show the lock screen.
    if (response.status === 423 && session) showLock();
    // A wrong PIN is also a 401; only an unknown token (no code) means this phone was removed.
    else if (response.status === 401 && session && code === null) unpair(t("unpaired"));
    throw new ApiError(
      response.status,
      isDynamicRecord(json) && isString(json.error) ? json.error : `HTTP ${response.status}`,
      code,
      left,
    );
  }
  if (!guard(json)) throw new ApiError(502, t("badAnswer"));
  return json;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadAgents(): Promise<void> {
  const [agents, threads] = await Promise.all([api("/v1/agents", isAgentsAnswer), api("/v1/threads", isThreadsAnswer)]);
  state.agents = agents.agents;
  state.threads = new Map(threads.threads.map((thread) => [thread.botId, thread]));
  state.agentsLoaded = true;
  current?.onAgents?.();
}

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
/** Agent previews change with every message; one refresh after a burst of events is enough. */
function refreshAgentsSoon(): void {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void loadAgents().catch(() => undefined), 800);
}

async function loadNeeds(): Promise<void> {
  const result = await api("/v1/needs-you", isNeedsAnswer);
  setNeeds(result.items);
}

function setNeeds(items: Need[]): void {
  state.needs = items;
  document.title = items.length ? `(${items.length}) COSGRAL` : "COSGRAL";
  updateBadge();
  current?.onNeeds?.();
}

// -- the event stream ------------------------------------------------------------------------------------------------

let streamRun = 0;
let streamController: AbortController | null = null;
let lastEventId: string | null = null;
let wake: (() => void) | null = null;

function parseStream(buffer: string): { events: StreamEvent[]; rest: string; lastId: string | null } {
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: StreamEvent[] = [];
  let lastId: string | null = null;
  for (const block of blocks) {
    const lines = block.split("\n");
    const id = lines.find((line) => line.startsWith("id: "))?.slice(4);
    if (id !== undefined) lastId = id;
    const data = lines
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice(6))
      .join("\n");
    if (!data) continue;
    try {
      const event = JSON.parse(data);
      if (isStreamEvent(event)) events.push(event);
    } catch {
      // Not an event of this protocol.
    }
  }
  return { events, rest, lastId };
}

function setLive(live: boolean): void {
  state.live = live;
  root.dataset.live = String(live);
  for (const label of root.querySelectorAll(".live")) label.textContent = live ? t("live") : t("offline");
}

function handleEvent(event: StreamEvent): void {
  if (event.type === "needs-you") {
    setNeeds(event.items);
  } else if (event.type === "agents") {
    state.agents = event.agents;
    current?.onAgents?.();
  } else {
    if (current?.chatBotId !== event.botId) state.unread.add(event.botId);
    current?.onConversation?.(event.botId);
    refreshAgentsSoon();
  }
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      wake = null;
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    wake = done;
    signal.addEventListener("abort", done, { once: true });
  });
}

async function followStream(run: number, controller: AbortController): Promise<void> {
  let delay = 500;
  while (run === streamRun) {
    try {
      const session = state.session;
      if (!session) return;
      const response = await fetch("/v1/events", {
        headers: { authorization: `Bearer ${session.token}`, ...(lastEventId ? { "last-event-id": lastEventId } : {}) },
        signal: controller.signal,
      });
      if (response.status === 401) {
        unpair(t("unpaired"));
        return;
      }
      if (response.status === 423) {
        showLock();
        return;
      }
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      setLive(true);
      delay = 500;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const parsed = parseStream(buffer);
        buffer = parsed.rest;
        if (run !== streamRun) return;
        for (const event of parsed.events) handleEvent(event);
        if (parsed.lastId) lastEventId = parsed.lastId;
      }
    } catch {
      // Offline, asleep or stopped: try again below.
    }
    if (run !== streamRun) return;
    setLive(false);
    await pause(delay, controller.signal);
    delay = Math.min(delay * 2, 15_000);
  }
}

function startStream(): void {
  stopStream();
  const run = streamRun;
  const controller = new AbortController();
  streamController = controller;
  void followStream(run, controller);
}

function stopStream(): void {
  streamRun += 1;
  streamController?.abort();
  streamController = null;
  lastEventId = null;
  setLive(false);
}

lifecycle.signal.addEventListener("abort", stopStream, { once: true });

// -- pairing ---------------------------------------------------------------------------------------------------------

/** The ticket (and certificate fingerprint) in a pairing link, a `cosgral://pair` code, a `#v=1&t=…` fragment or a bare ticket. */
function parseCode(input: string): PairingCode | null {
  const text = input.trim();
  if (TICKET.test(text)) return { ticket: text, fingerprint: null };
  let query = "";
  if (text.startsWith("#")) {
    query = text.slice(1);
  } else {
    try {
      const url = new URL(text);
      query = url.protocol === "cosgral:" ? url.search.slice(1) : url.hash.slice(1);
    } catch {
      return null;
    }
  }
  const params = new URLSearchParams(query);
  const ticket = params.get("t") ?? "";
  if (!TICKET.test(ticket)) return null;
  const fingerprint = params.get("f");
  return { ticket, fingerprint: fingerprint && /^[0-9a-f]{64}$/.test(fingerprint) ? fingerprint : null };
}

function platformName(): "android" | "ios" | "windows" | "macos" | "web" {
  const agent = navigator.userAgent;
  if (/android/i.test(agent)) return "android";
  if (/iphone|ipad/i.test(agent)) return "ios";
  if (/windows/i.test(agent)) return "windows";
  if (/mac/i.test(agent)) return "macos";
  return "web";
}

function defaultDeviceName(): string {
  const platform = platformName();
  if (platform === "android") return lang === "pl" ? "Telefon z Androidem" : "Android phone";
  if (platform === "ios") return "iPhone";
  return t("defaultDevice");
}

function pairError(error: unknown): string {
  if (!(error instanceof ApiError)) return t("errOffline");
  if (error.status === 401) return t("errCodeWrong");
  if (error.status === 410) return t("errExpired");
  if (error.status === 403) return t("errDeclined");
  if (error.status === 429) return t("errBusy");
  return error.message;
}

function pairScreen(): Screen {
  const code = state.code;
  const errorBox = h("p", { class: "error", "data-error": true, hidden: true });
  const fail = (message: string) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
  };
  const body = h("div", { class: "body pair" }, mark(), h("h1", {}, t("pairTitle")));
  if (state.notice) body.append(h("p", { class: "banner danger", "data-notice": true }, icon("alert"), state.notice));
  if (!code) {
    const field = h("input", {
      class: "field",
      name: "code",
      autocomplete: "off",
      autocapitalize: "off",
      spellcheck: "false",
    });
    const use = () => {
      const parsed = parseCode(field.value);
      if (!parsed) return fail(t("badCode"));
      state.code = parsed;
      state.notice = null;
      render();
    };
    body.append(
      h("p", { class: "hint" }, t("pairNoCode")),
      h("div", {}, h("label", { class: "field-label", for: "code" }, t("codeLabel")), field),
      errorBox,
      h("button", { class: "btn primary", type: "button", "data-action": "use-code", onclick: use }, t("useCode")),
    );
    field.id = "code";
    return { element: h("section", { class: "screen", "data-screen": "pair" }, body) };
  }
  const nameField = h("input", {
    class: "field",
    id: "device-name",
    name: "device-name",
    maxlength: 64,
    value: defaultDeviceName(),
  });
  const waiting = h("p", { class: "waiting", hidden: true }, h("span", { class: "spinner" }), t("pairWaiting"));
  const button = h("button", { class: "btn primary", type: "button", "data-action": "pair" }, t("pair"));
  button.addEventListener("click", () => {
    const name = nameField.value.trim();
    errorBox.hidden = true;
    if (!name) return fail(t("deviceNameMissing"));
    button.disabled = true;
    nameField.disabled = true;
    waiting.hidden = false;
    api("/v1/pair", isPairAnswer, {
      method: "POST",
      auth: false,
      body: { ticket: code.ticket, deviceName: name, platform: platformName() },
    })
      .then((result) => {
        state.session = { token: result.token, deviceName: name, fingerprint: code.fingerprint };
        localStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
        state.code = null;
        state.notice = null;
        history.replaceState(null, "", "#/agents");
        return startSession();
      })
      .catch((error: unknown) => {
        button.disabled = false;
        nameField.disabled = false;
        waiting.hidden = true;
        fail(pairError(error));
      });
  });
  body.append(
    h("p", { class: "hint" }, t("pairIntro")),
    h("dl", { class: "facts" }, h("dt", {}, t("computer")), h("dd", {}, location.host)),
  );
  if (code.fingerprint) {
    body.append(
      h(
        "div",
        {},
        h("span", { class: "field-label" }, t("fingerprint")),
        h("code", { class: "fingerprint", "data-fingerprint": true }, formatFingerprint(code.fingerprint)),
      ),
      h("p", { class: "hint" }, t("fingerprintHelp")),
    );
  }
  if (location.protocol === "http:" && !isLoopbackHost(location.hostname)) {
    body.append(h("p", { class: "banner danger", "data-plain-warning": true }, icon("alert"), t("plainWarning")));
  }
  body.append(
    h("div", {}, h("label", { class: "field-label", for: "device-name" }, t("deviceName")), nameField),
    errorBox,
    waiting,
    button,
  );
  return { element: h("section", { class: "screen", "data-screen": "pair" }, body) };
}

function unpair(notice: string | null): void {
  localStorage.removeItem(SESSION_KEY);
  state.session = null;
  state.code = null;
  state.notice = notice;
  state.agentsLoaded = false;
  state.agents = [];
  state.threads = new Map();
  state.unread.clear();
  state.access = null;
  state.locked = false;
  clearTimeout(idleTimer);
  stopStream();
  setNeeds([]);
  history.replaceState(null, "", location.pathname);
  render();
}

/** A page that was just opened asks for the PIN even when the computer has not locked yet (the page was closed or killed). */
let freshPage = true;

async function startSession(): Promise<void> {
  // Whether this phone has a PIN and is locked. An older computer without it answers 404: no lock then.
  const access = await api("/v1/session", isAccess).catch(() => null);
  state.access = access;
  state.locked = access?.locked === true;
  if (freshPage && access?.pinSet && !state.locked) {
    freshPage = false;
    lockNow();
    return;
  }
  freshPage = false;
  if (state.locked) {
    render();
    return;
  }
  noteActivity();
  void syncPush();
  await loadAgents().catch(() => undefined);
  startStream();
  render();
  await loadNeeds().catch(() => undefined);
}

// -- the PIN lock ------------------------------------------------------------------------------------------------------
// With a PIN, the app shows nothing of the computer until it is given: it locks after the idle time, when the page goes to
// the background, and when the computer says so (423). The computer enforces it too: a locked phone gets no data from it.

let idleTimer: ReturnType<typeof setTimeout> | undefined;
let lastPing = 0;

/** The person touched the app: the idle time starts again, and now and then the computer is told so it does not lock first. */
function noteActivity(): void {
  const access = state.access;
  if (!state.session || state.locked || !access?.pinSet) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(lockNow, Math.max(10, access.idleLockSeconds) * 1000);
  const now = Date.now();
  if (now - lastPing > 60_000) {
    lastPing = now;
    void api("/v1/me", isAnyAnswer).catch(() => undefined);
  }
}

/** Locks this page at once and tells the computer. */
function lockNow(): void {
  const session = state.session;
  if (!session || state.locked || !state.access?.pinSet) return;
  void fetch("/v1/lock", {
    method: "POST",
    headers: { authorization: `Bearer ${session.token}` },
    keepalive: true,
  }).catch(() => undefined);
  showLock();
}

/** The lock screen: what was loaded is thrown away first. */
function showLock(): void {
  clearTimeout(idleTimer);
  clearTimeout(refreshTimer);
  state.locked = true;
  state.access = state.access ? { ...state.access, pinSet: true, locked: true } : null;
  state.agents = [];
  state.threads = new Map();
  state.unread.clear();
  state.agentsLoaded = false;
  stopStream();
  setNeeds([]);
  render();
}

function lockScreen(): Screen {
  const errorBox = h("p", { class: "error", "data-error": true, hidden: true });
  const field = h("input", {
    class: "field pin",
    id: "pin",
    name: "pin",
    type: "password",
    inputmode: "numeric",
    pattern: "[0-9]*",
    maxlength: 8,
    autocomplete: "off",
    "aria-label": t("pinLabel"),
  });
  const button = h("button", { class: "btn primary", type: "button", "data-action": "unlock" }, t("unlock"));
  const fail = (message: string) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
  };
  const submit = () => {
    errorBox.hidden = true;
    if (!PIN_FORMAT.test(field.value)) return fail(t("pinBad"));
    button.disabled = true;
    button.textContent = t("unlocking");
    api("/v1/pin/unlock", isAnyAnswer, { method: "POST", body: { pin: field.value } })
      .then(() => {
        field.value = "";
        state.locked = false;
        return startSession();
      })
      .catch((error: unknown) => {
        field.value = "";
        button.disabled = false;
        button.textContent = t("unlock");
        if (error instanceof ApiError && error.code === "removed") return unpair(t("removedPhone"));
        if (error instanceof ApiError && error.code === "wrong-pin") {
          if (state.access) state.access = { ...state.access, attemptsLeft: error.attemptsLeft };
          return fail(t("wrongPin", { n: error.attemptsLeft ?? 0 }));
        }
        fail(errorText(error));
      });
  };
  field.addEventListener("keydown", (event) => {
    if (event instanceof KeyboardEvent && event.key === "Enter") submit();
  });
  button.addEventListener("click", submit);
  const left = state.access?.attemptsLeft;
  return {
    element: h(
      "section",
      { class: "screen", "data-screen": "lock" },
      h(
        "div",
        { class: "body pair" },
        mark(),
        h("h1", {}, t("lockTitle")),
        h("p", { class: "hint" }, t("lockIntro")),
        left !== null && left !== undefined && left < 5 ? h("p", { class: "hint" }, t("wrongPin", { n: left })) : null,
        h("div", {}, h("label", { class: "field-label", for: "pin" }, t("pinLabel")), field),
        errorBox,
        button,
      ),
    ),
  };
}

// -- shell -----------------------------------------------------------------------------------------------------------

type Route =
  | { name: "agents" }
  | { name: "needs" }
  | { name: "need"; id: string }
  | { name: "chat"; botId: string }
  | { name: "phone" };

function parseRoute(): Route {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  try {
    if (parts[0] === "needs" && parts[1]) return { name: "need", id: decodeURIComponent(parts[1]) };
    if (parts[0] === "needs") return { name: "needs" };
    if (parts[0] === "chat" && parts[1]) return { name: "chat", botId: decodeURIComponent(parts[1]) };
    if (parts[0] === "phone") return { name: "phone" };
  } catch {
    // A broken address falls back to the list of agents.
  }
  return { name: "agents" };
}

function navigate(hash: string): void {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function bar(title: string, options: { back?: string; sub?: string; live?: boolean } = {}): HTMLElement {
  return h(
    "header",
    { class: "bar" },
    options.back
      ? h(
          "button",
          {
            class: "icon-button",
            type: "button",
            "aria-label": t("back"),
            "data-action": "back",
            onclick: () => navigate(options.back ?? "#/agents"),
          },
          icon("back"),
        )
      : null,
    h("h1", {}, title, options.sub ? h("span", { class: "sub" }, options.sub) : null),
    options.live === false ? null : h("span", { class: "live" }, state.live ? t("live") : t("offline")),
  );
}

function tabs(active: "agents" | "needs" | "phone"): HTMLElement {
  const items: Array<[typeof active, Key, keyof typeof ICONS]> = [
    ["agents", "tabAgents", "agents"],
    ["needs", "tabNeeds", "bell"],
    ["phone", "tabPhone", "phone"],
  ];
  return h(
    "nav",
    { class: "tabs" },
    ...items.map(([name, label, glyph]) =>
      h(
        "button",
        {
          type: "button",
          "data-tab": name,
          "aria-current": name === active ? "page" : null,
          onclick: () => navigate(`#/${name}`),
        },
        icon(glyph),
        t(label),
        name === "needs" && state.needs.length ? h("span", { class: "badge" }, state.needs.length) : null,
      ),
    ),
  );
}

function updateBadge(): void {
  const button = root.querySelector('nav [data-tab="needs"]');
  if (!button) return;
  button.querySelector(".badge")?.remove();
  if (state.needs.length) button.append(h("span", { class: "badge" }, state.needs.length));
}

function render(): void {
  current?.dispose?.();
  current = null;
  let screen: Screen;
  if (!state.session || state.code) {
    screen = pairScreen();
  } else if (state.locked) {
    screen = lockScreen();
  } else {
    const route = parseRoute();
    screen =
      route.name === "chat"
        ? chatScreen(route.botId)
        : route.name === "need"
          ? needScreen(route.id)
          : route.name === "needs"
            ? needsScreen()
            : route.name === "phone"
              ? phoneScreen()
              : agentsScreen();
  }
  current = screen;
  root.replaceChildren(screen.element, ...(screen.tab ? [tabs(screen.tab)] : []));
}

function empty(glyph: keyof typeof ICONS, message: string): HTMLElement {
  return h("div", { class: "empty" }, icon(glyph), h("p", {}, message));
}

function avatar(agent: Agent | undefined, fallback: string): HTMLElement {
  const element = h(
    "span",
    { class: "avatar", "aria-hidden": "true" },
    (agent?.name ?? fallback).trim().charAt(0).toUpperCase() || "?",
  );
  element.style.setProperty("--hue", String(agent?.avatarHue ?? 245));
  return element;
}

// -- agents ----------------------------------------------------------------------------------------------------------

function agentsScreen(): Screen {
  const host = h("div", { class: "screen-body" });
  const paint = () => {
    host.replaceChildren(
      !state.agentsLoaded
        ? h("p", { class: "hint body" }, t("loading"))
        : state.agents.length
          ? h(
              "ul",
              { class: "list" },
              ...state.agents.map((agent) => {
                const thread = state.threads.get(agent.id);
                return h(
                  "li",
                  {},
                  h(
                    "button",
                    {
                      class: "row",
                      type: "button",
                      "data-agent": agent.id,
                      onclick: () => navigate(`#/chat/${encodeURIComponent(agent.id)}`),
                    },
                    avatar(agent, agent.name),
                    h(
                      "span",
                      { class: "main" },
                      h("span", { class: "title" }, agent.name),
                      h("span", { class: "note" }, thread?.preview || agent.role),
                    ),
                    h(
                      "span",
                      { class: "side" },
                      shortTime(thread?.updatedAt ?? null),
                      state.unread.has(agent.id) ? h("span", { class: "dot", "aria-hidden": "true" }) : null,
                    ),
                  ),
                );
              }),
            )
          : empty("agents", t("agentsEmpty")),
    );
  };
  paint();
  return {
    element: h("section", { class: "screen", "data-screen": "agents" }, bar(t("tabAgents")), host),
    tab: "agents",
    onAgents: paint,
    onConversation: paint,
  };
}

// -- chat ------------------------------------------------------------------------------------------------------------

function chatScreen(botId: string): Screen {
  state.unread.delete(botId);
  const agent = state.agents.find((item) => item.id === botId);
  const scroller = h("div", { class: "chat-scroll", role: "log", "aria-live": "polite" });
  let messages: Message[] = [];
  let nextBefore: string | null = null;
  let loaded = false;
  let loadingEarlier = false;
  let failure: string | null = null;

  const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 96;

  const paint = (anchor: "bottom" | "keep" | "top-offset" = "keep") => {
    const stick = anchor === "bottom" || nearBottom();
    const before = scroller.scrollHeight;
    const parts: Node[] = [];
    if (nextBefore) {
      const earlier = h("button", { class: "btn earlier", type: "button", "data-action": "earlier" }, t("loadEarlier"));
      earlier.disabled = loadingEarlier;
      earlier.addEventListener("click", () => void loadEarlier());
      parts.push(earlier);
    }
    if (!loaded) parts.push(h("p", { class: "hint", "data-loading": true }, failure ?? t("loading")));
    else if (!messages.length) parts.push(h("p", { class: "hint", "data-empty": true }, t("chatEmpty")));
    let day = "";
    for (const message of messages) {
      const date = parseDate(message.createdAt);
      const label = date ? dayFormat.format(date) : "";
      if (label && label !== day) {
        day = label;
        parts.push(h("div", { class: "day" }, date && sameDay(date, new Date()) ? t("today") : label));
      }
      parts.push(messageElement(message));
    }
    scroller.replaceChildren(...parts);
    if (anchor === "top-offset") scroller.scrollTop += scroller.scrollHeight - before;
    else if (stick) scroller.scrollTop = scroller.scrollHeight;
  };

  const merge = (page: { messages: Message[]; nextBefore: string | null }) => {
    const known = new Map(messages.map((message) => [message.id, message]));
    const overlaps = page.messages.some((message) => known.has(message.id));
    if (!loaded || (messages.length && !overlaps && page.messages.length)) {
      messages = page.messages;
      nextBefore = page.nextBefore;
      return;
    }
    for (const message of page.messages) {
      const index = messages.findIndex((item) => item.id === message.id);
      if (index >= 0) messages[index] = message;
      else messages.push(message);
    }
  };

  const loadNewest = async () => {
    try {
      const page = await api(`/v1/agents/${encodeURIComponent(botId)}/messages?limit=30`, isMessagePage);
      const first = !loaded;
      merge(page);
      loaded = true;
      failure = null;
      paint(first ? "bottom" : "keep");
    } catch (error) {
      if (!loaded) {
        failure = t("couldNotLoad", { error: errorText(error) });
        paint();
      }
    }
  };

  const loadEarlier = async () => {
    if (!nextBefore || loadingEarlier) return;
    loadingEarlier = true;
    paint("keep");
    try {
      const page = await api(
        `/v1/agents/${encodeURIComponent(botId)}/messages?limit=30&before=${encodeURIComponent(nextBefore)}`,
        isMessagePage,
      );
      const known = new Set(messages.map((message) => message.id));
      messages = [...page.messages.filter((message) => !known.has(message.id)), ...messages];
      nextBefore = page.nextBefore;
    } catch (error) {
      toast(t("couldNotLoad", { error: errorText(error) }));
    }
    loadingEarlier = false;
    paint("top-offset");
  };

  const input = h("textarea", {
    name: "message",
    rows: 1,
    placeholder: t("message"),
    "aria-label": t("message"),
    enterkeyhint: "send",
  });
  const sendButton = h(
    "button",
    { class: "send", type: "button", "data-action": "send", "aria-label": t("send") },
    icon("send"),
  );
  sendButton.disabled = true;
  let sending = false;
  const sync = () => {
    input.style.setProperty("height", "auto");
    input.style.setProperty("height", `${Math.min(input.scrollHeight, 148)}px`);
    sendButton.disabled = sending || !input.value.trim();
  };
  const send = async () => {
    const text = input.value.trim();
    if (!text || sending) return;
    sending = true;
    sync();
    try {
      await api(`/v1/agents/${encodeURIComponent(botId)}/messages`, isDynamicRecord, {
        method: "POST",
        body: { text },
      });
      input.value = "";
      sending = false;
      sync();
      await loadNewest();
      scroller.scrollTop = scroller.scrollHeight;
    } catch (error) {
      sending = false;
      sync();
      toast(t("sendFailed", { error: errorText(error) }));
    }
  };
  input.addEventListener("input", sync);
  input.addEventListener("keydown", (event) => {
    const hardware = window.matchMedia?.("(pointer: fine)").matches ?? false;
    if (event.key === "Enter" && !event.shiftKey && hardware) {
      event.preventDefault();
      void send();
    }
  });
  sendButton.addEventListener("click", () => void send());

  paint();
  void loadNewest();
  return {
    element: h(
      "section",
      { class: "screen chat", "data-screen": "chat" },
      bar(agent?.name ?? "…", { back: "#/agents", ...(agent?.role ? { sub: agent.role } : {}) }),
      scroller,
      h("div", { class: "composer" }, input, sendButton),
    ),
    chatBotId: botId,
    onConversation: (id) => {
      if (id === botId) void loadNewest();
    },
  };
}

function messageElement(message: Message): HTMLElement {
  const stateLabel =
    message.status === "streaming"
      ? t("writing")
      : message.status === "failed"
        ? t("failed")
        : message.status === "interrupted"
          ? t("interrupted")
          : "";
  const date = parseDate(message.createdAt);
  return h(
    "div",
    {
      class: "msg",
      "data-author": message.author,
      "data-status": message.status,
      "data-step": message.itemType ? "true" : null,
    },
    message.text ? document.createTextNode(message.text) : null,
    message.attachments ? h("span", { class: "meta" }, t("attachments", { n: message.attachments })) : null,
    h(
      "span",
      { class: "meta" },
      date ? timeFormat.format(date) : "",
      stateLabel ? " · " : null,
      stateLabel ? h("span", { class: "state" }, stateLabel) : null,
    ),
  );
}

// -- Needs you -------------------------------------------------------------------------------------------------------

const KIND_GLYPH: Record<string, keyof typeof ICONS> = {
  prompt: "question",
  approval: "shield",
  "draft-preview": "mail",
  "browser-takeover": "globe",
  "vault-request": "lock",
  plan: "shield",
};

function kindLabel(kind: string): string {
  switch (kind) {
    case "prompt":
      return t("kindPrompt");
    case "approval":
      return t("kindApproval");
    case "draft-preview":
      return t("kindDraft");
    case "browser-takeover":
      return t("kindTakeover");
    case "plan":
      return t("kindPlan");
    default:
      return t("kindVault");
  }
}

function needsScreen(): Screen {
  const host = h("div", { class: "screen-body" });
  const row = (need: Need) => {
    const place = need.answerOn === "computer" ? "computer" : "phone";
    const agent = state.agents.find((item) => item.id === need.botId);
    return h(
      "li",
      {},
      h(
        "button",
        {
          class: "row need",
          type: "button",
          "data-need": need.id,
          "data-place": place,
          onclick: () => navigate(`#/needs/${encodeURIComponent(need.id)}`),
        },
        h("span", { class: "glyph" }, icon(place === "computer" ? "monitor" : (KIND_GLYPH[need.kind] ?? "bell"))),
        h(
          "span",
          { class: "main" },
          h("span", { class: "title" }, need.title),
          h("span", { class: "note" }, [agent?.name, kindLabel(need.kind)].filter(Boolean).join(" · ")),
        ),
        h("span", { class: "side" }, shortTime(need.createdAt)),
      ),
    );
  };
  const paint = () => {
    const onPhone = state.needs.filter((need) => need.answerOn !== "computer");
    const onComputer = state.needs.filter((need) => need.answerOn === "computer");
    const parts: Node[] = [];
    if (onComputer.length) {
      parts.push(
        h(
          "p",
          { class: "banner", "data-computer-banner": true },
          icon("monitor"),
          t("computerBanner", { n: onComputer.length }),
        ),
      );
    }
    if (onPhone.length)
      parts.push(h("h2", { class: "group-title" }, t("needsPhone")), h("ul", { class: "list" }, ...onPhone.map(row)));
    if (onComputer.length)
      parts.push(
        h("h2", { class: "group-title" }, t("needsComputer")),
        h("ul", { class: "list" }, ...onComputer.map(row)),
      );
    host.replaceChildren(...(parts.length ? parts : [empty("bell", t("needsEmpty"))]));
  };
  paint();
  return {
    element: h("section", { class: "screen", "data-screen": "needs" }, bar(t("tabNeeds")), host),
    tab: "needs",
    onNeeds: paint,
    onAgents: paint,
  };
}

function needScreen(id: string): Screen {
  const body = h("div", { class: "body" });
  const need = state.needs.find((item) => item.id === id);
  let answering = false;
  const gone = () => {
    body.replaceChildren(empty("bell", t("cardGone")));
  };
  const element = h(
    "section",
    { class: "screen", "data-screen": "need" },
    bar(need ? kindLabel(need.kind) : t("tabNeeds"), { back: "#/needs", live: false }),
    body,
  );
  if (!need) {
    gone();
    return { element };
  }
  // A question shows its own header and text below; every other card starts with its title.
  if (need.kind !== "prompt" || need.answerOn === "computer") body.append(h("h2", {}, need.title));
  if (need.answerOn === "computer") {
    body.append(
      h(
        "p",
        { class: "banner", "data-computer-only": true },
        icon("monitor"),
        `${t("computerOnly")}. ${need.computerReason ?? ""}`.trim(),
      ),
    );
    return { element, onNeeds: () => undefined };
  }
  const errorBox = h("p", { class: "error", "data-error": true, hidden: true });
  const fail = (message: string) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
  };
  const submit = async (answer: Answer, buttons: HTMLButtonElement[]) => {
    if (answering) return;
    answering = true;
    errorBox.hidden = true;
    for (const button of buttons) button.disabled = true;
    try {
      await api(`/v1/needs-you/${encodeURIComponent(id)}/answer`, isDynamicRecord, { method: "POST", body: answer });
      await loadNeeds().catch(() => undefined);
      toast(t("answered"));
      navigate("#/needs");
    } catch (error) {
      answering = false;
      for (const button of buttons) button.disabled = false;
      if (error instanceof ApiError && error.status === 404) {
        await loadNeeds().catch(() => undefined);
        gone();
      } else fail(errorText(error));
    }
  };
  const renderDetail = (detail: Detail) => {
    if (detail.kind === "prompt") {
      const chosen = new Map<string, string>();
      const typed = new Map<string, HTMLInputElement>();
      const button = h("button", { class: "btn primary", type: "button", "data-action": "submit" }, t("sendAnswer"));
      for (const question of detail.questions) {
        const own = h("input", {
          class: "field",
          name: `answer-${question.id}`,
          "aria-label": t("yourOwn"),
          placeholder: t("yourOwn"),
        });
        typed.set(question.id, own);
        const group = h("div", { class: "options", role: "radiogroup" });
        for (const label of question.options ?? []) {
          const option = h(
            "button",
            { class: "option", type: "button", role: "radio", "aria-checked": "false", "data-option": label },
            label,
          );
          option.addEventListener("click", () => {
            chosen.set(question.id, label);
            own.value = "";
            for (const sibling of group.querySelectorAll("[data-option]"))
              sibling.setAttribute("aria-checked", String(sibling === option));
          });
          group.append(option);
        }
        own.addEventListener("input", () => {
          if (!own.value) return;
          chosen.delete(question.id);
          for (const sibling of group.querySelectorAll("[data-option]")) sibling.setAttribute("aria-checked", "false");
        });
        body.append(
          h(
            "div",
            { class: "question" },
            h("h2", {}, question.header || question.question),
            question.header ? h("p", {}, question.question) : null,
            question.options?.length ? group : null,
            own,
          ),
        );
      }
      button.addEventListener("click", () => {
        const answers: Record<string, string[]> = {};
        for (const question of detail.questions) {
          const value = typed.get(question.id)?.value.trim() || chosen.get(question.id);
          if (!value) return fail(t("answerAll"));
          answers[question.id] = [value];
        }
        void submit({ kind: "prompt", answers }, [button]);
      });
      body.append(errorBox, button);
    } else if (detail.kind === "approval") {
      body.append(
        detail.command
          ? h(
              "div",
              {},
              h("span", { class: "field-label" }, t("command")),
              h("pre", { class: "mono", "data-command": true }, detail.command),
            )
          : h("p", { class: "hint" }, t("fileChange")),
      );
      if (detail.reason) body.append(h("dl", { class: "facts" }, h("dt", {}, t("reason")), h("dd", {}, detail.reason)));
      const deny = h("button", { class: "btn danger", type: "button", "data-action": "decline" }, t("deny"));
      const approve = h("button", { class: "btn primary", type: "button", "data-action": "accept" }, t("approve"));
      deny.addEventListener("click", () => void submit({ kind: "approval", decision: "decline" }, [deny, approve]));
      approve.addEventListener("click", () => void submit({ kind: "approval", decision: "accept" }, [deny, approve]));
      body.append(errorBox, h("div", { class: "actions" }, deny, approve));
    } else if (detail.kind === "draft-preview") {
      const facts: Node[] = [];
      if (detail.recipient) facts.push(h("dt", {}, t("to")), h("dd", {}, detail.recipient));
      if (detail.channel) facts.push(h("dt", {}, t("via")), h("dd", {}, detail.channel));
      if (facts.length) body.append(h("dl", { class: "facts" }, ...facts));
      body.append(h("div", { class: "preview", "data-preview": true }, detail.preview));
      const feedback = h("textarea", {
        class: "field",
        name: "feedback",
        "aria-label": t("changesLabel"),
        placeholder: t("changesLabel"),
      });
      const feedbackBox = h(
        "div",
        { hidden: true },
        h("label", { class: "field-label", for: "feedback" }, t("changesLabel")),
        feedback,
      );
      feedback.id = "feedback";
      const keep = h("button", { class: "btn", type: "button", "data-action": "keep-draft" }, t("keepDraft"));
      const edit = h("button", { class: "btn", type: "button", "data-action": "edit" }, t("askChanges"));
      const sendNow = h("button", { class: "btn primary", type: "button", "data-action": "send" }, t("sendDraft"));
      const all = [keep, edit, sendNow];
      keep.addEventListener("click", () => void submit({ kind: "draft-preview", decision: "keep-draft" }, all));
      sendNow.addEventListener("click", () => void submit({ kind: "draft-preview", decision: "send" }, all));
      edit.addEventListener("click", () => {
        if (feedbackBox.hidden) {
          feedbackBox.hidden = false;
          edit.textContent = t("sendChanges");
          feedback.focus();
          return;
        }
        const text = feedback.value.trim();
        if (!text) return fail(t("changesMissing"));
        void submit({ kind: "draft-preview", decision: "edit", feedback: text }, all);
      });
      body.append(feedbackBox, errorBox, h("div", { class: "actions" }, keep, edit, sendNow));
    } else {
      body.append(h("p", { class: "banner", "data-computer-only": true }, icon("monitor"), t("computerOnly")));
    }
  };

  const loading = h("p", { class: "hint" }, t("loading"));
  body.append(loading);
  api(`/v1/needs-you/${encodeURIComponent(id)}`, isDetail)
    .then((detail) => {
      loading.remove();
      renderDetail(detail);
    })
    .catch((error: unknown) => {
      loading.remove();
      if (error instanceof ApiError && error.status === 404) gone();
      else body.append(h("p", { class: "error", "data-error": true }, t("couldNotLoad", { error: errorText(error) })));
    });

  return {
    element,
    onNeeds: () => {
      if (!answering && !state.needs.some((item) => item.id === id)) {
        toast(t("cardGone"));
        navigate("#/needs");
      }
    },
  };
}

// -- this phone ------------------------------------------------------------------------------------------------------

function theme(): string {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === "light" || saved === "dark" ? saved : "system";
}

function applyTheme(): void {
  const value = theme();
  if (value === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", value);
}

function phoneScreen(): Screen {
  const body = h("div", { class: "body" });
  const secure = location.protocol === "https:";
  const facts: Array<[string, string]> = [
    [t("deviceLabel"), state.session?.deviceName ?? ""],
    [t("computer"), location.host],
    [t("connection"), secure ? t("encrypted") : t("notEncrypted")],
  ];
  body.append(
    h("dl", { class: "facts" }, ...facts.flatMap(([label, value]) => [h("dt", {}, label), h("dd", {}, value)])),
  );
  if (state.session?.fingerprint) {
    body.append(
      h(
        "div",
        {},
        h("span", { class: "field-label" }, t("fingerprint")),
        h("code", { class: "fingerprint", "data-fingerprint": true }, formatFingerprint(state.session.fingerprint)),
      ),
      h("p", { class: "hint" }, t("fingerprintHelp")),
    );
  }
  if (!secure && !isLoopbackHost(location.hostname)) {
    body.append(h("p", { class: "banner danger", "data-plain-warning": true }, icon("alert"), t("plainWarning")));
  }
  const segments = h("div", { class: "segmented", role: "group", "aria-label": t("theme") });
  const paintThemes = () => {
    const options: Array<[string, Key]> = [
      ["system", "themeSystem"],
      ["light", "themeLight"],
      ["dark", "themeDark"],
    ];
    segments.replaceChildren(
      ...options.map(([value, label]) =>
        h(
          "button",
          {
            type: "button",
            "data-theme-choice": value,
            "aria-pressed": String(theme() === value),
            onclick: () => {
              if (value === "system") localStorage.removeItem(THEME_KEY);
              else localStorage.setItem(THEME_KEY, value);
              applyTheme();
              paintThemes();
            },
          },
          t(label),
        ),
      ),
    );
  };
  paintThemes();
  body.append(h("div", {}, h("span", { class: "field-label" }, t("theme")), segments));
  body.append(pinSection(), pushSection());
  const forget = h("button", { class: "btn danger", type: "button", "data-action": "forget" }, t("forget"));
  let armed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  forget.addEventListener("click", () => {
    if (armed) {
      clearTimeout(timer);
      unpair(null);
      return;
    }
    armed = true;
    forget.textContent = t("forgetSure");
    timer = setTimeout(() => {
      armed = false;
      forget.textContent = t("forget");
    }, 4_000);
  });
  body.append(forget, h("p", { class: "hint" }, t("forgetHelp")), h("p", { class: "hint" }, t("onlyOnComputer")));
  return {
    element: h("section", { class: "screen", "data-screen": "phone" }, bar(t("phoneTitle")), body),
    tab: "phone",
    dispose: () => clearTimeout(timer),
  };
}

// -- PIN and notifications of this phone (settings) --------------------------------------------------------------------

function pinField(name: string, label: Key): HTMLInputElement {
  return h("input", {
    class: "field pin",
    name,
    type: "password",
    inputmode: "numeric",
    pattern: "[0-9]*",
    maxlength: 8,
    autocomplete: "off",
    "aria-label": t(label),
  });
}

function pinSection(): HTMLElement {
  const box = h("div", { class: "section", "data-section": "pin" });
  if (!state.access) return box;
  const message = h("p", { class: "hint", "data-status": true });
  const say = (text: string, failed = false) => {
    message.textContent = text;
    message.className = failed ? "error" : "hint";
  };
  const done = (access: Access, text: string) => {
    state.access = access;
    if (access.pinSet) noteActivity();
    else clearTimeout(idleTimer);
    say(text);
    draw(text);
  };
  const failed = (error: unknown) => {
    if (error instanceof ApiError && error.code === "removed") return unpair(t("removedPhone"));
    if (error instanceof ApiError && error.code === "wrong-pin")
      return say(t("wrongPin", { n: error.attemptsLeft ?? 0 }), true);
    say(errorText(error), true);
  };
  const draw = (status: string | null = null) => {
    const set = state.access?.pinSet === true;
    const current = pinField("current-pin", "pinCurrent");
    const fresh = pinField("new-pin", "pinNew");
    const save = h(
      "button",
      { class: "btn primary", type: "button", "data-action": "pin-save" },
      set ? t("pinChange") : t("pinSet"),
    );
    save.addEventListener("click", () => {
      if (!PIN_FORMAT.test(fresh.value) || (set && !PIN_FORMAT.test(current.value))) return say(t("pinBad"), true);
      api("/v1/pin", isAccess, {
        method: "PUT",
        body: set ? { pin: fresh.value, currentPin: current.value } : { pin: fresh.value },
      })
        .then((access) => done(access, t("pinSaved")))
        .catch(failed);
    });
    const parts: HTMLElement[] = [
      h("span", { class: "field-label" }, t("pinTitle")),
      h("p", { class: "hint" }, set ? t("pinIsOn") : t("pinHelp")),
      ...(set ? [h("div", {}, h("label", { class: "field-label" }, t("pinCurrent")), current)] : []),
      h("div", {}, h("label", { class: "field-label" }, t("pinNew")), fresh),
      save,
    ];
    if (set) {
      const remove = h("button", { class: "btn", type: "button", "data-action": "pin-remove" }, t("pinRemove"));
      remove.addEventListener("click", () => {
        if (!PIN_FORMAT.test(current.value)) return say(t("pinBad"), true);
        api("/v1/pin", isAccess, { method: "DELETE", body: { pin: current.value } })
          .then((access) => done(access, t("pinRemoved")))
          .catch(failed);
      });
      parts.push(remove);
    }
    parts.push(message);
    say(status ?? "");
    box.replaceChildren(...parts);
  };
  draw();
  return box;
}

const PUSH_SUPPORTED = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** The public key as the Push API wants it (bytes). */
function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const text = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index);
  return bytes;
}

async function sendSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  const keys = json.keys;
  if (!json.endpoint || !keys?.p256dh || !keys.auth) throw new Error(t("badAnswer"));
  state.access = await api("/v1/push/subscription", isAccess, {
    method: "PUT",
    body: { subscription: { endpoint: json.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } } },
  });
}

/** Called from a tap (the permission prompt needs one): asks the phone's permission, subscribes, tells the computer. */
async function enablePush(): Promise<void> {
  if ((await Notification.requestPermission()) !== "granted") throw new Error(t("pushDenied"));
  const registration = await navigator.serviceWorker.ready;
  const key = await api("/v1/push/key", isPushKeyAnswer);
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(key.publicKey),
  });
  await sendSubscription(subscription);
}

async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  await (await registration.pushManager.getSubscription())?.unsubscribe();
  state.access = await api("/v1/push/subscription", isAccess, { method: "DELETE" });
}

/** At start: a subscription the browser already has is told to the computer again (it may have been renewed). Never makes a new one. */
async function syncPush(): Promise<void> {
  if (!PUSH_SUPPORTED || !state.access?.push.available) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await sendSubscription(subscription);
  } catch {
    // Not worth a message: the settings page shows the real state.
  }
}

function pushSection(): HTMLElement {
  const box = h("div", { class: "section", "data-section": "push" });
  const access = state.access;
  if (!access) return box;
  const message = h("p", { class: "hint", "data-status": true });
  const draw = () => {
    const now = state.access;
    const parts: HTMLElement[] = [
      h("span", { class: "field-label" }, t("pushTitle")),
      h("p", { class: "hint" }, t("pushNotice")),
    ];
    if (!now?.push.available) parts.push(h("p", { class: "hint", "data-push": "computer" }, t("pushNeedsComputer")));
    else if (!PUSH_SUPPORTED) parts.push(h("p", { class: "hint", "data-push": "unsupported" }, t("pushUnsupported")));
    else {
      const on = now.push.subscribed;
      const button = h(
        "button",
        { class: on ? "btn" : "btn primary", type: "button", "data-action": on ? "push-off" : "push-on" },
        on ? t("pushOff") : t("pushOn"),
      );
      button.addEventListener("click", () => {
        button.disabled = true;
        (on ? disablePush() : enablePush())
          .then(() => {
            message.textContent = "";
            draw();
          })
          .catch((error: unknown) => {
            button.disabled = false;
            message.className = "error";
            message.textContent = t("pushFailed", { error: errorText(error) });
          });
      });
      if (on) parts.push(h("p", { class: "hint", "data-push": "on" }, t("pushIsOn")));
      parts.push(button);
    }
    box.replaceChildren(...parts, message);
  };
  draw();
  return box;
}

// -- start -----------------------------------------------------------------------------------------------------------

applyTheme();
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" }).catch(() => undefined);
}
/** A pairing link opened in a page that is already open (the installed app) only changes the fragment. */
function takePairingLink(): void {
  if (!/^#(v|t)=/.test(location.hash)) return;
  const code = parseCode(location.hash);
  if (!code) return;
  state.code = code;
  state.notice = null;
}

window.addEventListener(
  "hashchange",
  () => {
    takePairingLink();
    render();
  },
  listen,
);
const resume = () => {
  // Leaving the app locks it (Q7): what comes back is the lock screen, not the last chat.
  if (document.visibilityState === "hidden") return lockNow();
  wake?.();
  if (state.session && !state.locked) {
    void loadAgents().catch(() => undefined);
    void loadNeeds().catch(() => undefined);
  }
};
document.addEventListener("visibilitychange", resume, listen);
window.addEventListener("pagehide", lockNow, listen);
for (const name of ["pointerdown", "keydown", "touchstart", "scroll"]) {
  document.addEventListener(name, noteActivity, { signal: lifecycle.signal, passive: true });
}
window.addEventListener("online", resume, listen);

takePairingLink();
render();
if (state.session && !state.code) void startSession();
