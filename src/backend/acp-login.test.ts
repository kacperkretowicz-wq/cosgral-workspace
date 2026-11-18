// @vitest-environment node
// COSGRAL W6-BE5: signing in to ACP agents from the program (a link, then a code). A fake ACP agent plays the two real ones: a
// link-and-code sign-in over ACP (Gemini CLI) and a terminal sign-in (Antigravity). The program never reads login files and
// never keeps the code.

import { fileURLToPath } from "node:url";
import type { AcpAgentConfig, AcpLoginState, AgentEvent } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { AcpLogin, readAcpLoginOutput } from "./acp-login";
import { suiteTimeout } from "./testing/timeouts";

const STUB = fileURLToPath(new URL("./testing/acp-login-stub.mjs", import.meta.url));

function agent(id: string, mode: string): AcpAgentConfig {
  return {
    id,
    name: `Agent ${id}`,
    command: process.execPath,
    args: [STUB, mode],
    createdAt: "2026-11-16T10:00:00.000Z",
    updatedAt: "2026-11-16T10:00:00.000Z",
  };
}

const running: AcpLogin[] = [];
afterEach(() => {
  for (const login of running.splice(0)) login.stopAll();
});

function setup(agents: AcpAgentConfig[], options: { timeoutMs?: number; startTimeoutMs?: number } = {}) {
  const events: AgentEvent[] = [];
  const login = new AcpLogin({ agents: () => agents, emit: (event) => events.push(event), ...options });
  running.push(login);
  return { login, events };
}

function states(events: AgentEvent[], agentId: string): AcpLoginState[] {
  return events.flatMap((event) =>
    event.type === "acp-login-changed" && event.state.agentId === agentId ? [event.state] : [],
  );
}

async function waitFor(check: () => boolean | undefined, ms = 8000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out.");
}

const phaseOf = (login: AcpLogin, id: string) => login.list().find((state) => state.agentId === id)?.phase;

describe("readAcpLoginOutput", () => {
  it("finds the link and ignores colour codes and the cursor handling a terminal program prints", () => {
    const text =
      "\u001b[?1049h\u001b[2J\u001b[HPlease visit the following URL to authorize the application:\r\n\r\nhttps://accounts.example.test/o/auth?a=1&b=2\r\n\u001b[1mEnter the authorization code:\u001b[0m ";
    expect(readAcpLoginOutput(text)).toEqual({
      url: "https://accounts.example.test/o/auth?a=1&b=2",
      codeRequired: true,
    });
    expect(readAcpLoginOutput("  https://x.test/a).")).toMatchObject({ url: "https://x.test/a" });
    expect(readAcpLoginOutput("nothing here")).toEqual({ url: null, codeRequired: false });
  });

  it("takes only an https link", () => {
    expect(readAcpLoginOutput("open http://insecure.test/x now").url).toBeNull();
  });
});

