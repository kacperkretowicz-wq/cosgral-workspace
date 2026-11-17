// COSGRAL W12 (BE-E, part a): the catalog of the 18 providers of OpenBot 0.71 in ONE table, so the screens only read it.
// Each entry says who the provider is (name, command-line program, the line shown at the start, the sign-in message), how a person
// signs in, whether it takes an API key (and the variable the program reads it from), how COSGRAL runs it, and the command that starts
// it as an ACP agent. A command that was not confirmed on this computer is marked "unverified": the program never runs an unverified
// command by itself; the person adds the preset (the ACP presets card) and tests it.
// The state of each entry on this computer (the program found, a key saved, the agent added) comes with `list`.
//
// This computer only. A key is only an input: answers carry a mask (the last 4 characters), never the key.

import { API_KEY_LIMITS } from "./ipc-api-keys";
import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const CATALOG_PROVIDER_IDS = [
  "claude",
  "codex",
  "grok",
  "opencode",
  "antigravity",
  "cursor",
  "cline",
  "pi",
  "muse",
  "inception",
  "deepseek",
  "openrouter",
  "hermes",
  "acp",
  "kimi",
  "devin",
  "copilot",
  "mistral",
] as const;
export type CatalogProviderId = (typeof CATALOG_PROVIDER_IDS)[number];

/** How a person signs in. "host" = in the provider's own program on this computer; "command" = the person gives the command. */
export const PROVIDER_SIGN_IN_KINDS = ["account", "account-or-key", "key", "host", "command"] as const;
export type ProviderSignInKind = (typeof PROVIDER_SIGN_IN_KINDS)[number];

/**
 * built-in: COSGRAL runs it itself (Codex, Claude). acp-preset: it starts as an ACP agent from a preset. needs-runtime: it needs a
 * runtime this program does not have yet (listed, shown as "not available yet"). custom: any ACP agent the person describes.
 */
export const PROVIDER_SUPPORT_LEVELS = ["built-in", "acp-preset", "needs-runtime", "custom"] as const;
export type ProviderSupportLevel = (typeof PROVIDER_SUPPORT_LEVELS)[number];

/** documented: the command comes from the documentation of the provider; unverified: not confirmed here. */
export const PROVIDER_LAUNCH_VERIFICATIONS = ["documented", "unverified"] as const;
export type ProviderLaunchVerification = (typeof PROVIDER_LAUNCH_VERIFICATIONS)[number];

export interface ProviderLaunch {
  /** The id of the ACP preset (see `window.openbot.acpPresets`) that adds it. */
  presetId: string;
  command: string;
  args: string[];
  verification: ProviderLaunchVerification;
}

export interface ProviderKeySpec {
  /** The variable the provider's program reads the key from; null when the key is only kept (no runtime yet). */
  env: string | null;
}

export interface ProviderCatalogEntry {
  id: CatalogProviderId;
  /** Shown in the picker ("ChatGPT", "Gemini"). */
  name: string;
  /** The command-line program ("Codex CLI"). */
  cliName: string;
  /** The line under the name when a provider is chosen at the start. */
  description: string;
  /** What the screen says when this provider is not signed in. */
  signInMessage: string;
  signIn: ProviderSignInKind;
  /** Null = this provider takes no API key. */
  key: ProviderKeySpec | null;
  support: ProviderSupportLevel;
  /** Null = no command is known (or it is not an ACP agent). */
  launch: ProviderLaunch | null;
  /** A running turn can take a new message (steer) or the message waits. */
  steer: "native" | "queue-only";
  /** The provider tells how much of the plan is used. */
  reportsUsage: boolean;
  /** Null = the provider offers the list itself. */
  defaultModel: string | null;
  /** The place in the picker, from 0. */
  pickerOrder: number;
}

/** What `list` knows about an entry on this computer. */
export interface ProviderCatalogState {
  /** The program of the provider as found on this computer (an absolute path); null = not found or not looked for. */
  commandDetected: string | null;
  keySaved: boolean;
  /** "••••1234", or null when no key is saved. */
  keyMask: string | null;
  /** The ACP agent of this provider is already in Providers. */
  added: boolean;
}

export interface ProviderCatalogItem extends ProviderCatalogEntry {
  state: ProviderCatalogState;
}

export interface ProviderCatalogKeyInput {
  providerId: CatalogProviderId;
}

