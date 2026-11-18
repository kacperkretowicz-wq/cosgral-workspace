// COSGRAL W12 (BE-J): the Tasks view (contract: ipc-tasks-view.ts): the tasks of all channels in one list, and one task with its result,
// steps and log. It keeps nothing of its own: the tasks, messages and assignments come from the channel store; the list and the detail
// are built by the same pure functions the mock uses, so the screen and the real answers never disagree.

import {
  buildTaskDetail,
  buildTasksBoard,
  buildTasksViewPage,
  CHANNEL_LIMITS,
  type ChannelAssignment,
  type ChannelMessage,
  type ChannelTask,
  parseTaskDetailInput,
  parseTasksBoardQuery,
  parseTasksViewQuery,
  type TaskDetail,
  type TasksBoard,
  type TasksViewPage,
  type TasksViewSource,
  type WorkspaceChannel,
} from "@openbot/contracts/ipc";

/** The reads of the channel store this view needs (the store itself fits). */
export interface TasksViewChannels {
  list: () => WorkspaceChannel[];
  listTasks: (channelId: string) => ChannelTask[];
  getMessage: (channelId: string, id: string) => ChannelMessage;
  listMessages: (channelId: string, input?: { beforeMessageId?: string; limit?: number }) => ChannelMessage[];
  listAssignments: (taskId: string) => ChannelAssignment[];
}

export interface TasksViewOptions {
  channels: TasksViewChannels;
  agentName: (botId: string) => string | null;
  /** How many messages of a channel are looked through for the log of one task. Default 1000 (five pages). */
  scanMessages?: number;
}

export class TasksViewService {
  readonly #options: TasksViewOptions;

  constructor(options: TasksViewOptions) {
    this.#options = options;
  }

  list(raw?: unknown): TasksViewPage {
    return buildTasksViewPage(parseTasksViewQuery(raw), this.#source());
  }

  board(raw?: unknown): TasksBoard {
    return buildTasksBoard(parseTasksBoardQuery(raw), this.#source());
  }

  detail(raw: unknown): TaskDetail {
    return buildTaskDetail(parseTaskDetailInput(raw).taskId, this.#source());
  }

  #source(): TasksViewSource {
    const { channels, agentName } = this.#options;
    const scan = this.#options.scanMessages ?? 5 * CHANNEL_LIMITS.historyPage;
    return {
      // Archived channels keep their tasks: the archive of tasks is the person's, not the channel's.
      channels: channels.list(),
      tasks: (channelId) => channels.listTasks(channelId),
      message: (channelId, messageId) => {
        try {
          return channels.getMessage(channelId, messageId);
        } catch {
          return null;
        }
      },
      taskMessages: (task) => {
        const found: ChannelMessage[] = [];
        let before: string | undefined;
        let looked = 0;
        for (;;) {
          const page = channels.listMessages(task.channelId, {
            limit: CHANNEL_LIMITS.historyPage,
            ...(before ? { beforeMessageId: before } : {}),
          });
          if (page.length === 0) return { messages: found.reverse(), truncated: false };
          for (let index = page.length - 1; index >= 0; index -= 1) {
            const message = page[index];
            if (message?.taskId === task.id) found.push(message);
          }
          looked += page.length;
          const oldest = page[0];
          if (page.length < CHANNEL_LIMITS.historyPage || !oldest)
            return { messages: found.reverse(), truncated: false };
          if (looked >= scan) return { messages: found.reverse(), truncated: true };
          before = oldest.id;
        }
      },
      assignments: (taskId) => channels.listAssignments(taskId),
      agentName,
    };
  }
}
