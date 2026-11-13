// @vitest-environment node

import { isAgentEvent, isChannelMessage } from "@openbot/contracts/ipc";
import { expect, it } from "vitest";
import { parseListChannelMessages, parseSendChannelMessage } from "./channel-inputs";

it("validates new message IPC and history pagination", () => {
  expect(parseSendChannelMessage({ channelId: "c", text: "hello", resourceKey: "browser" })).toEqual({
    channelId: "c",
    text: "hello",
    resourceKey: "browser",
  });
  expect(() => parseSendChannelMessage({ channelId: "c", text: " " })).toThrow();
  expect(() => parseSendChannelMessage({ channelId: "c", text: "x", resourceKey: "workspace:relative" })).toThrow();
  expect(parseListChannelMessages({ channelId: "c", beforeMessageId: "m", limit: 5 })).toEqual({
    channelId: "c",
    beforeMessageId: "m",
    limit: 5,
  });
  expect(() => parseListChannelMessages({ channelId: "c", limit: 201 })).toThrow();
});
it("decodes new and superseded channel messages as events", () => {
  const message = {
    id: "m",
    channelId: "c",
    taskId: "t",
    authorBotId: "a",
    kind: "result",
    text: "done",
    replyToMessageId: null,
    resultVersion: 2,
    superseded: false,
    createdAt: "now",
  };
  expect(isChannelMessage(message)).toBe(true);
  expect(isAgentEvent({ type: "channel-message", message })).toBe(true);
  expect(isAgentEvent({ type: "channel-message-changed", message: { ...message, superseded: true } })).toBe(true);
  expect(isChannelMessage({ ...message, resultVersion: -1 })).toBe(false);
});