describe("AcpLogin", { timeout: suiteTimeout(30_000, 10_000) }, () => {
  it("lists every configured agent as idle, signed-in state not known, before anything runs", () => {
    const { login } = setup([agent("gemini", "link-code"), agent("antigravity", "terminal")]);
    expect(login.list().map((state) => [state.agentId, state.phase, state.signedIn, state.methods.length])).toEqual([
      ["gemini", "idle", null, 0],
      ["antigravity", "idle", null, 0],
    ]);
  });

  it("a link-and-code sign-in: shows the link, takes the code, and succeeds (Gemini CLI way)", async () => {
    const { login, events } = setup([agent("gemini", "link-code")]);
    const started = await login.start({ agentId: "gemini" });
    expect(started.phase).toBe("starting");
    await waitFor(() => phaseOf(login, "gemini") === "code-required");
    const waiting = login.list()[0];
    expect(waiting).toMatchObject({
      methodId: "oauth-personal",
      url: "https://accounts.example.test/auth?attempt=1",
      signedIn: null,
    });
    expect(waiting?.methods.map((method) => method.id)).toEqual(["oauth-personal"]);

    const checking = await login.submitCode({ agentId: "gemini", code: "  good-code  " });
    expect(checking.phase).toBe("starting");
    await waitFor(() => phaseOf(login, "gemini") === "success");
    expect(login.list()[0]).toMatchObject({ url: null, signedIn: true, message: "Signed in." });
    expect([...new Set(states(events, "gemini").map((state) => state.phase))]).toEqual([
      "starting",
      "code-required",
      "success",
    ]);
  });

  it("a wrong code brings a NEW link and asks again; the right code then succeeds", async () => {
    const { login } = setup([agent("gemini", "link-code")]);
    await login.start({ agentId: "gemini" });
    await waitFor(() => phaseOf(login, "gemini") === "code-required");
    await login.submitCode({ agentId: "gemini", code: "wrong-code" });
    await waitFor(() => login.list()[0]?.url === "https://accounts.example.test/auth?attempt=2");
    expect(login.list()[0]).toMatchObject({ phase: "code-required" });
    expect(login.list()[0]?.message).toMatch(/did not accept the code/i);
    await login.submitCode({ agentId: "gemini", code: "good-code" });
    await waitFor(() => phaseOf(login, "gemini") === "success");
  });

  it("a terminal sign-in runs the agent's own command with its extra arguments (Antigravity way) and ends with the exit", async () => {
    const { login } = setup([agent("antigravity", "terminal")]);
    await login.start({ agentId: "antigravity", methodId: "terminal-login" });
    await waitFor(() => phaseOf(login, "antigravity") === "code-required");
    expect(login.list()[0]).toMatchObject({
      methodId: "terminal-login",
      url: "https://accounts.example.test/auth?attempt=1",
    });
    await login.submitCode({ agentId: "antigravity", code: "good-code" });
    await waitFor(() => phaseOf(login, "antigravity") === "success");
    expect(login.list()[0]).toMatchObject({ signedIn: true, url: null });
  });

  it("a terminal sign-in with a wrong code is an error with the agent's reason, and the code is never repeated", async () => {
    const { login, events } = setup([agent("antigravity", "terminal")]);
    await login.start({ agentId: "antigravity", methodId: "terminal-login" });
    await waitFor(() => phaseOf(login, "antigravity") === "code-required");
    await login.submitCode({ agentId: "antigravity", code: "secret-wrong-code" });
    await waitFor(() => phaseOf(login, "antigravity") === "error");
    const failed = login.list()[0];
    expect(failed?.message).toMatch(/invalid_grant/);
    expect(failed?.url).toBeNull();
    expect(failed?.signedIn).toBeNull();
    expect(JSON.stringify(events)).not.toContain("secret-wrong-code");
  });

  it("starts the first method the program can run when none is asked for, and refuses one the agent does not offer", async () => {
    const { login } = setup([agent("antigravity", "terminal")]);
    await expect(login.start({ agentId: "antigravity", methodId: "vertex-ai" })).resolves.toBeTruthy();
    await waitFor(() => phaseOf(login, "antigravity") === "error");
    expect(login.list()[0]?.message).toMatch(/does not offer/);
    await login.start({ agentId: "antigravity" });
    await waitFor(() => phaseOf(login, "antigravity") === "code-required");
    expect(login.list()[0]?.methodId).toBe("terminal-login");
  });

  it("an agent with no sign-in the program can run says so instead of trying", async () => {
    const { login } = setup([agent("keyonly", "no-methods")]);
    await login.start({ agentId: "keyonly" });
    await waitFor(() => phaseOf(login, "keyonly") === "error");
    expect(login.list()[0]?.message).toMatch(/offers no sign-in that the program can run/);
    expect(login.list()[0]?.methods).toEqual([]);
  });

  it("refuses a second start while one runs, an unknown agent and a code when none is asked for", async () => {
    const { login } = setup([agent("gemini", "link-code")]);
    await expect(login.start({ agentId: "nope" })).rejects.toThrow(/Unknown ACP agent/);
    await expect(login.submitCode({ agentId: "gemini", code: "x" })).rejects.toThrow(/No sign-in waits/);
    await login.start({ agentId: "gemini" });
    await expect(login.start({ agentId: "gemini" })).rejects.toThrow(/already running/);
    await waitFor(() => phaseOf(login, "gemini") === "code-required");
    await expect(login.submitCode({ agentId: "gemini", code: "   " })).rejects.toThrow(/Paste the code/);
    expect(phaseOf(login, "gemini")).toBe("code-required");
  });

  it("Cancel ends a running sign-in at once and stops the agent's process; cancelling when none runs changes nothing", async () => {
    const { login, events } = setup([agent("gemini", "link-code")]);
    expect((await login.cancel({ agentId: "gemini" })).phase).toBe("idle");
    await login.start({ agentId: "gemini" });
    await waitFor(() => phaseOf(login, "gemini") === "code-required");
    const cancelled = await login.cancel({ agentId: "gemini" });
    expect(cancelled).toMatchObject({ phase: "cancelled", url: null });
    const count = states(events, "gemini").length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(states(events, "gemini")).toHaveLength(count);
    expect(phaseOf(login, "gemini")).toBe("cancelled");
    // A new start after a cancel is allowed.
    await login.start({ agentId: "gemini" });
    await waitFor(() => phaseOf(login, "gemini") === "code-required");
  });

  it("an agent that does not start, or does not answer, is an error with the reason", async () => {
    const crash = setup([agent("crashy", "crash")]);
    await crash.login.start({ agentId: "crashy" });
    await waitFor(() => phaseOf(crash.login, "crashy") === "error");
    expect(crash.login.list()[0]?.message).toMatch(/stopped|could not start/);
    const gone = setup([{ ...agent("missing", "link-code"), command: "definitely-not-a-program-xyz" }]);
    await gone.login.start({ agentId: "missing" });
    await waitFor(() => phaseOf(gone.login, "missing") === "error");
    expect(gone.login.list()[0]?.message).toMatch(/could not start/);
    const quiet = setup([agent("quiet", "silent")], { startTimeoutMs: 150 });
    await quiet.login.start({ agentId: "quiet" });
    await waitFor(() => phaseOf(quiet.login, "quiet") === "error");
    expect(quiet.login.list()[0]?.message).toMatch(/did not answer/);
  });

  it("a sign-in that takes too long ends with an error", async () => {
    const { login } = setup([agent("gemini", "link-code")], { timeoutMs: 200 });
    await login.start({ agentId: "gemini" });
    await waitFor(() => phaseOf(login, "gemini") === "error");
    expect(login.list()[0]?.message).toMatch(/took too long/);
  });

  it("'Authentication required' from a turn shows the card, and a sign-in then replaces it", async () => {
    const { login, events } = setup([agent("gemini", "link-code")]);
    login.markNeedsLogin("gemini");
    expect(login.list()[0]).toMatchObject({ phase: "idle", signedIn: false });
    expect(login.list()[0]?.message).toMatch(/Authentication required/);
    expect(states(events, "gemini")).toHaveLength(1);
    login.markNeedsLogin("gemini");
    expect(states(events, "gemini")).toHaveLength(1);
    login.markNeedsLogin("not-configured");
    await login.start({ agentId: "gemini" });
    await waitFor(() => phaseOf(login, "gemini") === "code-required");
    login.markNeedsLogin("gemini");
    expect(phaseOf(login, "gemini")).toBe("code-required");
  });

  it("forgets an agent that is no longer configured", () => {
    const agents = [agent("a", "link-code"), agent("b", "link-code")];
    const events: AgentEvent[] = [];
    const login = new AcpLogin({ agents: () => agents, emit: (event) => events.push(event) });
    expect(login.list()).toHaveLength(2);
    agents.pop();
    expect(login.list().map((state) => state.agentId)).toEqual(["a"]);
  });
});
