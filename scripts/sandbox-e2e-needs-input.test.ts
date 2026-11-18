import { describe, expect, it } from "vitest";

// Mirrors scripts/sandbox-e2e.ts getter-smoke filter (T-AD / BE-V): validation messages are not FAILs.
const needsInput =
  /required|Expected an object|Invalid [a-z ]*request|request is malformed|not configured|Choose an agent|Choose a server|Choose a routine|period is 7/i;

describe("sandbox-e2e needsInput", () => {
  it("treats channelRoutines.listRuns without routineId as needs-input, not FAIL", () => {
    expect(needsInput.test("Choose a routine.")).toBe(true);
    expect(needsInput.test("Error invoking remote method 'channel-routines:list-runs': Error: Choose a routine.")).toBe(
      true,
    );
  });

  it("still fails real wiring errors", () => {
    expect(needsInput.test("timeout")).toBe(false);
    expect(needsInput.test("not a function")).toBe(false);
  });
});
