import type { AgentEvent } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockAcpLogin } from "./mock-acp-login";

function setup() {
  const events: AgentEvent[] = [];
  const login = createMockAcpLogin((event) => events.push(event));
  return { events, login };
}

describe("mock ACP login", () => {
  it("lists the agents, signed-in state not known, with no methods before the first start", async () => {
    const { login } = setup();
    const list = await login.list();
    expect(list.map((state) => [state.agentId, state.phase, state.signedIn, state.methods.length])).toEqual([
      ["gemini", "idle", null, 0],
      ["antigravity", "idle", null, 0],
    ]);
  });

  it("start shows a link and asks for a code, offering only methods the program can run", async () => {
    const { events, login } = setup();
    const state = await login.start({ agentId: "gemini" });
    expect(state).toMatchObject({ phase: "code-required", methodId: "oauth-personal" });
    expect(state.url).toMatch(/^https:\/\//);
    expect(state.methods.map((method) => method.id)).toEqual(["oauth-personal", "terminal-login"]);
    expect(events.map((event) => (event.type === "acp-login-changed" ? event.state.phase : event.type))).toEqual([
      "starting",
      "code-required",
    ]);
  });

  it("a second start is refused while one runs; an unknown method and agent are refused", async () => {
    const { login } = setup();
    await login.start({ agentId: "gemini" });
    await expect(login.start({ agentId: "gemini" })).rejects.toThrow(/already running/);
    await expect(login.start({ agentId: "antigravity", methodId: "vertex-ai" })).rejects.toThrow(/does not offer/);
    await expect(login.start({ agentId: "nope" })).rejects.toThrow(/Unknown ACP agent/);
  });

  it("a code finishes the sign-in, the link is gone and the agent counts as signed in", async () => {
    const { login } = setup();
    await login.start({ agentId: "gemini" });
    const done = await login.submitCode({ agentId: "gemini", code: " 4/abc " });
    expect(done).toMatchObject({ phase: "success", url: null, signedIn: true });
    await expect(login.submitCode({ agentId: "gemini", code: "x" })).rejects.toThrow(/No sign-in waits/);
  });

  it("a wrong code is an error with a readable reason, and an empty code is refused first", async () => {
    const { login } = setup();
    await login.start({ agentId: "gemini" });
    await expect(login.submitCode({ agentId: "gemini", code: "  " })).rejects.toThrow(/Paste the code/);
    expect((await login.list())[0]?.phase).toBe("code-required");
    const failed = await login.submitCode({ agentId: "gemini", code: "wrong" });
    expect(failed).toMatchObject({ phase: "error", url: null });
    expect(failed.message).toMatch(/did not accept/);
    expect((await login.start({ agentId: "gemini" })).phase).toBe("code-required");
  });

  it("Cancel ends a running sign-in; cancelling when none runs changes nothing", async () => {
    const { events, login } = setup();
    await login.start({ agentId: "gemini" });
    expect(await login.cancel({ agentId: "gemini" })).toMatchObject({ phase: "cancelled", url: null });
    const count = events.length;
    expect((await login.cancel({ agentId: "gemini" })).phase).toBe("cancelled");
    expect(events).toHaveLength(count);
  });

  it("'Authentication required' shows the card: signed in false, nothing runs", async () => {
    const { login } = setup();
    const state = login.needsLogin("antigravity");
    expect(state).toMatchObject({ phase: "idle", signedIn: false });
    expect(state.message).toMatch(/Authentication required/);
    expect(login.reset("antigravity")).toMatchObject({ signedIn: null, message: null });
  });
});
