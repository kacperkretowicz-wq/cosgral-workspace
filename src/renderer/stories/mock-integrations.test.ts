// @vitest-environment node
import {
  type AgentEvent,
  isIntegrationDescription,
  isIntegrationList,
  isIntegrationStatus,
  parseDisconnectIntegrationInput,
} from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockIntegrations } from "./mock-integrations";

const setup = () => {
  const events: AgentEvent[] = [];
  return { api: createMockIntegrations((event) => events.push(event)), events };
};
const phaseOf = async (api: ReturnType<typeof setup>["api"], service: "github" | "google" | "notion" | "meta") =>
  (await api.status({ service })).phase;

describe("mock integrations (W10-KK1)", () => {
  it("starts with four services that are not configured, and valid", async () => {
    const { api } = setup();
    const list = await api.list();
    expect(isIntegrationList(list)).toBe(true);
    expect(list.services.map((entry) => entry.phase)).toEqual([
      "not-configured",
      "not-configured",
      "not-configured",
      "not-configured",
    ]);
    const description = await api.describe({ service: "notion" });
    expect(isIntegrationDescription(description)).toBe(true);
    expect(description).toMatchObject({ clientIdSet: false, pkce: true });
  });

  it("connecting needs a client id; configuring makes the service ready; the secret is never described back", async () => {
    const { api } = setup();
    await expect(api.connect({ service: "github" })).rejects.toThrow(/client id/);
    await api.configure({ service: "github", clientId: "abc", clientSecret: "shh" });
    expect(await phaseOf(api, "github")).toBe("disconnected");
    const description = await api.describe({ service: "github" });
    expect(description).toMatchObject({ clientIdSet: true, clientSecretSet: true });
    expect(JSON.stringify(description)).not.toContain("shh");
    expect(JSON.stringify(await api.list())).not.toContain("shh");
  });

  it("connect answers with the waiting phase and a deadline; the end comes as an event", async () => {
    const { api, events } = setup();
    await api.configure({ service: "github", clientId: "abc" });
    const waiting = await api.connect({ service: "github" });
    expect(isIntegrationStatus(waiting)).toBe(true);
    expect(waiting).toMatchObject({ phase: "waiting-for-browser" });
    expect(waiting.signInUrl).not.toBeNull();
    api.simulate.complete("github");
    expect(await api.status({ service: "github" })).toMatchObject({
      phase: "connected",
      mcpServerName: "github",
      signInUrl: null,
    });
    expect(events.at(-1)).toMatchObject({ type: "integrations-changed" });
  });

  it("a failed try says why and can be tried again; cancel stops a waiting try", async () => {
    const { api } = setup();
    await api.configure({ service: "google", clientId: "abc" });
    await api.connect({ service: "google" });
    api.simulate.fail("google", "You did not allow the access.");
    expect(await api.status({ service: "google" })).toMatchObject({
      phase: "failed",
      reason: "You did not allow the access.",
    });
    await api.connect({ service: "google" });
    expect(await phaseOf(api, "google")).toBe("waiting-for-browser");
    expect(await api.cancel({ service: "google" })).toMatchObject({ phase: "disconnected", signInUrl: null });
  });

  it("an expired sign-in needs a new login; the list stays valid", async () => {
    const { api } = setup();
    await api.configure({ service: "notion", clientId: "abc" });
    await api.connect({ service: "notion" });
    api.simulate.complete("notion");
    api.simulate.expire("notion");
    expect(await api.status({ service: "notion" })).toMatchObject({ phase: "needs-login" });
    expect(isIntegrationList(await api.list())).toBe(true);
  });

  it("disconnect removes the sign-in and the MCP entry; the client stays unless it is forgotten; the allowlist is kept", async () => {
    const { api } = setup();
    await api.configure({ service: "meta", clientId: "abc", toolAllowlist: ["read_ads"] });
    await api.connect({ service: "meta" });
    api.simulate.complete("meta");
    await api.disconnect({ service: "meta", forgetClient: false });
    expect(await api.status({ service: "meta" })).toMatchObject({
      phase: "disconnected",
      mcpServerName: null,
      connectedAt: null,
      toolAllowlist: ["read_ads"],
    });
    await api.disconnect({ service: "meta", forgetClient: true });
    expect(await phaseOf(api, "meta")).toBe("not-configured");
    expect((await api.describe({ service: "meta" })).clientIdSet).toBe(false);
  });

  it("bad input is refused the way the program refuses it", async () => {
    const { api } = setup();
    await expect(api.configure({ service: "github", clientId: "two words" })).rejects.toThrow(/single word/);
    await expect(api.configure({ service: "github", redirectPort: 80 })).rejects.toThrow(/1024/);
    await expect(api.disconnect({ service: "github", forgetClient: Number("x") > 0 })).resolves.toBeDefined();
    expect(() => parseDisconnectIntegrationInput({ service: "github" })).toThrow(/true or false/);
  });
});
