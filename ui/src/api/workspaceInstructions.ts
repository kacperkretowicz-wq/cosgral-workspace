import type { WorkspaceInstruction, WorkspaceInstructionView } from "@paperclipai/shared/workspace-instructions";
import { api } from "./client";
const path = (companyId: string, scope: string) => `/companies/${companyId}/instructions/${scope}`;
export const workspaceInstructionsApi = {
  get: (companyId: string, scope: string) => api.get<WorkspaceInstructionView>(path(companyId, scope)),
  put: (companyId: string, scope: string, value: WorkspaceInstruction) => api.put<WorkspaceInstruction>(path(companyId, scope), value),
};
