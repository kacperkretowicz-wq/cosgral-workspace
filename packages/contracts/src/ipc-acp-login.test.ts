import { describe, expect, it } from "vitest";
import {
  ACP_LOGIN_LIMITS,
  type AcpLoginState,
  acpLoginIsRunning,
  acpLoginMethods,
  chooseAcpLoginMethod,
  IPC_CHANNELS,
  isAcpLoginChanged,
  isAcpLoginState,
  isAcpLoginStateList,
  isSafeAcpLoginUrl,
  normalizeAcpLoginCode,
  parseAcpLoginAgentInput,
  parseStartAcpLoginInput,
  parseSubmitAcpLoginCodeInput,
} from "./ipc";
import { isAgentEvent } from "./ipc-conversation";

const state: AcpLoginState = {
  agentId: "gemini",
  phase: "code-required",
  message: "Paste the code.",
  url: "https://accounts.example.test/sign-in",
  methodId: "oauth-personal",
  methods: [{ id: "oauth-personal", name: "Log in with Google", description: null, kind: "link-code" }],
  signedIn: null,
};

// What the real agents reported in `initialize` (Gemini CLI 0.68.0 and Antigravity agy 1.5.9), without any secret.
const GEMINI_METHODS = [
  { id: "oauth-personal", name: "Log in with Google", description: "Log in with your Google account" },
  {
    id: "gemini-api-key",
    name: "Gemini API key",
    description: "Use an API key",
    _meta: { "api-key": { provider: "google" } },
  },
  { id: "vertex-ai", name: "Vertex AI", description: "Use an API key with Vertex AI GenAI API" },
  {
    id: "gateway",
    name: "AI API Gateway",
    description: "Use a custom AI API Gateway",
    _meta: { gateway: { protocol: "google" } },
  },
];
const AGY_METHODS = [
  { id: "oauth-personal", name: "Log in with Google", description: "Log in with your Google account" },
  {
    id: "oauth-business",
    name: "Log in with Gemini Enterprise",
    description: "Log in with your Gemini Enterprise account",
  },
  { id: "gemini-api-key", name: "Gemini API key", description: "Use an API key with Gemini Developer API" },
  { id: "agent-platform", name: "Gemini Enterprise Agent Platform", description: "Use ADC" },
  {
    id: "terminal-login",
    name: "Log in from the terminal",
    description: "Paste a code in a terminal",
    type: "terminal",
    args: ["--login"],
  },
];

