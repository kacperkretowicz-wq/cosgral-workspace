import { z } from "zod";
import { PERMISSION_KEYS } from "./constants.js";

export const companyRoleDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(2000),
  permissions: z.array(z.enum(PERMISSION_KEYS)).max(PERMISSION_KEYS.length)
    .refine(keys => new Set(keys).size === keys.length, "Uprawnienia nie mogą się powtarzać"),
}).strict();
export const updateCompanyRoleSchema = companyRoleDefinitionSchema.extend({ version: z.number().int().positive() });
export const assignCompanyRoleSchema = z.object({ roleId: z.uuid(), version: z.number().int().positive() }).strict();
export const companyRoleSchema = companyRoleDefinitionSchema.extend({
  id: z.uuid(), companyId: z.uuid(), version: z.number().int().positive(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export const companyRoleApplicationSchema = z.object({
  companyId: z.uuid(), memberId: z.uuid(), roleId: z.uuid(), version: z.number().int().positive(),
  name: z.string(), permissions: z.array(z.enum(PERMISSION_KEYS)), appliedByUserId: z.string(), appliedAt: z.string().datetime(),
}).strict();
export type CompanyRoleDefinition = z.infer<typeof companyRoleDefinitionSchema>;
