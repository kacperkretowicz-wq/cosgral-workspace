// COSGRAL W5-K2: own model endpoints (OpenAI-compatible servers, Ollama, LM Studio).
// An endpoint is an address with a name, an optional key and a list of models fetched on request. Its models are
// agent models like any other: "endpoint:<id>/<model>" (the pattern of "acp:<id>"). The key is only an input: every
// answer carries a mask and a state, never the key (the key is kept like the provider API keys of W5-BE3).

import { type DynamicRecord, isDynamicRecord, isOneOf, isString } from "./runtime-values";

export const ENDPOINT_KINDS = ["openai-compatible", "ollama", "lmstudio"] as const;
export type EndpointKind = (typeof ENDPOINT_KINDS)[number];

/** unchecked = models never fetched; checking = a fetch runs now; ok = answered; rejected = 401/403; unreachable = no usable answer. */
export const ENDPOINT_STATES = ["unchecked", "checking", "ok", "rejected", "unreachable"] as const;
export type EndpointState = (typeof ENDPOINT_STATES)[number];

export const ENDPOINT_LIMITS = {
  /** Endpoint id: lowercase letter first, then lowercase letters, digits and dashes. */
  id: 40,
  label: 60,
  baseUrl: 300,
  endpoints: 16,
  /** Models kept per endpoint; a server with more lists only the first ones. */
  models: 200,
  model: 200,
  key: { min: 4, max: 512 },
} as const;

/** Ready settings; they fill the form and nothing more (nothing is installed, started or contacted). */
export const ENDPOINT_PRESETS = [
  { kind: "ollama", label: "Ollama", baseUrl: "http://127.0.0.1:11434/v1" },
  { kind: "lmstudio", label: "LM Studio", baseUrl: "http://127.0.0.1:1234/v1" },
] as const satisfies ReadonlyArray<{ kind: EndpointKind; label: string; baseUrl: string }>;

/** documented: the address was read in the provider's own documentation (see `docs`); unverified: not confirmed (same words as the provider catalog). */
export const ENDPOINT_PRESET_VERIFICATIONS = ["documented", "unverified"] as const;
export type EndpointPresetVerification = (typeof ENDPOINT_PRESET_VERIFICATIONS)[number];

export interface EndpointCloudPreset {
  kind: EndpointKind;
  label: string;
  baseUrl: string;
  verification: EndpointPresetVerification;
  /** The page of the provider that states the address; null while unverified. */
  docs: string | null;
}

/**
 * COSGRAL W12 (BE-Q, BE-T): ready settings for hosted services that speak the OpenAI protocol, so their models can be used with an API
 * key and without their CLI (owner question 3). Unlike ENDPOINT_PRESETS they are NOT probed when the program starts: they only fill the
 * form, and nothing is contacted until the person saves a key (the address is then shown with the warning that the messages go to
 * another computer). The order is the order of the buttons. The address is the base the program adds "/models" and "/chat/completions"
 * to, so a provider that documents it without "/v1" (DeepSeek) stays without it. Addresses were read in the documentation on 18.11.2026,
 * not contacted from here; a model list is fetched later, when the person saves a key.
 */
export const ENDPOINT_CLOUD_PRESETS = [
  {
    kind: "openai-compatible",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    verification: "unverified",
    docs: null,
  },
  {
    kind: "openai-compatible",
    label: "xAI (Grok)",
    baseUrl: "https://api.x.ai/v1",
    verification: "unverified",
    docs: null,
  },
  {
    kind: "openai-compatible",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    verification: "documented",
    docs: "https://api-docs.deepseek.com/",
  },
  {
    kind: "openai-compatible",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    verification: "documented",
    docs: "https://docs.mistral.ai/api/",
  },
  {
    kind: "openai-compatible",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    verification: "documented",
    docs: "https://console.groq.com/docs/openai",
  },
  {
    kind: "openai-compatible",
    label: "Together AI",
    baseUrl: "https://api.together.ai/v1",
    verification: "documented",
    docs: "https://docs.together.ai/docs/openai-api-compatibility",
  },
  {
    kind: "openai-compatible",
    label: "Moonshot (Kimi)",
    baseUrl: "https://api.moonshot.ai/v1",
    verification: "documented",
    docs: "https://platform.kimi.ai/docs/guide/start-using-kimi-api",
  },
] as const satisfies ReadonlyArray<EndpointCloudPreset>;

