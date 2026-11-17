// @vitest-environment node
import { type AgentEvent, isAgentEvent } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockComposer, createMockSearch, createMockThreadTabs } from "./mock-composer";

describe("mock search (W11 U3)", () => {
  it("searches the demo data by kind, with a limit, and refuses an empty question", async () => {
    const search = createMockSearch();
    const all = await search.query({ q: "launch" });
    expect(all.hits.map((hit) => hit.kind).sort()).toEqual(["channels", "files", "messages"]);
    expect((await search.query({ q: "launch", kinds: ["files"] })).hits).toHaveLength(1);
    expect((await search.query({ q: "chief", kinds: ["agents", "messages"], limit: 1 })).hits.length).toBeGreaterThan(
      0,
    );
    await expect(search.query({ q: "  " })).rejects.toThrow(/text/);
  });
});

describe("mock message box (W11 U4, U5)", () => {
  it("answers a side question through events and lets it be cancelled once", async () => {
    const events: AgentEvent[] = [];
    const composer = createMockComposer((event) => events.push(event));
    const started = await composer.askSideQuestion({ botId: "chief", text: "What is the budget?" });
    expect(started).toMatchObject({ status: "running", answer: "", error: null });
    composer.simulate.answer(started.questionId, "About ");
    composer.simulate.answer(started.questionId, "About 10k.", true);
    const last = events.at(-1);
    expect(last).toMatchObject({ type: "side-question-changed", state: { status: "done", answer: "About 10k." } });
    expect(events.every(isAgentEvent)).toBe(true);
    // A finished question does not change again.
    composer.simulate.answer(started.questionId, "late");
    expect(events.at(-1)).toBe(last);
    const second = await composer.askSideQuestion({ botId: "chief", text: "x" });
    expect((await composer.cancelSideQuestion({ questionId: second.questionId })).status).toBe("cancelled");
    await expect(composer.cancelSideQuestion({ questionId: "nope" })).rejects.toThrow(/does not exist/);
  });

  it("lists slash commands and searches mentions", async () => {
    const composer = createMockComposer(() => undefined);
    const commands = await composer.listSlashCommands({ botId: "chief" });
    expect(commands[0]?.kind).toBe("program");
    expect((await composer.searchMentions({ botId: "chief", q: "@res" })).map((mention) => mention.label)).toEqual([
      "Research",
    ]);
  });
});

describe("mock thread tabs (W11 U6)", () => {
  it("opens, reorders and closes tabs, and never opens an unknown thread", async () => {
    const events: AgentEvent[] = [];
    const tabs = createMockThreadTabs((event) => events.push(event));
    await tabs.open({ botId: "chief", threadId: "t-1" });
    await tabs.open({ botId: "chief", threadId: "t-2" });
    await tabs.open({ botId: "chief", threadId: "t-3" });
    expect((await tabs.get({ botId: "chief" })).open).toEqual(["t-1", "t-2", "t-3"]);
    await tabs.reorder({ botId: "chief", threadIds: ["t-3", "t-1", "t-2"] });
    expect((await tabs.close({ botId: "chief", threadId: "t-1", mode: "right" })).open).toEqual(["t-3", "t-1"]);
    expect((await tabs.close({ botId: "chief", threadId: "t-3", mode: "others" })).open).toEqual(["t-3"]);
    await expect(tabs.open({ botId: "chief", threadId: "ghost" })).rejects.toThrow(/does not exist/);
    await expect(tabs.reorder({ botId: "chief", threadIds: ["t-9"] })).rejects.toThrow(/same open tabs/);
    expect(events.every(isAgentEvent)).toBe(true);
    // Opening an open tab changes nothing and sends no event.
    const count = events.length;
    await tabs.open({ botId: "chief", threadId: "t-3" });
    expect(events).toHaveLength(count);
  });
});
