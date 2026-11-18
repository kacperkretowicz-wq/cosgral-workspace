// COSGRAL W12 (BE-J): the `tasks-view:*` IPC (this computer only). The server is checked first, then the engine is asked (it parses the
// request with the contract before it reads anything).

import { IPC_CHANNELS } from "@openbot/contracts/ipc";
import type { TasksViewService } from "../backend/tasks-view";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerTasksViewIpc(service: () => TasksViewService | null): void {
  const handle = <R>(channel: string, work: (engine: TasksViewService, payload: unknown) => R): void =>
    handleTrusted(channel, (input: unknown) => {
      const request = parseAgentRequest(input);
      if (request.serverId !== "local") throw new Error("This is available on this computer only.");
      const engine = service();
      if (!engine) throw new Error("COSGRAL Workspace is still starting.");
      return work(engine, request.payload);
    });
  handle(IPC_CHANNELS.tasksViewList, (engine, payload) => engine.list(payload));
  handle(IPC_CHANNELS.tasksViewDetail, (engine, payload) => engine.detail(payload));
  handle(IPC_CHANNELS.tasksViewBoard, (engine, payload) => engine.board(payload));
}
