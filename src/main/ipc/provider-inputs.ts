// COSGRAL W3: input validation for the providers IPC calls. Content rules (id format, limits, known models) are in ProviderRegistry.

import {
  type AcpAgentIdInput,
  type AgentModelId,
  type FallbackModelsInput,
  isAgentModel,
  PROVIDER_LIMITS,
  type SaveAcpAgentInput,
} from "@openbot/contracts/ipc";
import { isString } from "@openbot/contracts/runtime-values";
import { isObject, requireString } from "./validation";

export function parseSaveAcpAgent(value: unknown): SaveAcpAgentInput {
  if (!isObject(value)) throw new Error("ACP agent details are required.");
  return {
    id: requireString(value.id, "id", PROVIDER_LIMITS.acpId),
    name: requireString(value.name, "name", PROVIDER_LIMITS.acpName),
    command: requireString(value.command, "command", PROVIDER_LIMITS.command),
    args: optionalArgs(value.args),
  };
}

export function parseAcpAgentId(value: unknown): AcpAgentIdInput {
  if (!isObject(value)) throw new Error("The ACP agent is required.");
  return { id: requireString(value.id, "id", PROVIDER_LIMITS.acpId) };
}

export function parseFallbackBotId(value: unknown): string {
  return requireString(value, "botId");
}

export function parseFallbackModels(value: unknown): FallbackModelsInput {
  if (!isObject(value)) throw new Error("Fallback models are required.");
  if (!Array.isArray(value.fallbackModels)) throw new Error("fallbackModels must be a list of models.");
  const fallbackModels: AgentModelId[] = [];
  for (const model of value.fallbackModels) {
    if (!isAgentModel(model)) throw new Error("fallbackModels has an unknown model.");
    fallbackModels.push(model);
  }
  return { botId: requireString(value.botId, "botId"), fallbackModels };
}

function optionalArgs(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || !value.every(isString)) throw new Error("args must be a list of texts.");
  if (value.length > PROVIDER_LIMITS.args) throw new Error(`At most ${PROVIDER_LIMITS.args} arguments.`);
  if (value.some((arg) => arg.length > PROVIDER_LIMITS.arg)) throw new Error("An argument is too long.");
  return [...value];
}
