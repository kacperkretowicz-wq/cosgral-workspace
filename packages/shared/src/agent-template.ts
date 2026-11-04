import { z } from 'zod';
import { AGENT_ROLES } from './constants.js';
import { agentAdapterTypeSchema } from './adapter-type.js';

// Portable data only. Never accept arbitrary adapter/runtime/permission records.
const text = z.string().max(32000);
export const agentTemplateSchema = z.object({
  version: z.literal(1), name: text.min(1), role: z.enum(AGENT_ROLES), description: text,
  model: text, reasoning: text, instructions: text,
  maxConcurrentRuns: z.number().int().min(1).max(10),
  budgetMonthlyCents: z.number().int().min(0).max(2147483647),
  permissions: z.object({ canCreateAgents: z.boolean(), canCreateSkills: z.boolean() }).strict(),
  tools: z.array(z.string().max(120)).max(50),
}).strict();
export type AgentTemplate = z.infer<typeof agentTemplateSchema>;
export const createAgentFromTemplateSchema = z.object({
  template: agentTemplateSchema, adapterType: agentAdapterTypeSchema, projectId: z.string().uuid(),
}).strict();
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const string = (v: unknown) => typeof v === 'string' ? v : '';
export function exportAgentTemplate(agent: Record<string, unknown>): AgentTemplate {
  const config = record(agent.adapterConfig), heartbeat = record(record(agent.runtimeConfig).heartbeat), permissions = record(agent.permissions);
  const excluded = Object.fromEntries(Object.entries(config).filter(([key]) => !['model', 'modelReasoningEffort', 'promptTemplate'].includes(key)));
  const privateValues: string[] = [];
  const collect = (v: unknown) => { if (typeof v === 'string' && v.length > 2) privateValues.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(collect); };
  collect(excluded); collect(agent.runtimeConfig);
  const clean = (v: unknown) => privateValues.sort((a, b) => b.length - a.length).reduce((value, secret) => value.split(secret).join('[redacted]'), string(v));
  return agentTemplateSchema.parse({ version: 1, name: clean(agent.name), role: agent.role,
    description: clean(agent.capabilities), model: clean(config.model), reasoning: clean(config.modelReasoningEffort),
    instructions: clean(config.promptTemplate), maxConcurrentRuns: heartbeat.maxConcurrentRuns ?? 1,
    budgetMonthlyCents: agent.budgetMonthlyCents ?? 0,
    permissions: { canCreateAgents: permissions.canCreateAgents === true, canCreateSkills: permissions.canCreateSkills === true },
    tools: [],
  });
}
export function instantiateAgentTemplate(template: AgentTemplate, adapterType: string, companyId: string, projectId: string) {
  const t = agentTemplateSchema.parse(template);
  return { name: t.name, role: t.role, capabilities: t.description, adapterType, runner: 'legacy' as const,
    adapterConfig: { ...(t.model ? { model: t.model } : {}), ...(t.reasoning ? { modelReasoningEffort: t.reasoning } : {}) },
    ...(t.instructions ? { instructionsBundle: { files: { 'AGENTS.md': t.instructions } } } : {}),
    runtimeConfig: { heartbeat: { enabled: false, intervalSec: 0, wakeOnDemand: false, maxConcurrentRuns: t.maxConcurrentRuns } },
    budgetMonthlyCents: t.budgetMonthlyCents,
    permissions: { ...t.permissions, trustPreset: 'low_trust_review', authorizationPolicy: { trustBoundary: { mode: 'low_trust_review', companyId, projectIds: [projectId] } } },
    metadata: { templateVersion: 1, declaredTools: t.tools },
  };
}
export type AgentConfigurationStats = {
  completedTasks: number;
  state: 'available' | 'working' | 'waiting' | 'offline' | 'error';
  recentErrors: { id: string; at: string; message: string }[];
};
