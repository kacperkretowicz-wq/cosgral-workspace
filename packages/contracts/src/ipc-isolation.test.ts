// COSGRAL W8-BE2: the contract of the isolation of processes (spec-w8.md 1B, W8-09…11; Q2).
import { describe, expect, it } from "vitest";
import { ACCESS_DENIAL_REASONS, isAccessDenied } from "./ipc-access";
import { isAgentEvent } from "./ipc-conversation";
import {
  defaultAvailability,
  ISOLATION_MAX_PROCESSES,
  type IsolationAvailability,
  isAgentIsolation,
  isIsolationAvailability,
  isIsolationChanged,
  isolationFor,
  isolationOffCard,
  isolationRefusesDiskTools,
  parseIsolationAgentInput,
  parseSetIsolationEnabledInput,
} from "./ipc-isolation";

const can: IsolationAvailability = {
  checkedAt: "2026-11-16T12:00:00.000Z",
  mechanism: "job-object",
  jobObject: { ok: true, reason: null },
  appContainer: { ok: true, reason: null },
  windows: "10.0.19045",
};
const cannot: IsolationAvailability = {
  ...can,
  mechanism: "none",
  jobObject: { ok: false, reason: "Windows only." },
  appContainer: { ok: false, reason: "Windows only." },
};

describe("isolationFor: what is in force for an agent", () => {
  it("an agent with processes of its own runs them in a Job Object with a cap", () => {
    const isolation = isolationFor({ botId: "a", enabled: true, availability: can, ownProcesses: true });
    expect(isolation).toMatchObject({
      state: "active",
      mechanism: "job-object",
      reason: null,
      maxProcesses: ISOLATION_MAX_PROCESSES,
    });
  });

  it("an agent whose provider shares one program is NOT said to be isolated, and the sentence says why", () => {
    const isolation = isolationFor({ botId: "a", enabled: true, availability: can, ownProcesses: false });
    expect(isolation.state).toBe("shared-process");
    expect(isolation.mechanism).toBe("none");
    expect(isolation.reason).toMatch(/one program for every agent/);
  });

  it("a computer that cannot isolate gives 'unavailable' with the reason, never 'active' (W8-11)", () => {
    const isolation = isolationFor({ botId: "a", enabled: true, availability: cannot, ownProcesses: true });
    expect(isolation).toMatchObject({ state: "unavailable", mechanism: "none" });
    expect(isolation.reason).toContain("Windows only.");
    expect(isolation.reason).toContain("refused below Full access");
  });

  it("a switch that is off says so, whatever the computer can do", () => {
    expect(isolationFor({ botId: "a", enabled: false, availability: can, ownProcesses: true }).state).toBe("off");
    expect(isolationFor({ botId: "a", enabled: false, availability: cannot, ownProcesses: true }).state).toBe("off");
  });

  it("the default before any check is 'not checked', and nothing is claimed", () => {
    const start = defaultAvailability();
    expect(start.mechanism).toBe("none");
    expect(isolationFor({ botId: "a", enabled: true, availability: start, ownProcesses: true }).state).toBe(
      "unavailable",
    );
  });
});

describe("Q2: no silent full disk", () => {
  it("unavailable isolation refuses the disk tools below Full access, and only there", () => {
    const unavailable = isolationFor({ botId: "a", enabled: true, availability: cannot, ownProcesses: true });
    expect(isolationRefusesDiskTools(unavailable, "working-folder")).toBe(true);
    expect(isolationRefusesDiskTools(unavailable, "ask-first")).toBe(true);
    expect(isolationRefusesDiskTools(unavailable, "full")).toBe(false);
    const active = isolationFor({ botId: "a", enabled: true, availability: can, ownProcesses: true });
    expect(isolationRefusesDiskTools(active, "working-folder")).toBe(false);
    const off = isolationFor({ botId: "a", enabled: false, availability: cannot, ownProcesses: true });
    expect(isolationRefusesDiskTools(off, "working-folder")).toBe(false);
  });

  it("a refusal of this kind has its own reason that the window can show", () => {
    expect(ACCESS_DENIAL_REASONS).toContain("isolation-unavailable");
    expect(
      isAccessDenied({
        type: "access-denied",
        botId: "a",
        threadId: null,
        kind: "command",
        reason: "isolation-unavailable",
        path: null,
        message: "Isolation is not available on this computer.",
      }),
    ).toBe(true);
  });
});

describe("guards, parsers and the card", () => {
  it("accepts what the program sends and nothing else", () => {
    expect(isIsolationAvailability(can)).toBe(true);
    expect(isIsolationAvailability({ ...can, mechanism: "vm" })).toBe(false);
    const isolation = isolationFor({ botId: "a", enabled: true, availability: can, ownProcesses: true });
    expect(isAgentIsolation(isolation)).toBe(true);
    expect(isAgentIsolation({ ...isolation, state: "isolated" })).toBe(false);
    const event = { type: "isolation-changed", availability: can, agents: [isolation] };
    expect(isIsolationChanged(event)).toBe(true);
    expect(isAgentEvent(event)).toBe(true);
    expect(isAgentEvent({ ...event, agents: [{}] })).toBe(false);
  });

  it("parses the input of the calls before any work", () => {
    expect(parseIsolationAgentInput({ botId: "a" })).toEqual({ botId: "a" });
    expect(() => parseIsolationAgentInput({ botId: "" })).toThrow("Choose an agent");
    expect(parseSetIsolationEnabledInput({ botId: "a", enabled: false })).toEqual({ botId: "a", enabled: false });
    expect(() => parseSetIsolationEnabledInput({ botId: "a", enabled: "no" })).toThrow("on or off");
  });

  it("the card for turning it off names the agent and says what is lost", () => {
    const card = isolationOffCard({ agentName: "Chief" });
    expect(card.title).toContain("Chief");
    expect(card.preview).toContain("access level");
  });
});
