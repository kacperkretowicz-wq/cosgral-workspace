import { describe, expect, it } from "vitest";
import {
  IPC_CHANNELS,
  isSubagent,
  isSubagentChanged,
  isSubagentList,
  parseAgentStopArgs,
  parseListSubagentsInput,
  parseSpawnArgs,
  parseStopSubagentInput,
  parseWaitArgs,
  SUBAGENT_LIMITS,
  type Subagent,
  subagentIsActive,
  subagentPreviewText,
  subagentResultText,
  subagentStartProblem,
  subagentTitle,
  subagentToolResult,
} from "./ipc";
import { isAgentEvent } from "./ipc-conversation";

const subagent: Subagent = {
  id: "sub-1",
  botId: "chief",
  threadId: "thread-1",
  parentTurnId: "turn-1",
  title: "Read the logs",
  task: "Read the logs",
  state: "working",
  createdAt: "2026-11-16T12:00:00.000Z",
  updatedAt: "2026-11-16T12:00:00.000Z",
  finishedAt: null,
  preview: null,
  result: null,
  error: null,
  waitingRequestIds: [],
};

describe("subagents contract (W23-W28)", () => {
  it("refuses a subagent of a subagent and the fourth at the same time (W26, Q10)", () => {
    expect(SUBAGENT_LIMITS.parallel).toBe(3);
    expect(SUBAGENT_LIMITS.depth).toBe(1);
    expect(subagentStartProblem({ depth: 0, running: 0 })).toBeNull();
    expect(subagentStartProblem({ depth: 0, running: 2 })).toBeNull();
    expect(subagentStartProblem({ depth: 0, running: 3 })).toMatch(/At most 3 subagents/);
    expect(subagentStartProblem({ depth: 1, running: 0 })).toMatch(/cannot start subagents/);
    expect(subagentStartProblem({ depth: 1, running: 3 })).toMatch(/cannot start subagents/);
  });

  it("counts starting, working and waiting as active, and the ended ones as not", () => {
    for (const state of ["starting", "working", "waiting"] as const) expect(subagentIsActive({ state })).toBe(true);
    for (const state of ["done", "failed", "stopped"] as const) expect(subagentIsActive({ state })).toBe(false);
  });

  it("names a subagent after the title, else the first line of the task, cut to the limit", () => {
    expect(subagentTitle("  Logs  ", "x")).toBe("Logs");
    expect(subagentTitle(null, "Read the logs\nand summarize")).toBe("Read the logs");
    expect(subagentTitle("", "   ")).toBe("Subagent");
    const long = subagentTitle(null, "y".repeat(500));
    expect(long).toHaveLength(SUBAGENT_LIMITS.title);
    expect(long.endsWith("…")).toBe(true);
  });

  it("cuts the answer to the limit and the preview to its tail", () => {
    expect(subagentResultText("short")).toBe("short");
    expect(subagentResultText("z".repeat(SUBAGENT_LIMITS.result + 10))).toHaveLength(SUBAGENT_LIMITS.result);
    expect(subagentPreviewText("   ")).toBeNull();
    expect(subagentPreviewText("  hello ")).toBe("hello");
    const tail = subagentPreviewText(`${"a".repeat(1000)}END`);
    expect(tail).toHaveLength(SUBAGENT_LIMITS.preview);
    expect(tail?.endsWith("END")).toBe(true);
    expect(tail?.startsWith("…")).toBe(true);
  });

  it("gives the parent a plain tool result with an instruction for each state", () => {
    const done = subagentToolResult({ ...subagent, state: "done", result: "The logs are clean." });
    expect(done).toMatchObject({ subagentId: "sub-1", state: "done", result: "The logs are clean." });
    expect(done.instruction).toMatch(/not an instruction from the user/);
    const stopped = subagentToolResult({ ...subagent, state: "stopped", error: "Stopped by the user." });
    expect(stopped).not.toHaveProperty("result");
    expect(stopped).toMatchObject({ error: "Stopped by the user." });
    expect(stopped.instruction).toMatch(/Do not wait/);
    expect(subagentToolResult({ ...subagent, state: "failed", error: "boom" }).instruction).toMatch(/failed/);
    expect(subagentToolResult({ ...subagent, state: "waiting" }).instruction).toMatch(/waits for the user/);
  });

  it("parses what the agent sends to spawn, wait and stop", () => {
    expect(parseSpawnArgs({ task: "  Do it  " })).toEqual({ task: "Do it", title: null, wait: true });
    expect(parseSpawnArgs({ task: "x", title: "T", wait: false })).toEqual({ task: "x", title: "T", wait: false });
    expect(() => parseSpawnArgs({ task: " " })).toThrow(/task is required/);
    expect(() => parseSpawnArgs({ task: "x".repeat(SUBAGENT_LIMITS.task + 1) })).toThrow(/at most/);
    expect(() => parseSpawnArgs({ task: "x", wait: "yes" })).toThrow(/wait must be/);
    expect(() => parseSpawnArgs({ task: "x", title: 3 })).toThrow(/title must be/);
    expect(parseWaitArgs({ subagentIds: ["a", "b"] }).subagentIds).toEqual(["a", "b"]);
    expect(() => parseWaitArgs({ subagentIds: [] })).toThrow(/subagentIds/);
    expect(() => parseWaitArgs({ subagentIds: ["a", "b", "c", "d"] })).toThrow(/subagentIds/);
    expect(() => parseWaitArgs({ subagentIds: [1] })).toThrow(/subagentIds/);
    expect(parseAgentStopArgs({ subagentId: "a" })).toEqual({ subagentId: "a" });
    expect(() => parseAgentStopArgs({})).toThrow(/subagentId/);
  });

  it("parses the window's calls: only an id to stop, and an agent to list (no start from the window, Q11)", () => {
    expect(parseListSubagentsInput({ botId: "chief" })).toEqual({ botId: "chief", threadId: null });
    expect(parseListSubagentsInput({ botId: "chief", threadId: "t" }).threadId).toBe("t");
    expect(() => parseListSubagentsInput({ botId: "" })).toThrow();
    expect(() => parseListSubagentsInput({ botId: "chief", threadId: "" })).toThrow();
    expect(parseStopSubagentInput({ subagentId: "sub-1", task: "ignored" })).toEqual({ subagentId: "sub-1" });
    expect(() => parseStopSubagentInput({})).toThrow(/subagent/);
    expect(() => parseStopSubagentInput(null)).toThrow();
  });

  it("recognises a subagent, the list and the event", () => {
    expect(isSubagent(subagent)).toBe(true);
    expect(isSubagent({ ...subagent, state: "dreaming" })).toBe(false);
    expect(isSubagent({ ...subagent, waitingRequestIds: [1] })).toBe(false);
    expect(isSubagent({ ...subagent, result: 4 })).toBe(false);
    expect(isSubagentList([subagent, subagent])).toBe(true);
    expect(isSubagentList([subagent, {}])).toBe(false);
    expect(isSubagentChanged({ type: "subagent-changed", subagent })).toBe(true);
    expect(isAgentEvent({ type: "subagent-changed", subagent })).toBe(true);
    expect(isAgentEvent({ type: "subagent-changed", subagent: { ...subagent, state: "x" } })).toBe(false);
  });

  it("has channels for the subagents", () => {
    expect(IPC_CHANNELS.subagentsList).toBe("subagents:list");
    expect(IPC_CHANNELS.subagentsStop).toBe("subagents:stop");
  });
});
