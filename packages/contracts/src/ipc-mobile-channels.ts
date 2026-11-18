// COSGRAL W12 (BE-AB, parity row 71): channels on the phone. The phone API (ipc-mobile.ts) had only chats with agents;
// this adds the channels of the computer: the list, the tasks of one channel, one page of its messages, a message from
// the person (which starts a task, as in the window) and Stop/Pause/Resume of a task. What stays on the computer:
// creating, changing and archiving channels, members and the lead, memory, routines, reassigning and archiving tasks,
// and clearing the history. The stream (/v1/events) does not carry channel changes yet; the phone asks again.

import type { ChannelTaskState } from "./ipc-workspace-channels";

export const MOBILE_CHANNEL_PATHS = {
  channels: "/v1/channels",
} as const;

/** What a phone may do with a task (the window also has archive, restore and reassign). */
export const MOBILE_CHANNEL_TASK_ACTIONS = ["stop", "pause", "resume"] as const;
export type MobileChannelTaskAction = (typeof MOBILE_CHANNEL_TASK_ACTIONS)[number];

export const mobileChannelPath = {
  messages: (channelId: string) => `/v1/channels/${encodeURIComponent(channelId)}/messages`,
  tasks: (channelId: string) => `/v1/channels/${encodeURIComponent(channelId)}/tasks`,
  taskAction: (channelId: string, taskId: string, action: MobileChannelTaskAction) =>
    `/v1/channels/${encodeURIComponent(channelId)}/tasks/${encodeURIComponent(taskId)}/${action}`,
} as const;

export const MOBILE_CHANNEL_LIMITS = {
  /** Newest messages of one channel in one page (the page may be smaller; `limit` is from 1 to this). */
  messagesPage: 30,
  messagesPageMax: 100,
  /** Tasks in one answer (the newest ones; archived tasks are not sent). */
  tasks: 100,
} as const;

/** GET MOBILE_CHANNEL_PATHS.channels: not archived channels, newest change first. */
export interface MobileChannel {
  id: string;
  name: string;
  title: string;
  leadBotId: string | null;
  memberBotIds: string[];
  /** Tasks that are queued, running, waiting or paused. */
  openTasks: number;
  updatedAt: string;
}

export interface MobileChannelMessage {
  id: string;
  taskId: string | null;
  /** Null for a message of the person or the program. */
  authorBotId: string | null;
  kind: "human" | "assignment" | "question" | "reply" | "result" | "note" | "system";
  text: string;
  replyToMessageId: string | null;
  /** An older version of a result; the phone may grey it out. */
  superseded: boolean;
  createdAt: string;
}

/** GET mobileChannelPath.messages(id)?before=<id>&limit=<n>: oldest first; `nextBefore` loads older ones. */
export interface MobileChannelMessagePage {
  channelId: string;
  messages: MobileChannelMessage[];
  nextBefore: string | null;
}

export interface MobileChannelTask {
  id: string;
  ownerBotId: string;
  state: ChannelTaskState;
  title: string;
  parentTaskId: string | null;
  updatedAt: string;
}

/** POST mobileChannelPath.messages(id): 202 with the ids of the message and of the task it started. */
export interface MobileChannelSendResponse {
  messageId: string;
  taskId: string;
}
