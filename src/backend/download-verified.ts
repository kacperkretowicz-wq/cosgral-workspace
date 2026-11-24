// COSGRAL: verified downloads (used by the managed agent CLIs). Every address and every redirect must pass the
// feature's own allowed-address check; the file is written as `.part`, hashed while it streams, and becomes the real
// file only when its size and SHA-256 match the pinned values. Anything else leaves nothing behind.

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { get } from "node:https";
import { dirname } from "node:path";

export interface DownloadResponse {
  /** Content-Length, when the server sent one. */
  totalBytes: number | null;
  body: AsyncIterable<Uint8Array>;
}

export interface DownloadSource {
  open: (url: string, signal: AbortSignal) => Promise<DownloadResponse>;
}

/** Node's HTTPS client with redirects checked one by one. */
export class HttpsDownloadSource implements DownloadSource {
  readonly #maxRedirects: number;
  readonly #idleTimeoutMs: number;

  readonly #checkUrl: (value: string) => URL;

  /** `checkUrl` is the feature's own list of official hosts (managed CLIs: `checkCliDownloadUrl`). */
  constructor(options: { maxRedirects?: number; idleTimeoutMs?: number; checkUrl: (value: string) => URL }) {
    this.#maxRedirects = options.maxRedirects ?? 5;
    this.#idleTimeoutMs = options.idleTimeoutMs ?? 60_000;
    this.#checkUrl = options.checkUrl;
  }

  async open(address: string, signal: AbortSignal): Promise<DownloadResponse> {
    let current = this.#checkUrl(address);
    for (let hop = 0; hop <= this.#maxRedirects; hop += 1) {
      const response = await new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
        const request = get(
          current,
          { headers: { "user-agent": "COSGRAL-Workspace", accept: "*/*" }, signal },
          resolve,
        );
        request.setTimeout(this.#idleTimeoutMs, () => request.destroy(new Error("The download stopped responding.")));
        request.once("error", reject);
      });
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        current = this.#checkUrl(new URL(response.headers.location, current).toString());
        continue;
      }
      if (status !== 200) {
        response.resume();
        throw new Error(`The download failed (HTTP ${status}).`);
      }
      response.setTimeout(this.#idleTimeoutMs, () => response.destroy(new Error("The download stopped responding.")));
      const length = Number(response.headers["content-length"]);
      return { totalBytes: Number.isFinite(length) && length >= 0 ? length : null, body: response };
    }
    throw new Error("The download was redirected too many times.");
  }
}

export interface VerifiedDownloadInput {
  source: DownloadSource;
  url: string;
  sha256: string;
  sizeBytes: number;
  /** The final file; `<destination>.part` while it downloads. */
  destination: string;
  signal: AbortSignal;
  onProgress?: (receivedBytes: number) => void;
  /** The allowed-address check of the feature; throws for an address that is not allowed. */
  checkUrl: (value: string) => URL;
}

export async function downloadVerified(input: VerifiedDownloadInput): Promise<void> {
  input.checkUrl(input.url);
  const partial = `${input.destination}.part`;
  await mkdir(dirname(input.destination), { recursive: true });
  const output = createWriteStream(partial);
  const closed = new Promise<void>((resolve, reject) => {
    output.once("close", resolve);
    output.once("error", reject);
  });
  try {
    const response = await input.source.open(input.url, input.signal);
    if (response.totalBytes !== null && response.totalBytes !== input.sizeBytes) {
      throw new Error("The download has an unexpected size; nothing was saved.");
    }
    const hash = createHash("sha256");
    let received = 0;
    for await (const chunk of response.body) {
      if (input.signal.aborted) throw new Error("The download was cancelled.");
      received += chunk.byteLength;
      if (received > input.sizeBytes) throw new Error("The download is larger than expected; nothing was saved.");
      hash.update(chunk);
      if (!output.write(chunk)) await new Promise<void>((resolve) => output.once("drain", () => resolve()));
      input.onProgress?.(received);
    }
    if (input.signal.aborted) throw new Error("The download was cancelled.");
    if (received !== input.sizeBytes) throw new Error("The download is smaller than expected; nothing was saved.");
    if (hash.digest("hex") !== input.sha256) {
      throw new Error("The download failed the SHA-256 check; nothing was saved.");
    }
    output.end();
    await closed;
    await rename(partial, input.destination);
  } catch (error) {
    output.destroy();
    await closed.catch(() => undefined);
    await rm(partial, { force: true });
    throw error;
  }
}
