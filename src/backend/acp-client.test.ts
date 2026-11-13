// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AcpAgentConfig } from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import { AcpAgentClient } from "./acp-client";
import {
  type AppServerNotification,
  type AppServerRequest,
  decodeRecordResponse,
  decodeThreadResponse,
  decodeTurnResponse,
} from "./protocol";

const STUB = join(__dirname, "testing", "acp-stub.mjs");
const clients: AcpAgentClient[] = [];
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.stop()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const agent: AcpAgentConfig = {
  id: "stub",
  name: "ACP stub",
  command: process.execPath,
  args: [STUB, "stub"],
  createdAt: "2026-11-13T05:30:00.000Z",
  updatedAt: "2026-11-13T05:30:00.000Z",
};

async function setup(handleRequest?: (client: AcpAgentClient, request: AppServerRequest) => void) {
  const root = await mkdtemp(join(tmpdir(), "cosgral-acp-"));
  roots.push(root);
  const client = new AcpAgentClient({ agents: () => [agent], bridgeDirectory: root });
  clients.push(client);
  const notifications: AppServerNotification[] = [];
  client.on("notification", (notification) => notifications.push(notification));
  if (handleRequest) client.on("request", (request) => handleRequest(client, request));
  client.start();
  await client.request("initialize", {}, decodeRecordResponse);
  return { client, notifications, root };
}

async function waitFor(check: () => boolean, ms = 15_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out.");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function completed(notifications: AppServerNotification[], turnId: string) {
  return notifications.find(
    (item) =>
      item.method === "turn/completed" &&
      isDynamicRecord(item.params) &&
      isDynamicRecord(item.params.turn) &&
      item.params.turn.id === turnId,
  );
}

function text(notifications: AppServerNotification[], turnId: string): string {
  return notifications
    .filter(
      (item) =>
        item.method === "item/agentMessage/delta" && isDynamicRecord(item.params) && item.params.turnId === turnId,
    )
    .map((item) => (isDynamicRecord(item.params) && isString(item.params.delta) ? item.params.delta : ""))
    .join("");
}

async function turn(client: AcpAgentClient, threadId: string, message: string) {
  const response = await client.request(
    "turn/start",
    { threadId, model: "acp:stub", input: [{ type: "text", text: message }] },
    decodeTurnResponse,
  );
  return response.turn.id;
}

