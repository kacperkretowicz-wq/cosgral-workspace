// COSGRAL W3: IPC for workflows. This computer only, like routines, MCP and providers.

import { IPC_CHANNELS } from "@openbot/contracts/ipc";
import type { WorkflowManager } from "../backend/workflow-manager";
import { parseAgentRequest } from "./ipc/agent-inputs";
import {
  parseCreateWorkflow,
  parseRunWorkflow,
  parseUpdateWorkflow,
  parseWorkflowId,
  parseWorkflowRunId,
  parseWorkflowVersion,
} from "./ipc/workflow-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerWorkflowIpc(manager: WorkflowManager): void {
  handleTrusted(IPC_CHANNELS.workflowsList, (input: unknown) => (isLocal(input) ? manager.list() : []));
  handleTrusted(IPC_CHANNELS.workflowsCreate, (input: unknown) =>
    manager.create(localInput(input, parseCreateWorkflow)),
  );
  handleTrusted(IPC_CHANNELS.workflowsUpdate, (input: unknown) =>
    manager.update(localInput(input, parseUpdateWorkflow)),
  );
  handleTrusted(IPC_CHANNELS.workflowsDelete, (input: unknown) => {
    manager.delete(localInput(input, parseWorkflowId));
  });
  handleTrusted(IPC_CHANNELS.workflowsRun, (input: unknown) => manager.run(localInput(input, parseRunWorkflow)));
  handleTrusted(IPC_CHANNELS.workflowsCancelRun, (input: unknown) =>
    manager.cancelRun(localInput(input, parseWorkflowRunId)),
  );
  handleTrusted(IPC_CHANNELS.workflowsListRuns, (input: unknown) =>
    manager.listRuns(localInput(input, parseWorkflowId)),
  );
  handleTrusted(IPC_CHANNELS.workflowsListVersions, (input: unknown) =>
    manager.listVersions(localInput(input, parseWorkflowId)),
  );
  handleTrusted(IPC_CHANNELS.workflowsGetVersion, (input: unknown) =>
    manager.getVersion(localInput(input, parseWorkflowVersion)),
  );
  handleTrusted(IPC_CHANNELS.workflowsRestoreVersion, (input: unknown) =>
    manager.restoreVersion(localInput(input, parseWorkflowVersion)),
  );
}

function isLocal(input: unknown): boolean {
  return parseAgentRequest(input).serverId === "local";
}

function localInput<T>(input: unknown, parse: (payload: unknown) => T): T {
  const scoped = parseAgentRequest(input);
  if (scoped.serverId !== "local") throw new Error("Workflows are available only on this computer for now.");
  return parse(scoped.payload);
}
