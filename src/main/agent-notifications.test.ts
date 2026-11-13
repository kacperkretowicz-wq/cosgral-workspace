// @vitest-environment node

import { type AgentEvent, type BotSummary, defaultNotificationPreferences } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { notificationForAgentEvent } from "./agent-notifications";

const bot = {
  id: "chief",
  name: "Chief",
  notifications: true,
  role: "Lead",
  description: "",
  model: "gpt-5.6-luna",
  reasoningEffort: "medium",
  threadId: "thread-chief",
  workspacePath: "/tmp/chief",
  preview: "",
  updatedAt: null,
  avatarSeed: "chief",
  avatarHue: null,
  avatarUrl: null,
} satisfies BotSummary;

describe("notificationForAgentEvent", () => {
  it("surfaces completed work and prompts for enabled agents", () => {
    expect(notificationForAgentEvent(completed("completed"), [bot])).toEqual({
      title: "Chief",
      body: "Finished working.",
      silent: true,
    });
    expect(
      notificationForAgentEvent(
        {
          type: "prompt",
          botId: "chief",
          threadId: "thread-chief",
          turnId: "turn-1",
          requestId: 1,
          questions: [],
        },
        [bot],
      ),
    ).toEqual({ title: "Chief", body: "Needs your input.", silent: false });
  });

  it("ignores disabled agents, interrupted turns, and unrelated events", () => {
    expect(notificationForAgentEvent(completed("interrupted"), [bot])).toBeNull();
    expect(notificationForAgentEvent(completed("completed"), [{ ...bot, notifications: false }])).toBeNull();
    expect(notificationForAgentEvent({ type: "bots-changed", bots: [] }, [bot])).toBeNull();
  });

  it("COSGRAL W3: follows the notification matrix for every event kind", () => {
    const preferences = defaultNotificationPreferences();
    preferences.matrix.finished.desktop = false;
    preferences.matrix.failed.sound = true;
    preferences.matrix["channel-result"].desktop = true;
    expect(notificationForAgentEvent(completed("completed"), [bot], preferences)).toBeNull();
    expect(notificationForAgentEvent(completed("failed"), [bot], preferences)).toEqual({
      title: "Chief",
      body: "Stopped with an error.",
      silent: false,
    });
    const card = { requestId: "c1", botId: "chief" };
    expect(
      notificationForAgentEvent(
        // Only the fields the notification reads; the rest of the card does not matter here.
        JSON.parse(JSON.stringify({ type: "draft-preview", card })),
        [bot],
        preferences,
      ),
    ).toMatchObject({ body: "Needs your approval." });
    expect(
      notificationForAgentEvent(
        JSON.parse(JSON.stringify({ type: "vault-request", request: { requestId: "v1", botId: "chief" } })),
        [bot],
        preferences,
      ),
    ).toMatchObject({ body: "Needs your input." });
    expect(
      notificationForAgentEvent(
        JSON.parse(JSON.stringify({ type: "browser-takeover", request: { requestId: "t1", botId: "chief" } })),
        [bot],
        preferences,
      ),
    ).toMatchObject({ body: "Asks you to take over the browser." });
    const message = { kind: "result", authorBotId: "chief" };
    expect(
      notificationForAgentEvent(JSON.parse(JSON.stringify({ type: "channel-message", message })), [bot], preferences),
    ).toMatchObject({ body: "Returned a result in a channel." });
    expect(
      notificationForAgentEvent(
        JSON.parse(JSON.stringify({ type: "channel-message", message: { ...message, kind: "note" } })),
        [bot],
        preferences,
      ),
    ).toBeNull();
  });
});

function completed(status: string): AgentEvent {
  return {
    type: "turn-completed",
    botId: "chief",
    threadId: "thread-chief",
    turnId: "turn-1",
    status,
  };
}
