// COSGRAL W12-KK: the `mobile-connect:get-overview` IPC (this computer only): the Mobile Connect page in one answer, joined from the
// phone server (`MobileConnect`) and the phone's own state (`PhoneAccess`). It holds no secret: no ticket, token, PIN or push key.

import { buildMobileConnectOverview, IPC_CHANNELS } from "@openbot/contracts/ipc";
import type { MobileConnect } from "../backend/mobile-connect";
import type { PhoneAccess } from "../backend/phone-access";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerMobileConnectOverviewIpc(
  mobile: () => MobileConnect | null,
  phone: () => PhoneAccess | null,
): void {
  handleTrusted(IPC_CHANNELS.mobileConnectGetOverview, (input: unknown) => {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error("The phone is managed on this computer only.");
    const mobileConnect = mobile();
    const access = phone();
    if (!mobileConnect || !access) throw new Error("Mobile Connect is not ready yet.");
    return buildMobileConnectOverview(mobileConnect.getState(), access.getState());
  });
}
