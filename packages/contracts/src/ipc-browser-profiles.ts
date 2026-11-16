// COSGRAL W8-KK3: browser profiles per agent (spec-w8.md 1C, W8-15 ... W8-19; least privilege).
//
// Every agent has its OWN browser profile: its own cookie jar, storage, cache and history, in its own Electron session
// partition. Two agents never share a sign-in, so agent A on a client's account is not logged in as agent B, and what
// one agent's pages stored cannot be read by another agent's pages. The profile lives in the data folder of the space the
// program runs on (ipc-spaces.ts), so a client space has its own profiles and nothing crosses between clients.
//
// The tabs a PERSON opens in the browser panel (no agent behind them) stay in the shared profile of the program, as
// before: the person's own sign-ins are not handed to an agent, and an agent's tabs never use them.
//
// Each profile has a DOMAIN POLICY: sites it must never load (`block`, any request, any resource) and, optionally, the
// only sites it may open as a page (`allow`; empty = any site except the blocked ones). A listed domain covers its
// subdomains. Block wins over allow. The page of a site that is allowed may still load its images, scripts and fonts
// from other hosts (otherwise most sites would break); only the blocked hosts are refused everywhere.
//
// The program stores no passwords in a profile (it has no password manager); what a profile holds are the sessions
// (cookies and storage) of the sites the agent or the person signed in to. "Clear" removes all of it for one agent, after
// a confirmation; the domain policy stays. Nothing reads or copies the login files of another program.
//
// Everything here is about THIS computer only (a phone or a remote server may not call it).

import { type DynamicRecord, isBoolean, isDynamicRecord, isNumber, isString } from "./runtime-values";

export const BROWSER_PROFILE_LIMITS = {
  /** Entries in one list (allow or block). */
  domainsPerList: 100,
  /** Characters of a host name. */
  domainLength: 253,
} as const;

/** What one profile keeps for itself and never shares with another agent's profile. */
export const BROWSER_PROFILE_PARTS = ["cookies", "storage", "cache", "history"] as const;
export type BrowserProfilePart = (typeof BROWSER_PROFILE_PARTS)[number];

export interface DomainPolicy {
  /** Only these sites (and their subdomains) may be opened as a page; empty = any site except the blocked ones. */
  allow: string[];
  /** These sites (and their subdomains) are refused for every request. Wins over `allow`. */
  block: string[];
}

export interface BrowserProfile {
  botId: string;
  createdAt: string;
  /** When the sessions were last cleared; null = never. */
  clearedAt: string | null;
  domains: DomainPolicy;
}

export interface BrowserProfileList {
  /** The space the program runs on (the profiles listed belong to it). */
  spaceId: string;
  profiles: BrowserProfile[];
}

export interface BrowserProfileDescription {
  botId: string;
  /** false: the agent has no profile yet; it gets one when it first opens a page or when one is created. */
  exists: boolean;
  /** The parts that are separate for this agent; always all of them. */
  isolated: BrowserProfilePart[];
  /** Whether any other agent shares this profile: never. */
  sharedWithOthers: false;
  domains: DomainPolicy;
  createdAt: string | null;
  clearedAt: string | null;
  /** Pages of this profile that are open now. */
  openTabs: number;
}

export interface BrowserProfileInput {
  botId: string;
}

export interface SetBrowserDomainsInput extends BrowserProfileInput {
  allow: string[];
  block: string[];
}

/** Clearing removes the sessions of one agent for good: the window asks first, the engine insists (`confirm: true`). */
export interface ClearBrowserProfileInput extends BrowserProfileInput {
  confirm: boolean;
}

export interface BrowserProfilesDesktopApi {
  list: () => Promise<BrowserProfileList>;
  /** Makes the profile of an agent (it is also made by the first page the agent opens). Making it again changes nothing. */
  create: (input: BrowserProfileInput) => Promise<BrowserProfileList>;
  setDomains: (input: SetBrowserDomainsInput) => Promise<BrowserProfileList>;
  /** Removes cookies, storage, cache and history of ONE agent's profile; the domain policy stays. Needs `confirm: true`. */
  clear: (input: ClearBrowserProfileInput) => Promise<BrowserProfileList>;
  describe: (input: BrowserProfileInput) => Promise<BrowserProfileDescription>;
}

/** Event `browser-profiles-changed`: the whole list. */
export interface BrowserProfilesChanged extends BrowserProfileList {}

// --- domain rules shared by the engine and the mock ---

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * A host name from what a person typed: `Example.com`, `https://www.example.com/path`, `*.example.com`, `example.com:8080`
 * all give the host. Returns null when it is not a usable host (spaces, an `@`, an IPv6 address, an empty or too long name,
 * a label that starts or ends with a dash). A name without a dot is refused too, except `localhost`.
 */
