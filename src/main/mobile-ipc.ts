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
import type { AgentService } from "../backend/agent-service";
import { MobileConnect, mobileAgents, mobileNeedsYou } from "../backend/mobile-connect";
import { MobilePhoneApi, type MobilePhoneHost } from "../backend/mobile-phone-api";
import { MobileStore } from "../backend/mobile-store";
import type { SecretBox } from "../backend/vault-store";
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
  /** COSGRAL W3 (rows 43–44): the program behind the phone API; without it phones only read agents and Needs you. */
  phone?: MobilePhoneHost;
  /** COSGRAL W3-BE7: keeps the TLS key encrypted (safeStorage); without it only plain loopback works. */
  secretBox?: SecretBox;
}

/** What the phone API uses of the agent service. */
export type MobileAgentService = Pick<
  AgentService,
  | "listBots"
  | "readConversation"
  | "sendMessage"
  | "listPendingRequests"
  | "respondToPrompt"
  | "respondToApproval"
  | "respondToDraftPreview"
  | "updateBot"
  | "on"
  | "off"
  | "agentTemplates"
  | "agentSettings"
>;

/** The phone API on top of the same calls the window uses. */
export function mobilePhoneHost(service: MobileAgentService): MobilePhoneHost {
  return {
    bots: () => service.listBots(),
    readConversation: (botId) => service.readConversation(botId),
    sendMessage: (input) => service.sendMessage(input),
    pending: () => service.listPendingRequests(),
    respondToPrompt: (input) => service.respondToPrompt(input),
    respondToApproval: (input) => service.respondToApproval(input),
    respondToDraftPreview: (input) => service.respondToDraftPreview(input),
    templates: () => service.agentTemplates.list(),
    createAgent: (input) => service.agentTemplates.createAgent(input),
    updateProfile: async (input) => {
      await service.agentSettings.update(input);
    },
    setAvatarHue: async (botId, hue) => {
      await service.updateBot({ botId, avatarHue: hue });
    },
    subscribe: (listener) => {
      service.on("event", listener);
      return () => {
        service.off("event", listener);
      };
    },
  };
}

export function createMobileConnect(options: MobileRuntimeOptions): MobileConnect {
  const mobile = new MobileConnect({
    store: new MobileStore(join(options.userDataPath, "mobile.json"), options.secretBox),
    agents: () => mobileAgents(options.bots()),
    needsYou: () => mobileNeedsYou(options.pending()),
    confirm: options.confirm,
    canAsk: options.canAsk,
    emit: options.emit,
    ...(options.phone ? { phone: new MobilePhoneApi({ host: options.phone }) } : {}),
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
  handleTrusted(IPC_CHANNELS.mobileRotateCertificate, () => current().rotateCertificate());
}
