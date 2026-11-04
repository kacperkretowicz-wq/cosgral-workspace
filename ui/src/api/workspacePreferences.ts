import type { Personalization } from "@paperclipai/shared/personalization";
import type { UpdateWorkspacePreference, WorkspacePreference } from "@paperclipai/shared";
import { api, detachInflightGet } from "./client";

export const workspacePreferencesApi = {
  getPersonalization: () => {
    const path = "/workspace-preferences/me/personalization";
    detachInflightGet(path);
    return api.get<Personalization>(path, { cache: "no-store" });
  },
  updatePersonalization: (companyId: string, data: Personalization) =>
    api.put<Personalization>(`/companies/${companyId}/workspace-preferences/me/personalization`, data),
  get: () => {
    const path = "/workspace-preferences/me";
    // React Query keys include the account; path-only coalescing must not
    // deliver a previous session's still-running request to the next account.
    detachInflightGet(path);
    return api.get<WorkspacePreference>(path, { cache: "no-store" });
  },
  update: (companyId: string, data: UpdateWorkspacePreference) =>
    api.put<WorkspacePreference>(`/companies/${companyId}/workspace-preferences/me`, data),
};
