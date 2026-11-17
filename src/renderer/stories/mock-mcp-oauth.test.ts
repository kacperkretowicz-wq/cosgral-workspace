// @vitest-environment node
import {
  type AgentEvent,
  isMcpOAuthChanged,
  isMcpOAuthList,
  isMcpOAuthStatus,
  parseMcpOAuthServerInput,
} from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockMcpOAuth } from "./mock-mcp-oauth";

const setup = () => {
  const events: AgentEvent[] = [];
  return { api: createMockMcpOAuth((event) => events.push(event)), events };
};

function statesOf(events: AgentEvent[], serverId: string): string[] {
  return events.flatMap((event) =>
    isMcpOAuthChanged(event) ? [event.statuses.find((status) => status.serverId === serverId)?.state ?? ""] : [],
  );
}

describe("mock MCP sign-in (W12-KK 1)", () => {
  it("starts signed out, valid, and a bad request is refused", async () => {
    const { api } = setup();
    const list = await api.list();
    expect(isMcpOAuthList(list)).toBe(true);
    expect(list.statuses.every((status) => status.state === "signed-out")).toBe(true);
    expect(() => parseMcpOAuthServerInput({ serverId: "" })).toThrow(/Choose a server/);
    await expect(api.status({ serverId: "nope" })).rejects.toThrow(/not known/);
  });

  it("sign-in answers at once, then ends by an event", async () => {
    const { api, events } = setup();
    const waiting = await api.signIn({ serverId: "demo-docs" });
    expect(waiting.state).toBe("waiting-browser");
    expect(isMcpOAuthStatus(waiting)).toBe(true);
    api.simulate.approved("demo-docs");
    const done = await api.status({ serverId: "demo-docs" });
    expect(done.state).toBe("signed-in");
    expect(done.tokenExpiresAt).not.toBeNull();
    expect(isMcpOAuthChanged(events.at(-1))).toBe(true);
    expect(statesOf(events, "demo-docs")).toEqual(["waiting-browser", "exchanging", "signed-in"]);
  });

  it("a refusal, a wrong answer and a timeout each end as a fixed sentence with a code, and a new attempt is possible", async () => {
    const { api } = setup();
    await api.signIn({ serverId: "demo-docs" });
    api.simulate.denied("demo-docs");
    expect(await api.status({ serverId: "demo-docs" })).toMatchObject({ state: "failed", errorCode: "denied" });
    await api.signIn({ serverId: "demo-docs" });
    api.simulate.wrongState("demo-docs");
    expect(await api.status({ serverId: "demo-docs" })).toMatchObject({ state: "failed", errorCode: "state-mismatch" });
    await api.signIn({ serverId: "demo-docs" });
    api.simulate.timedOut("demo-docs");
    const timed = await api.status({ serverId: "demo-docs" });
    expect(timed).toMatchObject({ state: "failed", errorCode: "timeout" });
    expect(isMcpOAuthStatus(timed)).toBe(true);
    expect((await api.signIn({ serverId: "demo-docs" })).state).toBe("waiting-browser");
  });

  it("cancel stops a waiting attempt only; sign-out and revoked tokens leave a clean signed-out state", async () => {
    const { api } = setup();
    await api.signIn({ serverId: "demo-board" });
    expect((await api.cancel({ serverId: "demo-board" })).state).toBe("signed-out");
    expect((await api.cancel({ serverId: "demo-board" })).state).toBe("signed-out");
    await api.signIn({ serverId: "demo-board" });
    api.simulate.approved("demo-board");
    api.simulate.tokensRevoked("demo-board");
    expect(await api.status({ serverId: "demo-board" })).toMatchObject({ state: "signed-out", tokenExpiresAt: null });
    await api.signIn({ serverId: "demo-board" });
    api.simulate.approved("demo-board");
    expect(await api.signOut({ serverId: "demo-board" })).toMatchObject({ state: "signed-out", tokenExpiresAt: null });
  });
});
