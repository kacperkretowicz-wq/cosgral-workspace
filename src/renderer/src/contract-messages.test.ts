import {
  aggregateUsage,
  MESSAGE_ACTIONS,
  type MessageActionSubject,
  messageActionProblem,
  threadBusyProblem,
  workflowProblems,
} from "@openbot/contracts/ipc";
import { flush } from "solid-js";
import { afterEach, expect, it } from "vitest";
import { setLanguage, tData } from "./i18n";

/**
 * The program's own sentences that come from the contracts (why an action is unavailable, what is wrong with a
 * workflow) are shown through `tData()`. Each must have a Polish translation, or the Polish interface shows English.
 */
afterEach(() => {
  setLanguage("en");
  flush();
});

function inPolish(texts: Array<string | null>): void {
  setLanguage("pl");
  flush();
  for (const text of texts) {
    if (text === null) continue;
    expect(tData(text), `no Polish translation for: ${text}`).not.toBe(text);
  }
}

it("translates why a message action is unavailable", () => {
  const subjects: MessageActionSubject[] = [
    { author: "system" },
    { author: "assistant", status: "streaming" },
    { author: "user", delivery: { status: "queued" } },
    { author: "assistant", source: "assistant" },
    { author: "agent" },
  ];
  const texts = MESSAGE_ACTIONS.flatMap((action) => subjects.map((subject) => messageActionProblem(action, subject)));
  expect(texts.filter((text) => text !== null).length).toBeGreaterThan(4);
  inPolish(texts);
});

it("translates the busy-thread reason", () => {
  inPolish([threadBusyProblem({ turnRunning: true, busyMessages: 0 })]);
});

it("translates what is wrong with an empty or unconnected workflow", () => {
  const empty = workflowProblems({ nodes: [], edges: [] });
  const lonely = workflowProblems({
    nodes: [{ id: "t", title: "Start", x: 0, y: 0, type: "trigger", trigger: { kind: "manual" } }],
    edges: [],
  });
  expect(empty.length + lonely.length).toBeGreaterThan(0);
  inPolish([...empty, ...lonely]);
});

it("translates why a part of the usage report is unavailable (seen in English on the Usage page of the real window)", () => {
  const now = new Date("2026-11-23T09:00:00.000Z");
  const report = aggregateUsage({
    rows: [],
    period: 30,
    botId: null,
    today: now,
    names: () => null,
    providers: [],
    machine: { cpuPercent: null, memoryPercent: null },
    firstDay: null,
    now,
  });
  const reasons = report.unavailable.map((item) => item.reason);
  expect(reasons.length).toBeGreaterThanOrEqual(3);
  inPolish(reasons);
});