export interface SetProviderCatalogKeyInput extends ProviderCatalogKeyInput {
  /** Input only. Never stored in clear text, logged or sent back. */
  key: string;
}

/** `window.openbot.providerCatalog` (this computer only). */
export interface ProviderCatalogDesktopApi {
  /** The 18 entries in picker order, each with its state. */
  list: () => Promise<ProviderCatalogItem[]>;
  /** Saves the key encrypted; refused for a provider that takes no key. Returns the entry with its new state. */
  setKey: (input: SetProviderCatalogKeyInput) => Promise<ProviderCatalogItem>;
  clearKey: (input: ProviderCatalogKeyInput) => Promise<ProviderCatalogItem>;
}

/** Event `provider-catalog-changed`: the whole list again (a key was saved or removed, an agent was added or removed). */
export interface ProviderCatalogChanged {
  items: ProviderCatalogItem[];
}

// -- the table --------------------------------------------------------------------------------------------------------------------

function entry(
  order: number,
  id: CatalogProviderId,
  name: string,
  cliName: string,
  description: string,
  signInMessage: string,
  rest: Pick<ProviderCatalogEntry, "signIn" | "key" | "support" | "launch" | "steer" | "reportsUsage" | "defaultModel">,
): ProviderCatalogEntry {
  return { id, name, cliName, description, signInMessage, pickerOrder: order, ...rest };
}

const unverified = (presetId: string, command: string, args: string[]): ProviderLaunch => ({
  presetId,
  command,
  args,
  verification: "unverified",
});

