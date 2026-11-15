import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { join } from "node:path";
import { type DynamicRecord, isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";

// The Codex fixture of the sandbox scripts must handle channels of any size: a channel with only its lead (the
// common first channel a person makes) used to end every task as "failed", because the fixture always assigned
// work to members[1] and members[2].

interface Message {
  id?: string | number;
  method?: string;
  params?: DynamicRecord;
  result?: unknown;
}

let child: ChildProcessWithoutNullStreams | null = null;
afterEach(() => {
  child?.kill();
  child = null;
});

function startFixture() {
  const proc = spawn(process.execPath, [join(__dirname, "channel-codex.cjs")], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
  child = proc;
  const seen: Message[] = [];
  const waiters: Array<{ test: (m: Message) => boolean; resolve: (m: Message) => void }> = [];
  let buffer = "";
  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      const message: Message = JSON.parse(line);
      seen.push(message);
      for (const waiter of [...waiters])
        if (waiter.test(message)) {
          waiters.splice(waiters.indexOf(waiter), 1);
          waiter.resolve(message);
        }
    }
  });
  const send = (message: Message) => proc.stdin.write(`${JSON.stringify(message)}\n`);
  const next = (test: (m: Message) => boolean) =>
    new Promise<Message>((resolve, reject) => {
      const found = seen.find(test);
      if (found) return resolve(found);
      const timer = setTimeout(() => reject(new Error("fixture did not answer")), 10_000);
      waiters.push({
        test,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  return { send, next, seen };
}

function context(members: string[], title = "Plan the launch") {
  return {
    assignment: { id: "task-1", title, ownerBotId: members[0], parentTaskId: null },
    members,
    history: [],
  };
}

async function startTurn(fixture: ReturnType<typeof startFixture>, members: string[]) {
  fixture.send({ id: 1, method: "thread/start", params: {} });
  const thread = await fixture.next((m) => m.id === 1);
  const threadId = threadIdOf(thread);
  if (threadId === undefined) throw new Error("thread/start did not return a thread id");
  fixture.send({
    id: 2,
    method: "turn/start",
    params: { threadId, input: [{ type: "text", text: JSON.stringify(context(members)) }] },
  });
  return threadId;
}

// Narrow the loosely typed JSON-RPC payloads by checking their shape instead of asserting it.
function threadIdOf(message: Message): string | undefined {
  const result = message.result;
  if (!isDynamicRecord(result) || !isDynamicRecord(result.thread)) return undefined;
  return isString(result.thread.id) ? result.thread.id : undefined;
}

function turnStatusOf(message: Message): string | undefined {
  const turn = message.params?.turn;
  return isDynamicRecord(turn) && isString(turn.status) ? turn.status : undefined;
}

function itemTextOf(message: Message | undefined): string | undefined {
  const item = message?.params?.item;
  return isDynamicRecord(item) && isString(item.text) ? item.text : undefined;
}

function toolArgumentsOf(message: Message): DynamicRecord | undefined {
  const args = message.params?.arguments;
  return isDynamicRecord(args) ? args : undefined;
}

const turnCompleted = (m: Message) => m.method === "turn/completed";
const toolCall = (m: Message) => m.method === "item/tool/call";

describe("channel Codex fixture", () => {
  it("lets a channel with only its lead finish its task", async () => {
    const fixture = startFixture();
    await startTurn(fixture, ["lead"]);
    const done = await fixture.next(turnCompleted);
    expect(turnStatusOf(done)).toBe("completed");
    const completedItem = fixture.seen.find((m) => m.method === "item/completed");
    expect(itemTextOf(completedItem)).toBe("Stub lead result: Plan the launch");
    expect(fixture.seen.some(toolCall)).toBe(false);
  });

  it("still delegates to two helpers in a channel with three members", async () => {
    const fixture = startFixture();
    await startTurn(fixture, ["lead", "a", "b"]);
    const answer = (m: Message, text: string) =>
      fixture.send({ id: m.id, result: { success: true, contentItems: [{ type: "inputText", text }] } });
    const remember = await fixture.next((m) => toolCall(m) && m.params?.tool === "remember");
    answer(remember, "{}");
    const first = await fixture.next((m) => toolCall(m) && m.params?.tool === "assign");
    expect(toolArgumentsOf(first)?.ownerBotId).toBe("a");
    answer(first, JSON.stringify({ id: "child-1" }));
    const second = await fixture.next(
      (m) => toolCall(m) && m.params?.tool === "assign" && toolArgumentsOf(m)?.ownerBotId === "b",
    );
    expect(toolArgumentsOf(second)?.dependencyTaskIds).toEqual(["child-1"]);
    answer(second, JSON.stringify({ id: "child-2" }));
    const done = await fixture.next(turnCompleted);
    expect(turnStatusOf(done)).toBe("completed");
  });
});