export interface ModelEndpoint {
  id: string;
  label: string;
  kind: EndpointKind;
  /** http(s) address up to and including the version, e.g. "http://127.0.0.1:11434/v1". */
  baseUrl: string;
  hasKey: boolean;
  /** "••••1234" (the last 4 characters; "••••" for a short key); null = no key. */
  maskedKey: string | null;
  /** Model names as the server lists them (not the agent model ids; see `endpointModelId`). */
  models: string[];
  state: EndpointState;
  /** Readable result of the last fetch; never contains the key. */
  message: string | null;
  checkedAt: string | null;
  /** Set when the address is not on this computer or not encrypted ("Your messages go to another computer"). */
  warning: string | null;
  /** Always true in this version: agents talk through the endpoint but get no program tools ("chat only"). */
  chatOnly: boolean;
}

export interface SaveEndpointInput {
  /** Present when editing; a new endpoint gets its id from the program. */
  id?: string;
  label: string;
  kind: EndpointKind;
  baseUrl: string;
  /** Input only. Missing = keep the saved key. Never stored in clear text, logged or sent back. */
  key?: string;
  /** Remove the saved key. Changing the host of the address also removes it (a key belongs to one host). */
  clearKey?: boolean;
}

export interface EndpointIdInput {
  id: string;
}

/** COSGRAL W5-K2 window API (this computer only). Optional in the window until every mock has it. */
export interface EndpointsDesktopApi {
  list: () => Promise<ModelEndpoint[]>;
  /** Saves the endpoint; contacts nothing. */
  save: (input: SaveEndpointInput) => Promise<ModelEndpoint>;
  /** Removes the endpoint and its key; its models disappear from the choice. */
  remove: (input: EndpointIdInput) => Promise<void>;
  /** Fetches the model list and sets the state; only when the person clicks. A refused key is a state, not an error. */
  check: (input: EndpointIdInput) => Promise<ModelEndpoint>;
  /** Looks only at 127.0.0.1 port 11434 (Ollama) and 1234 (LM Studio); an empty list is not an error. */
  detectLocal: () => Promise<ModelEndpoint[]>;
}

// --- model ids ---

export type EndpointModelId = `endpoint:${string}/${string}`;

export function isEndpointId(value: unknown): value is string {
  return isString(value) && value.length <= ENDPOINT_LIMITS.id && /^[a-z][a-z0-9-]*$/.test(value);
}

export function endpointModelId(endpointId: string, model: string): EndpointModelId {
  return `endpoint:${endpointId}/${model}`;
}

/** "endpoint:<id>/<model>"; the model name may itself contain "/" and ":" (e.g. "hf.co/org/m:q4"). */
export function parseEndpointModel(value: unknown): { endpointId: string; model: string } | null {
  if (!isString(value) || !value.startsWith("endpoint:")) return null;
  const rest = value.slice("endpoint:".length);
  const slash = rest.indexOf("/");
  if (slash < 1) return null;
  const endpointId = rest.slice(0, slash);
  const model = rest.slice(slash + 1);
  if (!isEndpointId(endpointId) || model.length === 0 || model.length > ENDPOINT_LIMITS.model) return null;
  // A model name is one printable line.
  if (/\p{Cc}/u.test(model) || model !== model.trim()) return null;
  return { endpointId, model };
}

export function isEndpointModel(value: unknown): value is EndpointModelId {
  return parseEndpointModel(value) !== null;
}

// --- address check (the window shows the warning while typing; the backend decides again) ---

export type EndpointUrlCheck =
  | { ok: true; baseUrl: string; host: string; loopback: boolean; warning: string | null }
  | { ok: false; reason: string };

function isLoopbackHost(host: string): boolean {
  if (host === "localhost" || host === "[::1]") return true;
  const parts = host.split(".").map(Number);
  return (
    parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) && parts[0] === 127
  );
}

/** Private addresses of a local network: RFC 1918, link-local, unique-local IPv6, and plain local names. */
function isLocalNetworkHost(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [a = 0, b = 0] = parts;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (host.startsWith("[")) {
    const inner = host.slice(1, -1).toLowerCase();
    return inner.startsWith("fe80:") || inner.startsWith("fc") || inner.startsWith("fd");
  }
  if (!host.includes(".")) return true;
  return /\.(local|lan|home\.arpa|internal)$/.test(host);
}

/**
 * Only http and https, no user:password in the address, no query or fragment. A server on this computer needs no
 * warning; any other host does ("your messages go there"), and plain http to a host outside the local network is
 * refused (a key and the conversation would cross the internet in clear text).
 */
