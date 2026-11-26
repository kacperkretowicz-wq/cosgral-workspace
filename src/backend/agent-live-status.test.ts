import { describe, expect, it } from "vitest";
import { liveStatusOfItem } from "./agent-live-status";

describe("liveStatusOfItem", () => {
  it("says a command that reads a file is reading it, with the file name only", () => {
    expect(
      liveStatusOfItem({
        type: "commandExecution",
        command: "cat /home/me/work/plan.md",
        commandActions: [{ type: "read", name: "plan.md", path: "/home/me/work/plan.md" }],
      }),
    ).toEqual({ kind: "reading", detail: "plan.md" });
  });

  it("maps search and list commands, and shows only the program of any other command", () => {
    expect(liveStatusOfItem({ type: "commandExecution", commandActions: [{ type: "search", query: "x" }] })).toEqual({
      kind: "searching-files",
    });
    expect(liveStatusOfItem({ type: "commandExecution", commandActions: [{ type: "listFiles" }] })).toEqual({
      kind: "listing-files",
    });
    expect(
      liveStatusOfItem({ type: "commandExecution", command: "git push --token=secret", commandActions: [] }),
    ).toEqual({ kind: "running", detail: "git" });
    expect(liveStatusOfItem({ type: "commandExecution", command: ["npm", "test"] })).toEqual({
      kind: "running",
      detail: "npm",
    });
  });

  it("maps files, web, tools, thinking, writing and tidying", () => {
    expect(liveStatusOfItem({ type: "fileChange" })).toEqual({ kind: "changing-files" });
    expect(liveStatusOfItem({ type: "webSearch", query: "pogoda" })).toEqual({ kind: "searching-web" });
    expect(liveStatusOfItem({ type: "mcpToolCall", tool: "calendar" })).toEqual({
      kind: "using-tool",
      detail: "calendar",
    });
    expect(liveStatusOfItem({ type: "reasoning" })).toEqual({ kind: "thinking" });
    expect(liveStatusOfItem({ type: "agentMessage", phase: "commentary" })).toEqual({ kind: "thinking" });
    expect(liveStatusOfItem({ type: "agentMessage", phase: "final_answer" })).toEqual({ kind: "writing" });
    expect(liveStatusOfItem({ type: "contextCompaction" })).toEqual({ kind: "tidying" });
  });

  it("maps Claude tools", () => {
    expect(liveStatusOfItem({ type: "toolUse", tool: "Read", input: { file_path: "C:\\a\\b\\notatki.txt" } })).toEqual({
      kind: "reading",
      detail: "notatki.txt",
    });
    expect(liveStatusOfItem({ type: "toolUse", tool: "Grep", input: {} })).toEqual({ kind: "searching-files" });
    expect(liveStatusOfItem({ type: "toolUse", tool: "WebFetch", input: {} })).toEqual({ kind: "searching-web" });
    expect(liveStatusOfItem({ type: "toolUse", tool: "Edit", input: { file_path: "/x/y.ts" } })).toEqual({
      kind: "changing-files",
      detail: "y.ts",
    });
    expect(liveStatusOfItem({ type: "toolUse", tool: "Weird", input: {} })).toEqual({
      kind: "using-tool",
      detail: "Weird",
    });
  });

  it("ignores the person's own message and unknown items", () => {
    expect(liveStatusOfItem({ type: "userMessage" })).toBeNull();
    expect(liveStatusOfItem(null)).toBeNull();
    expect(liveStatusOfItem({ type: "somethingNew" })).toBeNull();
  });
});
