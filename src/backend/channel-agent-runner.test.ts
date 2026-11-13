// @vitest-environment node
import { EventEmitter } from "node:events";
import { expect, it } from "vitest";
import type { AgentClient } from "./agent-client";
import { ChannelAgentRunner } from "./channel-agent-runner";
import type { ChannelRunInput } from "./channel-engine";
import { type AppServerNotification, getString, type ResponseDecoder } from "./protocol";
import { channelBotFixture, channelFixture, channelTaskFixture } from "./testing/channel-fixtures";

class Client extends EventEmitter implements AgentClient {
  provider = "codex" as const;
  running = true;
  requests: Array<{ method: string; params: unknown }> = [];
  responses: Array<{ id: unknown; result: unknown }> = [];
  start() {}
  async stop() {}
  notify() {}
  respond(id: unknown, result: unknown) {
    this.responses.push({ id, result });
  }
  respondError() {}
  async request<T>(method: string, params: unknown, decode: ResponseDecoder<T>): Promise<T> {
    this.requests.push({ method, params });
    if (method === "thread/start") return decode({ thread: { id: `channel-${this.requests.length}` } });
    if (method === "turn/start") return decode({ turn: { id: "turn", status: "inProgress", items: [] } });
    if (method === "turn/interrupt") {
      queueMicrotask(() =>
        runnerNotification?.({
          method: "turn/completed",
          params: { threadId: getString(params, "threadId"), turn: { id: "turn", status: "interrupted" } },
        }),
      );
      return decode({});
    }
    return decode({});
  }
}
let runnerNotification: ((n: AppServerNotification) => void) | undefined;
function input(signal: AbortSignal): ChannelRunInput {
  return {
    task: channelTaskFixture(),
    channel: channelFixture(),
    history: [],
    memory: [],
    signal,
    tool: async () => ({ ok: true }),
    waiting: () => {},
  };
}

it("registers channel tools on a fresh ephemeral thread without reusing a DM session", async () => {
  const client = new Client();
  const toolsFor: string[] = [];
  const runner = new ChannelAgentRunner({
    client: async () => client,
    bot: channelBotFixture,
    // COSGRAL W2: the member's own tools (its MCP servers) come from its bot id.
    tools: (botId) => {
      toolsFor.push(botId);
      return [{ type: "namespace", name: "mcp_local_echo", tools: [] }];
    },
    commonRequest: async () => {},
    register: () => {},
    clear: () => {},
  });
  runnerNotification = (n) => runner.notification(n);
  const work = runner.run(input(new AbortController().signal));
  await new Promise((r) => setTimeout(r, 0));
  expect(client.requests[0]).toMatchObject({
    method: "thread/start",
    params: {
      ephemeral: true,
      dynamicTools: expect.arrayContaining([
        expect.objectContaining({ name: "cosgral_channels" }),
        expect.objectContaining({ name: "mcp_local_echo" }),
      ]),
    },
  });
  expect(toolsFor).toEqual([channelTaskFixture().ownerBotId]);
  expect(client.requests.some((r) => r.method === "thread/resume")).toBe(false);
  const threadId = getString(client.requests[1].params, "threadId");
  runner.request(client, {
    id: "call",
    method: "item/tool/call",
    params: {
      threadId,
      turnId: "turn",
      callId: "call",
      namespace: "cosgral_channels",
      tool: "remember",
      arguments: { text: "fact" },
    },
  });
  await new Promise((r) => setTimeout(r, 0));
  expect(client.responses[0]).toMatchObject({ result: { success: true } });
  runner.notification({
    method: "item/completed",
    params: { threadId, turnId: "turn", item: { id: "i", type: "agentMessage", text: "Done" } },
  });
  runner.notification({ method: "turn/completed", params: { threadId, turn: { id: "turn", status: "completed" } } });
  expect(await work).toEqual({ status: "completed", text: "Done" });
  runner.request(client, {
    id: "late",
    method: "item/tool/call",
    params: {
      threadId,
      turnId: "turn",
      callId: "late",
      namespace: "cosgral_channels",
      tool: "remember",
      arguments: { text: "late" },
    },
  });
  await new Promise((r) => setTimeout(r, 0));
  expect(client.responses.at(-1)).toMatchObject({ result: { success: false } });
});

