import type { AgentEvent } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockSubagents } from "./mock-subagents";

function setup() {
  const events: AgentEvent[] = [];
  const subagents = createMockSubagents((event) => events.push(event));
  return { events, subagents };
}

const where = { botId: "b", threadId: "t" };

describe("mock subagents", () => {
  it("shows a started subagent, linked to its parent, and announces it", () => {
    const { events, subagents } = setup();
    const sub = subagents.spawn({ ...where, parentTurnId: "turn-1", task: "Read the logs\nand summarize" });
    expect(sub).toMatchObject({
      botId: "b",
      threadId: "t",
      parentTurnId: "turn-1",
      title: "Read the logs",
      state: "working",
    });
    expect(events.map((event) => event.type)).toEqual(["subagent-changed"]);
  });

  it("refuses the fourth at the same time and a subagent of a subagent (W26)", () => {
    const { subagents } = setup();
    for (let index = 0; index < 3; index += 1) subagents.spawn({ ...where, task: `t${index}` });
    expect(() => subagents.spawn({ ...where, task: "fourth" })).toThrow(/At most 3/);
    subagents.spawn({ botId: "b", threadId: "other", task: "another thread has its own room" });
    expect(() => subagents.spawn({ ...where, task: "deep", depth: 1 })).toThrow(/cannot start subagents/);
  });

  it("a finished subagent frees its place for the limit", () => {
    const { subagents } = setup();
    const first = subagents.spawn({ ...where, task: "a" });
    subagents.spawn({ ...where, task: "b" });
    subagents.spawn({ ...where, task: "c" });
    subagents.complete(first.id, "ok");
    expect(() => subagents.spawn({ ...where, task: "d" })).not.toThrow();
  });

  it("shows what it writes, waits for the person with the card ids, and works again after the answer (W24)", () => {
    const { subagents } = setup();
    const sub = subagents.spawn({ ...where, task: "work" });
    expect(subagents.write(sub.id, "  I am reading  ").preview).toBe("I am reading");
    const waiting = subagents.ask(sub.id, ["card-1"]);
    expect(waiting).toMatchObject({ state: "waiting", waitingRequestIds: ["card-1"] });
    expect(subagents.answer(sub.id)).toMatchObject({ state: "working", waitingRequestIds: [] });
  });

  it("done keeps the answer, failed keeps the error, and an ended subagent cannot be changed", () => {
    const { subagents } = setup();
    const ok = subagents.spawn({ ...where, task: "a" });
    expect(subagents.complete(ok.id, "The answer")).toMatchObject({
      state: "done",
      result: "The answer",
      preview: null,
    });
    expect(() => subagents.complete(ok.id, "again")).toThrow(/already ended/);
    expect(() => subagents.write(ok.id, "x")).toThrow(/already ended/);
    const bad = subagents.spawn({ ...where, task: "b" });
    expect(subagents.fail(bad.id, "boom")).toMatchObject({ state: "failed", error: "boom" });
  });

  it("Stop ends one at once; stopping an ended one changes nothing (W25)", async () => {
    const { events, subagents } = setup();
    const sub = subagents.spawn({ ...where, task: "a" });
    subagents.ask(sub.id, ["card-1"]);
    const stopped = await subagents.stop({ subagentId: sub.id });
    expect(stopped).toMatchObject({ state: "stopped", waitingRequestIds: [] });
    expect(stopped.finishedAt).not.toBeNull();
    const count = events.length;
    expect((await subagents.stop({ subagentId: sub.id })).state).toBe("stopped");
    expect(events).toHaveLength(count);
    await expect(subagents.stop({ subagentId: "nope" })).rejects.toThrow(/Unknown/);
  });

  it("ending the parent's turn stops its active subagents only", () => {
    const { subagents } = setup();
    const a = subagents.spawn({ ...where, task: "a" });
    const b = subagents.spawn({ ...where, task: "b" });
    subagents.complete(b.id, "done already");
    const other = subagents.spawn({ botId: "b", threadId: "other", task: "elsewhere" });
    const stopped = subagents.endParentTurn("b", "t");
    expect(stopped.map((item) => item.id)).toEqual([a.id]);
    expect(stopped[0]?.state).toBe("stopped");
    expect(subagents.write(other.id, "still works").state).toBe("working");
  });

  it("lists the subagents of one thread, newest first", async () => {
    const { subagents } = setup();
    const a = subagents.spawn({ ...where, task: "a" });
    const b = subagents.spawn({ ...where, task: "b" });
    subagents.spawn({ botId: "b", threadId: "other", task: "c" });
    expect((await subagents.list(where)).map((item) => item.id)).toEqual([b.id, a.id]);
  });
});
