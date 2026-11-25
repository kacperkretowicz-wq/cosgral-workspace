// COSGRAL: the `project-plans:*` IPC (this computer only). The server is checked first, then the service is asked (it parses the
// request with the contract before it reads or changes anything).

import { IPC_CHANNELS } from "@openbot/contracts/ipc";
import type { ProjectPlanService } from "../backend/project-plans";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerProjectPlansIpc(service: () => ProjectPlanService | null): void {
  const handle = <R>(channel: string, work: (engine: ProjectPlanService, payload: unknown) => R): void =>
    handleTrusted(channel, (input: unknown) => {
      const request = parseAgentRequest(input);
      if (request.serverId !== "local") throw new Error("This is available on this computer only.");
      const engine = service();
      if (!engine) throw new Error("COSGRAL Workspace is still starting.");
      return work(engine, request.payload);
    });
  handle(IPC_CHANNELS.projectPlansGet, (engine, payload) => engine.get(payload));
  handle(IPC_CHANNELS.projectPlansSaveDescription, (engine, payload) => engine.saveDescription(payload));
  handle(IPC_CHANNELS.projectPlansRequest, (engine, payload) => engine.requestPlan(payload));
  handle(IPC_CHANNELS.projectPlansAccept, (engine, payload) => engine.accept(payload));
  handle(IPC_CHANNELS.projectPlansDecideSkills, (engine, payload) => engine.decideSkills(payload));
  handle(IPC_CHANNELS.projectPlansDecideReview, (engine, payload) => engine.decideReview(payload));
  handle(IPC_CHANNELS.projectPlansSetReviewItem, (engine, payload) => engine.setReviewItem(payload));
}
