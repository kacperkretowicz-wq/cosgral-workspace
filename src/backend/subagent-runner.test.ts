// @vitest-environment node
// COSGRAL W6-BE4: the subagent runner on a fake Codex (spec-w6.md 1D, W23-W28; Q10, Q11). An agent starts a subagent with
// `spawn`; it works in a session of its own with the access of its parent and never more; the answer comes back as a tool
// result; stopping the subagent or ending the parent's turn ends it at once and the parent does not hang.

import type { AgentEvent, BotSummary, Subagent } from "@openbot/contracts/ipc";
import { SUBAGENT_LIMITS } from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord } from "@openbot/contracts/runtime-values";
import { describe, expect, it } from "vitest";
import type { CardContext } from "./action-cards";
import type { DynamicToolResult } from "./protocol";
import { SubagentRunner } from "./subagent-runner";
import type { SubagentStore } from "./subagent-store";
import { SUBAGENT_NAMESPACE } from "./subagent-tools";
import { notification, ThreadCli } from "./testing/thread-cli";

const BOT: BotSummary = {
  id: "chief",
  name: "Chief",
  role: "",
  description: "",
  notifications: true,
  model: "gpt-5.6-luna",
  reasoningEffort: "medium",
  threadId: "public-thread",
  workspacePath: "C:\\work\\chief",
  preview: "",
  updatedAt: null,
  avatarSeed: "chief",
  avatarHue: null,
  avatarUrl: null,
};

class MemoryStore implements SubagentStore {
  readonly rows = new Map<string, Subagent>();
  save(subagent: Subagent): void {
    this.rows.set(subagent.id, structuredClone(subagent));
  }
  get(id: string): Subagent | null {
    const found = this.rows.get(id);
    return found ? structuredClone(found) : null;
  }
  list(botId: string, threadId: string): Subagent[] {
    return [...this.rows.values()]
      .filter((item) => item.botId === botId && item.threadId === threadId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => structuredClone(item));
  }
  listActive(): Subagent[] {
    return [...this.rows.values()].filter((item) => ["starting", "working", "waiting"].includes(item.state));
  }
  deleteThread(botId: string, threadId: string): void {
    for (const [id, item] of this.rows) if (item.botId === botId && item.threadId === threadId) this.rows.delete(id);
  }
  pruneBots(botIds: string[]): boolean {
    let removed = false;
    for (const [id, item] of this.rows) {
      if (!botIds.includes(item.botId)) {
        this.rows.delete(id);
        removed = true;
      }
    }
    return removed;
  }
}

const ACCESS = {
  approvalPolicy: "on-request",
  sandbox: "danger-full-access",
  runtimeWorkspaceRoots: ["C:\\work\\chief", "C:\\shared"],
};

function setup(options: { previewIntervalMs?: number } = {}) {
  const cli = new ThreadCli();
  cli.running = true;
  const events: AgentEvent[] = [];
  const store = new MemoryStore();
  const registered = new Map<string, string>();
  const cleared: Array<{ threadId: string; turnId: string | null }> = [];
  const forwarded: string[] = [];
  const waiting = new Map<string, string[]>();
  let tick = 0;
  let ids = 0;
  const runner = new SubagentRunner({
    emit: (event) => events.push(event),
    store,
    client: async () => cli,
    bot: () => BOT,
    tools: () => [
      { type: "function", name: "ask_user" },
      { type: "namespace", name: "cosgral_cards" },
    ],
    instructions: () => "PARENT INSTRUCTIONS",
    access: () => ACCESS,
    commonRequest: async (_client, request) => {
      forwarded.push(request.method);
    },
    register: (threadId, botId) => registered.set(threadId, botId),
    clear: (threadId, turnId) => cleared.push({ threadId, turnId }),
    waitingIds: (threadId) => waiting.get(threadId) ?? [],
    now: () => {
      tick += 1;
      return new Date(Date.UTC(2026, 10, 16, 12, 0, tick)).toISOString();
    },
    newId: () => {
      ids += 1;
      return `id${ids}`;
    },
    previewIntervalMs: options.previewIntervalMs ?? 0,
  });
  // In the program the service hands the CLI's notifications to the runner.
  cli.on("notification", (notification) => runner.notification(notification));
  return { cli, events, store, runner, registered, cleared, forwarded, waiting };
}

const parent: CardContext = {
  botId: "chief",
  threadId: "public-thread",
  providerThreadId: "parent-cli",
  turnId: "parent-turn",
};

