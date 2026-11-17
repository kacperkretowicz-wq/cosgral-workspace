// @vitest-environment node
import {
  type AgentEvent,
  COMPOSER_LIMITS,
  isAgentEvent,
  isMentionCandidate,
  isSlashCommand,
} from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { type ComposerOptions, ComposerService, SIDE_QUESTION_LIMITS, type SideQuestionRun } from "./composer-service";

function setup(overrides: Partial<ComposerOptions> = {}) {
  const events: AgentEvent[] = [];
  const service = new ComposerService({
    agents: () => [
      { id: "chief", name: "Chief", role: "Leads" },
      { id: "research", name: "Research", role: "Finds sources" },
      { id: "writer", name: "Writer", role: "Drafts" },
    ],
    channels: () => [
      { id: "launch", name: "launch-plan", title: "Launch plan", archived: false },
      { id: "old", name: "old", title: "Old", archived: true },
    ],
    files: (needle) =>
      [{ id: "f1", name: "launch-plan.md" }].filter((file) => file.name.includes(needle.toLowerCase())),
    skills: () => ["weekly-report", "Bad Name", "compact", "weekly-report"],
    emit: (event) => events.push(event),
    now: () => new Date("2026-11-17T12:00:00.000Z"),
    ...overrides,
  });
  return { service, events };
}

/** A side question that the test finishes by hand. */
function manualAsk() {
  const runs: Array<SideQuestionRun & { finish: () => void; fail: (message: string) => void }> = [];
  const ask = (run: SideQuestionRun) =>
    new Promise<void>((resolve, reject) => {
      runs.push({ ...run, finish: resolve, fail: (message) => reject(new Error(message)) });
      run.signal.addEventListener("abort", () => resolve());
    });
  return { ask, runs };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("slash commands and mentions (W11 U5)", () => {
  it("lists the program commands first, then the skills that are valid command names, once each", () => {
    const { service } = setup();
    const commands = service.listSlashCommands({ botId: "chief" });
    expect(commands.every(isSlashCommand)).toBe(true);
    expect(commands.map((command) => `${command.kind}:${command.name}`)).toEqual([
      "program:compact",
      "program:new-thread",
      "program:side",
      "skill:weekly-report",
    ]);
    expect(() => service.listSlashCommands({ botId: "gone" })).toThrow(/no longer exists/);
  });

  it("searches agents (not the asking one), open channels and files, agents first, within the limit", () => {
    const { service } = setup();
    const all = service.searchMentions({ botId: "chief", q: "" });
    expect(all.every(isMentionCandidate)).toBe(true);
    expect(all.map((candidate) => `${candidate.kind}:${candidate.label}`)).toEqual([
      "agent:Research",
      "agent:Writer",
      "channel:Launch plan",
      "file:launch-plan.md",
    ]);
    expect(service.searchMentions({ botId: "chief", q: "@res" }).map((candidate) => candidate.label)).toEqual([
      "Research",
    ]);
    expect(service.searchMentions({ botId: "chief", q: "launch" }).map((candidate) => candidate.kind)).toEqual([
      "channel",
      "file",
    ]);
    expect(service.searchMentions({ botId: "chief", q: "", limit: 1 })).toHaveLength(1);
    expect(COMPOSER_LIMITS.mentions).toBeGreaterThan(1);
  });
});

describe("side question (W11 U4)", () => {
  it("answers through events: running, growing, done; the answer is never the chat", async () => {
    const { ask, runs } = manualAsk();
    const { service, events } = setup({ ask });
    const started = service.askSideQuestion({ botId: "chief", text: "  What is the budget? " });
    expect(started).toMatchObject({ status: "running", question: "What is the budget?", answer: "", error: null });
    expect(runs[0]).toMatchObject({ botId: "chief", threadId: null, text: "What is the budget?" });
    runs[0]?.onText("About ");
    runs[0]?.onText("About 10k.");
    runs[0]?.finish();
    await tick();
    const last = events.at(-1);
    expect(last).toMatchObject({ type: "side-question-changed", state: { status: "done", answer: "About 10k." } });
    expect(events.every(isAgentEvent)).toBe(true);
    expect(events.map((event) => (event.type === "side-question-changed" ? event.state.status : "?"))).toEqual([
      "running",
      "running",
      "running",
      "done",
    ]);
  });

  it("says why a failed question failed, in plain words, and keeps the cut-down message short", async () => {
    const { ask, runs } = manualAsk();
    const { service, events } = setup({ ask });
    service.askSideQuestion({ botId: "chief", text: "x" });
    runs[0]?.fail("The agent is not running.");
    await tick();
    expect(events.at(-1)).toMatchObject({ state: { status: "failed", error: "The agent is not running." } });
  });

  it("cancels once: the question stops, the signal is aborted, and a late answer changes nothing", async () => {
    const { ask, runs } = manualAsk();
    const { service, events } = setup({ ask });
    const started = service.askSideQuestion({ botId: "chief", text: "x" });
    const cancelled = service.cancelSideQuestion({ questionId: started.questionId });
    expect(cancelled.status).toBe("cancelled");
    expect(runs[0]?.signal.aborted).toBe(true);
    runs[0]?.onText("late");
    await tick();
    const count = events.length;
    expect(service.cancelSideQuestion({ questionId: started.questionId }).status).toBe("cancelled");
    expect(events).toHaveLength(count);
    expect(() => service.cancelSideQuestion({ questionId: "nope" })).toThrow(/does not exist/);
  });

  it("refuses an unknown agent and a fourth question that runs at once", () => {
    const { ask } = manualAsk();
    const { service } = setup({ ask });
    expect(() => service.askSideQuestion({ botId: "gone", text: "x" })).toThrow(/no longer exists/);
    for (let index = 0; index < SIDE_QUESTION_LIMITS.running; index += 1)
      service.askSideQuestion({ botId: "chief", text: `q${index}` });
    expect(() => service.askSideQuestion({ botId: "chief", text: "one more" })).toThrow(/at most 3/i);
    expect(service.askSideQuestion({ botId: "writer", text: "another agent is fine" }).status).toBe("running");
  });

  it("without a way to ask, the question fails at once and says so", () => {
    const { service } = setup();
    expect(service.askSideQuestion({ botId: "chief", text: "x" })).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/not connected/),
    });
  });

  it("ends every running question as cancelled when the program closes", () => {
    const { ask, runs } = manualAsk();
    const { service, events } = setup({ ask });
    service.askSideQuestion({ botId: "chief", text: "x" });
    service.close();
    expect(runs[0]?.signal.aborted).toBe(true);
    expect(events.at(-1)).toMatchObject({ state: { status: "cancelled" } });
  });
});
