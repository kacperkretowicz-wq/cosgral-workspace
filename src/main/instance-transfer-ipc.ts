// COSGRAL W12-KK (g2): the `instance-transfer:*` IPC (this computer only): Transfer and Import of agents with one .zip. Every request is
// parsed by the contract first. The window never gets a path or the bytes of a file: the dialogs and the file are in the main process.

import {
  IPC_CHANNELS,
  parseApplyTransferInput,
  parseDiscardTransferInput,
  parseExportInstanceInput,
} from "@openbot/contracts/ipc";
import type { InstanceTransferService } from "../backend/instance-transfer/transfer-service";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerInstanceTransferIpc(service: () => InstanceTransferService | null): void {
  const local = (input: unknown) => {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error("Transfer is managed on this computer only.");
    return request.payload;
  };
  const current = (): InstanceTransferService => {
    const value = service();
    if (!value) throw new Error("COSGRAL Workspace is still starting.");
    return value;
  };
  handleTrusted(IPC_CHANNELS.instanceTransferSummary, (input: unknown) => {
    local(input);
    return current().summary();
  });
  handleTrusted(IPC_CHANNELS.instanceTransferExport, (input: unknown) => {
    const request = parseExportInstanceInput(local(input));
    return current().exportAgents(request);
  });
  handleTrusted(IPC_CHANNELS.instanceTransferChoose, (input: unknown) => {
    local(input);
    return current().choose();
  });
  handleTrusted(IPC_CHANNELS.instanceTransferApply, (input: unknown) => {
    const request = parseApplyTransferInput(local(input));
    return current().apply(request);
  });
  handleTrusted(IPC_CHANNELS.instanceTransferDiscard, (input: unknown) => {
    const request = parseDiscardTransferInput(local(input));
    current().discard(request.token);
  });
  handleTrusted(IPC_CHANNELS.instanceTransferImportSources, (input: unknown) => {
    local(input);
    return current().importSources();
  });
}
