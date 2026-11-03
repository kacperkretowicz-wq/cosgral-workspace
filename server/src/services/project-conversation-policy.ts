import { conflict } from "../errors.js";
import { PROJECT_CONVERSATION_ORIGIN_KIND } from "@paperclipai/shared";

export const PROJECT_CONVERSATION_ORIGIN = PROJECT_CONVERSATION_ORIGIN_KIND;

/** Keep the backing thread reachable and scoped to the same project. */
export function assertProjectConversationMutation(
  issue: { originKind: string; companyId: string; projectId: string | null; visibility: string },
  patch: { originKind?: string; companyId?: string; projectId?: string | null; visibility?: string; parentId?: string | null; hiddenAt?: Date | null; status?: string },
) {
  if (issue.originKind !== PROJECT_CONVERSATION_ORIGIN) return;
  if ((patch.companyId !== undefined && patch.companyId !== issue.companyId)
    || (patch.projectId !== undefined && patch.projectId !== issue.projectId)
    || (patch.originKind !== undefined && patch.originKind !== issue.originKind)
    || (patch.visibility !== undefined && patch.visibility !== issue.visibility)
    || patch.parentId != null || patch.hiddenAt != null
    || patch.status === "done" || patch.status === "cancelled") {
    throw conflict("The shared project conversation cannot be closed, hidden, moved, or made private as a task.");
  }
}
