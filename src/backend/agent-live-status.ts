// COSGRAL: what a working agent does right now. The agent programs report their steps as items
// ("item/started"); this turns one item into one short status (a kind plus a small detail such as a file name),
// which the window shows as a plain Polish sentence next to the agent. Nothing here is stored.

import type { AgentLiveStatusKind } from "@openbot/contracts/ipc";
import { type DynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { getArray, isRecord } from "./protocol";

export interface AgentLiveStatus {
  kind: AgentLiveStatusKind;
  /** A file name or a tool name; never the text of a command (it may hold secrets). */
  detail?: string;
}

const DETAIL_LIMIT = 60;

function text(value: unknown): string | null {
  return isString(value) && value.trim() ? value.trim() : null;
}

function short(value: string): string {
  const clean = value.replace(/\s+/gu, " ");
  return clean.length > DETAIL_LIMIT ? `${clean.slice(0, DETAIL_LIMIT - 1)}…` : clean;
}

/** The last part of a path, so the person sees "plan.md" and not a long folder path. */
function baseName(path: string): string {
  const parts = path.split(/[\\/]+/u).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function withDetail(kind: AgentLiveStatusKind, detail: string | null): AgentLiveStatus {
  return detail ? { kind, detail: short(detail) } : { kind };
}

/** The first word of a command line: the program that runs ("git", "npm"), not its arguments. */
function programName(command: unknown): string | null {
  const line = Array.isArray(command) ? command.filter((part) => isString(part)).join(" ") : text(command);
  if (!line) return null;
  const first = line.trim().split(/\s+/u)[0] ?? "";
  return first ? baseName(first) : null;
}

function commandStatus(item: DynamicRecord): AgentLiveStatus {
  const actions = getArray(item, "commandActions").filter(isRecord);
  const action = actions[0];
  if (action && actions.every((candidate) => candidate.type === action.type)) {
    const path = text(action.path) ?? text(action.name);
    if (action.type === "read") return withDetail("reading", path ? baseName(path) : null);
    if (action.type === "search") return withDetail("searching-files", null);
    if (action.type === "listFiles") return withDetail("listing-files", null);
  }
  return withDetail("running", programName(item.command));
}

/** Claude tool names (Read, Grep, Bash, ...) become the same kinds as the Codex items. */
function toolUseStatus(item: DynamicRecord): AgentLiveStatus {
  const tool = text(item.tool) ?? text(item.name) ?? "";
  const input: DynamicRecord = isRecord(item.input) ? item.input : {};
  const path = text(input.file_path) ?? text(input.path) ?? text(input.notebook_path);
  switch (tool) {
    case "Read":
      return withDetail("reading", path ? baseName(path) : null);
    case "Grep":
      return withDetail("searching-files", null);
    case "Glob":
    case "LS":
      return withDetail("listing-files", null);
    case "Bash":
    case "BashOutput":
      return withDetail("running", programName(input.command));
    case "Edit":
    case "MultiEdit":
    case "Write":
    case "NotebookEdit":
      return withDetail("changing-files", path ? baseName(path) : null);
    case "WebSearch":
    case "WebFetch":
      return { kind: "searching-web" };
    default:
      return withDetail("using-tool", tool || null);
  }
}

/** The status for one started item, or null for an item that says nothing about the work (the person's own message). */
export function liveStatusOfItem(item: unknown): AgentLiveStatus | null {
  if (!isRecord(item) || !isString(item.type)) return null;
  switch (item.type) {
    case "reasoning":
    case "plan":
      return { kind: "thinking" };
    case "agentMessage":
      // A short message between steps ("commentary") is the agent thinking aloud; the final answer is writing.
      return { kind: item.phase === "commentary" ? "thinking" : "writing" };
    case "commandExecution":
      return commandStatus(item);
    case "fileChange":
      return { kind: "changing-files" };
    case "webSearch":
      return { kind: "searching-web" };
    case "imageView":
      return { kind: "reading" };
    case "mcpToolCall":
    case "dynamicToolCall":
    case "collabToolCall":
    case "collabAgentToolCall":
      return withDetail("using-tool", text(item.tool));
    case "toolUse":
      return toolUseStatus(item);
    case "contextCompaction":
      return { kind: "tidying" };
    default:
      return null;
  }
}
