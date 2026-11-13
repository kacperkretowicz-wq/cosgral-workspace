// COSGRAL W3: IPC of Computer Use: who controls this computer, and Stop. Stop always acts on this computer, whatever
// server the window shows, so a person can always end a session.

import { emptyComputerUseState, IPC_CHANNELS } from "@openbot/contracts/ipc";
import type { ComputerUseController } from "../backend/computer-use";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { parseStopComputerUse } from "./ipc/computer-use-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerComputerUseIpc(computerUse: () => ComputerUseController): void {
  handleTrusted(IPC_CHANNELS.computerUseGetState, (input: unknown) =>
    parseAgentRequest(input).serverId === "local" ? computerUse().getState() : emptyComputerUseState(),
  );
  handleTrusted(IPC_CHANNELS.computerUseStop, (input: unknown) =>
    computerUse().stop(parseStopComputerUse(parseAgentRequest(input).payload)),
  );
}