/** The 18 providers. The names, the CLI names and the sign-in lines follow OpenBot 0.71; the launch commands follow each provider's own docs. */
export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  entry(0, "claude", "Claude", "Claude Code", "Included with COSGRAL Workspace", "Connect Claude to continue.", {
    signIn: "account",
    key: { env: "ANTHROPIC_API_KEY" },
    support: "built-in",
    launch: null,
    steer: "native",
    reportsUsage: true,
    defaultModel: "claude-haiku-5-5",
  }),
  entry(1, "codex", "ChatGPT", "Codex CLI", "Included with COSGRAL Workspace", "Connect ChatGPT to continue.", {
    signIn: "account",
    key: { env: "OPENAI_API_KEY" },
    support: "built-in",
    launch: null,
    steer: "native",
    reportsUsage: true,
    defaultModel: "gpt-6-luna",
  }),
  entry(2, "grok", "Grok", "Grok CLI", "Grok models", "Run `grok login` or set XAI_API_KEY to use Grok.", {
    signIn: "account-or-key",
    key: { env: "XAI_API_KEY" },
    support: "needs-runtime",
    launch: null,
    steer: "native",
    reportsUsage: true,
    defaultModel: null,
  }),
  entry(
    3,
    "opencode",
    "OpenCode",
    "OpenCode CLI",
    "Free models, no account needed",
    "Add an OpenCode key to continue.",
    {
      signIn: "key",
      key: { env: "OPENCODE_API_KEY" },
      support: "acp-preset",
      launch: unverified("opencode", "opencode", ["acp"]),
      steer: "queue-only",
      reportsUsage: true,
      defaultModel: null,
    },
  ),
  entry(
    4,
    "antigravity",
    "Gemini",
    "Antigravity CLI",
    "Google AI Pro or Ultra plan",
    "Sign in with Google to use Gemini.",
    {
      signIn: "account",
      key: null,
      support: "acp-preset",
      launch: { presetId: "antigravity", command: "agy", args: ["acp"], verification: "documented" },
      steer: "native",
      reportsUsage: true,
      defaultModel: null,
    },
  ),
  entry(
    5,
    "cursor",
    "Cursor",
    "Cursor CLI",
    "Cursor plan or API key",
    "Sign in with Cursor or set CURSOR_API_KEY to use Cursor.",
    {
      signIn: "account-or-key",
      key: { env: "CURSOR_API_KEY" },
      support: "needs-runtime",
      launch: null,
      steer: "queue-only",
      reportsUsage: true,
      defaultModel: null,
    },
  ),
  entry(
    6,
    "cline",
    "Cline",
    "Cline CLI",
    "Free models with a Cline account",
    "Sign in with Cline or set CLINE_API_KEY to use Cline.",
    {
      signIn: "account-or-key",
      key: { env: "CLINE_API_KEY" },
      support: "acp-preset",
      launch: unverified("cline", "cline", ["--acp"]),
      steer: "queue-only",
      reportsUsage: false,
      defaultModel: null,
    },
  ),
  entry(
    7,
    "pi",
    "Pi",
    "Pi CLI",
    "Included with COSGRAL Workspace",
    "Use /login in Pi on this computer. Close Pi when sign-in is complete.",
    {
      signIn: "host",
      key: null,
      support: "needs-runtime",
      launch: null,
      steer: "native",
      reportsUsage: false,
      defaultModel: null,
    },
  ),
  entry(
    8,
    "muse",
    "Muse",
    "Muse CLI",
    "Included with COSGRAL Workspace",
    "Sign in to Muse on this computer to continue.",
    {
      signIn: "host",
      key: null,
      support: "needs-runtime",
      launch: null,
      steer: "native",
      reportsUsage: true,
      defaultModel: null,
    },
  ),
  entry(
    9,
    "inception",
    "Inception",
    "Pi CLI",
    "Mercury models with an Inception API key",
    "Add an Inception API key to continue.",
    {
      signIn: "key",
      key: { env: null },
      support: "needs-runtime",
      launch: null,
      steer: "native",
      reportsUsage: false,
      defaultModel: "mercury-3",
    },
  ),
  entry(
    10,
    "deepseek",
    "DeepSeek",
    "Pi CLI",
    "DeepSeek models with a DeepSeek API key",
    "Add a DeepSeek API key to continue.",
    {
      signIn: "key",
      key: { env: null },
      support: "needs-runtime",
      launch: null,
      steer: "native",
      reportsUsage: false,
      defaultModel: "deepseek-v4-pro",
    },
  ),
  entry(
    11,
    "openrouter",
    "OpenRouter",
    "Pi CLI",
    "Many models with an OpenRouter API key",
    "Add an OpenRouter API key to continue.",
    {
      signIn: "key",
      key: { env: null },
      support: "needs-runtime",
      launch: null,
      steer: "native",
      reportsUsage: false,
      defaultModel: "anthropic/claude-sonnet-5.5",
    },
  ),
  entry(
    12,
    "hermes",
    "Hermes",
    "Hermes Agent",
    "Nous Portal plan or your Hermes setup",
    "Sign in with Nous Portal or run `hermes setup` to use Hermes.",
    {
      signIn: "account",
      key: null,
      support: "acp-preset",
      launch: unverified("hermes", "hermes", ["acp"]),
      steer: "queue-only",
      reportsUsage: false,
      defaultModel: null,
    },
  ),
  entry(
    13,
    "acp",
    "Custom agent",
    "ACP agent",
    "An agent you run by command",
    "Sign in with the agent's own command, then try again.",
    {
      signIn: "command",
      key: null,
      support: "custom",
      launch: null,
      steer: "queue-only",
      reportsUsage: false,
      defaultModel: null,
    },
  ),
  entry(14, "kimi", "Kimi", "Kimi Code CLI", "Kimi models with a Kimi Code account", "Sign in with Kimi to use Kimi.", {
    signIn: "account",
    key: null,
    support: "acp-preset",
    launch: unverified("kimi", "kimi", ["acp"]),
    steer: "queue-only",
    reportsUsage: true,
    defaultModel: null,
  }),
  entry(15, "devin", "Devin", "Devin CLI", "Many models with a Devin account", "Sign in with Devin to use Devin.", {
    signIn: "account",
    key: null,
    support: "needs-runtime",
    launch: null,
    steer: "queue-only",
    reportsUsage: false,
    defaultModel: null,
  }),
  entry(
    16,
    "copilot",
    "GitHub Copilot",
    "GitHub Copilot CLI",
    "Many models with a Copilot plan",
    "Sign in with GitHub or set COPILOT_GITHUB_TOKEN to use GitHub Copilot.",
    {
      signIn: "account-or-key",
      key: { env: "COPILOT_GITHUB_TOKEN" },
      support: "acp-preset",
      launch: unverified("copilot", "copilot", ["--acp"]),
      steer: "queue-only",
      reportsUsage: false,
      defaultModel: null,
    },
  ),
  entry(
    17,
    "mistral",
    "Mistral",
    "Mistral Vibe",
    "Mistral models with a Mistral account",
    "Sign in with Mistral or set MISTRAL_API_KEY to use Mistral.",
    {
      signIn: "account-or-key",
      key: { env: "MISTRAL_API_KEY" },
      support: "acp-preset",
      launch: unverified("mistral", "vibe-acp", []),
      steer: "queue-only",
      reportsUsage: false,
      defaultModel: null,
    },
  ),
];

