// COSGRAL: IPC of the built-in skills. They are on this computer only; a remote server shows none.

import { IPC_CHANNELS } from "@openbot/contracts/ipc";
import type { BuiltinSkills } from "../backend/builtin-skills";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { parseApplyBuiltinSkill, parseSetBuiltinSkillDefault } from "./ipc/builtin-skills-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerBuiltinSkillsIpc(builtin: () => BuiltinSkills | null): void {
  handleTrusted(IPC_CHANNELS.builtinSkillsList, async (input: unknown) => {
    const scoped = parseAgentRequest(input);
    return scoped.serverId === "local" ? ((await builtin()?.list()) ?? []) : [];
  });
  handleTrusted(IPC_CHANNELS.builtinSkillsApply, (input: unknown) =>
    required(builtin).apply(local(input, parseApplyBuiltinSkill)),
  );
  handleTrusted(IPC_CHANNELS.builtinSkillsSetDefault, (input: unknown) =>
    required(builtin).setDefault(local(input, parseSetBuiltinSkillDefault)),
  );
}

function required(builtin: () => BuiltinSkills | null): BuiltinSkills {
  const value = builtin();
  if (!value) throw new Error("The built-in skills are not ready yet.");
  return value;
}

function local<T>(input: unknown, parse: (payload: unknown) => T): T {
  const scoped = parseAgentRequest(input);
  if (scoped.serverId !== "local") throw new Error("The built-in skills are on this computer only for now.");
  return parse(scoped.payload);
}
