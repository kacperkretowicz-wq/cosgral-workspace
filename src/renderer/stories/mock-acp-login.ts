// COSGRAL W6-BE5: the sign-in to ACP agents for Storybook and the preview. Demo data only (the link is not a real page). The
// same rules as the program: only methods the program can run are offered, a sign-in runs once at a time per agent, the code
// is one line and is never kept, "Authentication required" shows the card (signedIn false), and Cancel ends a running
// sign-in. The demo accepts any code except "wrong". `needsLogin`, `reset` let a story play the program.

import {
  type AcpLoginDesktopApi,
  type AcpLoginState,
  type AgentEvent,
  acpLoginIsRunning,
  acpLoginMethods,
  chooseAcpLoginMethod,
  normalizeAcpLoginCode,
} from "@openbot/contracts/ipc";

export interface MockAcpLogin extends Required<AcpLoginDesktopApi> {
  /** The agent said "Authentication required": the card shows, nothing runs. */
  needsLogin: (agentId: string) => AcpLoginState;
  /** Back to "not known" (a story starts over). */
  reset: (agentId: string) => AcpLoginState;
}

/** What the demo agents report in `initialize` (the same shapes as the real ones). */
const DEMO_AUTH_METHODS = [
  { id: "oauth-personal", name: "Log in with Google", description: "Log in with your Google account" },
  {
    id: "terminal-login",
    name: "Log in from the terminal",
    description: "Paste a code in a terminal",
    type: "terminal",
    args: ["--login"],
  },
  { id: "gemini-api-key", name: "Gemini API key", description: "Use an API key" },
];

export function createMockAcpLogin(
  emit: (event: AgentEvent) => void,
  agentIds: readonly string[] = ["gemini", "antigravity"],
): MockAcpLogin {
  const states = new Map<string, AcpLoginState>(
    agentIds.map((agentId) => [
      agentId,
      { agentId, phase: "idle", message: null, url: null, methodId: null, methods: [], signedIn: null },
    ]),
  );
  let counter = 0;

  const need = (agentId: string): AcpLoginState => {
    const state = states.get(agentId);
    if (!state) throw new Error("Unknown ACP agent.");
    return state;
  };
  const change = (state: AcpLoginState, patch: Partial<AcpLoginState>): AcpLoginState => {
    Object.assign(state, patch);
    emit({ type: "acp-login-changed", state: structuredClone(state) });
    return structuredClone(state);
  };

  return {
    list: async () => [...states.values()].map((state) => structuredClone(state)),
    start: async ({ agentId, methodId }) => {
      const state = need(agentId);
      if (acpLoginIsRunning(state)) throw new Error("A sign-in is already running for this agent.");
      const methods = acpLoginMethods(DEMO_AUTH_METHODS);
      const chosen = chooseAcpLoginMethod(methods, methodId);
      if (!chosen.method) throw new Error(chosen.problem);
      counter += 1;
      change(state, {
        phase: "starting",
        message: "Starting the sign-in…",
        url: null,
        methodId: chosen.method.id,
        methods,
      });
      return change(state, {
        phase: "code-required",
        message: "Open the link, sign in, and paste the code the page shows.",
        url: `https://accounts.example.test/sign-in?attempt=${counter}`,
      });
    },
    submitCode: async ({ agentId, code }) => {
      const state = need(agentId);
      if (state.phase !== "code-required") throw new Error("No sign-in waits for a code.");
      const normalized = normalizeAcpLoginCode(code);
      if (normalized === "wrong") {
        return change(state, {
          phase: "error",
          message: "The sign-in page did not accept this code. Start again.",
          url: null,
        });
      }
      return change(state, { phase: "success", message: "Signed in.", url: null, signedIn: true });
    },
    cancel: async ({ agentId }) => {
      const state = need(agentId);
      if (!acpLoginIsRunning(state)) return structuredClone(state);
      return change(state, { phase: "cancelled", message: "The sign-in was cancelled.", url: null });
    },
    needsLogin: (agentId) =>
      change(need(agentId), {
        phase: "idle",
        message: "Authentication required. Sign in to use this agent.",
        url: null,
        signedIn: false,
      }),
    reset: (agentId) =>
      change(need(agentId), { phase: "idle", message: null, url: null, methodId: null, methods: [], signedIn: null }),
  };
}