export function normalizeDomain(entry: string): string | null {
  let text = entry.trim().toLowerCase();
  text = text.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  text = text.split(/[/?#]/)[0] ?? "";
  text = text.replace(/^\*\./, "").replace(/\.$/, "");
  text = text.replace(/:\d{1,5}$/, "");
  if (text.length === 0 || text.length > BROWSER_PROFILE_LIMITS.domainLength) return null;
  if (/[\s@:[\]*]/.test(text)) return null;
  let host: string;
  try {
    host = new URL(`http://${text}`).hostname;
  } catch {
    return null;
  }
  if (host !== text && host !== punycodeSafe(text)) return null;
  const labels = host.split(".");
  if (labels.length < 2 && host !== "localhost") return null;
  return labels.every((label) => LABEL.test(label)) ? host : null;
}

/** A host with letters beyond ASCII is accepted in its punycode form (what the browser sends). */
function punycodeSafe(text: string): string {
  try {
    return new URL(`http://${text}`).hostname;
  } catch {
    return text;
  }
}

/** A list the person typed, made tidy: every entry a host, duplicates dropped; a bad entry or too many is refused. */
export function parseDomainList(values: unknown, what: "allow" | "block"): string[] {
  if (!Array.isArray(values)) throw new Error(`The ${what} list must be a list of sites.`);
  if (values.length > BROWSER_PROFILE_LIMITS.domainsPerList) {
    throw new Error(`The ${what} list has at most ${BROWSER_PROFILE_LIMITS.domainsPerList} sites.`);
  }
  const out: string[] = [];
  for (const value of values) {
    const host = isString(value) ? normalizeDomain(value) : null;
    if (host === null)
      throw new Error(`"${isString(value) ? value.slice(0, 60) : "?"}" is not a site name (for example example.com).`);
    if (!out.includes(host)) out.push(host);
  }
  return out;
}

/** `host` is `domain` or one of its subdomains (on a label boundary: `badexample.com` is not `example.com`). */
export function hostMatches(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === domain || h.endsWith(`.${domain}`);
}

export type DomainRequestKind = "navigation" | "resource";

/**
 * May this address be loaded? Block wins and applies to every request; the allow list limits only pages (navigation).
 * Only http and https are judged here (the browser opens nothing else); anything else is allowed through unchanged.
 */
export function domainDecision(
  policy: DomainPolicy,
  address: string,
  kind: DomainRequestKind,
): { allowed: boolean; reason: string | null } {
  let host: string;
  try {
    const url = new URL(address);
    if (url.protocol !== "http:" && url.protocol !== "https:") return { allowed: true, reason: null };
    host = url.hostname;
  } catch {
    return { allowed: true, reason: null };
  }
  if (policy.block.some((domain) => hostMatches(host, domain))) {
    return { allowed: false, reason: `This browser profile blocks ${host}.` };
  }
  if (kind === "navigation" && policy.allow.length > 0 && !policy.allow.some((domain) => hostMatches(host, domain))) {
    return {
      allowed: false,
      reason: `This browser profile only opens the sites on its allow list, and ${host} is not on it.`,
    };
  }
  return { allowed: true, reason: null };
}

export function emptyDomainPolicy(): DomainPolicy {
  return { allow: [], block: [] };
}

// --- guards and parsers ---

function isDomainPolicy(value: unknown): value is DomainPolicy {
  return (
    isDynamicRecord(value) &&
    Array.isArray(value.allow) &&
    value.allow.every(isString) &&
    Array.isArray(value.block) &&
    value.block.every(isString)
  );
}

export function isBrowserProfile(value: unknown): value is BrowserProfile {
  if (!isDynamicRecord(value)) return false;
  const record: DynamicRecord = value;
  return (
    isString(record.botId) &&
    record.botId.length > 0 &&
    isString(record.createdAt) &&
    (record.clearedAt === null || isString(record.clearedAt)) &&
    isDomainPolicy(record.domains)
  );
}

export function isBrowserProfileList(value: unknown): value is BrowserProfileList {
  if (!isDynamicRecord(value) || !isString(value.spaceId) || !Array.isArray(value.profiles)) return false;
  const profiles: unknown[] = value.profiles;
  if (!profiles.every(isBrowserProfile)) return false;
  // One profile per agent.
  return new Set(profiles.map((profile) => (isBrowserProfile(profile) ? profile.botId : ""))).size === profiles.length;
}

export function isBrowserProfilesChanged(
  value: unknown,
): value is BrowserProfilesChanged & { type: "browser-profiles-changed" } {
  return isDynamicRecord(value) && value.type === "browser-profiles-changed" && isBrowserProfileList(value);
}

export function isBrowserProfileDescription(value: unknown): value is BrowserProfileDescription {
  if (!isDynamicRecord(value)) return false;
  return (
    isString(value.botId) &&
    isBoolean(value.exists) &&
    Array.isArray(value.isolated) &&
    value.isolated.length === BROWSER_PROFILE_PARTS.length &&
    BROWSER_PROFILE_PARTS.every((part) => Array.isArray(value.isolated) && value.isolated.includes(part)) &&
    value.sharedWithOthers === false &&
    isDomainPolicy(value.domains) &&
    (value.createdAt === null || isString(value.createdAt)) &&
    (value.clearedAt === null || isString(value.clearedAt)) &&
    isNumber(value.openTabs) &&
    value.openTabs >= 0
  );
}

function parseBotId(value: unknown): string {
  if (!isString(value) || value.length === 0 || value.length > 200)
    throw new Error("A browser profile belongs to an agent: an agent id is needed.");
  return value;
}

export function parseBrowserProfileInput(input: unknown): BrowserProfileInput {
  if (!isDynamicRecord(input)) throw new Error("The browser profile request is malformed.");
  return { botId: parseBotId(input.botId) };
}

export function parseSetBrowserDomainsInput(input: unknown): SetBrowserDomainsInput {
  if (!isDynamicRecord(input)) throw new Error("The browser profile request is malformed.");
  return {
    botId: parseBotId(input.botId),
    allow: parseDomainList(input.allow, "allow"),
    block: parseDomainList(input.block, "block"),
  };
}

/** `confirm` must be the boolean `true`; anything else is a refusal with a message the window can show. */
export function parseClearBrowserProfileInput(input: unknown): ClearBrowserProfileInput {
  if (!isDynamicRecord(input)) throw new Error("The browser profile request is malformed.");
  const botId = parseBotId(input.botId);
  if (input.confirm !== true) {
    throw new Error(
      "Clearing a browser profile needs a confirmation: it removes this agent's sign-ins and stored site data for good.",
    );
  }
  return { botId, confirm: true };
}
