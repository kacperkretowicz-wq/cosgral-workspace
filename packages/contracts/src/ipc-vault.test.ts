import { describe, expect, it } from "vitest";
import {
  isAgentEvent,
  isPendingAgentRequest,
  isVaultItemSummary,
  isVaultRequest,
  PENDING_AGENT_REQUEST_KINDS,
} from "./ipc";

const AT = "2026-11-13T03:30:00.000Z";
const login = {
  id: "v1",
  kind: "login",
  label: "Test bank",
  origin: "https://bank.example",
  username: "tester",
  hasTwoStepKey: true,
  cardLast4: null,
  cardExpiry: null,
  name: null,
  createdAt: AT,
  updatedAt: AT,
};
const request = {
  requestId: "vault-1",
  botId: "chief",
  threadId: "thread-1",
  turnId: "turn-1",
  mode: "choose",
  kind: "login",
  reason: "Sign in to the test bank",
  origin: "https://bank.example",
  label: null,
  candidateIds: ["v1", "v2"],
  createdAt: AT,
};

describe("W2 vault contract", () => {
  it("lists items without any secret value", () => {
    expect(isVaultItemSummary(login)).toBe(true);
    expect(
      isVaultItemSummary({
        ...login,
        kind: "card",
        origin: null,
        username: null,
        cardLast4: "4242",
        cardExpiry: "12/29",
      }),
    ).toBe(true);
    expect(isVaultItemSummary({ ...login, kind: "password" })).toBe(false);
    // A summary that carries a secret field is not a summary.
    expect(isVaultItemSummary({ ...login, password: "hunter2" })).toBe(false);
    expect(isVaultItemSummary({ ...login, cardNumber: "4242424242424242" })).toBe(false);
  });

  it("asks a person for a missing item or to choose between matches, as a Needs you card", () => {
    expect(isVaultRequest(request)).toBe(true);
    expect(isVaultRequest({ ...request, mode: "guess" })).toBe(false);
    expect(PENDING_AGENT_REQUEST_KINDS).toContain("vault-request");
    expect(isPendingAgentRequest({ kind: "vault-request", request })).toBe(true);
    expect(isAgentEvent({ type: "vault-request", request })).toBe(true);
    expect(
      isAgentEvent({ type: "vault-request-resolved", requestId: "vault-1", botId: "chief", resolution: "provided" }),
    ).toBe(true);
    expect(
      isAgentEvent({ type: "vault-request-resolved", requestId: "vault-1", botId: "chief", resolution: "guessed" }),
    ).toBe(false);
    expect(isAgentEvent({ type: "vault-changed", items: [login] })).toBe(true);
    expect(isAgentEvent({ type: "vault-changed", items: [{ ...login, password: "x" }] })).toBe(false);
  });
});
