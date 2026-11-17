// @vitest-environment node
import {
  type AgentEvent,
  exposureForRoute,
  isMobileConnectOverview,
  MOBILE_UNAVAILABLE_FEATURES,
} from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockMobileConnect } from "./mock-mobile-connect";

const setup = () => {
  const events: AgentEvent[] = [];
  return { mock: createMockMobileConnect((event) => events.push(event)), events };
};

describe("Mobile Connect page in one query (W12-KK)", () => {
  it("lists the paired phones with their lock and notification state, the routes, and what is not offered with a reason", async () => {
    const { mock } = setup();
    const overview = await mock.getOverview();
    expect(isMobileConnectOverview(overview)).toBe(true);
    expect(overview.phones).toHaveLength(1);
    expect(overview.phones[0]).toMatchObject({
      id: "phone-1",
      name: "Pixel (demo)",
      pinSet: false,
      pushSubscribed: false,
      locked: false,
    });
    expect(overview.routes.map((route) => [route.id, route.available, route.selected])).toEqual([
      ["this-computer", true, false],
      ["local-network", true, true],
      ["cloud-relay", false, false],
    ]);
    expect(overview.routes.find((route) => route.id === "cloud-relay")?.reason).toMatch(/straight to this computer/);
    expect(overview.unavailable.map((item) => item.id)).toEqual(MOBILE_UNAVAILABLE_FEATURES.map((item) => item.id));
    expect(overview.unavailable.find((item) => item.id === "permanent-link")?.reason).toMatch(/never expires/);
  });

  it("a newly paired phone comes first, and the phone's own PIN and notification state show on it", async () => {
    const { mock } = setup();
    mock.simulate.pair("phone-2", "iPhone (demo)", "ios");
    mock.phone.simulate.setPin("phone-2");
    mock.phone.simulate.allowNotifications("phone-2");
    const overview = await mock.getOverview();
    expect(overview.phones.map((phone) => phone.id)).toEqual(["phone-2", "phone-1"]);
    expect(overview.phones[0]).toMatchObject({ platform: "ios", pinSet: true, locked: false, pushSubscribed: true });
  });

  it("an empty list says so, and the route follows the exposure (Tailscale shows in the label)", async () => {
    const { mock } = setup();
    mock.simulate.setRoute("loopback");
    const loopback = await mock.getOverview();
    expect(loopback.routes.find((route) => route.id === "this-computer")?.selected).toBe(true);
    expect(exposureForRoute(loopback.routes, "this-computer")).toBe("loopback");
    expect(exposureForRoute(loopback.routes, "local-network")).toBe("lan");
    // A route that is not offered gives no exposure to start pairing with.
    expect(exposureForRoute(loopback.routes, "cloud-relay")).toBeNull();
    expect(loopback.mobile.urls).toEqual(["https://127.0.0.1:47930"]);
    mock.simulate.off();
    const off = await mock.getOverview();
    expect(off.mobile).toMatchObject({ enabled: false, urls: [], port: null });
    expect(off.phones).toHaveLength(1);
  });

  it("nothing secret is in the page: no ticket, token, PIN or key", async () => {
    const { mock } = setup();
    const text = JSON.stringify(await mock.getOverview());
    expect(text).not.toMatch(/ticket|"token"|"pin"\s*:|privateKey/i);
  });
});
