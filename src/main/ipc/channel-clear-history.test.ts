// @vitest-environment node
import { IPC_CHANNELS, isAgentEvent, isChannelHistoryCleared } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { parseClearChannelHistory, parseUpdateChannel } from "./channel-inputs";

describe("clearing the history of a channel (BE-Y): input, answer and event", () => {
  it("reads only a channel id and refuses anything else", () => {
    expect(parseClearChannelHistory({ channelId: "c1" })).toEqual({ channelId: "c1" });
    expect(() => parseClearChannelHistory(null)).toThrow("Choose a project.");
    expect(() => parseClearChannelHistory({})).toThrow();
    expect(() => parseClearChannelHistory({ channelId: 5 })).toThrow();
  });

  it("has its own IPC channel and a checked answer and event", () => {
    expect(IPC_CHANNELS.channelsClearHistory).toBe("channels:clear-history");
    expect(isChannelHistoryCleared({ channelId: "c1", removedMessages: 3, removedTasks: 0 })).toBe(true);
    expect(isChannelHistoryCleared({ channelId: "c1", removedMessages: -1, removedTasks: 0 })).toBe(false);
    expect(isChannelHistoryCleared({ channelId: "c1", removedMessages: 1.5, removedTasks: 0 })).toBe(false);
    expect(isChannelHistoryCleared({ channelId: "c1", removedMessages: 1 })).toBe(false);
    expect(isChannelHistoryCleared(null)).toBe(false);
    expect(isAgentEvent({ type: "channel-history-cleared", channelId: "c1" })).toBe(true);
    expect(isAgentEvent({ type: "channel-history-cleared" })).toBe(false);
  });

  it("reads and checks the history window of a channel (BE-Z)", () => {
    expect(parseUpdateChannel({ channelId: "c1", historyWindow: 50 })).toEqual({ channelId: "c1", historyWindow: 50 });
    expect(parseUpdateChannel({ channelId: "c1", title: "T" })).toEqual({ channelId: "c1", title: "T" });
    expect(() => parseUpdateChannel({ channelId: "c1", historyWindow: 30 })).toThrow(
      "historyWindow is 20, 50, 100 or 200.",
    );
    expect(() => parseUpdateChannel({ channelId: "c1", historyWindow: "50" })).toThrow(
      "historyWindow is 20, 50, 100 or 200.",
    );
  });
});
