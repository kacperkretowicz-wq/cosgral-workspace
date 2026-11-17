// COSGRAL W12-KK: the Mobile Connect page for Storybook and the preview. DEMO data only; no phone is contacted. It joins the demo phone
// (`createMockPhone`: PIN, notifications, reach) with a demo list of paired devices through the SAME builder the program uses
// (`buildMobileConnectOverview`), so the page looks the same here and there. `simulate` plays phones pairing and the route changing.

import {
  type AgentEvent,
  buildMobileConnectOverview,
  type MobileConnectDesktopApi,
  type MobileDevice,
  type MobileExposure,
  type MobileState,
} from "@openbot/contracts/ipc";
import { createMockPhone, type MockPhone } from "./mock-phone";

export interface MockMobileConnect extends Required<MobileConnectDesktopApi> {
  /** The demo phone this page is joined with (its `simulate` is the phone's side: PIN, notifications). */
  phone: MockPhone;
  simulate: {
    /** A phone paired: it appears in the list (and in the phone's own state). */
    pair: (deviceId: string, name: string, platform?: string) => void;
    /** The route changed (the phone server restarts on the other exposure). */
    setRoute: (exposure: MobileExposure) => void;
    /** Mobile Connect is switched off (the list stays; the phones cannot connect). */
    off: () => void;
  };
}

const FINGERPRINT = Array.from({ length: 32 }, (_, index) =>
  ((index * 7 + 11) % 256).toString(16).padStart(2, "0").toUpperCase(),
).join(":");
const URLS: Record<MobileExposure, string[]> = {
  loopback: ["https://127.0.0.1:47930"],
  lan: ["https://192.168.1.20:47930"],
};

export function createMockMobileConnect(emit: (event: AgentEvent) => void): MockMobileConnect {
  const phone = createMockPhone(emit);
  let enabled = true;
  let exposure: MobileExposure = "lan";
  const devices: MobileDevice[] = [
    {
      id: "phone-1",
      name: "Pixel (demo)",
      platform: "android",
      pairedAt: "2026-11-15T09:00:00.000Z",
      lastSeenAt: "2026-11-17T08:30:00.000Z",
      lastAddress: "192.168.1.31",
    },
  ];
  let clock = Date.parse("2026-11-17T10:00:00.000Z");

  const mobileState = (): MobileState => ({
    enabled,
    exposure,
    port: enabled ? 47_930 : null,
    urls: enabled ? URLS[exposure] : [],
    transport: "tls",
    fingerprint: enabled ? FINGERPRINT : null,
    unencrypted: false,
    pairing: null,
    devices: devices.map((device) => ({ ...device })),
    unavailableReason: null,
  });

  const overview = async () => buildMobileConnectOverview(mobileState(), await phone.getState());

  return {
    phone,
    getOverview: overview,
    simulate: {
      pair: (deviceId, name, platform = "android") => {
        clock += 60_000;
        devices.push({
          id: deviceId,
          name,
          platform,
          pairedAt: new Date(clock).toISOString(),
          lastSeenAt: null,
          lastAddress: null,
        });
        phone.simulate.pair(deviceId, name);
      },
      setRoute: (next) => {
        exposure = next;
        phone.simulate.setReach({ enabled, exposure, urls: URLS[exposure] });
      },
      off: () => {
        enabled = false;
        phone.simulate.setReach({ enabled, exposure, urls: [] });
      },
    },
  };
}
