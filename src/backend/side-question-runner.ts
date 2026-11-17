// COSGRAL W12 (BE-D): how a side question is asked (the `ask` port of ComposerService, contract ipc-composer.ts).
// The question runs in a provider thread of its own: ephemeral (not kept), read-only, never asks for approval, with NO program
// tools. It reads the chat only as text in the prompt (the last messages, clipped), so the agent's real thread, its queue and its
// memory never see the question or the answer. The runner talks to the provider through a small transport so it can be tested without
// a CLI; agent-service.ts only builds that transport from the client of the agent (a few lines).

import { type DynamicRecord, isDynamicRecord, isString } from "@openbot/contracts/runtime-values";

export const SIDE_QUESTION_RUN_LIMITS = {
  /** How much of the chat is put into the prompt, in characters (the newest part). */
  context: 12_000,
  /** One message of the chat in the prompt. */
  message: 1_500,
  /** Silence from the provider that ends the question. */
  timeoutMs: 180_000,
} as const;

export interface SideQuestionTransport {
  request: (method: string, params: unknown) => Promise<unknown>;
  /** Every notification of the provider; returns the way to stop listening. */
  subscribe: (listener: (note: { method: string; params: unknown }) => void) => () => void;
}

export interface SideQuestionJob {
  model: string;
  effort: string | null;
  cwd: string;
  /** The messages of the chat, oldest first. */
  history: ReadonlyArray<{ author: string; text: string }>;
  text: string;
  signal: AbortSignal;
  /** The answer so far (the whole text each time). */
  onText: (answer: string) => void;
  timeoutMs?: number;
}

const INSTRUCTIONS =
  "This is a side question. Answer it briefly and directly from the conversation below and what you know. " +
  "Do not run commands, do not change files, do not use tools: answer in plain text only.";

/** The prompt: instructions, the newest part of the chat (clipped), then the question last. */
export function buildSideQuestionPrompt(history: SideQuestionJob["history"], question: string): string {
  const lines: string[] = [];
  let used = 0;
  for (const message of [...history].reverse()) {
    const text = message.text.trim().slice(0, SIDE_QUESTION_RUN_LIMITS.message);
    if (!text) continue;
    const line = `${message.author === "user" ? "Person" : "Agent"}: ${text}`;
    if (used + line.length > SIDE_QUESTION_RUN_LIMITS.context) break;
    used += line.length;
    lines.unshift(line);
  }
  const context = lines.length > 0 ? `Conversation so far:\n${lines.join("\n")}\n\n` : "";
  return `${INSTRUCTIONS}\n\n${context}Question:\n${question}`;
}

function paramsOf(note: { params: unknown }): DynamicRecord {
  return isDynamicRecord(note.params) ? note.params : {};
}

/** Runs the question; resolves when the answer is complete (or the person cancelled), rejects with plain words on failure. */
export async function runSideQuestion(transport: SideQuestionTransport, job: SideQuestionJob): Promise<void> {
  const started = await transport.request("thread/start", {
    model: job.model,
    effort: job.effort,
    cwd: job.cwd,
    approvalPolicy: "never",
    sandbox: "read-only",
    ephemeral: true,
    serviceName: "openbot",
  });
  const threadId = isDynamicRecord(started) && isDynamicRecord(started.thread) ? started.thread.id : null;
  if (!isString(threadId)) throw new Error("The provider did not open a thread for the side question.");

  const parts = new Map<string, string>();
  const order: string[] = [];
  let turnId: string | null = null;
  const publish = (): void => job.onText(order.map((id) => parts.get(id) ?? "").join("\n\n"));
  const remember = (itemId: string, text: string, replace: boolean): void => {
    if (!parts.has(itemId)) order.push(itemId);
    parts.set(itemId, replace ? text : `${parts.get(itemId) ?? ""}${text}`);
    publish();
  };

  let finish: () => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const finished = new Promise<void>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  finished.catch(() => undefined);
  const unsubscribe = transport.subscribe((note) => {
    const params = paramsOf(note);
    if (params.threadId !== threadId) return;
    if (note.method === "turn/started" && isDynamicRecord(params.turn) && isString(params.turn.id)) {
      turnId = params.turn.id;
    } else if (note.method === "item/agentMessage/delta" && isString(params.itemId) && isString(params.delta)) {
      remember(params.itemId, params.delta, false);
    } else if (note.method === "item/completed" && isDynamicRecord(params.item)) {
      const { item } = params;
      if (item.type === "agentMessage" && isString(item.id) && isString(item.text)) remember(item.id, item.text, true);
    } else if (note.method === "turn/completed" && isDynamicRecord(params.turn)) {
      const { turn } = params;
      if (turn.status === "failed" || turn.status === "interrupted") {
        const message = isDynamicRecord(turn.error) && isString(turn.error.message) ? turn.error.message : null;
        if (turn.status === "failed") fail(new Error(message ?? "The provider could not answer this question."));
        else finish();
      } else finish();
    }
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  const onAbort = (): void => {
    void transport.request("turn/interrupt", { threadId, turnId }).catch(() => undefined);
    finish();
  };
  try {
    if (job.signal.aborted) return;
    job.signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(
      () => fail(new Error("The side question took too long and was stopped.")),
      job.timeoutMs ?? SIDE_QUESTION_RUN_LIMITS.timeoutMs,
    );
    const turn = await transport.request("turn/start", {
      threadId,
      model: job.model,
      effort: job.effort,
      input: [{ type: "text", text: buildSideQuestionPrompt(job.history, job.text) }],
      cwd: job.cwd,
      approvalPolicy: "never",
      sandboxPolicy: { type: "readOnly" },
    });
    if (isDynamicRecord(turn) && isDynamicRecord(turn.turn) && isString(turn.turn.id)) turnId ??= turn.turn.id;
    await finished;
  } finally {
    if (timer) clearTimeout(timer);
    job.signal.removeEventListener("abort", onAbort);
    unsubscribe();
  }
}
