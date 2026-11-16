// COSGRAL W9-BE1: the phone away from home for Storybook and the preview. Demo data only; nothing is contacted. The same
// rules as the program: push is off until the person turns it on, nothing can be sent without a phone that allowed
// notifications, a test says why it was not sent, and the state never carries a key or a PIN. `simulate` plays the phone
// side: a phone pairing, setting a PIN, allowing notifications, and the reach changing.

import {
  type AgentEvent,
  type MobileExposure,
  PHONE_PUSH_REASONS,
  PHONE_TAILSCALE_GUIDE,
  type PhoneAccessState,
  type PhoneDesktopApi,
  type PhoneDeviceAccess,
  type PhonePushTestResult,
  parsePhonePushTestInput,
  parseSetPhonePushInput,
  phonePushUnavailableReason,
  phoneReachOf,
  tailscaleUrlsOf,
} from "@openbot/contracts/ipc";

export interface MockPhone extends Required<PhoneDesktopApi> {
  simulate: {
    /** A phone paired (no PIN, no notifications yet). */
    pair: (deviceId: string, name: string) => void;
    /** The phone set a PIN (it is locked from now on until unlocked). */
    setPin: (deviceId: string) => void;
    /** The phone allowed notifications. */
    allowNotifications: (deviceId: string) => void;
    /** The reach changed: Mobile Connect on or off, loopback or lan, and the URLs it lists. */
    setReach: (input: { enabled: boolean; exposure: MobileExposure; urls: string[] }) => void;
  };
}

const DEMO_FINGERPRINT = Array.from({ length: 32 }, (_, index) =>
  (index * 7 + 11).toString(16).padStart(2, "0").toUpperCase(),
).join(":");

export function createMockPhone(emit: (event: AgentEvent) => void): MockPhone {
  let clock = Date.parse("2026-11-16T12:00:00.000Z");
  const now = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };
  let enabled = true;
  let exposure: MobileExposure = "lan";
  let urls = ["https://192.168.1.20:47930"];
  let pushEnabled = false;
  const keysReady = true;
  const devices = new Map<string, PhoneDeviceAccess>([
    [
      "phone-1",
      {
        deviceId: "phone-1",
        name: "Pixel (demo)",
        pinSet: false,
        locked: false,
        pushSubscribed: false,
        pushError: null,
        lastPushAt: null,
      },
    ],
  ]);

  const state = (): PhoneAccessState => {
    const subscriptions = [...devices.values()].filter((device) => device.pushSubscribed).length;
    return {
      enabled,
      exposure,
      reach: phoneReachOf(enabled, exposure, urls),
      tailscaleUrls: tailscaleUrlsOf(urls),
      fingerprint: enabled ? DEMO_FINGERPRINT : null,
      certificate: "self-signed",
      push: {
        enabled: pushEnabled,
        keysReady,
        publicKey: keysReady ? "BDemoPublicKeyForTheStorybookOnlyNotARealKey" : null,
        unavailableReason: phonePushUnavailableReason({ enabled: pushEnabled, keysReady, subscriptions }),
        subscriptions,
      },
      devices: [...devices.values()].map((device) => ({ ...device })),
    };
  };
  const publish = (): PhoneAccessState => {
    const snapshot = state();
    emit({ type: "phone-access-changed", state: snapshot });
    return snapshot;
  };

  return {
    getState: async () => state(),
    getTailscaleGuide: async () => structuredClone(PHONE_TAILSCALE_GUIDE),
    setPushEnabled: async (raw) => {
      pushEnabled = parseSetPhonePushInput(raw).enabled;
      return publish();
    },
    sendTestPush: async (raw): Promise<PhonePushTestResult> => {
      const { deviceId } = parsePhonePushTestInput(raw);
      const device = devices.get(deviceId);
      if (!device) return { sent: false, reason: "This phone is not paired." };
      if (!pushEnabled) return { sent: false, reason: PHONE_PUSH_REASONS.off };
      if (!device.pushSubscribed) return { sent: false, reason: "This phone has not allowed notifications yet." };
      device.lastPushAt = now();
      publish();
      return { sent: true, reason: null };
    },
    simulate: {
      pair: (deviceId, name) => {
        devices.set(deviceId, {
          deviceId,
          name,
          pinSet: false,
          locked: false,
          pushSubscribed: false,
          pushError: null,
          lastPushAt: null,
        });
        publish();
      },
      setPin: (deviceId) => {
        const device = devices.get(deviceId);
        if (device) device.pinSet = true;
        publish();
      },
      allowNotifications: (deviceId) => {
        const device = devices.get(deviceId);
        if (device) device.pushSubscribed = true;
        publish();
      },
      setReach: (input) => {
        enabled = input.enabled;
        exposure = input.exposure;
        urls = input.urls;
        publish();
      },
    },
  };
}