export function checkEndpointUrl(input: unknown): EndpointUrlCheck {
  if (!isString(input) || input.trim().length === 0) return { ok: false, reason: "Enter the address of the server." };
  const text = input.trim();
  if (text.length > ENDPOINT_LIMITS.baseUrl) return { ok: false, reason: "This address is too long." };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: "This is not a valid address. Example: http://127.0.0.1:11434/v1" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return { ok: false, reason: "Only http:// and https:// addresses are accepted." };
  if (url.username || url.password)
    return { ok: false, reason: "Do not put a user name or password in the address. Use the key field." };
  if (url.search || url.hash) return { ok: false, reason: "The address must not have a query (?) or a fragment (#)." };
  if (!url.hostname) return { ok: false, reason: "The address has no host name." };
  const host = url.hostname.toLowerCase();
  const loopback = isLoopbackHost(host);
  const local = loopback || isLocalNetworkHost(host);
  const plain = url.protocol === "http:";
  if (plain && !local)
    return {
      ok: false,
      reason: "Plain http:// is allowed only on this computer or a local network. Use https:// for other hosts.",
    };
  const baseUrl = `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  const warning = loopback
    ? null
    : plain
      ? `This server is on another computer (${host}) and the connection is not encrypted: anyone on the network can read your messages and the key.`
      : `This server is not on this computer (${host}). Your messages and the key go to it.`;
  return { ok: true, baseUrl, host, loopback, warning };
}

// --- guards and parsers ---

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

export function isEndpointKind(value: unknown): value is EndpointKind {
  return isOneOf(ENDPOINT_KINDS, value);
}

export function isModelEndpoint(value: unknown): value is ModelEndpoint {
  return (
    isDynamicRecord(value) &&
    isEndpointId(value.id) &&
    isString(value.label) &&
    isEndpointKind(value.kind) &&
    isString(value.baseUrl) &&
    (value.hasKey === true || value.hasKey === false) &&
    isNullableString(value.maskedKey) &&
    Array.isArray(value.models) &&
    value.models.every(isString) &&
    isOneOf(ENDPOINT_STATES, value.state) &&
    isNullableString(value.message) &&
    isNullableString(value.checkedAt) &&
    isNullableString(value.warning) &&
    (value.chatOnly === true || value.chatOnly === false)
  );
}

export function isModelEndpointList(value: unknown): value is ModelEndpoint[] {
  return Array.isArray(value) && value.every(isModelEndpoint);
}

function record(value: unknown): DynamicRecord {
  if (!isDynamicRecord(value)) throw new Error("Expected an object.");
  return value;
}

export function parseEndpointIdInput(value: unknown): EndpointIdInput {
  const id = record(value).id;
  if (!isEndpointId(id)) throw new Error("Unknown endpoint.");
  return { id };
}

/** Shape check only; the address rules run in the backend with `checkEndpointUrl`. The error text never repeats the key. */
export function parseSaveEndpointInput(value: unknown): SaveEndpointInput {
  const input = record(value);
  const label = isString(input.label) ? input.label.trim() : "";
  if (label.length === 0 || label.length > ENDPOINT_LIMITS.label)
    throw new Error(`Give the endpoint a name of 1 to ${ENDPOINT_LIMITS.label} characters.`);
  if (!isEndpointKind(input.kind)) throw new Error("Choose OpenAI-compatible, Ollama or LM Studio.");
  if (!isString(input.baseUrl)) throw new Error("Enter the address of the server.");
  const result: SaveEndpointInput = { label, kind: input.kind, baseUrl: input.baseUrl };
  if (input.id !== undefined && input.id !== null) {
    if (!isEndpointId(input.id)) throw new Error("Unknown endpoint.");
    result.id = input.id;
  }
  if (input.key !== undefined && input.key !== null && input.key !== "") {
    const key = isString(input.key) ? input.key.trim() : "";
    if (key.length < ENDPOINT_LIMITS.key.min || key.length > ENDPOINT_LIMITS.key.max || !/^[\x21-\x7e]+$/.test(key))
      throw new Error(
        `Paste the key as one piece of ${ENDPOINT_LIMITS.key.min} to ${ENDPOINT_LIMITS.key.max} characters, or leave it empty.`,
      );
    result.key = key;
  }
  if (input.clearKey === true) result.clearKey = true;
  return result;
}
