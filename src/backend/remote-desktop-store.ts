// COSGRAL W3: what the remote desktop host keeps between runs, in one small JSON file of this computer: the token
// (encrypted by the operating system, never readable in the file), the viewers it has seen with their policy, and a
// few settings. Sharing itself is never kept: after a restart the host is off until its owner turns it on.

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  REMOTE_DESKTOP_EXPOSURES,
  REMOTE_DESKTOP_LIMITS,
  REMOTE_DESKTOP_PEER_POLICIES,
  type RemoteDesktopExposure,
  type RemoteDesktopPeer,
  type RemoteDesktopPeerPolicy,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isOneOf, isString } from "@openbot/contracts/runtime-values";
import { newToken } from "./remote-desktop-protocol";

const FILE_VERSION = 1;

/** The part of Electron safeStorage the store needs; the same shape as the Vault and MCP use. */
export interface RemoteDesktopSecretBox {
  canEncrypt(): boolean;
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
}

export interface RemoteDesktopSettings {
  tokenCipher: string | null;
  tokenCreatedAt: string | null;
  exposure: RemoteDesktopExposure;
  /** The last port that worked; 0 lets the system choose. */
  port: number;
  approvalBotId: string | null;
  peers: RemoteDesktopPeer[];
}

export interface RemoteDesktopStoreOptions {
  filePath: string;
  secretBox: RemoteDesktopSecretBox;
  now?: () => Date;
}

export class RemoteDesktopStore {
  readonly #filePath: string;
  readonly #box: RemoteDesktopSecretBox;
  readonly #now: () => Date;
  #settings: RemoteDesktopSettings;

  constructor(options: RemoteDesktopStoreOptions) {
    this.#filePath = options.filePath;
    this.#box = options.secretBox;
    this.#now = options.now ?? (() => new Date());
    this.#settings = readSettings(this.#filePath);
  }

  /** False when the system cannot encrypt: then no token is made and the host does not start. */
  canEncrypt(): boolean {
    return this.#box.canEncrypt();
  }

  settings(): RemoteDesktopSettings {
    return structuredClone(this.#settings);
  }

  /** Makes a new token, keeps it encrypted and returns it; the old one stops working. */
  createToken(): string {
    if (!this.#box.canEncrypt()) throw new Error("This computer cannot encrypt secrets, so remote desktop stays off.");
    const token = newToken();
    this.#save({ ...this.#settings, tokenCipher: this.#box.encrypt(token), tokenCreatedAt: this.#now().toISOString() });
    return token;
  }

  /** The current token, or null when there is none or it cannot be decrypted. */
  token(): string | null {
    const cipher = this.#settings.tokenCipher;
    if (!cipher) return null;
    try {
      return this.#box.decrypt(cipher);
    } catch {
      return null;
    }
  }

  setNetwork(exposure: RemoteDesktopExposure, port: number): void {
    this.#save({ ...this.#settings, exposure, port });
  }

  setApprovalBotId(botId: string | null): void {
    this.#save({ ...this.#settings, approvalBotId: botId });
  }

  peer(peerId: string): RemoteDesktopPeer | null {
    return this.#settings.peers.find((peer) => peer.id === peerId) ?? null;
  }

  /** Adds a viewer with policy "ask", or refreshes its name and last seen time. */
  touchPeer(peerId: string, label: string): RemoteDesktopPeer {
    const at = this.#now().toISOString();
    const existing = this.peer(peerId);
    if (!existing && this.#settings.peers.length >= REMOTE_DESKTOP_LIMITS.maxPeers) {
      // The oldest "ask" viewer makes room; remembered ("allow") and blocked ones stay.
      const oldest = this.#settings.peers.filter((peer) => peer.policy === "ask").sort(byLastSeen)[0];
      if (!oldest) throw new Error(`The list holds at most ${REMOTE_DESKTOP_LIMITS.maxPeers} computers. Remove one.`);
      this.#save({ ...this.#settings, peers: this.#settings.peers.filter((peer) => peer.id !== oldest.id) });
    }
    const peer: RemoteDesktopPeer = existing
      ? { ...existing, label, lastSeenAt: at }
      : { id: peerId, label, policy: "ask", addedAt: at, lastSeenAt: at };
    const peers = existing
      ? this.#settings.peers.map((candidate) => (candidate.id === peerId ? peer : candidate))
      : [...this.#settings.peers, peer];
    this.#save({ ...this.#settings, peers });
    return peer;
  }

  setPeerPolicy(peerId: string, policy: RemoteDesktopPeerPolicy): void {
    if (!isOneOf(REMOTE_DESKTOP_PEER_POLICIES, policy)) throw new Error("Unknown policy.");
    if (!this.peer(peerId)) throw new Error("This computer is not on the list.");
    this.#save({
      ...this.#settings,
      peers: this.#settings.peers.map((peer) => (peer.id === peerId ? { ...peer, policy } : peer)),
    });
  }

  removePeer(peerId: string): boolean {
    const peers = this.#settings.peers.filter((peer) => peer.id !== peerId);
    if (peers.length === this.#settings.peers.length) return false;
    this.#save({ ...this.#settings, peers });
    return true;
  }

  #save(next: RemoteDesktopSettings): void {
    this.#settings = next;
    mkdirSync(dirname(this.#filePath), { recursive: true });
    const temporary = `${this.#filePath}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ version: FILE_VERSION, ...next }, null, 2)}\n`, "utf8");
    try {
      chmodSync(temporary, 0o600);
    } catch {
      // Windows ignores most mode bits; the token is encrypted anyway.
    }
    renameSync(temporary, this.#filePath);
  }
}

function byLastSeen(left: RemoteDesktopPeer, right: RemoteDesktopPeer): number {
  return (left.lastSeenAt ?? left.addedAt).localeCompare(right.lastSeenAt ?? right.addedAt);
}

export function defaultRemoteDesktopSettings(): RemoteDesktopSettings {
  return { tokenCipher: null, tokenCreatedAt: null, exposure: "loopback", port: 0, approvalBotId: null, peers: [] };
}

function readSettings(filePath: string): RemoteDesktopSettings {
  const defaults = defaultRemoteDesktopSettings();
  if (!existsSync(filePath)) return defaults;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return defaults;
  }
  if (!isDynamicRecord(raw)) return defaults;
  const seen = new Set<string>();
  const peers = Array.isArray(raw.peers)
    ? raw.peers.filter(isPeer).filter((peer) => !seen.has(peer.id) && seen.add(peer.id))
    : [];
  return {
    tokenCipher: isString(raw.tokenCipher) ? raw.tokenCipher : null,
    tokenCreatedAt: isString(raw.tokenCipher) && isString(raw.tokenCreatedAt) ? raw.tokenCreatedAt : null,
    exposure: isOneOf(REMOTE_DESKTOP_EXPOSURES, raw.exposure) ? raw.exposure : defaults.exposure,
    port: isNumber(raw.port) && Number.isInteger(raw.port) && raw.port >= 0 && raw.port <= 65_535 ? raw.port : 0,
    approvalBotId: isString(raw.approvalBotId) ? raw.approvalBotId : null,
    peers: peers.slice(0, REMOTE_DESKTOP_LIMITS.maxPeers).map((peer) => ({ ...peer })),
  };
}

function isPeer(value: unknown): value is RemoteDesktopPeer {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.label) &&
    isOneOf(REMOTE_DESKTOP_PEER_POLICIES, value.policy) &&
    isString(value.addedAt) &&
    (value.lastSeenAt === null || isString(value.lastSeenAt))
  );
}