it("interrupts an aborted channel turn and refuses tools that escape the channel", async () => {
  const client = new Client(),
    abort = new AbortController();
  let escaped = false;
  const runner = new ChannelAgentRunner({
    client: async () => client,
    bot: channelBotFixture,
    tools: () => [],
    commonRequest: async () => {
      escaped = true;
    },
    register: () => {},
    clear: () => {},
  });
  runnerNotification = (n) => runner.notification(n);
  const work = runner.run(input(abort.signal));
  await new Promise((r) => setTimeout(r, 0));
  const threadId = getString(client.requests[1].params, "threadId");
  runner.request(client, {
    id: "escape",
    method: "item/tool/call",
    params: { threadId, turnId: "turn", callId: "e", namespace: "openbot", tool: "send_message", arguments: {} },
  });
  await new Promise((r) => setTimeout(r, 0));
  expect(escaped).toBe(false);
  expect(client.responses[0]).toMatchObject({ result: { success: false } });
  abort.abort();
  expect(await work).toMatchObject({ status: "interrupted" });
  expect(client.requests.some((r) => r.method === "turn/interrupt")).toBe(true);
});

it("interrupts a turn whose started notification arrives after the user's Stop", async () => {
  let release: (value: unknown) => void = () => {
    throw new Error("Not started");
  };
  class SlowStart extends Client {
    override async request<T>(method: string, params: unknown, decode: ResponseDecoder<T>): Promise<T> {
      if (method !== "turn/start") return super.request(method, params, decode);
      this.requests.push({ method, params });
      return decode(
        await new Promise((resolve) => {
          release = resolve;
        }),
      );
    }
  }
  const client = new SlowStart(),
    abort = new AbortController();
  const runner = new ChannelAgentRunner({
    client: async () => client,
    bot: channelBotFixture,
    tools: () => [],
    commonRequest: async () => {},
    register: () => {},
    clear: () => {},
  });
  runnerNotification = (n) => runner.notification(n);
  const work = runner.run(input(abort.signal));
  await new Promise((r) => setTimeout(r, 0));
  abort.abort();
  const threadId = getString(client.requests[1].params, "threadId");
  runner.notification({ method: "turn/started", params: { threadId, turn: { id: "turn" } } });
  await new Promise((r) => setTimeout(r, 0));
  const interrupted = client.requests.some((r) => r.method === "turn/interrupt");
  release({ turn: { id: "turn", status: "inProgress", items: [] } });
  await work;
  expect(interrupted).toBe(true);
});

it("gives a channel member its installed skills and lets it use the skill library", async () => {
  const client = new Client();
  const handled: Array<string | null> = [];
  const runner = new ChannelAgentRunner({
    client: async () => client,
    bot: channelBotFixture,
    tools: () => [],
    commonRequest: async (_client, request) => {
      handled.push(getString(request.params, "namespace"));
    },
    register: () => {},
    clear: () => {},
    instructions: (botId) => `Installed skills of ${botId}: weekly-report`,
  });
  const work = runner.run(input(new AbortController().signal));
  await new Promise((r) => setTimeout(r, 0));
  expect(getString(client.requests[0]?.params, "developerInstructions")).toContain(
    "Installed skills of a: weekly-report",
  );
  const threadId = getString(client.requests[1]?.params, "threadId");
  runner.request(client, {
    id: "skill",
    method: "item/tool/call",
    params: {
      threadId,
      turnId: "turn",
      callId: "skill",
      namespace: "cosgral_skills",
      tool: "list_local_skills",
      arguments: {},
    },
  });
  runner.request(client, {
    id: "vault",
    method: "item/tool/call",
    params: {
      threadId,
      turnId: "turn",
      callId: "vault",
      namespace: "cosgral_vault",
      tool: "list_vault_items",
      arguments: {},
    },
  });
  for (const namespace of ["cosgral_tables", "cosgral_library"]) {
    runner.request(client, {
      id: namespace,
      method: "item/tool/call",
      params: { threadId, turnId: "turn", callId: namespace, namespace, tool: "list", arguments: {} },
    });
  }
  await new Promise((r) => setTimeout(r, 0));
  expect(handled).toEqual(["cosgral_skills", "cosgral_vault", "cosgral_tables", "cosgral_library"]);
  expect(getString(client.requests[0]?.params, "developerInstructions")).toContain("cosgral_vault");
  expect(getString(client.requests[0]?.params, "developerInstructions")).toContain("cosgral_tables");
  runner.notification({ method: "turn/completed", params: { threadId, turn: { id: "turn", status: "completed" } } });
  await work;
});

