// @vitest-environment node
// Host and client over a real WebSocket on loopback, with a pretend desktop (no real mouse, keyboard or screen).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  DraftPreviewResolution,
  RemoteDesktopClientState,
  RemoteDesktopFrame,
  RemoteDesktopHostState,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber } from "@openbot/contracts/runtime-values";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { type ClientIdentity, RemoteDesktopClient } from "./remote-desktop-client";
import { type ConsentRequest, type FrameSource, RemoteDesktopHost } from "./remote-desktop-host";
import { clientProof, hostProof, newNonce, normalizeHostAddress } from "./remote-desktop-protocol";
import { RemoteDesktopStore } from "./remote-desktop-store";
import { FakeComputerDriver, fakeWindow } from "./testing/fake-computer-driver";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 0xff, 0xd9]);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function portOf(server: WebSocketServer): number {
  const address = server.address();
  if (!isDynamicRecord(address) || !isNumber(address.port)) throw new Error("The test server has no port.");
  return address.port;
}

async function until(predicate: () => boolean, what: string, timeoutMs = 4000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > end) throw new Error(`Timed out waiting for: ${what}`);
    await wait(10);
  }
}

describe("remote desktop host and client", () => {
  let dir: string;
  let driver: FakeComputerDriver | null;
  let host: RemoteDesktopHost;
  let hostStates: RemoteDesktopHostState[];
  let consents: ConsentRequest[];
  let answerNext: (decision: DraftPreviewResolution) => void;
  let autoAnswer: DraftPreviewResolution | "hold";
  let unavailable: string | null;
  let protectedIds: number[];
  const clients: RemoteDesktopClient[] = [];
  const raw: WebSocket[] = [];
  const frames: RemoteDesktopFrame[] = [];
  const clientStates: RemoteDesktopClientState[] = [];

  const frameSource: FrameSource = {
    capture: async () => ({ jpeg: JPEG, width: 1280, height: 720, area: { x: 0, y: 0, width: 3200, height: 1800 } }),
  };

  function makeClient(id = "client-aaaa-0001", label = "Laptop", timings = {}) {
    const identity: ClientIdentity = { clientId: id, label };
    const client = new RemoteDesktopClient({
      identity,
      emit: (state) => clientStates.push(state),
      onFrame: (frame) => frames.push(frame),
      timings: { checkIntervalMs: 20, ...timings },
    });
    clients.push(client);
    return client;
  }

  async function startHost(timings = {}) {
    host = new RemoteDesktopHost({
      store: new RemoteDesktopStore({
        filePath: join(dir, "remote-desktop.json"),
        secretBox: {
          canEncrypt: () => true,
          encrypt: (plain) => `box:${Buffer.from(plain).toString("base64")}`,
          decrypt: (cipher) => Buffer.from(cipher.slice(4), "base64").toString(),
        },
      }),
      driver: () => driver,
      frames: frameSource,
      confirm: (_botId, request) => {
        consents.push(request);
        if (autoAnswer !== "hold") return Promise.resolve(autoAnswer);
        return new Promise((resolve) => {
          answerNext = resolve;
        });
      },
      canAsk: () => true,
      unavailableReason: () => unavailable,
      emit: (state) => hostStates.push(state),
      protectedProcessIds: () => protectedIds,
      timings: {
        frameIntervalMs: 20,
        pingIntervalMs: 60,
        pongTimeoutMs: 400,
        consentTimeoutMs: 400,
        lockMs: 300,
        ...timings,
      },
    });
    const result = await host.enable({ port: 0 });
    const url = result.state.listening?.urls[0] ?? "";
    return { token: result.token, url, state: result.state };
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "remote-desktop-it-"));
    driver = new FakeComputerDriver([
      fakeWindow({ handle: "1", title: "Notes", bounds: { x: 0, y: 0, width: 1600, height: 1800 }, foreground: true }),
      fakeWindow({
        handle: "2",
        title: "Admin tool",
        processId: 7000,
        elevated: true,
        bounds: { x: 1600, y: 0, width: 800, height: 900 },
      }),
      fakeWindow({
        handle: "3",
        title: "COSGRAL Workspace",
        processId: 999,
        processName: "COSGRAL Workspace",
        bounds: { x: 2400, y: 0, width: 800, height: 900 },
      }),
    ]);
    hostStates = [];
    consents = [];
    autoAnswer = "send";
    unavailable = null;
    protectedIds = [999];
    frames.length = 0;
    clientStates.length = 0;
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.disconnect();
    for (const socket of raw.splice(0)) socket.terminate();
    await host?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("listens on loopback, names its addresses and returns the token once", async () => {
    const { token, state, url } = await startHost();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(state).toMatchObject({ enabled: true, available: true, listening: { exposure: "loopback" } });
    expect(url).toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/);
    expect(JSON.stringify(host.getState())).not.toContain(token);
    expect((await host.disable()).enabled).toBe(false);
  });

  it("refuses to start when this computer cannot host", async () => {
    unavailable = "Remote desktop works on Windows only.";
    await expect(startHost()).rejects.toThrow("Windows only");
  });

  it("lets a viewer in only after the owner says yes on a consent card, and streams pictures", async () => {
    const { token, url } = await startHost();
    autoAnswer = "hold";
    const client = makeClient();
    const connecting = client.connect({ address: url, token, mode: "control" });
    await until(() => consents.length === 1, "the consent card");
    expect(consents[0]).toMatchObject({ recipient: "Laptop", channel: "remote desktop" });
    expect(consents[0]?.title).toContain("control this computer");
    expect(consents[0]?.preview).toContain("COSGRAL Workspace itself");
    await until(() => client.getState().phase === "waiting-for-owner", "waiting phase");
    expect(host.getState().consentPending).toBe(1);
    expect(host.getState().sessions).toEqual([]);
    expect(frames).toHaveLength(0);
    answerNext("send");
    const state = await connecting;
    expect(state).toMatchObject({ phase: "connected", mode: "control", error: null });
    await until(() => frames.length >= 3, "pictures");
    expect(frames[0]).toMatchObject({ width: 1280, height: 720 });
    expect(frames[1]?.seq).toBeGreaterThan(frames[0]?.seq ?? 0);
    expect(Buffer.from(frames[0]?.jpegBase64 ?? "", "base64")).toEqual(JPEG);
    expect(client.getState().screen).toEqual({ width: 1280, height: 720 });
    const hostState = host.getState();
    expect(hostState.sessions).toHaveLength(1);
    expect(hostState.sessions[0]).toMatchObject({ label: "Laptop", mode: "control", remoteAddress: "127.0.0.1" });
    expect(hostState.peers[0]).toMatchObject({ id: "client-aaaa-0001", policy: "ask" });
    expect(hostState.consentPending).toBe(0);
  });

  it("turns away a wrong token, never sends a picture, and locks the address after repeated failures", async () => {
    const { url } = await startHost();
    const client = makeClient();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const state = await client.connect({ address: url, token: "wrong-token", mode: "view" });
      expect(state).toMatchObject({ phase: "failed", error: "The token is wrong." });
    }
    expect(consents).toHaveLength(0);
    expect(frames).toHaveLength(0);
    const locked = await client.connect({ address: url, token: "wrong-token", mode: "view" });
    expect(locked.error).toContain("Too many wrong tokens");
    expect(host.getState().lockedUntil).not.toBeNull();
    // After the lock a good token works again.
    await wait(350);
    expect(host.getState().lockedUntil).toBeNull();
  });

  it("does not let a locked-out address in even with the right token", async () => {
    const { token, url } = await startHost();
    const client = makeClient();
    for (let attempt = 0; attempt < 5; attempt += 1) await client.connect({ address: url, token: "x", mode: "view" });
    const state = await client.connect({ address: url, token, mode: "view" });
    expect(state.phase).toBe("failed");
    expect(consents).toHaveLength(0);
  });

  it("tells the viewer when the owner declines or does not answer", async () => {
    const { token, url } = await startHost();
    const client = makeClient();
    autoAnswer = "keep-draft";
    expect(await client.connect({ address: url, token, mode: "view" })).toMatchObject({
      phase: "failed",
      error: "The owner of that computer said no.",
    });
    autoAnswer = "hold";
    const state = await client.connect({ address: url, token, mode: "view" });
    expect(state).toMatchObject({ phase: "failed", error: "The owner of that computer did not answer in time." });
    expect(host.getState().sessions).toEqual([]);
    expect(host.getState().consentPending).toBe(0);
  });

  it("ignores a late answer after the viewer gave up", async () => {
    const { token, url } = await startHost();
    autoAnswer = "hold";
    const client = makeClient();
    await client.connect({ address: url, token, mode: "control" });
    answerNext("send");
    await wait(60);
    expect(host.getState().sessions).toEqual([]);
  });

  it("lets a remembered viewer in without a card, and refuses a blocked one without asking", async () => {
    const { token, url } = await startHost();
    const client = makeClient();
    await client.connect({ address: url, token, mode: "view" });
    host.setPeerPolicy("client-aaaa-0001", "allow");
    client.disconnect();
    await until(() => host.getState().sessions.length === 0, "session closed");
    consents.length = 0;
    expect(await client.connect({ address: url, token, mode: "view" })).toMatchObject({ phase: "connected" });
    expect(consents).toHaveLength(0);
    host.setPeerPolicy("client-aaaa-0001", "block");
    await until(() => client.getState().phase !== "connected", "blocked session ended");
    expect(host.getState().sessions).toEqual([]);
    expect(await client.connect({ address: url, token, mode: "view" })).toMatchObject({
      phase: "failed",
      error: "The owner of that computer blocked this computer.",
    });
    expect(consents).toHaveLength(0);
  });

  it("allows one viewer at a time", async () => {
    const { token, url } = await startHost();
    const first = makeClient("client-aaaa-0001", "First");
    const second = makeClient("client-bbbb-0002", "Second");
    await first.connect({ address: url, token, mode: "view" });
    const state = await second.connect({ address: url, token, mode: "view" });
    expect(state.phase).toBe("failed");
    expect(state.error).toContain("Someone else is connected");
    expect(host.getState().sessions).toHaveLength(1);
  });

  it("carries out clicks, scrolls, text and keys, mapping the picture position to the screen", async () => {
    const { token, url } = await startHost();
    const client = makeClient();
    await client.connect({ address: url, token, mode: "control" });
    await until(() => frames.length > 0, "first picture");
    client.sendInput({ type: "click", x: 0.5, y: 0.5, button: "left", count: 1 });
    client.sendInput({ type: "click", x: 0, y: 0, button: "right", count: 2 });
    client.sendInput({ type: "scroll", x: 0.25, y: 0.25, deltaX: 0, deltaY: -3 });
    client.sendInput({ type: "text", text: "Hello from far away, 40 chars long!!" });
    client.sendInput({ type: "keys", keys: "Ctrl+S" });
    await until(() => driver?.steps.some((step) => step.kind === "keys") === true, "all inputs");
    const steps = driver?.steps.filter((step) => step.kind !== "screenshot") ?? [];
    expect(steps[0]).toEqual({ kind: "click", x: 1600, y: 900, button: "left", count: 1 });
    expect(steps[1]).toEqual({ kind: "click", x: 0, y: 0, button: "right", count: 2 });
    expect(steps[2]).toMatchObject({ kind: "scroll", x: 800, y: 450, deltaY: -3 });
    expect(driver?.typed()).toBe("Hello from far away, 40 chars long!!");
    expect(driver?.steps.filter((step) => step.kind === "type").length).toBeGreaterThan(1);
    expect(steps.at(-1)).toEqual({ kind: "keys", keys: ["ctrl", "s"] });
    expect(host.getState().sessions[0]?.lastInputAt).not.toBeNull();
  });

  it("never touches COSGRAL Workspace itself, administrator windows, or blocked key combinations", async () => {
    const { token, url } = await startHost();
    const client = makeClient();
    await client.connect({ address: url, token, mode: "control" });
    await until(() => frames.length > 0, "first picture");
    // x = 0.6 lands on the administrator window, x = 0.9 on COSGRAL Workspace itself (see the pretend desktop).
    client.sendInput({ type: "click", x: 0.6, y: 0.1, button: "left", count: 1 });
    client.sendInput({ type: "click", x: 0.9, y: 0.1, button: "left", count: 1 });
    client.sendInput({ type: "keys", keys: "win+l" });
    client.sendInput({ type: "keys", keys: "ctrl+alt+delete" });
    client.sendInput({ type: "keys", keys: "nonsense" });
    client.sendInput({ type: "click", x: 0.1, y: 0.1, button: "left", count: 1 });
    await until(() => driver?.steps.some((step) => step.kind === "click") === true, "the allowed click");
    expect(driver?.steps.filter((step) => step.kind === "click")).toHaveLength(1);
    expect(driver?.steps.filter((step) => step.kind === "keys")).toHaveLength(0);
    // A refused input never ends the session.
    expect(client.getState().phase).toBe("connected");
  });

  it("types nothing while the foreground window is COSGRAL Workspace or an administrator window", async () => {
    const { token, url } = await startHost();
    const client = makeClient();
    await client.connect({ address: url, token, mode: "control" });
    for (const window of driver?.windows ?? []) window.foreground = window.handle === "3";
    client.sendInput({ type: "text", text: "secret" });
    client.sendInput({ type: "keys", keys: "enter" });
    await wait(150);
    expect(driver?.steps.filter((step) => step.kind === "type" || step.kind === "keys")).toHaveLength(0);
    for (const window of driver?.windows ?? []) window.foreground = window.handle === "2";
    client.sendInput({ type: "text", text: "secret" });
    await wait(150);
    expect(driver?.typed()).toBe("");
  });

  it("pauses the picture and ignores input while the screen is locked or a UAC prompt is open", async () => {
    const { token, url } = await startHost();
    const client = makeClient();
    await client.connect({ address: url, token, mode: "control" });
    await until(() => frames.length > 0, "first picture");
    if (driver) driver.locked = true;
    await until(() => host.getState().sessions[0]?.paused === "locked", "paused state");
    await wait(80);
    const seen = frames.length;
    await wait(120);
    expect(frames.length).toBe(seen);
    client.sendInput({ type: "click", x: 0.1, y: 0.1, button: "left", count: 1 });
    await wait(100);
    expect(driver?.steps.filter((step) => step.kind === "click")).toHaveLength(0);
    if (driver) {
      driver.locked = false;
      driver.uacPrompt = true;
    }
    await until(() => host.getState().sessions[0]?.paused === "uac", "UAC pause");
    if (driver) driver.uacPrompt = false;
    await until(() => host.getState().sessions[0]?.paused === null, "resumed");
    await until(() => frames.length > seen, "pictures again");
  });

  it("refuses input in view mode on both sides", async () => {
    const { token, url } = await startHost();
    const client = makeClient();
    await client.connect({ address: url, token, mode: "view" });
    expect(() => client.sendInput({ type: "text", text: "x" })).toThrow("view only");
    // Even a hand-made message does nothing: the host checks the mode itself.
    const socket = new WebSocket(url.replace(/$/, "/remote-desktop"));
    raw.push(socket);
    const nonce = await new Promise<string>((resolve) => {
      socket.once("message", (data) => resolve(JSON.parse(data.toString()).nonce));
    });
    socket.send(
      JSON.stringify({
        type: "auth",
        clientId: "client-cccc-0003",
        label: "Hand made",
        mode: "view",
        proof: clientProof(token, nonce, "client-cccc-0003", "view"),
      }),
    );
    await wait(100);
    expect(driver?.steps.filter((step) => step.kind === "type")).toHaveLength(0);
  });

  it("takes control away at once when the owner switches the session to view, and refuses the way back", async () => {
    const { token, url } = await startHost();
    const client = makeClient();
    await client.connect({ address: url, token, mode: "control" });
    const sessionId = host.getState().sessions[0]?.id ?? "";
    host.setSessionMode(sessionId, "view");
    await until(() => client.getState().mode === "view", "viewer told");
    expect(() => client.sendInput({ type: "text", text: "x" })).toThrow("view only");
    expect(host.getState().sessions[0]?.mode).toBe("view");
    expect(() => host.setSessionMode(sessionId, "control")).toThrow("connect with control");
    expect(() => host.setSessionMode("other", "view")).toThrow("no longer connected");
  });

  it("Stop ends the session at once, even in the middle of typing, and the host is normal again", async () => {
    const { token, url } = await startHost();
    const client = makeClient();
    await client.connect({ address: url, token, mode: "control" });
    if (driver) driver.typingDelayMs = 30;
    client.sendInput({ type: "text", text: "x".repeat(400) });
    await until(() => (driver?.typed().length ?? 0) >= 32, "typing started");
    const cancelsBefore = driver?.cancels ?? 0;
    const state = host.stop();
    expect(state.sessions).toEqual([]);
    expect(driver?.cancels).toBeGreaterThan(cancelsBefore);
    await until(() => client.getState().phase === "idle", "viewer told");
    expect(client.getState().error).toBe("The owner of that computer stopped the session.");
    const typedAtStop = driver?.typed().length ?? 0;
    await wait(150);
    expect(typedAtStop).toBeLessThan(400);
    expect(driver?.typed().length).toBe(typedAtStop);
    // The host listens again for the next viewer.
    expect(host.getState().enabled).toBe(true);
    expect(await client.connect({ address: url, token, mode: "view" })).toMatchObject({ phase: "connected" });
  });

  it("Stop with an unknown session does nothing", async () => {
    const { token, url } = await startHost();
    const client = makeClient();
    await client.connect({ address: url, token, mode: "view" });
    host.stop("not-this-one");
    expect(host.getState().sessions).toHaveLength(1);
    host.stop(host.getState().sessions[0]?.id);
    expect(host.getState().sessions).toHaveLength(0);
  });

  it("a viewer that leaves does not hang the host", async () => {
    const { token, url } = await startHost();
    const client = makeClient();
    await client.connect({ address: url, token, mode: "control" });
    client.sendInput({ type: "click", x: 0.1, y: 0.1, button: "left", count: 1 });
    client.disconnect();
    await until(() => host.getState().sessions.length === 0, "session gone");
    expect(host.getState().enabled).toBe(true);
    expect(client.getState().phase).toBe("idle");
  });

  it("ends a session whose viewer stops answering pings", async () => {
    const { token, url } = await startHost();
    const socket = new WebSocket(`${url}/remote-desktop`, { autoPong: false });
    raw.push(socket);
    const nonce = await new Promise<string>((resolve) => {
      socket.once("message", (data) => resolve(JSON.parse(data.toString()).nonce));
    });
    socket.send(
      JSON.stringify({
        type: "auth",
        clientId: "client-dddd-0004",
        label: "Silent",
        mode: "view",
        proof: clientProof(token, nonce, "client-dddd-0004", "view"),
      }),
    );
    await until(() => host.getState().sessions.length === 1, "session");
    await until(() => host.getState().sessions.length === 0, "unresponsive session ended", 3000);
  });

  it("refuses a connection that comes from a web page (it has an Origin header)", async () => {
    const { url } = await startHost();
    const socket = new WebSocket(`${url}/remote-desktop`, { origin: "https://evil.example" });
    raw.push(socket);
    const message = await new Promise<string>((resolve) => socket.once("error", (error) => resolve(error.message)));
    expect(message).toContain("401");
  });

  it("refuses an address with the wrong path and ignores garbage and binary messages", async () => {
    const { url } = await startHost();
    const wrong = new WebSocket(`${url}/somewhere-else`);
    raw.push(wrong);
    await new Promise((resolve) => wrong.once("error", resolve));
    const socket = new WebSocket(`${url}/remote-desktop`);
    raw.push(socket);
    await new Promise((resolve) => socket.once("message", resolve));
    socket.send("not json at all");
    const closed = await new Promise<number>((resolve) => socket.once("close", (code) => resolve(code)));
    expect(closed).toBe(1000);
    const binary = new WebSocket(`${url}/remote-desktop`);
    raw.push(binary);
    await new Promise((resolve) => binary.once("message", resolve));
    binary.send(Buffer.from([1, 2, 3]));
    await new Promise((resolve) => binary.once("close", resolve));
    expect(host.getState().sessions).toEqual([]);
  });

  it("the viewer refuses a host that does not know the token", async () => {
    const fake = new WebSocketServer({ port: 0, host: "127.0.0.1", path: "/remote-desktop" });
    await new Promise((resolve) => fake.once("listening", resolve));
    const port = portOf(fake);
    fake.on("connection", (socket) => {
      const nonce = newNonce();
      socket.send(JSON.stringify({ type: "hello", version: 1, nonce }));
      socket.on("message", (data) => {
        const auth = JSON.parse(data.toString());
        socket.send(
          JSON.stringify({
            type: "accepted",
            sessionId: "s",
            mode: auth.mode,
            hostProof: hostProof("a-guessed-token", nonce, auth.clientId, auth.mode),
          }),
        );
      });
    });
    try {
      const client = makeClient();
      const state = await client.connect({ address: `127.0.0.1:${port}`, token: "the-real-token", mode: "view" });
      expect(state.phase).toBe("failed");
      expect(state.error).toContain("does not know the token");
      expect(frames).toHaveLength(0);
    } finally {
      for (const socket of fake.clients) socket.terminate();
      await new Promise((resolve) => fake.close(resolve));
    }
  });

  it("a new token stops the old one but keeps the connected viewer; turning sharing off ends everything", async () => {
    const { token, url } = await startHost();
    const client = makeClient();
    await client.connect({ address: url, token, mode: "view" });
    const fresh = host.regenerateToken();
    expect(fresh.token).not.toBe(token);
    expect(client.getState().phase).toBe("connected");
    const other = makeClient("client-eeee-0005", "Other");
    expect((await other.connect({ address: url, token, mode: "view" })).error).toBe("The token is wrong.");
    host.stop();
    expect(await other.connect({ address: url, token: fresh.token, mode: "view" })).toMatchObject({
      phase: "connected",
    });
    const off = await host.disable();
    expect(off).toMatchObject({ enabled: false, listening: null, sessions: [] });
    await until(() => other.getState().phase === "idle", "viewer told");
    expect(other.getState().error).toBe("The owner of that computer turned sharing off.");
    expect((await other.connect({ address: url, token: fresh.token, mode: "view" })).phase).toBe("failed");
    expect(() => host.regenerateToken()).toThrow("Turn sharing on first");
  });

  it("works without a driver: the picture flows and input does nothing", async () => {
    driver = null;
    const { token, url } = await startHost();
    const client = makeClient();
    await client.connect({ address: url, token, mode: "control" });
    await until(() => frames.length > 1, "pictures");
    client.sendInput({ type: "click", x: 0.1, y: 0.1, button: "left", count: 1 });
    await wait(60);
    expect(client.getState().phase).toBe("connected");
  });

  it("the viewer notices a host that goes silent", async () => {
    const fake = new WebSocketServer({ port: 0, host: "127.0.0.1", path: "/remote-desktop" });
    await new Promise((resolve) => fake.once("listening", resolve));
    const port = portOf(fake);
    fake.on("connection", (socket) => {
      const nonce = newNonce();
      socket.send(JSON.stringify({ type: "hello", version: 1, nonce }));
      socket.on("message", (data) => {
        const auth = JSON.parse(data.toString());
        socket.send(
          JSON.stringify({
            type: "accepted",
            sessionId: "s",
            mode: auth.mode,
            hostProof: hostProof("token-1234", nonce, auth.clientId, auth.mode),
          }),
        );
      });
    });
    try {
      const client = makeClient("client-ffff-0006", "Viewer", { silenceTimeoutMs: 150 });
      await client.connect({ address: `127.0.0.1:${port}`, token: "token-1234", mode: "view" });
      expect(client.getState().phase).toBe("connected");
      await until(() => client.getState().phase === "idle", "silence noticed");
      expect(client.getState().error).toBe("The connection was lost.");
    } finally {
      for (const socket of fake.clients) socket.terminate();
      await new Promise((resolve) => fake.close(resolve));
    }
  });

  it("explains bad addresses and empty tokens without connecting", async () => {
    const client = makeClient();
    expect((await client.connect({ address: "", token: "t", mode: "view" })).error).toContain("Enter the address");
    expect((await client.connect({ address: "localhost", token: "t", mode: "view" })).error).toContain("Add the port");
    expect((await client.connect({ address: "localhost:1", token: " ", mode: "view" })).error).toContain("token");
    expect(normalizeHostAddress("127.0.0.1:1")).toContain("/remote-desktop");
    const unreachable = await client.connect({ address: "127.0.0.1:1", token: "t", mode: "view" });
    expect(unreachable).toMatchObject({ phase: "failed" });
    expect(unreachable.error).toContain("Cannot reach");
  });

  it("emits every host change so the windows follow", async () => {
    const { token, url } = await startHost();
    const client = makeClient();
    await client.connect({ address: url, token, mode: "view" });
    host.stop();
    const kinds = hostStates.map((state) => `${state.enabled}:${state.sessions.length}`);
    expect(kinds).toContain("true:1");
    expect(kinds.at(-1)).toBe("true:0");
  });
});
