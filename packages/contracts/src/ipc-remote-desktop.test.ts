import { describe, expect, it } from "vitest";
import { isAgentEvent } from "./ipc-conversation";
import {
  emptyRemoteDesktopClientState,
  emptyRemoteDesktopHostState,
  isRemoteDesktopClientState,
  isRemoteDesktopFrame,
  isRemoteDesktopHostState,
  isRemoteDesktopInput,
  isRemoteDesktopTokenResult,
  REMOTE_DESKTOP_LIMITS,
} from "./ipc-remote-desktop";

const host = {
  ...emptyRemoteDesktopHostState(),
  available: true,
  enabled: true,
  listening: { port: 47123, exposure: "loopback" as const, urls: ["ws://127.0.0.1:47123"] },
  tokenCreatedAt: "2026-11-13T12:00:00.000Z",
  peers: [{ id: "p1", label: "Laptop", policy: "ask" as const, addedAt: "2026-11-13T12:01:00.000Z", lastSeenAt: null }],
  sessions: [
    {
      id: "s1",
      peerId: "p1",
      label: "Laptop",
      remoteAddress: "127.0.0.1",
      mode: "control" as const,
      startedAt: "2026-11-13T12:02:00.000Z",
      framesSent: 3,
      lastInputAt: null,
      paused: null,
    },
  ],
};

describe("remote desktop contract", () => {
  it("has one viewer at a time and a limit for every message", () => {
    expect(REMOTE_DESKTOP_LIMITS.maxSessions).toBe(1);
    expect(REMOTE_DESKTOP_LIMITS.maxMessageBytes).toBeGreaterThan(REMOTE_DESKTOP_LIMITS.typeTextLength);
    expect(REMOTE_DESKTOP_LIMITS.pongTimeoutMs).toBeGreaterThan(REMOTE_DESKTOP_LIMITS.pingIntervalMs);
  });

  it("accepts real host and client states and refuses broken ones", () => {
    expect(isRemoteDesktopHostState(host)).toBe(true);
    expect(isRemoteDesktopHostState(emptyRemoteDesktopHostState())).toBe(true);
    expect(isRemoteDesktopHostState({ ...host, listening: { port: "x" } })).toBe(false);
    expect(isRemoteDesktopHostState({ ...host, peers: [{ id: "p" }] })).toBe(false);
    expect(isRemoteDesktopHostState({ ...host, sessions: [{ ...host.sessions[0], mode: "admin" }] })).toBe(false);
    expect(isRemoteDesktopClientState(emptyRemoteDesktopClientState("c1"))).toBe(true);
    expect(isRemoteDesktopClientState({ ...emptyRemoteDesktopClientState("c1"), phase: "done" })).toBe(false);
    expect(
      isRemoteDesktopClientState({
        ...emptyRemoteDesktopClientState("c1"),
        phase: "connected",
        mode: "view",
        screen: { width: 1280, height: 720 },
      }),
    ).toBe(true);
    expect(isRemoteDesktopTokenResult({ state: host, token: "abc" })).toBe(true);
    expect(isRemoteDesktopTokenResult({ state: host })).toBe(false);
    expect(isRemoteDesktopFrame({ seq: 1, width: 10, height: 10, jpegBase64: "AAAA" })).toBe(true);
    expect(isRemoteDesktopFrame({ seq: 1, width: 10 })).toBe(false);
  });

  it("checks every input the host would act on", () => {
    const click = { type: "click", x: 0.5, y: 0.25, button: "left", count: 1 };
    expect(isRemoteDesktopInput(click)).toBe(true);
    expect(isRemoteDesktopInput({ ...click, count: 3 })).toBe(false);
    expect(isRemoteDesktopInput({ ...click, button: "back" })).toBe(false);
    expect(isRemoteDesktopInput({ ...click, x: 1.2 })).toBe(false);
    expect(isRemoteDesktopInput({ ...click, y: Number.NaN })).toBe(false);
    expect(isRemoteDesktopInput({ type: "scroll", x: 0, y: 1, deltaX: 0, deltaY: -3 })).toBe(true);
    expect(isRemoteDesktopInput({ type: "scroll", x: 0, y: 1, deltaX: 0, deltaY: 99 })).toBe(false);
    expect(isRemoteDesktopInput({ type: "scroll", x: 0, y: 1, deltaX: 0, deltaY: 1.5 })).toBe(false);
    expect(isRemoteDesktopInput({ type: "text", text: "hello" })).toBe(true);
    expect(isRemoteDesktopInput({ type: "text", text: "" })).toBe(false);
    expect(isRemoteDesktopInput({ type: "text", text: "x".repeat(REMOTE_DESKTOP_LIMITS.typeTextLength + 1) })).toBe(
      false,
    );
    expect(isRemoteDesktopInput({ type: "keys", keys: "ctrl+s" })).toBe(true);
    expect(isRemoteDesktopInput({ type: "keys", keys: "" })).toBe(false);
    expect(isRemoteDesktopInput({ type: "drag", x: 0, y: 0 })).toBe(false);
    expect(isRemoteDesktopInput(null)).toBe(false);
    expect(isRemoteDesktopInput("click")).toBe(false);
  });

  it("carries host and client changes as agent events", () => {
    expect(isAgentEvent({ type: "remote-desktop-host-changed", state: host })).toBe(true);
    expect(isAgentEvent({ type: "remote-desktop-host-changed", state: { enabled: true } })).toBe(false);
    expect(isAgentEvent({ type: "remote-desktop-client-changed", state: emptyRemoteDesktopClientState("c1") })).toBe(
      true,
    );
    expect(isAgentEvent({ type: "remote-desktop-client-changed", state: null })).toBe(false);
  });
});
