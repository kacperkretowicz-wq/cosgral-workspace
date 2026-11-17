// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BotSummary, type ConversationSnapshot, isSearchResult, SEARCH_LIMITS } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { OpenBotDatabase } from "./openbot-database";
import { SearchService, type SearchSources, snippetAround } from "./search-service";

const roots: string[] = [];
const opened: OpenBotDatabase[] = [];
afterEach(async () => {
  for (const database of opened.splice(0)) database.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function sources(overrides: Partial<SearchSources> = {}): SearchSources {
  return {
    agents: () => [
      { id: "chief", name: "Chief", role: "Runs the launch" },
      { id: "research", name: "Research", role: "Finds sources" },
    ],
    channels: () => [
      { id: "launch", name: "launch-plan", title: "Launch plan", archived: false },
      { id: "old", name: "old-launch", title: "Old launch", archived: true },
    ],
    messages: () => [],
    files: () => [],
    routines: () => [
      { id: "r1", botId: "research", name: "Morning brief", prompt: "Summarise the launch news every day" },
    ],
    agentName: (botId) => (botId === "chief" ? "Chief" : null),
    ...overrides,
  };
}

describe("SearchService (W11 U3)", () => {
  it("finds agents, channels and routines by a plain, case-insensitive match; archived channels are not found", () => {
    const result = new SearchService(sources()).query({ q: "LAUNCH" });
    expect(isSearchResult(result)).toBe(true);
    expect(result.hits.map((hit) => `${hit.kind}:${hit.id}`)).toEqual([
      "agents:chief",
      "channels:launch",
      "routines:r1",
    ]);
    expect(result.hits[2]?.snippet).toContain("launch news");
    expect(result.truncated).toBe(false);
  });

  it("only looks in the kinds that were asked, and caps each kind at the limit", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ id: `a${index}`, name: `Scout ${index}`, role: "" }));
    const service = new SearchService(sources({ agents: () => many }));
    const result = service.query({ q: "scout", kinds: ["agents"], limit: 5 });
    expect(result.hits).toHaveLength(5);
    expect(result.truncated).toBe(true);
    expect(service.query({ q: "scout", kinds: ["channels"] }).hits).toEqual([]);
  });

  it("asks the message source for one more than the limit, to know that there is more", () => {
    const asked: number[] = [];
    const service = new SearchService(
      sources({
        messages: (_needle, limit) => {
          asked.push(limit);
          return Array.from({ length: limit }, (_, index) => ({
            threadId: "t",
            botId: "chief",
            messageId: `m${index}`,
            text: "x launch y",
          }));
        },
      }),
    );
    const result = service.query({ q: "launch", kinds: ["messages"], limit: 3 });
    expect(asked).toEqual([4]);
    expect(result.hits).toHaveLength(3);
    expect(result.truncated).toBe(true);
    expect(result.hits[0]).toMatchObject({ kind: "messages", title: "Chief", botId: "chief", threadId: "t" });
  });

  it("refuses an empty question", () => {
    expect(() => new SearchService(sources()).query({ q: "  " })).toThrow(/text/);
  });

  it("cuts a snippet around the match, with ellipses where it was cut", () => {
    const text = `${"word ".repeat(40)}NEEDLE${" tail".repeat(80)}`;
    const snippet = snippetAround(text, "needle");
    expect(snippet.length).toBeLessThanOrEqual(SEARCH_LIMITS.snippet);
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet).toContain("NEEDLE");
    expect(snippetAround("short text", "zzz")).toBe("short text");
  });
});

describe("OpenBotDatabase.searchMessages (W11 U3)", () => {
  it("finds messages by plain text, newest first, treats % and _ as plain characters, and forgets a deleted thread", async () => {
    const root = await mkdtemp(join(tmpdir(), "search-db-"));
    roots.push(root);
    const database = new OpenBotDatabase(root);
    opened.push(database);
    await database.initialize();
    const bot: BotSummary = {
      id: "chief",
      name: "Chief",
      role: "Lead",
      description: "",
      notifications: true,
      model: "gpt-5.6-luna",
      reasoningEffort: "medium",
      threadId: "thread-1",
      workspacePath: "C:\\work\\chief",
      preview: "",
      updatedAt: null,
      avatarSeed: "chief",
      avatarHue: null,
      avatarUrl: null,
    };
    database.replaceAgents("agents-import", [bot], "agents.imported");
    const snapshot: ConversationSnapshot = {
      botId: "chief",
      threadId: "thread-1",
      activeTurnId: null,
      revision: 0,
      messages: [
        {
          id: "m1",
          author: "user",
          text: "Plan the Launch for 100% of users",
          createdAt: "2026-11-17T10:00:00.000Z",
          status: "completed",
        },
        {
          id: "m2",
          author: "assistant",
          text: "The launch_plan is ready",
          createdAt: "2026-11-17T10:00:01.000Z",
          status: "completed",
        },
        {
          id: "m3",
          author: "assistant",
          text: "Unrelated",
          createdAt: "2026-11-17T10:00:02.000Z",
          status: "completed",
        },
      ],
    };
    database.persistConversation(snapshot, "turn.completed", { turnId: "t", status: "completed" });
    expect(database.searchMessages("launch", 10).map((hit) => hit.messageId)).toEqual(["m2", "m1"]);
    expect(database.searchMessages("launch", 10)[0]).toMatchObject({ botId: "chief", threadId: "thread-1" });
    // % and _ are not wildcards: "100%" matches only the text with a percent sign, "launch_plan" only that underscore.
    expect(database.searchMessages("100%", 10).map((hit) => hit.messageId)).toEqual(["m1"]);
    expect(database.searchMessages("launch_plan", 10).map((hit) => hit.messageId)).toEqual(["m2"]);
    expect(database.searchMessages("%", 10).map((hit) => hit.messageId)).toEqual(["m1"]);
    expect(database.searchMessages("launch", 1)).toHaveLength(1);
    expect(database.searchMessages("nothing like this", 10)).toEqual([]);
    database.connection.prepare("DELETE FROM projection_thread_messages WHERE thread_id = ?").run("thread-1");
    expect(database.searchMessages("launch", 10)).toEqual([]);
  });
});
