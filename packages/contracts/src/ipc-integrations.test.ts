import { describe, expect, it } from "vitest";
import { isAgentEvent } from "./ipc-conversation";
import {
  emptyIntegrationStatus,
  INTEGRATION_INFO,
  INTEGRATION_SERVICES,
  integrationCallbackExample,
  integrationServerName,
  isAllowedMcpUrl,
  isIntegrationDescription,
  isIntegrationList,
  isIntegrationStatus,
  isIntegrationsChanged,
  parseConfigureIntegrationInput,
  parseDisconnectIntegrationInput,
  parseIntegrationServiceInput,
} from "./ipc-integrations";

const connected = {
  ...emptyIntegrationStatus("github", true),
  phase: "connected" as const,
  connectedAt: "2026-11-16T12:00:00.000Z",
  mcpServerName: "github",
};
const waiting = {
  ...emptyIntegrationStatus("github", true),
  phase: "waiting-for-browser" as const,
  waitingUntil: "2026-11-16T12:05:00.000Z",
  signInUrl: "https://github.com/login/oauth/authorize?client_id=x",
};

describe("integration contract (W10-KK1)", () => {
  it("every service has a label, read-only default scopes and owner steps; the names are the MCP names", () => {
    expect(INTEGRATION_SERVICES).toEqual(["github", "google", "notion", "meta"]);
    for (const service of INTEGRATION_SERVICES) {
      expect(INTEGRATION_INFO[service].label.length).toBeGreaterThan(2);
      expect(INTEGRATION_INFO[service].ownerSteps.length).toBeGreaterThanOrEqual(3);
      expect(integrationServerName(service)).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
      expect(INTEGRATION_INFO[service].defaultScopes.join(" ")).not.toMatch(/write|admin|delete|manage/i);
    }
  });

  it("MCP addresses: https, or http on this computer only; no passwords in the address", () => {
    for (const ok of ["https://mcp.example.com/mcp", "http://127.0.0.1:9000/mcp", "http://localhost/mcp"])
      expect(isAllowedMcpUrl(ok)).toBe(true);
    for (const bad of [
      "http://example.com/mcp",
      "ftp://example.com",
      "https://user:pw@example.com/",
      "not a url",
      "http://127.0.0.1.evil.com/mcp",
      "",
    ]) {
      expect(isAllowedMcpUrl(bad)).toBe(false);
    }
  });

  it("the status guard ties the phase to its fields", () => {
    expect(isIntegrationStatus(emptyIntegrationStatus("notion", false))).toBe(true);
    expect(isIntegrationStatus(emptyIntegrationStatus("notion", true))).toBe(true);
    expect(isIntegrationStatus(connected)).toBe(true);
    expect(isIntegrationStatus(waiting)).toBe(true);
    expect(isIntegrationStatus({ ...connected, mcpServerName: null })).toBe(false);
    expect(isIntegrationStatus({ ...connected, connectedAt: null })).toBe(false);
    expect(isIntegrationStatus({ ...waiting, waitingUntil: null })).toBe(false);
    expect(isIntegrationStatus({ ...connected, signInUrl: "https://x.example/" })).toBe(false);
    expect(isIntegrationStatus({ ...emptyIntegrationStatus("meta", true), phase: "failed" })).toBe(false);
    expect(
      isIntegrationStatus({ ...emptyIntegrationStatus("meta", true), phase: "failed", reason: "The service said no." }),
    ).toBe(true);
    expect(isIntegrationStatus({ ...emptyIntegrationStatus("meta", true), phase: "needs-login" })).toBe(false);
    expect(isIntegrationStatus({ ...emptyIntegrationStatus("meta", true), mcpServerName: "meta" })).toBe(false);
    expect(isIntegrationStatus({ ...connected, phase: "nope" })).toBe(false);
    expect(isIntegrationStatus({ ...connected, service: "slack" })).toBe(false);
  });

  it("the list has one entry per service; the event is in the agent event union", () => {
    const list = {
      spaceId: "main",
      services: INTEGRATION_SERVICES.map((service) => emptyIntegrationStatus(service, false)),
    };
    expect(isIntegrationList(list)).toBe(true);
    expect(isIntegrationList({ ...list, services: [list.services[0], list.services[0]] })).toBe(false);
    expect(isIntegrationsChanged({ type: "integrations-changed", ...list })).toBe(true);
    expect(isAgentEvent({ type: "integrations-changed", ...list })).toBe(true);
    expect(isAgentEvent({ type: "integrations-changed", spaceId: 1, services: [] })).toBe(false);
  });

  it("describe promises PKCE, a loopback callback and encrypted tokens", () => {
    const description = {
      ...INTEGRATION_INFO.github,
      callbackExample: integrationCallbackExample(null),
      tokenStorage: "encrypted-on-this-computer" as const,
      pkce: true as const,
      mcpUrl: null,
      clientIdSet: false,
      clientSecretSet: false,
      redirectPort: null,
    };
    expect(isIntegrationDescription(description)).toBe(true);
    expect(isIntegrationDescription({ ...description, callbackExample: "https://example.com/callback" })).toBe(false);
    expect(isIntegrationDescription({ ...description, pkce: false })).toBe(false);
    expect(isIntegrationDescription({ ...description, tokenStorage: "plain" })).toBe(false);
    expect(integrationCallbackExample(8765)).toBe("http://127.0.0.1:8765/callback");
  });

  it("requests are parsed first: a known service, tidy client data, a real port, tool names", () => {
    expect(parseIntegrationServiceInput({ service: "google" })).toEqual({ service: "google" });
    expect(() => parseIntegrationServiceInput({ service: "slack" })).toThrow(/one of/);
    expect(() => parseIntegrationServiceInput(null)).toThrow(/malformed/);
    expect(
      parseConfigureIntegrationInput({
        service: "notion",
        clientId: "  abc123  ",
        clientSecret: "s3cret",
        mcpUrl: "https://mcp.example.com/mcp",
        redirectPort: 38123,
        scopes: ["read", "read", "write"],
        toolAllowlist: ["search", "fetch"],
      }),
    ).toMatchObject({
      clientId: "abc123",
      redirectPort: 38123,
      scopes: ["read", "write"],
      toolAllowlist: ["search", "fetch"],
    });
    expect(
      parseConfigureIntegrationInput({
        service: "notion",
        clientSecret: null,
        mcpUrl: null,
        redirectPort: null,
        toolAllowlist: null,
      }),
    ).toEqual({
      service: "notion",
      clientSecret: null,
      mcpUrl: null,
      redirectPort: null,
      toolAllowlist: null,
    });
    for (const bad of [
      { clientId: "" },
      { clientId: "two words" },
      { clientId: "x".repeat(301) },
      { clientSecret: "" },
      { clientSecret: 5 },
      { mcpUrl: "http://example.com/mcp" },
      { redirectPort: 80 },
      { redirectPort: 70000 },
      { redirectPort: 1.5 },
      { scopes: [""] },
      { scopes: ["a b"] },
      { toolAllowlist: ["bad name"] },
      { toolAllowlist: "search" },
    ]) {
      expect(() => parseConfigureIntegrationInput({ service: "notion", ...bad })).toThrow();
    }
  });

  it("an error of the parser never repeats a long input or a secret", () => {
    const secret = `top-secret-${"x".repeat(600)}`;
    try {
      parseConfigureIntegrationInput({ service: "notion", clientSecret: secret });
    } catch (error) {
      expect(String(error)).not.toContain("top-secret");
    }
    try {
      parseConfigureIntegrationInput({ service: "notion", clientId: "a b top-secret" });
    } catch (error) {
      expect(String(error)).not.toContain("top-secret");
    }
  });

  it("disconnect says whether the client is forgotten too", () => {
    expect(parseDisconnectIntegrationInput({ service: "github", forgetClient: true })).toEqual({
      service: "github",
      forgetClient: true,
    });
    expect(() => parseDisconnectIntegrationInput({ service: "github" })).toThrow(/true or false/);
    expect(() => parseDisconnectIntegrationInput({ service: "github", forgetClient: "yes" })).toThrow(/true or false/);
  });
});
