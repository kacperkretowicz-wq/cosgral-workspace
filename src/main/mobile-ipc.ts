// COSGRAL W3: Mobile Connect in the main process: the phone server and its IPC. It runs on this computer whatever
// server the window shows; paired phones read this computer's agents and Needs you.

import { join } from "node:path";
import {
  type AgentEvent,
  type BotSummary,
  type DraftPreviewResolution,
  IPC_CHANNELS,
  type PendingAgentRequest,
} from "@openbot/contracts/ipc";
import { MobileConnect, mobileAgents, mobileNeedsYou } from "../backend/mobile-connect";
import { MobileStore } from "../backend/mobile-store";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { parseMobileDeviceId, parseStartMobilePairing } from "./ipc/mobile-inputs";
import { handleTrusted } from "./trusted-ipc";

export interface MobileRuntimeOptions {
  userDataPath: string;
  bots: () => BotSummary[];
  pending: () => PendingAgentRequest[];
  /** The pairing consent card; rejects when no card can be shown. */
  confirm: (input: { title: string; preview: string }) => Promise<DraftPreviewResolution>;
  canAsk: () => boolean;
  emit: (event: AgentEvent) => void;
}

export function createMobileConnect(options: MobileRuntimeOptions): MobileConnect {
  const mobile = new MobileConnect({
    store: new MobileStore(join(options.userDataPath, "mobile.json")),
    agents: () => mobileAgents(options.bots()),
    needsYou: () => mobileNeedsYou(options.pending()),
    confirm: options.confirm,
    canAsk: options.canAsk,
    emit: options.emit,
  });
  mobile.resume().catch((error: unknown) => console.error("Mobile Connect could not start:", error));
  return mobile;
}

export function registerMobileIpc(mobile: () => MobileConnect | null): void {
  const current = (): MobileConnect => {
    const value = mobile();
    if (!value) throw new Error("Mobile Connect is not ready yet.");
    return value;
  };
  const payload = (input: unknown) => parseAgentRequest(input).payload;
  handleTrusted(IPC_CHANNELS.mobileGetState, () => current().getState());
  handleTrusted(IPC_CHANNELS.mobileStartPairing, (input: unknown) =>
    current().startPairing(parseStartMobilePairing(payload(input))),
  );
  handleTrusted(IPC_CHANNELS.mobileCancelPairing, () => current().cancelPairing());
  handleTrusted(IPC_CHANNELS.mobileDisable, () => current().disable());
  handleTrusted(IPC_CHANNELS.mobileListDevices, () => current().listDevices());
  handleTrusted(IPC_CHANNELS.mobileRevokeDevice, (input: unknown) =>
    current().revokeDevice(parseMobileDeviceId(payload(input))),
  );
}