export function catalogEntry(id: CatalogProviderId): ProviderCatalogEntry {
  const found = PROVIDER_CATALOG.find((candidate) => candidate.id === id);
  if (!found) throw new Error("This provider is not in the catalog.");
  return found;
}

// -- rules shared by the engine and the mock -------------------------------------------------------------------------------------

export function parseProviderCatalogKeyInput(input: unknown): ProviderCatalogKeyInput {
  if (!isDynamicRecord(input) || !isOneOf(CATALOG_PROVIDER_IDS, input.providerId)) {
    throw new Error("Choose a provider from the catalog.");
  }
  return { providerId: input.providerId };
}

export function parseSetProviderCatalogKeyInput(input: unknown): SetProviderCatalogKeyInput {
  const { providerId } = parseProviderCatalogKeyInput(input);
  if (!isDynamicRecord(input) || !isString(input.key)) throw new Error("Enter the key.");
  const key = input.key.trim();
  if (key.length < API_KEY_LIMITS.min || key.length > API_KEY_LIMITS.max) {
    throw new Error(`A key has ${API_KEY_LIMITS.min} to ${API_KEY_LIMITS.max} characters.`);
  }
  if (!catalogEntry(providerId).key) throw new Error("This provider does not take an API key.");
  return { providerId, key };
}

/** The mask shown for a saved key: the last 4 characters of a long key, only dots for a short one. */
export function maskProviderKey(key: string): string {
  return key.length >= 12 ? `••••${key.slice(-4)}` : "••••";
}

function isLaunch(value: unknown): value is ProviderLaunch {
  return (
    isDynamicRecord(value) &&
    isString(value.presetId) &&
    isString(value.command) &&
    Array.isArray(value.args) &&
    value.args.every(isString) &&
    isOneOf(PROVIDER_LAUNCH_VERIFICATIONS, value.verification)
  );
}

export function isProviderCatalogEntry(value: unknown): value is ProviderCatalogEntry {
  return (
    isDynamicRecord(value) &&
    isOneOf(CATALOG_PROVIDER_IDS, value.id) &&
    isString(value.name) &&
    isString(value.cliName) &&
    isString(value.description) &&
    isString(value.signInMessage) &&
    isOneOf(PROVIDER_SIGN_IN_KINDS, value.signIn) &&
    (value.key === null || (isDynamicRecord(value.key) && (value.key.env === null || isString(value.key.env)))) &&
    isOneOf(PROVIDER_SUPPORT_LEVELS, value.support) &&
    (value.launch === null || isLaunch(value.launch)) &&
    (value.steer === "native" || value.steer === "queue-only") &&
    isBoolean(value.reportsUsage) &&
    (value.defaultModel === null || isString(value.defaultModel)) &&
    isNumber(value.pickerOrder)
  );
}

export function isProviderCatalogState(value: unknown): value is ProviderCatalogState {
  return (
    isDynamicRecord(value) &&
    (value.commandDetected === null || isString(value.commandDetected)) &&
    isBoolean(value.keySaved) &&
    (value.keyMask === null || isString(value.keyMask)) &&
    isBoolean(value.added)
  );
}

export function isProviderCatalogItem(value: unknown): value is ProviderCatalogItem {
  return isProviderCatalogEntry(value) && isDynamicRecord(value) && isProviderCatalogState(value.state);
}

/** A whole list: the 18 providers once each, in picker order. */
export function isProviderCatalogItems(value: unknown): value is ProviderCatalogItem[] {
  return (
    Array.isArray(value) &&
    value.every(isProviderCatalogItem) &&
    value.map((item) => item.id).join() === CATALOG_PROVIDER_IDS.join()
  );
}

export function isProviderCatalogChanged(
  value: unknown,
): value is ProviderCatalogChanged & { type: "provider-catalog-changed" } {
  return isDynamicRecord(value) && value.type === "provider-catalog-changed" && isProviderCatalogItems(value.items);
}
