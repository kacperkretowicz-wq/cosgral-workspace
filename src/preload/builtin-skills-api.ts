// COSGRAL: the window API of the built-in skills. Answers are checked with the contract guards.

import {
  type BuiltinSkillPack,
  type BuiltinSkillsDesktopApi,
  IPC_CHANNELS,
  isBuiltinSkillPack,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createBuiltinSkillsApi(invoke: Invoke): BuiltinSkillsDesktopApi {
  return {
    list: () => invoke(IPC_CHANNELS.builtinSkillsList, null, decodePacks),
    apply: (input) => invoke(IPC_CHANNELS.builtinSkillsApply, input, decodePacks),
    setDefault: (input) => invoke(IPC_CHANNELS.builtinSkillsSetDefault, input, decodePacks),
  };
}

function decodePacks(value: unknown): BuiltinSkillPack[] {
  if (!Array.isArray(value)) throw new Error("Invalid built-in skills response.");
  return value.filter(isBuiltinSkillPack);
}