function call(tool: string, args: unknown, context: CardContext = parent) {
  return {
    context,
    params: {
      threadId: context.providerThreadId,
      turnId: context.turnId,
      callId: `${tool}-call`,
      namespace: SUBAGENT_NAMESPACE,
      tool,
      arguments: args,
    },
  };
}

function payload(result: DynamicToolResult): DynamicRecord {
  const item = result.contentItems[0];
  if (item?.type !== "inputText") throw new Error("Expected a text result.");
  try {
    const value = JSON.parse(item.text);
    if (isDynamicRecord(value)) return value;
  } catch {
    // A refusal is plain text.
  }
  return { text: item.text };
}

async function tool(runner: SubagentRunner, name: string, args: unknown, context: CardContext = parent) {
  const { params } = call(name, args, context);
  return runner.handleTool(params, context);
}

async function waitFor(check: () => boolean | undefined): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out.");
}

function changes(events: AgentEvent[], id: string): Subagent[] {
  return events.flatMap((event) =>
    event.type === "subagent-changed" && event.subagent.id === id ? [event.subagent] : [],
  );
}

describe("subagent runner", () => {
  it("starts a subagent in a session of its own with the parent's access and tools, and returns its answer (W23)", async () => {
    const { cli, events, store, runner, registered } = setup();
    const result = await tool(runner, "spawn", { task: "Read the logs\nand summarize", title: "Logs" });
    expect(result.success).toBe(true);
    const answer = payload(result);
    expect(answer).toMatchObject({ state: "done", title: "Logs", result: "ANSWER_TO[Read the logs]" });
    const id = String(answer.subagentId);

    const start = cli.calls("thread/start")[0];
    expect(start).toMatchObject({
      ephemeral: true,
      approvalPolicy: ACCESS.approvalPolicy,
      sandbox: ACCESS.sandbox,
      runtimeWorkspaceRoots: ACCESS.runtimeWorkspaceRoots,
      cwd: BOT.workspacePath,
    });
    const text = JSON.stringify(start);
    expect(text).toContain("PARENT INSTRUCTIONS");
    expect(text).toContain("You are a SUBAGENT");
    expect(text).not.toContain(SUBAGENT_NAMESPACE);
    expect(JSON.stringify(cli.calls("turn/start")[0])).toContain("Read the logs");
    expect(registered.get("cli-thread-1")).toBe("chief");

    const saved = store.get(id);
    expect(saved).toMatchObject({
      botId: "chief",
      threadId: "public-thread",
      parentTurnId: "parent-turn",
      state: "done",
      task: "Read the logs\nand summarize",
    });
    expect(saved?.finishedAt).not.toBeNull();
    // (More "working" events can come between: the preview changes while it writes.)
    expect([...new Set(changes(events, id).map((item) => item.state))]).toEqual(["starting", "working", "done"]);
  });

  it("with wait false it returns at once and wait gets the answer later", async () => {
    const { cli, runner } = setup();
    cli.hold = true;
    const started = payload(await tool(runner, "spawn", { task: "Slow job", wait: false }));
    expect(["starting", "working"]).toContain(started.state);
    const id = String(started.subagentId);
    await waitFor(() => cli.pending.length === 1);
    const waiting = tool(runner, "wait", { subagentIds: [id] });
    cli.finish();
    const done = payload(await waiting);
    expect(done.subagents).toEqual([expect.objectContaining({ state: "done", result: "ANSWER_TO[Slow job]" })]);
  });

  it("refuses the fourth at the same time with a readable reason, and accepts one when a place is free (W26)", async () => {
    const { cli, runner } = setup();
    cli.hold = true;
    const ids: string[] = [];
    for (let index = 0; index < SUBAGENT_LIMITS.parallel; index += 1) {
      ids.push(String(payload(await tool(runner, "spawn", { task: `job ${index}`, wait: false })).subagentId));
    }
    const refused = await tool(runner, "spawn", { task: "one too many", wait: false });
    expect(refused.success).toBe(false);
    expect(payload(refused).text).toMatch(/At most 3 subagents/);
    // Another thread of the agent has its own room.
    const other: CardContext = { ...parent, threadId: "other-thread", providerThreadId: "other-cli" };
    expect((await tool(runner, "spawn", { task: "elsewhere", wait: false }, other)).success).toBe(true);
    await waitFor(() => cli.pending.length === 4);
    cli.finish(cli.pending[0]?.threadId);
    await waitFor(() =>
      runner.list({ botId: "chief", threadId: "public-thread" }).some((item) => item.state === "done"),
    );
    expect((await tool(runner, "spawn", { task: "now it fits", wait: false })).success).toBe(true);
    expect(ids).toHaveLength(3);
  });

  it("refuses a subagent that tries to start a subagent (depth 1)", async () => {
    const { cli, runner } = setup();
    cli.hold = true;
    await tool(runner, "spawn", { task: "outer", wait: false });
    await waitFor(() => cli.pending.length === 1);
    const child = cli.pending[0];
    const asChild: CardContext = { ...parent, providerThreadId: child?.threadId ?? "", turnId: child?.turnId ?? "" };
    const refused = await tool(runner, "spawn", { task: "inner" }, asChild);
    expect(refused.success).toBe(false);
    expect(payload(refused).text).toMatch(/cannot start subagents/);
    expect(runner.list({ botId: "chief", threadId: "public-thread" })).toHaveLength(1);
  });

  it("refuses bad arguments and unknown tools without starting anything", async () => {
    const { cli, runner } = setup();
    expect((await tool(runner, "spawn", { task: " " })).success).toBe(false);
    expect((await tool(runner, "spawn", { task: "x", wait: "yes" })).success).toBe(false);
    expect((await tool(runner, "wait", { subagentIds: [] })).success).toBe(false);
    expect((await tool(runner, "wait", { subagentIds: ["nope"] })).success).toBe(false);
    expect((await tool(runner, "dance", {})).success).toBe(false);
    expect(cli.calls("thread/start")).toEqual([]);
  });

  it("Stop ends the subagent at once and the parent's waiting call does not hang (W25)", async () => {
    const { cli, runner, cleared } = setup();
    cli.hold = true;
    const waiting = tool(runner, "spawn", { task: "Long job" });
    await waitFor(() => cli.pending.length === 1);
    const child = cli.pending[0];
    const id = runner.list({ botId: "chief", threadId: "public-thread" })[0]?.id ?? "";
    const stopped = await runner.stop(id);
    expect(stopped).toMatchObject({ state: "stopped", error: "Stopped by the user." });
    expect(stopped.finishedAt).not.toBeNull();
    const result = payload(await waiting);
    expect(result).toMatchObject({ state: "stopped" });
    expect(String(result.instruction)).toMatch(/Do not wait/);
    expect(cli.calls("turn/interrupt")).toHaveLength(1);
    expect(cleared).toContainEqual({ threadId: child?.threadId, turnId: child?.turnId });
    // The CLI ends its turn later: nothing changes and nothing leaks to the main conversation.
    const handled = runner.notification(
      notification("turn/completed", { threadId: child?.threadId, turn: { id: child?.turnId, status: "interrupted" } }),
    );
    expect(handled).toBe(true);
    expect(runner.list({ botId: "chief", threadId: "public-thread" })[0]?.state).toBe("stopped");
    // Stopping an ended one changes nothing; an unknown one is refused.
    expect((await runner.stop(id)).state).toBe("stopped");
    await expect(runner.stop("nope")).rejects.toThrow(/Unknown subagent/);
  });

  it("stopping a subagent that is still starting does not start its turn", async () => {
    const { cli, runner } = setup();
    const waiting = tool(runner, "spawn", { task: "Quick stop" });
    const id = runner.list({ botId: "chief", threadId: "public-thread" })[0]?.id ?? "";
    await runner.stop(id);
    expect(payload(await waiting).state).toBe("stopped");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(cli.calls("turn/start")).toEqual([]);
  });

  it("ending or stopping the parent's turn stops its subagents and answers its waiting call (W25)", async () => {
    const { cli, runner } = setup();
    cli.hold = true;
    const waiting = tool(runner, "spawn", { task: "Parent will stop" });
    await tool(runner, "spawn", { task: "Another turn", wait: false }, { ...parent, turnId: "other-turn" });
    await waitFor(() => cli.pending.length === 2);
    runner.stopForTurn("parent-cli", "parent-turn");
    expect(payload(await waiting)).toMatchObject({ state: "stopped" });
    const states = runner
      .list({ botId: "chief", threadId: "public-thread" })
      .map((item) => [item.parentTurnId, item.state]);
    expect(states.sort()).toEqual(
      [
        ["other-turn", "working"],
        ["parent-turn", "stopped"],
      ].sort(),
    );
    expect(
      runner.list({ botId: "chief", threadId: "public-thread" }).find((item) => item.parentTurnId === "parent-turn")
        ?.error,
    ).toBe("The turn of the agent ended.");
    runner.stopAll("The program is closing.");
    expect(runner.list({ botId: "chief", threadId: "public-thread" }).every((item) => item.state === "stopped")).toBe(
      true,
    );
  });

  it("a failed turn or a refused start is a failed subagent with the reason", async () => {
    const { cli, runner } = setup();
    cli.hold = true;
    const waiting = tool(runner, "spawn", { task: "Will fail" });
    await waitFor(() => cli.pending.length === 1);
    const child = cli.pending[0];
    cli.emit(
      "notification",
      notification("turn/completed", { threadId: child?.threadId, turn: { id: child?.turnId, status: "failed" } }),
    );
    const result = payload(await waiting);
    expect(result).toMatchObject({ state: "failed" });
    expect(String(result.error)).toMatch(/failed/);
    expect(String(result.instruction)).toMatch(/failed/);

    const broken = setup();
    const original = broken.cli.request.bind(broken.cli);
    broken.cli.request = async (method, params, decoder) => {
      if (method === "thread/start") throw new Error("No model available");
      return original(method, params, decoder);
    };
    const refused = payload(await tool(broken.runner, "spawn", { task: "Cannot start" }));
    expect(refused).toMatchObject({ state: "failed", error: "No model available" });
  });

  it("shows what it writes while it works and cuts the kept answer to the limit", async () => {
    const { cli, runner } = setup();
    cli.hold = true;
    const started = payload(await tool(runner, "spawn", { task: "Talkative", wait: false }));
    await waitFor(() => cli.pending.length === 1);
    const child = cli.pending[0];
    const threadId = child?.threadId ?? "";
    runner.notification(
      notification("item/started", {
        threadId,
        turnId: child?.turnId,
        item: { id: "m1", type: "agentMessage", text: "" },
      }),
    );
    runner.notification(
      notification("item/agentMessage/delta", {
        threadId,
        turnId: child?.turnId,
        itemId: "m1",
        delta: "Reading the first file.",
      }),
    );
    expect(runner.list({ botId: "chief", threadId: "public-thread" })[0]?.preview).toBe("Reading the first file.");
    const long = "L".repeat(SUBAGENT_LIMITS.result + 50);
    runner.notification(
      notification("item/completed", {
        threadId,
        turnId: child?.turnId,
        item: { id: "m1", type: "agentMessage", text: long },
      }),
    );
    runner.notification(notification("turn/completed", { threadId, turn: { id: child?.turnId, status: "completed" } }));
    const done = runner.list({ botId: "chief", threadId: "public-thread" })[0];
    expect(done?.state).toBe("done");
    expect(done?.result).toHaveLength(SUBAGENT_LIMITS.result);
    expect(done?.preview).toBeNull();
    expect(String(started.subagentId)).toBe(done?.id);
  });

  it("shows waiting with the ids of the cards while the person has to answer, and works again after (W24)", async () => {
    const { cli, runner, waiting, events } = setup();
    cli.hold = true;
    const started = payload(await tool(runner, "spawn", { task: "Needs you", wait: false }));
    const id = String(started.subagentId);
    await waitFor(() => cli.pending.length === 1);
    const threadId = cli.pending[0]?.threadId ?? "";
    waiting.set(threadId, ["card-1", "approval-2"]);
    runner.refreshWaiting();
    expect(runner.list({ botId: "chief", threadId: "public-thread" })[0]).toMatchObject({
      state: "waiting",
      waitingRequestIds: ["card-1", "approval-2"],
    });
    const count = changes(events, id).length;
    runner.refreshWaiting();
    expect(changes(events, id)).toHaveLength(count);
    waiting.delete(threadId);
    runner.refreshWaiting();
    expect(runner.list({ botId: "chief", threadId: "public-thread" })[0]).toMatchObject({
      state: "working",
      waitingRequestIds: [],
    });
  });

  it("takes the requests of its own session and leaves the others alone", async () => {
    const { cli, runner, forwarded } = setup();
    cli.hold = true;
    await tool(runner, "spawn", { task: "Asks", wait: false });
    await waitFor(() => cli.pending.length === 1);
    const threadId = cli.pending[0]?.threadId ?? "";
    expect(runner.owns(threadId)).toBe(true);
    expect(runner.publicThread(threadId)).toBe("public-thread");
    expect(runner.owns("parent-cli")).toBe(false);
    expect(runner.publicThread("parent-cli")).toBeNull();
    expect(runner.request(cli, { id: 1, method: "item/commandExecution/requestApproval", params: { threadId } })).toBe(
      true,
    );
    await waitFor(() => forwarded.length === 1);
    expect(
      runner.request(cli, {
        id: 2,
        method: "item/commandExecution/requestApproval",
        params: { threadId: "parent-cli" },
      }),
    ).toBe(false);
    expect(runner.notification(notification("turn/started", { threadId: "parent-cli", turn: { id: "x" } }))).toBe(
      false,
    );
  });

  it("a request of a stopped subagent is refused instead of waiting for nobody", async () => {
    const { cli, runner } = setup();
    cli.hold = true;
    await tool(runner, "spawn", { task: "Stops", wait: false });
    await waitFor(() => cli.pending.length === 1);
    const threadId = cli.pending[0]?.threadId ?? "";
    const id = runner.list({ botId: "chief", threadId: "public-thread" })[0]?.id ?? "";
    await runner.stop(id);
    const answered: unknown[] = [];
    const client = Object.assign(Object.create(cli), {
      respond: (_id: unknown, result: unknown) => answered.push(result),
      respondError: (_id: unknown, error: unknown) => answered.push(error),
    });
    expect(
      runner.request(client, {
        id: 3,
        method: "item/tool/call",
        params: { threadId, turnId: "t", callId: "c", namespace: "cosgral_cards", tool: "confirm", arguments: {} },
      }),
    ).toBe(true);
    await waitFor(() => answered.length === 1);
    expect(JSON.stringify(answered[0])).toMatch(/stopped/);
  });

  it("a provider that exits ends the subagents it ran", async () => {
    const { cli, runner } = setup();
    cli.hold = true;
    const waiting = tool(runner, "spawn", { task: "Provider dies" });
    await waitFor(() => cli.pending.length === 1);
    runner.clientExited(cli);
    const result = payload(await waiting);
    expect(result).toMatchObject({ state: "failed" });
    expect(String(result.error)).toMatch(/provider process exited/);
  });

  it("closes what was working at a restart, lists newest first and forgets a deleted thread", async () => {
    const { runner, store } = setup();
    const base: Subagent = {
      id: "old-1",
      botId: "chief",
      threadId: "public-thread",
      parentTurnId: "t",
      title: "Old",
      task: "Old",
      state: "working",
      createdAt: "2026-11-15T00:00:00.000Z",
      updatedAt: "2026-11-15T00:00:00.000Z",
      finishedAt: null,
      preview: "x",
      result: null,
      error: null,
      waitingRequestIds: ["c"],
    };
    store.save(base);
    store.save({
      ...base,
      id: "old-2",
      state: "done",
      result: "ok",
      createdAt: "2026-11-15T01:00:00.000Z",
      finishedAt: "2026-11-15T01:00:01.000Z",
    });
    runner.recover();
    expect(store.get("old-1")).toMatchObject({
      state: "stopped",
      error: "The program was closed.",
      waitingRequestIds: [],
    });
    expect(store.get("old-2")?.state).toBe("done");
    expect(runner.list({ botId: "chief", threadId: "public-thread" }).map((item) => item.id)).toEqual([
      "old-2",
      "old-1",
    ]);
    runner.forgetThread("chief", "public-thread");
    expect(store.rows.size).toBe(0);
  });

  it("answers the list tool with the subagents of this thread only", async () => {
    const { runner } = setup();
    await tool(runner, "spawn", { task: "First" });
    await tool(runner, "spawn", { task: "Elsewhere" }, { ...parent, threadId: "other", providerThreadId: "other-cli" });
    const listed = payload(await tool(runner, "list", {}));
    const items = Array.isArray(listed.subagents) ? listed.subagents : [];
    expect(items.map((item) => (isDynamicRecord(item) ? item.title : null))).toEqual(["First"]);
  });

  it("the agent can stop its own subagent, and not one of another agent", async () => {
    const { cli, runner } = setup();
    cli.hold = true;
    const started = payload(await tool(runner, "spawn", { task: "Stop me", wait: false }));
    const id = String(started.subagentId);
    expect((await tool(runner, "stop", { subagentId: id }, { ...parent, botId: "scout" })).success).toBe(false);
    const stopped = await tool(runner, "stop", { subagentId: id });
    expect(payload(stopped)).toMatchObject({ state: "stopped" });
  });
});
