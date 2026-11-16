// COSGRAL W6-BE5: signing in to an ACP agent (Gemini CLI, Antigravity `agy`, ...) from the program, with a sign-in link.
//
// An ACP agent reports in `initialize` how a person can sign in (`authMethods`). The program runs one of them and shows the
// result like the sign-in of Codex and Claude (W5-BE2): a LINK that the window opens in the default browser when the person
// clicks, and a field for the CODE the sign-in page shows afterwards. Nothing is opened without a click.
//
// - Only the person signs in; agents never do. The program never reads the files in which the agent keeps its login (the
//   agent keeps them itself), never stores the pasted code (it is only passed to the running sign-in) and never logs it.
// - Only methods the program can run are offered: a link and a code ("oauth-*" methods) or a terminal sign-in that prints a
//   link and asks for a code (`type: "terminal"`). API keys, Vertex AI and gateways are not offered here (they need a secret
//   and an agent setting, not a sign-in).
// - "Authentication required" from an agent is shown as this card (`signedIn: false`), not as a failed turn.
// - This computer only.

import { isBoolean, isDynamicRecord, isOneOf, isString } from "./runtime-values";

export const ACP_LOGIN_PHASES = ["idle", "starting", "code-required", "success", "error", "cancelled"] as const;
export type AcpLoginPhase = (typeof ACP_LOGIN_PHASES)[number];

export const ACP_LOGIN_LIMITS = {
  /** A pasted sign-in code (only passed to the running sign-in, never stored). */
  code: 512,
  message: 300,
  methodName: 120,
} as const;

/** "link-code": the agent prints a link and asks for a code. "terminal": the agent's own terminal sign-in does the same. */
export const ACP_LOGIN_METHOD_KINDS = ["link-code", "terminal"] as const;
export type AcpLoginMethodKind = (typeof ACP_LOGIN_METHOD_KINDS)[number];

export interface AcpLoginMethod {
  /** The method id the agent reported (e.g. "oauth-personal"). */
  id: string;
  /** The name the agent gave it (e.g. "Log in with Google"). */
  name: string;
  description: string | null;
  kind: AcpLoginMethodKind;
}

export interface AcpLoginState {
  /** The id of the ACP agent (as in Providers). */
  agentId: string;
  phase: AcpLoginPhase;
  /** A readable state ("Starting the sign-in…", the reason of a failure); null when idle. */
  message: string | null;
  /** The sign-in page the agent printed (open it with the window's `openUrl` on click); null when none. */
  url: string | null;
  /** The method that runs or ran last, else null. */
  methodId: string | null;
  /** The sign-in methods the program can run for this agent (known after the first start; empty before). */
  methods: AcpLoginMethod[];
  /**
   * true after a sign-in succeeded in this run; false when the agent said "Authentication required" (show this card);
   * null when not known (the program does not read the agent's login files to find out).
   */
  signedIn: boolean | null;
}

export interface StartAcpLoginInput {
  agentId: string;
  /** Left out: the first method the program can run. */
  methodId?: string | null;
}

export interface SubmitAcpLoginCodeInput {
  agentId: string;
  code: string;
}

export interface AcpLoginAgentInput {
  agentId: string;
}

/** `window.openbot.acpLogin` (this computer only). Changes come as the event `acp-login-changed`. */
export interface AcpLoginDesktopApi {
  /** The sign-in state of every configured ACP agent. */
  list: () => Promise<AcpLoginState[]>;
  /** Starts the sign-in; follow `phase` (starting, code-required with `url`, success, error) in the event. */
  start: (input: StartAcpLoginInput) => Promise<AcpLoginState>;
  /** Passes the code the sign-in page showed to the running sign-in (phase code-required). */
  submitCode: (input: SubmitAcpLoginCodeInput) => Promise<AcpLoginState>;
  cancel: (input: AcpLoginAgentInput) => Promise<AcpLoginState>;
}

/** Event `acp-login-changed`: replace the state of this agent. */
export interface AcpLoginChanged {
  state: AcpLoginState;
}

// --- rules shared by the engine and the mock ---

/**
 * The sign-in methods the program can run, from the `authMethods` an agent reported in `initialize`: a method with
 * `type: "terminal"` (it names its own extra arguments) or an "oauth-*" method (link and code). Everything else (API key,
 * Vertex AI, gateway, Application Default Credentials) is left out. Anything that is not well formed is skipped.
 */
