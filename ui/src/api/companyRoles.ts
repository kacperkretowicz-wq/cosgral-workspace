import type { CompanyRoleDefinition, CompanyRoleAgentRecipient, companyRoleSchema, companyRoleApplicationSchema } from "@paperclipai/shared/company-roles";
import { api } from "./client";
export type CompanyRole = typeof companyRoleSchema._output;
export const companyRolesApi = {
  agentRecipients: (companyId: string) => api.get<CompanyRoleAgentRecipient[]>(`/companies/${companyId}/role-agent-recipients`),
  remove: (companyId: string, roleId: string, version: number) => api.deleteWithBody<{ deleted: boolean }>(`/companies/${companyId}/roles/${roleId}`, { version }),
  list: (companyId: string) => api.get<CompanyRole[]>(`/companies/${companyId}/roles`),
  create: (companyId: string, definition: CompanyRoleDefinition) => api.post<CompanyRole>(`/companies/${companyId}/roles`, definition),
  update: (companyId: string, roleId: string, definition: CompanyRoleDefinition & { version: number }) => api.put<CompanyRole>(`/companies/${companyId}/roles/${roleId}`, definition),
  apply: (companyId: string, memberId: string, input: { roleId: string; version: number }) => api.put<typeof companyRoleApplicationSchema._output>(`/companies/${companyId}/members/${memberId}/custom-role`, input),
};
