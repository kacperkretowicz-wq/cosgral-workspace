// COSGRAL W9-BE1: the `phone:*` IPC (this computer only): the reach of the phone (Tailscale guide), the push switch and a test
// notification. Every request is parsed by the contract first. The PIN and the push subscription are NOT here: they belong
// to the phone itself and travel on its own authenticated connection, never through the window.

import {
  IPC_CHANNELS,
  PHONE_TAILSCALE_GUIDE,
  parsePhonePushTestInput,
  parseSetPhonePushInput,
} from "@openbot/contracts/ipc";
import type { PhoneAccess } from "../backend/phone-access";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerPhoneIpc(access: () => PhoneAccess | null): void {
  const local = (input: unknown) => {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error("The phone is managed on this computer only.");
    return request.payload;
  };
  const current = (): PhoneAccess => {
    const value = access();
    if (!value) throw new Error("Mobile Connect is not ready yet.");
    return value;
  };
  handleTrusted(IPC_CHANNELS.phoneGetState, (input: unknown) => {
    local(input);
    return current().getState();
  });
  handleTrusted(IPC_CHANNELS.phoneGetTailscaleGuide, (input: unknown) => {
    local(input);
    return structuredClone(PHONE_TAILSCALE_GUIDE);
  });
  handleTrusted(IPC_CHANNELS.phoneSetPushEnabled, (input: unknown) => {
    const request = parseSetPhonePushInput(local(input));
    return current().setPushEnabled(request.enabled);
  });
  handleTrusted(IPC_CHANNELS.phoneSendTestPush, (input: unknown) => {
    const request = parsePhonePushTestInput(local(input));
    return current().sendTestPush(request.deviceId);
  });
}