describe("AcpAgentClient", () => {
  it("reports an account and lists every ACP agent as a model", async () => {
    const { client } = await setup();
    expect(await client.request("account/read", {}, decodeRecordResponse)).toMatchObject({ account: { type: "acp" } });
    expect(await client.request("model/list", {}, decodeRecordResponse)).toMatchObject({
      data: [{ model: "acp:stub", displayName: "ACP stub" }],
    });
  });

  it("runs a turn with streamed text, sends the program instructions once and keeps the turns", async () => {
    const { client, notifications } = await setup();
    const { thread } = await client.request(
      "thread/start",
      { cwd: tmpdir(), model: "acp:stub", developerInstructions: "You are a COSGRAL agent." },
      decodeThreadResponse,
    );
    const first = await turn(client, thread.id, "hello");
    await waitFor(() => Boolean(completed(notifications, first)));
    expect(notifications.some((item) => item.method === "turn/started")).toBe(true);
    expect(text(notifications, first)).toBe('[instructions received] ACP stub (not a model): received "hello"');
    expect(completed(notifications, first)?.params).toMatchObject({ turn: { status: "completed" } });

    const second = await turn(client, thread.id, "again");
    await waitFor(() => Boolean(completed(notifications, second)));
    expect(text(notifications, second)).toBe('ACP stub (not a model): received "again"');
    const read = await client.request("thread/read", { threadId: thread.id }, decodeThreadResponse);
    expect(read.thread.turns).toHaveLength(2);
  });

  it("gives the ACP agent the program tools and sends its calls back as item/tool/call", async () => {
    const calls: unknown[] = [];
    const { client, notifications } = await setup((self, request) => {
      calls.push(request.params);
      self.respond(request.id, { success: true, contentItems: [{ type: "inputText", text: "agents: chief" }] });
    });
    const { thread } = await client.request(
      "thread/start",
      {
        cwd: tmpdir(),
        model: "acp:stub",
        developerInstructions: "x",
        dynamicTools: [
          {
            type: "namespace",
            name: "openbot",
            tools: [
              { type: "function", name: "list_agents", description: "List agents", inputSchema: { type: "object" } },
            ],
          },
        ],
      },
      decodeThreadResponse,
    );
    const listed = await turn(client, thread.id, "TOOLS");
    await waitFor(() => Boolean(completed(notifications, listed)));
    expect(text(notifications, listed)).toContain("tools openbot__list_agents");

    const called = await turn(client, thread.id, "TOOL openbot__list_agents now");
    await waitFor(() => Boolean(completed(notifications, called)));
    expect(text(notifications, called)).toContain("openbot__list_agents -> ok: agents: chief");
    expect(calls).toEqual([
      expect.objectContaining({
        threadId: thread.id,
        namespace: "openbot",
        tool: "list_agents",
        arguments: { text: "now" },
      }),
    ]);
  });

  it("marks a usage limit and an unavailable service for fallback, but not a user error", async () => {
    const { client, notifications } = await setup();
    const { thread } = await client.request("thread/start", { cwd: tmpdir(), model: "acp:stub" }, decodeThreadResponse);
    const errorOf = (turnId: string) =>
      notifications.find(
        (item) => item.method === "error" && isDynamicRecord(item.params) && item.params.turnId === turnId,
      )?.params;

    const limited = await turn(client, thread.id, "LIMIT");
    await waitFor(() => Boolean(completed(notifications, limited)));
    expect(completed(notifications, limited)?.params).toMatchObject({ turn: { status: "failed" } });
    expect(errorOf(limited)).toMatchObject({
      errorKind: "usage-limit",
      message: expect.stringContaining("Usage limit"),
    });
    expect(errorOf(limited)).toMatchObject({ resetsAt: expect.any(Number) });
    // A failed attempt without text leaves no empty answer behind (the turn may move to a fallback model).
    expect(
      notifications.some(
        (item) => item.method === "item/completed" && isDynamicRecord(item.params) && item.params.turnId === limited,
      ),
    ).toBe(false);

    const down = await turn(client, thread.id, "UNAVAILABLE");
    await waitFor(() => Boolean(completed(notifications, down)));
    expect(errorOf(down)).toMatchObject({ errorKind: "unavailable" });

    const bad = await turn(client, thread.id, "BADINPUT");
    await waitFor(() => Boolean(completed(notifications, bad)));
    expect(errorOf(bad)).toMatchObject({ errorKind: null });
  });

  it("cancels a running turn and refuses an unknown ACP agent", async () => {
    const { client, notifications } = await setup();
    const { thread } = await client.request("thread/start", { cwd: tmpdir(), model: "acp:stub" }, decodeThreadResponse);
    const slow = await turn(client, thread.id, "SLOW please");
    await client.request("turn/interrupt", { threadId: thread.id, turnId: slow }, decodeRecordResponse);
    await waitFor(() => Boolean(completed(notifications, slow)));
    expect(completed(notifications, slow)?.params).toMatchObject({ turn: { status: "interrupted" } });

    const { thread: other } = await client.request(
      "thread/start",
      { cwd: tmpdir(), model: "acp:ghost" },
      decodeThreadResponse,
    );
    await expect(
      client.request(
        "turn/start",
        { threadId: other.id, model: "acp:ghost", input: [{ type: "text", text: "x" }] },
        decodeTurnResponse,
      ),
    ).rejects.toThrow(/ghost/);
  });
});
