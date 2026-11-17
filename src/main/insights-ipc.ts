// COSGRAL W12 (BE-H): the `library-view:*`, `usage-report:*` and `schedule:*` IPC (this computer only). The order of every call: the
// server is checked first, then the engine is asked (it parses the request with the contract before it reads or deletes anything).

import { IPC_CHANNELS } from "@openbot/contracts/ipc";
import type { LibraryViewService } from "../backend/library-view";
import type { ScheduleViewService } from "../backend/schedule-view";
import type { UsageReportService } from "../backend/usage-report";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export interface InsightsIpcDeps {
  library: () => LibraryViewService | null;
  usage: () => UsageReportService | null;
  schedule: () => ScheduleViewService | null;
}

export function registerInsightsIpc(deps: InsightsIpcDeps): void {
  const handle = <E, R>(channel: string, engine: () => E | null, work: (engine: E, payload: unknown) => R): void =>
    handleTrusted(channel, (input: unknown) => {
      const request = parseAgentRequest(input);
      if (request.serverId !== "local") throw new Error("This is available on this computer only.");
      const ready = engine();
      if (!ready) throw new Error("COSGRAL Workspace is still starting.");
      return work(ready, request.payload);
    });
  handle(IPC_CHANNELS.libraryViewPage, deps.library, (engine, payload) => engine.page(payload));
  handle(IPC_CHANNELS.libraryViewDeleteMany, deps.library, (engine, payload) => engine.deleteMany(payload));
  handle(IPC_CHANNELS.libraryViewCleanup, deps.library, (engine, payload) => engine.cleanup(payload));
  handle(IPC_CHANNELS.usageReportGet, deps.usage, (engine, payload) => engine.get(payload));
  handle(IPC_CHANNELS.scheduleView, deps.schedule, (engine, payload) => engine.view(payload));
  handle(IPC_CHANNELS.scheduleFeed, deps.schedule, (engine, payload) => engine.feed(payload));
}
