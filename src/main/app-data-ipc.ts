// COSGRAL W4-BE5: IPC of "Delete my data" (this computer only). The plan lists what goes and what is never touched;
// the request checks the confirmation word and the guard, stops the agents, writes the marker and restarts.

import { join } from "node:path";
import {
  DATA_WIPE_CONFIRMATION,
  type DataWipePlan,
  type DataWipeRequestResult,
  IPC_CHANNELS,
  parseRequestDataWipe,
} from "@openbot/contracts/ipc";
import { requestDataWipe, type WipePaths, wipeRoots } from "./data-wipe";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export interface AppDataIpcDeps {
  paths: () => WipePaths;
  /** Stops agents, channels, routines and servers, then quits and (normally) starts the program again. */
  stopAndRestart: () => Promise<void>;
}

export function dataWipePlan(paths: WipePaths): DataWipePlan {
  const [userData, agents] = wipeRoots(paths);
  return {
    removes: [
      {
        label:
          "Program data: database, conversations, settings, Vault and MCP secrets (encrypted with Windows safeStorage), browser profile, logs",
        path: userData ?? null,
      },
      { label: "Agents' folder: agent workspaces and shared files", path: agents ?? null },
    ],
    keeps: [
      { label: "Codex and Claude CLI sign-ins (kept in their own folders)", path: null },
      { label: "Data of the regular OpenBot app", path: join(paths.appData, "OpenBot") },
      { label: "Everything else on this computer", path: null },
    ],
    confirmationWord: DATA_WIPE_CONFIRMATION,
  };
}

export function registerAppDataIpc(deps: AppDataIpcDeps): void {
  handleTrusted(IPC_CHANNELS.appDataDescribeWipe, (input: unknown) => {
    localOnly(input);
    return dataWipePlan(deps.paths());
  });
  handleTrusted(IPC_CHANNELS.appDataRequestWipe, async (input: unknown): Promise<DataWipeRequestResult> => {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error("Delete my data works on this computer only.");
    parseRequestDataWipe(request.payload);
    const paths = deps.paths();
    wipeRoots(paths); // the guard first: nothing is marked when a folder is not allowed
    requestDataWipe(paths.userData);
    // Answer first, then stop and restart, so the window gets the result before it closes.
    setTimeout(() => void deps.stopAndRestart(), 50);
    return { status: "restarting" };
  });
}

function localOnly(input: unknown): void {
  if (parseAgentRequest(input).serverId !== "local") throw new Error("Delete my data works on this computer only.");
}
