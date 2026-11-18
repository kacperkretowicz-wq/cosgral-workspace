// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type BotSummary,
  type ChannelMessage,
  type ChannelTask,
  type ChannelTaskActionInput,
  MOBILE_API_PATHS,
  MOBILE_CHANNEL_LIMITS,
  MOBILE_CHANNEL_PATHS,
  MOBILE_PHONE_LIMITS,
  mobileChannelPath,
  type SendChannelMessageInput,
  type WorkspaceChannel,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import { MobileConnect, mobileAgents, mobileNeedsYou } from "./mobile-connect";
import { MobilePhoneApi, type MobilePhoneChannels, type MobilePhoneHost } from "./mobile-phone-api";
import { MobileStore } from "./mobile-store";

const roots: string[] = [];
const running: MobileConnect[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((mobile) => mobile.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const AT = "2026-11-18T10:00:00.000Z";

function channel(id: string, fields: Partial<WorkspaceChannel> = {}): WorkspaceChannel {
  return {
    id,
    name: id,
    title: `Title ${id}`,
    instructions: "SECRET channel instructions of the person",
    leadBotId: "scout",
    memberBotIds: ["scout", "writer"],
    isolated: false,
    archived: false,
    createdAt: AT,
    updatedAt: AT,
    ...fields,
  };
}

function task(id: string, channelId: string, fields: Partial<ChannelTask> = {}): ChannelTask {
  return {
    id,
    channelId,
    ownerBotId: "scout",
    state: "running",
    title: `Task ${id}`,
    requestMessageId: "m1",
    resultMessageId: null,
    parentTaskId: null,
    dependencyTaskIds: [],
    resourceKey: "C:\\work\\private",
    assignmentCount: 1,
    archivedAt: null,
    createdAt: AT,
    updatedAt: AT,
    ...fields,
  };
}

function message(id: string, channelId: string, fields: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id,
    channelId,
    taskId: null,
    authorBotId: null,
    kind: "human",
    text: `Text ${id}`,
    replyToMessageId: null,
    resultVersion: null,
    superseded: false,
    createdAt: AT,
    ...fields,
  };
}

function fakeChannels() {
  const channels = [channel("plan"), channel("old", { archived: true }), channel("other")];
  const tasks = [
    task("t1", "plan"),
    task("t2", "plan", { state: "waiting" }),
    task("t3", "plan", { state: "done" }),
    task("t4", "plan", { state: "done", archivedAt: AT }),
    task("t5", "other", { state: "paused" }),
  ];
  const messages = ["a", "b", "c", "d", "e"].map((id) =>
    message(`m-${id}`, "plan", id === "c" ? { superseded: true, kind: "result", authorBotId: "scout" } : {}),
  );
  const sent: SendChannelMessageInput[] = [];
  const acted: ChannelTaskActionInput[] = [];
  const host: MobilePhoneChannels = {
    list: () => channels,
    tasks: (channelId) => tasks.filter((item) => item.channelId === channelId),
    messages: (channelId, page) => {
      const own = messages.filter((item) => item.channelId === channelId);
      const end = page.before === null ? own.length : own.findIndex((item) => item.id === page.before);
      if (end < 0) throw new Error("This message is not in the channel.");
      return own.slice(Math.max(0, end - page.limit), end);
    },
    send: (input) => {
      sent.push(input);
      return {
        message: message(`sent-${sent.length}`, input.channelId),
        task: task(`new-${sent.length}`, input.channelId),
      };
    },
    act: (input) => {
      acted.push(input);
      const found = tasks.find((item) => item.id === input.taskId);
      if (!found) throw new Error("This task does not exist.");
      return { ...found, state: input.action === "stop" ? "cancelled" : "paused" };
    },
  };
  return { host, sent, acted };
}

function bot(id: string): BotSummary {
  return {
    id,
    name: id,
    role: "Research",
    description: "d",
    notifications: true,
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    threadId: `thread-${id}`,
    workspacePath: `C:\\work\\${id}`,
    preview: "p",
    updatedAt: AT,
    avatarSeed: id,
    avatarHue: 150,
    avatarUrl: null,
  };
}

async function setup(withChannels = true) {
  const root = await mkdtemp(join(tmpdir(), "mobile-channels-"));
  roots.push(root);
  const fake = fakeChannels();
  const host: MobilePhoneHost = {
    bots: () => [bot("scout"), bot("writer")],
    messages: async () => ({ messages: [], hasMore: false }),
    sendMessage: async () => ({ messageId: "x", deliveries: [] }),
    pending: () => [],
    respondToPrompt: async () => undefined,
    respondToApproval: async () => undefined,
    respondToDraftPreview: async () => undefined,
    templates: () => [],
    createAgent: async () => ({ bot: bot("new"), warnings: [] }),
    updateProfile: async () => undefined,
    setAvatarHue: async () => undefined,
    subscribe: () => () => undefined,
    ...(withChannels ? { channels: () => fake.host } : {}),
  };
  const phone = new MobilePhoneApi({ host, needsYouDelayMs: 5, conversationDelayMs: 5 });
  const mobile = new MobileConnect({
    store: new MobileStore(join(root, "mobile.json")),
    agents: () => mobileAgents(host.bots()),
    needsYou: () => mobileNeedsYou(host.pending()),
    confirm: async () => "send",
    canAsk: () => true,
    emit: () => undefined,
    phone,
  });
  running.push(mobile);
  const ticket = await mobile.startPairing({ port: 0 });
  const base = ticket.urls[0] ?? "";
  const paired = await request(base, MOBILE_API_PATHS.pair, "", {
    method: "POST",
    body: { ticket: ticket.ticket, deviceName: "Phone" },
  });
  const token = isString(paired.body.token) ? paired.body.token : "";
  return { base, token, ...fake };
}

async function request(
  base: string,
  path: string,
  token: string,
  init: { method?: string; body?: DynamicRecord } = {},
): Promise<{ status: number; body: DynamicRecord }> {
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await response.json();
  return { status: response.status, body: isDynamicRecord(json) ? json : {} };
}

describe("channels on the phone (BE-AB, row 71)", () => {
  it("lists the channels that are not archived, with the open tasks and without the instructions", async () => {
    const { base, token } = await setup();
    const answer = await request(base, MOBILE_CHANNEL_PATHS.channels, token);
    expect(answer.status).toBe(200);
    expect(answer.body.channels).toEqual([
      {
        id: "plan",
        name: "plan",
        title: "Title plan",
        leadBotId: "scout",
        memberBotIds: ["scout", "writer"],
        openTasks: 2,
        updatedAt: AT,
      },
      {
        id: "other",
        name: "other",
        title: "Title other",
        leadBotId: "scout",
        memberBotIds: ["scout", "writer"],
        openTasks: 1,
        updatedAt: AT,
      },
    ]);
    expect(JSON.stringify(answer.body)).not.toContain("SECRET");
  });

  it("pages the messages oldest first, keeps superseded results and refuses bad cursors and limits", async () => {
    const { base, token } = await setup();
    const first = await request(base, `${mobileChannelPath.messages("plan")}?limit=2`, token);
    expect(first.status).toBe(200);
    const page = first.body.messages;
    expect(Array.isArray(page) ? page.map((item) => (isDynamicRecord(item) ? item.id : null)) : null).toEqual([
      "m-d",
      "m-e",
    ]);
    expect(first.body.nextBefore).toBe("m-d");
    const older = await request(base, `${mobileChannelPath.messages("plan")}?limit=2&before=m-d`, token);
    const olderIds = Array.isArray(older.body.messages)
      ? older.body.messages.map((item) => (isDynamicRecord(item) ? item.id : null))
      : null;
    expect(olderIds).toEqual(["m-b", "m-c"]);
    expect(older.body.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "m-c", superseded: true, kind: "result", authorBotId: "scout" }),
      ]),
    );
    const last = await request(base, `${mobileChannelPath.messages("plan")}?before=m-b`, token);
    expect(last.body.nextBefore).toBeNull();
    expect(JSON.stringify(first.body)).not.toContain("resultVersion");
    expect((await request(base, `${mobileChannelPath.messages("plan")}?before=nope`, token)).status).toBe(400);
    expect((await request(base, `${mobileChannelPath.messages("plan")}?limit=0`, token)).status).toBe(400);
    const tooMany = MOBILE_CHANNEL_LIMITS.messagesPageMax + 1;
    expect((await request(base, `${mobileChannelPath.messages("plan")}?limit=${tooMany}`, token)).status).toBe(400);
    expect((await request(base, mobileChannelPath.messages("nope"), token)).status).toBe(404);
    expect((await request(base, mobileChannelPath.messages("old"), token)).status).toBe(404);
  });

  it("sends a message that starts a task, never sets a resource from the phone, and checks the text", async () => {
    const { base, token, sent } = await setup();
    const ok = await request(base, mobileChannelPath.messages("plan"), token, {
      method: "POST",
      body: { text: "  Plan the launch  ", replyToMessageId: "m-a", resourceKey: "C:\\private" },
    });
    expect(ok.status).toBe(202);
    expect(ok.body).toEqual({ messageId: "sent-1", taskId: "new-1" });
    expect(sent).toEqual([{ channelId: "plan", text: "Plan the launch", replyToMessageId: "m-a" }]);
    const blank = await request(base, mobileChannelPath.messages("plan"), token, {
      method: "POST",
      body: { text: "  " },
    });
    expect(blank.status).toBe(400);
    const long = await request(base, mobileChannelPath.messages("plan"), token, {
      method: "POST",
      body: { text: "x".repeat(MOBILE_PHONE_LIMITS.messageText + 1) },
    });
    expect(long.status).toBe(400);
    const badReply = await request(base, mobileChannelPath.messages("plan"), token, {
      method: "POST",
      body: { text: "Hi", replyToMessageId: 5 },
    });
    expect(badReply.status).toBe(400);
    expect(
      (await request(base, mobileChannelPath.messages("nope"), token, { method: "POST", body: { text: "Hi" } })).status,
    ).toBe(404);
    expect(sent).toHaveLength(1);
  });

  it("lists the tasks of a channel without archived ones and without the working folder", async () => {
    const { base, token } = await setup();
    const answer = await request(base, mobileChannelPath.tasks("plan"), token);
    expect(answer.status).toBe(200);
    const ids = Array.isArray(answer.body.tasks)
      ? answer.body.tasks.map((item) => (isDynamicRecord(item) ? item.id : null))
      : null;
    expect(ids).toEqual(["t1", "t2", "t3"]);
    expect(answer.body.tasks).toEqual(
      expect.arrayContaining([
        { id: "t2", ownerBotId: "scout", state: "waiting", title: "Task t2", parentTaskId: null, updatedAt: AT },
      ]),
    );
    expect(JSON.stringify(answer.body)).not.toContain("private");
  });

  it("stops, pauses and resumes a task of the channel, and leaves the other actions to the computer", async () => {
    const { base, token, acted } = await setup();
    const stop = await request(base, mobileChannelPath.taskAction("plan", "t1", "stop"), token, { method: "POST" });
    expect(stop.status).toBe(200);
    expect(stop.body.task).toMatchObject({ id: "t1", state: "cancelled" });
    await request(base, mobileChannelPath.taskAction("plan", "t1", "pause"), token, { method: "POST" });
    await request(base, mobileChannelPath.taskAction("plan", "t1", "resume"), token, { method: "POST" });
    expect(acted).toEqual([
      { taskId: "t1", action: "stop" },
      { taskId: "t1", action: "pause" },
      { taskId: "t1", action: "resume" },
    ]);
    for (const action of ["archive", "restore", "reassign"]) {
      const refused = await request(base, `/v1/channels/plan/tasks/t1/${action}`, token, { method: "POST" });
      expect(refused.status).toBe(403);
    }
    // A task of another channel, an unknown task and the wrong method.
    expect(
      (await request(base, mobileChannelPath.taskAction("plan", "t5", "stop"), token, { method: "POST" })).status,
    ).toBe(404);
    expect(
      (await request(base, mobileChannelPath.taskAction("plan", "nope", "stop"), token, { method: "POST" })).status,
    ).toBe(404);
    expect((await request(base, mobileChannelPath.taskAction("plan", "t1", "stop"), token)).status).toBe(405);
    expect(acted).toHaveLength(3);
  });

  it("keeps channel changes on the computer: no create, update or delete of a channel", async () => {
    const { base, token } = await setup();
    for (const [method, path] of [
      ["POST", MOBILE_CHANNEL_PATHS.channels],
      ["PATCH", `${MOBILE_CHANNEL_PATHS.channels}/plan`],
      ["DELETE", `${MOBILE_CHANNEL_PATHS.channels}/plan`],
    ] as const) {
      const refused = await request(base, path, token, { method, body: { name: "x" } });
      expect(refused.status).toBe(403);
    }
  });

  it("answers 404 for channels when the program has no channel engine yet", async () => {
    const { base, token } = await setup(false);
    expect((await request(base, MOBILE_CHANNEL_PATHS.channels, token)).status).toBe(404);
  });
});