it("lets a channel turn show a card to the user and marks its task waiting meanwhile", async () => {
  const client = new Client();
  const handled: Array<string | null> = [];
  const waiting: boolean[] = [];
  const runner = new ChannelAgentRunner({
    client: async () => client,
    bot: channelBotFixture,
    tools: () => [],
    commonRequest: async (_client, request) => {
      handled.push(getString(request.params, "namespace"));
    },
    register: () => {},
    clear: () => {},
  });
  const runInput = input(new AbortController().signal);
  runInput.waiting = (value) => waiting.push(value);
  const work = runner.run(runInput);
  await new Promise((r) => setTimeout(r, 0));
  const threadId = getString(client.requests[1].params, "threadId");
  runner.request(client, {
    id: "card",
    method: "item/tool/call",
    params: {
      threadId,
      turnId: "turn",
      callId: "card",
      namespace: "cosgral_cards",
      tool: "confirm",
      arguments: { preview: "Hi" },
    },
  });
  await new Promise((r) => setTimeout(r, 0));
  expect(handled).toEqual(["cosgral_cards"]);
  expect(waiting).toEqual([true, false]);
  runner.notification({ method: "turn/completed", params: { threadId, turn: { id: "turn", status: "completed" } } });
  await work;
});

it("processes a repeated provider call id once while replying to both requests", async () => {
  const client = new Client();
  let effects = 0;
  const runner = new ChannelAgentRunner({
    client: async () => client,
    bot: channelBotFixture,
    tools: () => [],
    commonRequest: async () => {},
    register: () => {},
    clear: () => {},
  });
  const runInput = input(new AbortController().signal);
  runInput.tool = async () => {
    effects++;
    return { saved: true };
  };
  const work = runner.run(runInput);
  await new Promise((r) => setTimeout(r, 0));
  const threadId = getString(client.requests[1].params, "threadId");
  for (const id of ["first", "retry"])
    runner.request(client, {
      id,
      method: "item/tool/call",
      params: {
        threadId,
        turnId: "turn",
        callId: "same-call",
        namespace: "cosgral_channels",
        tool: "remember",
        arguments: { text: "fact" },
      },
    });
  await new Promise((r) => setTimeout(r, 0));
  runner.notification({ method: "turn/completed", params: { threadId, turn: { id: "turn", status: "completed" } } });
  await work;
  expect(effects).toBe(1);
  expect(client.responses).toHaveLength(2);
});

it("reserves the agent while the provider is still preparing the thread", async () => {
  const client = new Client();
  let ready: (c: AgentClient) => void = () => {};
  const runner = new ChannelAgentRunner({
    client: () =>
      new Promise((resolve) => {
        ready = resolve;
      }),
    bot: channelBotFixture,
    tools: () => [],
    commonRequest: async () => {},
    register: () => {},
    clear: () => {},
  });
  const work = runner.run(input(new AbortController().signal));
  const reserved = runner.working("a");
  ready(client);
  await new Promise((r) => setTimeout(r, 0));
  const threadId = getString(client.requests[1].params, "threadId");
  runner.notification({ method: "turn/completed", params: { threadId, turn: { id: "turn", status: "completed" } } });
  await work;
  expect(reserved).toBe(true);
  expect(runner.working("a")).toBe(false);
});
