import { describe, expect, it } from "vitest";
import {
  COMPOSER_LIMITS,
  clipSideAnswer,
  filterSlashCommands,
  isMentionCandidate,
  isSideQuestionChanged,
  isSlashCommand,
  parseSearchMentionsInput,
  parseSideQuestionInput,
  type SlashCommand,
} from "./ipc-composer";
import { isAgentEvent } from "./ipc-conversation";
import { clipSearchHit, isSearchResult, parseSearchInput, SEARCH_KINDS, SEARCH_LIMITS } from "./ipc-search";
import {
  closeTabs,
  isTabPermutation,
  isThreadTabsChanged,
  openTab,
  parseCloseThreadTabsInput,
  parseReorderThreadTabsInput,
  THREAD_TAB_LIMITS,
} from "./ipc-thread-tabs";

describe("search contract (W11 U3)", () => {
  it("trims the question, fills the defaults and refuses the rest", () => {
    expect(parseSearchInput({ q: "  launch   plan " })).toEqual({
      q: "launch plan",
      kinds: [...SEARCH_KINDS],
      limit: SEARCH_LIMITS.defaultLimit,
    });
    expect(parseSearchInput({ q: "x", kinds: ["files", "agents"], limit: 5 })).toEqual({
      q: "x",
      kinds: ["agents", "files"],
      limit: 5,
    });
    const bad = [
      null,
      {},
      { q: "   " },
      { q: "x".repeat(201) },
      { q: "x", kinds: [] },
      { q: "x", kinds: ["mail"] },
      { q: "x", limit: 0 },
      { q: "x", limit: 51 },
      { q: "x", limit: 1.5 },
    ];
    for (const input of bad) expect(() => parseSearchInput(input)).toThrow();
  });

  it("checks results and cuts long hits", () => {
    const clipped = clipSearchHit({
      kind: "messages",
      id: "m",
      title: "t".repeat(500),
      snippet: "s".repeat(500),
      botId: "b",
    });
    expect(clipped.title).toHaveLength(SEARCH_LIMITS.title);
    expect(clipped.snippet).toHaveLength(SEARCH_LIMITS.snippet);
    expect(isSearchResult({ q: "x", hits: [clipped], truncated: false })).toBe(true);
    expect(isSearchResult({ q: "x", hits: [{ ...clipped, kind: "mail" }], truncated: false })).toBe(false);
  });
});

describe("message box contract (W11 U4, U5)", () => {
  it("checks a side question", () => {
    expect(parseSideQuestionInput({ botId: "chief", text: "  why?  " })).toEqual({ botId: "chief", text: "why?" });
    expect(parseSideQuestionInput({ botId: "chief", text: "x", threadId: "t-1" })).toMatchObject({ threadId: "t-1" });
    expect(() => parseSideQuestionInput({ botId: "", text: "x" })).toThrow(/agent/);
    expect(() => parseSideQuestionInput({ botId: "a", text: "  " })).toThrow(/question/);
    expect(() => parseSideQuestionInput({ botId: "a", text: "x".repeat(COMPOSER_LIMITS.sideQuestion + 1) })).toThrow(
      /at most/,
    );
  });

  it("cuts a long answer with a note and carries the state in an event", () => {
    expect(clipSideAnswer("short")).toBe("short");
    expect(clipSideAnswer("x".repeat(COMPOSER_LIMITS.sideAnswer + 5))).toMatch(/The answer was cut here\.\]$/);
    const state = {
      questionId: "q",
      botId: "b",
      threadId: null,
      question: "?",
      status: "running" as const,
      answer: "",
      error: null,
      startedAt: "2026-11-17T12:00:00.000Z",
    };
    expect(isSideQuestionChanged({ type: "side-question-changed", state })).toBe(true);
    expect(isAgentEvent({ type: "side-question-changed", state })).toBe(true);
    expect(isAgentEvent({ type: "side-question-changed", state: { ...state, status: "lost" } })).toBe(false);
  });

  it("filters slash commands by what follows the slash, program ones first", () => {
    const commands: SlashCommand[] = [
      { name: "weekly", hint: "", kind: "skill" },
      { name: "compact", hint: "", kind: "program" },
      { name: "co-pilot", hint: "", kind: "skill" },
      { name: "new-thread", hint: "", kind: "program" },
    ];
    expect(filterSlashCommands(commands, "/co").map((command) => command.name)).toEqual(["compact", "co-pilot"]);
    expect(filterSlashCommands(commands, "").map((command) => command.name)).toEqual([
      "compact",
      "new-thread",
      "co-pilot",
      "weekly",
    ]);
    expect(isSlashCommand(commands[0])).toBe(true);
    expect(isSlashCommand({ name: "Bad Name", hint: "", kind: "skill" })).toBe(false);
  });

  it("checks a mention search and its candidates", () => {
    expect(parseSearchMentionsInput({ botId: "a", q: "@res" })).toEqual({
      botId: "a",
      q: "res",
      limit: COMPOSER_LIMITS.mentions,
    });
    expect(parseSearchMentionsInput({ botId: "a", q: "" }).q).toBe("");
    expect(() => parseSearchMentionsInput({ botId: "a" })).toThrow();
    expect(() => parseSearchMentionsInput({ botId: "a", q: "x", limit: 99 })).toThrow();
    expect(isMentionCandidate({ kind: "agent", id: "r", label: "Research", detail: "" })).toBe(true);
    expect(isMentionCandidate({ kind: "agent", id: "r", label: "", detail: "" })).toBe(false);
  });
});

describe("thread tabs contract (W11 U6)", () => {
  it("opens at the end, once, and drops the oldest over the limit", () => {
    expect(openTab(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(openTab(["a", "b"], "a")).toEqual(["a", "b"]);
    const full = Array.from({ length: THREAD_TAB_LIMITS.maxOpen }, (_, index) => `t${index}`);
    const next = openTab(full, "new");
    expect(next).toHaveLength(THREAD_TAB_LIMITS.maxOpen);
    expect(next[0]).toBe("t1");
    expect(next.at(-1)).toBe("new");
  });

  it("closes this, the others, or the ones to the right", () => {
    const tabs = ["a", "b", "c", "d"];
    expect(closeTabs(tabs, "b", "this")).toEqual(["a", "c", "d"]);
    expect(closeTabs(tabs, "b", "others")).toEqual(["b"]);
    expect(closeTabs(tabs, "b", "right")).toEqual(["a", "b"]);
    expect(closeTabs(tabs, "zzz", "others")).toEqual(tabs);
  });

  it("checks a new order and the requests", () => {
    expect(isTabPermutation(["a", "b"], ["b", "a"])).toBe(true);
    expect(isTabPermutation(["a", "b"], ["a", "a"])).toBe(false);
    expect(isTabPermutation(["a", "b"], ["a"])).toBe(false);
    expect(parseCloseThreadTabsInput({ botId: "x", threadId: "t", mode: "right" })).toMatchObject({ mode: "right" });
    expect(() => parseCloseThreadTabsInput({ botId: "x", threadId: "t", mode: "all" })).toThrow();
    expect(() => parseReorderThreadTabsInput({ botId: "x", threadIds: [1] })).toThrow();
    expect(isThreadTabsChanged({ type: "thread-tabs-changed", botId: "x", open: ["a"] })).toBe(true);
    expect(isAgentEvent({ type: "thread-tabs-changed", botId: "x", open: [1] })).toBe(false);
  });
});
