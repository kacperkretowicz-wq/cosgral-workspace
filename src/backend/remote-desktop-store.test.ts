// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REMOTE_DESKTOP_LIMITS } from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type RemoteDesktopSecretBox, RemoteDesktopStore } from "./remote-desktop-store";

const box = (canEncrypt = true): RemoteDesktopSecretBox => ({
  canEncrypt: () => canEncrypt,
  encrypt: (plain) => `box:${Buffer.from(plain).toString("base64")}`,
  decrypt: (cipher) => {
    if (!cipher.startsWith("box:")) throw new Error("bad cipher");
    return Buffer.from(cipher.slice(4), "base64").toString();
  },
});

describe("RemoteDesktopStore", () => {
  let dir: string;
  let file: string;
  let tick = 0;
  const open = (secretBox = box()) =>
    new RemoteDesktopStore({
      filePath: file,
      secretBox,
      now: () => new Date(Date.UTC(2026, 10, 13, 12, 0, tick++)),
    });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "remote-desktop-store-"));
    file = join(dir, "remote-desktop.json");
    tick = 0;
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("starts with no token, loopback only and no viewers", () => {
    const store = open();
    expect(store.token()).toBeNull();
    expect(store.settings()).toEqual({
      tokenCipher: null,
      tokenCreatedAt: null,
      exposure: "loopback",
      port: 0,
      approvalBotId: null,
      peers: [],
    });
  });

  it("makes a token, keeps it only encrypted, and a new token replaces the old one", () => {
    const store = open();
    const first = store.createToken();
    expect(store.token()).toBe(first);
    expect(readFileSync(file, "utf8")).not.toContain(first);
    const second = store.createToken();
    expect(second).not.toBe(first);
    expect(open().token()).toBe(second);
    expect(open().settings().tokenCreatedAt).toBe("2026-11-13T12:00:01.000Z");
  });

  it("refuses to make a token when the system cannot encrypt", () => {
    expect(() => open(box(false)).createToken()).toThrow("cannot encrypt secrets");
  });

  it("treats a token that cannot be decrypted as no token", () => {
    open().createToken();
    const broken = new RemoteDesktopStore({
      filePath: file,
      secretBox: {
        ...box(),
        decrypt: () => {
          throw new Error("other user");
        },
      },
    });
    expect(broken.token()).toBeNull();
  });

  it("adds viewers with policy ask, refreshes them, and changes their policy", () => {
    const store = open();
    const peer = store.touchPeer("client-0001", "Laptop");
    expect(peer).toMatchObject({ id: "client-0001", label: "Laptop", policy: "ask", lastSeenAt: peer.addedAt });
    store.setPeerPolicy("client-0001", "allow");
    const again = store.touchPeer("client-0001", "Laptop (new name)");
    expect(again).toMatchObject({ policy: "allow", label: "Laptop (new name)" });
    expect(store.settings().peers).toHaveLength(1);
    expect(() => store.setPeerPolicy("nobody-0001", "block")).toThrow("not on the list");
    expect(store.removePeer("client-0001")).toBe(true);
    expect(store.removePeer("client-0001")).toBe(false);
  });

  it("makes room by dropping the oldest ask viewer, never a remembered or blocked one", () => {
    const store = open();
    store.touchPeer("keep-allow-1", "A");
    store.setPeerPolicy("keep-allow-1", "allow");
    store.touchPeer("keep-block-1", "B");
    store.setPeerPolicy("keep-block-1", "block");
    for (let index = 0; index < REMOTE_DESKTOP_LIMITS.maxPeers - 2; index += 1)
      store.touchPeer(`peer-${index + 1000}`, "P");
    expect(store.settings().peers).toHaveLength(REMOTE_DESKTOP_LIMITS.maxPeers);
    store.touchPeer("newcomer-01", "N");
    const ids = store.settings().peers.map((peer) => peer.id);
    expect(ids).toHaveLength(REMOTE_DESKTOP_LIMITS.maxPeers);
    expect(ids).toContain("keep-allow-1");
    expect(ids).toContain("keep-block-1");
    expect(ids).toContain("newcomer-01");
    expect(ids).not.toContain("peer-1000");
  });

  it("refuses a new viewer when the list is full of remembered ones", () => {
    const store = open();
    for (let index = 0; index < REMOTE_DESKTOP_LIMITS.maxPeers; index += 1) {
      store.touchPeer(`peer-${index + 1000}`, "P");
      store.setPeerPolicy(`peer-${index + 1000}`, "allow");
    }
    expect(() => store.touchPeer("newcomer-01", "N")).toThrow("Remove one");
  });

  it("keeps network settings, approval agent and viewers after a restart", () => {
    const store = open();
    store.setNetwork("lan", 47_123);
    store.setApprovalBotId("bot-1");
    store.touchPeer("client-0001", "Laptop");
    const settings = open().settings();
    expect(settings).toMatchObject({ exposure: "lan", port: 47_123, approvalBotId: "bot-1" });
    expect(settings.peers.map((peer) => peer.id)).toEqual(["client-0001"]);
  });

  it("starts from defaults for a broken file and keeps the valid parts", () => {
    writeFileSync(file, "{nope");
    expect(open().settings().peers).toEqual([]);
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        exposure: "internet",
        port: 99_999,
        peers: [
          { id: "a-valid-id", label: "L", policy: "allow", addedAt: "x", lastSeenAt: null },
          { id: "a-valid-id", label: "dup", policy: "ask", addedAt: "x", lastSeenAt: null },
          { id: 5 },
        ],
      }),
    );
    const settings = open().settings();
    expect(settings.exposure).toBe("loopback");
    expect(settings.port).toBe(0);
    expect(settings.peers.map((peer) => peer.label)).toEqual(["L"]);
  });
});
