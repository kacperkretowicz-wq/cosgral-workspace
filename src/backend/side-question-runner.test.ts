// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildSideQuestionPrompt,
  runSideQuestion,
  SIDE_QUESTION_RUN_LIMITS,
  type SideQuestionTransport,
} from "./side-question-runner";

interface Note {
  method: string;
  params: unknown;
}

/** A transport that plays a CLI: `script` runs after turn/start and emits notifications for the thread. */
function fakeTransport(script: (emit: (note: Note) => void, threadId: string) => void) {
  const listeners = new Set<(note: Note) => void>();
  const requests: Array<{ method: string; params: unknown }> = [];
  const emit = (note: Note) => {
    for (const listener of [...listeners]) listener(note);
  };
  const transport: SideQuestionTransport = {
    request: async (method, params) => {
      requests.push({ method, params });
      if (method === "thread/start") return { thread: { id: "side-thread" } };
      if (method === "turn/start") {
        setTimeout(() => script(emit, "side-thread"), 0);
        return { turn: { id: "turn-1" } };
      }
      return {};
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { transport, requests, listeners };
}

const base = { model: "m", effort: null, cwd: "C:/work", history: [{ author: "user", text: "Plan the launch" }] };

describe("side question runner (W12 BE-D)", () => {
  it("asks in a thread of its own that cannot change anything, and streams the whole answer so far", async () => {
    const seen: string[] = [];
    const { transport, requests, listeners } = fakeTransport((emit, threadId) => {
      emit({ method: "item/started", params: { threadId, turnId: "turn-1", item: { id: "a", type: "agentMessage" } } });
      emit({ method: "item/agentMessage/delta", params: { threadId, turnId: "turn-1", itemId: "a", delta: "Hel" } });
      emit({ method: "item/agentMessage/delta", params: { threadId, turnId: "turn-1", itemId: "a", delta: "lo" } });
      emit({ method: "turn/completed", params: { threadId, turn: { id: "turn-1", status: "completed" } } });
    });
    await runSideQuestion(transport, {
      ...base,
      text: "What is the date?",
      signal: new AbortController().signal,
      onText: (answer) => seen.push(answer),
    });
    expect(seen).toEqual(["Hel", "Hello"]);
    const start = requests.find((request) => request.method === "thread/start")?.params;
    expect(start).toMatchObject({ ephemeral: true, sandbox: "read-only", approvalPolicy: "never", cwd: "C:/work" });
    expect(JSON.stringify(start)).not.toContain("dynamicTools");
    const turn = requests.find((request) => request.method === "turn/start")?.params;
    expect(JSON.stringify(turn)).toContain("What is the date?");
    expect(JSON.stringify(turn)).toContain("Plan the launch");
    expect(listeners.size).toBe(0);
  });

  it("ignores notifications of other threads", async () => {
    const seen: string[] = [];
    const { transport } = fakeTransport((emit, threadId) => {
      emit({ method: "item/agentMessage/delta", params: { threadId: "other", turnId: "x", itemId: "z", delta: "NO" } });
      emit({
        method: "item/completed",
        params: { threadId, turnId: "turn-1", item: { id: "a", type: "agentMessage", text: "Yes" } },
      });
      emit({ method: "turn/completed", params: { threadId, turn: { id: "turn-1", status: "completed" } } });
    });
    await runSideQuestion(transport, {
      ...base,
      text: "q",
      signal: new AbortController().signal,
      onText: (answer) => seen.push(answer),
    });
    expect(seen.at(-1)).toBe("Yes");
    expect(seen.join()).not.toContain("NO");
  });

  it("fails with the words of the CLI when the turn fails", async () => {
    const { transport, listeners } = fakeTransport((emit, threadId) => {
      emit({
        method: "turn/completed",
        params: { threadId, turn: { id: "turn-1", status: "failed", error: { message: "Usage limit reached" } } },
      });
    });
    await expect(
      runSideQuestion(transport, { ...base, text: "q", signal: new AbortController().signal, onText: () => undefined }),
    ).rejects.toThrow("Usage limit reached");
    expect(listeners.size).toBe(0);
  });

  it("interrupts the turn and stops quietly when the person cancels", async () => {
    const controller = new AbortController();
    const { transport, requests } = fakeTransport((emit, threadId) => {
      emit({ method: "turn/started", params: { threadId, turn: { id: "turn-1" } } });
      controller.abort();
    });
    await runSideQuestion(transport, { ...base, text: "q", signal: controller.signal, onText: () => undefined });
    expect(requests.some((request) => request.method === "turn/interrupt")).toBe(true);
  });

  it("gives up with plain words when the CLI says nothing for too long", async () => {
    const { transport } = fakeTransport(() => undefined);
    await expect(
      runSideQuestion(transport, {
        ...base,
        text: "q",
        signal: new AbortController().signal,
        onText: () => undefined,
        timeoutMs: 20,
      }),
    ).rejects.toThrow("took too long");
  });

  it("builds a prompt that keeps the question last, the context short and says to answer without acting", () => {
    const history = Array.from({ length: 40 }, (_, index) => ({
      author: index % 2 === 0 ? "user" : "agent",
      text: `message ${index} ${"x".repeat(2_000)}`,
    }));
    const prompt = buildSideQuestionPrompt(history, "Final question?");
    expect(prompt.endsWith("Final question?")).toBe(true);
    expect(prompt).toContain("message 39");
    expect(prompt).not.toContain("message 0 ");
    expect(prompt.length).toBeLessThan(SIDE_QUESTION_RUN_LIMITS.context + 2_000);
    expect(prompt).toMatch(/do not run commands|without acting|do not change/i);
  });
});