describe("ACP login contract", () => {
  it("offers only the sign-ins the program can run: links with a code and terminal sign-ins", () => {
    expect(acpLoginMethods(GEMINI_METHODS).map((method) => [method.id, method.kind])).toEqual([
      ["oauth-personal", "link-code"],
    ]);
    expect(acpLoginMethods(AGY_METHODS).map((method) => [method.id, method.kind])).toEqual([
      ["oauth-personal", "link-code"],
      ["oauth-business", "link-code"],
      ["terminal-login", "terminal"],
    ]);
  });

  it("skips what is not well formed and does not trust names", () => {
    expect(acpLoginMethods(undefined)).toEqual([]);
    expect(acpLoginMethods("oauth")).toEqual([]);
    expect(acpLoginMethods([null, 4, {}, { id: "" }, { id: "x".repeat(201) }])).toEqual([]);
    expect(acpLoginMethods([{ id: "my-oauth-key", name: "Log in with OAuth key" }])).toEqual([]);
    expect(acpLoginMethods([{ id: "t", type: "terminal", args: [1] }])).toEqual([]);
    expect(acpLoginMethods([{ id: "t", type: "terminal" }]).map((method) => method.kind)).toEqual(["terminal"]);
    const twice = acpLoginMethods([
      { id: "oauth-a", name: " A " },
      { id: "oauth-a", name: "B" },
    ]);
    expect(twice).toEqual([{ id: "oauth-a", name: "A", description: null, kind: "link-code" }]);
    const long = acpLoginMethods([{ id: "oauth-a", name: "n".repeat(500) }]);
    expect(long[0]?.name).toHaveLength(ACP_LOGIN_LIMITS.methodName);
  });

  it("chooses the method asked for, else the first, else says why not", () => {
    const methods = acpLoginMethods(AGY_METHODS);
    // A terminal sign-in is the default (a plain oauth method may need a browser of its own); else the first.
    expect(chooseAcpLoginMethod(methods, null).method?.id).toBe("terminal-login");
    expect(chooseAcpLoginMethod(acpLoginMethods(GEMINI_METHODS), null).method?.id).toBe("oauth-personal");
    expect(chooseAcpLoginMethod(methods, "oauth-business").method?.id).toBe("oauth-business");
    expect(chooseAcpLoginMethod(methods, "terminal-login").method?.id).toBe("terminal-login");
    expect(chooseAcpLoginMethod(methods, "vertex-ai")).toMatchObject({
      method: null,
      problem: expect.stringMatching(/does not offer/),
    });
    expect(chooseAcpLoginMethod([], null)).toMatchObject({
      method: null,
      problem: expect.stringMatching(/offers no sign-in/),
    });
  });

  it("knows when a sign-in runs", () => {
    for (const phase of ["starting", "code-required"] as const) expect(acpLoginIsRunning({ phase })).toBe(true);
    for (const phase of ["idle", "success", "error", "cancelled"] as const)
      expect(acpLoginIsRunning({ phase })).toBe(false);
  });

  it("makes a pasted code ready, and refuses an empty, long or multi-line one", () => {
    expect(normalizeAcpLoginCode("  4/0Abc-def  ")).toBe("4/0Abc-def");
    expect(() => normalizeAcpLoginCode("   ")).toThrow(/Paste the code/);
    expect(() => normalizeAcpLoginCode("a".repeat(ACP_LOGIN_LIMITS.code + 1))).toThrow(/too long/);
    expect(() => normalizeAcpLoginCode("a\nb")).toThrow(/one line/);
  });

  it("shows only an https link without credentials", () => {
    expect(isSafeAcpLoginUrl("https://accounts.google.com/o/oauth2/auth?x=1")).toBe(true);
    for (const bad of [
      "http://accounts.google.com",
      "javascript:alert(1)",
      "file:///C:/x",
      "https://u:p@example.com/",
      "nope",
      4,
      null,
    ]) {
      expect(isSafeAcpLoginUrl(bad)).toBe(false);
    }
  });

  it("parses the window's calls and never keeps more than it needs", () => {
    expect(parseStartAcpLoginInput({ agentId: "gemini" })).toEqual({ agentId: "gemini", methodId: null });
    expect(parseStartAcpLoginInput({ agentId: "gemini", methodId: "oauth-personal" }).methodId).toBe("oauth-personal");
    expect(() => parseStartAcpLoginInput({ agentId: "" })).toThrow(/Choose an agent/);
    expect(() => parseStartAcpLoginInput({ agentId: "g", methodId: "" })).toThrow(/sign-in method/);
    expect(parseSubmitAcpLoginCodeInput({ agentId: "gemini", code: " abc ", extra: 1 })).toEqual({
      agentId: "gemini",
      code: "abc",
    });
    expect(() => parseSubmitAcpLoginCodeInput({ agentId: "gemini", code: "" })).toThrow(/Paste the code/);
    expect(() => parseSubmitAcpLoginCodeInput({ agentId: "gemini" })).toThrow(/Paste the code/);
    expect(parseAcpLoginAgentInput({ agentId: "gemini" })).toEqual({ agentId: "gemini" });
    expect(() => parseAcpLoginAgentInput(null)).toThrow();
  });

  it("recognises the state, the list and the event", () => {
    expect(isAcpLoginState(state)).toBe(true);
    expect(isAcpLoginState({ ...state, phase: "waiting" })).toBe(false);
    expect(isAcpLoginState({ ...state, signedIn: "yes" })).toBe(false);
    expect(isAcpLoginState({ ...state, methods: [{ id: "x" }] })).toBe(false);
    expect(isAcpLoginStateList([state, state])).toBe(true);
    expect(isAcpLoginStateList([state, {}])).toBe(false);
    expect(isAcpLoginChanged({ type: "acp-login-changed", state })).toBe(true);
    expect(isAgentEvent({ type: "acp-login-changed", state })).toBe(true);
    expect(isAgentEvent({ type: "acp-login-changed", state: { ...state, phase: "x" } })).toBe(false);
  });

  it("has channels for the sign-in", () => {
    expect(IPC_CHANNELS.acpLoginList).toBe("acp-login:list");
    expect(IPC_CHANNELS.acpLoginStart).toBe("acp-login:start");
    expect(IPC_CHANNELS.acpLoginSubmitCode).toBe("acp-login:submit-code");
    expect(IPC_CHANNELS.acpLoginCancel).toBe("acp-login:cancel");
  });
});