export function acpLoginMethods(authMethods: unknown): AcpLoginMethod[] {
  if (!Array.isArray(authMethods)) return [];
  const methods: AcpLoginMethod[] = [];
  for (const method of authMethods) {
    if (!isDynamicRecord(method) || !isString(method.id) || method.id.length === 0 || method.id.length > 200) continue;
    const name = isString(method.name) && method.name.trim() ? method.name.trim() : method.id;
    const description = isString(method.description) && method.description.trim() ? method.description.trim() : null;
    const terminal =
      method.type === "terminal" &&
      (method.args === undefined || (Array.isArray(method.args) && method.args.every(isString)));
    if (!terminal && !/^oauth(-|$)/.test(method.id)) continue;
    if (methods.some((known) => known.id === method.id)) continue;
    methods.push({
      id: method.id,
      name: name.slice(0, ACP_LOGIN_LIMITS.methodName),
      description: description?.slice(0, ACP_LOGIN_LIMITS.message) ?? null,
      kind: terminal ? "terminal" : "link-code",
    });
  }
  return methods;
}

/** The method to run: the one asked for, else the first the program can run, else null (with the readable reason). */
export function chooseAcpLoginMethod(
  methods: readonly AcpLoginMethod[],
  methodId: string | null | undefined,
): { method: AcpLoginMethod; problem: null } | { method: null; problem: string } {
  if (methods.length === 0) {
    return {
      method: null,
      problem: "This agent offers no sign-in that the program can run. Sign in with the agent's own terminal command.",
    };
  }
  if (methodId) {
    const asked = methods.find((method) => method.id === methodId);
    return asked
      ? { method: asked, problem: null }
      : { method: null, problem: "This agent does not offer that sign-in." };
  }
  const first = methods[0];
  return first ? { method: first, problem: null } : { method: null, problem: "This agent offers no sign-in." };
}

/** Whether a sign-in runs now (it blocks a second start and can be cancelled). */
export function acpLoginIsRunning(state: Pick<AcpLoginState, "phase">): boolean {
  return state.phase === "starting" || state.phase === "code-required";
}

/** A pasted sign-in code made ready for the sign-in: trimmed, one line. Refused when empty, too long or not one line. */
export function normalizeAcpLoginCode(value: string): string {
  const code = value.trim();
  if (!code) throw new Error("Paste the code that the sign-in page showed.");
  if (code.length > ACP_LOGIN_LIMITS.code) throw new Error("This code is too long.");
  if (/[\r\n]/.test(code)) throw new Error("The code is one line.");
  return code;
}

/** The sign-in link is safe to show and open: https, no credentials in it. */
export function isSafeAcpLoginUrl(value: unknown): value is string {
  if (!isString(value) || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

// --- guards and parsers ---

export function isAcpLoginMethod(value: unknown): value is AcpLoginMethod {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    (value.description === null || isString(value.description)) &&
    isOneOf(ACP_LOGIN_METHOD_KINDS, value.kind)
  );
}

export function isAcpLoginState(value: unknown): value is AcpLoginState {
  return (
    isDynamicRecord(value) &&
    isString(value.agentId) &&
    isOneOf(ACP_LOGIN_PHASES, value.phase) &&
    (value.message === null || isString(value.message)) &&
    (value.url === null || isString(value.url)) &&
    (value.methodId === null || isString(value.methodId)) &&
    Array.isArray(value.methods) &&
    value.methods.every(isAcpLoginMethod) &&
    (value.signedIn === null || isBoolean(value.signedIn))
  );
}

export function isAcpLoginStateList(value: unknown): value is AcpLoginState[] {
  return Array.isArray(value) && value.every(isAcpLoginState);
}

export function isAcpLoginChanged(value: unknown): value is AcpLoginChanged & { type: "acp-login-changed" } {
  return isDynamicRecord(value) && value.type === "acp-login-changed" && isAcpLoginState(value.state);
}

function agentId(value: unknown): string {
  if (!isString(value) || value.length === 0 || value.length > 200) throw new Error("Choose an agent.");
  return value;
}

export function parseStartAcpLoginInput(value: unknown): StartAcpLoginInput {
  if (!isDynamicRecord(value)) throw new Error("Expected an object.");
  const methodId = value.methodId;
  if (
    methodId !== undefined &&
    methodId !== null &&
    (!isString(methodId) || methodId.length === 0 || methodId.length > 200)
  )
    throw new Error("Choose a sign-in method.");
  return { agentId: agentId(value.agentId), methodId: methodId ?? null };
}

export function parseSubmitAcpLoginCodeInput(value: unknown): SubmitAcpLoginCodeInput {
  if (!isDynamicRecord(value)) throw new Error("Expected an object.");
  if (!isString(value.code)) throw new Error("Paste the code that the sign-in page showed.");
  return { agentId: agentId(value.agentId), code: normalizeAcpLoginCode(value.code) };
}

export function parseAcpLoginAgentInput(value: unknown): AcpLoginAgentInput {
  if (!isDynamicRecord(value)) throw new Error("Expected an object.");
  return { agentId: agentId(value.agentId) };
}
