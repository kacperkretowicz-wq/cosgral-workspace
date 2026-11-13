// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  cleanLabel,
  clientProof,
  decodeFrame,
  encodeFrame,
  FRAME_HEADER_BYTES,
  hostProof,
  isClientId,
  newNonce,
  newToken,
  normalizeHostAddress,
  parseClientMessage,
  parseHostMessage,
  sameProof,
} from "./remote-desktop-protocol";

describe("remote desktop proofs", () => {
  it("makes long random tokens and nonces", () => {
    expect(newToken()).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(newToken()).not.toBe(newToken());
    expect(newNonce().length).toBeGreaterThanOrEqual(32);
  });

  it("proves the token without sending it, and binds nonce, id and mode", () => {
    const proof = clientProof("secret-token", "nonce-1", "client-0001", "control");
    expect(proof).not.toContain("secret-token");
    expect(sameProof(proof, clientProof("secret-token", "nonce-1", "client-0001", "control"))).toBe(true);
    expect(sameProof(proof, clientProof("other-token", "nonce-1", "client-0001", "control"))).toBe(false);
    expect(sameProof(proof, clientProof("secret-token", "nonce-2", "client-0001", "control"))).toBe(false);
    expect(sameProof(proof, clientProof("secret-token", "nonce-1", "client-0002", "control"))).toBe(false);
    // A viewer cannot ask for "view" and be let in as "control" with the same proof.
    expect(sameProof(proof, clientProof("secret-token", "nonce-1", "client-0001", "view"))).toBe(false);
  });

  it("gives the host a different proof than the viewer", () => {
    expect(hostProof("t", "n", "client-0001", "view")).not.toBe(clientProof("t", "n", "client-0001", "view"));
  });

  it("refuses a proof that is not text or has another length", () => {
    expect(sameProof("abc", 5)).toBe(false);
    expect(sameProof("abc", "abcd")).toBe(false);
    expect(sameProof("abc", "")).toBe(false);
  });
});

describe("remote desktop messages", () => {
  const auth = { type: "auth", clientId: "client-0001", label: "Laptop", mode: "view", proof: "p" };

  it("accepts the messages a host expects from a viewer", () => {
    expect(parseClientMessage(JSON.stringify(auth))).toEqual(auth);
    expect(parseClientMessage('{"type":"bye"}')).toEqual({ type: "bye" });
    const input = { type: "click", x: 0.1, y: 0.2, button: "left", count: 1 };
    expect(parseClientMessage(JSON.stringify({ type: "input", input }))).toEqual({ type: "input", input });
  });

  it("refuses everything else from a viewer", () => {
    expect(parseClientMessage("not json")).toBeNull();
    expect(parseClientMessage("[]")).toBeNull();
    expect(parseClientMessage('{"type":"hello"}')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...auth, clientId: "x" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...auth, mode: "admin" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "input", input: { type: "click", x: 5, y: 0 } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "input", input: { type: "drag", x: 0, y: 0 } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...auth, label: "x".repeat(5000) }))).toBeNull();
  });

  it("cleans the label of a viewer", () => {
    expect(parseClientMessage(JSON.stringify({ ...auth, label: "  Ann\u0000's\nPC " }))).toMatchObject({
      label: "Ann 's PC",
    });
    expect(cleanLabel("", "Unknown computer")).toBe("Unknown computer");
    expect(cleanLabel(42, "Unknown computer")).toBe("Unknown computer");
    expect(cleanLabel("y".repeat(200), "x")).toHaveLength(60);
  });

  it("accepts the messages a viewer expects from a host", () => {
    expect(parseHostMessage('{"type":"hello","version":1,"nonce":"abc"}')).toEqual({
      type: "hello",
      version: 1,
      nonce: "abc",
    });
    expect(parseHostMessage('{"type":"waiting"}')).toEqual({ type: "waiting" });
    expect(parseHostMessage('{"type":"denied","reason":"busy"}')).toEqual({ type: "denied", reason: "busy" });
    expect(parseHostMessage('{"type":"ended","reason":"stopped"}')).toEqual({ type: "ended", reason: "stopped" });
    expect(parseHostMessage('{"type":"paused","reason":null}')).toEqual({ type: "paused", reason: null });
    expect(parseHostMessage('{"type":"mode","mode":"view"}')).toEqual({ type: "mode", mode: "view" });
    expect(parseHostMessage('{"type":"accepted","sessionId":"s","mode":"control","hostProof":"h"}')).toMatchObject({
      type: "accepted",
      sessionId: "s",
    });
  });

  it("refuses broken host messages", () => {
    expect(parseHostMessage('{"type":"denied","reason":"because"}')).toBeNull();
    expect(parseHostMessage('{"type":"accepted","sessionId":"s"}')).toBeNull();
    expect(parseHostMessage('{"type":"auth"}')).toBeNull();
    expect(parseHostMessage("x".repeat(5000))).toBeNull();
  });

  it("checks ids", () => {
    expect(isClientId("client-0001")).toBe(true);
    expect(isClientId("short")).toBe(false);
    expect(isClientId("has space in it")).toBe(false);
    expect(isClientId(12345678)).toBe(false);
  });
});

describe("remote desktop frames", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

  it("round trips a picture", () => {
    const wire = encodeFrame(7, 1280, 720, jpeg);
    expect(wire.length).toBe(FRAME_HEADER_BYTES + jpeg.length);
    expect(decodeFrame(wire)).toEqual({ seq: 7, width: 1280, height: 720, jpeg });
  });

  it("refuses short, huge, empty-size and non-JPEG data", () => {
    expect(decodeFrame(Buffer.alloc(4))).toBeNull();
    expect(decodeFrame(Buffer.alloc(FRAME_HEADER_BYTES))).toBeNull();
    expect(decodeFrame(encodeFrame(1, 10, 10, Buffer.from([1, 2, 3, 4])))).toBeNull();
    expect(decodeFrame(encodeFrame(1, 0, 10, jpeg))).toBeNull();
    expect(decodeFrame(encodeFrame(1, 10, 10, Buffer.concat([jpeg, Buffer.alloc(2_000_000)])))).toBeNull();
  });
});

describe("host addresses", () => {
  it("builds the WebSocket address", () => {
    expect(normalizeHostAddress("localhost:47123")).toBe("ws://localhost:47123/remote-desktop");
    expect(normalizeHostAddress(" 192.168.1.20:47123 ")).toBe("ws://192.168.1.20:47123/remote-desktop");
    expect(normalizeHostAddress("ws://127.0.0.1:5000/other?x=1#y")).toBe("ws://127.0.0.1:5000/remote-desktop");
    expect(normalizeHostAddress("wss://pc.example.net:443")).toBe("wss://pc.example.net/remote-desktop");
  });

  it("explains what is wrong", () => {
    expect(() => normalizeHostAddress("")).toThrow("Enter the address");
    expect(() => normalizeHostAddress("http://localhost:1")).toThrow("Only ws://");
    expect(() => normalizeHostAddress("localhost")).toThrow("Add the port");
    expect(() => normalizeHostAddress("ws://user:pw@host:1")).toThrow("user name");
    expect(() => normalizeHostAddress("ws://:::")).toThrow();
  });
});
