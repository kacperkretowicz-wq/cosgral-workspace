import { describe, expect, it } from "vitest";
import {
  parseConnectRemoteDesktop,
  parseEnableRemoteDesktop,
  parseRemoteDesktopInput,
  parseRemoteDesktopPeer,
  parseSetRemoteDesktopPeerPolicy,
  parseSetRemoteDesktopSessionMode,
  parseStopRemoteDesktop,
} from "./remote-desktop-inputs";

describe("remote desktop inputs", () => {
  it("accepts valid requests", () => {
    expect(parseEnableRemoteDesktop(null)).toEqual({});
    expect(parseEnableRemoteDesktop({ exposure: "lan", port: 0, approvalBotId: null })).toEqual({
      exposure: "lan",
      port: 0,
      approvalBotId: null,
    });
    expect(parseSetRemoteDesktopPeerPolicy({ peerId: "p", policy: "allow" })).toEqual({ peerId: "p", policy: "allow" });
    expect(parseRemoteDesktopPeer({ peerId: "p" })).toEqual({ peerId: "p" });
    expect(parseSetRemoteDesktopSessionMode({ sessionId: "s", mode: "view" })).toEqual({
      sessionId: "s",
      mode: "view",
    });
    expect(parseStopRemoteDesktop(undefined)).toEqual({});
    expect(parseStopRemoteDesktop({ sessionId: "s" })).toEqual({ sessionId: "s" });
    expect(parseConnectRemoteDesktop({ address: "localhost:1", token: "t", mode: "control", label: "L" })).toEqual({
      address: "localhost:1",
      token: "t",
      mode: "control",
      label: "L",
    });
    expect(parseRemoteDesktopInput({ type: "text", text: "hi" })).toEqual({ type: "text", text: "hi" });
  });

  it("refuses unknown fields and wrong values", () => {
    expect(() => parseEnableRemoteDesktop({ exposure: "internet" })).toThrow("exposure must be one of");
    expect(() => parseEnableRemoteDesktop({ port: 70_000 })).toThrow("port must be");
    expect(() => parseEnableRemoteDesktop({ port: 1.5 })).toThrow("port must be");
    expect(() => parseEnableRemoteDesktop({ token: "x" })).toThrow('Unknown field "token"');
    expect(() => parseSetRemoteDesktopPeerPolicy({ peerId: "p", policy: "always" })).toThrow("policy must be");
    expect(() => parseSetRemoteDesktopSessionMode({ sessionId: "s", mode: "admin" })).toThrow("mode must be");
    expect(() => parseStopRemoteDesktop({ all: true })).toThrow('Unknown field "all"');
    expect(() => parseConnectRemoteDesktop({ address: "", token: "t", mode: "view" })).toThrow("address is required");
    expect(() => parseConnectRemoteDesktop({ address: "a:1", token: "x".repeat(300), mode: "view" })).toThrow(
      "too long",
    );
    expect(() => parseConnectRemoteDesktop({ address: "a:1", token: "t", mode: "view", label: 5 })).toThrow("label");
    expect(() => parseRemoteDesktopInput({ type: "drag", x: 0, y: 0 })).toThrow("not a valid input");
    expect(() => parseRemoteDesktopPeer(null)).toThrow("details are required");
  });
});
