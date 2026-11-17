// @vitest-environment node
import {
  type AgentEvent,
  isRemoteDesktopHostState,
  REMOTE_DESKTOP_UNATTENDED,
  remoteDesktopSummary,
} from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockRemoteDesktop } from "./mock-remote-desktop";

const setup = () => {
  const events: AgentEvent[] = [];
  return { mock: createMockRemoteDesktop((event) => events.push(event)), events };
};

describe("remote desktop header card (W12-KK)", () => {
  it("the summary says unavailable (with the reason), off, or ready; with sessions, the card limit and 'unattended: not available'", async () => {
    const { mock } = setup();
    expect(remoteDesktopSummary(await mock.host.getState())).toMatchObject({
      badge: "off",
      activeSessions: 0,
      maxSessions: 1,
      answerSeconds: 60,
      pendingCards: 0,
    });
    mock.simulate.unavailable("Remote desktop works on Windows in this version.");
    expect(remoteDesktopSummary(await mock.host.getState())).toMatchObject({
      badge: "unavailable",
      unavailableReason: "Remote desktop works on Windows in this version.",
    });
    mock.simulate.unavailable(null);
    await mock.host.enable();
    mock.simulate.viewerConnects({ peerId: "v1", label: "Laptop" });
    const waiting = remoteDesktopSummary(await mock.host.getState());
    expect(waiting).toMatchObject({ badge: "ready", pendingCards: 1, activeSessions: 0 });
    expect(waiting.unattended).toEqual(REMOTE_DESKTOP_UNATTENDED);
    expect(waiting.unattended.available).toBe(false);
    expect(waiting.unattended.reason).toMatch(/waits for you to answer/);
    mock.simulate.ownerAnswers("send");
    expect(remoteDesktopSummary(await mock.host.getState())).toMatchObject({ activeSessions: 1, pendingCards: 0 });
  });
});

describe("mock remote desktop (W12-KK)", () => {
  it("the token appears once and never in a state or an event", async () => {
    const { mock, events } = setup();
    const { token, state } = await mock.host.enable({ exposure: "lan" });
    expect(isRemoteDesktopHostState(state)).toBe(true);
    expect(state.listening).toMatchObject({ exposure: "lan" });
    expect(JSON.stringify([await mock.host.getState(), events])).not.toContain(token);
    const again = await mock.host.regenerateToken();
    expect(again.token).not.toBe(token);
    await expect(mock.host.disable().then(() => mock.host.regenerateToken())).rejects.toThrow(/off/);
  });

  it("a new viewer waits for the card; allowed ones skip it unless 'ask on this computer' is on; blocked ones never ask; one at a time", async () => {
    const { mock } = setup();
    await mock.host.enable();
    expect(mock.simulate.viewerConnects({ peerId: "v1", label: "Laptop" })).toBe("waiting");
    expect(mock.simulate.viewerConnects({ peerId: "v2", label: "Other" })).toBe("busy");
    mock.simulate.ownerAnswers("decline");
    expect((await mock.host.getState()).sessions).toEqual([]);
    mock.simulate.viewerConnects({ peerId: "v1", label: "Laptop" });
    mock.simulate.ownerAnswers("send");
    expect((await mock.host.getState()).sessions).toHaveLength(1);
    await mock.host.setPeerPolicy({ peerId: "v1", policy: "allow" });
    await mock.host.stop();
    expect(mock.simulate.viewerConnects({ peerId: "v1", label: "Laptop" })).toBe("connected");
    await mock.host.stop();
    const asked = await mock.host.setAskEverySession({ enabled: true });
    expect(asked.askEverySession).toBe(true);
    expect(mock.simulate.viewerConnects({ peerId: "v1", label: "Laptop" })).toBe("waiting");
    mock.simulate.ownerAnswers("decline");
    await mock.host.setAskEverySession({ enabled: false });
    await mock.host.setPeerPolicy({ peerId: "v1", policy: "block" });
    expect(mock.simulate.viewerConnects({ peerId: "v1", label: "Laptop" })).toBe("blocked");
    await expect(mock.host.setPeerPolicy({ peerId: "nope", policy: "allow" })).rejects.toThrow(/not on the list/);
  });

  it("control goes down to view at once and never back; stop ends the session; removing a viewer ends its session too", async () => {
    const { mock } = setup();
    await mock.host.enable();
    mock.simulate.viewerConnects({ peerId: "v1", label: "Laptop", mode: "control" });
    mock.simulate.ownerAnswers("send");
    const session = (await mock.host.getState()).sessions[0];
    if (!session) throw new Error("no session");
    expect((await mock.host.setSessionMode({ sessionId: session.id, mode: "view" })).sessions[0]?.mode).toBe("view");
    await expect(mock.host.setSessionMode({ sessionId: session.id, mode: "control" })).rejects.toThrow(/ask again/);
    expect((await mock.host.removePeer({ peerId: "v1" })).sessions).toEqual([]);
    expect(mock.simulate.viewerConnects({ peerId: "v1", label: "Laptop" })).toBe("waiting");
    mock.simulate.ownerAnswers("send");
    expect((await mock.host.stop()).sessions).toEqual([]);
  });

  it("a host that is off refuses viewers and one that cannot host refuses to start, with its reason", async () => {
    const { mock } = setup();
    expect(mock.simulate.viewerConnects({ peerId: "v1", label: "Laptop" })).toBe("off");
    mock.simulate.unavailable("This computer cannot be controlled: the Windows driver is missing.");
    await expect(mock.host.enable()).rejects.toThrow(/driver is missing/);
  });

  it("the client: a wrong token fails with a fixed sentence; a good one connects and may control only in control mode; pictures reach listeners", async () => {
    const { mock } = setup();
    const failed = await mock.client.connect({ address: "127.0.0.1:47123", token: "bad", mode: "view" });
    expect(failed).toMatchObject({ phase: "failed", error: "The token is wrong." });
    const view = await mock.client.connect({
      address: "127.0.0.1:47123",
      token: "demo-token-0001-abcdefghijklmnop",
      mode: "view",
    });
    expect(view).toMatchObject({ phase: "connected", mode: "view", screen: { width: 1280, height: 720 } });
    await expect(mock.client.sendInput({ type: "text", text: "hello" })).rejects.toThrow(/only looks/);
    await mock.client.connect({
      address: "127.0.0.1:47123",
      token: "demo-token-0001-abcdefghijklmnop",
      mode: "control",
    });
    await expect(mock.client.sendInput({ type: "text", text: "hello" })).resolves.toBeUndefined();
    const seen: number[] = [];
    const stop = mock.onFrame((frame) => seen.push(frame.seq));
    mock.simulate.frame();
    stop();
    mock.simulate.frame();
    expect(seen).toHaveLength(1);
    expect((await mock.client.disconnect()).phase).toBe("idle");
  });
});
