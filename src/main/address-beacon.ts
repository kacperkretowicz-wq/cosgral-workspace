// COSGRAL: lets people who joined a shared server find it again after the host got a new random address.
// The host drops a signed "new address" note into a free public mailbox (an ntfy topic, no account needed) every time
// it comes online and every half hour after that. Only people who know the server (its id and key fingerprint, both in the
// invitation) can work out the name of that mailbox. Nobody has to trust the mailbox: the note carries the host's
// signature, and the person's program also checks the host's identity at the new address before it switches to it.

import { createHash } from "node:crypto";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";

export const DEFAULT_ADDRESS_RELAY = "https://ntfy.sh";
const UPDATE_PREFIX = "cosgral://update?";
const MAX_NOTES = 8;
const REQUEST_TIMEOUT_MS = 10_000;

/** The relay address from the settings, or null when it is switched off. */
export function resolveAddressRelay(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_ADDRESS_RELAY;
  if (["off", "none", "0", "false"].includes(trimmed.toLowerCase())) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.username || url.password) return DEFAULT_ADDRESS_RELAY;
    return url.origin;
  } catch {
    return DEFAULT_ADDRESS_RELAY;
  }
}

/** The name of the mailbox of one server. It cannot be guessed without the server id and the key fingerprint. */
export function addressTopic(serverId: string, fingerprint: string): string {
  const digest = createHash("sha256")
    .update(`cosgral-address:${serverId.toLowerCase()}:${fingerprint}`)
    .digest("base64url");
  return `cosgral-${digest.slice(0, 40)}`.replace(/[^A-Za-z0-9_-]/gu, "x");
}

export interface AddressBeaconOptions {
  relayUrl: string;
  fetchFile?: typeof fetch;
}

export class AddressBeacon {
  readonly #relay: string;
  readonly #fetch: typeof fetch;

  constructor(options: AddressBeaconOptions) {
    this.#relay = options.relayUrl.replace(/\/+$/u, "");
    this.#fetch = options.fetchFile ?? fetch;
  }

  /** Leaves a signed address update link (`cosgral://update?...`) in the mailbox of the server. */
  async publish(serverId: string, fingerprint: string, updateUrl: string): Promise<void> {
    if (!updateUrl.startsWith(UPDATE_PREFIX)) throw new Error("Only an address update link can be published.");
    const response = await this.#fetch(`${this.#relay}/${addressTopic(serverId, fingerprint)}`, {
      method: "POST",
      headers: { "content-type": "text/plain; charset=utf-8", "user-agent": "COSGRAL-Workspace" },
      body: updateUrl,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`The address mailbox answered ${response.status}.`);
  }

  /** The newest address update links left in the mailbox of the server, newest first. Never throws. */
  async lookup(serverId: string, fingerprint: string): Promise<string[]> {
    try {
      const response = await this.#fetch(
        `${this.#relay}/${addressTopic(serverId, fingerprint)}/json?poll=1&since=all`,
        {
          headers: { "user-agent": "COSGRAL-Workspace" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
      if (!response.ok) return [];
      return parseMailbox(await response.text());
    } catch {
      return [];
    }
  }
}

/** Reads the lines of an ntfy answer (one JSON object per line) and keeps the update links, newest first. */
export function parseMailbox(text: string): string[] {
  const notes: Array<{ time: number; message: string }> = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isDynamicRecord(event) || event.event !== "message" || !isString(event.message)) continue;
    const message = event.message.trim();
    if (!message.startsWith(UPDATE_PREFIX) || message.length > 4096) continue;
    notes.push({ time: isNumber(event.time) ? event.time : 0, message });
  }
  return [...new Set(notes.sort((a, b) => b.time - a.time).map((note) => note.message))].slice(0, MAX_NOTES);
}
