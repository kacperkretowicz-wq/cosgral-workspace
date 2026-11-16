// @vitest-environment node
import {
  type AgentEvent,
  isAgentEvent,
  isPhoneAccessState,
  isPhonePushTestResult,
  isPhoneTailscaleGuide,
} from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockPhone } from "./mock-phone";

const setup = () => {
  const events: AgentEvent[] = [];
  return { api: createMockPhone((event) => events.push(event)), events };
};

describe("mock phone access (W9-BE1)", () => {
  it("starts valid, with push off and no Tailscale address", async () => {
    const { api } = setup();
    const state = await api.getState();
    expect(isPhoneAccessState(state)).toBe(true);
    expect(state.push).toMatchObject({ enabled: false, unavailableReason: null });
    expect(state.reach).toBe("local-network");
    expect(state.tailscaleUrls).toEqual([]);
    expect(isPhoneTailscaleGuide(await api.getTailscaleGuide())).toBe(true);
  });

  it("a Tailscale address among the URLs makes the reach 'tailscale'", async () => {
    const { api, events } = setup();
    api.simulate.setReach({
      enabled: true,
      exposure: "lan",
      urls: ["https://192.168.1.20:47930", "https://100.101.102.103:47930"],
    });
    const state = await api.getState();
    expect(state.reach).toBe("tailscale");
    expect(state.tailscaleUrls).toEqual(["https://100.101.102.103:47930"]);
    expect(events.every(isAgentEvent)).toBe(true);
    expect(events.at(-1)?.type).toBe("phone-access-changed");
  });

  it("push says why nothing is sent until a phone allowed notifications; a test says the same", async () => {
    const { api } = setup();
    const on = await api.setPushEnabled({ enabled: true });
    expect(on.push.unavailableReason).toMatch(/No phone has allowed/);
    const refused = await api.sendTestPush({ deviceId: "phone-1" });
    expect(isPhonePushTestResult(refused)).toBe(true);
    expect(refused).toEqual({ sent: false, reason: "This phone has not allowed notifications yet." });
    api.simulate.allowNotifications("phone-1");
    expect((await api.getState()).push.unavailableReason).toBeNull();
    expect(await api.sendTestPush({ deviceId: "phone-1" })).toEqual({ sent: true, reason: null });
    expect((await api.getState()).devices[0]?.lastPushAt).not.toBeNull();
  });

  it("a test is refused while push is off, and for a phone that is not paired", async () => {
    const { api } = setup();
    api.simulate.allowNotifications("phone-1");
    expect((await api.sendTestPush({ deviceId: "phone-1" })).reason).toMatch(/off on this computer/);
    expect((await api.sendTestPush({ deviceId: "nope" })).reason).toMatch(/not paired/);
  });

  it("refuses malformed requests", async () => {
    const { api } = setup();
    await expect(api.setPushEnabled(JSON.parse('{"enabled":"yes"}'))).rejects.toThrow(/true or false/);
    await expect(api.sendTestPush({ deviceId: "" })).rejects.toThrow(/not named/);
  });

  it("the state never carries a PIN or a private key", async () => {
    const { api } = setup();
    api.simulate.setPin("phone-1");
    const text = JSON.stringify(await api.getState());
    expect(text).toMatch(/"pinSet":true/);
    expect(text).not.toMatch(/privateKey|"pin":|secret/i);
  });
});
