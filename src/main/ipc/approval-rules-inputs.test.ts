import { MOBILE_COMPUTER_ONLY } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { parseApprovalResponse } from "./agent-inputs";
import { parseApprovalRuleScope, parseApprovalRulesBotId, parseRevokeApprovalRule } from "./approval-rules-inputs";

describe("approval response with Always allow (W3-KK3)", () => {
  it("keeps the plain answers as they were", () => {
    expect(parseApprovalResponse({ requestId: 1, decision: "accept" })).toEqual({ requestId: 1, decision: "accept" });
    expect(parseApprovalResponse({ requestId: "a", decision: "decline", always: null })).toEqual({
      requestId: "a",
      decision: "decline",
    });
  });

  it("passes only the known fields of the scope", () => {
    expect(
      parseApprovalResponse({
        requestId: 1,
        decision: "accept",
        always: { prefix: "git status", folder: "C:work", access: "write", extra: "x" },
      }),
    ).toEqual({
      requestId: 1,
      decision: "accept",
      always: { prefix: "git status", folder: "C:work", access: "write" },
    });
    expect(parseApprovalResponse({ requestId: 1, decision: "accept", always: {} })).toEqual({
      requestId: 1,
      decision: "accept",
      always: {},
    });
  });

  it("refuses Always with Deny and a scope of the wrong shape", () => {
    expect(() => parseApprovalResponse({ requestId: 1, decision: "decline", always: {} })).toThrow(/only with Allow/);
    expect(() => parseApprovalResponse({ requestId: 1, decision: "accept", always: "yes" })).toThrow(/always-allow/);
    expect(() => parseApprovalResponse({ requestId: 1, decision: "accept", always: { prefix: 5 } })).toThrow(
      /always-allow/,
    );
    expect(() => parseApprovalResponse({ requestId: 1, decision: "accept", always: { access: "root" } })).toThrow(
      /always-allow/,
    );
    expect(() =>
      parseApprovalResponse({ requestId: 1, decision: "accept", always: { prefix: "x".repeat(501) } }),
    ).toThrow(/always-allow/);
  });

  it("validates the rule list and revoke inputs", () => {
    expect(parseApprovalRulesBotId(null)).toBeUndefined();
    expect(parseApprovalRulesBotId("chief")).toBe("chief");
    expect(() => parseApprovalRulesBotId(5)).toThrow();
    expect(parseRevokeApprovalRule({ ruleId: "r1" })).toEqual({ ruleId: "r1" });
    expect(() => parseRevokeApprovalRule({})).toThrow();
    expect(parseApprovalRuleScope({ prefix: "git status" })).toEqual({ prefix: "git status" });
  });

  it("a phone cannot read or change the rules", () => {
    expect(MOBILE_COMPUTER_ONLY).toContain("approval-rules");
  });
});
