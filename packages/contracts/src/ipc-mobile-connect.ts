// COSGRAL W12-KK: the "Mobile Connect" settings page in ONE query (screen "Your phones": the list of phones with "Add phone", the way
// the phone reaches this computer, and what this version does not offer). Pairing itself, the certificate and revoking stay in
// `window.openbot.mobile`; the reach, the push switch and the PIN state stay in `window.openbot.phone`. This only joins them, so the page
// is drawn from one answer and redrawn on `mobile-*` and `phone-access-changed`.

import type { MobileDevice, MobileExposure, MobileState } from "./ipc-mobile";
import type { PhoneAccessState, PhoneDeviceAccess } from "./ipc-phone-access";
import { isBoolean, isDynamicRecord, isOneOf, isString } from "./runtime-values";

/** How a phone reaches this computer. */
export const MOBILE_ROUTE_IDS = ["this-computer", "local-network", "cloud-relay"] as const;
export type MobileRouteId = (typeof MOBILE_ROUTE_IDS)[number];

export interface MobileRoute {
  id: MobileRouteId;
  label: string;
  description: string;
  /** Pass this to `mobile.startPairing({exposure})` when the person picks the route; null for a route that is not available. */
  exposure: MobileExposure | null;
  available: boolean;
  /** Why it is not available (the sentence the window shows). */
  reason: string | null;
  /** The route in use now. */
  selected: boolean;
}

/** A phone as "Your phones" lists it: what pairing knows plus what the phone's own lock and notifications say. */
export interface MobileConnectPhone {
  id: string;
  name: string;
  platform: string | null;
  pairedAt: string;
  lastSeenAt: string | null;
  lastAddress: string | null;
  pinSet: boolean;
  locked: boolean;
  pushSubscribed: boolean;
  pushError: string | null;
  lastPushAt: string | null;
}

/** Something the other program offers that this version does NOT, with its reason (shown as "not available in this version"). */
export interface MobileUnavailableFeature {
  id: "permanent-link" | "cloud-relay";
  label: string;
  reason: string;
}

export const MOBILE_UNAVAILABLE_FEATURES: readonly MobileUnavailableFeature[] = [
  {
    id: "permanent-link",
    label: "Permanent link",
    reason:
      "A link that never expires would let anyone who finds it into your agents. A paired phone stays paired until you remove it, so there is no need to sign in again.",
  },
  {
    id: "cloud-relay",
    label: "Through the cloud",
    reason:
      "It would route the conversation through a server. This version connects the phone straight to this computer (same network or Tailscale).",
  },
];

export interface MobileConnectOverview {
  /** The phone server, the addresses, the certificate fingerprint, the pairing in progress. */
  mobile: MobileState;
  /** The reach, the Tailscale addresses and the push switch. */
  phone: PhoneAccessState;
  /** The page's list, newest pairing first. Empty: "No phones yet". */
  phones: MobileConnectPhone[];
  routes: MobileRoute[];
  unavailable: MobileUnavailableFeature[];
}

export interface MobileConnectDesktopApi {
  getOverview: () => Promise<MobileConnectOverview>;
}

/** Joins the two states into the page's answer. Used by the program and by the preview, so both show the same thing. */
export function buildMobileConnectOverview(mobile: MobileState, phone: PhoneAccessState): MobileConnectOverview {
  const access = new Map<string, PhoneDeviceAccess>(phone.devices.map((device) => [device.deviceId, device]));
  const phones = [...mobile.devices]
    .sort((left, right) => right.pairedAt.localeCompare(left.pairedAt))
    .map((device: MobileDevice): MobileConnectPhone => {
      const lock = access.get(device.id);
      return {
        id: device.id,
        name: device.name,
        platform: device.platform,
        pairedAt: device.pairedAt,
        lastSeenAt: device.lastSeenAt,
        lastAddress: device.lastAddress,
        pinSet: lock?.pinSet ?? false,
        locked: lock?.locked ?? false,
        pushSubscribed: lock?.pushSubscribed ?? false,
        pushError: lock?.pushError ?? null,
        lastPushAt: lock?.lastPushAt ?? null,
      };
    });
  const tailscale = phone.tailscaleUrls.length > 0;
  const routes: MobileRoute[] = [
    {
      id: "this-computer",
      label: "This computer only",
      description: "Only a browser on this computer can open the phone page. Good for trying it.",
      exposure: "loopback",
      available: true,
      reason: null,
      selected: mobile.exposure === "loopback",
    },
    {
      id: "local-network",
      label: tailscale ? "Local network and Tailscale" : "Local network",
      description: tailscale
        ? "Phones on your home network, and away from home through your Tailscale address."
        : "Phones on your home network. For away from home, see the Tailscale steps.",
      exposure: "lan",
      available: true,
      reason: null,
      selected: mobile.exposure === "lan",
    },
    {
      id: "cloud-relay",
      label: "Through the cloud",
      description: "Not offered in this version.",
      exposure: null,
      available: false,
      reason: MOBILE_UNAVAILABLE_FEATURES.find((feature) => feature.id === "cloud-relay")?.reason ?? null,
      selected: false,
    },
  ];
  return { mobile, phone, phones, routes, unavailable: MOBILE_UNAVAILABLE_FEATURES.map((feature) => ({ ...feature })) };
}

/** The exposure to give `mobile.startPairing` for a route, or null when the route cannot be used. */
export function exposureForRoute(routes: readonly MobileRoute[], id: MobileRouteId): MobileExposure | null {
  const route = routes.find((candidate) => candidate.id === id);
  return route?.available ? route.exposure : null;
}

export function isMobileConnectOverview(value: unknown): value is MobileConnectOverview {
  return (
    isDynamicRecord(value) &&
    isDynamicRecord(value.mobile) &&
    isBoolean(value.mobile.enabled) &&
    isDynamicRecord(value.phone) &&
    isBoolean(value.phone.enabled) &&
    Array.isArray(value.phones) &&
    value.phones.every(
      (phone) =>
        isDynamicRecord(phone) &&
        isString(phone.id) &&
        isString(phone.name) &&
        isString(phone.pairedAt) &&
        isBoolean(phone.pinSet) &&
        isBoolean(phone.locked) &&
        isBoolean(phone.pushSubscribed),
    ) &&
    Array.isArray(value.routes) &&
    value.routes.every(
      (route) =>
        isDynamicRecord(route) &&
        isOneOf(MOBILE_ROUTE_IDS, route.id) &&
        isString(route.label) &&
        isString(route.description) &&
        isBoolean(route.available) &&
        isBoolean(route.selected) &&
        (route.available ? route.reason === null : isString(route.reason)),
    ) &&
    Array.isArray(value.unavailable) &&
    value.unavailable.every(
      (item) => isDynamicRecord(item) && isString(item.id) && isString(item.label) && isString(item.reason),
    )
  );
}
