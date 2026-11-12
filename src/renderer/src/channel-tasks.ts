/** Storybook / UI mock until Backend adds contracts (W1). */

export type ChannelTaskState = "queued" | "running" | "waiting" | "done" | "failed" | "cancelled";

export interface ChannelTask {
  id: string;
  channelId: string;
  ownerBotId: string;
  ownerBotName: string;
  state: ChannelTaskState;
  title: string;
  requestMessageId: string;
  resultMessageId: string | null;
  updatedAt: string;
}

export type ChannelViewMode = "chat" | "tasks";

export const MOCK_CHANNEL_TASKS: ChannelTask[] = [
  {
    id: "task-1",
    channelId: "channel-cosgral",
    ownerBotId: "research",
    ownerBotName: "Research",
    state: "waiting",
    title: "Collect Needs you criteria",
    requestMessageId: "msg-1",
    resultMessageId: null,
    updatedAt: "2026-11-12T14:00:00.000Z",
  },
  {
    id: "task-2",
    channelId: "channel-cosgral",
    ownerBotId: "chief",
    ownerBotName: "Lead",
    state: "running",
    title: "Merge the B4 branch",
    requestMessageId: "msg-2",
    resultMessageId: null,
    updatedAt: "2026-11-12T14:10:00.000Z",
  },
  {
    id: "task-3",
    channelId: "channel-cosgral",
    ownerBotId: "writer",
    ownerBotName: "Writer",
    state: "done",
    title: "Draft the ui-b4-better report",
    requestMessageId: "msg-3",
    resultMessageId: "msg-4",
    updatedAt: "2026-11-12T13:50:00.000Z",
  },
];

export function channelTaskStateLabel(state: ChannelTaskState): string {
  switch (state) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "waiting":
      return "Waiting";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Stopped";
  }
}
