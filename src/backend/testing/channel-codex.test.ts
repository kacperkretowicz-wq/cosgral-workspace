import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// The Codex fixture of the sandbox scripts must handle channels of any size: a channel with only its lead (the
// common first channel a person makes) used to end every task as "failed", because the fixture always assigned
// work to members[1] and members[2].

interface Message {
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
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
  const threadId = (thread.result as { thread: { id: string } }).thread.id;
  fixture.send({
    id: 2,
    method: "turn/start",
    params: { threadId, input: [{ type: "text", text: JSON.stringify(context(members)) }] },
  });
  return threadId;
}

const turnCompleted = (m: Message) => m.method === "turn/completed";
const toolCall = (m: Message) => m.method === "item/tool/call";

describe("channel Codex fixture", () => {
  it("lets a channel with only its lead finish its task", async () => {
    const fixture = startFixture();
    await startTurn(fixture, ["lead"]);
    const done = await fixture.next(turnCompleted);
    expect((done.params?.turn as { status: string }).status).toBe("completed");
    const text = fixture.seen.find((m) => m.method === "item/completed")?.params?.item as { text: string };
    expect(text.text).toBe("Stub lead result: Plan the launch");
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
    expect((first.params?.arguments as { ownerBotId: string }).ownerBotId).toBe("a");
    answer(first, JSON.stringify({ id: "child-1" }));
    const second = await fixture.next(
      (m) => toolCall(m) && m.params?.tool === "assign" && (m.params.arguments as { ownerBotId: string }).ownerBotId === "b",
    );
    expect((second.params?.arguments as { dependencyTaskIds: string[] }).dependencyTaskIds).toEqual(["child-1"]);
    answer(second, JSON.stringify({ id: "child-2" }));
    const done = await fixture.next(turnCompleted);
    expect((done.params?.turn as { status: string }).status).toBe("completed");
  });
});
